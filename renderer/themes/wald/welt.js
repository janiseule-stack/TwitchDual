// Wald (gezeichnet): Gluehwuermchen schwirren und pulsieren, der Stil kommt
// aus stile.js (Variante). Maus lockt sie an (sie kreisen um den Zeiger),
// Klick ins Leere = Aufblitzen + Auseinanderstieben + Funkenkranz.
// Kiste = Schwarm stroemt aus dem Punkte-Chip + leuchtender Wirbel, Punkte =
// ein paar steigen auf, Abo = Lichtkranz um das Namenskaertchen, Raid =
// grosser Schwarm zieht als Band durchs Bild. Gast = Schwarm schwebt einmal
// uebers Video.
// Gezeichnet wird hoechstens alle 33 ms (30 Bilder/s); der Hintergrund
// entsteht nur bei Groessenwechsel neu. Alle Lebensdauern laufen ueber die
// eigene Uhr (Summe der Bildzeiten), nicht ueber Date.now.
(function () {
  window.TwitchDualWelten = window.TwitchDualWelten || {};
  window.TwitchDualWelten.wald = function ({ engine, FxEngine, farben, variante }) {
    const { rnd } = FxEngine;
    const WS = window.WaldStile;
    const W = WS.werkzeug;
    const TAU = W.TAU;
    const S = WS.stile[variante] || WS.stile.aquarell;
    const FARBE = (farben && farben.partikel) || '#e8ff7a';
    const BILD_MS = 33;
    const BG_RUHE_MS = 200;
    const MAUS_RADIUS = 140;
    const MAUS_ALT_MS = 3000;    // stillstehende Maus lockt nicht ewig
    const KLICK_RADIUS = 170;
    const RAST_MS = 2000;        // so lange steht das Raid-Kaertchen am Rand
    const TEMPO = S.tempo || 1;

    let L = null;
    let V = null;                // Vordergrund (Chat: ueber den Leisten) fuer Ereignisse
    let vornBelegt = false;
    let bg = null;
    let bgFaellig = 0;
    const Z = {};                // Stil-eigene Daten (Pilze, Huette, Blaetter ...)
    let fliegen = [];            // schwirren dauerhaft
    let funken = [];             // Ereignis-Fliegen mit Lebensdauer (vorn)
    let schwarm = [];            // Raid-Band
    let schwarmText = null;
    let kraenze = [];            // Abo
    let wirbel = null;           // { x, y, bis, r }
    let maus = null;
    let uhr = 0;                 // ms, eigene Zeit
    let acc = 0;

    // Gezeichnet wird in den Proportionen der Vorschau (Hoehe 470) und dann
    // aufs echte Fenster hochskaliert - sonst werden in einem grossen Chat
    // die Staemme zur Bretterwand und Blaetter/Gluehwuermchen zu Punkten.
    const ENTWURF_H = 470;
    function massstab() { return L && L.h ? Math.max(0.5, L.h / ENTWURF_H) : 1; }
    function skala() { return Math.max(0.8, Math.min(3, massstab() * 0.8)); }
    function zielAnzahl() {
      const m = massstab();
      const n = 22 * Math.pow(W.dichte(L.w / m, L.h / m), 0.8) * (S.anzahl || 1) * engine.faktor;
      return Math.max(6, Math.min(60, Math.round(n)));
    }
    function neueFliege(x, y) {
      return {
        x: x !== undefined ? x : rnd(0, L.w), y: y !== undefined ? y : rnd(L.h * 0.15, L.h * 0.8),
        vx: rnd(-0.4, 0.4), vy: rnd(-0.4, 0.4), ph: rnd(0, TAU), sp: rnd(0.6, 1.5), blitz: 0
      };
    }
    function helligkeit(f) {
      // Pulsiert, geht aber nie ganz aus (sonst sieht man nur die Haelfte).
      const a = 0.5 + 0.5 * Math.sin(uhr * 0.0022 * f.sp + f.ph);
      return Math.max(0.25 + 0.75 * a * a, f.blitz);
    }

    function baueHintergrund() {
      const d = L.dpr || 1;
      W.saat(7);
      const m = massstab();
      if (S.pixel) {
        const c = W.leinwand(L.w / m / S.pixel, L.h / m / S.pixel);
        S.hintergrund(c.getContext('2d'), c.width, c.height, W, Z);
        bg = c;
        return;
      }
      const c = W.leinwand(L.w * d, L.h * d);
      const g = c.getContext('2d');
      g.setTransform(d * m, 0, 0, d * m, 0, 0);
      S.hintergrund(g, L.w / m, L.h / m, W, Z);
      if (S.koernung) { g.setTransform(1, 0, 0, 1, 0, 0); W.koernung(g, c.width, c.height, S.koernung); }
      bg = c;
    }

    // --- Bewegung -----------------------------------------------------------
    function wirbelKraft(p, k) {
      if (!wirbel) return;
      const dx = p.x - wirbel.x, dy = p.y - wirbel.y, d = Math.hypot(dx, dy) || 1;
      if (d > wirbel.r) return;
      const s = (1 - d / wirbel.r) * 0.35 * k;
      p.vx += (-dy / d) * s - dx / d * s * 0.25;
      p.vy += (dx / d) * s - dy / d * s * 0.25;
    }
    function bewege(f, k) {
      const sk = skala();
      f.vx += rnd(-0.06, 0.06) * k * TEMPO; f.vy += (rnd(-0.06, 0.06) * TEMPO + (S.auftrieb || 0)) * k;
      if (maus && uhr - maus.zeit < MAUS_ALT_MS) {
        const dx = maus.x - f.x, dy = maus.y - f.y, d = Math.hypot(dx, dy);
        if (d < MAUS_RADIUS * sk && d > 1) {
          f.vx += (dx / d * 0.05 - dy / d * 0.045) * k;
          f.vy += (dy / d * 0.05 + dx / d * 0.045) * k;
        }
      }
      wirbelKraft(f, k);
      if (!S.auftrieb) {
        if (f.y < L.h * 0.08) f.vy += 0.05 * k;
        if (f.y > L.h * 0.84) f.vy -= 0.05 * k;
      }
      f.vx *= Math.pow(0.97, k); f.vy *= Math.pow(0.97, k);
      const s = Math.hypot(f.vx, f.vy), max = (f.blitz > 0 ? 6 : 2 * TEMPO) * sk;
      if (s > max) { f.vx *= max / s; f.vy *= max / s; }
      f.x += f.vx * k; f.y += f.vy * k;
      if (f.x < -12) f.x = L.w + 12;
      if (f.x > L.w + 12) f.x = -12;
      if (S.neuStart) S.neuStart(f, L.w, L.h);
      else if (f.y < -30 || f.y > L.h + 30) f.y = rnd(L.h * 0.2, L.h * 0.8);
      if (f.blitz > 0) f.blitz = Math.max(0, f.blitz - 0.02 * k);
    }
    function bewegeFunke(p, k) {
      wirbelKraft(p, k);
      p.vx *= Math.pow(0.965, k); p.vy *= Math.pow(0.965, k);
      p.vy -= 0.01 * k;            // Gluehwuermchen steigen leicht
      p.x += p.vx * k; p.y += p.vy * k;
    }

    // --- Zeichnen -----------------------------------------------------------
    // Eine Fliege, mitskaliert. Pixel rastet auf das (skalierte) Pixelraster.
    function zeichneFliege(g, x, y, a, gross) {
      const s = gross || skala();
      if (S.pixel) { const P = S.pixel * s; x = Math.round(x / P) * P; y = Math.round(y / P) * P; }
      g.save(); g.translate(x, y); g.scale(s, s);
      S.fliege(g, 0, 0, a, FARBE, W);
      g.restore();
    }
    // Hintergrund noch von der alten Groesse (Neubau erst nach BG_RUHE_MS):
    // gleichmaessig skalieren + beschneiden statt verzerrt strecken.
    function zeichneBg(g) {
      const a = FxEngine.deckend(bg.width, bg.height, L.w, L.h);
      g.drawImage(bg, a.sx, a.sy, a.sw, a.sh, 0, 0, L.w, L.h);
    }

    function bild(k) {
      const g = L.ctx;
      if (S.pixel) {
        const vorher = g.imageSmoothingEnabled;
        g.imageSmoothingEnabled = false;
        zeichneBg(g);
        g.imageSmoothingEnabled = vorher;
      } else {
        zeichneBg(g);
      }
      const m = massstab(), vw = L.w / m, vh = L.h / m;
      const mv = maus && uhr - maus.zeit < MAUS_ALT_MS ? { x: maus.x / m, y: maus.y / m } : null;
      if (S.unter) { g.save(); g.scale(m, m); S.unter(g, uhr, vw, vh, W, Z, k, mv); g.restore(); }
      for (const f of fliegen) zeichneFliege(g, f.x, f.y, helligkeit(f));
      for (const f of schwarm) zeichneFliege(g, f.x, f.y, helligkeit(f));
      if (S.ueber) { g.save(); g.scale(m, m); S.ueber(g, uhr, vw, vh, W, Z); g.restore(); }

      // Ereignisse: im Chat auf die Vordergrund-Leinwand (sonst verdecken die
      // Leisten den Punkte-Chip). Geloescht wird sie nur, wenn etwas lief.
      const ev = V ? V.ctx : g;
      if (V) {
        V.passe();
        if (vornBelegt) ev.clearRect(0, 0, V.w, V.h);
      }
      vornBelegt = false;
      for (const p of funken) {
        const rest = 1 - (uhr - p.start) / p.dauer;
        zeichneFliege(ev, p.x, p.y, Math.max(0, Math.min(1, rest * 2.5)) * (0.7 + 0.3 * Math.sin(uhr * 0.01 + p.ph)));
        vornBelegt = true;
      }
      for (let i = kraenze.length - 1; i >= 0; i--) {
        if (zeichneKranz(ev, kraenze[i])) vornBelegt = true; else kraenze.splice(i, 1);
      }
      if (schwarmText && zeichneSchwarmText(ev)) vornBelegt = true;
    }

    function zeichneKranz(g, kr) {
      const t = (uhr - kr.start) / kr.dauer;
      if (t >= 1) return false;
      const sk = skala();
      const auf = Math.min(1, t * 4), ab = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
      const r = (40 + 50 * auf) * sk;
      for (let i = 0; i < kr.n; i++) {
        const w = kr.dreh + i / kr.n * TAU + uhr * 0.0012;
        const wackel = Math.sin(uhr * 0.004 + i) * 5 * sk;
        zeichneFliege(g, kr.x + Math.cos(w) * (r + wackel), kr.y + Math.sin(w) * (r + wackel) * 0.75, ab * (0.75 + 0.25 * Math.sin(uhr * 0.008 + i)));
      }
      g.save(); g.globalAlpha = Math.min(auf, ab);
      W.namensKarte(g, S, kr.x, kr.y - 18, kr.text);
      g.restore();
      return true;
    }

    // Raid: Kaertchen gleitet ueber dem Schwarm mit, haelt rechts an, blendet aus.
    function zeichneSchwarmText(g) {
      const st = schwarmText, rand = 90, rechts = L.w - rand;
      if (!st.fest && schwarm.length) {
        let vorn = -Infinity, my = 0;
        for (const p of schwarm) { if (p.x > vorn) vorn = p.x; my += p.y; }
        my /= schwarm.length;
        const zielX = Math.min(Math.max(vorn - 60, rand), rechts);
        st.x += (zielX - st.x) * 0.08;
        st.y += (Math.max(8, my - 70 * skala()) - st.y) * 0.05;
        if (st.x >= rechts - 2) { st.x = rechts; st.fest = true; }
      } else if (!st.fest) {
        st.x += (rechts - st.x) * 0.1;
        if (st.x >= rechts - 2) { st.x = rechts; st.fest = true; }
      }
      if (!schwarm.length && !st.rastBis) st.rastBis = uhr + RAST_MS;
      const ein = Math.min(1, (uhr - st.start) / 500);
      const aus = st.rastBis ? Math.max(0, 1 - (uhr - st.rastBis) / 500) : 1;
      if (aus <= 0) { schwarmText = null; return false; }
      g.save(); g.globalAlpha = ein * aus;
      W.namensKarte(g, S, st.x, st.y, st.zeilen);
      g.restore();
      return true;
    }

    function frame(dt) {
      acc += dt;
      if (acc < BILD_MS) return;
      const k = acc / 16;
      uhr += acc;
      acc = 0;
      if (L.passe()) bgFaellig = uhr + BG_RUHE_MS;
      if (!L.w || !L.h) return;            // Ebene unsichtbar (Home zu)
      if (!bg || (bgFaellig && uhr >= bgFaellig)) {
        bgFaellig = 0;
        baueHintergrund();
      }
      // Erst verteilen, wenn die Ebene Groesse hat - sonst klumpt alles in der Ecke.
      const ziel = zielAnzahl();
      if (fliegen.length < ziel) {
        const dazu = fliegen.length === 0 ? ziel : 1;
        for (let i = 0; i < dazu; i++) fliegen.push(neueFliege());
      } else if (fliegen.length > ziel) {
        fliegen.splice(0, 1);
      }
      if (wirbel && uhr > wirbel.bis) wirbel = null;
      for (const f of fliegen) bewege(f, k);
      for (const p of funken) bewegeFunke(p, k);
      funken = funken.filter((p) => uhr - p.start < p.dauer);
      for (const p of schwarm) {
        p.vy += (Math.sin(uhr * 0.003 + p.ph) * 0.6 - p.vy) * 0.05 * k;
        p.x += p.vx * skala() * k; p.y += p.vy * k;
      }
      schwarm = schwarm.filter((p) => p.x < L.w + 40);
      bild(k);
    }

    // --- Ereignisse ---------------------------------------------------------
    function funke(x, y, vx, vy, dauer) {
      funken.push({ x, y, vx, vy, ph: rnd(0, TAU), start: uhr, dauer: dauer || rnd(1600, 2600) });
      if (funken.length > 200) funken.splice(0, funken.length - 200);
    }
    function setzeWirbel(x, y, ms, r) { wirbel = { x, y, bis: uhr + ms, r: (r || 160) * skala() }; }

    function starteSchwarm(anzahl) {
      const n = Math.max(40, Math.min(140, 40 + Math.round((anzahl || 0) / 3)));
      const mitte = rnd(0.3, 0.65) * L.h, band = L.h * 0.16;
      for (let i = 0; i < n; i++) {
        const f = neueFliege(-rnd(10, 420) * skala(), mitte + rnd(-band, band));
        f.vx = rnd(3.5, 6); f.vy = rnd(-0.5, 0.5); f.blitz = 0.6;
        schwarm.push(f);
      }
      return mitte - band;
    }

    // --- Gast: Schwarm schwebt einmal uebers Video ------------------------
    // Eigene Leinwand auf der Gast-Ebene, eigene Animation (die Welt ruht
    // waehrend des Streams). Jeder Gast = ein Schwarm von links oder rechts.
    let G = null;
    let gaeste = [];
    let gastLaeuft = false;
    function neuerGast() {
      const w = G.w, h = G.h;
      const sk = Math.max(1, Math.min(2.2, Math.min(w, h) / 420));
      const richtung = Math.random() < 0.5 ? 1 : -1;
      const mitte = rnd(0.25, 0.75) * h, band = h * rnd(0.12, 0.22);
      const n = 26 + Math.floor(Math.random() * 10);
      for (let i = 0; i < n; i++) {
        const start = -rnd(20, w * 0.45);
        gaeste.push({
          x: richtung > 0 ? start : w - start, y: mitte + rnd(-band, band),
          vx: richtung * rnd(2.2, 3.2) * sk, vy: rnd(-0.3, 0.3), ph: rnd(0, TAU), sp: rnd(0.8, 1.6),
          richtung, bogen: rnd(0.4, 1.1) * sk
        });
      }
    }
    function gastSchleife() {
      if (gastLaeuft) return;
      gastLaeuft = true;
      let a = 0, tg = 0;
      engine.animiere((dt) => {
        a += dt;
        if (a < BILD_MS) return true;
        const k = a / 16;
        tg += a;
        a = 0;
        G.passe();
        const g = G.ctx;
        g.clearRect(0, 0, G.w, G.h);
        for (const p of gaeste) {
          p.x += p.vx * k;
          p.y += (p.vy + Math.sin(tg * 0.0022 + p.ph) * p.bogen) * k;
        }
        gaeste = gaeste.filter((p) => (p.richtung > 0 ? p.x < G.w + 40 : p.x > -40));
        for (const p of gaeste) {
          const h = 0.5 + 0.5 * Math.sin(tg * 0.003 * p.sp + p.ph);
          zeichneFliege(g, p.x, p.y, 0.35 + 0.65 * h, Math.max(1, Math.min(3, G.h / ENTWURF_H * 0.8)));
        }
        if (!gaeste.length) { g.clearRect(0, 0, G.w, G.h); gastLaeuft = false; return false; }
        return true;
      });
    }

    return {
      start() {
        L = engine.leinwand('hinten');
        if (!L) return;
        // Im Video-Fenster gibt es keine vorn-Ebene -> Ereignisse auf die Welt.
        V = engine.leinwand('vorn');
        engine.schleife(frame);
      },
      stop() { fliegen = []; funken = []; schwarm = []; kraenze = []; gaeste = []; schwarmText = null; L = null; V = null; G = null; bg = null; },
      // Fuer Tests
      fliegenZahl() { return fliegen.length; },
      positionen() { return fliegen.map((f) => ({ x: f.x, y: f.y })); },
      ereignisZahl() { return funken.length + schwarm.length + kraenze.length + (schwarmText ? 1 : 0); },
      maus(x, y) { maus = { x, y, zeit: uhr }; },
      klickInsLeere(x, y) {
        if (!L || !L.w) return;
        const r = KLICK_RADIUS * skala();
        for (const f of fliegen) {
          const dx = f.x - x, dy = f.y - y, d = Math.hypot(dx, dy) || 1;
          if (d < r) { f.vx += dx / d * 5; f.vy += dy / d * 5; f.blitz = 1; }
        }
        for (let i = 0; i < 16; i++) {
          const w = i / 16 * TAU, v = rnd(1.5, 4.5);
          funke(x, y, Math.cos(w) * v, Math.sin(w) * v, rnd(900, 1500));
        }
        if (S.klick) { const m = massstab(); S.klick(Z, x / m, y / m, L.w / m, L.h / m); }
        maus = { x, y, zeit: uhr };
      },
      ereignis(art, daten) {
        if (!L || !L.w) return;
        const u = daten.ursprung || { x: L.w - 70, y: L.h - 12 };
        if (S.ereignis) S.ereignis(Z, art);
        if (art === 'raid') {
          const oben = starteSchwarm(daten.anzahl);
          const n = Number(daten.anzahl) || 0;
          schwarmText = { zeilen: [String(daten.name || 'Raid'), 'raidet mit ' + n.toLocaleString('de-DE') + (n === 1 ? ' Zuschauer' : ' Zuschauern')],
            x: 90, y: Math.max(8, oben - 70 * skala()), start: uhr, rastBis: 0, fest: false };
          return;
        }
        if (art === 'abo') {
          const x = daten.ursprung ? u.x : L.w / 2, y = daten.ursprung ? u.y : L.h * 0.4;
          // zeilen kommt aus chat-ereignisse.js (Name + was passiert ist).
          const text = Array.isArray(daten.zeilen) ? daten.zeilen.map(String).slice(0, 2) : [String(daten.name || '')];
          if (!daten.zeilen && daten.monate > 1) text.push(daten.monate + ' Monate');
          kraenze.push({ x, y, start: uhr, dauer: 4500, n: 18, dreh: rnd(0, TAU), text });
          for (let i = 0; i < 16; i++) {
            const w = i / 16 * TAU, v = rnd(2, 3.4);
            funke(x, y, Math.cos(w) * v, Math.sin(w) * v, rnd(1600, 2400));
          }
          return;
        }
        if (art === 'kiste') {
          for (let i = 0; i < 30; i++) {
            const w = -Math.PI / 2 + rnd(-1.1, 0.5);   // nach oben, eher nach links (Chip sitzt rechts)
            const v = rnd(3, 6.5);
            funke(u.x, u.y, Math.cos(w) * v, Math.sin(w) * v, rnd(2200, 3400));
          }
          setzeWirbel(u.x, u.y - 70 * skala(), 2600, 150);
        } else {
          for (let i = 0; i < 8; i++) funke(u.x, u.y, rnd(-1.6, 0.8), rnd(-3, -1.2), rnd(1200, 1800));
        }
      },
      gast() {
        if (!G) G = engine.leinwand('gast');
        if (!G) return;
        G.passe();
        if (!G.w || !G.h) return;          // Ebene (noch) unsichtbar
        neuerGast();
        gastSchleife();
      }
    };
  };
})();
