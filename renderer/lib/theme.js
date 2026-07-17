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
  const DEFAULTS = { videoAccent: '#35e0ff', chatAccent: '#ff4fa3', videoAlpha: 100, chatAlpha: 100 };
  const BG = { r: 11, g: 11, b: 17 };    // Grundton #0b0b11 (fuer die Panel-Toenung)
  const HOVER = { r: 20, g: 20, b: 28 }; // neutrale Hover-/Panel-Flaeche #14141c

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

  // Prozent-Deckkraft 0..100. Kaputt/fehlend -> 100 (nie versehentlich
  // unsichtbar durch alte/kaputte Store-Werte).
  function clampAlpha(input) {
    // Nur echte Zahlen oder nicht-leere numerische Strings zaehlen; alles
    // andere (null, {}, '', 'viel', NaN) -> 100. (Number(null) waere 0!)
    if (typeof input !== 'number' && typeof input !== 'string') return 100;
    if (typeof input === 'string' && input.trim() === '') return 100;
    const n = Number(input);
    if (!Number.isFinite(n)) return 100;
    return Math.round(Math.min(100, Math.max(0, n)));
  }

  // Relative Luminanz (WCAG) einer 0..255-Komponente linearisieren.
  function relLuminance({ r, g, b }) {
    const lin = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  // Textton (dunkel #041018 oder hell #f2f6ff) mit dem hoeheren
  // WCAG-Kontrastverhaeltnis zur Akzentfarbe. Kein magischer Schwellwert -
  // fuer Cyan/Magenta ergibt das wie bisher dunklen Text, fuer Schwarz hellen.
  function accentContrast(hex) {
    const rgb = hexToRgb(normalizeHex(hex, DEFAULTS.videoAccent));
    const la = relLuminance(rgb);
    const ratio = (other) => {
      const hi = Math.max(la, other) + 0.05;
      const lo = Math.min(la, other) + 0.05;
      return hi / lo;
    };
    const DARK = relLuminance({ r: 4, g: 16, b: 24 });      // #041018
    const LIGHT = relLuminance({ r: 242, g: 246, b: 255 }); // #f2f6ff
    return ratio(DARK) >= ratio(LIGHT) ? '#041018' : '#f2f6ff';
  }

  // Aus Akzentfarbe + Deckkraft alle CSS-Variablen ableiten. Flaechen
  // (--bg/--panel/--hover) tragen das Alpha; Akzente bleiben voll. Kaputte
  // Eingabe faellt auf den Video-Default zurueck - App startet nie ohne Farben.
  function accentVars(hex, alphaPct) {
    const clean = normalizeHex(hex, DEFAULTS.videoAccent);
    const rgb = hexToRgb(clean);
    const a = clampAlpha(alphaPct) / 100;
    const accentRgba = (al) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${al})`;
    const surface = (c) => `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
    return {
      '--accent': clean,
      '--accent-title': rgbToHex(mixWhite(rgb, 0.45)),
      '--accent-border': accentRgba(0.4),
      '--accent-glow': accentRgba(0.2),
      '--accent-dim': accentRgba(0.3),
      '--accent-contrast': accentContrast(clean),
      '--bg': surface(BG),
      '--panel': surface(tintPanel(rgb)),
      '--hover': surface(HOVER)
    };
  }

  // On Air = Live-Kanal geladen UND Player spielt. Alles andere (VOD, Pause,
  // Ende, nichts geladen, Player noch nicht bereit) ist gedimmt - nie
  // faelschlich "on air" (Spec Paket 3 / Fehlerfaelle).
  function onAirState(mode, playerState) {
    return mode === 'live' && playerState === 'playing' ? 'onair' : 'dimmed';
  }

  return { DEFAULTS, normalizeHex, accentVars, accentContrast, clampAlpha, onAirState };
});
