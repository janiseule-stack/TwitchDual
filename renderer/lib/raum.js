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

  // Verschiebung und Vergroesserung, bei der das Rechteck das Fenster deckend fuellt.
  function kameraZiel(rechteck, fensterBreite, fensterHoehe) {
    const faktor = Math.ceil(Math.max(fensterBreite / rechteck.b, fensterHoehe / rechteck.h));
    return {
      faktor,
      x: Math.round(fensterBreite / 2 - (rechteck.x + rechteck.b / 2) * faktor),
      y: Math.round(fensterHoehe / 2 - (rechteck.y + rechteck.h / 2) * faktor),
    };
  }

  // Kamera fuer den weichen Wechsel Raum <-> Regal: das Regal im Raum (HOVER.regal)
  // liegt genau auf dem Bildschirm-Rechteck des Regals der Nahansicht (skalierungRegal,
  // regal.png volle Hoehe, Mitte x = REGAL_RAHMEN von..bis, y = halbe Hoehe).
  // Faktor nicht gerundet (transform darf krumm sein), Verschiebung in ganzen Pixeln.
  function kameraRegal(fensterBreite, fensterHoehe) {
    const s = skalierungRegal(fensterBreite, fensterHoehe);
    const H = HOVER.regal;
    const faktor = (BILD.hoehe * s.faktor) / H.h;
    const mitteX = s.links + ((REGAL_RAHMEN.von + REGAL_RAHMEN.bis) / 2) * s.faktor;
    const mitteY = s.oben + (BILD.hoehe / 2) * s.faktor;
    return {
      faktor,
      x: Math.round(mitteX - (H.x + H.b / 2) * faktor) + 0,
      y: Math.round(mitteY - (H.y + H.h / 2) * faktor) + 0,
    };
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

  return { BILD, FLAECHEN, HUELLE, TV_ECKEN, TV_RECHTECK, PLATTENSPIELER_RECHTECK, HOVER, MITTE_X, RAHMEN, RAUM_RAHMEN, REGAL_RAHMEN, REGAL_LEINWAND, REGAL, TELLER, skalierung, skalierungRegal, passtAlsRaum, treffer, zuBild, kameraZiel, kameraRegal, fachFenster, schriftPx, rueckenSchrift, randPx, kartenMasse };
});
