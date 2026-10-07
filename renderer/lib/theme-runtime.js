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
  // Welle 1b: Anpassungen setzen diese als Inline-Variablen (schlagen die Theme-CSS).
  const AKZENT_VARS = ['--accent', '--accent-title', '--accent-border', '--accent-glow', '--accent-dim', '--accent-contrast'];
  const FLAECHEN_VARS = ['--bg', '--panel', '--hover', '--line', '--text', '--muted', '--ts'];
  const GAST_VERSATZ_MS = 700;   // mehrere Gaeste kommen leicht nacheinander
  const GAST_DAUER_MS = 14000;   // so lange braucht ein Gast uebers Bild (+Puffer)

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
    let weltPartikel = null;   // Partikelfarbe der laufenden Welt
    let weltVariante = null;   // Variante der laufenden (gezeichneten) Welt
    let lauf = 0;                 // Generation gegen ueberholte Ladevorgaenge
    let pausiert = false;
    let gastBedingung = null;
    let gastTimer = null;
    let gastSchluessel = null;    // Haeufigkeit, mit der zuletzt geplant wurde
    const gastFolge = new Set();  // Timer der versetzten Folge-Gaeste
    let gastEbeneTimer = null;
    // Die Gast-Ebene liegt ueber dem Player und darf ihn nur waehrend eines
    // Auftritts verdecken - sonst startet Twitch nicht von selbst.
    function zeigeGastEbene(ms) {
      const e = ebenen.gast;
      if (!e || !e.classList) return;
      e.classList.add('aktiv');
      if (gastEbeneTimer !== null) win.clearTimeout(gastEbeneTimer);
      gastEbeneTimer = win.setTimeout(() => { gastEbeneTimer = null; e.classList.remove('aktiv'); }, ms);
    }
    let mausFrame = null;
    let mausPos = null;

    // --- Farben + CSS ------------------------------------------------------
    function setzeFarben(prefs) {
      const r = doc.documentElement;
      if (prefs.theme === 'neon-dual') {
        // Reste einer Anpassung weg; accentVars setzt --bg/--panel/--hover neu.
        for (const k of FLAECHEN_VARS) r.style.removeProperty(k);
        const vars = fenster === 'chat'
          ? ThemeLib.accentVars(prefs.chatAccent, prefs.chatAlpha)
          : ThemeLib.accentVars(prefs.videoAccent); // Video-Fenster ist opak
        for (const k in vars) r.style.setProperty(k, vars[k]);
        r.style.setProperty('--onair-from', ThemeLib.normalizeHex(prefs.videoAccent, ThemeLib.DEFAULTS.videoAccent));
        r.style.setProperty('--onair-to', ThemeLib.normalizeHex(prefs.chatAccent, ThemeLib.DEFAULTS.chatAccent));
      } else {
        for (const k of NEON_VARS.concat(FLAECHEN_VARS)) r.style.removeProperty(k);
        const anp = Katalog.anpassungFuer(prefs);
        if (anp.akzent) {
          const v = ThemeLib.accentVars(anp.akzent, 100);
          for (const k of AKZENT_VARS) r.style.setProperty(k, v[k]);
        }
        if (anp.hintergrund) {
          const v = ThemeLib.flaechenVars(anp.hintergrund, fenster === 'chat' ? prefs.chatAlpha : 100);
          for (const k of FLAECHEN_VARS) r.style.setProperty(k, v[k]);
        }
      }
      const alpha = fenster === 'chat' ? ThemeLib.clampAlpha(prefs.chatAlpha) / 100 : 1;
      r.style.setProperty('--chat-alpha', String(alpha));
      // Heller (auch selbst gewaehlter) Grund -> Namens-Abdunklung (chat.css).
      r.dataset.hell = prefs.theme !== 'neon-dual' && ThemeLib.istHell(Katalog.effektiveFarben(prefs).hintergrund) ? '1' : '0';
      r.dataset.theme = prefs.theme;
      const v = Katalog.varianteFuer(prefs);
      if (v) r.dataset.variante = v.id; else delete r.dataset.variante;
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
    // Pausiert (Home zu / Nur-Video) erzeugen Maus und Klick nichts - sonst
    // entstuenden unsichtbare Partikel in der versteckten Ebene.
    function onMaus(e) {
      if (pausiert) return;
      mausPos = { x: e.clientX, y: e.clientY };
      if (mausFrame !== null) return;
      mausFrame = win.requestAnimationFrame(() => {
        mausFrame = null;
        const p = relativ(mausPos.x, mausPos.y);
        rufe('maus', (w) => w.maus && w.maus(p.x, p.y));
      });
    }
    function onKlick(e) {
      if (pausiert) return;
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
    // Abstand aus ⚙ (Katalog.gastIntervall); 'aus' plant gar nichts.
    function planeGast() {
      if (fenster !== 'video' || !gastBedingung || !engine) return;
      gastSchluessel = letztePrefs ? letztePrefs.gastHaeufigkeit : null;
      const iv = Katalog.gastIntervall(letztePrefs);
      if (!iv) return;
      const ms = iv[0] + Math.random() * (iv[1] - iv[0]);
      gastTimer = win.setTimeout(() => { gastTimer = null; gastJetzt(); planeGast(); }, ms);
    }
    function stoppeGaeste() {
      if (gastTimer !== null) { win.clearTimeout(gastTimer); gastTimer = null; }
      for (const id of gastFolge) win.clearTimeout(id);
      gastFolge.clear();
      if (gastEbeneTimer !== null) { win.clearTimeout(gastEbeneTimer); gastEbeneTimer = null; }
      if (ebenen.gast && ebenen.gast.classList) ebenen.gast.classList.remove('aktiv');
    }
    // Erster Gast sofort, weitere (⚙ "wie viele") leicht versetzt.
    function gastGruppe() {
      const n = Katalog.gastAnzahl(letztePrefs);
      zeigeGastEbene(GAST_DAUER_MS + n * (GAST_VERSATZ_MS + 300));
      rufe('gast', (w) => w.gast && w.gast());
      for (let i = 1; i < n; i++) {
        const id = win.setTimeout(() => { gastFolge.delete(id); rufe('gast', (w) => w.gast && w.gast()); },
          i * GAST_VERSATZ_MS + Math.random() * 300);
        gastFolge.add(id);
      }
    }
    function gastJetzt() {
      if (fenster !== 'video' || !gastBedingung || !gastBedingung()) return;
      gastGruppe();
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
      weltPartikel = null;
      weltVariante = null;
    }
    function weltFehler(phase, e) {
      melde('theme', 'welt-fehler', { theme: weltId, phase, fehler: String((e && e.message) || e) });
      stoppeWelt();
    }
    function rufe(phase, fn) {
      if (!welt) return;
      try { fn(welt); } catch (e) { weltFehler(phase, e); }
    }

    // Gezeichnete Welten bringen ihre Stile in einer eigenen Datei mit.
    async function ladeWelt(id) {
      if (geladen.has(id)) return;
      if (Katalog.themeById(id).varianten) await ladeSkript(basis + id + '/stile.js');
      await ladeSkript(basis + id + '/welt.js');
      geladen.add(id);
    }

    async function starteWelt(id, faktor, meinLauf, partikel, variante) {
      weltId = id;
      weltPartikel = partikel;
      weltVariante = variante;
      try {
        await ladeWelt(id);
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
        welt = fabrik({ engine, fenster, FxEngine, farben: { partikel }, variante }) || null;
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
      const partikel = Katalog.effektiveFarben(prefs).partikel;
      const v = Katalog.varianteFuer(prefs);
      const variante = v ? v.id : null;
      // Gleiche Welt + gleiche Partikelfarbe + gleiche Variante: nur Faktor.
      if (weltId === prefs.theme && engine && weltPartikel === partikel && weltVariante === variante) {
        engine.setFaktor(faktor);
        // Gast-Haeufigkeit geaendert -> neu planen (sonst gilt der alte Abstand weiter).
        if (prefs.gastHaeufigkeit !== gastSchluessel) { stoppeGaeste(); planeGast(); }
        return;
      }
      lauf++;
      stoppeWelt();
      await starteWelt(prefs.theme, faktor, lauf, partikel, variante);
    }

    // --- Galerie-Vorschau (eigene Engine, unabhaengig von der Stufe) --------
    async function starteVorschau(container, id, varianteId) {
      const nichts = () => {};
      if (!Katalog.THEMES.some((t) => t.id === id)) return nichts;
      try {
        await ladeWelt(id);
      } catch (e) { return nichts; }
      const fabrik = win.TwitchDualWelten && win.TwitchDualWelten[id];
      if (typeof fabrik !== 'function') return nichts;
      const eng = erzeugeEngine({ ebenen: { hinten: container, vorn: container, gast: container }, doc,
        faktor: Katalog.EFFEKT_FAKTOR.wenig });
      let w = null;
      try {
        const basisPrefs = letztePrefs || {};
        const vp = varianteId ? { ...basisPrefs, theme: id, variante: { ...(basisPrefs.variante || {}), [id]: varianteId } }
          : { ...basisPrefs, theme: id };
        const v = Katalog.varianteFuer(vp);
        // Variante in der Vorschau: ihre eigenen Farben, keine Anpassung des Nutzers.
        const partikel = varianteId && v ? v.farben.partikel : Katalog.effektiveFarben(vp).partikel;
        w = fabrik({ engine: eng, fenster: 'vorschau', FxEngine, farben: { partikel }, variante: v ? v.id : null });
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
      // Effekte testen: Gast sofort, ohne Player-Bedingung (nur Video-Fenster).
      gastErzwingen() { if (fenster === 'video') gastGruppe(); },
      starteVorschau,
      stop() { lauf++; stoppeWelt(); },
      get weltAktiv() { return !!welt; }
    };
  }

  return { createRuntime };
});
