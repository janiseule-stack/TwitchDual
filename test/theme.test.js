const { test } = require('node:test');
const assert = require('node:assert');
const ThemeLib = require('../renderer/lib/theme');

// --- normalizeHex ------------------------------------------------------------
test('normalizeHex: gueltige Hex-Formen werden normalisiert', () => {
  assert.equal(ThemeLib.normalizeHex('#35E0FF', '#000000'), '#35e0ff');
  assert.equal(ThemeLib.normalizeHex('35e0ff', '#000000'), '#35e0ff');
  assert.equal(ThemeLib.normalizeHex('#F4A', '#000000'), '#ff44aa'); // #RGB expandiert
  assert.equal(ThemeLib.normalizeHex('  #ff4fa3  ', '#000000'), '#ff4fa3');
});

test('normalizeHex: Muell faellt auf den Fallback zurueck', () => {
  assert.equal(ThemeLib.normalizeHex('#12345', '#ff4fa3'), '#ff4fa3');
  assert.equal(ThemeLib.normalizeHex('rot', '#ff4fa3'), '#ff4fa3');
  assert.equal(ThemeLib.normalizeHex('', '#ff4fa3'), '#ff4fa3');
  assert.equal(ThemeLib.normalizeHex(undefined, '#ff4fa3'), '#ff4fa3');
  assert.equal(ThemeLib.normalizeHex(null, '#ff4fa3'), '#ff4fa3');
  assert.equal(ThemeLib.normalizeHex(42, '#ff4fa3'), '#ff4fa3');
});

// --- accentVars ---------------------------------------------------------------
test('accentVars: liefert alle Variablen mit korrekten Ableitungen', () => {
  const v = ThemeLib.accentVars('#ff4fa3'); // rgb(255, 79, 163)
  assert.equal(v['--accent'], '#ff4fa3');
  assert.equal(v['--accent-border'], 'rgba(255, 79, 163, 0.4)');
  assert.equal(v['--accent-glow'], 'rgba(255, 79, 163, 0.2)');
  assert.equal(v['--accent-dim'], 'rgba(255, 79, 163, 0.3)');
  // Titeltext: 45 % Richtung Weiss gemischt -> heller als die Akzentfarbe.
  // g: 79+(255-79)*0.45 = 158 (0x9e), b: 163+(255-163)*0.45 = 204 (0xcc)
  assert.equal(v['--accent-title'], '#ff9ecc');
  // Panel: 7 % Akzent in den Grundton #0b0b11 gemischt.
  assert.equal(v['--panel'], '#1c101b');
});

test('accentVars: dunkle Nutzerfarbe ergibt trotzdem hellen Titelton', () => {
  const v = ThemeLib.accentVars('#220011'); // fast schwarz
  // mixWhite(0.45): 0x22=34 -> 34+(255-34)*.45 = 133 (0x85); 0x00 -> 115 (0x73); 0x11=17 -> 124 (0x7c)
  assert.equal(v['--accent-title'], '#85737c');
});

test('accentVars: kaputte Eingabe faellt auf den Video-Default zurueck', () => {
  const v = ThemeLib.accentVars('kaputt');
  assert.equal(v['--accent'], '#35e0ff');
});

// --- onAirState ----------------------------------------------------------------
test('onAirState: nur live + spielt ist on air', () => {
  assert.equal(ThemeLib.onAirState('live', 'playing'), 'onair');
  assert.equal(ThemeLib.onAirState('live', 'paused'), 'dimmed');
  assert.equal(ThemeLib.onAirState('live', 'ended'), 'dimmed');
  assert.equal(ThemeLib.onAirState('live', null), 'dimmed');     // Player noch nicht bereit
  assert.equal(ThemeLib.onAirState('vod', 'playing'), 'dimmed');
  assert.equal(ThemeLib.onAirState(null, 'playing'), 'dimmed');  // nichts geladen
  assert.equal(ThemeLib.onAirState(undefined, undefined), 'dimmed');
});
