// Koi-Teich (gezeichnet): Kois mit Wirbelsaeule schwimmen auf einer Leinwand,
// der Stil kommt aus stile.js (Variante). Maus in der Naehe lockt sie an,
// Klick ins Leere = Welle + Flucht, Kiste = Lotus am Punkte-Chip und alle
// schwimmen hin, Punkte = kleine Welle, Raid = Schwarm kleiner Kois zieht
// durchs Bild, Abo = grosse Lotusbluete mit Namen. Gast = Koi uebers Video.
// Gezeichnet wird hoechstens alle 33 ms (30 Bilder/s) - Rechenzeit fuer
// Spiele daneben; der Hintergrund entsteht nur bei Groessenwechsel neu.
(function () {
  window.TwitchDualWelten = window.TwitchDualWelten || {};
  window.TwitchDualWelten.koi = function ({ engine, FxEngine, farben, variante, fenster }) {
    const { rnd } = FxEngine;
    const KS = window.KoiStile;
    const W = KS.werkzeug;
    const TAU = W.TAU;
    const S = KS.stile[variante] || KS.stile.aquarell;
    const PARTIKEL = (farben && farben.partikel) || '#e0714f';
    const BILD_MS = 33;
    const BG_RUHE_MS = 200;     // Hintergrund erst neu, wenn die Groesse ruht
    const MAUS_RADIUS = 260;
    const MAUS_ALT_MS = 2000;   // stillstehende Maus lockt nicht ewig

    let L = null;
    let V = null;               // Vordergrund (Chat: ueber den Leisten) fuer Ereignisse
    let vornBelegt = false;
    let bg = null;
    let bgFaellig = 0;
    const zustand = {};          // Stil-eigene Daten (z. B. Sterne)
    let fische = [];
    let blaetter = [];
    const wellen = [];
    const lotus = [];
    let schwarm = [];            // Raid-Fische, ziehen einmal durch und gehen
    let schwarmText = null;      // Raid-Kaertchen: { zeilen, x, y, start, rastBis }
    const RAST_MS = 2000;        // so lange steht es am Rand, wenn der Schwarm weg ist
    let maus = null;
    let fluchtBis = 0;
    let lock = null;             // { x, y, bis }
    let lockPauseBis = 0;        // nach einem Lockruf eine Weile kein neuer
    const LOCK_PAUSE_MS = 8000;
    let letzteMausWelle = 0;
    let t = 0;
    let acc = 0;

    function jetzt() { return Date.now(); }
    function skala() {
      if (!L || !L.w) return 1;
      return Math.max(0.45, Math.min(1.5, Math.min(L.w, L.h) / 330));
    }
    function farbe(f) { return f === null ? PARTIKEL : f; }

    function neuerFisch(i) {
      const paar = S.fischFarben[i % S.fischFarben.length];
      const w = L.w, h = L.h;
      const f = {
        x: rnd(w * 0.1, w * 0.9), y: rnd(h * 0.1, h * 0.9), a: rnd(0, TAU), v: rnd(0.55, 0.8),
        phase: rnd(0, TAU), laenge: rnd(46, 62) * skala(),
        farben: [farbe(paar[0]), farbe(paar[1])], segs: [], flecken: []
      };
      for (let s = 0; s < 12; s++) f.segs.push({ x: f.x - Math.cos(f.a) * s * 4, y: f.y - Math.sin(f.a) * s * 4 });
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) f.flecken.push({ s: Math.floor(rnd(1, 9)), dx: rnd(-0.5, 0.5), r: rnd(0.55, 1.0) });
      return f;
    }
    function passeAnzahl() {
      const ziel = Math.max(2, Math.round(5 * engine.faktor));
      while (fische.length < ziel) fische.push(neuerFisch(fische.length));
      if (fische.length > ziel) fische.length = ziel;
    }
    // Seerosen wie in einem echten Teich: in Gruppen, verschieden gross, eng
    // beieinander, dazwischen freies Wasser und ein paar Einzelne. Ueberlappen
    // duerfen sie sich nur knapp (Blaetter beruehren sich, liegen nicht aufeinander).
    function verteileBlaetter() {
      const proFlaeche = fenster === 'video' ? 4.5 : 3;
      const n = Math.max(3, Math.min(48, Math.round(proFlaeche * W.dichte(L.w, L.h))));
      const rand = 12;
      const gruppen = [];
      const anzahlGruppen = Math.max(1, Math.round(n / 5));
      for (let k = 0; k < anzahlGruppen; k++) {
        gruppen.push({ x: rnd(rand, L.w - rand), y: rnd(rand, L.h - rand), r: rnd(40, 90) * skala() });
      }
      blaetter = [];
      for (let b = 0; b < n; b++) {
        const r = rnd(12, 30) * skala();
        for (let versuch = 0; versuch < 30; versuch++) {
          let x, y;
          if (Math.random() < 0.78) {
            const gr = gruppen[Math.floor(Math.random() * gruppen.length)];
            const a = rnd(0, TAU), d = gr.r * Math.sqrt(Math.random()) * 1.3;
            x = gr.x + Math.cos(a) * d; y = gr.y + Math.sin(a) * d * rnd(0.6, 1);
          } else {
            x = rnd(rand, L.w - rand); y = rnd(rand, L.h - rand);
          }
          if (x < -r * 0.4 || x > L.w + r * 0.4 || y < -r * 0.4 || y > L.h + r * 0.4) continue;
          if (blaetter.every((o) => Math.hypot(o.x - x, o.y - y) > (o.r + r) * 0.9)) {
            blaetter.push({ x, y, r, a: rnd(0, TAU), bluete: Math.random() < 0.3 });
            break;
          }
        }
      }
    }

    function baueHintergrund() {
      const d = L.dpr || 1;
      const c = W.leinwand(L.w * d, L.h * d);
      const g = c.getContext('2d');
      g.setTransform(d, 0, 0, d, 0, 0);
      S.hintergrund(g, L.w, L.h, W, zustand);
      if (S.koernung) { g.setTransform(1, 0, 0, 1, 0, 0); W.koernung(g, c.width, c.height, S.koernung); g.setTransform(d, 0, 0, d, 0, 0); }
      if (S.stempel && L.w > 120) W.stempel(g, L.w - 44, 56);
      bg = c;
    }

    // --- Bewegung -----------------------------------------------------------
    function bewege(f, k, nun, alle) {
      const rand = 30;
      let wunsch;
      let rate = 0.03;
      const flieht = nun < fluchtBis;
      const gelockt = lock && nun < lock.bis && f.lockt;
      if (f.nachLock && !gelockt) {
        // Lockruf vorbei: jeder in eine eigene Richtung, damit kein Haufen bleibt.
        f.nachLock = false;
        f.zerstreuWinkel = rnd(0, TAU);
        f.zerstreuBis = nun + 1800;
      }
      if (f.x < rand || f.x > L.w - rand || f.y < rand || f.y > L.h - rand) {
        wunsch = Math.atan2(L.h / 2 - f.y, L.w / 2 - f.x);
      } else if (gelockt) {
        // Jeder Fisch hat seinen eigenen Platz auf einem Ring um den Punkt.
        const zx = lock.x + Math.cos(f.ringWinkel) * f.ringR, zy = lock.y + Math.sin(f.ringWinkel) * f.ringR;
        wunsch = Math.hypot(zx - f.x, zy - f.y) > 14 ? Math.atan2(zy - f.y, zx - f.x) : f.a + 0.05;
        rate = 0.08;
      } else if (nun < (f.zerstreuBis || 0)) {
        wunsch = f.zerstreuWinkel; rate = 0.06;
      } else if (flieht && maus) {
        wunsch = Math.atan2(f.y - maus.y, f.x - maus.x); rate = 0.12;
      } else if (maus && nun - maus.zeit < MAUS_ALT_MS) {
        const dz = Math.hypot(maus.x - f.x, maus.y - f.y);
        wunsch = dz < MAUS_RADIUS && dz > 40 ? Math.atan2(maus.y - f.y, maus.x - f.x) : f.a + Math.sin(t * 0.01 + f.phase) * 0.6;
      } else {
        wunsch = f.a + Math.sin(t * 0.01 + f.phase) * 0.6;
      }
      // Abstand halten: Nachbarn, die zu nah sind, schieben die Wunschrichtung weg.
      if (!flieht) {
        let sx = 0, sy = 0;
        for (const o of alle) {
          if (o === f) continue;
          const dx = f.x - o.x, dy = f.y - o.y, d = Math.hypot(dx, dy), nah = (f.laenge + o.laenge) * 0.55;
          if (d > 0 && d < nah) { const w = (nah - d) / nah; sx += dx / d * w; sy += dy / d * w; }
        }
        if (sx || sy) {
          const wx = Math.cos(wunsch) + sx * 2.2, wy = Math.sin(wunsch) + sy * 2.2;
          wunsch = Math.atan2(wy, wx);
          rate = Math.max(rate, 0.06);
        }
      }
      const diff = Math.atan2(Math.sin(wunsch - f.a), Math.cos(wunsch - f.a));
      f.a += diff * Math.min(1, rate * k);
      const eile = flieht ? 3.2 : (gelockt ? 2.2 : 1);
      const v = f.v * eile * skala() * k;
      f.x += Math.cos(f.a) * v; f.y += Math.sin(f.a) * v;
      f.segs[0].x = f.x; f.segs[0].y = f.y;
      const abst = f.laenge / 11;
      for (let i = 1; i < f.segs.length; i++) {
        const p = f.segs[i - 1], q = f.segs[i], wi = Math.atan2(q.y - p.y, q.x - p.x);
        q.x = p.x + Math.cos(wi) * abst; q.y = p.y + Math.sin(wi) * abst;
      }
      f.phase += (flieht ? 0.35 : 0.12) * k;
    }

    // --- Zeichnen -----------------------------------------------------------
    // Bluete oeffnet sich im ersten Drittel, verblasst im letzten Fuenftel.
    function zeichneLotus(g, lo, nun) {
      const p = (nun - lo.start) / lo.dauer;
      if (p >= 1) return false;
      const o = 1 - Math.pow(1 - Math.min(1, p / 0.35), 3);
      g.save();
      g.globalAlpha = Math.min(1, p / 0.08) * (p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2);
      W.lotus(g, S, lo.x, lo.y, o, lo.L * skala(), lo.dreh);
      if (lo.text) W.namensKarte(g, S, lo.x, lo.y + lo.L * skala() * 1.25 + 8, lo.text);
      g.restore();
      return true;
    }

    // Raid: kleiner Schwarm in einem Band, zieht von links nach rechts.
    function starteSchwarm(anzahl) {
      if (!L || !L.w) return;
      const n = Math.max(8, Math.min(28, 8 + Math.round((anzahl || 0) / 10)));
      const mitte = rnd(0.3, 0.7) * L.h, band = L.h * 0.15;
      for (let i = 0; i < n; i++) {
        const f = neuerFisch(Math.floor(Math.random() * S.fischFarben.length));
        f.laenge = rnd(24, 34) * skala();
        f.x = -rnd(20, 260) * skala(); f.y = mitte + rnd(-band, band);
        f.a = rnd(-0.12, 0.12); f.v = rnd(2.2, 3.0);
        for (let s2 = 0; s2 < f.segs.length; s2++) { f.segs[s2].x = f.x - s2 * 3; f.segs[s2].y = f.y; }
        schwarm.push(f);
      }
      welle(12, mitte, true);
      return mitte - band;
    }
    function bewegeSchwarm(k) {
      for (const f of schwarm) {
        f.a += (Math.sin(t * 0.05 + f.phase) * 0.18 - f.a) * 0.05 * k;
        f.x += Math.cos(f.a) * f.v * skala() * k; f.y += Math.sin(f.a) * f.v * skala() * k;
        f.segs[0].x = f.x; f.segs[0].y = f.y;
        const abst = f.laenge / 11;
        for (let i = 1; i < f.segs.length; i++) {
          const p = f.segs[i - 1], q = f.segs[i], wi = Math.atan2(q.y - p.y, q.x - p.x);
          q.x = p.x + Math.cos(wi) * abst; q.y = p.y + Math.sin(wi) * abst;
        }
        f.phase += 0.3 * k;
      }
      schwarm = schwarm.filter((f) => f.segs[f.segs.length - 1].x < L.w + 40);
    }

    function bild(nun) {
      const g = L.ctx;
      g.drawImage(bg, 0, 0, L.w, L.h);
      if (S.unter) S.unter(g, t, L.w, L.h, W, zustand);
      for (const f of fische) S.fisch(g, f, W);
      for (const f of schwarm) S.fisch(g, f, W);
      for (const bl of blaetter) {
        bl.a += 0.0008;
        g.save(); g.translate(bl.x, bl.y); g.rotate(bl.a); S.blatt(g, bl, W); g.restore();
      }
      if (Math.random() < 0.025) wellen.push({ x: rnd(0, L.w), y: rnd(0, L.h), t: 0, gross: false });
      if (S.ueber) S.ueber(g, t, L.w, L.h, W, zustand);
      // Ereignisse: im Chat auf die Vordergrund-Leinwand (sonst verdecken die
      // Leisten den Punkte-Chip). Geloescht wird sie nur, wenn etwas lief.
      const ev = V ? V.ctx : g;
      if (V) {
        V.passe();
        if (vornBelegt) ev.clearRect(0, 0, V.w, V.h);
      }
      vornBelegt = false;
      for (let i = wellen.length - 1; i >= 0; i--) {
        const we = wellen[i];
        we.t += 2;
        if (we.t < 0) continue;
        const max = we.gross ? 90 : 55, r = we.t * (we.gross ? 0.9 : 0.5) * skala(), a = 1 - r / (max * skala());
        if (a <= 0) { wellen.splice(i, 1); continue; }
        const ziel = we.vorn ? ev : g;
        if (we.vorn) vornBelegt = true;
        ziel.save(); ziel.globalAlpha = a; S.welle(ziel, we.x, we.y, r, W); ziel.restore();
      }
      for (let i = lotus.length - 1; i >= 0; i--) {
        if (zeichneLotus(ev, lotus[i], nun)) vornBelegt = true; else lotus.splice(i, 1);
      }
      // Raid: Kaertchen gleitet weich ueber dem Schwarm mit (feste Hoehe, kein
      // Nachspringen), haelt am rechten Rand an und blendet nach der Rast aus.
      if (schwarmText) {
        const st = schwarmText, rand = 90, rechts = L.w - rand;
        // Unterwegs folgt es dem Schwarm weich in x UND y (schwimmt mit hoch und
        // runter); ist es rechts angekommen, steht es fest.
        if (!st.fest && schwarm.length) {
          const vorn = Math.max(...schwarm.map((f) => f.x));
          let my = 0;
          for (const f of schwarm) my += f.y;
          my /= schwarm.length;
          const zielX = Math.min(Math.max(vorn - 30, rand), rechts);
          const zielY = Math.max(8, my - 56 * skala());
          st.x += (zielX - st.x) * 0.08;
          st.y += (zielY - st.y) * 0.05;
          if (st.x >= rechts - 2) { st.x = rechts; st.fest = true; }
        } else if (!st.fest) {
          st.x += (rechts - st.x) * 0.1;
          if (st.x >= rechts - 2) { st.x = rechts; st.fest = true; }
        }
        if (!schwarm.length && !st.rastBis) st.rastBis = nun + RAST_MS;
        const ein = Math.min(1, (nun - st.start) / 500);
        const aus = st.rastBis ? Math.max(0, 1 - (nun - st.rastBis) / 500) : 1;
        if (aus <= 0) {
          schwarmText = null;
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
        const erst = !bg;
        baueHintergrund();
        verteileBlaetter();
        if (!erst) for (const f of fische) { f.x = Math.min(f.x, L.w - 31); f.y = Math.min(f.y, L.h - 31); }
      }
      passeAnzahl();
      for (const f of fische) bewege(f, k, nun, fische);
      bewegeSchwarm(k);
      bild(nun);
    }

    // Lockruf: etwa 2 von 3 Fischen kommen, jeder auf seinen Platz im Ring.
    // Danach LOCK_PAUSE_MS kein neuer - dichte Abos stapeln sonst endlos.
    function locke(x, y, ms) {
      const nun = jetzt();
      if (nun < lockPauseBis) return;
      lockPauseBis = nun + LOCK_PAUSE_MS;
      lock = { x, y, bis: nun + ms };
      for (const f of fische) {
        f.lockt = Math.random() < 0.67;
        f.ringWinkel = rnd(0, TAU);
        f.ringR = rnd(35, 75) * skala();
        f.nachLock = f.lockt;
      }
    }

    function welle(x, y, gross, verzug, vorn) { wellen.push({ x, y, t: -(verzug || 0), gross, vorn: !!vorn }); }

    // Gast: echte Kois (mit Wirbelsaeule) schwimmen ueber das Video. Jeder
    // kommt von einem zufaelligen Rand, zieht ein paar Sekunden in Boegen
    // umher und verlaesst das Bild ueber einen anderen Rand. Eigene Leinwand
    // auf der Gast-Ebene, eigene Animation (der Teich ruht waehrend des Streams).
    let G = null;
    let gaeste = [];
    let gastLaeuft = false;
    function randPunkt(seite, w, h, aussen) {
      if (seite === 0) return { x: -aussen, y: rnd(h * 0.15, h * 0.85) };
      if (seite === 1) return { x: w + aussen, y: rnd(h * 0.15, h * 0.85) };
      if (seite === 2) return { x: rnd(w * 0.15, w * 0.85), y: -aussen };
      return { x: rnd(w * 0.15, w * 0.85), y: h + aussen };
    }
    function neuerGast() {
      const w = G.w, h = G.h;
      const sk = Math.max(0.8, Math.min(1.7, Math.min(w, h) / 480));
      const paar = S.fischFarben[Math.floor(Math.random() * S.fischFarben.length)];
      const rein = Math.floor(Math.random() * 4);
      let raus = Math.floor(Math.random() * 3);
      if (raus >= rein) raus++;
      const start = randPunkt(rein, w, h, 70 * sk);
      const ziel = { x: rnd(w * 0.25, w * 0.75), y: rnd(h * 0.25, h * 0.75) };
      const f = {
        x: start.x, y: start.y, a: Math.atan2(ziel.y - start.y, ziel.x - start.x), v: rnd(1.1, 1.5) * sk,
        phase: rnd(0, TAU), laenge: rnd(58, 74) * sk, farben: [farbe(paar[0]), farbe(paar[1])], segs: [], flecken: [],
        stadium: 'rein', bis: 0, ausgang: randPunkt(raus, w, h, 120 * sk), welle: rnd(0, TAU)
      };
      for (let k = 0; k < 12; k++) f.segs.push({ x: f.x - Math.cos(f.a) * k * 5, y: f.y - Math.sin(f.a) * k * 5 });
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) f.flecken.push({ s: Math.floor(rnd(1, 9)), dx: rnd(-0.5, 0.5), r: rnd(0.55, 1.0) });
      return f;
    }
    function bewegeGast(f, k, nun) {
      const w = G.w, h = G.h, rand = Math.min(w, h) * 0.12;
      let wunsch, rate = 0.035;
      if (f.stadium === 'rein') {
        wunsch = Math.atan2(h / 2 - f.y, w / 2 - f.x);
        if (f.x > rand && f.x < w - rand && f.y > rand && f.y < h - rand) { f.stadium = 'umher'; f.bis = nun + rnd(4000, 7000); }
      } else if (f.stadium === 'umher') {
        f.welle += 0.02 * k;
        wunsch = f.a + Math.sin(f.welle) * 0.9;
        // Vom Rand weg in die Mitte zurueckdrehen
        if (f.x < rand || f.x > w - rand || f.y < rand || f.y > h - rand) { wunsch = Math.atan2(h / 2 - f.y, w / 2 - f.x); rate = 0.06; }
        if (nun > f.bis) f.stadium = 'raus';
      } else {
        wunsch = Math.atan2(f.ausgang.y - f.y, f.ausgang.x - f.x); rate = 0.05;
      }
      const diff = Math.atan2(Math.sin(wunsch - f.a), Math.cos(wunsch - f.a));
      f.a += diff * Math.min(1, rate * k);
      const eile = f.stadium === 'raus' ? 1.5 : 1;
      f.x += Math.cos(f.a) * f.v * eile * k; f.y += Math.sin(f.a) * f.v * eile * k;
      f.segs[0].x = f.x; f.segs[0].y = f.y;
      const abst = f.laenge / 11;
      for (let i = 1; i < f.segs.length; i++) {
        const p = f.segs[i - 1], q = f.segs[i], wi = Math.atan2(q.y - p.y, q.x - p.x);
        q.x = p.x + Math.cos(wi) * abst; q.y = p.y + Math.sin(wi) * abst;
      }
      f.phase += 0.14 * k;
      const weg = 160;
      return !(f.stadium === 'raus' && (f.x < -weg || f.x > w + weg || f.y < -weg || f.y > h + weg));
    }
    function gastSchleife() {
      if (gastLaeuft) return;
      gastLaeuft = true;
      let acc = 0;
      engine.animiere((dt) => {
        acc += dt;
        if (acc < BILD_MS) return true;
        const k = acc / 16;
        acc = 0;
        G.passe();
        const nun = jetzt();
        const g = G.ctx;
        g.clearRect(0, 0, G.w, G.h);
        gaeste = gaeste.filter((f) => bewegeGast(f, k, nun));
        g.save(); g.globalAlpha = 0.92;
        for (const f of gaeste) S.fisch(g, f, W);
        g.restore();
        if (!gaeste.length) { g.clearRect(0, 0, G.w, G.h); gastLaeuft = false; return false; }
        return true;
      });
    }

    return {
      start() {
        L = engine.leinwand('hinten');
        if (!L) return;
        // Im Video-Fenster gibt es keine vorn-Ebene -> Ereignisse auf den Teich.
        V = engine.leinwand('vorn');
        engine.schleife(frame);
      },
      stop() { fische = []; blaetter = []; schwarm = []; gaeste = []; L = null; V = null; G = null; bg = null; },
      // Fuer Tests: wo die Fische gerade sind.
      fischPositionen() { return fische.map((f) => ({ x: f.x, y: f.y })); },
      maus(x, y) {
        const nun = jetzt();
        maus = { x, y, zeit: nun };
        if (nun - letzteMausWelle > 700) { letzteMausWelle = nun; welle(x, y, false); }
      },
      klickInsLeere(x, y) {
        welle(x, y, true); welle(x, y, true, 24);
        maus = { x, y, zeit: jetzt() };
        fluchtBis = jetzt() + 1500;
      },
      ereignis(art, daten) {
        const u = daten.ursprung || { x: 0, y: 0 };
        // fx-hinten liegt im Chat fixed inset 0 -> gleiche Koordinaten wie der Chip.
        if (art === 'raid') {
          const oben = starteSchwarm(daten.anzahl);
          const n = Number(daten.anzahl) || 0;
          if (oben !== undefined) {
            schwarmText = { zeilen: [String(daten.name || 'Raid'), 'raidet mit ' + n.toLocaleString('de-DE') + (n === 1 ? ' Zuschauer' : ' Zuschauern')],
              x: 90, y: Math.max(8, oben - 56 * skala()), start: jetzt(), rastBis: 0, fest: false };
          }
          return;
        }
        if (art === 'abo') {
          const x = daten.ursprung ? u.x : (L ? L.w / 2 : 0), y = daten.ursprung ? u.y : (L ? L.h / 2 : 0);
          // zeilen kommt aus chat-ereignisse.js (Name + was passiert ist).
          const text = Array.isArray(daten.zeilen) ? daten.zeilen.map(String).slice(0, 2) : [String(daten.name || '')];
          if (!daten.zeilen && daten.monate > 1) text.push(daten.monate + ' Monate');
          lotus.push({ x, y, start: jetzt(), dauer: 4500, L: 20, dreh: rnd(0, TAU), text });
          for (let i = 0; i < 3; i++) welle(x, y, true, i * 22, true);
          locke(x, y, 3500);
          return;
        }
        // fx-hinten/-vorn liegen im Chat fixed inset 0 -> gleiche Koordinaten wie der Chip.
        // Die Kiste selbst zeichnet die Leiste (kiste.js) - hier nur Wasser + Fische.
        if (art === 'kiste') {
          welle(u.x, u.y, true, 0, true); welle(u.x, u.y, true, 30, true);
          locke(u.x, u.y, 3000);
        } else {
          welle(u.x, u.y, true, 0, true);
          locke(u.x, u.y, 1500);
        }
      },
      gast() {
        if (!G) G = engine.leinwand('gast');
        if (!G) return;
        G.passe();
        if (!G.w || !G.h) return;          // Ebene (noch) unsichtbar
        gaeste.push(neuerGast());
        gastSchleife();
      }
    };
  };
})();
