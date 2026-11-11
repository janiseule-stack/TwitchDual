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

  const TELLER = Object.freeze({ x: 284, y: 113 });

  const zahl = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0);

  // Groesster ganzer Faktor >= 1, bei dem das Bild ins Fenster passt.
  function skalierung(fensterBreite, fensterHoehe) {
    const b = zahl(fensterBreite);
    const h = zahl(fensterHoehe);
    const faktor = b && h ? Math.max(1, Math.floor(Math.min(b / BILD.breite, h / BILD.hoehe))) : 1;
    return {
      faktor,
      links: Math.floor((b - BILD.breite * faktor) / 2),
      oben: Math.floor((h - BILD.hoehe * faktor) / 2),
    };
  }

  function passtAlsRaum(fensterBreite, fensterHoehe) {
    return skalierung(fensterBreite, fensterHoehe).faktor >= 2;
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

  return { BILD, FLAECHEN, FACH, HUELLE, TV_ECKEN, TELLER, skalierung, passtAlsRaum, treffer, zuBild, kameraZiel, fachFenster };
});
