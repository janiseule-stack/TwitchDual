const { test } = require('node:test');
const assert = require('node:assert');
const createDiagLog = require('../src/diag-log');

// Testdoppel fuer die Dateianbindung. Das Modul kennt kein fs - alles kommt
// von aussen, genau wie bei src/twitch-points.js.
function bau(opts = {}) {
  const bloecke = [];
  let dateiGroesse = opts.groesse || 0;
  const umlegungen = [];
  const log = createDiagLog({
    schreiben: (block) => { bloecke.push(block); },
    groesse: () => dateiGroesse,
    umlegen: () => { umlegungen.push(dateiGroesse); dateiGroesse = 0; },
    jetzt: () => 1755043719980,   // fest -> Zeilen sind vergleichbar
    ...opts.ueberschreiben
  });
  return { log, bloecke, umlegungen, setzeGroesse: (g) => { dateiGroesse = g; } };
}

test('aus: nichts geschrieben, Puffer fuellt sich trotzdem', () => {
  const { log, bloecke } = bau();
  log.melde('punkte', 'takt-aus', { grund: 'kein Live-Kanal' });
  log.melde('chat', 'irc-verbunden');
  assert.equal(bloecke.length, 0, 'Schalter aus -> nichts auf der Platte');
  assert.equal(log.puffer().length, 2, 'der Puffer laeuft trotzdem - das ist der Zweck');
  assert.equal(log.istAktiv(), false);
});

test('Zeilenformat wie updater.log', () => {
  const { log } = bau();
  log.melde('punkte', 'kiste-ok', { davor: 436360, danach: 436410, betrag: 50 });
  assert.equal(log.puffer()[0],
    '[2025-08-13T00:08:39.980Z] punkte:kiste-ok {"davor":436360,"danach":436410,"betrag":50}');
});

test('detail ist undefined -> Zeile ohne Detail (wie heute bei updaterLog)', () => {
  const { log } = bau();
  log.melde('app', 'start');
  assert.equal(log.puffer()[0], '[2025-08-13T00:08:39.980Z] app:start');
});

test('Puffer deckelt bei maxPuffer, aeltestes faellt raus', () => {
  const { log } = bau({ ueberschreiben: { maxPuffer: 3 } });
  for (const n of [1, 2, 3, 4, 5]) log.melde('app', 'n' + n);
  const p = log.puffer();
  assert.equal(p.length, 3);
  assert.ok(p[0].endsWith('app:n3'), p[0]);
  assert.ok(p[2].endsWith('app:n5'), p[2]);
});

test('setAktiv(true) schreibt die Vorgeschichte genau einmal', () => {
  const { log, bloecke } = bau();
  log.melde('app', 'a');
  log.melde('app', 'b');
  log.setAktiv(true);
  assert.equal(bloecke.length, 1);
  assert.ok(bloecke[0].includes('app:a') && bloecke[0].includes('app:b'));
  assert.equal(log.istAktiv(), true);
});

// DER Test gegen das Einfrieren beim Umlegen des Schalters.
test('die Vorgeschichte geht als EIN schreiben-Aufruf raus, nicht als Schleife', () => {
  const { log, bloecke } = bau();
  for (let i = 0; i < 10000; i++) log.melde('app', 'e' + i);
  assert.equal(log.puffer().length, 10000);
  log.setAktiv(true);
  assert.equal(bloecke.length, 1,
    '10000 einzelne appendFileSync-Aufrufe frieren die App sichtbar ein');
  // Und der Block enthaelt wirklich alles.
  assert.equal(bloecke[0].split('\n').filter(Boolean).length, 10001); // 10000 + Kopfzeile
});

test('zweites setAktiv(true) schreibt die Vorgeschichte nicht erneut', () => {
  const { log, bloecke } = bau();
  log.melde('app', 'a');
  log.setAktiv(true);
  log.setAktiv(true);
  assert.equal(bloecke.length, 1);
});

test('nach dem Einschalten laeuft jede Meldung direkt mit', () => {
  const { log, bloecke } = bau();
  log.setAktiv(true);          // leere Vorgeschichte
  log.melde('app', 'a');
  log.melde('app', 'b');
  assert.equal(bloecke.length, 3);   // Vorgeschichte + 2
  assert.ok(bloecke[2].endsWith('app:b\n'));
});

test('setAktiv(false) stoppt das Schreiben, der Puffer laeuft weiter', () => {
  const { log, bloecke } = bau();
  log.setAktiv(true);
  log.melde('app', 'a');
  const vorher = bloecke.length;
  log.setAktiv(false);
  log.melde('app', 'b');
  assert.equal(bloecke.length, vorher, 'aus heisst: nichts mehr auf die Platte');
  assert.ok(log.puffer().some((z) => z.endsWith('app:b')));
  assert.equal(log.istAktiv(), false);
});

test('erneutes Einschalten hat wieder Vorgeschichte', () => {
  const { log, bloecke } = bau();
  log.setAktiv(true);
  log.setAktiv(false);
  log.melde('app', 'dazwischen');
  log.setAktiv(true);
  assert.ok(bloecke[bloecke.length - 1].includes('app:dazwischen'));
});

test('Einschalten ohne Vorgeschichte (frischer Start) ist kein Fehler', () => {
  const { log, bloecke } = bau();
  log.setAktiv(true);
  assert.equal(bloecke.length, 1);
  assert.ok(bloecke[0].includes('diagnose-an'));
});

test('Ueberschreiten von maxBytes ruft umlegen()', () => {
  const { log, umlegungen, setzeGroesse } = bau({ ueberschreiben: { maxBytes: 1000 } });
  log.setAktiv(true);
  setzeGroesse(1500);
  log.melde('app', 'a');
  assert.equal(umlegungen.length, 1);
});

test('Umlegen schlaegt fehl -> weiterschreiben statt Protokollverlust', () => {
  const bloecke = [];
  const log = createDiagLog({
    schreiben: (b) => bloecke.push(b),
    groesse: () => 99999999,
    umlegen: () => { throw new Error('EPERM'); },
    maxBytes: 1000
  });
  log.setAktiv(true);
  log.melde('app', 'a');
  assert.ok(bloecke.length >= 2, 'Datei waechst ueber die Grenze - besser als nichts');
});

test('Datei nicht schreibbar -> still ignoriert, App laeuft weiter', () => {
  const log = createDiagLog({
    schreiben: () => { throw new Error('ENOSPC'); },
    groesse: () => 0,
    umlegen: () => {}
  });
  log.setAktiv(true);
  log.melde('app', 'a');       // darf nicht werfen
  assert.equal(log.puffer().length, 1);
});

test('zirkulaeres detail wirft nicht', () => {
  const { log } = bau();
  const a = { name: 'a' };
  a.selbst = a;
  log.melde('app', 'zirkulaer', a);   // darf nicht werfen
  assert.equal(log.puffer().length, 1);
  assert.ok(log.puffer()[0].includes('app:zirkulaer'));
});

test('BigInt im detail wirft nicht', () => {
  const { log } = bau();
  log.melde('app', 'bigint', { n: 10n });
  assert.equal(log.puffer().length, 1);
});

// Die Zusicherung "im Diagnose-System existiert nichts Ungeschwaerztes" gilt
// auch fuer den Ringpuffer - sonst liefe die Vorgeschichte beim Einschalten
// roh in die Datei.
test('ein Token im detail steht AUCH im Puffer nur geschwaerzt', () => {
  const { log, bloecke } = bau();
  const token = 'k9x2p7mq4wz8vn3jb6hy5td1rc0slf';
  log.melde('punkte', 'kontext', { authorization: 'OAuth ' + token });
  assert.ok(!log.puffer()[0].includes(token), 'roher Token im Ringpuffer: ' + log.puffer()[0]);
  log.setAktiv(true);
  assert.ok(!bloecke[0].includes(token), 'roher Token in der Vorgeschichte');
});
