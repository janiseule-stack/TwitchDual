// Theme-Katalog fuer "Lebendige Themes" (Spec 2026-10-07). DOM-frei, UMD wie
// theme.js: im Browser -> window.ThemeKatalog (theme.js MUSS vorher geladen
// sein), unter Node -> require -> testbar.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./theme'));
  } else {
    root.ThemeKatalog = factory(root.ThemeLib);
  }
})(typeof self !== 'undefined' ? self : this, function (ThemeLib) {
  // vorschau: Hintergrund der Galerie-Karte (die Partikel kommen aus der Welt).
  const THEMES = [
    { id: 'neon-dual', name: 'Neon Dual', hell: false, farbenFrei: true, info: 'Farben frei wählbar',
      vorschau: 'linear-gradient(90deg, #35e0ff, #ff4fa3)',
      farben: { akzent: '#35e0ff', hintergrund: '#0b0b11', partikel: '#35e0ff' } },
    { id: 'sakura', name: 'Sakura', hell: true, farbenFrei: false, info: 'Kirschblüten',
      vorschau: 'linear-gradient(160deg, #fff0f5, #ffe4ec 50%, #f3e8ff)',
      farben: { akzent: '#e0659a', hintergrund: '#fff4f8', partikel: '#ffb3cc' } },
    { id: 'wald', name: 'Wald', hell: false, farbenFrei: false, info: 'Glühwürmchen',
      vorschau: 'linear-gradient(180deg, #16301e, #0a150d)',
      farben: { akzent: '#9fe07a', hintergrund: '#0e1f14', partikel: '#e8ff7a' } },
    // Gezeichnete Welt mit Varianten (Canvas): Theme-Farben = erste Variante.
    { id: 'koi', name: 'Koi-Teich', hell: true, farbenFrei: false, info: 'Koi-Fische',
      vorschau: 'radial-gradient(ellipse at 40% 60%, #cfe3d8, #a9c9bf 60%, #8fb5aa)',
      farben: { akzent: '#c0583a', hintergrund: '#e4ede6', partikel: '#e0714f' },
      varianten: [
        { id: 'aquarell', name: 'Aquarell', hell: true,
          farben: { akzent: '#c0583a', hintergrund: '#e4ede6', partikel: '#e0714f' } },
        { id: 'lofi', name: 'Lofi-Abend', hell: false,
          farben: { akzent: '#ff9a6e', hintergrund: '#2c2c63', partikel: '#ff8f5a' } },
        { id: 'holzschnitt', name: 'Holzschnitt', hell: true,
          farben: { akzent: '#c0392b', hintergrund: '#efe3c8', partikel: '#d2452e' } },
        { id: 'tusche', name: 'Tusche', hell: true,
          farben: { akzent: '#b0302a', hintergrund: '#f4efe3', partikel: '#b8332b' } },
        { id: 'bleiglas', name: 'Bleiglas', hell: false,
          farben: { akzent: '#ffb35a', hintergrund: '#1a2440', partikel: '#ff6a3a' } }
      ] },
    { id: 'blasen', name: 'Seifenblasen', hell: true, farbenFrei: false, info: 'Seifenblasen',
      vorschau: 'linear-gradient(180deg, #dff3ff, #f4eaff)',
      farben: { akzent: '#7b6cff', hintergrund: '#f0f7ff', partikel: '#aac8ff' } }
  ];
  const STANDARD_THEME = 'neon-dual';
  const EFFEKT_STUFEN = ['aus', 'wenig', 'normal', 'viel'];
  const STANDARD_EFFEKTE = 'normal';
  const EFFEKT_FAKTOR = { aus: 0, wenig: 0.4, normal: 1, viel: 1.8 };
  // Klick-Ziele, die der App gehoeren. Nur Klicks AUSSERHALB davon sieht die
  // Welt als "Klick ins Leere" (die App bekommt jeden Klick trotzdem).
  const KLICK_SPERRE = 'button, a, input, textarea, select, label, [contenteditable], .msg, #composer, #settings-pop, #theme-galerie, iframe';
  const FARB_SCHLUESSEL = ['akzent', 'hintergrund', 'partikel'];
  // Fuer die Nachricht ans Twitch-iframe: nur Farbwerte, nie freies CSS.
  // preload.js traegt eine Kopie (Sandbox, kein require) - test/balken-farbe
  // prueft den Gleichlauf.
  const SICHERE_FARBE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
  function istSichereFarbe(s) { return typeof s === 'string' && SICHERE_FARBE.test(s); }

  // Eigene Farben pro Theme (Spec Welle 1b, 4.): nur Nicht-Neon-Themes, nur
  // die drei Schluessel, nur gueltige Hex - alles andere faellt still weg.
  function cleanAnpassungen(roh) {
    const aus = {};
    if (!roh || typeof roh !== 'object') return aus;
    for (const t of THEMES) {
      if (t.id === 'neon-dual') continue;
      const a = roh[t.id];
      if (!a || typeof a !== 'object') continue;
      const sauber = {};
      for (const k of FARB_SCHLUESSEL) {
        const hex = ThemeLib.normalizeHex(a[k], null);
        if (hex) sauber[k] = hex;
      }
      if (Object.keys(sauber).length) aus[t.id] = sauber;
    }
    return aus;
  }

  // Varianten (gezeichnete Welten): pro Theme die gewaehlte Variante, nur
  // gueltige Ids; fehlt sie, gilt die erste. Themes ohne Varianten -> null.
  function cleanVariante(roh) {
    const aus = {};
    if (!roh || typeof roh !== 'object') return aus;
    for (const t of THEMES) {
      if (!t.varianten) continue;
      const v = roh[t.id];
      if (typeof v === 'string' && t.varianten.some((x) => x.id === v)) aus[t.id] = v;
    }
    return aus;
  }
  function varianteVon(themeId, varianteId) {
    const t = themeById(themeId);
    if (!t.varianten) return null;
    return t.varianten.find((v) => v.id === varianteId) || t.varianten[0];
  }
  function varianteFuer(prefs) {
    const p = prefs || {};
    return varianteVon(p.theme, p.variante && p.variante[cleanTheme(p.theme)]);
  }

  function themeById(id) {
    return THEMES.find((t) => t.id === id) || THEMES[0];
  }
  function cleanTheme(id) { return themeById(id).id; }
  function cleanEffekte(stufe) {
    return EFFEKT_STUFEN.includes(stufe) ? stufe : STANDARD_EFFEKTE;
  }

  // Ersetzt das alte cleanThemePrefs aus main.js. Store-Inhalte koennen Muell
  // sein (Handedit, alte Version) - App startet nie ohne gueltige Werte.
  function cleanThemePrefs(prefs) {
    const p = prefs && typeof prefs === 'object' ? prefs : {};
    const d = ThemeLib.DEFAULTS;
    return {
      videoAccent: ThemeLib.normalizeHex(p.videoAccent, d.videoAccent),
      chatAccent: ThemeLib.normalizeHex(p.chatAccent, d.chatAccent),
      chatAlpha: ThemeLib.clampAlpha(p.chatAlpha),
      theme: cleanTheme(p.theme),
      effekte: cleanEffekte(p.effekte),
      anpassungen: cleanAnpassungen(p.anpassungen),
      variante: cleanVariante(p.variante)
    };
  }

  // Teil-Speicherungen (Preset-Klick schickt nur Farben, Galerie nur das
  // Theme) duerfen die uebrigen Felder nicht auf Standard zuruecksetzen.
  function mergeThemePrefs(gespeichert, update) {
    const g = gespeichert && typeof gespeichert === 'object' ? gespeichert : {};
    const u = update && typeof update === 'object' ? update : {};
    // anpassungen pro Theme mischen: ein Update fuer Koi laesst Sakura stehen.
    const neu = u.anpassungen && typeof u.anpassungen === 'object' ? u.anpassungen : {};
    const anpassungen = { ...(g.anpassungen || {}), ...neu };
    const variante = { ...(g.variante || {}), ...(u.variante && typeof u.variante === 'object' ? u.variante : {}) };
    return cleanThemePrefs({ ...g, ...u, anpassungen, variante });
  }

  function anpassungFuer(prefs) {
    const p = prefs || {};
    return (p.anpassungen && p.anpassungen[p.theme]) || {};
  }
  function effektiveFarben(prefs) {
    const t = themeById(prefs && prefs.theme);
    const v = varianteFuer(prefs);
    return { ...t.farben, ...(v ? v.farben : {}), ...anpassungFuer(prefs) };
  }
  // Farbe der Balken ueber/unter dem Video; Neon behaelt Twitchs Schwarz.
  function balkenFarbe(prefs) {
    if (!prefs || cleanTheme(prefs.theme) === 'neon-dual') return null;
    return effektiveFarben(prefs).hintergrund;
  }

  function istKlickInsLeere(ziel) {
    if (!ziel || typeof ziel.closest !== 'function') return false;
    return ziel.closest(KLICK_SPERRE) === null;
  }

  return {
    THEMES, STANDARD_THEME, EFFEKT_STUFEN, STANDARD_EFFEKTE, EFFEKT_FAKTOR, KLICK_SPERRE,
    themeById, cleanTheme, cleanEffekte, cleanThemePrefs, mergeThemePrefs, istKlickInsLeere,
    cleanVariante, varianteVon, varianteFuer,
    FARB_SCHLUESSEL, SICHERE_FARBE, istSichereFarbe, cleanAnpassungen, anpassungFuer, effektiveFarben, balkenFarbe
  };
});
