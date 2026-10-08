const { test } = require('node:test');
const assert = require('node:assert');
const { zielKanal, createZuschauerSteuerung, createWaechter } = require('../src/zuschauer-fenster');

const AN = { kanal: 'papaplatte', spielt: true, homeOffen: false, webAngemeldet: true };

test('zielKanal: alles erfuellt -> Kanal', () => {
  assert.equal(zielKanal(AN), 'papaplatte');
});

test('zielKanal: jede Bedingung einzeln verhindert', () => {
  assert.equal(zielKanal({ ...AN, kanal: null }), null);
  assert.equal(zielKanal({ ...AN, spielt: false }), null);
  assert.equal(zielKanal({ ...AN, homeOffen: true }), null);
  assert.equal(zielKanal({ ...AN, webAngemeldet: false }), null);
});

test('Steuerung: startet, danach Ruhe', () => {
  const s = createZuschauerSteuerung();
  assert.deepEqual(s.aktualisiere(AN, 0), { art: 'start', kanal: 'papaplatte' });
  assert.equal(s.laufend(), 'papaplatte');
  assert.equal(s.aktualisiere(AN, 2000), null);
});

test('Steuerung: ohne Ziel und ohne laufendes Fenster -> nichts', () => {
  const s = createZuschauerSteuerung();
  assert.equal(s.aktualisiere({ ...AN, spielt: false }, 0), null);
});

test('Steuerung: Kanalwechsel startet den neuen Kanal', () => {
  const s = createZuschauerSteuerung();
  s.aktualisiere(AN, 0);
  assert.deepEqual(s.aktualisiere({ ...AN, kanal: 'trymacs' }, 1000), { art: 'start', kanal: 'trymacs' });
  assert.equal(s.laufend(), 'trymacs');
});

test('Steuerung: Pause stoppt erst nach Ablauf der Karenz', () => {
  const s = createZuschauerSteuerung({ karenzMs: 60000 });
  s.aktualisiere(AN, 0);
  const pause = { ...AN, spielt: false };
  assert.equal(s.aktualisiere(pause, 1000), null);
  assert.equal(s.aktualisiere(pause, 60999), null);
  assert.deepEqual(s.aktualisiere(pause, 61000), { art: 'stopp', grund: 'pausiert' });
  assert.equal(s.laufend(), null);
});

test('Steuerung: Home offen stoppt nach Karenz mit Grund', () => {
  const s = createZuschauerSteuerung({ karenzMs: 60000 });
  s.aktualisiere(AN, 0);
  const home = { ...AN, homeOffen: true };
  assert.equal(s.aktualisiere(home, 0), null);
  assert.deepEqual(s.aktualisiere(home, 60000), { art: 'stopp', grund: 'Home offen' });
});

test('Steuerung: Rueckkehr in der Karenz bricht sie ab', () => {
  const s = createZuschauerSteuerung({ karenzMs: 60000 });
  s.aktualisiere(AN, 0);
  s.aktualisiere({ ...AN, spielt: false }, 1000);
  assert.equal(s.aktualisiere(AN, 30000), null);
  // neue Pause beginnt die Karenz von vorn
  assert.equal(s.aktualisiere({ ...AN, spielt: false }, 70000), null);
  assert.equal(s.aktualisiere({ ...AN, spielt: false }, 129999), null);
  assert.deepEqual(s.aktualisiere({ ...AN, spielt: false }, 130000), { art: 'stopp', grund: 'pausiert' });
});

test('Steuerung: kein Kanal / VOD / App zu -> sofortiger Stopp', () => {
  const s = createZuschauerSteuerung();
  s.aktualisiere(AN, 0);
  assert.deepEqual(s.aktualisiere({ ...AN, kanal: null }, 1000), { art: 'stopp', grund: 'kein Live-Kanal' });
});

test('Steuerung: Abmeldung -> sofortiger Stopp', () => {
  const s = createZuschauerSteuerung();
  s.aktualisiere(AN, 0);
  assert.deepEqual(s.aktualisiere({ ...AN, webAngemeldet: false }, 1000), { art: 'stopp', grund: 'nicht angemeldet' });
});

test('Steuerung: Kanalwechsel waehrend Pause -> sofortiger Stopp des alten', () => {
  const s = createZuschauerSteuerung({ karenzMs: 60000 });
  s.aktualisiere(AN, 0);
  s.aktualisiere({ ...AN, spielt: false }, 1000);
  assert.deepEqual(
    s.aktualisiere({ ...AN, kanal: 'trymacs', spielt: false }, 2000),
    { art: 'stopp', grund: 'Kanalwechsel' }
  );
  assert.deepEqual(s.aktualisiere({ ...AN, kanal: 'trymacs' }, 3000), { art: 'start', kanal: 'trymacs' });
});

test('Steuerung: nach aufgegeben kein Neustart desselben Kanals', () => {
  const s = createZuschauerSteuerung();
  s.aktualisiere(AN, 0);
  s.aufgegeben();
  assert.equal(s.laufend(), null);
  assert.equal(s.aktualisiere(AN, 2000), null);
  assert.equal(s.aktualisiere(AN, 600000), null);
});

test('Steuerung: nach aufgegeben startet ein anderer Kanal und spaeter wieder der alte', () => {
  const s = createZuschauerSteuerung();
  s.aktualisiere(AN, 0);
  s.aufgegeben();
  assert.deepEqual(s.aktualisiere({ ...AN, kanal: 'trymacs' }, 1000), { art: 'start', kanal: 'trymacs' });
  assert.deepEqual(s.aktualisiere(AN, 2000), { art: 'start', kanal: 'papaplatte' });
});

test('Steuerung: Sperre faellt auch, wenn zwischendurch kein Kanal geladen war', () => {
  const s = createZuschauerSteuerung();
  s.aktualisiere(AN, 0);
  s.aufgegeben();
  s.aktualisiere({ ...AN, kanal: null }, 1000);
  assert.deepEqual(s.aktualisiere(AN, 2000), { art: 'start', kanal: 'papaplatte' });
});

const laeuft = (t) => ({ hatVideo: true, paused: false, currentTime: t });
const steht = (t) => ({ hatVideo: true, paused: false, currentTime: t });

test('Waechter: laufendes Video ist ok, auch bei erster Messung', () => {
  const w = createWaechter();
  assert.equal(w.messung(laeuft(40)), 'ok');
  assert.equal(w.messung(laeuft(70)), 'ok');
});

test('Waechter: erste Messung bei 0 oder pausiert ist kein Fortschritt', () => {
  const w = createWaechter();
  assert.equal(w.messung(laeuft(0)), 'warten');
  const w2 = createWaechter();
  assert.equal(w2.messung({ hatVideo: true, paused: true, currentTime: 50 }), 'warten');
});

test('Waechter: zwei Messungen ohne Fortschritt -> neu laden', () => {
  const w = createWaechter();
  w.messung(laeuft(40));
  assert.equal(w.messung(steht(40)), 'warten');
  assert.equal(w.messung(steht(40)), 'neu-laden');
  assert.equal(w.neuLadungen(), 1);
});

test('Waechter: kein Video zaehlt als Stillstand', () => {
  const w = createWaechter();
  assert.equal(w.messung({ hatVideo: false, paused: true, currentTime: 0 }), 'warten');
  assert.equal(w.messung({ hatVideo: false, paused: true, currentTime: 0 }), 'neu-laden');
});

test('Waechter: nach Neu-Laden zaehlt die neue Zeitachse (kein Vergleich mit vorher)', () => {
  const w = createWaechter();
  w.messung(laeuft(500));
  w.messung(steht(500));
  assert.equal(w.messung(steht(500)), 'neu-laden');
  // nach dem Reload beginnt currentTime klein - das ist Fortschritt, kein Rueckschritt
  assert.equal(w.messung(laeuft(12)), 'ok');
  assert.equal(w.neuLadungen(), 0);
});

test('Waechter: nach drei erfolglosen Neu-Ladungen aufgeben', () => {
  const w = createWaechter();
  const tot = { hatVideo: false, paused: true, currentTime: 0 };
  const ergebnisse = [];
  for (let i = 0; i < 8; i++) ergebnisse.push(w.messung(tot));
  assert.deepEqual(ergebnisse, [
    'warten', 'neu-laden',
    'warten', 'neu-laden',
    'warten', 'neu-laden',
    'warten', 'aufgeben'
  ]);
});

test('Waechter: Fortschritt setzt den Neu-Lade-Zaehler zurueck', () => {
  const w = createWaechter();
  const tot = { hatVideo: false, paused: true, currentTime: 0 };
  w.messung(tot); w.messung(tot); // neu-laden 1
  w.messung(tot); w.messung(tot); // neu-laden 2
  assert.equal(w.messung(laeuft(20)), 'ok');
  assert.equal(w.neuLadungen(), 0);
});
