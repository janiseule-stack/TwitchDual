const { test } = require('node:test');
const assert = require('node:assert');
const L = require('../renderer/lib/home-liste');

const k = (login, o = {}) => ({ login, displayName: login, live: false, favorit: false, gefolgt: true, ...o });
const kanaele = [
  k('favlive', { favorit: true, live: true }),
  k('favaus', { favorit: true, gefolgt: false }),
  k('gefolgtlive', { live: true, game: 'Valorant' }),
  k('gefolgtaus')
];

test('ohne Suche: Favoriten, Live, Offline; kein Twitch', () => {
  const r = L.abschnitte({ kanaele, nadel: '', twitch: [k('fremd')], zu: {} });
  assert.deepEqual(r.abschnitte.map((a) => a.art), ['favoriten', 'live', 'offline']);
  assert.deepEqual(r.abschnitte[0].kanaele.map((x) => x.login), ['favlive']);
  assert.deepEqual(r.abschnitte[1].kanaele.map((x) => x.login), ['gefolgtlive']);
  // Offline-Favoriten nicht oben, sondern zuerst im Offline-Abschnitt.
  assert.deepEqual(r.abschnitte[2].kanaele.map((x) => x.login), ['favaus', 'gefolgtaus']);
  assert.equal(r.keineEigenen, false);
  assert.equal(r.abschnitte[0].titel, '★ Favoriten');
});

test('Favorit erscheint nicht zusaetzlich in Live/Offline', () => {
  const r = L.abschnitte({ kanaele, nadel: '', zu: {} });
  const alle = r.abschnitte.flatMap((a) => a.kanaele.map((x) => x.login));
  assert.equal(alle.length, new Set(alle).size);
});

test('Suche filtert ueber Name und Spiel und klappt alles auf', () => {
  const r = L.abschnitte({ kanaele, nadel: 'VALO', zu: { live: true, offline: true } });
  assert.deepEqual(r.abschnitte.map((a) => a.art), ['live']);
  assert.equal(r.abschnitte[0].offen, true);
});

test('Klapp-Zustand ohne Suche', () => {
  const r = L.abschnitte({ kanaele, nadel: '', zu: { offline: true } });
  assert.deepEqual(r.abschnitte.map((a) => a.offen), [true, true, false]);
});

test('Twitch erst ab 2 Zeichen, ohne bekannte Kanaele, Flags aus', () => {
  const twitch = [k('gefolgtaus', { gefolgt: undefined }), k('fremd', { gefolgt: undefined, verifiziert: true })];
  assert.equal(L.abschnitte({ kanaele, nadel: 'f', twitch, zu: {} }).abschnitte.some((a) => a.art === 'twitch'), false);
  const r = L.abschnitte({ kanaele, nadel: 'fr', twitch, zu: {} });
  const tw = r.abschnitte.find((a) => a.art === 'twitch');
  assert.equal(tw.titel, 'Auf Twitch');
  assert.deepEqual(tw.kanaele.map((x) => x.login), ['fremd']);
  assert.deepEqual([tw.kanaele[0].favorit, tw.kanaele[0].gefolgt], [false, false]);
});

test('keineEigenen nur bei Suche ohne eigenen Treffer', () => {
  assert.equal(L.abschnitte({ kanaele, nadel: 'xyz', zu: {} }).keineEigenen, true);
  assert.equal(L.abschnitte({ kanaele: [], nadel: 'xyz', zu: {} }).keineEigenen, false);
});

test('exakter Treffer: eingereiht, aber nicht wenn schon bekannt', () => {
  const twitch = [k('streamertv', { verifiziert: true }), k('streamerfan')];
  const r = L.abschnitte({ kanaele, nadel: 'streamer', twitch, exakt: k('streamer'), zu: {} });
  assert.deepEqual(r.abschnitte.find((a) => a.art === 'twitch').kanaele.map((x) => x.login), ['streamertv', 'streamer', 'streamerfan']);
  const r2 = L.abschnitte({ kanaele, nadel: 'gefolgtaus', twitch: [], exakt: k('gefolgtaus'), zu: {} });
  assert.equal(r2.abschnitte.some((a) => a.art === 'twitch'), false);
});

test('mitExaktTreffer: hinter fuehrenden verifizierten, ohne Duplikat', () => {
  const liste = [{ login: 'a', verifiziert: true }, { login: 'b' }, { login: 'e' }];
  assert.deepEqual(L.mitExaktTreffer(liste, { login: 'e' }).map((x) => x.login), ['a', 'e', 'b']);
  assert.deepEqual(L.mitExaktTreffer(liste, null).map((x) => x.login), ['a', 'b', 'e']);
  assert.deepEqual(L.mitExaktTreffer([], { login: 'e' }).map((x) => x.login), ['e']);
});

test('sternAnwenden: Twitch-Treffer mit Stern kommt dazu', () => {
  const r = L.sternAnwenden(kanaele, k('fremd', { gefolgt: false }), ['favlive', 'favaus', 'fremd']);
  assert.deepEqual(r.find((x) => x.login === 'fremd'), k('fremd', { favorit: true, gefolgt: false }));
});

test('sternAnwenden: Stern weg - nicht gefolgt verschwindet, gefolgt bleibt', () => {
  const r = L.sternAnwenden(kanaele, kanaele[1], ['favlive']);
  assert.equal(r.some((x) => x.login === 'favaus'), false);
  const r2 = L.sternAnwenden(kanaele, kanaele[0], ['favaus']);
  assert.deepEqual([r2.find((x) => x.login === 'favlive').favorit, r2.find((x) => x.login === 'favlive').gefolgt], [false, true]);
});

test('createLaufnummer: nur die zuletzt gestartete Ladung ist aktuell', () => {
  const lauf = L.createLaufnummer();
  const alt = lauf.start();
  const neu = lauf.start();
  assert.equal(lauf.aktuell(alt), false);
  assert.equal(lauf.aktuell(neu), true);
  lauf.start(); // z. B. Stern-Klick entwertet laufende Ladungen
  assert.equal(lauf.aktuell(neu), false);
});

test('nur Offline-Favoriten: kein Favoriten-Abschnitt, sie fuehren Offline an', () => {
  const r = L.abschnitte({ kanaele: [k('b'), k('a', { favorit: true })], nadel: '', zu: {} });
  assert.deepEqual(r.abschnitte.map((a) => a.art), ['offline']);
  assert.deepEqual(r.abschnitte[0].kanaele.map((x) => x.login), ['a', 'b']);
});

test('Twitch-Treffer gelten nur fuer den Suchtext, zu dem sie gehoeren', () => {
  const twitch = [k('fremd', { gefolgt: undefined })];
  const alt = L.abschnitte({ kanaele, nadel: 'ab', twitch, twitchFuer: 'fr', zu: {} });
  assert.equal(alt.abschnitte.some((a) => a.art === 'twitch'), false);
  const passend = L.abschnitte({ kanaele, nadel: 'fr', twitch, twitchFuer: 'fr', zu: {} });
  assert.equal(passend.abschnitte.some((a) => a.art === 'twitch'), true);
});

test('sterneNachholen: Stern-Klicks waehrend des Ladens gehen nicht verloren', () => {
  const geladen = [k('gefolgtaus')]; // Main las die Favoriten vor dem Klick
  const r = L.sterneNachholen(geladen, [{ ch: k('fremd', { gefolgt: false }), favoriten: ['fremd'] }]);
  assert.deepEqual(r.map((x) => [x.login, x.favorit]), [['gefolgtaus', false], ['fremd', true]]);
  assert.deepEqual(L.sterneNachholen(geladen, []), geladen);
});
