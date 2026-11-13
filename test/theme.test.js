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

// --- Deckkraft entfaellt (Chat-Stadt, Janis 13.11.2026) -----------------------
test('Deckkraft-Einstellung gibt es nicht mehr', () => {
  assert.strictEqual(ThemeLib.clampAlpha, undefined);
  assert.ok(!('chatAlpha' in ThemeLib.STANDARD_PREFS));
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
    assert.deepStrictEqual(T.cleanThemePrefs(roh), { animationen: true, pixelUebergang: false });
  }
});
// Janis 13.11.: Zoom ist Standard, die Pixel-Blende Raum <-> Regal gibt es als Einstellung.
test('pixelUebergang: Standard aus, nur echte Booleans, Teil-Update laesst die anderen Felder stehen', () => {
  assert.strictEqual(T.STANDARD_PREFS.pixelUebergang, false);
  assert.strictEqual(T.cleanThemePrefs({ pixelUebergang: true }).pixelUebergang, true);
  assert.strictEqual(T.cleanThemePrefs({ pixelUebergang: 'ja' }).pixelUebergang, false);
  const g = { animationen: false, pixelUebergang: true };
  assert.deepStrictEqual(T.mergeThemePrefs(g, { animationen: true }), { animationen: true, pixelUebergang: true });
  assert.deepStrictEqual(T.mergeThemePrefs(g, { pixelUebergang: false }), { animationen: false, pixelUebergang: false });
  // kaputter Wert im Update wirft das Gespeicherte nicht um
  assert.strictEqual(T.mergeThemePrefs(g, { pixelUebergang: 'nein' }).pixelUebergang, true);
});
test('cleanThemePrefs: alte Felder verschwinden, auch eine gespeicherte Deckkraft', () => {
  const alt = { videoAccent: '#35e0ff', chatAccent: '#ff4fa3', chatAlpha: 60, theme: 'koi', effekte: 'normal',
    anpassungen: { 'koi:tusche': { akzent: '#112233' } }, variante: { koi: 'tusche' }, saat: { koi: 5 },
    gastHaeufigkeit: 'oft', gastAnzahl: 'schwarm' };
  assert.deepStrictEqual(T.cleanThemePrefs(alt), { animationen: true, pixelUebergang: false });
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
test('mergeThemePrefs: Teil-Update laesst das andere Feld stehen, Deckkraft im Update wird ignoriert', () => {
  const g = { animationen: false, pixelUebergang: false };
  assert.deepStrictEqual(T.mergeThemePrefs(g, { chatAlpha: 80 }), { animationen: false, pixelUebergang: false });
  assert.deepStrictEqual(T.mergeThemePrefs(g, { animationen: true }), { animationen: true, pixelUebergang: false });
  assert.deepStrictEqual(T.mergeThemePrefs(g, null), g);
  assert.deepStrictEqual(T.mergeThemePrefs(null, null), { animationen: true, pixelUebergang: false });
});
test('mergeThemePrefs: alter Store mit effekte aus + Update ohne animationen bleibt aus', () => {
  assert.strictEqual(T.mergeThemePrefs({ effekte: 'aus', chatAlpha: 100 }, { pixelUebergang: true }).animationen, false);
});
test('feste Werte: Akzent, Balken, Farbfilter', () => {
  assert.strictEqual(T.AKZENT, '#f9a650');
  assert.strictEqual(T.BALKEN, '#120505');
  assert.ok(T.SICHERE_FARBE.test(T.BALKEN));
  assert.ok(!T.SICHERE_FARBE.test('red; } body { display: none'));
});
