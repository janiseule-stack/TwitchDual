// Runde Positions-Pille rechts am Chat (Janis 09.11.2026) - ersetzt den
// Scrollbalken, der im ganzen Chat-Fenster ausgeblendet ist. Erscheint beim
// Scrollen, beim Ziehen und solange man hochgescrollt ist; ziehbar.
// Rechnung DOM-frei (testbar), binde() haengt sie an eine Scroll-Liste.
// UMD wie chat-ui.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScrollPille = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_HOEHE = 28;      // darunter kaum noch zu greifen
  const NACHLAUF_MS = 1200;  // so lange bleibt sie nach dem Scrollen sichtbar

  // Lage und Hoehe der Pille in einer Spur der Hoehe `spur`; null = kein Ueberlauf.
  function mass({ scrollTop, scrollHeight, clientHeight, spur }) {
    const weg = scrollHeight - clientHeight;
    if (weg <= 0 || spur <= 0) return null;
    const hoehe = Math.min(spur, Math.max(MIN_HOEHE, spur * clientHeight / scrollHeight));
    const anteil = Math.min(1, Math.max(0, scrollTop / weg));
    return { top: (spur - hoehe) * anteil, hoehe };
  }

  // Umkehrung: wo muss gescrollt sein, wenn die Pille oben bei pillenTop liegt?
  function scrollTopAus({ pillenTop, scrollHeight, clientHeight, spur }) {
    const m = mass({ scrollTop: 0, scrollHeight, clientHeight, spur });
    if (!m) return 0;
    const frei = spur - m.hoehe;
    const anteil = frei > 0 ? Math.min(1, Math.max(0, pillenTop / frei)) : 0;
    return anteil * (scrollHeight - clientHeight);
  }

  function sichtbar({ ueberlauf, unten, kuerzlich, zieht }) {
    return !!ueberlauf && (!!zieht || !!kuerzlich || !unten);
  }

  // liste = Scroll-Container, eltern = position:relative-Rahmen darum.
  // istUnten() kommt vom Chat (gleiche Schwelle wie das Auto-Scrollen),
  // beimZiehen(aktiv) meldet Ziehen an/aus (Chat schaltet dann Auto-Scroll).
  function binde({ doc, liste, eltern, istUnten, beimZiehen }) {
    const p = doc.createElement('div');
    p.className = 'scroll-pille';
    p.setAttribute('aria-hidden', 'true');
    eltern.appendChild(p);
    let kuerzlichBis = 0;
    let nachlauf = null;
    let zieht = false;
    let griffVersatz = 0;
    let geplant = false;

    const spurHoehe = () => liste.clientHeight;
    function zeichne() {
      geplant = false;
      const m = mass({ scrollTop: liste.scrollTop, scrollHeight: liste.scrollHeight, clientHeight: liste.clientHeight, spur: spurHoehe() });
      const an = sichtbar({ ueberlauf: !!m, unten: istUnten(), kuerzlich: Date.now() < kuerzlichBis, zieht });
      p.classList.toggle('sichtbar', an);
      if (m) { p.style.top = (liste.offsetTop + m.top) + 'px'; p.style.height = m.hoehe + 'px'; }
    }
    const planen = () => { if (!geplant) { geplant = true; requestAnimationFrame(zeichne); } };
    function aktivGescrollt() {
      kuerzlichBis = Date.now() + NACHLAUF_MS;
      clearTimeout(nachlauf);
      nachlauf = setTimeout(planen, NACHLAUF_MS + 20);
      planen();
    }

    liste.addEventListener('scroll', planen, { passive: true });
    liste.addEventListener('wheel', aktivGescrollt, { passive: true });
    if (typeof ResizeObserver === 'function') new ResizeObserver(planen).observe(liste);

    p.addEventListener('pointerdown', (e) => {
      p.setPointerCapture(e.pointerId); e.preventDefault();
      zieht = true; p.classList.add('zieht');
      griffVersatz = e.clientY - p.getBoundingClientRect().top;
      if (beimZiehen) beimZiehen(true);
      planen();
    });
    p.addEventListener('pointermove', (e) => {
      if (!zieht) return;
      const spurOben = liste.getBoundingClientRect().top;
      liste.scrollTop = scrollTopAus({
        pillenTop: e.clientY - spurOben - griffVersatz,
        scrollHeight: liste.scrollHeight, clientHeight: liste.clientHeight, spur: spurHoehe()
      });
    });
    const ende = (e) => {
      if (!zieht) return;
      if (p.hasPointerCapture(e.pointerId)) p.releasePointerCapture(e.pointerId);
      zieht = false; p.classList.remove('zieht');
      if (beimZiehen) beimZiehen(false);
      aktivGescrollt();
    };
    p.addEventListener('pointerup', ende);
    p.addEventListener('pointercancel', ende);
    planen();
    return { aktualisiere: planen, aktivGescrollt };
  }

  return { mass, scrollTopAus, sichtbar, binde, MIN_HOEHE, NACHLAUF_MS };
});
