// DOM-freie Helfer fuer das Aussehen (Cozy-Raum): feste Werte, gespeicherte
// Fenster-Einstellungen und On-Air-Zustand. UMD wie chat-ui.js: laeuft im
// Browser (<script> -> window.ThemeLib) und unter Node -> testbar.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ThemeLib = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // pixelUebergang: Wechsel Raum <-> Regal als Pixel-Blende statt Zoom (Janis 13.11.)
  // Die Chat-Deckkraft entfiel mit der Chat-Stadt (Janis 13.11.2026): Chat immer deckend.
  const STANDARD_PREFS = Object.freeze({ animationen: true, pixelUebergang: false });
  const AKZENT = '#f9a650';   // = --accent in renderer/themes/cozy/farben.css
  const BALKEN = '#120505';   // = --bg; Flaeche ueber/unter dem Video
  // Zeichengleiche Kopie steht in preload.js (Sandbox: kein require);
  // test/balken-farbe.test.js haelt beide gleich.
  const SICHERE_FARBE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;

  // Farben aus Store oder CSS koennen Muell sein (Handedit, alte Version).
  // Akzeptiert #RGB und #RRGGBB, mit/ohne '#', beliebige Gross-/Kleinschreibung.
  function normalizeHex(input, fallback) {
    if (typeof input !== 'string') return fallback;
    let s = input.trim().toLowerCase();
    if (s[0] === '#') s = s.slice(1);
    if (/^[0-9a-f]{3}$/.test(s)) s = s.replace(/./g, (c) => c + c);
    if (!/^[0-9a-f]{6}$/.test(s)) return fallback;
    return '#' + s;
  }

  // On Air = Live-Kanal geladen UND Player spielt. Alles andere (VOD, Pause,
  // Ende, nichts geladen, Player noch nicht bereit) ist gedimmt - nie
  // faelschlich "on air".
  function onAirState(mode, playerState) {
    return mode === 'live' && playerState === 'playing' ? 'onair' : 'dimmed';
  }

  // Label + Glow-Ausloeser der On-Air-Leiste: 'LIVE' (Live-Kanal spielt),
  // 'VOD' (VOD spielt), sonst null (dimmed, kein Label). VOD glueht wie Live.
  function onAirLabel(mode, playerState) {
    if (playerState !== 'playing') return null;
    if (mode === 'live') return 'LIVE';
    if (mode === 'vod') return 'VOD';
    return null;
  }

  // Store-Inhalt kann alt oder kaputt sein: nur die bekannten Felder
  // bleiben (eine alte chatAlpha faellt weg). Umzug: wer frueher effekte 'aus'
  // hatte, behaelt Animationen aus, solange kein echtes animationen-Feld gespeichert ist.
  function cleanThemePrefs(roh) {
    const p = roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {};
    const animationen = typeof p.animationen === 'boolean' ? p.animationen : p.effekte !== 'aus';
    return { animationen, pixelUebergang: p.pixelUebergang === true };
  }

  // Teil-Updates (nur ein Feld) lassen die anderen Felder stehen.
  function mergeThemePrefs(gespeichert, update) {
    const basis = cleanThemePrefs(gespeichert);
    const u = update && typeof update === 'object' && !Array.isArray(update) ? update : {};
    const neu = { ...basis };
    if ('animationen' in u) neu.animationen = u.animationen;
    if ('pixelUebergang' in u) neu.pixelUebergang = u.pixelUebergang;
    const sauber = cleanThemePrefs(neu);
    // ein kaputtes Feld im Update darf das Gespeicherte nicht umwerfen
    if (typeof neu.animationen !== 'boolean') sauber.animationen = basis.animationen;
    if (typeof neu.pixelUebergang !== 'boolean') sauber.pixelUebergang = basis.pixelUebergang;
    return sauber;
  }

  return { STANDARD_PREFS, AKZENT, BALKEN, SICHERE_FARBE, normalizeHex, onAirState, onAirLabel,
    cleanThemePrefs, mergeThemePrefs };
});
