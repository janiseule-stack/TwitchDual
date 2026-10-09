// Griff an der Trennlinie Video|Chat (◫ / Nur-Video). Sichtbar nur im
// Aufteilungs-Modus; Ziehen meldet die Bildschirm-x-Position an den Main
// (IPC 'teilung-ziehen'), hoechstens einmal pro Frame.
(function (root) {
  function binde({ doc, seite, ziehen, onModus }) {
    const g = doc.createElement('div');
    g.className = 'teiler-griff teiler-' + seite + ' hidden';
    g.title = 'Ziehen: Video/Chat-Aufteilung ändern';
    doc.body.appendChild(g);
    let x = null;
    let geplant = false;
    const senden = () => { geplant = false; if (x !== null) ziehen(x); };
    g.addEventListener('pointerdown', (e) => { g.setPointerCapture(e.pointerId); g.classList.add('zieht'); e.preventDefault(); });
    g.addEventListener('pointermove', (e) => {
      if (!g.hasPointerCapture(e.pointerId)) return;
      x = e.screenX;
      if (!geplant) { geplant = true; requestAnimationFrame(senden); }
    });
    const ende = (e) => { if (g.hasPointerCapture(e.pointerId)) g.releasePointerCapture(e.pointerId); g.classList.remove('zieht'); x = null; };
    g.addEventListener('pointerup', ende);
    g.addEventListener('pointercancel', ende);
    onModus((m) => g.classList.toggle('hidden', !(m && m.modus)));
  }
  root.Teiler = { binde };
})(typeof self !== 'undefined' ? self : this);
