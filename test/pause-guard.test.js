const { test } = require('node:test');
const assert = require('node:assert');
const createPauseGuard = require('../renderer/lib/pause-guard');

test('Pause ohne Nutzer-Eingabe -> nach der Wartezeit weiterspielen', () => {
  const g = createPauseGuard({ wartezeitMs: 1500 });
  g.pausiert(10000);
  assert.equal(g.tick(10500), null, 'noch nicht - Twitch darf kurz selbst anhalten');
  assert.deepEqual(g.tick(11500), { play: true, versuch: 1 });
});

test('Pause direkt nach Klick/Taste ist gewollt -> nie anfassen', () => {
  const g = createPauseGuard({ wartezeitMs: 1500, eingabeFensterMs: 1500 });
  g.nutzerEingabe(10000);
  g.pausiert(10400);
  assert.equal(g.tick(20000), null);
  assert.equal(g.tick(60000), null);
});

test('alte Eingabe zaehlt nicht: Klick vor 5 s, dann Pause -> weiterspielen', () => {
  const g = createPauseGuard({ wartezeitMs: 1500, eingabeFensterMs: 1500 });
  g.nutzerEingabe(5000);
  g.pausiert(10000);
  assert.deepEqual(g.tick(11500), { play: true, versuch: 1 });
});

test('spielt wieder -> Verdacht weg, Versuche zurueckgesetzt', () => {
  const g = createPauseGuard({ wartezeitMs: 1000 });
  g.pausiert(0);
  assert.equal(g.tick(1000).versuch, 1);
  g.spielt();
  assert.equal(g.tick(5000), null);
  g.pausiert(6000);
  assert.equal(g.tick(7000).versuch, 1, 'neue Pause faengt wieder bei 1 an');
});

test('bleibt es stehen: erneut versuchen, aber hoechstens maxVersuche mal', () => {
  const meldungen = [];
  const g = createPauseGuard({ wartezeitMs: 1000, maxVersuche: 3, melde: (e, d) => meldungen.push(e) });
  g.pausiert(0);
  assert.equal(g.tick(1000).versuch, 1);
  assert.equal(g.tick(1500), null, 'zwischen den Versuchen wieder warten');
  assert.equal(g.tick(2000).versuch, 2);
  assert.equal(g.tick(3000).versuch, 3);
  assert.equal(g.tick(4000), null);
  assert.equal(g.tick(99000), null);
  assert.deepEqual(meldungen.filter((m) => m === 'pause-aufgegeben').length, 1);
});

test('Nutzer-Eingabe waehrend des Verdachts beendet ihn (er will es so)', () => {
  const g = createPauseGuard({ wartezeitMs: 1500 });
  g.pausiert(0);
  g.nutzerEingabe(800);
  assert.equal(g.tick(5000), null);
});

test('Ende des Videos (ended) wird nicht neu gestartet', () => {
  const g = createPauseGuard({ wartezeitMs: 1000 });
  g.pausiert(0, { ended: true });
  assert.equal(g.tick(5000), null);
});

test('melde: Verdacht und Weiterspielen landen in der Diagnose', () => {
  const m = [];
  const g = createPauseGuard({ wartezeitMs: 1000, melde: (e) => m.push(e) });
  g.pausiert(0);
  g.tick(1000);
  assert.deepEqual(m, ['pause-ungewollt', 'pause-weiter']);
});
