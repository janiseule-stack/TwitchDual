const test = require('node:test');
const assert = require('node:assert/strict');
const { createBuehne, createRad, namenAuswahl, zeilenInhalt, vorschauUrl } = require('../renderer/lib/home-buehne.js');

const k = (login, viewers = 0, extra = {}) => ({ login, displayName: login.toUpperCase(), viewers, ...extra });
const logins = (arr) => arr.map((x) => x.login);

function buehne(...ls) {
  const b = createBuehne();
  b.oeffnen(ls.map((l) => k(l)));
  return b;
}

test('oeffnen: erste CD aktuell; leer -> null, index -1', () => {
  const b = buehne('a', 'b');
  assert.equal(b.aktuelle().login, 'a');
  assert.equal(b.index(), 0);
  const leer = createBuehne();
  leer.oeffnen([]);
  assert.equal(leer.aktuelle(), null);
  assert.equal(leer.index(), -1);
});

test('blaettern: Anschlag', () => {
  const b = buehne('a', 'b');
  assert.equal(b.blaettern(-1), false);
  assert.equal(b.aktuelle().login, 'a');
  assert.equal(b.blaettern(1), true);
  assert.equal(b.aktuelle().login, 'b');
  assert.equal(b.blaettern(1), false);
  assert.equal(b.aktuelle().login, 'b');
});

test('aktualisieren: Reihenfolge bleibt, Werte frisch', () => {
  const b = createBuehne();
  b.oeffnen([k('a', 1), k('b', 2), k('c', 3)]);
  b.aktualisieren([k('c', 9), k('a', 8), k('b', 7)]);
  assert.deepEqual(logins(b.sichtbar()), ['a', 'b', 'c']);
  assert.equal(b.sichtbar()[0].viewers, 8);
});

test('aktualisieren: Neue hinten', () => {
  const b = buehne('a', 'b');
  b.aktualisieren([k('b'), k('a'), k('d')]);
  assert.deepEqual(logins(b.sichtbar()), ['a', 'b', 'd']);
});

test('aktualisieren: nicht-vordere weg, aktuelle per Login', () => {
  const b = buehne('a', 'b', 'c');
  b.springeZu('b');
  b.aktualisieren([k('b'), k('c')]);
  assert.deepEqual(logins(b.sichtbar()), ['b', 'c']);
  assert.equal(b.aktuelle().login, 'b');
});

test('aktualisieren: vordere fehlt -> markiert, bleibt', () => {
  const b = buehne('a', 'b', 'c');
  b.springeZu('b');
  b.aktualisieren([k('a'), k('c')]);
  assert.equal(b.aktuelle().login, 'b');
  assert.equal(b.aktuelle().offline, true);
  assert.deepEqual(logins(b.sichtbar()), ['a', 'b', 'c']);
});

test('blaettern nach Markierung', () => {
  const mk = () => {
    const b = buehne('a', 'b', 'c');
    b.springeZu('b');
    b.aktualisieren([k('a'), k('c')]);
    return b;
  };
  const v = mk();
  assert.equal(v.blaettern(1), true);
  assert.equal(v.aktuelle().login, 'c');
  assert.deepEqual(logins(v.sichtbar()), ['a', 'c']);
  const r = mk();
  assert.equal(r.blaettern(-1), true);
  assert.equal(r.aktuelle().login, 'a');
  assert.deepEqual(logins(r.sichtbar()), ['a', 'c']);
  const l = buehne('a', 'b', 'c');
  l.springeZu('c');
  l.aktualisieren([k('a'), k('b')]);
  assert.equal(l.blaettern(1), true);
  assert.equal(l.aktuelle().login, 'b');
  assert.deepEqual(logins(l.sichtbar()), ['a', 'b']);
});

test('blaettern nach Markierung: letzte CD weg -> leer', () => {
  const b = buehne('a');
  b.aktualisieren([]);
  assert.equal(b.aktuelle().offline, true);
  assert.equal(b.blaettern(1), true);
  assert.equal(b.aktuelle(), null);
  assert.equal(b.index(), -1);
});

test('filter: Teilreihe, Rueckkehr', () => {
  const b = buehne('a', 'b', 'c');
  b.filter(['c', 'b']);
  assert.deepEqual(logins(b.sichtbar()), ['b', 'c']);
  assert.equal(b.aktuelle().login, 'b');
  b.filter([]);
  assert.equal(b.aktuelle(), null);
  b.filter(null);
  assert.equal(b.aktuelle().login, 'a');
  assert.deepEqual(logins(b.sichtbar()), ['a', 'b', 'c']);
});

test('springeZu ausserhalb Filter -> false', () => {
  const b = buehne('a', 'b', 'c');
  b.filter(['b', 'c']);
  assert.equal(b.springeZu('a'), false);
  assert.equal(b.springeZu('c'), true);
  assert.equal(b.aktuelle().login, 'c');
});

test('Rad: Schwelle, Zeilen, Sperre', () => {
  const r = createRad();
  assert.equal(r.eingabe(20, 0, 0), 0);
  assert.equal(r.eingabe(20, 0, 10), 0);
  assert.equal(r.eingabe(20, 0, 20), 1);
  assert.equal(r.eingabe(100, 0, 120), 0);
  assert.equal(r.eingabe(100, 0, 300), 1);
  assert.equal(createRad().eingabe(4, 1, 0), 1);
  assert.equal(createRad().eingabe(-60, 0, 0), -1);
});

test('namenAuswahl: 0, 1, viele, live zuerst, offline alphabetisch, displayName vor login', () => {
  assert.deepEqual(namenAuswahl([], []), []);
  assert.deepEqual(namenAuswahl([{ login: 'x' }], []), [{ name: 'x', live: true }]);
  const live = Array.from({ length: 25 }, (_, i) => k('l' + i));
  assert.equal(namenAuswahl(live, []).length, 20);
  const r = namenAuswahl([k('b'), { login: 'a' }], [{ login: 'z' }, { login: 'm', displayName: 'Mia' }]);
  assert.deepEqual(r, [
    { name: 'B', live: true },
    { name: 'a', live: true },
    { name: 'Mia', live: false },
    { name: 'z', live: false },
  ]);
});

test('zeilenInhalt rotiert um zeile*4', () => {
  const a = Array.from({ length: 6 }, (_, i) => ({ name: 'n' + i, live: true }));
  assert.deepEqual(zeilenInhalt(a, 0).map((x) => x.name), ['n0', 'n1', 'n2', 'n3', 'n4', 'n5']);
  assert.deepEqual(zeilenInhalt(a, 1).map((x) => x.name), ['n4', 'n5', 'n0', 'n1', 'n2', 'n3']);
  assert.deepEqual(zeilenInhalt([], 2), []);
});

test('leere Buehne: erster neuer Live-Kanal wird aktuell', () => {
  const b = createBuehne();
  b.oeffnen([]);
  b.aktualisieren([k('a'), k('b')]);
  assert.equal(b.aktuelle().login, 'a');
  assert.equal(b.blaettern(1), true);
  assert.equal(b.aktuelle().login, 'b');
});

test('markierte CD weggeblaettert bis leer, dann neuer Live-Kanal -> aktuell', () => {
  const b = buehne('a');
  b.aktualisieren([]);
  assert.equal(b.aktuelle().offline, true);
  assert.equal(b.blaettern(1), true);
  assert.equal(b.aktuelle(), null);
  b.aktualisieren([k('c')]);
  assert.equal(b.aktuelle().login, 'c');
  assert.equal(b.index(), 0);
});

test('vorschauUrl', () => {
  assert.ok(vorschauUrl('kanal_a', 120000).endsWith('kanal_a-640x360.jpg?t=2'));
});
