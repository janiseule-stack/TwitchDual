const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const RL = require('../renderer/lib/raum-leben.js');

test('schirmAnzahl: Stufen', () => {
  const eingabe = [0, undefined, 'x', 1, 9, 10, 49, 50, 199, 200, 100000];
  const soll = [1, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4];
  assert.deepStrictEqual(eingabe.map(RL.schirmAnzahl), soll);
});

test('Konstanten und Takt', () => {
  assert.strictEqual(RL.DAUER_KISTE, 4000);
  assert.strictEqual(RL.MAX_WARTEND, 3);
  assert.strictEqual(RL.MAX_ALTER, 30000);
  for (const k of Object.keys(RL.TAKT)) {
    assert.ok(RL.TAKT[k].msProBild >= 100 && RL.TAKT[k].msProBild <= 250, k);
  }
  assert.deepStrictEqual(RL.TAKT.katze.pause, { min: 8000, max: 20000 });
  assert.deepStrictEqual(RL.TAKT.lampe.pause, { min: 10000, max: 30000 });
  assert.strictEqual(RL.TAKT.regen.modus, 'schleife');
  assert.strictEqual(RL.TAKT.lampe.modus, 'selten');
});

test('naechstePause', () => {
  const p = { min: 8000, max: 20000 };
  assert.strictEqual(RL.naechstePause(() => 0, p), 8000);
  assert.strictEqual(RL.naechstePause(() => 1, p), 20000);
  assert.strictEqual(RL.naechstePause(() => 0.5, p), 14000);
});

test('warteschlange: Obergrenze, Reihenfolge, Alter, leeren', () => {
  let t = 0;
  const s = RL.warteschlange({ jetzt: () => t });
  for (let i = 0; i < 10; i++) s.rein('raid', { i });
  assert.strictEqual(s.laenge, 3);
  assert.deepStrictEqual([s.naechstes().daten.i, s.naechstes().daten.i, s.naechstes().daten.i], [7, 8, 9]);
  assert.strictEqual(s.naechstes(), null);

  s.rein('kiste', { a: 1 });
  t = 30001;
  assert.strictEqual(s.naechstes(), null);
  t = 40000;
  s.rein('kiste', { a: 2 });
  t = 70000;
  const ev = s.naechstes();
  assert.strictEqual(ev.art, 'kiste');
  assert.strictEqual(ev.zeit, 40000);

  s.rein('raid', {});
  s.leeren();
  assert.strictEqual(s.laenge, 0);
});

function fake() {
  const timer = [];
  return {
    timer,
    setTimeout: (fn, ms) => { timer.push({ fn, ms, weg: false }); return timer.length - 1; },
    clearTimeout: (id) => { if (timer[id]) timer[id].weg = true; },
    feuere: (i) => { if (!timer[i].weg) { timer[i].weg = true; timer[i].fn(); } },
  };
}

function bau(aktiv = () => true) {
  const f = fake();
  const log = { start: [], stop: 0 };
  const schlange = RL.warteschlange({ jetzt: () => 0 });
  const a = RL.abspieler({
    schlange, aktiv,
    starte: (ev) => log.start.push(ev.daten.n),
    stoppe: () => { log.stop++; },
    dauer: () => 1000,
    setTimeout: f.setTimeout, clearTimeout: f.clearTimeout,
  });
  return { f, log, schlange, a };
}

test('abspieler: nacheinander', () => {
  const { f, log, a } = bau();
  a.melde('raid', { n: 1 });
  a.melde('raid', { n: 2 });
  assert.deepStrictEqual(log.start, [1]);
  assert.strictEqual(a.laeuft, true);
  assert.strictEqual(f.timer[0].ms, 1000);
  f.feuere(0);
  assert.deepStrictEqual(log.start, [1, 2]);
  f.feuere(1);
  assert.strictEqual(a.laeuft, false);
});

test('abspieler: aus() waehrend Lauf', () => {
  const { f, log, schlange, a } = bau();
  a.melde('raid', { n: 1 });
  a.melde('raid', { n: 2 });
  a.aus();
  assert.strictEqual(log.stop, 1);
  assert.strictEqual(schlange.laenge, 0);
  assert.strictEqual(a.laeuft, false);
  assert.strictEqual(f.timer[0].weg, true);
  f.feuere(0);
  assert.deepStrictEqual(log.start, [1]);
  // neuer Effekt nach aus(): alter Timer darf ihn nicht kuerzen
  a.melde('raid', { n: 3 });
  assert.deepStrictEqual(log.start, [1, 3]);
  f.feuere(0);
  assert.strictEqual(a.laeuft, true);
});

test('abspieler: starte wirft -> naechstes Ereignis laeuft', () => {
  const f = fake();
  const gestartet = [];
  const schlange = RL.warteschlange({ jetzt: () => 0 });
  const a = RL.abspieler({
    schlange, aktiv: () => true,
    starte: (ev) => { if (ev.daten.n === 1) throw new Error('kaputt'); gestartet.push(ev.daten.n); },
    stoppe() {}, dauer: () => 1000,
    setTimeout: f.setTimeout, clearTimeout: f.clearTimeout,
  });
  schlange.rein('raid', { n: 1 });
  schlange.rein('raid', { n: 2 });
  a.melde('raid', { n: 3 });
  assert.deepStrictEqual(gestartet, [2]);
  assert.strictEqual(a.laeuft, true);
  f.feuere(0);
  assert.deepStrictEqual(gestartet, [2, 3]);
  // einzelnes kaputtes Ereignis: danach nicht haengen
  const b = RL.abspieler({
    schlange: RL.warteschlange({ jetzt: () => 0 }), aktiv: () => true,
    starte: () => { throw new Error('x'); }, stoppe() {}, dauer: () => 1,
    setTimeout: f.setTimeout, clearTimeout: f.clearTimeout,
  });
  b.melde('raid', { n: 1 });
  assert.strictEqual(b.laeuft, false);
});

test('abspieler: aus() innerhalb von starte hinterlaesst keinen Timer', () => {
  const f = fake();
  const gestartet = [];
  let a;
  const schlange = RL.warteschlange({ jetzt: () => 0 });
  a = RL.abspieler({
    schlange, aktiv: () => true,
    starte: (ev) => { gestartet.push(ev.daten.n); if (ev.daten.n === 1) a.aus(); },
    stoppe() {}, dauer: () => 1000,
    setTimeout: f.setTimeout, clearTimeout: f.clearTimeout,
  });
  a.melde('raid', { n: 1 });
  assert.strictEqual(f.timer.length, 0);
  assert.strictEqual(a.laeuft, false);
  a.melde('raid', { n: 2 });
  assert.strictEqual(f.timer.length, 1);
  assert.strictEqual(a.laeuft, true);
});

test('abspieler: Ueberlauf und veraltete Ereignisse', () => {
  let t = 0;
  const f = fake();
  const gestartet = [];
  const a = RL.abspieler({
    schlange: RL.warteschlange({ jetzt: () => t }), aktiv: () => true,
    starte: (ev) => gestartet.push(ev.daten.n), stoppe() {}, dauer: () => 1000,
    setTimeout: f.setTimeout, clearTimeout: f.clearTimeout,
  });
  for (let n = 1; n <= 5; n++) a.melde('raid', { n });
  assert.deepStrictEqual(gestartet, [1]);
  t = 30001;
  f.feuere(0); // wartende 3..5 (Zeit 0) sind veraltet
  assert.deepStrictEqual(gestartet, [1]);
  assert.strictEqual(a.laeuft, false);
});

test('warteschlange: genau 30000 ms bleibt', () => {
  let t = 0;
  const s = RL.warteschlange({ jetzt: () => t });
  s.rein('raid', { n: 1 });
  t = 30000;
  assert.strictEqual(s.naechstes().daten.n, 1);
});

test('abspieler: inaktiv verwirft', () => {
  const { log, a } = bau(() => false);
  a.melde('raid', { n: 1 });
  assert.deepStrictEqual(log.start, []);
  assert.strictEqual(a.laeuft, false);
});

test('beide index.html laden raum-leben.js vor dem Hauptskript', () => {
  const lies = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const chat = lies('renderer/chat/index.html');
  const a = chat.indexOf('../lib/raum-leben.js');
  assert.ok(a > chat.indexOf('../lib/szene.js'));
  assert.ok(a > -1 && a < chat.indexOf('src="chat.js"'));
  const video = lies('renderer/video/index.html');
  const b = video.indexOf('raum-leben.js');
  assert.ok(b > -1 && b < video.indexOf('src="home-raum-dom.js"'));
});
