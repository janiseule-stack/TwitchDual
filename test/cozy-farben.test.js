// Feste Farbpalette aus dem Raum-Bild (Cozy-Raum Etappe 1a): eine Datei setzt
// alle Variablen, beide Fenster binden sie zuerst ein.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const wurzel = path.join(__dirname, '..');
const lies = (p) => fs.readFileSync(path.join(wurzel, p), 'utf8');
const T = require('../renderer/lib/theme');

const css = fs.existsSync(path.join(wurzel, 'renderer/themes/cozy/farben.css')) ? lies('renderer/themes/cozy/farben.css') : '';
const vars = {};
const anzahl = {};
for (const m of css.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)) {
  vars[m[1]] = m[2].trim();
  anzahl[m[1]] = (anzahl[m[1]] || 0) + 1;
}

// '#rrggbb' oder 'rgb(r g b / …)' -> [r, g, b]
function rgb(farbe) {
  const hex = /^#([0-9a-f]{6})$/i.exec(farbe);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(farbe);
  assert.ok(m, 'keine Farbe: ' + farbe);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function rgbZuHex(farbe) {
  return '#' + rgb(farbe).map((n) => n.toString(16).padStart(2, '0')).join('');
}
// WCAG-Kontrastverhaeltnis
function leuchtdichte(farbe) {
  const [r, g, b] = rgb(farbe).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function kontrast(a, b) {
  const la = leuchtdichte(a);
  const lb = leuchtdichte(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const VERTRAG = ['--chat-alpha', '--accent', '--accent-title', '--accent-border', '--accent-glow', '--accent-dim',
  '--accent-contrast', '--bg', '--panel', '--hover', '--line', '--text', '--muted', '--ts',
  '--onair-from', '--onair-to', '--mono'];

test('farben.css setzt jede Variable des Vertrags genau einmal', () => {
  for (const k of VERTRAG) assert.strictEqual(anzahl[k], 1, k);
  assert.strictEqual((css.match(/:root/g) || []).length, 1);
});
test('Flaechen tragen --chat-alpha, Schrift und Akzent nicht', () => {
  for (const k of ['--bg', '--panel', '--hover']) assert.ok(vars[k].includes('var(--chat-alpha)'));
  for (const k of ['--text', '--muted', '--accent', '--line']) assert.ok(!vars[k].includes('--chat-alpha'));
});
test('--accent entspricht ThemeLib.AKZENT, --bg entspricht ThemeLib.BALKEN', () => {
  assert.strictEqual(vars['--accent'], T.AKZENT);
  assert.strictEqual(rgbZuHex(vars['--bg']), T.BALKEN);   // rgb(18 5 5 / …) -> #120505
});
test('Lesbarkeit: Kontrast gegen den Grund', () => {
  assert.ok(kontrast(vars['--text'], '#120505') >= 10);
  assert.ok(kontrast(vars['--muted'], '#120505') >= 4.5);
  assert.ok(kontrast(vars['--ts'], '#120505') >= 3);
  assert.ok(kontrast(vars['--accent-contrast'], vars['--accent']) >= 7);
});
test('beide Fenster binden farben.css vor ihrem eigenen Stylesheet ein und haben keinen eigenen :root-Farbblock', () => {
  for (const [datei, eigenes] of [['renderer/chat/index.html', 'href="chat.css"'], ['renderer/video/index.html', 'href="home.css"']]) {
    const html = lies(datei);
    const i = html.indexOf('../themes/cozy/farben.css');
    assert.ok(i > -1 && i < html.indexOf(eigenes), datei);
  }
  for (const datei of ['renderer/chat/chat.css', 'renderer/video/index.html']) {
    assert.ok(!/--(accent|bg)\s*:/.test(lies(datei)), datei);
  }
});
