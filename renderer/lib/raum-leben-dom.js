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

  // Ereignis-Effekte im Chat-Streifen (Task 6), gesteuert von RaumLeben.abspieler:
  // starte(ev) / stoppe(). Aufruf NACH baue(): die Raid-Ebene wird als erstes Kind
  // eingefuegt (unter Regen, Katze, Lampe - Figuren gehen draussen hinter dem Glas),
  // die Kiste als letztes (obenauf). opt.katze = Element der Katzen-Animation, das
  // waehrend der Kiste verdeckt ist. Ende ueber animationend; bei "Animationen aus"
  // laeuft keine Animation, dann raeumt stoppe() (abspieler.aus) auf.
  function effekte(doc, ebene, pfad, opt) {
    const o = opt || {};
    const G = RaumLeben.GLAS;
    const R = RaumLeben.RAID;
    const K = RaumLeben.KISTE;

    const raid = doc.createElement('div');
    raid.className = 'raum-raid';
    raid.style.left = G.x + 'px';
    raid.style.top = G.y + 'px';
    raid.style.width = G.b + 'px';
    raid.style.height = G.h + 'px';
    // Maske (344x72 wie streifen.png) liegt deckungsgleich mit dem Bild.
    raid.style.setProperty('--mx', -G.x + 'px');
    raid.style.setProperty('--my', -G.y + 'px');
    ebene.insertBefore(raid, ebene.firstChild);

    const kiste = doc.createElement('div');
    kiste.className = 'raum-kiste';
    kiste.style.left = K.x + 'px';
    kiste.style.top = K.y + 'px';
    kiste.style.width = K.b + 'px';
    kiste.style.height = K.h + 'px';
    kiste.style.setProperty('--bilder', K.bilder);
    kiste.style.setProperty('--dauer', K.bilder * K.msProBild + 'ms');
    kiste.style.setProperty('--sb', K.bilder * K.b + 'px');
    kiste.style.backgroundImage = "url('" + pfad + "leben-kiste.png')";
    ebene.appendChild(kiste);

    let figuren = [];

    function katzeZeigen(an) {
      if (o.katze) o.katze.classList.toggle('verdeckt', !an);
    }
    // Waehrend der Kiste ist die Katze angehalten; spielte sie (oder startete ihr
    // Takt inzwischen), beginnt sie danach von vorn - nicht, wenn das Leben ruht.
    let katzeNeu = false;
    function kisteEnde() {
      kiste.classList.remove('spielt');
      const k = o.katze;
      if (k && (katzeNeu || k.classList.contains('spielt')) && !k.classList.contains('ruht')) {
        k.classList.remove('spielt');
        void k.offsetWidth; // Neustart der Animation erzwingen
        k.classList.add('spielt');
      } else if (k && k.classList.contains('ruht')) {
        k.classList.remove('spielt');
      }
      katzeNeu = false;
      katzeZeigen(true);
    }
    function raidEnde() {
      for (const f of figuren) raid.removeChild(f);
      figuren = [];
    }
    kiste.addEventListener('animationend', (e) => {
      if (e.target === kiste) kisteEnde();
    });

    function figur(i, schritte) {
      const verzug = i * R.versatzMs + 'ms';
      const f = doc.createElement('div');
      f.className = 'raum-raid-figur';
      f.style.top = R.y - G.y + 'px';
      f.style.width = R.b + 'px';
      f.style.height = R.h + 'px';
      f.style.setProperty('--schritte', schritte);
      f.style.setProperty('--dauer', schritte * R.msProBild + 'ms');
      f.style.setProperty('--von', -R.b + 'px');
      // ganze Bildpixel je Schritt: Ende = Start + schritte * pxProBild (>= GLAS.b)
      f.style.setProperty('--bis', -R.b + schritte * R.pxProBild + 'px');
      f.style.setProperty('--verzug', verzug);
      const g = doc.createElement('div');
      g.className = 'raum-raid-geht';
      g.style.setProperty('--bilder', R.bilder);
      g.style.setProperty('--dauer', R.bilder * R.msProBild + 'ms');
      g.style.setProperty('--sb', R.bilder * R.b + 'px');
      g.style.setProperty('--verzug', verzug);
      g.style.backgroundImage = "url('" + pfad + 'leben-' + R.dateien[i % R.dateien.length] + ".png')";
      f.appendChild(g);
      f.addEventListener('animationend', (e) => {
        if (e.target !== f) return; // Gehzyklus innen ist eine Schleife
        f.classList.add('fertig');
        if (figuren.every((x) => x.classList.contains('fertig'))) raidEnde();
      });
      return f;
    }

    function stoppe() {
      kisteEnde();
      raidEnde();
    }

    function starte(ev) {
      stoppe();
      if (ev.art === 'raid') {
        const n = RaumLeben.schirmAnzahl(ev.daten && ev.daten.anzahl);
        const schritte = RaumLeben.raidSchritte();
        for (let i = 0; i < n; i++) figuren.push(raid.appendChild(figur(i, schritte)));
      } else if (ev.art === 'kiste') {
        if (o.katze && o.katze.classList.contains('spielt')) {
          katzeNeu = true;
          o.katze.classList.remove('spielt');
        }
        katzeZeigen(false);
        void kiste.offsetWidth; // Neustart der Animation erzwingen
        kiste.classList.add('spielt');
      }
    }

    return { starte, stoppe };
  }

  return { baue, effekte };
});
