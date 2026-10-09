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
    // Gezeichnete Welt: Grundstile wie Koi + eigene (Pixel, Hanami-Fluss, Shoji).
    { id: 'sakura', name: 'Sakura', hell: true, farbenFrei: false, info: 'Kirschblüten',
      vorschau: 'linear-gradient(160deg, #fff0f5, #ffe4ec 50%, #f3e8ff)',
      farben: { akzent: '#c4507e', hintergrund: '#fbeef2', partikel: '#f7a8c4' },
      varianten: [
        { id: 'aquarell', name: 'Aquarell', hell: true,
          farben: { akzent: '#c4507e', hintergrund: '#fbeef2', partikel: '#f7a8c4' } },
        { id: 'lofi', name: 'Lofi-Nacht', hell: false,
          farben: { akzent: '#ff9ec8', hintergrund: '#1e1c46', partikel: '#ffb6d5' } },
        { id: 'holzschnitt', name: 'Holzschnitt', hell: true,
          farben: { akzent: '#c0392b', hintergrund: '#efe3c8', partikel: '#f2a0b4' } },
        { id: 'tusche', name: 'Tusche', hell: true,
          farben: { akzent: '#b0302a', hintergrund: '#f4efe3', partikel: '#f0a6bd' } },
        { id: 'bleiglas', name: 'Bleiglas', hell: false,
          farben: { akzent: '#ff8fb8', hintergrund: '#1a2440', partikel: '#ff8fb8' } },
        { id: 'pixel', name: 'Pixel', hell: false,
          farben: { akzent: '#ff9cc7', hintergrund: '#2b2140', partikel: '#ff9cc7' } },
        { id: 'fluss', name: 'Hanami-Fluss', hell: true,
          farben: { akzent: '#2f7a8a', hintergrund: '#eef5f4', partikel: '#f7a8c4' } },
        { id: 'shoji', name: 'Shoji-Schatten', hell: true,
          farben: { akzent: '#a8433a', hintergrund: '#f1e2c6', partikel: '#5a3a46' } }
      ] },
    // Gezeichnete Welt mit Varianten (Canvas): Theme-Farben = erste Variante.
    { id: 'wald', name: 'Wald', hell: true, farbenFrei: false, info: 'Glühwürmchen',
      vorschau: 'linear-gradient(180deg, #c9dce6, #a8c4c6 55%, #4f7a68)',
      farben: { akzent: '#3f7a5e', hintergrund: '#e6ece6', partikel: '#c8e65a' },
      varianten: [
        { id: 'aquarell', name: 'Aquarell', hell: true,
          farben: { akzent: '#3f7a5e', hintergrund: '#e6ece6', partikel: '#c8e65a' } },
        { id: 'lofi', name: 'Lofi-Nacht', hell: false,
          farben: { akzent: '#c8ff7a', hintergrund: '#1c1a44', partikel: '#e8ff7a' } },
        { id: 'tusche', name: 'Tusche', hell: true,
          farben: { akzent: '#2f4a3a', hintergrund: '#f4f0e5', partikel: '#c9a227' } },
        { id: 'bleiglas', name: 'Bleiglas', hell: false,
          farben: { akzent: '#9fe07a', hintergrund: '#0d1418', partikel: '#eaff8a' } },
        { id: 'pixel', name: 'Pixel', hell: false,
          farben: { akzent: '#b6f07a', hintergrund: '#16123f', partikel: '#e8ff7a' } },
        { id: 'pilze', name: 'Leuchtpilze', hell: false,
          farben: { akzent: '#7af0ff', hintergrund: '#0b1a22', partikel: '#82f0ff' } },
        { id: 'licht', name: 'Lichtstrahlen', hell: true,
          farben: { akzent: '#4f7a3a', hintergrund: '#e8f2d8', partikel: '#f3dc6a' } },
        { id: 'huette', name: 'Waldhütte', hell: false,
          farben: { akzent: '#ffd27a', hintergrund: '#161c3a', partikel: '#e8ff7a' } }
      ] },
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
    { id: 'blasen', name: 'Seifenblasen', hell: true, ausgeblendet: true, farbenFrei: false, info: 'Seifenblasen',
      vorschau: 'linear-gradient(180deg, #dff3ff, #f4eaff)',
      farben: { akzent: '#7b6cff', hintergrund: '#f0f7ff', partikel: '#aac8ff' } }
  ];
  const STANDARD_THEME = 'neon-dual';
  const EFFEKT_STUFEN = ['aus', 'wenig', 'normal', 'viel'];
  const STANDARD_EFFEKTE = 'normal';
  const EFFEKT_FAKTOR = { aus: 0, wenig: 0.4, normal: 1, viel: 1.8 };
  // Gast im Video (⚙ Effekte): wie oft (Abstand in ms, [min, max]) und wie viele.
  const GAST_HAEUFIGKEIT = { aus: null, selten: [300000, 480000], normal: [120000, 240000], oft: [40000, 90000] };
  const GAST_HAEUFIGKEITEN = ['aus', 'selten', 'normal', 'oft'];
  const GAST_ANZAHLEN = ['eins', 'wenige', 'schwarm'];
  function cleanGastHaeufigkeit(w) { return GAST_HAEUFIGKEITEN.includes(w) ? w : 'normal'; }
  function cleanGastAnzahl(w) { return GAST_ANZAHLEN.includes(w) ? w : 'eins'; }
  function gastIntervall(prefs) { return GAST_HAEUFIGKEIT[cleanGastHaeufigkeit(prefs && prefs.gastHaeufigkeit)]; }
  function gastAnzahl(prefs, zufall) {
    const a = cleanGastAnzahl(prefs && prefs.gastAnzahl);
    if (a === 'schwarm') return 5;
    if (a === 'wenige') return (zufall || Math.random)() < 0.5 ? 2 : 3;
    return 1;
  }
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
  // Themes mit Varianten speichern pro Variante ("koi:tusche"), sonst
  // legten sich die Farben einer Variante ueber alle anderen.
  function anpassungsSchluessel(themeId, varianteId) {
    const t = themeById(themeId);
    if (!t.varianten) return t.id;
    const v = varianteVon(t.id, varianteId);
    return t.id + ':' + v.id;
  }
  function gueltigeSchluessel() {
    const alle = [];
    for (const t of THEMES) {
      if (t.id === 'neon-dual') continue;
      if (t.varianten) for (const v of t.varianten) alle.push(t.id + ':' + v.id);
      else alle.push(t.id);
    }
    return alle;
  }
  function cleanAnpassungen(roh) {
    const aus = {};
    if (!roh || typeof roh !== 'object') return aus;
    for (const schluessel of gueltigeSchluessel()) {
      const a = roh[schluessel];
      if (!a || typeof a !== 'object') continue;
      const sauber = {};
      for (const k of FARB_SCHLUESSEL) {
        const hex = ThemeLib.normalizeHex(a[k], null);
        if (hex) sauber[k] = hex;
      }
      if (Object.keys(sauber).length) aus[schluessel] = sauber;
    }
    return aus;
  }

  // Varianten (gezeichnete Welten): pro Theme die gewaehlte Variante, nur
  // gueltige Ids; fehlt sie, gilt die erste. Themes ohne Varianten -> null.
  // 🎲: Startwert fuer den Zufall der Welt je Theme (gleicher Wert = gleiches
  // Layout, auch nach Neustart). Nur ganze Zahlen fuer bekannte Themes.
  function cleanSaat(roh) {
    const aus = {};
    if (!roh || typeof roh !== 'object') return aus;
    for (const t of THEMES) {
      const v = roh[t.id];
      if (typeof v === 'number' && Number.isFinite(v)) aus[t.id] = Math.floor(Math.abs(v)) % 4294967296;
    }
    return aus;
  }

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

  // Was die Galerie anbietet (ausgeblendete Themes bleiben im Code).
  function sichtbareThemes() { return THEMES.filter((t) => !t.ausgeblendet); }

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
      variante: cleanVariante(p.variante),
      saat: cleanSaat(p.saat),
      gastHaeufigkeit: cleanGastHaeufigkeit(p.gastHaeufigkeit),
      gastAnzahl: cleanGastAnzahl(p.gastAnzahl)
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
    const saat = { ...(g.saat || {}), ...(u.saat && typeof u.saat === 'object' ? u.saat : {}) };
    return cleanThemePrefs({ ...g, ...u, anpassungen, variante, saat });
  }

  // Schluessel der Anpassung fuer die aktuelle Wahl (Theme bzw. Theme:Variante).
  function anpassungsSchluesselFuer(prefs) {
    const p = prefs || {};
    const id = cleanTheme(p.theme);
    return anpassungsSchluessel(id, p.variante && p.variante[id]);
  }
  function anpassungFuer(prefs) {
    const p = prefs || {};
    return (p.anpassungen && p.anpassungen[anpassungsSchluesselFuer(p)]) || {};
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
    sichtbareThemes, cleanVariante, varianteVon, varianteFuer, anpassungsSchluessel, anpassungsSchluesselFuer,
    GAST_HAEUFIGKEITEN, GAST_ANZAHLEN, cleanGastHaeufigkeit, cleanGastAnzahl, gastIntervall, gastAnzahl,
    FARB_SCHLUESSEL, SICHERE_FARBE, istSichereFarbe, cleanAnpassungen, anpassungFuer, effektiveFarben, balkenFarbe
  };
});
