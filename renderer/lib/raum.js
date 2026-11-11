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
    Object.freeze({ id: 'regal', name: 'Platten', x: 100, y: 14, b: 64, h: 116 }),
  ]);

  const FACH = Object.freeze({
    live: Object.freeze({ x: 114, y: 19, b: 175, h: 46 }),
    offline: Object.freeze({ x: 114, y: 80, b: 175, h: 43 }),
    vorn: Object.freeze({ x: 114, y: 138, b: 175, h: 52 }),
  });

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
    regal: Object.freeze({ x: 96, y: 10, b: 72, h: 124 }),
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

  const MIN_BREITE = 688;
  const MIN_HOEHE = 384;

  // Klemmt so, dass kein Rand entsteht: bild*faktor deckt das Fenster, Wert in [fenster - gesamt, 0].
  function klemme(ideal, fenster, gesamt) {
    const untergrenze = Math.ceil(fenster - gesamt - 1e-9);
    return Math.min(0, Math.max(untergrenze, Math.round(ideal))) + 0;
  }
  function zwischen(wert, min, max) { return Math.min(max, Math.max(min, wert)); }

  // Deckender Faktor (nicht ganzzahlig): der Raum ohne dunklen Rand (RAHMEN, volle
  // Hoehe) fuellt das Fenster, Ueberstand wird abgeschnitten. Waagerecht mittig auf
  // den Raum; passen alle Gegenstaende ins Fenster, so wenig verschoben, dass sie
  // ganz sichtbar bleiben; sonst mittig auf die Gegenstaende. Nie ueber den Rahmen.
  function skalierung(fensterBreite, fensterHoehe, rahmen) {
    const b = zahl(fensterBreite);
    const h = zahl(fensterHoehe);
    if (!b || !h) return { faktor: 1, links: 0, oben: 0 };
    const rah = rahmen || RAHMEN;
    const faktor = Math.max(b / rah.b, h / BILD.hoehe);
    const sichtbar = b / faktor; // Bildpixel waagerecht, hoechstens rah.b
    const raumRechts = rah.x + rah.b;
    let l = rah.x + rah.b / 2 - sichtbar / 2;
    if (sichtbar >= GEGENSTAENDE.bis - GEGENSTAENDE.von) l = zwischen(l, GEGENSTAENDE.bis - sichtbar, GEGENSTAENDE.von);
    else l = MITTE_X - sichtbar / 2;
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

  // Wie viele Huellen passen ins Fach, und kleinster Verschub von start, der die gewaehlte zeigt.
  function fachFenster(anzahl, gewaehltIndex, fachBreite, start) {
    const n = Math.max(0, Math.floor(zahl(anzahl)));
    const sichtbar = Math.max(1, Math.floor((zahl(fachBreite) + HUELLE.abstand) / (HUELLE.kante + HUELLE.abstand)));
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

  // Rahmenbreite in ganzen Bildschirm-Pixeln (Bildpixel x Faktor, mindestens 1).
  function randPx(faktor, bildPixel) {
    return Math.max(1, Math.round(zahl(faktor) * zahl(bildPixel)));
  }

  // Zettel: welche Zeilen passen in die Innenhoehe (beides in Bildschirm-Pixeln)?
  // Reihenfolge: Status, Name, Titel, Spiel, Laufzeit, Kanalpunkte, Knoepfe.
  // Fehlt Platz, entfallen zuerst Laufzeit, dann Kanalpunkte, dann Spiel, dann Titel.
  function zettelZeilen(innenHoehe, zeilenHoehe) {
    const z = zahl(zeilenHoehe);
    const platz = z ? Math.floor(zahl(innenHoehe) / z + 1e-9) : 0;
    return { platz, titel: platz >= 4, spiel: platz >= 5, punkte: platz >= 6, laufzeit: platz >= 7 };
  }

  // Grosse Huelle (128x128 Bildpixel): ganzzahliges Vielfaches von 128, so gross
  // wie es in 70 % der Fensterhoehe passt (mindestens 128). Mit Fensterbreite:
  // auch hoechstens die Breite abzueglich 2 x 48 px (Platz fuer den Knopf ✕).
  function grossKante(fensterHoehe, fensterBreite) {
    let n = Math.floor((zahl(fensterHoehe) * 0.7) / 128);
    if (fensterBreite !== undefined) n = Math.min(n, Math.floor((zahl(fensterBreite) - 96) / 128));
    return 128 * Math.max(1, n);
  }

  return { BILD, FLAECHEN, FACH, HUELLE, TV_ECKEN, TV_RECHTECK, PLATTENSPIELER_RECHTECK, HOVER, MITTE_X, RAHMEN, RAUM_RAHMEN, TELLER, skalierung, passtAlsRaum, treffer, zuBild, kameraZiel, fachFenster, schriftPx, randPx, zettelZeilen, grossKante };
});
