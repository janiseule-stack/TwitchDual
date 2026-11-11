// Cozy-Raum "Leben" (Etappe 3): ruhige PixelLab-Animationen als Bildstreifen in
// einer skalierten Bildebene (Home-Raum, in Task 6 auch der Chat-Streifen).
// Je Eintrag ein div.raum-leben in Bildpixeln; CSS (home-raum.css) schiebt den
// Streifen per steps() weiter. Bild 0 = Standbild, ruhend also unsichtbar.
// Takt aus RaumLeben.TAKT[id]: 'schleife' laeuft durch, 'selten' spielt einmal
// (Klasse spielt) und wartet dann naechstePause() ms. Es wird nichts gezeichnet.
// UMD: im Fenster window.RaumLebenDom (braucht window.RaumLeben), in Node per require.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./raum-leben.js'));
  else root.RaumLebenDom = factory(root.RaumLeben);
})(typeof self !== 'undefined' ? self : this, function (RaumLeben) {
  // pfad + Datei + '.png' = Bildstreifen. opt (Tests): setTimeout, clearTimeout, zufall.
  function baue(doc, ebene, liste, pfad, opt) {
    const o = opt || {};
    const setT = o.setTimeout || ((f, ms) => setTimeout(f, ms));
    const clearT = o.clearTimeout || ((id) => clearTimeout(id));
    const zufall = o.zufall || Math.random;
    let laeuft = false;

    function setzeStreifen(t, datei) {
      t.d.style.backgroundImage = "url('" + pfad + datei + ".png')";
    }
    function spiele(t) {
      t.timer = null;
      if (!laeuft) return;
      if (t.dateien.length > 1) setzeStreifen(t, t.dateien[Math.floor(zufall() * t.dateien.length) % t.dateien.length]);
      t.d.classList.add('spielt');
    }

    const teile = liste.map((e) => {
      const takt = RaumLeben.TAKT[e.id];
      const selten = takt.modus === 'selten';
      const d = doc.createElement('div');
      d.className = 'raum-leben ruht' + (selten ? ' selten' : '');
      d.dataset.leben = e.id;
      d.style.left = e.x + 'px';
      d.style.top = e.y + 'px';
      d.style.width = e.b + 'px';
      d.style.height = e.h + 'px';
      d.style.setProperty('--bilder', e.bilder);
      d.style.setProperty('--dauer', e.bilder * takt.msProBild + 'ms');
      d.style.setProperty('--sb', e.bilder * e.b + 'px');
      const t = { d, takt, selten, dateien: e.dateien && e.dateien.length ? e.dateien : [e.id], timer: null };
      setzeStreifen(t, t.dateien[0]);
      if (selten) {
        d.addEventListener('animationend', () => {
          if (!d.classList.contains('spielt')) return;
          d.classList.remove('spielt');
          if (laeuft) t.timer = setT(() => spiele(t), RaumLeben.naechstePause(zufall, takt.pause));
        });
      }
      ebene.appendChild(d);
      return t;
    });

    return {
      an() {
        if (laeuft) return;
        laeuft = true;
        for (const t of teile) {
          t.d.classList.remove('ruht');
          if (t.selten) spiele(t);
        }
      },
      aus() {
        laeuft = false;
        for (const t of teile) {
          if (t.timer !== null) { clearT(t.timer); t.timer = null; }
          t.d.classList.remove('spielt');
          t.d.classList.add('ruht');
        }
      },
    };
  }

  return { baue };
});
