// Szenen-Streifen im Chat-Kopf (Cozy-Raum): wie stark das Pixel-Bild
// vergroessert wird. Immer ganzzahlig, damit die Pixel scharf bleiben; der
// Streifen soll hoechstens ein Fuenftel der Fensterhoehe einnehmen.
// UMD wie teiler.js: laeuft im Browser und unter Node (Tests).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Szene = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const BILD = Object.freeze({ breite: 344, hoehe: 72 });
  const HOECHSTENS = 6;
  const ANTEIL_HOEHE = 0.2;

  // Kaputte Masse (0, NaN, negativ, keine Zahl) -> 1: schmale Fenster zeigen
  // den Streifen mittig beschnitten statt gestaucht.
  function faktor(fensterBreite, fensterHoehe) {
    const b = typeof fensterBreite === 'number' && Number.isFinite(fensterBreite) ? fensterBreite : 0;
    const h = typeof fensterHoehe === 'number' && Number.isFinite(fensterHoehe) ? fensterHoehe : 0;
    const f = Math.min(Math.floor(b / BILD.breite), Math.floor((h * ANTEIL_HOEHE) / BILD.hoehe));
    return Math.max(1, Math.min(HOECHSTENS, f));
  }

  function masse(fensterBreite, fensterHoehe) {
    const f = faktor(fensterBreite, fensterHoehe);
    return { faktor: f, breite: BILD.breite * f, hoehe: BILD.hoehe * f };
  }

  return { BILD, faktor, masse };
});
