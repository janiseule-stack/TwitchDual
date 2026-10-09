// Sakura: Zeichenstile der Varianten (Canvas 2D). welt.js bewegt die Blueten,
// hier steht nur, WIE gezeichnet wird. Jeder Stil liefert:
//   blattFarben  [farbe, ...]  (null = Partikelfarbe)
//   hintergrund(g, w, h, A, W, Z)  einmal pro Groesse, in eine Offscreen-Leinwand.
//                A = Ast { seg, blueten } (Welt-Koordinaten), Z = Stil-eigene Daten.
//   unter(g, t, w, h, W, Z)   optional, jedes Bild VOR den Blueten
//   blatt(g, p, W)            ein Bluetenblatt (schon verschoben/gedreht/gekippt)
//   ueber(g, t, w, h, W, Z)   optional, jedes Bild NACH allem
//   schrift {...}             Namenskaertchen (Abo/Raid)
//   bluete {...}              grosse Bluete (Abo) - Farben/Rand
// Sonderfaelle: pixel = Kantenlaenge eines Pixels (Hintergrund wird klein
// gebaut und hochskaliert, Blaetter sind Bloecke), fluss = Blueten landen im
// Wasser (Z.flussY), ast: false = kein Zweig (Bluetenstellen setzt der Stil).
(function () {
  const TAU = Math.PI * 2;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function leinwand(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  // Papierkoernung direkt in die Pixel (nur beim Hintergrund-Bau).
  function koernung(g, w, h, staerke) {
    const bild = g.getImageData(0, 0, w, h), d = bild.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * staerke;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(bild, 0, 0);
  }
  function dichte(w, h) { return Math.max(0.3, (w * h) / 141000); }
  // '#rrggbb' -> 'rgba(r,g,b,a)'; alles andere bleibt, wie es ist.
  function mitAlpha(farbe, a) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(farbe || '');
    if (!m) return farbe;
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
  }
  function stempel(g, x, y, zeichen, farbe) {
    g.save(); g.globalAlpha = 0.9; g.fillStyle = farbe || '#c0392b'; g.fillRect(x, y, 26, 26);
    g.fillStyle = '#f6efe2'; g.font = 'bold 19px "Yu Mincho", "MS Mincho", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(zeichen || '桜', x + 13, y + 14);
    g.restore();
  }

  // --- Formen -----------------------------------------------------------------
  // Bluetenblatt mit der Sakura-Kerbe an der Spitze, Mitte = 0,0.
  function blattPfad(g, s) {
    g.beginPath();
    g.moveTo(0, s * 0.5);
    g.bezierCurveTo(s * 0.6, s * 0.25, s * 0.5, -s * 0.42, s * 0.14, -s * 0.5);
    g.lineTo(0, -s * 0.34);
    g.lineTo(-s * 0.14, -s * 0.5);
    g.bezierCurveTo(-s * 0.5, -s * 0.42, -s * 0.6, s * 0.25, 0, s * 0.5);
    g.closePath();
  }
  // Ganze Bluete von vorn: 5 Blaetter um die Mitte, je() fuellt/umrandet.
  function bluetenPfad(g, r, je) {
    for (let i = 0; i < 5; i++) {
      g.save(); g.rotate(i / 5 * TAU); g.translate(0, -r * 0.55);
      blattPfad(g, r * 1.05); je(i); g.restore();
    }
  }

  // --- Fallende Formen ----------------------------------------------------------
  // Ein Blatt als Teilpfad (ohne beginPath): v 0 = gekerbt, 1 = rund, 2 = schmal.
  function blattTeil(g, s, v) {
    if (v === 1) {
      g.moveTo(0, s * 0.5);
      g.bezierCurveTo(s * 0.62, s * 0.3, s * 0.55, -s * 0.5, 0, -s * 0.5);
      g.bezierCurveTo(-s * 0.55, -s * 0.5, -s * 0.62, s * 0.3, 0, s * 0.5);
    } else if (v === 2) {
      g.moveTo(0, s * 0.55);
      g.bezierCurveTo(s * 0.38, s * 0.2, s * 0.32, -s * 0.45, s * 0.1, -s * 0.55);
      g.lineTo(0, -s * 0.42);
      g.lineTo(-s * 0.1, -s * 0.55);
      g.bezierCurveTo(-s * 0.32, -s * 0.45, -s * 0.38, s * 0.2, 0, s * 0.55);
    } else {
      g.moveTo(0, s * 0.5);
      g.bezierCurveTo(s * 0.6, s * 0.25, s * 0.5, -s * 0.42, s * 0.14, -s * 0.5);
      g.lineTo(0, -s * 0.34);
      g.lineTo(-s * 0.14, -s * 0.5);
      g.bezierCurveTo(-s * 0.5, -s * 0.42, -s * 0.6, s * 0.25, 0, s * 0.5);
    }
    g.closePath();
  }
  // Pfad fuer ein fallendes Teil: einzelnes Blatt, Paar, ganze oder gefuellte
  // (Yae-)Bluete. Mitte = 0,0; ein einziger Pfad -> ein fill() pro Teil.
  function formPfad(g, p) {
    const s = p.s;
    g.beginPath();
    if (p.form === 'bluete' || p.form === 'yae') {
      const lagen = p.form === 'yae' ? [[s * 0.62, 0], [s * 0.42, TAU / 10]] : [[s * 0.62, 0]];
      for (const [r, dreh] of lagen) {
        for (let i = 0; i < 5; i++) {
          g.save(); g.rotate(dreh + i / 5 * TAU); g.translate(0, -r * 0.55); blattTeil(g, r * 1.05, 0); g.restore();
        }
      }
    } else if (p.form === 'paar') {
      for (const a of [-0.5, 0.5]) {
        g.save(); g.rotate(a); g.translate(0, -s * 0.3); blattTeil(g, s * 0.8, p.v || 0); g.restore();
      }
    } else {
      blattTeil(g, s, p.v || 0);
    }
  }
  // Mitte einer ganzen Bluete (Staubgefaesse als Punkt).
  function mitte(g, p, farbe) {
    if (p.form !== 'bluete' && p.form !== 'yae') return;
    g.fillStyle = farbe; g.beginPath(); g.arc(0, 0, Math.max(1, p.s * 0.12), 0, TAU); g.fill();
  }
  function istBluete(p) { return p.form === 'bluete' || p.form === 'yae'; }

  // --- Blueten am Zweig ----------------------------------------------------------
  // art: einfach | yae (gefuellt, zwei Lagen) | halb (drei Blaetter, halb offen)
  // | knospe. je(teil) fuellt: 'blatt' | 'innen' | 'knospe' | 'mitte'.
  function astBluete(g, bl, je) {
    g.save(); g.translate(bl.x, bl.y); g.rotate(bl.a);
    if (bl.art === 'knospe') {
      g.beginPath(); g.ellipse(0, 0, bl.r * 0.35, bl.r * 0.5, 0, 0, TAU); je('knospe');
    } else if (bl.art === 'halb') {
      for (const a of [-0.6, 0, 0.6]) {
        g.save(); g.rotate(a); g.translate(0, -bl.r * 0.45); blattPfad(g, bl.r * 0.95); je('blatt'); g.restore();
      }
      g.beginPath(); g.arc(0, 0, Math.max(1.2, bl.r * 0.2), 0, TAU); je('mitte');
    } else {
      bluetenPfad(g, bl.r, () => je('blatt'));
      if (bl.art === 'yae') { g.rotate(TAU / 10); bluetenPfad(g, bl.r * 0.64, () => je('innen')); }
      g.beginPath(); g.arc(0, 0, Math.max(1.3, bl.r * 0.22), 0, TAU); je('mitte');
    }
    g.restore();
  }

  // Ast: verzweigte Linien von einer oberen Ecke, Groesse nach der Hoehe.
  // Regeln (Janis 09.10.2026): jeder Zweig verjuengt sich bis zu einer
  // duennen Spitze (hoert nie stumpf auf), Blueten nur am duennen Holz -
  // am dicken Ast wachsen sie an kurzen Seitentrieben -, Menge nach Laenge.
  // Erzeugen-und-pruefen: bis zu 10 Versuche, bis Abdeckung und Bluetenzahl
  // stimmen (sonst der beste) - kein kahler Strich, kein Fitzel in der Ecke.
  function baueAst(w, h, vonRechts) {
    let bester = null;
    for (let versuch = 0; versuch < 10; versuch++) {
      const A = baueAstEinmal(w, h, vonRechts);
      A.guete = astGuete(A, w, h);
      if (!bester || A.guete.punkte > bester.guete.punkte) bester = A;
      if (A.guete.ok) return A;
    }
    return bester;
  }

  function astGuete(A, w, h) {
    const xs = A.seg.flatMap((s) => [s.x1, s.x2]).map((x) => Math.max(0, Math.min(w, x)));
    const ys = A.seg.flatMap((s) => [s.y1, s.y2]);
    const breite = (Math.max(...xs) - Math.min(...xs)) / w;
    const hoehe = (Math.max(...ys) - Math.min(...ys)) / h;
    const blueten = A.blueten.length;
    const ok = breite >= 0.55 && hoehe >= 0.33 && blueten >= 45 && A.seg.length >= 40;
    return { ok, breite, hoehe, blueten, punkte: Math.min(1, breite / 0.55) + Math.min(1, hoehe / 0.33) + Math.min(1, blueten / 45) };
  }

  function baueAstEinmal(w, h, vonRechts) {
    // Groesse an der Hoehe ausrichten (wie der Wald, Entwurf ~470 px hoch).
    const sk = Math.max(0.8, Math.min(2.4, Math.min(w * 1.3, h) / 430));
    const hoch = h / Math.max(1, w); // > 1.5 = schmaler, hoher Chat
    const stamm = 13 * sk;
    const duenn = stamm * 0.3;           // ab hier darf es bluehen
    const spitze = Math.max(0.9, stamm * 0.07);
    const aus = { seg: [], blueten: [], spitzen: [], sk, stamm, duenn };

    function bluehe(x, y, menge) {
      for (let j = 0; j < menge; j++) {
        const z = Math.random();
        const art = z < 0.12 ? 'knospe' : z < 0.25 ? 'halb' : z < 0.45 ? 'yae' : 'einfach';
        aus.blueten.push({ x: x + rnd(-4, 4) * sk, y: y + rnd(-4, 4) * sk, r: rnd(5, 8.5) * sk * (art === 'yae' ? 1.15 : 1), a: rnd(0, TAU), art });
      }
    }

    // Kurztrieb am dicken Holz: kurz, duenn, traegt ein Bluetenbueschel.
    function kurztrieb(x, y, a) {
      const l = rnd(26, 40) * sk;
      const nx = x + Math.cos(a) * l, ny = Math.max(8, y + Math.sin(a) * l);
      aus.seg.push({ x1: x, y1: y, x2: nx, y2: ny, w: duenn * 0.55 });
      aus.spitzen.push({ x: nx, y: ny, w: duenn * 0.55 });
      bluehe(nx, ny, 1 + Math.floor(Math.random() * 3));
    }

    function zweig(x, y, a, len, br, tiefe) {
      const n = tiefe >= 2 ? 9 : 7;
      let cx = x, cy = y, ca = a;
      let kinder = 0;
      for (let i = 0; i < n; i++) {
        ca += rnd(-0.26, 0.26);
        // Nie ueber den oberen Rand: zeigt der Zweig dorthin, nach unten spiegeln.
        if (cy + Math.sin(ca) * len / n < 8) ca = -ca;
        const nx = cx + Math.cos(ca) * len / n, ny = cy + Math.sin(ca) * len / n;
        // Verjuengung bis zur Spitze (letztes Stueck = spitze).
        const b = br + (spitze - br) * Math.pow((i + 1) / n, 0.9);
        aus.seg.push({ x1: cx, y1: cy, x2: nx, y2: ny, w: b });
        // Mindestens 2 Unterzweige (kein kahler Strich).
        const muss = tiefe > 0 && kinder < 2 && i >= n - 1 - (2 - kinder);
        if (tiefe > 0 && i >= 1 && i < n - 1 && (muss || Math.random() < 0.5)) {
          kinder++;
          zweig(nx, ny, ca + (Math.random() < 0.5 ? -1 : 1) * rnd(0.5, 1.0), len * rnd(0.4, 0.6), Math.min(b * 0.7, br * 0.6), tiefe - 1);
        }
        const segLen = len / n;
        if (b <= duenn) {
          // Duennes Holz: Bueschel nach Laenge (etwa eins je 60 px Zweig).
          const erwartet = segLen / (60 * sk);
          const m = Math.floor(erwartet) + (Math.random() < erwartet % 1 ? 1 : 0);
          for (let k = 0; k < m; k++) {
            const t = rnd(0.35, 1); // nicht direkt am Ansatz (dort grenzt dickeres Holz)
            bluehe(cx + (nx - cx) * t, cy + (ny - cy) * t, 1 + Math.floor(Math.random() * 2));
          }
        } else if (Math.random() < 0.4) {
          kurztrieb(nx, ny, ca + (Math.random() < 0.5 ? -1 : 1) * rnd(0.6, 1.3));
        }
        cx = nx; cy = ny;
      }
      aus.spitzen.push({ x: cx, y: cy, w: aus.seg[aus.seg.length - 1].w });
      bluehe(cx, cy, 1 + Math.floor(Math.random() * 2)); // Spitze bluehen lassen
    }

    // Unter den Leisten oben anfangen, sonst verschwindet der Ansatz.
    const y0 = Math.min(h * 0.35, Math.max(56, h * 0.1));
    // Je hoeher das Fenster im Verhaeltnis, desto steiler haengt der Ast herab.
    const winkel = hoch > 1.5 ? 0.85 : hoch > 1.05 ? 0.5 : 0.3;
    const len = Math.min(Math.hypot(w, h) * 0.8, 560 * sk);
    if (vonRechts) zweig(w + 10, y0, Math.PI - winkel, len, stamm, 3);
    else zweig(-10, y0, winkel, len, stamm, 3);
    // Breite Fenster: ein zweiter, kleinerer Zweig von der anderen Seite.
    if (w > h * 1.4) {
      if (vonRechts) zweig(-10, y0 * 1.3, 0.25, len * 0.65, stamm * 0.7, 2);
      else zweig(w + 10, y0 * 1.3, Math.PI - 0.25, len * 0.65, stamm * 0.7, 2);
    }
    // Schmale, hohe Chats: weiter unten ein zweiter Zweig von der anderen Seite.
    if (hoch > 1.5) {
      const y1 = y0 + h * 0.32;
      if (vonRechts) zweig(-10, y1, winkel * 0.8, len * 0.6, stamm * 0.7, 2);
      else zweig(w + 10, y1, Math.PI - winkel * 0.8, len * 0.6, stamm * 0.7, 2);
    }
    return aus;
  }
  function astLinien(g, seg, faktor, farbe, wackel) {
    g.strokeStyle = farbe; g.lineCap = 'round';
    for (const s of seg) {
      const v = wackel || 0;
      g.lineWidth = Math.max(0.8, s.w * faktor);
      g.beginPath(); g.moveTo(s.x1 + rnd(-v, v), s.y1 + rnd(-v, v)); g.lineTo(s.x2 + rnd(-v, v), s.y2 + rnd(-v, v)); g.stroke();
    }
  }
  // Bluetenbueschel am Ast: flach gefuellt, optional mit Rand und Mitte.
  // o.innen = innere Lage gefuellter Blueten (sonst etwas heller als fuell).
  function flacheBlueten(g, A, o) {
    for (const bl of A.blueten) {
      astBluete(g, bl, (teil) => {
        if (teil === 'mitte') { if (o.mitte) { g.fillStyle = o.mitte; g.fill(); } return; }
        g.fillStyle = teil === 'knospe' ? o.knospe : teil === 'innen' ? (o.innen || o.fuell) : o.fuell;
        g.fill();
        if (o.rand) { g.strokeStyle = o.rand; g.lineWidth = o.randBreite || 1; g.stroke(); }
      });
    }
  }

  // Grosse Bluete (Abo): fuenf Blaetter oeffnen sich (o = 0..1), r = Radius.
  function grosseBluete(g, stil, x, y, o, r, dreh) {
    const st = stil.bluete;
    g.save(); g.translate(x, y); g.rotate(dreh);
    if (st.filter) g.filter = st.filter;
    const auf = 0.35 + 0.65 * o;
    for (let i = 0; i < 5; i++) {
      g.save(); g.rotate(i / 5 * TAU); g.translate(0, -r * 0.55 * auf);
      blattPfad(g, r * 1.05 * auf);
      g.fillStyle = st.aussen; g.fill();
      if (st.rand) { g.strokeStyle = st.rand; g.lineWidth = st.randBreite || 1; g.stroke(); }
      g.fillStyle = st.innen;
      g.beginPath(); g.ellipse(0, r * 0.12 * auf, r * 0.14 * auf, r * 0.3 * auf, 0, 0, TAU); g.fill();
      g.restore();
    }
    g.filter = 'none';
    // Staubgefaesse
    g.strokeStyle = st.staub; g.lineWidth = Math.max(0.8, r * 0.03);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU, l = r * 0.32 * o;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * l, Math.sin(a) * l); g.stroke();
      g.fillStyle = st.staub; g.beginPath(); g.arc(Math.cos(a) * l, Math.sin(a) * l, Math.max(1, r * 0.04), 0, TAU); g.fill();
    }
    g.fillStyle = st.mitte; g.beginPath(); g.arc(0, 0, r * 0.12, 0, TAU); g.fill();
    g.restore();
  }

  // Namens-Kaertchen (Abo/Raid) im Stil der Variante.
  function namensKarte(g, stil, x, y, zeilen) {
    const sch = stil.schrift;
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let breite = 0;
    zeilen.forEach((z, i) => {
      g.font = i === 0 ? sch.font : sch.fontKlein;
      const m = g.measureText(z);
      breite = Math.max(breite, (m && m.width) || z.length * 7);
    });
    breite += 20;
    const hoehe = zeilen.length * 18 + 10;
    g.beginPath();
    if (g.roundRect) g.roundRect(x - breite / 2, y, breite, hoehe, sch.radius); else g.rect(x - breite / 2, y, breite, hoehe);
    g.fillStyle = sch.kasten; g.fill();
    if (sch.schatten) { g.save(); g.globalCompositeOperation = 'destination-over'; g.fillStyle = sch.schatten; g.fillRect(x - breite / 2 + 4, y + 4, breite, hoehe); g.restore(); }
    if (sch.rand) { g.strokeStyle = sch.rand; g.lineWidth = sch.randBreite || 1; g.stroke(); }
    zeilen.forEach((z, i) => {
      g.fillStyle = i === 0 ? sch.farbe : sch.zweit;
      g.font = i === 0 ? sch.font : sch.fontKlein;
      g.fillText(z, x, y + 14 + i * 18);
    });
    g.restore();
  }

  const W = { TAU, rnd, leinwand, koernung, dichte, mitAlpha, stempel, blattPfad, bluetenPfad, baueAst, astLinien, grosseBluete, namensKarte };

  // =========================================================================
  const aquarell = {
    schrift: { font: '600 13px "Segoe Print", Candara, cursive', fontKlein: '11px Candara, sans-serif', farbe: '#a83e68', zweit: '#7a6870',
      kasten: 'rgba(255,248,250,.93)', rand: 'rgba(196,120,150,.45)', randBreite: 1, radius: 10 },
    bluete: { aussen: 'rgba(247,168,196,.9)', innen: 'rgba(255,240,245,.8)', rand: 'rgba(190,90,130,.3)', randBreite: 1, filter: 'blur(0.5px)',
      staub: 'rgba(200,70,110,.7)', mitte: '#f6d36a' },
    blattFarben: [null, '#f9bfd3', '#f39ab9', '#fcd3e1'],
    hintergrund(g, w, h, A) {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#fbeef2'); gr.addColorStop(0.6, '#f7f1ec'); gr.addColorStop(1, '#eef2ea');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const wolken = [['rgba(246,170,196,.18)', 0.75, 0.25], ['rgba(170,200,230,.16)', 0.2, 0.45], ['rgba(190,215,170,.18)', 0.6, 0.85], ['rgba(250,200,215,.15)', 0.3, 0.7]];
      const n = Math.max(3, Math.round(4 * Math.sqrt(dichte(w, h))));
      for (const o of wolken) {
        for (let k = 0; k < n; k++) {
          const x = w * o[1] + rnd(-0.15, 0.15) * w, y = h * o[2] + rnd(-0.1, 0.1) * h, r = Math.min(w, h) * rnd(0.2, 0.4);
          const rg = g.createRadialGradient(x, y, 0, x, y, r);
          rg.addColorStop(0, o[0]); rg.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = rg; g.fillRect(0, 0, w, h);
        }
      }
      g.fillStyle = 'rgba(160,190,170,.22)';
      g.beginPath(); g.moveTo(0, h * 0.72);
      for (let x = 0; x <= w + 20; x += 20) g.lineTo(x, h * 0.7 - Math.sin(x * 0.02) * 18 - Math.sin(x * 0.007) * 25);
      g.lineTo(w, h); g.lineTo(0, h); g.fill();
      g.globalAlpha = 0.35;
      for (let d = 0; d < 3; d++) astLinien(g, A.seg, 1, '#5a4048', 1.6);
      g.globalAlpha = 1;
      // Nasse Farbtupfer: Knospe klein und kraeftig, gefuellte gross mit zweitem Tupfer.
      const GROESSE = { knospe: 0.6, halb: 1.2, einfach: 1.6, yae: 1.9 };
      for (const bl of A.blueten) {
        const R = bl.r * GROESSE[bl.art], kn = bl.art === 'knospe';
        const rg = g.createRadialGradient(bl.x, bl.y, 0, bl.x, bl.y, R);
        rg.addColorStop(0, kn ? 'rgba(230,110,150,.9)' : 'rgba(255,240,245,.95)');
        rg.addColorStop(0.5, kn ? 'rgba(220,90,135,.6)' : 'rgba(247,160,192,.7)'); rg.addColorStop(1, 'rgba(247,160,192,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(bl.x, bl.y, R, 0, TAU); g.fill();
        if (bl.art === 'yae') {
          const x = bl.x + Math.cos(bl.a) * bl.r * 0.6, y = bl.y + Math.sin(bl.a) * bl.r * 0.6;
          const rg2 = g.createRadialGradient(x, y, 0, x, y, bl.r);
          rg2.addColorStop(0, 'rgba(250,190,212,.8)'); rg2.addColorStop(1, 'rgba(250,190,212,0)');
          g.fillStyle = rg2; g.beginPath(); g.arc(x, y, bl.r, 0, TAU); g.fill();
        }
        if (!kn) { g.fillStyle = 'rgba(200,70,110,.6)'; g.beginPath(); g.arc(bl.x, bl.y, 1.3, 0, TAU); g.fill(); }
      }
    },
    koernung: 14,
    blatt(g, p) {
      g.globalAlpha *= 0.85;
      formPfad(g, p); g.fillStyle = p.farbe; g.fill();
      if (istBluete(p)) { mitte(g, p, 'rgba(200,70,110,.75)'); return; }
      g.globalAlpha *= 0.5; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, p.s * 0.1, p.s * 0.16, p.s * 0.26, 0, 0, TAU); g.fill();
    }
  };

  // =========================================================================
  const lofi = {
    vonRechts: true,
    schrift: { font: '700 13px Bahnschrift, "Segoe UI", sans-serif', fontKlein: '11px Bahnschrift, sans-serif', farbe: '#ffc9e0', zweit: '#b7a8d8',
      kasten: 'rgba(24,22,54,.94)', rand: '#ff9ec8', randBreite: 1.5, radius: 12 },
    bluete: { aussen: '#ffc4dd', innen: '#fff0f6', rand: '#120f26', randBreite: 1.6, staub: '#ff6a9a', mitte: '#ffd27a' },
    blattFarben: [null, '#ffc9e0', '#ff9ec8', '#ffe0ee'],
    hintergrund(g, w, h, A, Wz, Z) {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#141436'); gr.addColorStop(0.55, '#2a2456'); gr.addColorStop(1, '#4a2f62');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      Z.sterne = [];
      for (let i = 0; i < 45 * dichte(w, h); i++) Z.sterne.push({ x: rnd(0, w), y: rnd(0, h * 0.6), r: rnd(0.5, 1.4), p: rnd(0, TAU) });
      const mx = w * 0.28, my = Math.max(90, h * 0.22);
      const hof = g.createRadialGradient(mx, my, 10, mx, my, 90);
      hof.addColorStop(0, 'rgba(255,240,210,.35)'); hof.addColorStop(1, 'rgba(255,240,210,0)');
      g.fillStyle = hof; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff3d8'; g.beginPath(); g.arc(mx, my, 24, 0, TAU); g.fill();
      g.fillStyle = 'rgba(230,210,180,.5)'; g.beginPath(); g.arc(mx - 7, my + 4, 5, 0, TAU); g.arc(mx + 8, my - 6, 3.5, 0, TAU); g.fill();
      g.fillStyle = '#1c1838';
      g.beginPath(); g.moveTo(0, h * 0.78);
      for (let x = 0; x <= w + 15; x += 15) g.lineTo(x, h * 0.76 - Math.sin(x * 0.015 + 1) * 22);
      g.lineTo(w, h); g.lineTo(0, h); g.fill();
      astLinien(g, A.seg, 1, '#3d2f63'); // heller als der Himmel, sonst schweben die Blueten
      g.shadowColor = 'rgba(255,170,210,.9)'; g.shadowBlur = 10;
      flacheBlueten(g, A, { fuell: '#ffc4dd', innen: '#ffe3ef', knospe: '#ff8ab8', mitte: '#ff6a9a' });
      g.shadowBlur = 0;
    },
    koernung: 8,
    unter(g, t, w, h, Wz, Z) {
      g.fillStyle = '#fff';
      for (const s of Z.sterne || []) {
        g.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.02 + s.p));
        g.fillRect(s.x, s.y, s.r, s.r);
      }
      g.globalAlpha = 1;
    },
    // Laternenschnur unter den Leisten, Laternen schaukeln.
    ueber(g, t, w, h) {
      const y0 = Math.min(h * 0.3, Math.max(64, h * 0.09)), durch = 26;
      g.strokeStyle = 'rgba(20,16,40,.9)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-5, y0); g.quadraticCurveTo(w / 2, y0 + durch * 2, w + 5, y0); g.stroke();
      const n = Math.max(3, Math.round(w / 70));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, x = u * w, y = y0 + 4 * durch * u * (1 - u) + 2;
        g.save(); g.translate(x, y); g.rotate(Math.sin(t * 0.04 + i * 1.3) * 0.12);
        const glow = g.createRadialGradient(0, 18, 2, 0, 18, 34);
        glow.addColorStop(0, 'rgba(255,170,90,.45)'); glow.addColorStop(1, 'rgba(255,170,90,0)');
        g.fillStyle = glow; g.fillRect(-34, -16, 68, 68);
        g.fillStyle = i % 2 ? '#ff6a5a' : '#ffb15a';
        g.beginPath(); g.ellipse(0, 18, 9, 12, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(120,30,30,.5)'; g.lineWidth = 0.8;
        g.beginPath(); g.ellipse(0, 18, 5, 12, 0, 0, TAU); g.stroke();
        g.beginPath(); g.moveTo(0, 6); g.lineTo(0, 30); g.stroke();
        g.fillStyle = '#2a1a1a'; g.fillRect(-4, 4, 8, 3); g.fillRect(-4, 29, 8, 3);
        g.restore();
      }
    },
    // Leuchten ohne shadowBlur (der kostet pro Blatt zu viel Rechenzeit).
    blatt(g, p) {
      const a = g.globalAlpha;
      g.globalAlpha = a * 0.22; g.beginPath(); g.arc(0, 0, p.s * 0.85, 0, TAU); g.fillStyle = '#ff9ec8'; g.fill();
      g.globalAlpha = a; formPfad(g, p); g.fillStyle = p.farbe; g.fill();
      mitte(g, p, '#ff6a9a');
    }
  };

  // =========================================================================
  const holzschnitt = {
    schrift: { font: '700 13px "Yu Mincho", "MS Mincho", Georgia, serif', fontKlein: '11px "Yu Mincho", Georgia, serif', farbe: '#9e2b1f', zweit: '#4a4036',
      kasten: '#efe3c8', rand: '#1c1a18', randBreite: 2, radius: 2 },
    bluete: { aussen: '#f5b8c6', innen: '#fbe0e6', rand: '#1c1a18', randBreite: 1.6, staub: '#1c1a18', mitte: '#c0392b' },
    blattFarben: [null, '#f7c2cf', '#ee8aa3'],
    hintergrund(g, w, h, A) {
      g.fillStyle = '#efe3c8'; g.fillRect(0, 0, w, h);
      // Bokashi: Himmel oben preussischblau, in Streifen heller.
      const bander = ['#2e4a6b', '#4d6a88', '#86a0b0', '#c9cfc0'], bh = Math.max(20, h * 0.055);
      bander.forEach((f, i) => { g.fillStyle = f; g.fillRect(0, i * bh, w, bh + 1); });
      const gr = g.createLinearGradient(0, bh * 4, 0, bh * 6.5);
      gr.addColorStop(0, '#c9cfc0'); gr.addColorStop(1, 'rgba(239,227,200,0)');
      g.fillStyle = gr; g.fillRect(0, bh * 4, w, bh * 2.5);
      // Fuji
      const fx = w * 0.62, fy = h * 0.45, fb = h * 0.8, H = fb - fy, halb = Math.min(w * 0.55, H * 1.05);
      g.fillStyle = '#5b7a96'; g.strokeStyle = '#1c1a18'; g.lineWidth = 2.5; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(fx - halb, fb); g.lineTo(fx - H * 0.13, fy); g.lineTo(fx + H * 0.13, fy); g.lineTo(fx + halb, fb); g.closePath(); g.fill(); g.stroke();
      const k = H / 164;
      g.fillStyle = '#f6f1e6';
      g.beginPath(); g.moveTo(fx - 22 * k, fy); g.lineTo(fx + 22 * k, fy); g.lineTo(fx + 52 * k, fy + 42 * k);
      g.lineTo(fx + 34 * k, fy + 36 * k); g.lineTo(fx + 20 * k, fy + 50 * k); g.lineTo(fx + 4 * k, fy + 38 * k); g.lineTo(fx - 12 * k, fy + 52 * k);
      g.lineTo(fx - 26 * k, fy + 36 * k); g.lineTo(fx - 52 * k, fy + 42 * k); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#9aa860'; g.beginPath(); g.moveTo(0, h * 0.8);
      g.quadraticCurveTo(w * 0.5, h * 0.74, w, h * 0.8); g.lineTo(w, h); g.lineTo(0, h); g.fill(); g.stroke();
      astLinien(g, A.seg, 1.25, '#1c1a18');
      astLinien(g, A.seg, 0.8, '#6b4a34');
      flacheBlueten(g, A, { fuell: '#f5b8c6', innen: '#fbdbe2', knospe: '#d24a6a', rand: '#1c1a18', randBreite: 1.1, mitte: '#c0392b' });
      if (w > 120) stempel(g, w - 40, bh * 4 + 16);
    },
    koernung: 18,
    blatt(g, p) {
      formPfad(g, p); g.fillStyle = p.farbe; g.fill();
      g.strokeStyle = '#1c1a18'; g.lineWidth = 1.1; g.stroke();
      mitte(g, p, '#c0392b');
    }
  };

  // =========================================================================
  const tusche = {
    schrift: { font: '600 13px "Yu Mincho", Georgia, serif', fontKlein: '11px Georgia, serif', farbe: '#b0302a', zweit: '#555',
      kasten: 'rgba(248,244,235,.93)', rand: 'rgba(30,30,30,.3)', randBreite: 1, radius: 3 },
    bluete: { aussen: 'rgba(232,130,160,.55)', innen: 'rgba(255,255,255,.35)', rand: 'rgba(30,30,30,.45)', randBreite: 0.9, filter: 'blur(0.6px)',
      staub: 'rgba(30,30,30,.75)', mitte: 'rgba(176,48,42,.85)' },
    blattFarben: [null, '#f6c3d2', '#e98fac'],
    hintergrund(g, w, h, A) {
      g.fillStyle = '#f4efe3'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 10 * dichte(w, h); i++) {
        const x = rnd(0, w), y = rnd(0, h), r = rnd(30, 110);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(60,60,60,' + rnd(0.02, 0.05) + ')'); gr.addColorStop(1, 'rgba(60,60,60,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      // Pinselstrich-Ast: Breite schwankt, trockene Raender.
      g.strokeStyle = '#1e1e1e'; g.lineCap = 'round';
      for (const s of A.seg) {
        for (let k = 0; k < 6; k++) {
          g.globalAlpha = rnd(0.15, 0.4);
          g.lineWidth = s.w * rnd(0.4, 1.1);
          g.beginPath(); g.moveTo(s.x1 + rnd(-1, 1), s.y1 + rnd(-1, 1)); g.lineTo(s.x2 + rnd(-1, 1), s.y2 + rnd(-1, 1)); g.stroke();
        }
      }
      g.globalAlpha = 1;
      // Tupfer pro Bluete: Knospe 1 (kraeftig), halb 3, einfach 5, gefuellt 5 + 5 innen.
      for (const bl of A.blueten) {
        const tupfer = [];
        if (bl.art === 'knospe') tupfer.push([0, 0, bl.r * 0.45, 'rgba(200,80,115,.7)']);
        else {
          const n = bl.art === 'halb' ? 3 : 5, bogen = bl.art === 'halb' ? 0.35 : 1;
          for (let j = 0; j < n; j++) tupfer.push([bl.a + (j / n - 0.5) * TAU * bogen, bl.r * 0.6, bl.r * 0.65, 'rgba(232,130,160,.55)']);
          if (bl.art === 'yae') for (let j = 0; j < 5; j++) tupfer.push([bl.a + (j + 0.5) / 5 * TAU, bl.r * 0.3, bl.r * 0.45, 'rgba(240,160,185,.5)']);
        }
        for (const [a, d, r, f] of tupfer) {
          const x = bl.x + Math.cos(a) * d, y = bl.y + Math.sin(a) * d;
          const rg = g.createRadialGradient(x, y, 0, x, y, r);
          rg.addColorStop(0, f); rg.addColorStop(0.8, f.replace(/[\d.]+\)$/, '.35)')); rg.addColorStop(1, 'rgba(232,130,160,0)');
          g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        }
        if (bl.art === 'knospe') continue;
        g.fillStyle = '#2a2a2a';
        for (let d = 0; d < 4; d++) { g.beginPath(); g.arc(bl.x + rnd(-2, 2), bl.y + rnd(-2, 2), 0.8, 0, TAU); g.fill(); }
      }
      // Schriftspalte + Siegel rechts
      if (w > 160) {
        const y = Math.max(120, h * 0.4);
        g.fillStyle = 'rgba(30,30,30,.82)'; g.font = '22px "Yu Mincho", "MS Mincho", serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        ['春', 'の', '桜'].forEach((z, i) => g.fillText(z, w - 28, y + i * 28));
        stempel(g, w - 41, y + 66, '桜', '#b8332b');
      }
    },
    koernung: 10,
    blatt(g, p) {
      g.globalAlpha *= 0.75;
      formPfad(g, p); g.fillStyle = p.farbe; g.fill();
      g.globalAlpha *= 0.65; g.strokeStyle = '#3a3a3a'; g.lineWidth = 0.5; g.stroke();
      mitte(g, p, '#2a2a2a');
    }
  };

  // =========================================================================
  const bleiglas = {
    schrift: { font: '600 13px "Palatino Linotype", Georgia, serif', fontKlein: '11px "Palatino Linotype", Georgia, serif', farbe: '#ffc0d8', zweit: '#b4b0d0',
      kasten: 'rgba(18,16,28,.94)', rand: '#0d0d12', randBreite: 3, radius: 8 },
    bluete: { aussen: '#ff9ec4', innen: '#ffd6e6', rand: '#0d0d12', randBreite: 2.4, staub: '#0d0d12', mitte: '#ffd54a' },
    blattFarben: [null, '#ffb3d0', '#ff6fa3'],
    hintergrund(g, w, h, A) {
      // Scherben: verwackeltes Gitter, jedes Viereck in zwei Dreiecke.
      const sp = Math.max(3, Math.round(w / 50)), ze = Math.max(4, Math.round(h / 47)), P = [];
      for (let r = 0; r <= ze; r++) {
        P[r] = [];
        for (let c = 0; c <= sp; c++) {
          const rand = r === 0 || r === ze || c === 0 || c === sp;
          P[r][c] = { x: c / sp * w + (rand ? 0 : rnd(-16, 16)), y: r / ze * h + (rand ? 0 : rnd(-16, 16)) };
        }
      }
      const himmel = ['#2c4a8a', '#3a5fa8', '#4f7bc0', '#5a6fb8', '#6c5fae', '#3c8fb0'];
      const gras = ['#2f7a4a', '#3d8f52', '#5aa05a'];
      g.lineJoin = 'round';
      function scherbe(a, b, c) {
        const my = (a.y + b.y + c.y) / 3, liste = my > h * 0.78 ? gras : himmel;
        g.fillStyle = liste[Math.floor(Math.random() * liste.length)];
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.closePath(); g.fill();
        g.strokeStyle = '#0d0d12'; g.lineWidth = 3; g.stroke();
      }
      for (let r = 0; r < ze; r++) for (let c = 0; c < sp; c++) {
        const a = P[r][c], b = P[r][c + 1], d = P[r + 1][c + 1], e = P[r + 1][c];
        if (Math.random() < 0.5) { scherbe(a, b, d); scherbe(a, d, e); } else { scherbe(a, b, e); scherbe(b, d, e); }
      }
      const hl = g.createLinearGradient(0, 0, w, h);
      hl.addColorStop(0, 'rgba(255,255,255,.12)'); hl.addColorStop(0.5, 'rgba(255,255,255,0)'); hl.addColorStop(1, 'rgba(255,255,255,.08)');
      g.fillStyle = hl; g.fillRect(0, 0, w, h);
      astLinien(g, A.seg, 1.6, '#0d0d12');
      astLinien(g, A.seg, 0.9, '#7a4a2a');
      g.strokeStyle = '#0d0d12'; g.lineWidth = 1.6;
      for (const bl of A.blueten) {
        astBluete(g, { ...bl, r: bl.r * 1.1 }, (teil) => {
          g.fillStyle = teil === 'mitte' ? '#ffd54a' : teil === 'knospe' ? '#e8508a' : teil === 'innen' ? '#ffe0ec'
            : (Math.random() < 0.5 ? '#ff9ec4' : '#ffc0d8');
          g.fill(); g.stroke();
        });
      }
    },
    ueber(g, t, w, h) {
      // Lichtschein wandert diagonal ueber das Fenster.
      const x = ((t * 1.2) % (w + 300)) - 150;
      g.save(); g.globalCompositeOperation = 'lighter';
      const gr = g.createLinearGradient(x - 80, 0, x + 80, h * 0.4);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,250,220,.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h); g.restore();
    },
    // Einzelblaetter sind Glassplitter, ganze Blueten Glasblueten mit Bleirand.
    blatt(g, p) {
      if (p.form === 'blatt' || !p.form) {
        g.beginPath(); g.moveTo(0, -p.s * 0.55); g.lineTo(p.s * 0.4, p.s * 0.1); g.lineTo(0, p.s * 0.5); g.lineTo(-p.s * 0.35, -p.s * 0.05); g.closePath();
      } else {
        formPfad(g, p);
      }
      g.fillStyle = p.farbe; g.fill(); g.strokeStyle = '#0d0d12'; g.lineWidth = 1.6; g.lineJoin = 'round'; g.stroke();
      mitte(g, p, '#ffd54a');
    }
  };

  // =========================================================================
  // Pixel: Hintergrund wird in Pixel-Groesse gebaut (w/h = Pixel), A bleibt in
  // Welt-Koordinaten. Blaetter sind Bloecke auf dem Pixelraster.
  const PX = 3;
  const pixel = {
    pixel: PX,
    schrift: { font: '700 13px Consolas, "Courier New", monospace', fontKlein: '11px Consolas, "Courier New", monospace', farbe: '#ff9cc7', zweit: '#c9a8d8',
      kasten: '#2b2140', rand: '#ff9cc7', randBreite: 3, radius: 0, schatten: '#120c1e' },
    bluete: { aussen: '#ff9cc7', innen: '#ffd6e8', rand: '#3a2238', randBreite: 3, staub: '#3a2238', mitte: '#ffd54a' },
    blattFarben: [null, '#ffc4de', '#ff74ad'],
    hintergrund(g, w, h, A) {
      const baender = ['#2b2a6e', '#3d3a8a', '#5a4aa0', '#7a5aae', '#a86ab4', '#d88ab8', '#f4b0c0'];
      const bh = Math.ceil(h * 0.75 / baender.length);
      baender.forEach((f, i) => {
        g.fillStyle = f; g.fillRect(0, i * bh, w, bh);
        if (i < baender.length - 1) {
          g.fillStyle = baender[i + 1];
          for (let x = i % 2; x < w; x += 2) g.fillRect(x, (i + 1) * bh - 1, 1, 1);
          for (let x = 1 - (i % 2); x < w; x += 4) g.fillRect(x, (i + 1) * bh - 2, 1, 1);
        }
      });
      g.fillStyle = '#f4b0c0'; g.fillRect(0, bh * baender.length, w, h);
      g.fillStyle = '#fff';
      for (let s = 0; s < 18 * dichte(w * PX, h * PX); s++) g.fillRect(Math.floor(rnd(0, w)), Math.floor(rnd(0, h * 0.3)), 1, 1);
      const mx = Math.floor(w * 0.7), my = Math.max(22, Math.floor(h * 0.08));
      g.fillStyle = '#fff3c8'; g.fillRect(mx, my, 7, 7); g.fillRect(mx - 1, my + 1, 9, 5);
      g.fillStyle = '#3a6a4a';
      for (let x = 0; x < w; x++) { const hy = Math.floor(h * 0.78 - Math.sin(x * 0.05) * 6 - Math.sin(x * 0.017) * 8); g.fillRect(x, hy, 1, h - hy); }
      g.fillStyle = '#2a5038';
      for (let x = 0; x < w; x++) { const hy = Math.floor(h * 0.86 - Math.sin(x * 0.07 + 2) * 4); g.fillRect(x, hy, 1, h - hy); }
      g.fillStyle = '#3a2238';
      for (const sg of A.seg) {
        const n = Math.ceil(Math.hypot(sg.x2 - sg.x1, sg.y2 - sg.y1) / PX), bw = Math.max(1, Math.round(sg.w / PX));
        for (let j = 0; j <= n; j++) {
          const px = Math.round((sg.x1 + (sg.x2 - sg.x1) * j / n) / PX), py = Math.round((sg.y1 + (sg.y2 - sg.y1) * j / n) / PX);
          g.fillRect(px - Math.floor(bw / 2), py - Math.floor(bw / 2), bw, bw);
        }
      }
      for (const bl of A.blueten) {
        const cx = Math.round(bl.x / PX), cy = Math.round(bl.y / PX);
        if (bl.art === 'knospe') { g.fillStyle = '#d0407a'; g.fillRect(cx, cy - 1, 2, 2); continue; }
        if (bl.art === 'halb') {
          g.fillStyle = '#ff9cc7'; g.fillRect(cx - 1, cy - 2, 3, 3);
          g.fillStyle = '#d0407a'; g.fillRect(cx, cy, 1, 1);
          continue;
        }
        const yae = bl.art === 'yae';
        g.fillStyle = yae ? '#ffb3d4' : '#ff9cc7';
        g.fillRect(cx - 2, cy - 1, 5, 3); g.fillRect(cx - 1, cy - 2, 3, 5);
        if (yae) { g.fillRect(cx - 3, cy, 7, 1); g.fillRect(cx, cy - 3, 1, 7); g.fillStyle = '#ff74ad'; g.fillRect(cx - 1, cy - 1, 3, 3); }
        g.fillStyle = '#ffd6e8'; g.fillRect(cx - 1, cy - 1, 1, 1);
        g.fillStyle = yae ? '#ffd54a' : '#d0407a'; g.fillRect(cx, cy, 1, 1);
      }
    },
    // Ohne Drehung, direkt in Welt-Koordinaten, Bloecke auf dem Raster:
    // Blatt = 2x2 + Glanz, Paar = zwei schraeg, Bluete = Kreuz, Yae = grosses Kreuz.
    blattPixel(g, p) {
      const P = PX * Math.max(1, Math.round(p.s / 9)), x = Math.round(p.x / P) * P, y = Math.round(p.y / P) * P;
      const flach = Math.abs(Math.cos(p.flip)) < 0.4;
      g.fillStyle = p.farbe;
      if (istBluete(p)) {
        const n = p.form === 'yae' ? 2 : 1;
        g.fillRect(x - P * n, y, P * (2 * n + 1), P); g.fillRect(x, y - P * n, P, P * (2 * n + 1));
        if (n === 2) g.fillRect(x - P, y - P, P * 3, P * 3);
        g.fillStyle = '#ffd54a'; g.fillRect(x, y, P, P);
        return;
      }
      if (p.form === 'paar') { g.fillRect(x, y, P * 2, P); g.fillRect(x + P, y + P, P * 2, P); return; }
      g.fillRect(x, y, P * 2, flach ? P : P * 2);
      if (!flach) { g.fillStyle = '#fff0f6'; g.fillRect(x, y, P, P); }
    }
  };

  // =========================================================================
  const fluss = {
    fluss: true,
    schrift: { font: '600 13px "Segoe Print", Candara, cursive', fontKlein: '11px Candara, sans-serif', farbe: '#c4507e', zweit: '#4a6a72',
      kasten: 'rgba(244,250,250,.93)', rand: 'rgba(47,122,138,.4)', randBreite: 1, radius: 12 },
    bluete: { aussen: '#fbc3d6', innen: '#fff2f6', rand: 'rgba(160,70,100,.35)', randBreite: 1, staub: '#d0507e', mitte: '#f6d36a' },
    blattFarben: [null, '#fbc6d8', '#f392b5', '#ffe0ea'],
    hintergrund(g, w, h, A, Wz, Z) {
      const fy = Z.flussY = h * 0.42;
      const gr = g.createLinearGradient(0, 0, 0, fy);
      gr.addColorStop(0, '#fdeef3'); gr.addColorStop(1, '#f4f1ef');
      g.fillStyle = gr; g.fillRect(0, 0, w, fy);
      // anderes Ufer mit Baumreihe
      g.fillStyle = '#9cbf8a'; g.fillRect(0, fy - 16, w, 18);
      const n = Math.max(8, Math.round(w / 12));
      for (let i = 0; i <= n; i++) {
        const x = i / n * w + rnd(-6, 6), r = rnd(16, 26), y = fy - 24 - rnd(0, 10);
        g.fillStyle = '#7a5a5a'; g.fillRect(x - 1.5, y, 3, fy - y - 4);
        const rg = g.createRadialGradient(x - r * 0.3, y - r * 0.4, 2, x, y, r);
        rg.addColorStop(0, '#ffe6ef'); rg.addColorStop(0.6, '#f9b9cf'); rg.addColorStop(1, 'rgba(240,160,190,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(x, y - 4, r, 0, TAU); g.fill();
      }
      const wg = g.createLinearGradient(0, fy, 0, h);
      wg.addColorStop(0, '#9cc9cf'); wg.addColorStop(0.5, '#6ea9b6'); wg.addColorStop(1, '#4d8a9c');
      g.fillStyle = wg; g.fillRect(0, fy, w, h - fy);
      const sp = g.createLinearGradient(0, fy, 0, fy + 50);
      sp.addColorStop(0, 'rgba(250,185,205,.45)'); sp.addColorStop(1, 'rgba(250,185,205,0)');
      g.fillStyle = sp; g.fillRect(0, fy, w, 50);
      g.fillStyle = '#c7b9a3'; g.fillRect(0, fy, w, 2);
      astLinien(g, A.seg, 1, '#4a3238');
      flacheBlueten(g, A, { fuell: '#fbc3d6', innen: '#ffe4ec', knospe: '#e8608e', mitte: '#d0507e' });
      Z.linien = [];
      for (let l = 0; l < 18 * Math.sqrt(dichte(w, h)); l++) Z.linien.push({ y: rnd(fy + 8, h), off: rnd(0, w + 80), len: rnd(18, 40), v: rnd(0.6, 1.1) });
    },
    koernung: 8,
    // Stroemung: helle Striche ziehen nach rechts.
    unter(g, t, w, h, Wz, Z) {
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.2; g.lineCap = 'round';
      for (const l of Z.linien || []) {
        const x = ((l.off + t * l.v) % (w + 80)) - 40;
        g.beginPath(); g.moveTo(x, l.y); g.quadraticCurveTo(x + l.len / 2, l.y - 2, x + l.len, l.y); g.stroke();
      }
    },
    blatt(g, p) {
      if (p.schwimmt) { g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(0, 0, p.s * 0.9, p.s * 0.7, 0, 0, TAU); g.fill(); }
      formPfad(g, p); g.fillStyle = p.farbe; g.fill();
      if (istBluete(p)) { mitte(g, p, '#d0507e'); return; }
      g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(0, p.s * 0.1, p.s * 0.12, p.s * 0.24, 0, 0, TAU); g.fill();
    }
  };

  // =========================================================================
  // Shoji: man sieht nur den Schatten des Zweigs (wiegt sich) und die
  // Schatten der fallenden Blaetter; das Holzgitter liegt ueber allem.
  const shoji = {
    vonRechts: true,
    schrift: { font: '600 13px "Yu Mincho", Georgia, serif', fontKlein: '11px Georgia, serif', farbe: '#a8433a', zweit: '#5a4632',
      kasten: 'rgba(250,243,228,.95)', rand: '#6b4e33', randBreite: 2, radius: 2 },
    bluete: { aussen: 'rgba(70,45,55,.38)', innen: 'rgba(70,45,55,.12)', filter: 'blur(1.5px)', staub: 'rgba(60,40,45,.45)', mitte: 'rgba(60,40,45,.5)' },
    blattFarben: [null],
    hintergrund(g, w, h, A, Wz, Z) {
      g.fillStyle = '#f1e2c6'; g.fillRect(0, 0, w, h);
      const rg = g.createRadialGradient(w * 0.65, h * 0.3, 10, w * 0.65, h * 0.3, Math.max(w, h) * 0.8);
      rg.addColorStop(0, 'rgba(255,248,226,.95)'); rg.addColorStop(1, 'rgba(255,248,226,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(180,150,110,.12)'; g.lineWidth = 0.6;
      for (let f = 0; f < 120 * dichte(w, h); f++) {
        const fx = rnd(0, w), fy = rnd(0, h), fa = rnd(0, TAU), fl = rnd(4, 14);
        g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl); g.stroke();
      }
      // Schatten des Zweigs, weich (eigene Leinwand, wird pro Bild leicht gedreht)
      const d = Z.dpr || 1;
      const sc = leinwand(w * d, h * d), sg = sc.getContext('2d');
      sg.setTransform(d, 0, 0, d, 0, 0);
      sg.filter = 'blur(2.5px)';
      astLinien(sg, A.seg, 1.1, '#3a2830');
      sg.fillStyle = '#3a2830';
      for (const bl of A.blueten) astBluete(sg, { ...bl, r: bl.r * 1.1 }, (teil) => { if (teil !== 'mitte') sg.fill(); });
      Z.schatten = sc;
      Z.dreh = { x: w + 10, y: Math.min(h * 0.35, Math.max(56, h * 0.1)) };
      // Holzgitter
      const gc = leinwand(w * d, h * d), gg = gc.getContext('2d');
      gg.setTransform(d, 0, 0, d, 0, 0);
      function leiste(x, y, lw, lh) {
        gg.fillStyle = '#7a5a3c'; gg.fillRect(x, y, lw, lh);
        gg.fillStyle = 'rgba(255,230,190,.35)'; if (lw > lh) gg.fillRect(x, y, lw, 1); else gg.fillRect(x, y, 1, lh);
        gg.fillStyle = 'rgba(40,25,10,.35)'; if (lw > lh) gg.fillRect(x, y + lh - 1, lw, 1); else gg.fillRect(x + lw - 1, y, 1, lh);
      }
      const sp = Math.max(2, Math.round(w / 110)), ze = Math.max(3, Math.round(h / 100));
      for (let c = 1; c < sp; c++) leiste(c * w / sp - 1.5, 0, 3, h);
      for (let r = 1; r < ze; r++) leiste(0, r * h / ze - 1.5, w, 3);
      gg.fillStyle = '#5a3f28'; gg.fillRect(0, 0, w, 8); gg.fillRect(0, h - 8, w, 8); gg.fillRect(0, 0, 8, h); gg.fillRect(w - 8, 0, 8, h);
      gg.fillStyle = '#3c2a1a'; gg.beginPath(); gg.ellipse(18, h * 0.5, 4, 14, 0, 0, TAU); gg.fill();
      Z.gitter = gc;
    },
    koernung: 9,
    unter(g, t, w, h, Wz, Z) {
      if (!Z.schatten) return;
      const dr = Z.dreh, sw = Math.sin(t * 0.012) * 0.03 + Math.sin(t * 0.031) * 0.008;
      g.save(); g.translate(dr.x, dr.y); g.rotate(sw); g.translate(-dr.x, -dr.y);
      g.globalAlpha = 0.34; g.drawImage(Z.schatten, 0, 0, w, h);
      g.restore();
    },
    ueber(g, t, w, h, Wz, Z) { if (Z.gitter) g.drawImage(Z.gitter, 0, 0, w, h); },
    blatt(g, p) { g.globalAlpha *= 0.3; formPfad(g, p); g.fillStyle = p.farbe; g.fill(); }
  };

  const ziel = typeof window !== 'undefined' ? window : globalThis;
  ziel.SakuraStile = { werkzeug: W, stile: { aquarell, lofi, holzschnitt, tusche, bleiglas, pixel, fluss, shoji } };
})();
