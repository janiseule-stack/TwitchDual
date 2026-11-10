// Szenen-Streifen im Chat-Kopf (Cozy-Raum): wie stark das Pixel-Bild
// vergroessert wird. Immer ganzzahlig, damit die Pixel scharf bleiben, und
// so gross, dass das Bild die ganze Fensterbreite fuellt (Janis 10.11.2026:
// keine Holzwand daneben). Der Streifen nimmt hoechstens ein Fuenftel der
// Fensterhoehe ein; was darueber hinausgeht, schneidet chat.css oben ab.
// UMD wie teiler.js: laeuft im Browser und unter Node (Tests).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Szene = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const BILD = Object.freeze({ breite: 344, hoehe: 72 });
  const HOECHSTENS = 8;
  const ANTEIL_HOEHE = 0.2;
  const MINDEST_HOEHE = 48;

  const zahl = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0);

  // Kaputte Masse (0, NaN, negativ, keine Zahl) -> 1.
  function faktor(fensterBreite) {
    return Math.max(1, Math.min(HOECHSTENS, Math.ceil(zahl(fensterBreite) / BILD.breite)));
  }

  function masse(fensterBreite, fensterHoehe) {
    const f = faktor(fensterBreite);
    const voll = BILD.hoehe * f;
    const h = zahl(fensterHoehe);
    const hoehe = h ? Math.min(voll, Math.max(MINDEST_HOEHE, Math.round(h * ANTEIL_HOEHE))) : voll;
    return { faktor: f, breite: BILD.breite * f, hoehe };
  }

  return { BILD, faktor, masse };
});
