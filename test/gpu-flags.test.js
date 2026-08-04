const { test } = require('node:test');
const assert = require('node:assert');
const { SWITCHES, DEFAULT_STATE, decideMode, nextState, applyGpuFlags } = require('../src/gpu-flags');

test('SWITCHES enthaelt genau die fuenf dokumentierten Switches', () => {
  assert.deepEqual(SWITCHES, [
    'ignore-gpu-blocklist',
    'enable-gpu-rasterization',
    'enable-zero-copy',
    'enable-hardware-overlays',
    'disable-gpu-driver-bug-workarounds'
  ]);
});

test('Erststart ohne gespeicherten Zustand -> accel', () => {
  assert.equal(decideMode(undefined, {}), 'accel');
  assert.equal(decideMode(null, {}), 'accel');
});

test('sauberer Vorstart -> accel', () => {
  assert.equal(decideMode({ mode: 'accel', pending: false }, {}), 'accel');
});

test('offene pending-Marke -> safe (voriger Start hat nicht ueberlebt)', () => {
  assert.equal(decideMode({ mode: 'accel', pending: true }, {}), 'safe');
});

test('einmal safe, immer safe', () => {
  assert.equal(decideMode({ mode: 'safe', pending: false }, {}), 'safe');
});

test('TWITCHDUAL_NO_GPU=1 ueberschreibt jeden gespeicherten Zustand', () => {
  const env = { TWITCHDUAL_NO_GPU: '1' };
  assert.equal(decideMode({ mode: 'accel', pending: false }, env), 'safe');
  assert.equal(decideMode(DEFAULT_STATE, env), 'safe');
});

test('TWITCHDUAL_NO_GPU mit anderem Wert wirkt nicht', () => {
  assert.equal(decideMode({ mode: 'accel', pending: false }, { TWITCHDUAL_NO_GPU: '0' }), 'accel');
});

test('nextState: start-accel setzt die pending-Marke', () => {
  assert.deepEqual(nextState(DEFAULT_STATE, 'start-accel'), { mode: 'accel', pending: true });
});

test('nextState: start-safe merkt safe dauerhaft', () => {
  assert.deepEqual(nextState({ mode: 'accel', pending: true }, 'start-safe'), { mode: 'safe', pending: false });
});

test('nextState: render-ok loescht die Marke, behaelt den Modus', () => {
  assert.deepEqual(nextState({ mode: 'accel', pending: true }, 'render-ok'), { mode: 'accel', pending: false });
});

test('nextState: gpu-crash zwingt auf safe', () => {
  assert.deepEqual(nextState({ mode: 'accel', pending: true }, 'gpu-crash'), { mode: 'safe', pending: false });
});

test('nextState ist idempotent', () => {
  for (const ev of ['start-accel', 'start-safe', 'render-ok', 'gpu-crash']) {
    const once = nextState(DEFAULT_STATE, ev);
    assert.deepEqual(nextState(once, ev), once, `nicht idempotent: ${ev}`);
  }
});

test('nextState ignoriert unbekannte Ereignisse', () => {
  assert.deepEqual(nextState({ mode: 'accel', pending: true }, 'quatsch'), { mode: 'accel', pending: true });
});

function fakeCommandLine() {
  const applied = [];
  return { applied, appendSwitch: (name) => applied.push(name) };
}

test('applyGpuFlags setzt im accel-Modus alle fuenf Switches', () => {
  const cl = fakeCommandLine();
  const st = applyGpuFlags({ commandLine: cl, state: DEFAULT_STATE, env: {}, log: () => {} });
  assert.deepEqual(cl.applied, SWITCHES);
  assert.deepEqual(st, { mode: 'accel', pending: true });
});

test('applyGpuFlags setzt im safe-Modus keinen einzigen Switch', () => {
  const cl = fakeCommandLine();
  const st = applyGpuFlags({
    commandLine: cl,
    state: { mode: 'accel', pending: true },
    env: {},
    log: () => {}
  });
  assert.deepEqual(cl.applied, []);
  assert.deepEqual(st, { mode: 'safe', pending: false });
});

test('applyGpuFlags respektiert TWITCHDUAL_NO_GPU=1', () => {
  const cl = fakeCommandLine();
  applyGpuFlags({
    commandLine: cl,
    state: DEFAULT_STATE,
    env: { TWITCHDUAL_NO_GPU: '1' },
    log: () => {}
  });
  assert.deepEqual(cl.applied, []);
});

test('applyGpuFlags protokolliert den gewaehlten Modus', () => {
  const seen = [];
  applyGpuFlags({
    commandLine: fakeCommandLine(),
    state: DEFAULT_STATE,
    env: {},
    log: (event, detail) => seen.push([event, detail])
  });
  assert.deepEqual(seen, [['gpu-mode', 'accel']]);
});
