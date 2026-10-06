// Theme-Runtime: der Kleber in jedem Fenster (Spec 2026-10-07, Abschnitt 2).
// Setzt Farben + <html data-theme>, tauscht die Theme-CSS, laedt/startet/
// stoppt die Welt, verteilt Maus/Klick/Ereignisse/Gaeste. DOM + Zeitgeber
// kommen von aussen -> unter Node mit Attrappen testbar.
//
// Stufe 'aus' (Spec 8): KEINE Welt, KEIN Listener, KEIN Timer.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./themes'), require('./fx-engine'), require('./theme'));
  } else {
    root.ThemeRuntime = factory(root.ThemeKatalog, root.FxEngine, root.ThemeLib);
  }
})(typeof self !== 'undefined' ? self : this, function (Katalog, FxEngine, ThemeLib) {
  // Alle Inline-Variablen, die Neon Dual setzt - bei anderen Themes muessen
  // sie weg, sonst schlagen sie die Werte aus der Theme-CSS.
  const NEON_VARS = Object.keys(ThemeLib.accentVars(ThemeLib.DEFAULTS.videoAccent, 100))
    .concat(['--onair-from', '--onair-to']);
  const GAST_MIN_MS = 120000;
  const GAST_SPANNE_MS = 120000;

  function createRuntime(o) {
    const fenster = o.fenster;
    const doc = o.doc;
    const win = o.win;
    const ebenen = o.ebenen || {};
    const basis = o.basis || '../themes/';
    const melde = o.melde || (() => {});
    const ladeSkript = o.ladeSkript || ((url) => new Promise((resolve, reject) => {
      const s = doc.createElement('script');
      s.src = url;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Skript laedt nicht: ' + url));
      doc.head.appendChild(s);
    }));
    const erzeugeEngine = o.erzeugeEngine || ((opts) => FxEngine.createEngine(opts));

    const geladen = new Set();
    let letztePrefs = null;
    let welt = null;
    let engine = null;
    let weltId = null;
    let lauf = 0;                 // Generation gegen ueberholte Ladevorgaenge
    let pausiert = false;
    let gastBedingung = null;
    let gastTimer = null;
    let mausFrame = null;
    let mausPos = null;

    // --- Farben + CSS ------------------------------------------------------
    function setzeFarben(prefs) {
      const r = doc.documentElement;
      if (prefs.theme === 'neon-dual') {
        const vars = fenster === 'chat'
          ? ThemeLib.accentVars(prefs.chatAccent, prefs.chatAlpha)
          : ThemeLib.accentVars(prefs.videoAccent); // Video-Fenster ist opak
        for (const k in vars) r.style.setProperty(k, vars[k]);
        r.style.setProperty('--onair-from', ThemeLib.normalizeHex(prefs.videoAccent, ThemeLib.DEFAULTS.videoAccent));
        r.style.setProperty('--onair-to', ThemeLib.normalizeHex(prefs.chatAccent, ThemeLib.DEFAULTS.chatAccent));
      } else {
        for (const k of NEON_VARS) r.style.removeProperty(k);
      }
      const alpha = fenster === 'chat' ? ThemeLib.clampAlpha(prefs.chatAlpha) / 100 : 1;
      r.style.setProperty('--chat-alpha', String(alpha));
      r.dataset.theme = prefs.theme;
    }

    function setzeCss(id) {
      let link = doc.getElementById('theme-css');
      if (id === 'neon-dual') { if (link) link.remove(); return; }
      const href = basis + id + '/theme.css';
      if (link && link.getAttribute('href') === href) return;
      if (!link) {
        link = doc.createElement('link');
        link.id = 'theme-css';
        link.rel = 'stylesheet';
        doc.head.appendChild(link);
      }
      link.onerror = () => {
        melde('theme', 'css-fehler', { theme: id });
        // Rueckfall: Neon-Dual-Optik, ohne den Store anzufassen.
        if (letztePrefs && letztePrefs.theme === id) anwenden({ ...letztePrefs, theme: 'neon-dual' });
      };
      link.setAttribute('href', href);
    }

    // --- Listener (nur solange eine Welt laeuft) ---------------------------
    function relativ(x, y) {
      const r = ebenen.hinten && ebenen.hinten.getBoundingClientRect
        ? ebenen.hinten.getBoundingClientRect() : { left: 0, top: 0 };
      return { x: x - r.left, y: y - r.top };
    }
    function onMaus(e) {
      mausPos = { x: e.clientX, y: e.clientY };
      if (mausFrame !== null) return;
      mausFrame = win.requestAnimationFrame(() => {
        mausFrame = null;
        const p = relativ(mausPos.x, mausPos.y);
        rufe('maus', (w) => w.maus && w.maus(p.x, p.y));
      });
    }
    function onKlick(e) {
      if (!Katalog.istKlickInsLeere(e.target)) return;
      const p = relativ(e.clientX, e.clientY);
      rufe('klick', (w) => w.klickInsLeere && w.klickInsLeere(p.x, p.y));
    }
    function onSicht() { if (engine) engine.weiter(); }
    function anmelden() {
      doc.addEventListener('mousemove', onMaus);
      doc.addEventListener('click', onKlick);
      doc.addEventListener('visibilitychange', onSicht);
    }
    function abmelden() {
      doc.removeEventListener('mousemove', onMaus);
      doc.removeEventListener('click', onKlick);
      doc.removeEventListener('visibilitychange', onSicht);
      if (mausFrame !== null) { win.cancelAnimationFrame(mausFrame); mausFrame = null; }
    }

    // --- Gaeste (nur Video-Fenster) -----------------------------------------
    function planeGast() {
      if (fenster !== 'video' || !gastBedingung || !engine) return;
      const ms = (GAST_MIN_MS + Math.random() * GAST_SPANNE_MS) / Math.max(engine.faktor, 0.4);
      gastTimer = win.setTimeout(() => { gastTimer = null; gastJetzt(); planeGast(); }, ms);
    }
    function stoppeGaeste() {
      if (gastTimer !== null) { win.clearTimeout(gastTimer); gastTimer = null; }
    }
    function gastJetzt() {
      if (fenster !== 'video' || !gastBedingung || !gastBedingung()) return;
      rufe('gast', (w) => w.gast && w.gast());
    }

    // --- Welt ----------------------------------------------------------------
    function stoppeWelt() {
      stoppeGaeste();
      abmelden();
      if (welt && welt.stop) { try { welt.stop(); } catch (e) { /* egal, Engine raeumt */ } }
      if (engine) engine.stop();
      welt = null;
      engine = null;
      weltId = null;
    }
    function weltFehler(phase, e) {
      melde('theme', 'welt-fehler', { theme: weltId, phase, fehler: String((e && e.message) || e) });
      stoppeWelt();
    }
    function rufe(phase, fn) {
      if (!welt) return;
      try { fn(welt); } catch (e) { weltFehler(phase, e); }
    }

    async function starteWelt(id, faktor, meinLauf) {
      weltId = id;
      try {
        if (!geladen.has(id)) { await ladeSkript(basis + id + '/welt.js'); geladen.add(id); }
      } catch (e) {
        if (meinLauf === lauf) weltFehler('laden', e);
        return;
      }
      if (meinLauf !== lauf) return;   // inzwischen anderes Theme/aus gewaehlt
      const fabrik = win.TwitchDualWelten && win.TwitchDualWelten[id];
      if (typeof fabrik !== 'function') { weltFehler('laden', new Error('Welt fehlt: ' + id)); return; }
      engine = erzeugeEngine({ ebenen, doc, faktor });
      engine.pausieren(pausiert);
      try {
        welt = fabrik({ engine, fenster, FxEngine }) || null;
        if (welt && welt.start) welt.start();
      } catch (e) {
        if (!welt) welt = {};
        weltFehler('start', e);
        return;
      }
      if (!welt) { weltFehler('start', new Error('Welt liefert nichts')); return; }
      anmelden();
      planeGast();
    }

    async function anwenden(roh) {
      const prefs = Katalog.cleanThemePrefs(roh);
      letztePrefs = prefs;
      setzeFarben(prefs);
      setzeCss(prefs.theme);
      const faktor = Katalog.EFFEKT_FAKTOR[prefs.effekte];
      if (faktor === 0) { lauf++; stoppeWelt(); return; }
      if (weltId === prefs.theme && engine) { engine.setFaktor(faktor); return; }
      lauf++;
      stoppeWelt();
      await starteWelt(prefs.theme, faktor, lauf);
    }

    // --- Galerie-Vorschau (eigene Engine, unabhaengig von der Stufe) --------
    async function starteVorschau(container, id) {
      const nichts = () => {};
      if (!Katalog.THEMES.some((t) => t.id === id)) return nichts;
      try {
        if (!geladen.has(id)) { await ladeSkript(basis + id + '/welt.js'); geladen.add(id); }
      } catch (e) { return nichts; }
      const fabrik = win.TwitchDualWelten && win.TwitchDualWelten[id];
      if (typeof fabrik !== 'function') return nichts;
      const eng = erzeugeEngine({ ebenen: { hinten: container, vorn: container, gast: container }, doc,
        faktor: Katalog.EFFEKT_FAKTOR.wenig });
      let w = null;
      try {
        w = fabrik({ engine: eng, fenster: 'vorschau', FxEngine });
        if (w && w.start) w.start();
      } catch (e) { eng.stop(); return nichts; }
      return () => { try { if (w && w.stop) w.stop(); } catch (e) { /* egal */ } eng.stop(); };
    }

    return {
      anwenden,
      ereignis(art, daten) { rufe('ereignis', (w) => w.ereignis && w.ereignis(art, daten || {})); },
      pausieren(an) {
        pausiert = !!an;
        if (engine) { engine.pausieren(pausiert); if (!pausiert) engine.weiter(); }
      },
      setzeGastBedingung(fn) { gastBedingung = typeof fn === 'function' ? fn : null; },
      gastJetzt,
      starteVorschau,
      stop() { lauf++; stoppeWelt(); },
      get weltAktiv() { return !!welt; }
    };
  }

  return { createRuntime };
});
