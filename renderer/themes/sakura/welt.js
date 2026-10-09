// Sakura (gezeichnet): Kirschblueten fallen von einem Zweig, der Stil kommt
// aus stile.js (Variante). Maus pustet die Blaetter weg und loest am Zweig
// neue, Klick ins Leere = Windboee mit Bluetenwirbel, Kiste = Fontaene aus dem
// Punkte-Chip + Wirbel, Punkte = kleiner Hauch, Raid = Bluetensturm
// (Hanafubuki) mit Kaertchen, Abo = grosse Bluete oeffnet sich mit Namen.
// Gast = Windstoss voller Blueten weht uebers Video.
// Gezeichnet wird hoechstens alle 33 ms (30 Bilder/s) - Rechenzeit fuer
// Spiele daneben; der Hintergrund entsteht nur bei Groessenwechsel neu.
(function () {
  window.TwitchDualWelten = window.TwitchDualWelten || {};
  window.TwitchDualWelten.sakura = function ({ engine, FxEngine, farben, variante, fenster, saat }) {
    const { rnd } = FxEngine;
    const SS = window.SakuraStile;
    const W = SS.werkzeug;
    const TAU = W.TAU;
    const S = SS.stile[variante] || SS.stile.aquarell;
    const PARTIKEL = (farben && farben.partikel) || '#f7a8c4';
    const BILD_MS = 33;
    const BG_RUHE_MS = 200;      // Hintergrund erst neu, wenn die Groesse ruht
    const MAUS_RADIUS = 70;
    const MAUS_ALT_MS = 1500;    // stillstehende Maus pustet nicht ewig
    const LOESE_MS = 120;        // so oft loest die Maus am Zweig ein Blatt
    const MAX_SCHWIMMER = 90;
    const RAST_MS = 2000;        // so lange steht das Raid-Kaertchen am Rand

    let L = null;
    let V = null;                // Vordergrund (Chat: ueber den Leisten) fuer Ereignisse
    let vornBelegt = false;
    let bg = null;
    let bgFaellig = 0;
    let A = { seg: [], blueten: [], sk: 1 };
    const Z = {};                // Stil-eigene Daten (Sterne, Wasserlinie ...)
    let blaetter = [];           // fallen dauerhaft (+ treiben im Fluss)
    let funken = [];             // Ereignis-Blaetter mit Lebensdauer (vorn)
    let sturm = [];              // Raid: Bluetensturm, zieht einmal durch
    let sturmText = null;
    let grosse = [];             // Abo-Blueten
    let wirbel = null;           // { x, y, bis, r }
    let wind = 0;
    let maus = null;
    let letzteLoese = 0;
    let t = 0;
    let acc = 0;

    function jetzt() { return Date.now(); }
    function skala() {
      if (!L || !L.w) return 1;
      return Math.max(0.8, Math.min(1.8, Math.min(L.w, L.h) / 420));
    }
    function farbe() {
      const f = S.blattFarben[Math.floor(Math.random() * S.blattFarben.length)];
      return f === null ? PARTIKEL : f;
    }
    // Was faellt: meist einzelne Blaetter (3 Formen), dazu ganze und gefuellte
    // Blueten und Blaetterpaare. Ganze Blueten sind etwas groesser.
    function form(p) {
      const z = Math.random();
      p.form = z < 0.58 ? 'blatt' : z < 0.78 ? 'bluete' : z < 0.88 ? 'yae' : 'paar';
      p.v = Math.floor(Math.random() * 3);
      if (p.form === 'bluete') p.s *= 1.2; else if (p.form === 'yae') p.s *= 1.4;
      return p;
    }
    // Menge in Entwurfs-Proportionen (Hoehe ~470, wie Wald und Koi), damit
    // "viel" bei allen Themes aehnlich voll wirkt (Janis 09.10.2026).
    function zielAnzahl() {
      const m = Math.max(0.5, L.h / 470);
      const n = 18 * Math.pow(W.dichte(L.w / m, L.h / m), 0.8) * engine.faktor;
      return Math.max(4, Math.min(50, Math.round(n)));
    }

    function neuesBlatt(x, y, vx, vy) {
      if (x === undefined && A.blueten.length && Math.random() < 0.45) { // Rest ueber die ganze Breite
        const bl = A.blueten[Math.floor(Math.random() * A.blueten.length)];
        x = bl.x; y = bl.y;
      }
      return form({
        x: x !== undefined ? x : rnd(-20, L.w), y: y !== undefined ? y : rnd(-30, -10),
        vx: vx !== undefined ? vx : rnd(-0.2, 0.4), vy: vy !== undefined ? vy : rnd(0.3, 0.6),
        rot: rnd(0, TAU), vrot: rnd(-0.04, 0.04), flip: rnd(0, TAU), vflip: rnd(0.04, 0.09),
        s: rnd(7, 11) * skala(), phase: rnd(0, TAU), tiefe: rnd(0.04, 0.9), farbe: farbe()
      });
    }

    // Fester Zufall je Welt-Start: Ast/Steine bleiben beim Neuzeichnen nach
    // einer Groessenaenderung dieselben, nur in der neuen Groesse.
    const SAAT = Number.isFinite(saat) ? saat : Math.floor(Math.random() * 1e9); // 🎲 aus den Einstellungen
    // Bodenteppich aus gefallenen Blueten erst in hohen Fenstern (sonst ist
    // unten ohnehin wenig Platz) und nicht bei Shoji (nur Schatten).
    function teppich() { return !S.ohneTeppich && L.h > 600; }
    function teppichFarben() { return S.blattFarben.map((f) => (f === null ? PARTIKEL : f)); }
    function baueHintergrund() { FxEngine.mitSaat(SAAT, baueHintergrundRoh); }
    function baueHintergrundRoh() {
      const d = L.dpr || 1;
      A = W.baueAst(L.w, L.h, !!S.vonRechts);
      Z.dpr = d;
      if (S.pixel) {
        // Klein bauen, beim Zeichnen ohne Glaettung hochskalieren.
        const c = W.leinwand(L.w / S.pixel, L.h / S.pixel);
        S.hintergrund(c.getContext('2d'), c.width, c.height, A, W, Z);
        if (teppich()) W.bodenTeppich(c.getContext('2d'), c.width, c.height, teppichFarben(), { pixel: true });
        bg = c;
        return;
      }
      const c = W.leinwand(L.w * d, L.h * d);
      const g = c.getContext('2d');
      g.setTransform(d, 0, 0, d, 0, 0);
      S.hintergrund(g, L.w, L.h, A, W, Z);
      if (teppich()) W.bodenTeppich(g, L.w, L.h, teppichFarben(), { gross: skala() });
      if (S.koernung) { g.setTransform(1, 0, 0, 1, 0, 0); W.koernung(g, c.width, c.height, S.koernung); }
      bg = c;
    }

    // --- Bewegung -----------------------------------------------------------
    function wirbelKraft(p, k, nun) {
      if (!wirbel || nun > wirbel.bis) return;
      const dx = p.x - wirbel.x, dy = p.y - wirbel.y, d = Math.hypot(dx, dy);
      if (d < 1 || d > wirbel.r) return;
      const f = (1 - d / wirbel.r) * 0.35 * k;
      // tangential + leicht nach innen -> Blaetter kreisen um den Punkt
      p.vx += (-dy / d * 1.6 - dx / d * 0.5) * f;
      p.vy += (dx / d * 1.6 - dy / d * 0.5) * f;
    }
    function bewege(p, k, nun) {
      if (p.schwimmt) {
        const tiefe = (p.y - Z.flussY) / Math.max(1, L.h - Z.flussY);
        p.x += (0.35 + tiefe * 0.7) * k; p.y += Math.sin(t * 0.04 + p.phase) * 0.08 * k;
        p.rot += Math.sin(t * 0.02 + p.phase) * 0.004 * k;
        if (maus && nun - maus.zeit < MAUS_ALT_MS) {
          const mx = p.x - maus.x, my = p.y - maus.y, md = Math.hypot(mx, my);
          if (md < 50 && md > 0) { p.x += mx / md * 1.2 * k; p.y += my / md * 0.6 * k; }
        }
        return;
      }
      p.vx += (Math.sin(t * 0.02 + p.phase) * 0.25 + wind + 0.15 - p.vx) * 0.04 * k;
      p.vy += (0.55 * skala() + Math.sin(p.flip) * 0.15 - p.vy) * 0.03 * k;
      if (maus && nun - maus.zeit < MAUS_ALT_MS) {
        const dx = p.x - maus.x, dy = p.y - maus.y, d = Math.hypot(dx, dy);
        if (d < MAUS_RADIUS && d > 0) { const f = (MAUS_RADIUS - d) / MAUS_RADIUS * 0.6; p.vx += dx / d * f * k; p.vy += dy / d * f * k; }
      }
      wirbelKraft(p, k, nun);
      p.x += p.vx * k; p.y += p.vy * k; p.rot += p.vrot * k; p.flip += p.vflip * k;
      if (S.fluss && Z.flussY && p.vy > 0 && p.y > Z.flussY + (L.h - Z.flussY) * p.tiefe) {
        p.schwimmt = true; p.flip = 0; p.s *= 0.85 + p.tiefe * 0.3;
      }
    }
    // Ereignis-Blaetter: Schwung, Luftwiderstand, leichte Schwerkraft.
    function bewegeFunke(p, k, nun) {
      p.vx *= Math.pow(0.97, k); p.vy = p.vy * Math.pow(0.97, k) + 0.04 * k;
      wirbelKraft(p, k, nun);
      p.x += (p.vx + Math.sin(t * 0.03 + p.phase) * 0.3) * k; p.y += p.vy * k;
      p.rot += p.vrot * k * 2; p.flip += p.vflip * k;
    }

    // --- Zeichnen -----------------------------------------------------------
    function zeichneBlatt(g, p) {
      if (S.pixel) { S.blattPixel(g, p, W); return; }
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
      const sx = Math.cos(p.flip);
      g.scale(Math.abs(sx) < 0.15 ? 0.15 : sx, p.schwimmt ? 0.7 : 1);
      S.blatt(g, p, W);
      g.restore();
    }
    // Bluete oeffnet sich im ersten Drittel, verblasst im letzten Fuenftel.
    function zeichneGrosse(g, b, nun) {
      const p = (nun - b.start) / b.dauer;
      if (p >= 1) return false;
      const o = 1 - Math.pow(1 - Math.min(1, p / 0.35), 3);
      g.save();
      g.globalAlpha = Math.min(1, p / 0.08) * (p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2);
      const r = b.r * skala();
      W.grosseBluete(g, S, b.x, b.y, o, r, b.dreh + p * 0.6);
      if (b.text) W.namensKarte(g, S, b.x, b.y + r * 1.25 + 8, b.text);
      g.restore();
      return true;
    }

    // Hintergrund noch von der alten Groesse (Neubau erst nach BG_RUHE_MS):
    // gleichmaessig skalieren + beschneiden statt verzerrt strecken.
    function zeichneBg(g) {
      const a = FxEngine.deckend(bg.width, bg.height, L.w, L.h);
      g.drawImage(bg, a.sx, a.sy, a.sw, a.sh, 0, 0, L.w, L.h);
    }

    function bild(nun) {
      const g = L.ctx;
      if (S.pixel) {
        const vorher = g.imageSmoothingEnabled;
        g.imageSmoothingEnabled = false;
        zeichneBg(g);
        g.imageSmoothingEnabled = vorher;
      } else {
        zeichneBg(g);
      }
      if (S.unter) S.unter(g, t, L.w, L.h, W, Z);
      for (const p of blaetter) if (p.schwimmt) zeichneBlatt(g, p);
      for (const p of blaetter) if (!p.schwimmt) zeichneBlatt(g, p);
      for (const p of sturm) zeichneBlatt(g, p);
      if (S.ueber) S.ueber(g, t, L.w, L.h, W, Z);
      // Ereignisse: im Chat auf die Vordergrund-Leinwand (sonst verdecken die
      // Leisten den Punkte-Chip). Geloescht wird sie nur, wenn etwas lief.
      const ev = V ? V.ctx : g;
      if (V) {
        V.passe();
        if (vornBelegt) ev.clearRect(0, 0, V.w, V.h);
      }
      vornBelegt = false;
      for (let i = grosse.length - 1; i >= 0; i--) {
        if (zeichneGrosse(ev, grosse[i], nun)) vornBelegt = true; else grosse.splice(i, 1);
      }
      for (const p of funken) {
        const rest = 1 - (nun - p.start) / p.dauer;
        ev.save(); ev.globalAlpha = Math.max(0, Math.min(1, rest * 3));
        zeichneBlatt(ev, p);
        ev.restore();
        vornBelegt = true;
      }
      // Raid: Kaertchen gleitet ueber dem Sturm mit, haelt rechts an, blendet aus.
      if (sturmText) {
        const st = sturmText, rand = 90, rechts = L.w - rand;
        if (!st.fest && sturm.length) {
          let vorn = -Infinity, my = 0;
          for (const p of sturm) { if (p.x > vorn) vorn = p.x; my += p.y; }
          my /= sturm.length;
          const zielX = Math.min(Math.max(vorn - 60, rand), rechts);
          st.x += (zielX - st.x) * 0.08;
          st.y += (Math.max(8, my - 70 * skala()) - st.y) * 0.05;
          if (st.x >= rechts - 2) { st.x = rechts; st.fest = true; }
        } else if (!st.fest) {
          st.x += (rechts - st.x) * 0.1;
          if (st.x >= rechts - 2) { st.x = rechts; st.fest = true; }
        }
        if (!sturm.length && !st.rastBis) st.rastBis = nun + RAST_MS;
        const ein = Math.min(1, (nun - st.start) / 500);
        const aus = st.rastBis ? Math.max(0, 1 - (nun - st.rastBis) / 500) : 1;
        if (aus <= 0) {
          sturmText = null;
        } else {
          ev.save(); ev.globalAlpha = ein * aus;
          W.namensKarte(ev, S, st.x, st.y, st.zeilen);
          ev.restore();
          vornBelegt = true;
        }
      }
    }

    function frame(dt) {
      acc += dt;
      if (acc < BILD_MS) return;
      const k = acc / 16;
      acc = 0;
      t += k;
      const nun = jetzt();
      if (L.passe()) bgFaellig = nun + BG_RUHE_MS;
      if (!L.w || !L.h) return;            // Ebene unsichtbar (Home zu)
      if (!bg || (bgFaellig && nun >= bgFaellig)) {
        bgFaellig = 0;
        baueHintergrund();
      }
      wind *= Math.pow(0.97, k);
      if (wirbel && nun > wirbel.bis) wirbel = null;
      let fallend = 0, schwimmend = 0;
      for (const p of blaetter) { if (p.schwimmt) schwimmend++; else fallend++; }
      const ziel = zielAnzahl();
      // Nachschub tropft (nicht alle auf einmal nach dem Start)
      if (fallend < ziel && Math.random() < 0.5) blaetter.push(neuesBlatt());
      if (schwimmend > MAX_SCHWIMMER) {
        const i = blaetter.findIndex((p) => p.schwimmt);
        if (i >= 0) blaetter.splice(i, 1);
      }
      for (const p of blaetter) bewege(p, k, nun);
      blaetter = blaetter.filter((p) => p.y < L.h + 30 && p.x < L.w + 50 && p.x > -80 && p.y > -200);
      if (fallend > ziel * 1.6 + 40) blaetter.splice(0, fallend - Math.round(ziel * 1.6 + 40));
      for (const p of funken) bewegeFunke(p, k, nun);
      funken = funken.filter((p) => nun - p.start < p.dauer);
      for (const p of sturm) {
        p.vy += (Math.sin(t * 0.05 + p.phase) * 0.6 - p.vy) * 0.05 * k;
        p.x += p.vx * skala() * k; p.y += p.vy * k; p.rot += p.vrot * k * 2; p.flip += p.vflip * k * 1.5;
      }
      sturm = sturm.filter((p) => p.x < L.w + 40);
      bild(nun);
    }

    // --- Ereignisse ---------------------------------------------------------
    function funke(x, y, vx, vy, dauer) {
      const p = neuesBlatt(x, y, vx, vy);
      p.start = jetzt(); p.dauer = dauer || rnd(1600, 2600);
      p.s *= rnd(1, 1.3);
      funken.push(p);
    }
    function setzeWirbel(x, y, ms, r) { wirbel = { x, y, bis: jetzt() + ms, r: (r || 160) * skala() }; }

    // Raid: Hanafubuki - dichter Bluetensturm in einem Band, links nach rechts.
    function starteSturm(anzahl) {
      if (!L || !L.w) return undefined;
      const n = Math.max(40, Math.min(160, 40 + Math.round((anzahl || 0) / 3)));
      const mitte = rnd(0.3, 0.65) * L.h, band = L.h * 0.16;
      for (let i = 0; i < n; i++) {
        const p = neuesBlatt(-rnd(10, 420) * skala(), mitte + rnd(-band, band), rnd(3.5, 6), rnd(-0.5, 0.5));
        p.s *= rnd(0.9, 1.3);
        sturm.push(p);
      }
      wind = 3;
      return mitte - band;
    }

    // --- Gast: Windstoss voller Blueten weht uebers Video ------------------
    // Eigene Leinwand auf der Gast-Ebene, eigene Animation (die Welt ruht
    // waehrend des Streams). Jeder Gast = ein Stoss von links oder rechts.
    let G = null;
    let gaeste = [];
    let gastLaeuft = false;
    function neuerStoss() {
      const w = G.w, h = G.h;
      const sk = Math.max(1, Math.min(2.2, Math.min(w, h) / 420));
      const richtung = Math.random() < 0.5 ? 1 : -1;
      const mitte = rnd(0.25, 0.75) * h, band = h * rnd(0.12, 0.22);
      const n = 34 + Math.floor(Math.random() * 14);
      for (let i = 0; i < n; i++) {
        const start = -rnd(20, w * 0.45);
        gaeste.push(form({
          x: richtung > 0 ? start : w - start, y: mitte + rnd(-band, band),
          vx: richtung * rnd(2.4, 3.4) * sk, vy: rnd(-0.3, 0.3), rot: rnd(0, TAU), vrot: rnd(-0.06, 0.06),
          flip: rnd(0, TAU), vflip: rnd(0.05, 0.11), s: rnd(10, 16) * sk, phase: rnd(0, TAU), farbe: farbe(),
          richtung, bogen: rnd(0.4, 1.1) * sk
        }));
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
        a = 0; tg += k;
        G.passe();
        const g = G.ctx;
        g.clearRect(0, 0, G.w, G.h);
        for (const p of gaeste) {
          p.x += p.vx * k;
          p.y += (p.vy + Math.sin(tg * 0.035 + p.phase) * p.bogen) * k;
          p.rot += p.vrot * k; p.flip += p.vflip * k;
        }
        gaeste = gaeste.filter((p) => (p.richtung > 0 ? p.x < G.w + 40 : p.x > -40));
        g.save(); g.globalAlpha = 0.92;
        for (const p of gaeste) zeichneBlatt(g, p);
        g.restore();
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
      stop() { blaetter = []; funken = []; sturm = []; grosse = []; gaeste = []; L = null; V = null; G = null; bg = null; },
      // Fuer Tests
      blattZahl() { return blaetter.length + funken.length + sturm.length; },
      schwimmZahl() { return blaetter.filter((p) => p.schwimmt).length; },
      formen() { return [...new Set(blaetter.map((p) => p.form))].sort(); },
      maus(x, y) {
        const nun = jetzt();
        maus = { x, y, zeit: nun };
        if (!L || nun - letzteLoese < LOESE_MS) return;
        const nah = 28 * skala();
        for (const bl of A.blueten) {
          if (Math.hypot(bl.x - x, bl.y - y) < nah) {
            blaetter.push(neuesBlatt(bl.x, bl.y, rnd(-0.6, 0.6), rnd(0.2, 0.8)));
            letzteLoese = nun;
            break;
          }
        }
      },
      klickInsLeere(x, y) {
        if (!L) return;
        wind = x < L.w / 2 ? 2.2 : -2.2;
        for (let i = 0; i < 16; i++) {
          const a = i / 16 * TAU;
          blaetter.push(neuesBlatt(x, y, Math.cos(a) * rnd(1.5, 3), Math.sin(a) * rnd(1.5, 3) - 0.5));
        }
        maus = { x, y, zeit: jetzt() };
      },
      ereignis(art, daten) {
        if (!L) return;
        const u = daten.ursprung || { x: 0, y: 0 };
        // fx-hinten/-vorn liegen im Chat fixed inset 0 -> gleiche Koordinaten wie der Chip.
        if (art === 'raid') {
          const oben = starteSturm(daten.anzahl);
          const n = Number(daten.anzahl) || 0;
          if (oben !== undefined) {
            sturmText = { zeilen: [String(daten.name || 'Raid'), 'raidet mit ' + n.toLocaleString('de-DE') + (n === 1 ? ' Zuschauer' : ' Zuschauern')],
              x: 90, y: Math.max(8, oben - 70 * skala()), start: jetzt(), rastBis: 0, fest: false };
          }
          return;
        }
        if (art === 'abo') {
          const x = daten.ursprung ? u.x : L.w / 2, y = daten.ursprung ? u.y : L.h * 0.4;
          // zeilen kommt aus chat-ereignisse.js (Name + was passiert ist).
          const text = Array.isArray(daten.zeilen) ? daten.zeilen.map(String).slice(0, 2) : [String(daten.name || '')];
          if (!daten.zeilen && daten.monate > 1) text.push(daten.monate + ' Monate');
          grosse.push({ x, y, start: jetzt(), dauer: 4500, r: 20, dreh: rnd(0, TAU), text });
          for (let i = 0; i < 22; i++) {
            const a = i / 22 * TAU, v = rnd(2.2, 3.6);
            funke(x, y, Math.cos(a) * v, Math.sin(a) * v - 0.6, rnd(2000, 3000));
          }
          setzeWirbel(x, y, 3500, 190);
          return;
        }
        // Die Kiste selbst zeichnet die Leiste (kiste.js) - hier nur Blueten.
        if (art === 'kiste') {
          for (let i = 0; i < 30; i++) {
            const a = -Math.PI / 2 + rnd(-1.1, 0.5);   // nach oben, eher nach links (Chip sitzt rechts)
            const v = rnd(3, 6.5);
            funke(u.x, u.y, Math.cos(a) * v, Math.sin(a) * v, rnd(2000, 3200));
          }
          setzeWirbel(u.x, u.y - 60 * skala(), 2500, 150);
        } else {
          for (let i = 0; i < 8; i++) funke(u.x, u.y, rnd(-1.6, 0.8), rnd(-3, -1.2), rnd(1000, 1600));
        }
      },
      gast() {
        if (!G) G = engine.leinwand('gast');
        if (!G) return;
        G.passe();
        if (!G.w || !G.h) return;          // Ebene (noch) unsichtbar
        neuerStoss();
        gastSchleife();
      }
    };
  };
})();
