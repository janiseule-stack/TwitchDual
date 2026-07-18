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
  assert.equal(v['--panel'], 'rgba(28, 16, 27, 1)'); // Default-Alpha 100 % = opak
  assert.equal(v['--bg'], 'rgba(11, 11, 17, 1)');
  assert.equal(v['--hover'], 'rgba(20, 20, 28, 1)');
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

// --- clampAlpha ---------------------------------------------------------------
test('clampAlpha: gueltige Prozente bleiben, gerundet', () => {
  assert.equal(ThemeLib.clampAlpha(100), 100);
  assert.equal(ThemeLib.clampAlpha(0), 0);
  assert.equal(ThemeLib.clampAlpha(55), 55);
  assert.equal(ThemeLib.clampAlpha(42.6), 43);
  assert.equal(ThemeLib.clampAlpha('80'), 80); // numerischer String
});

test('clampAlpha: Grenzen werden geklemmt', () => {
  assert.equal(ThemeLib.clampAlpha(140), 100);
  assert.equal(ThemeLib.clampAlpha(-20), 0);
});

test('clampAlpha: Muell/fehlend faellt auf 100 (nie unsichtbar)', () => {
  assert.equal(ThemeLib.clampAlpha(undefined), 100);
  assert.equal(ThemeLib.clampAlpha(null), 100);
  assert.equal(ThemeLib.clampAlpha('viel'), 100);
  assert.equal(ThemeLib.clampAlpha(NaN), 100);
  assert.equal(ThemeLib.clampAlpha({}), 100);
});

// --- accentContrast -----------------------------------------------------------
test('accentContrast: helle Akzentfarben bekommen dunklen Text', () => {
  assert.equal(ThemeLib.accentContrast('#35e0ff'), '#041018'); // Cyan-Default
  assert.equal(ThemeLib.accentContrast('#ff4fa3'), '#041018'); // Magenta-Default
  assert.equal(ThemeLib.accentContrast('#ffffff'), '#041018'); // Weiss
});

test('accentContrast: dunkle Akzentfarben bekommen hellen Text (Bug-Fix)', () => {
  assert.equal(ThemeLib.accentContrast('#000000'), '#f2f6ff'); // Schwarz
  assert.equal(ThemeLib.accentContrast('#1a1a1a'), '#f2f6ff'); // dunkelgrau
  assert.equal(ThemeLib.accentContrast('#3b0a2a'), '#f2f6ff'); // dunkles Magenta
});

test('accentContrast: kaputte Eingabe wie der Video-Default (hell -> dunkler Text)', () => {
  assert.equal(ThemeLib.accentContrast('kaputt'), '#041018');
});

// --- accentVars mit Alpha -----------------------------------------------------
test('accentVars: Alpha faerbt nur die Flaechen, nicht die Akzente', () => {
  const v = ThemeLib.accentVars('#ff4fa3', 40);
  assert.equal(v['--bg'], 'rgba(11, 11, 17, 0.4)');
  assert.equal(v['--panel'], 'rgba(28, 16, 27, 0.4)');
  assert.equal(v['--hover'], 'rgba(20, 20, 28, 0.4)');
  assert.equal(v['--accent'], '#ff4fa3');            // Akzent bleibt voll
  assert.equal(v['--accent-border'], 'rgba(255, 79, 163, 0.4)');
});

test('accentVars: 0 % ergibt vollkommen durchsichtige Flaechen', () => {
  const v = ThemeLib.accentVars('#35e0ff', 0);
  assert.equal(v['--bg'], 'rgba(11, 11, 17, 0)');
});

test('accentVars: kaputtes Alpha faellt auf 100 % (opak) zurueck', () => {
  const v = ThemeLib.accentVars('#35e0ff', 'kaputt');
  assert.equal(v['--bg'], 'rgba(11, 11, 17, 1)');
});

test('accentVars: setzt --accent-contrast passend zur Akzentfarbe', () => {
  assert.equal(ThemeLib.accentVars('#35e0ff')['--accent-contrast'], '#041018');
  assert.equal(ThemeLib.accentVars('#000000')['--accent-contrast'], '#f2f6ff');
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

// --- onAirLabel ------------------------------------------------------------
const _TL = require('../renderer/lib/theme');
test('onAirLabel: live + playing -> LIVE', () => {
  assert.strictEqual(_TL.onAirLabel('live', 'playing'), 'LIVE');
});
test('onAirLabel: vod + playing -> VOD', () => {
  assert.strictEqual(_TL.onAirLabel('vod', 'playing'), 'VOD');
});
test('onAirLabel: paused/idle -> null (dimmed, kein Label)', () => {
  assert.strictEqual(_TL.onAirLabel('live', 'paused'), null);
  assert.strictEqual(_TL.onAirLabel('vod', 'ended'), null);
  assert.strictEqual(_TL.onAirLabel(null, null), null);
});
