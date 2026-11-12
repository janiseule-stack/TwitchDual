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

// --- Cozy-Raum: feste Werte und geschrumpfte Einstellungen -------------------
const T = ThemeLib;
test('cleanThemePrefs: leer/Muell -> Standard', () => {
  for (const roh of [null, undefined, 'x', 7, [], {}]) {
    assert.deepStrictEqual(T.cleanThemePrefs(roh), { chatAlpha: 100, animationen: true, pixelUebergang: false });
  }
});
// Janis 13.11.: Zoom ist Standard, die Pixel-Blende Raum <-> Regal gibt es als Einstellung.
test('pixelUebergang: Standard aus, nur echte Booleans, Teil-Update laesst die anderen Felder stehen', () => {
  assert.strictEqual(T.STANDARD_PREFS.pixelUebergang, false);
  assert.strictEqual(T.cleanThemePrefs({ pixelUebergang: true }).pixelUebergang, true);
  assert.strictEqual(T.cleanThemePrefs({ pixelUebergang: 'ja' }).pixelUebergang, false);
  const g = { chatAlpha: 60, animationen: false, pixelUebergang: true };
  assert.deepStrictEqual(T.mergeThemePrefs(g, { chatAlpha: 80 }), { chatAlpha: 80, animationen: false, pixelUebergang: true });
  assert.deepStrictEqual(T.mergeThemePrefs(g, { pixelUebergang: false }), { chatAlpha: 60, animationen: false, pixelUebergang: false });
  // kaputter Wert im Update wirft das Gespeicherte nicht um
  assert.strictEqual(T.mergeThemePrefs(g, { pixelUebergang: 'nein' }).pixelUebergang, true);
});
test('cleanThemePrefs: alte Felder verschwinden, chatAlpha bleibt', () => {
  const alt = { videoAccent: '#35e0ff', chatAccent: '#ff4fa3', chatAlpha: 60, theme: 'koi', effekte: 'normal',
    anpassungen: { 'koi:tusche': { akzent: '#112233' } }, variante: { koi: 'tusche' }, saat: { koi: 5 },
    gastHaeufigkeit: 'oft', gastAnzahl: 'schwarm' };
  assert.deepStrictEqual(T.cleanThemePrefs(alt), { chatAlpha: 60, animationen: true, pixelUebergang: false });
});
test('cleanThemePrefs: Umzug effekte aus -> animationen false', () => {
  assert.strictEqual(T.cleanThemePrefs({ effekte: 'aus' }).animationen, false);
  assert.strictEqual(T.cleanThemePrefs({ effekte: 'wenig' }).animationen, true);
  // ein echtes animationen-Feld schlaegt das alte effekte-Feld
  assert.strictEqual(T.cleanThemePrefs({ effekte: 'aus', animationen: true }).animationen, true);
  // nur echte Booleans zaehlen
  assert.strictEqual(T.cleanThemePrefs({ animationen: 'aus' }).animationen, true);
  assert.strictEqual(T.cleanThemePrefs({ animationen: false }).animationen, false);
});
test('cleanThemePrefs: kaputte Deckkraft -> 100', () => {
  assert.strictEqual(T.cleanThemePrefs({ chatAlpha: 'viel' }).chatAlpha, 100);
  assert.strictEqual(T.cleanThemePrefs({ chatAlpha: -5 }).chatAlpha, 0);
});
test('mergeThemePrefs: Teil-Update laesst das andere Feld stehen', () => {
  const g = { chatAlpha: 60, animationen: false, pixelUebergang: false };
  assert.deepStrictEqual(T.mergeThemePrefs(g, { chatAlpha: 80 }), { chatAlpha: 80, animationen: false, pixelUebergang: false });
  assert.deepStrictEqual(T.mergeThemePrefs(g, { animationen: true }), { chatAlpha: 60, animationen: true, pixelUebergang: false });
  assert.deepStrictEqual(T.mergeThemePrefs(g, null), g);
  assert.deepStrictEqual(T.mergeThemePrefs(null, null), { chatAlpha: 100, animationen: true, pixelUebergang: false });
});
test('mergeThemePrefs: alter Store mit effekte aus + Update ohne animationen bleibt aus', () => {
  assert.strictEqual(T.mergeThemePrefs({ effekte: 'aus', chatAlpha: 100 }, { chatAlpha: 90 }).animationen, false);
});
test('feste Werte: Akzent, Balken, Farbfilter', () => {
  assert.strictEqual(T.AKZENT, '#f9a650');
  assert.strictEqual(T.BALKEN, '#120505');
  assert.ok(T.SICHERE_FARBE.test(T.BALKEN));
  assert.ok(!T.SICHERE_FARBE.test('red; } body { display: none'));
});
