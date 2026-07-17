// DOM-freie Theme-Helfer fuer "Neon Dual - On Air" (v1.5.0): Hex-Validierung,
// Ableitung der CSS-Akzentvariablen und On-Air-Zustand. UMD wie chat-ui.js:
// laeuft im Browser (<script> -> window.ThemeLib) und unter Node -> testbar.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ThemeLib = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULTS = { videoAccent: '#35e0ff', chatAccent: '#ff4fa3' };
  const BG = { r: 11, g: 11, b: 17 }; // Grundton #0b0b11 (fuer die Panel-Toenung)

  // Nutzerfarben aus dem Store koennen Muell sein (Handedit, alte Version).
  // Akzeptiert #RGB und #RRGGBB, mit/ohne '#', beliebige Gross-/Kleinschreibung.
  function normalizeHex(input, fallback) {
    if (typeof input !== 'string') return fallback;
    let s = input.trim().toLowerCase();
    if (s[0] === '#') s = s.slice(1);
    if (/^[0-9a-f]{3}$/.test(s)) s = s.replace(/./g, (c) => c + c);
    if (!/^[0-9a-f]{6}$/.test(s)) return fallback;
    return '#' + s;
  }

  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function rgbToHex({ r, g, b }) {
    const p = (n) => n.toString(16).padStart(2, '0');
    return '#' + p(r) + p(g) + p(b);
  }

  // amount Richtung Weiss mischen (0..1) - Titeltext bleibt auch bei dunklen
  // Nutzerfarben auf den dunklen Leisten lesbar.
  function mixWhite(rgb, amount) {
    const m = (c) => Math.round(c + (255 - c) * amount);
    return { r: m(rgb.r), g: m(rgb.g), b: m(rgb.b) };
  }

  // Leisten-/Panelfarbe: 7 % Akzent in den Grundton gemischt, damit jedes
  // Fenster leicht zur eigenen Farbe toent (Spec 1.1).
  function tintPanel(rgb) {
    const m = (b, a) => Math.round(b + (a - b) * 0.07);
    return { r: m(BG.r, rgb.r), g: m(BG.g, rgb.g), b: m(BG.b, rgb.b) };
  }

  // Aus einer Akzentfarbe alle CSS-Variablen ableiten. Kaputte Eingabe faellt
  // auf den Video-Default zurueck - die App startet nie ohne gueltige Farben.
  function accentVars(hex) {
    const clean = normalizeHex(hex, DEFAULTS.videoAccent);
    const rgb = hexToRgb(clean);
    const rgba = (a) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
    return {
      '--accent': clean,
      '--accent-title': rgbToHex(mixWhite(rgb, 0.45)),
      '--accent-border': rgba(0.4),
      '--accent-glow': rgba(0.2),
      '--accent-dim': rgba(0.3),
      '--panel': rgbToHex(tintPanel(rgb))
    };
  }

  // On Air = Live-Kanal geladen UND Player spielt. Alles andere (VOD, Pause,
  // Ende, nichts geladen, Player noch nicht bereit) ist gedimmt - nie
  // faelschlich "on air" (Spec Paket 3 / Fehlerfaelle).
  function onAirState(mode, playerState) {
    return mode === 'live' && playerState === 'playing' ? 'onair' : 'dimmed';
  }

  return { DEFAULTS, normalizeHex, accentVars, onAirState };
});
