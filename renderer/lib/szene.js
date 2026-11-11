// Szenen-Streifen im Chat-Kopf (Cozy-Raum): wie stark das Pixel-Bild
// vergroessert wird. Nicht mehr ganzzahlig (Janis 11.11.2026): Faktor =
// Fensterbreite / 344, das Bild fuellt also genau die Breite (auch unter 1
// bei sehr schmalen Chats, dann werden Pixel ungleichmaessig). Das Fenster im
// Bild ist immer ganz sichtbar: der Streifen ist hoechstens 30 % der
// Fensterhoehe hoch, was darueber hinausgeht, wird oben beschnitten (`oben`
// verschiebt die Bildebene nach oben).
// UMD wie teiler.js: laeuft im Browser und unter Node (Tests).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Szene = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const BILD = Object.freeze({ breite: 344, hoehe: 72 });
  // Oberste Bildzeile des Fensterrahmens in streifen.png (gemessen: der Rahmen
  // reicht bis an den oberen Bildrand, Zeile 0 enthaelt schon Rahmenholz).
  const KERN_OBEN = 0;
  const ANTEIL_MIN = 0.2;
  const ANTEIL_MAX = 0.3;
  const MINDEST_HOEHE = 48;

  const zahl = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0);

  // Kaputte Masse (0, NaN, negativ, keine Zahl) -> 1.
  function faktor(fensterBreite) {
    const b = zahl(fensterBreite);
    return b ? b / BILD.breite : 1;
  }

  function masse(fensterBreite, fensterHoehe) {
    if (!zahl(fensterBreite)) return { faktor: 1, breite: BILD.breite, hoehe: BILD.hoehe, oben: 0 };
    const f = faktor(fensterBreite);
    const voll = Math.round(BILD.hoehe * f);
    const kern = Math.round((BILD.hoehe - KERN_OBEN) * f);
    const h = zahl(fensterHoehe);
    const hoehe = h
      ? Math.min(voll, Math.max(MINDEST_HOEHE, Math.round(ANTEIL_MIN * h), Math.min(kern, Math.round(ANTEIL_MAX * h))))
      : voll;
    return { faktor: f, breite: fensterBreite, hoehe, oben: hoehe - voll };
  }

  return { BILD, KERN_OBEN, faktor, masse };
});
