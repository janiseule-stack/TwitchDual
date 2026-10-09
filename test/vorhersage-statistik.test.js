const { test } = require('node:test');
const assert = require('node:assert');
const VS = require('../renderer/lib/vorhersage-statistik');
const KE = require('../renderer/lib/kanal-ereignisse');
const batch = require('./fixtures/kanal-ereignisse/start-batch.json');

// Vorhersage-Modell wie aus kanal-ereignisse (optionen mit anteil/quote/punkte).
function v(id, a, b, extra = {}) {
  const summe = a + b;
  return {
    id, status: 'ACTIVE', ...extra,
    optionen: [
      { id: 'ja', titel: 'JA', farbe: 'BLUE', punkte: a, nutzer: 4, anteil: summe ? a / summe : 0, quote: a ? summe / a : null, top: [] },
      { id: 'nein', titel: 'NEIN', farbe: 'PINK', punkte: b, nutzer: 2, anteil: summe ? b / summe : 0, quote: b ? summe / b : null, top: [] }
    ]
  };
}

test('vorhersageAus liefert Top-Setzer mit Namen (GQL und Hermes)', () => {
  const z = KE.createZustand();
  z.ausStart({ vorhersage: batch[2].data.community.channel.lockedPredictionEvents[0] }, Date.parse('2026-10-08T23:00:00Z'), { erstes: true });
  const top = z.stand().vorhersage.optionen.flatMap((o) => o.top);
  assert.ok(top.length > 0);
  assert.equal(typeof top[0].name, 'string');
  assert.equal(typeof top[0].punkte, 'number');
});

test('Verlauf: nimmt Punkte nur bei Aenderung auf, neue Vorhersage beginnt neu', () => {
  const vl = VS.createVerlauf();
  vl.nimm(v('e1', 100, 100), 0);
  vl.nimm(v('e1', 100, 100), 1000);
  vl.nimm(v('e1', 300, 100), 2000);
  assert.equal(vl.punkte().length, 2);
  assert.deepEqual(vl.punkte()[1].anteile, { ja: 0.75, nein: 0.25 });
  vl.nimm(v('e2', 1, 1), 3000);
  assert.equal(vl.punkte().length, 1);
});

test('Verlauf: begrenzt auf max Punkte (aelteste fallen raus)', () => {
  const vl = VS.createVerlauf({ max: 3 });
  for (let i = 1; i <= 5; i++) vl.nimm(v('e', i, 1), i * 1000);
  assert.deepEqual(vl.punkte().map((p) => p.t), [3000, 4000, 5000]);
});

test('trend: Anteil-Aenderung in Prozentpunkten ueber das Fenster', () => {
  const vl = VS.createVerlauf();
  vl.nimm(v('e', 50, 50), 0);
  vl.nimm(v('e', 58, 42), 30000);
  vl.nimm(v('e', 62, 38), 70000);
  // Fenster 60 s ab 70 s -> Vergleich mit dem Stand bei 10 s (= 50 %)
  assert.equal(VS.trend(vl.punkte(), 'ja', 70000), 12);
  assert.equal(VS.trend(vl.punkte(), 'nein', 70000), -12);
  assert.equal(VS.trend([], 'ja', 0), 0);
});

test('momentum: Punkte pro Minute und wohin das meiste fliesst', () => {
  const vl = VS.createVerlauf();
  vl.nimm(v('e', 1000, 1000), 0);
  vl.nimm(v('e', 10000, 1500), 30000);
  const m = VS.momentum(vl.punkte(), 30000);
  assert.equal(m.proMinute, 19000); // 9500 Punkte in 30 s
  assert.equal(m.nach, 'ja');
  assert.deepEqual(VS.momentum([], 0), { proMinute: 0, nach: null });
});

test('stats je Option: Schnitt, groesster Einsatz, Gewinn pro 1000', () => {
  const x = v('e', 6200, 3800);
  x.optionen[0].top = [{ name: 'a', punkte: 500 }, { name: 'b', punkte: 900 }];
  const s = VS.stats(x);
  assert.deepEqual(s[0], { id: 'ja', punkte: 6200, nutzer: 4, schnitt: 1550, groesster: 900, gewinnPro1000: 1612 });
  assert.equal(s[1].groesster, 0);
  assert.equal(s[1].gewinnPro1000, 2631);
});

test('topSetzer: ueber alle Optionen, absteigend, mit Optionsfarbe', () => {
  const x = v('e', 1, 1);
  x.optionen[0].top = [{ name: 'a', punkte: 100 }, { name: 'b', punkte: 300 }];
  x.optionen[1].top = [{ name: 'c', punkte: 200 }];
  assert.deepEqual(VS.topSetzer(x, 2), [
    { name: 'b', punkte: 300, optionId: 'ja', farbe: 'BLUE' },
    { name: 'c', punkte: 200, optionId: 'nein', farbe: 'PINK' }
  ]);
});

test('zuwachs: welche Optionen haben seit dem letzten Stand Punkte bekommen', () => {
  assert.deepEqual(VS.zuwachs(v('e', 100, 100), v('e', 150, 100)), ['ja']);
  assert.deepEqual(VS.zuwachs(null, v('e', 150, 100)), []);
  assert.deepEqual(VS.zuwachs(v('alt', 1, 1), v('e', 150, 100)), [], 'andere Vorhersage zaehlt nicht');
});

test('kurven: ein SVG-Pfad je Option, 0 % unten, 100 % oben', () => {
  const vl = VS.createVerlauf();
  vl.nimm(v('e', 50, 50), 0);
  vl.nimm(v('e', 100, 0), 10000);
  const k = VS.kurven(vl.punkte(), ['ja', 'nein'], 100, 50);
  assert.equal(k.ja, 'M0,25 L100,0');
  assert.equal(k.nein, 'M0,25 L100,50');
  assert.deepEqual(VS.kurven([], ['ja'], 100, 50), { ja: '' });
});

test('ringSegmente: Bogenstuecke in Prozent der Kreislinie', () => {
  assert.deepEqual(VS.ringSegmente(v('e', 62, 38).optionen), [
    { id: 'ja', farbe: 'BLUE', laenge: 62, versatz: 0 },
    { id: 'nein', farbe: 'PINK', laenge: 38, versatz: 62 }
  ]);
});

test('moeglicherGewinn: Einsatz mal Quote, abgerundet', () => {
  const x = v('e', 6200, 3800);
  assert.equal(VS.moeglicherGewinn({ eventId: 'e', optionId: 'ja', punkte: 1000 }, x), 1612);
  assert.equal(VS.moeglicherGewinn(null, x), null);
  assert.equal(VS.moeglicherGewinn({ eventId: 'anders', optionId: 'ja', punkte: 1 }, x), null);
});

test('zaehlStand: Zahl zaehlt weich von alt nach neu', () => {
  assert.equal(VS.zaehlStand(100, 200, 0), 100);
  assert.equal(VS.zaehlStand(100, 200, 1), 200);
  const mitte = VS.zaehlStand(100, 200, 0.5);
  assert.ok(mitte > 150 && mitte < 200, 'ease-out: nach halber Zeit mehr als die Haelfte');
});
