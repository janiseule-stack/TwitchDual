// Griff an der Trennlinie Video|Chat (◫ / Nur-Video). Sichtbar nur im
// Aufteilungs-Modus; Ziehen meldet die Bildschirm-x-Position an den Main
// (IPC 'teilung-ziehen'), hoechstens einmal pro Frame.
// Klick ohne Ziehen blendet den Griff aus (Janis 09.11.2026); versteckt
// taucht er beim Drueberfahren auf, ein weiterer Klick holt ihn dauerhaft
// zurueck. UMD wie chat-ui.js: laeuft im Browser und unter Node (Tests).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Teiler = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Bis zu dieser Bewegung (px) zaehlt Druecken+Loslassen als Klick.
  const KLICK_TOLERANZ = 4;

  function istKlick(start, ende) {
    return Math.abs(ende.x - start.x) <= KLICK_TOLERANZ && Math.abs(ende.y - start.y) <= KLICK_TOLERANZ;
  }

  function binde({ doc, seite, ziehen, onModus, beimUmschalten }) {
    const g = doc.createElement('div');
    g.className = 'teiler-griff teiler-' + seite + ' hidden';
    const titel = () => {
      g.title = g.classList.contains('versteckt')
        ? 'Ziehen: Aufteilung ändern · Klick: Griff wieder dauerhaft zeigen'
        : 'Ziehen: Aufteilung ändern · Klick: Griff ausblenden';
    };
    titel();
    doc.body.appendChild(g);
    let x = null;
    let start = null;
    let gezogen = false;
    let geplant = false;
    const senden = () => { geplant = false; if (x !== null) ziehen(x); };
    g.addEventListener('pointerdown', (e) => {
      g.setPointerCapture(e.pointerId); g.classList.add('zieht'); e.preventDefault();
      start = { x: e.screenX, y: e.screenY }; gezogen = false;
    });
    g.addEventListener('pointermove', (e) => {
      if (!g.hasPointerCapture(e.pointerId)) return;
      // Erst ab echter Bewegung ziehen - ein Klick verschiebt die Linie nicht.
      if (!gezogen && start && istKlick(start, { x: e.screenX, y: e.screenY })) return;
      gezogen = true;
      x = e.screenX;
      if (!geplant) { geplant = true; requestAnimationFrame(senden); }
    });
    const ende = (e, abgebrochen) => {
      if (g.hasPointerCapture(e.pointerId)) g.releasePointerCapture(e.pointerId);
      g.classList.remove('zieht');
      if (!abgebrochen && !gezogen && start) {
        setzeVersteckt(!g.classList.contains('versteckt'));
        if (beimUmschalten) beimUmschalten(g.classList.contains('versteckt'));
      }
      x = null; start = null; gezogen = false;
    };
    g.addEventListener('pointerup', (e) => ende(e, false));
    g.addEventListener('pointercancel', (e) => ende(e, true));
    onModus((m) => g.classList.toggle('hidden', !(m && m.modus)));
    function setzeVersteckt(an) { g.classList.toggle('versteckt', !!an); titel(); }
    return { setzeVersteckt };
  }

  return { binde, istKlick, KLICK_TOLERANZ };
});
