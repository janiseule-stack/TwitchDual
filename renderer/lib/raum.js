// Raum als Home (Cozy-Raum, Etappe 2): reine Geometrie ohne DOM.
// Alle Masse sind Bildpixel des 344x192-Hintergrunds (am Bild gemessen 10.11.2026).
// UMD wie szene.js: laeuft im Browser und unter Node (Tests).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Raum = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const BILD = Object.freeze({ breite: 344, hoehe: 192 });

  // Reihenfolge = Vorrang bei Ueberlappung (erste Treffer-Flaeche gewinnt).
  const FLAECHEN = Object.freeze([
    Object.freeze({ id: 'plattenspieler', name: 'Plattenspieler', x: 262, y: 86, b: 46, h: 42 }),
    Object.freeze({ id: 'fernseher', name: 'Fernseher', x: 198, y: 38, b: 70, h: 70 }),
    Object.freeze({ id: 'bild', name: 'Konto', x: 282, y: 36, b: 32, h: 54 }),
    Object.freeze({ id: 'lampe', name: 'Licht', x: 165, y: 6, b: 31, h: 104 }),
    Object.freeze({ id: 'regal', name: 'Platten', x: 90, y: 13, b: 69, h: 113 }),
  ]);

  const HUELLE = Object.freeze({ kante: 40, abstand: 4 });

  // Schraege Bildschirmflaeche: oben links, oben rechts, unten rechts, unten links.
  const TV_ECKEN = Object.freeze([
    Object.freeze({ x: 207, y: 52 }),
    Object.freeze({ x: 231, y: 63 }),
    Object.freeze({ x: 233, y: 90 }),
    Object.freeze({ x: 207, y: 78 }),
  ]);

  // Rechteck um den Bildschirm: Ziel der Kamera beim Auflegen.
  const TV_RECHTECK = Object.freeze({ x: 206, y: 52, b: 27, h: 38 });

  // Laufschrift mit dem Kanalnamen vorne auf dem Plattenspieler (Janis 13.11.): dunkle
  // schraege Front des Geraets unter dem Teller, am Bild ausgemessen (oben links,
  // oben rechts, unten links). Feld b x h, per matrix(a, b, c, d, e, f) auf die Front gelegt.
  const LAUF_ECKEN = Object.freeze([
    Object.freeze({ x: 264, y: 114 }),
    Object.freeze({ x: 282, y: 122 }),
    Object.freeze({ x: 264, y: 118 }),
  ]);
  const LAUF_FELD = Object.freeze({ b: 18, h: 4 });
  function laufMatrix() {
    const [p0, p1, p3] = LAUF_ECKEN;
    const F = LAUF_FELD;
    return [(p1.x - p0.x) / F.b, (p1.y - p0.y) / F.b, (p3.x - p0.x) / F.h, (p3.y - p0.y) / F.h, p0.x, p0.y];
  }

  const TELLER = Object.freeze({ x: 284, y: 113 });

  const zahl = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0);

  // Hover-Bilder: Ursprung (Klickflaeche - 4) und Groesse in Bildpixeln.
  const HOVER = Object.freeze({
    regal: Object.freeze({ x: 86, y: 9, b: 77, h: 121 }), // = tools/raum-quellen/regal.json hover
    lampe: Object.freeze({ x: 161, y: 2, b: 39, h: 112 }),
    fernseher: Object.freeze({ x: 194, y: 34, b: 78, h: 78 }),
    plattenspieler: Object.freeze({ x: 258, y: 82, b: 54, h: 50 }),
    bild: Object.freeze({ x: 278, y: 32, b: 40, h: 62 }),
  });

  const PLATTENSPIELER_RECHTECK = Object.freeze({ x: 262, y: 86, b: 46, h: 42 });

  // Gegenstaende (x 100-314) und ihre Mitte: zu schmale Fenster zentrieren darauf.
  const GEGENSTAENDE = Object.freeze({ von: 100, bis: 314 });
  const MITTE_X = 207;
  // Raum ohne den dunklen Rand des PixelLab-Bildes (links/rechts je 12 px schwarz,
  // gemessen 11.11.2026); nur dieser Teil wird je gezeigt (Janis 11.11.: Variante A).
  const RAHMEN = Object.freeze({ x: 12, b: 320 });
  // Raum-Ansicht: der Raum steht vor der PixelLab-Holzwand raum-wand.png (504 breit,
  // Raum bei x=80), damit auch breite Fenster die ganze Hoehe zeigen (Janis 11.11.: C).
  const RAUM_RAHMEN = Object.freeze({ x: -80, b: 504 });

  // Regal-Ansicht: Regal vor der PixelLab-Holzwand regal-wand.png (504 breit, Regal bei
  // x=80). von/bis/mitte = regal.json bereich.
  const REGAL_RAHMEN = Object.freeze({ x: -80, b: 504, von: 100, bis: 300, mitte: 200, ganz: true });

  // Regal neu (Bildpixel des 344x192-Bilds regal.png), 1:1 aus tools/raum-quellen/regal.json
  // (Test: REGAL gleich regal.json). Schluessel mit _ in der Datei sind Kommentare.
  const rechteck = (x, y, b, h) => Object.freeze({ x, y, b, h });
  const rand = (o, r, u, l) => Object.freeze({ oben: o, rechts: r, unten: u, links: l });
  const REGAL = Object.freeze({
    brett: rechteck(144, 14, 130, 47),
    faecher: Object.freeze({ live: rechteck(115, 76, 172, 44), unten: rechteck(115, 133, 172, 47) }),
    such: rechteck(140, 0, 120, 18),
    ruecken: Object.freeze({ b: 6, h: 40, abstand: 0, fenster: rechteck(0, 2, 5, 5), name: rechteck(0, 8, 5, 26) }),
    livePunkt: Object.freeze({
      cover: Object.freeze({ x: 33, y: 3, d: 4 }),
      ruecken: Object.freeze({ x: 1, y: 35, d: 3 }),
    }),
    karteRand: rand(10, 10, 10, 10),
    rueckRand: rand(10, 10, 10, 10),
  });

  const MIN_BREITE = 688;
  const MIN_HOEHE = 384;

  // Klemmt so, dass kein Rand entsteht: bild*faktor deckt das Fenster, Wert in [fenster - gesamt, 0].
  function klemme(ideal, fenster, gesamt) {
    const untergrenze = Math.ceil(fenster - gesamt - 1e-9);
    return Math.min(0, Math.max(untergrenze, Math.round(ideal))) + 0;
  }
  function zwischen(wert, min, max) { return Math.min(max, Math.max(min, wert)); }

  // Regal-Leinwand: Regal-Bild (344x192) plus Wand seitlich und PixelLab-Streifen oben/unten.
  const REGAL_LEINWAND = Object.freeze({ x: -80, y: -64, b: 504, h: 320 });

  // Ein Achsen-Ursprung: Sichtbarer Ausschnitt s Bildpixel, Mitte m, Leinwand [min, min+gesamt],
  // Muss-Bereich von..bis bleibt sichtbar. Ist s > gesamt, wird die Leinwand zentriert (Rand).
  function achseRegal(s, m, min, gesamt, von, bis) {
    if (s > gesamt) return min - (s - gesamt) / 2;
    let l = zwischen(m - s / 2, min, min + gesamt - s);
    l = zwischen(l, bis - s, von);
    return l;
  }

  // Fuellt das Fenster mit der Regal-Leinwand, zeigt aber immer das ganze Regal.
  function skalierungRegal(fensterBreite, fensterHoehe) {
    const b = zahl(fensterBreite);
    const h = zahl(fensterHoehe);
    if (!b || !h) return { faktor: 1, links: 0, oben: 0 };
    const L = REGAL_LEINWAND;
    const rr = REGAL_RAHMEN;
    let faktor = Math.max(b / L.b, h / L.h);
    faktor = Math.min(faktor, b / (rr.bis - rr.von), h / BILD.hoehe);
    const l = achseRegal(b / faktor, rr.mitte, L.x, L.b, rr.von, rr.bis);
    const t = achseRegal(h / faktor, BILD.hoehe / 2, L.y, L.h, 0, BILD.hoehe);
    return { faktor, links: Math.round(-l * faktor) + 0, oben: Math.round(-t * faktor) + 0 };
  }

  // Deckender Faktor (nicht ganzzahlig): der Raum ohne dunklen Rand (RAHMEN, volle
  // Hoehe) fuellt das Fenster, Ueberstand wird abgeschnitten. Waagerecht mittig auf
  // den Raum; passen alle Gegenstaende ins Fenster, so wenig verschoben, dass sie
  // ganz sichtbar bleiben; sonst mittig auf die Gegenstaende. Nie ueber den Rahmen.
  function skalierung(fensterBreite, fensterHoehe, rahmen) {
    const b = zahl(fensterBreite);
    const h = zahl(fensterHoehe);
    if (!b || !h) return { faktor: 1, links: 0, oben: 0 };
    const rah = rahmen || RAHMEN;
    const von = rah.von ?? GEGENSTAENDE.von;
    const bis = rah.bis ?? GEGENSTAENDE.bis;
    const mitte = rah.mitte ?? MITTE_X;
    let faktor = Math.max(b / rah.b, h / BILD.hoehe);
    let sichtbar = b / faktor; // Bildpixel waagerecht, hoechstens rah.b
    const raumRechts = rah.x + rah.b;
    let l = rah.x + rah.b / 2 - sichtbar / 2;
    if (sichtbar >= bis - von) l = zwischen(l, bis - sichtbar, von);
    else l = mitte - sichtbar / 2;
    if (rah.ganz === true && sichtbar < bis - von) {
      // Zu schmal: verkleinern, bis von..bis ganz passt; Bild senkrecht mittig (oben darf > 0 sein).
      faktor = b / (bis - von);
      sichtbar = bis - von;
      l = von;
      const min = Math.ceil(b - raumRechts * faktor - 1e-9);
      const max = Math.floor(-rah.x * faktor + 1e-9);
      return {
        faktor,
        links: Math.min(max, Math.max(min, Math.round(-l * faktor))) + 0,
        oben: Math.round((h - BILD.hoehe * faktor) / 2) + 0,
      };
    }
    // In ganzen Bildschirm-Pixeln innerhalb des Rahmens (bei genau passender Breite
    // gewinnt der linke Rand: hoechstens ein Bildschirm-Pixel Umriss rechts).
    const min = Math.ceil(b - raumRechts * faktor - 1e-9);
    const max = Math.floor(-rah.x * faktor + 1e-9);
    const links = Math.min(max, Math.max(min, Math.round(-l * faktor))) + 0;
    return {
      faktor,
      links,
      oben: klemme(h / 2 - (BILD.hoehe / 2) * faktor, h, BILD.hoehe * faktor),
    };
  }

  function passtAlsRaum(fensterBreite, fensterHoehe) {
    return zahl(fensterBreite) >= MIN_BREITE && zahl(fensterHoehe) >= MIN_HOEHE;
  }

  // Halboffen: [x, x+b) mal [y, y+h).
  function treffer(bildX, bildY) {
    for (const f of FLAECHEN) {
      if (bildX >= f.x && bildX < f.x + f.b && bildY >= f.y && bildY < f.y + f.h) return f.id;
    }
    return null;
  }

  function zuBild(fensterX, fensterY, skal) {
    return {
      x: Math.floor((fensterX - skal.links) / skal.faktor),
      y: Math.floor((fensterY - skal.oben) / skal.faktor),
    };
  }

  // --- Auflegen (Plan 2026-11-13-auflegen-neu): Kamera-Lagen der Raum-Bildebene ---
  // Lage = { faktor, x, y } wie translate(x px, y px) scale(faktor), Ursprung 0 0.
  // Eine CSS-Transition zwischen zwei Lagen haelt deren Fixpunkt (fixpunkt) fest; die
  // Ziel-Lagen sind so gewaehlt, dass er im Gegenstand liegt: es wird gezoomt, nicht geschoben.
  const SPIELER_ANTEIL = 0.5; // Plattenspieler-Hoehe als Anteil der Fensterhoehe

  function lageRuhe(fensterBreite, fensterHoehe) {
    const s = skalierung(fensterBreite, fensterHoehe, RAUM_RAHMEN);
    return { faktor: s.faktor, x: s.links, y: s.oben };
  }

  // Zulaessiger Bereich fuer die Verschiebung einer Achse bei Faktor f: der Gegenstand
  // (von..bis in Bildpixeln) ganz im Fenster (0..n), der sichtbare Ausschnitt im Bild (min..max).
  function spanne(f, n, von, bis, min, max) {
    return { lo: Math.max(-von * f, n - max * f), hi: Math.min(n - bis * f, -min * f) };
  }

  // Sanft zum Plattenspieler: Zoom um seine Mitte (sie bleibt stehen), so wenig wie
  // noetig verschoben, damit er ganz im Fenster und der Ausschnitt im Bild bleibt.
  // Passt das nicht oder laege der Fixpunkt der Fahrt dadurch ausserhalb des
  // Plattenspielers (schmale Fenster: er steht am rechten Rand), kleinerer Faktor
  // (nie unter der Ruhelage).
  function lageSpieler(fensterBreite, fensterHoehe) {
    const w = zahl(fensterBreite), h = zahl(fensterHoehe);
    const ruhe = lageRuhe(w, h);
    const P = PLATTENSPIELER_RECHTECK;
    const mx = P.x + P.b / 2, my = P.y + P.h / 2;
    const cx = ruhe.x + mx * ruhe.faktor, cy = ruhe.y + my * ruhe.faktor;
    const klemme2 = (v, s) => Math.min(s.hi, Math.max(s.lo, v));
    // Plattenspieler in Ruhelage am Bildschirm (der Fixpunkt muss darin liegen). Ragt er
    // schon in Ruhe aus dem Fenster (hochkante Fenster, Janis 13.11.: „niemand hat das
    // hochkant“), darf die Fahrt schieben: nur „ganz im Fenster“ zaehlt.
    const r = { x: ruhe.x + P.x * ruhe.faktor, y: ruhe.y + P.y * ruhe.faktor, b: P.b * ruhe.faktor, h: P.h * ruhe.faktor };
    const sichtbar = r.x >= -1 && r.y >= -1 && r.x + r.b <= w + 1 && r.y + r.h <= h + 1;
    let f = Math.max(ruhe.faktor, (SPIELER_ANTEIL * h) / P.h);
    for (;;) {
      const sx = spanne(f, w, P.x, P.x + P.b, RAUM_RAHMEN.x, RAUM_RAHMEN.x + RAUM_RAHMEN.b);
      const sy = spanne(f, h, P.y, P.y + P.h, 0, BILD.hoehe);
      if (sx.lo <= sx.hi && sy.lo <= sy.hi) {
        const lage = { faktor: f, x: klemme2(cx - mx * f, sx), y: klemme2(cy - my * f, sy) };
        const F = fixpunkt(ruhe, lage);
        if (!sichtbar || (F && F.x >= r.x && F.x <= r.x + r.b && F.y >= r.y && F.y <= r.y + r.h)) return lage;
      }
      if (f <= ruhe.faktor) return ruhe;
      f = Math.max(ruhe.faktor, f * 0.98);
    }
  }

  // In den Fernseher: der Bildschirm deckt das Fenster (Faktor nicht gerundet), mittig.
  function lageTv(fensterBreite, fensterHoehe) {
    const w = zahl(fensterBreite), h = zahl(fensterHoehe);
    const T = TV_RECHTECK;
    const faktor = Math.max(w / T.b, h / T.h);
    return { faktor, x: w / 2 - (T.x + T.b / 2) * faktor, y: h / 2 - (T.y + T.h / 2) * faktor };
  }

  // Bildschirmpunkt, der bei der Fahrt von Lage a nach Lage b stehen bleibt (null bei
  // gleichem Faktor: reine Verschiebung).
  function fixpunkt(a, b) {
    const d = a.faktor - b.faktor;
    if (Math.abs(d) < 1e-12) return null;
    const px = (b.x - a.x) / d, py = (b.y - a.y) / d;
    return { x: a.faktor * px + a.x, y: a.faktor * py + a.y };
  }

  // Wechsel Raum <-> Regal, zwei Arten zum Vergleichen (Janis 13.11.): nichts darf
  // seitlich wandern.
  // Zoom an Ort und Stelle: Die Raum-Ebene vergroessert sich um ZOOM_ORT.raum um die
  // Mitte des Raum-Regals (der Punkt bleibt stehen), das Nahbild kommt am Ende aus
  // ZOOM_ORT.nah um die Fenstermitte auf volle Groesse. Je translate(dx, dy) scale(s),
  // Ursprung 0 0.
  const ZOOM_ORT = { raum: 2.5, nah: 0.9 };
  function zoomUm(px, py, s) { return { s, dx: px * (1 - s), dy: py * (1 - s) }; }
  function zoomAmOrt(fensterBreite, fensterHoehe) {
    const b = zahl(fensterBreite), h = zahl(fensterHoehe);
    const raum = skalierung(b, h, RAUM_RAHMEN);
    const H = HOVER.regal;
    return {
      raum: zoomUm(raum.links + (H.x + H.b / 2) * raum.faktor, raum.oben + (H.y + H.h / 2) * raum.faktor, ZOOM_ORT.raum),
      nah: zoomUm(b / 2, h / 2, ZOOM_ORT.nah),
    };
  }

  // Pixel-Blende: Kantenlaengen der Pixel-Stufen in Bildschirm-Pixeln, 1, 2, 4 und 8
  // Raum-Pixel gross (mindestens 2 px, aufsteigend).
  function pixelStufen(faktor) {
    const f = zahl(faktor) || 1;
    return [1, 2, 4, 8].map((n) => Math.max(2, Math.round(n * f)));
  }

  // Wie viele Huellen passen ins Fach, und kleinster Verschub von start, der die gewaehlte zeigt.
  // teil = { kante, abstand } eines Teils im Fach (Standard: Huelle).
  function fachFenster(anzahl, gewaehltIndex, fachBreite, start, teil = HUELLE) {
    const n = Math.max(0, Math.floor(zahl(anzahl)));
    const sichtbar = Math.max(1, Math.floor((zahl(fachBreite) + teil.abstand) / (teil.kante + teil.abstand)));
    const grenze = Math.max(0, n - sichtbar);
    let s = Math.floor(zahl(start));
    if (typeof gewaehltIndex === 'number' && gewaehltIndex >= 0 && n > 0) {
      const i = Math.min(Math.floor(gewaehltIndex), n - 1);
      if (i < s) s = i;
      else if (i >= s + sichtbar) s = i - sichtbar + 1;
    }
    return { start: Math.min(grenze, Math.max(0, s)), sichtbar };
  }

  // Pixel-Schrift (Raum Klar, Raster 12 px): Groesse immer ein Vielfaches von 12,
  // passend zum Faktor (basis 4: 12 x round(f / 3), mindestens 12).
  function schriftPx(faktor, basis) {
    const b = zahl(basis) || 4;
    return 12 * Math.max(1, Math.round((zahl(faktor) * b) / 12));
  }

  // Schrift des Ruecken-Namens: groesstes Vielfaches von 12 px, das in die Namensspalte
  // (REGAL.ruecken.name.b Bildpixel x Faktor) passt, mindestens 12.
  function rueckenSchrift(faktor) {
    const spalte = zahl(faktor) * REGAL.ruecken.name.b;
    return 12 * Math.max(1, Math.floor(spalte / 12));
  }

  // Rahmenbreite in ganzen Bildschirm-Pixeln (Bildpixel x Faktor, mindestens 1).
  function randPx(faktor, bildPixel) {
    return Math.max(1, Math.round(zahl(faktor) * zahl(bildPixel)));
  }

  // Maße der vergrößerten Plattenkarte (zwei Hüllen breit): n = Vielfaches von 128 Bildpixeln.
  function kartenMasse(fensterBreite, fensterHoehe) {
    const b = zahl(fensterBreite);
    const h = zahl(fensterHoehe);
    const n = Math.max(1, Math.min(Math.floor((0.7 * h) / 128), Math.floor((b - 96) / 256)));
    const kante = 128 * n;
    const breite = 2 * kante;
    const clamp = (w, lo, hi) => Math.min(hi, Math.max(lo, w));
    return {
      n,
      kante,
      breite,
      hoehe: kante,
      links: Math.round((b - breite) / 2),
      oben: Math.round((h - kante) / 2),
      schrift: { gross: 12 * clamp(Math.floor(kante / 192), 1, 4), klein: 12 * clamp(Math.floor(kante / 384), 1, 2) },
      vodK: Math.max(1, Math.floor(kante / 192)),
    };
  }

  return { BILD, FLAECHEN, HUELLE, TV_ECKEN, TV_RECHTECK, LAUF_ECKEN, LAUF_FELD, laufMatrix, PLATTENSPIELER_RECHTECK, HOVER, MITTE_X, RAHMEN, RAUM_RAHMEN, REGAL_RAHMEN, REGAL_LEINWAND, REGAL, TELLER, skalierung, skalierungRegal, passtAlsRaum, treffer, zuBild, SPIELER_ANTEIL, lageRuhe, lageSpieler, lageTv, fixpunkt, ZOOM_ORT, zoomAmOrt, pixelStufen, fachFenster, schriftPx, rueckenSchrift, randPx, kartenMasse };
});
