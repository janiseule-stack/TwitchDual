const { test } = require('node:test');
const assert = require('node:assert');
const createVolumeGuard = require('../renderer/lib/volume-guard');

// Die Zeitstempel stammen aus adblock-diag.log vom 2026-08-09 (echter Vorfall).

test('normaler Betrieb: kein Eingriff', () => {
  const g = createVolumeGuard();
  assert.equal(g.observe({ muted: false, volume: 0.11 }, 1000), null);
  assert.equal(g.observe({ muted: false, volume: 0.11 }, 2000), null);
});

test('Nutzer hat gemutet: kein Eingriff', () => {
  const g = createVolumeGuard();
  g.observe({ muted: false, volume: 0.11 }, 1000);
  assert.equal(g.observe({ muted: true, volume: 0.11 }, 2000), null);
  assert.equal(g.observe({ muted: true, volume: 0.11 }, 9000), null);
});

test('Nutzer zieht den Regler auf 0: Twitch setzt muted -> kein Eingriff', () => {
  const g = createVolumeGuard();
  g.observe({ muted: false, volume: 0.11 }, 1000);
  // Twitch schaltet beim Regler-auf-0 zusaetzlich muted=true.
  assert.equal(g.observe({ muted: true, volume: 0 }, 2000), null);
  assert.equal(g.observe({ muted: true, volume: 0 }, 9000), null);
});

test('gesunder Reload: kurzes volume=0, dann zurueck -> kein Fehlalarm', () => {
  const g = createVolumeGuard();
  g.observe({ muted: false, volume: 0.11 }, 0);
  // 18:25:05.618 -> 18:25:05.897 im echten Log: 279 ms spaeter war 0.11 zurueck.
  assert.equal(g.observe({ muted: false, volume: 0 }, 618), null);
  assert.equal(g.observe({ muted: false, volume: 0.11 }, 897), null);
  assert.equal(g.observe({ muted: false, volume: 0.11 }, 2500), null);
});

test('der Bug: unmuted auf volume=0 haelt an -> stellt letzten guten Wert her', () => {
  const g = createVolumeGuard({ graceMs: 1500 });
  g.observe({ muted: false, volume: 0.11 }, 0);
  // 17:31:16.013 vaft pre-muted, danach unmuted aber volume bleibt 0.
  assert.equal(g.observe({ muted: true, volume: 0 }, 13), null);
  assert.equal(g.observe({ muted: false, volume: 0 }, 328), null);
  assert.equal(g.observe({ muted: false, volume: 0 }, 717), null);
  assert.deepEqual(g.observe({ muted: false, volume: 0 }, 1900), { restoreTo: 0.11 });
});

test('ohne bekannten guten Wert wird nichts erfunden', () => {
  const g = createVolumeGuard({ graceMs: 1500 });
  assert.equal(g.observe({ muted: false, volume: 0 }, 0), null);
  assert.equal(g.observe({ muted: false, volume: 0 }, 5000), null);
});

test('nach erfolgreicher Wiederherstellung nicht erneut feuern', () => {
  const g = createVolumeGuard({ graceMs: 1500 });
  g.observe({ muted: false, volume: 0.11 }, 0);
  g.observe({ muted: false, volume: 0 }, 100);
  assert.deepEqual(g.observe({ muted: false, volume: 0 }, 1700), { restoreTo: 0.11 });
  // Wiederherstellung hat gegriffen -> ab jetzt Ruhe.
  assert.equal(g.observe({ muted: false, volume: 0.11 }, 1800), null);
  assert.equal(g.observe({ muted: false, volume: 0.11 }, 9000), null);
});

test('wirkungslose Wiederherstellung wird nach graceMs erneut versucht', () => {
  const g = createVolumeGuard({ graceMs: 1500 });
  g.observe({ muted: false, volume: 0.11 }, 0);
  g.observe({ muted: false, volume: 0 }, 100);
  assert.deepEqual(g.observe({ muted: false, volume: 0 }, 1700), { restoreTo: 0.11 });
  assert.equal(g.observe({ muted: false, volume: 0 }, 1800), null);
  assert.deepEqual(g.observe({ muted: false, volume: 0 }, 3400), { restoreTo: 0.11 });
});

test('fehlendes <video> setzt den Verdacht zurueck', () => {
  const g = createVolumeGuard({ graceMs: 1500 });
  g.observe({ muted: false, volume: 0.11 }, 0);
  g.observe({ muted: false, volume: 0 }, 100);
  assert.equal(g.observe(null, 200), null);          // Element weg (Reload-Teardown)
  assert.equal(g.observe({ muted: false, volume: 0 }, 1700), null);  // Frist neu
  assert.deepEqual(g.observe({ muted: false, volume: 0 }, 3300), { restoreTo: 0.11 });
});

test('merkt sich den zuletzt gueltigen Wert, nicht den ersten', () => {
  const g = createVolumeGuard({ graceMs: 1500 });
  g.observe({ muted: false, volume: 0.17 }, 0);
  g.observe({ muted: false, volume: 0.11 }, 100);   // Nutzer hat leiser gedreht
  g.observe({ muted: false, volume: 0 }, 200);
  assert.deepEqual(g.observe({ muted: false, volume: 0 }, 1800), { restoreTo: 0.11 });
});
