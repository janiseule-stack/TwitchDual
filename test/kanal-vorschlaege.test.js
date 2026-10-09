const { test } = require('node:test');
const assert = require('node:assert');
const V = require('../renderer/lib/kanal-vorschlaege');

const quellen = {
  gefolgt: [
    { login: 'papaplatte', displayName: 'Papaplatte', live: false },
    { login: 'zarbex', displayName: 'Zarbex', live: true },
    { login: 'trymacs', displayName: 'Trymacs', live: false },
    { login: 'montanablack88', displayName: 'MontanaBlack88', live: true }
  ],
  favoriten: ['papaplatte', 'gronkh'],
  verlauf: [{ value: 'tolkin', mode: 'live', label: 'tolkin' }, { value: '2251234567', mode: 'vod', label: 'VOD 2251234567' }]
};

test('lokaleTreffer: leere Eingabe -> keine Vorschlaege', () => {
  assert.deepEqual(V.lokaleTreffer('', quellen), []);
  assert.deepEqual(V.lokaleTreffer('   ', quellen), []);
});

test('lokaleTreffer: findet Teilstring in Login und Anzeigename, case-insensitiv', () => {
  assert.deepEqual(V.lokaleTreffer('PLATT', quellen).map((t) => t.login), ['papaplatte']);
  assert.deepEqual(V.lokaleTreffer('black', quellen).map((t) => t.login), ['montanablack88']);
});

test('lokaleTreffer: Favoriten und Verlauf zaehlen mit, VODs aus dem Verlauf nicht', () => {
  assert.deepEqual(V.lokaleTreffer('gron', quellen).map((t) => t.login), ['gronkh']);
  assert.deepEqual(V.lokaleTreffer('tolk', quellen).map((t) => t.login), ['tolkin']);
  assert.deepEqual(V.lokaleTreffer('2251', quellen), []);
});

test('lokaleTreffer: ein Kanal aus mehreren Quellen erscheint einmal, mit bekannten Daten', () => {
  const t = V.lokaleTreffer('papa', quellen);
  assert.equal(t.length, 1);
  assert.equal(t[0].displayName, 'Papaplatte');
  assert.equal(t[0].quelle, 'gefolgt');
});

test('lokaleTreffer: Anfang vor Teilstring, darin live zuerst', () => {
  const q = { gefolgt: [
    { login: 'xa', displayName: 'xa', live: false },
    { login: 'ax', displayName: 'ax', live: true },
    { login: 'xb', displayName: 'xb', live: true }
  ] };
  assert.deepEqual(V.lokaleTreffer('x', q).map((t) => t.login), ['xb', 'xa', 'ax']);
});

test('lokaleTreffer: exakter Treffer steht ganz oben', () => {
  const q = { gefolgt: [
    { login: 'tolkinlive', displayName: 'tolkinlive', live: true },
    { login: 'tolkin', displayName: 'tolkin', live: false }
  ] };
  assert.equal(V.lokaleTreffer('tolkin', q)[0].login, 'tolkin');
});

test('lokaleTreffer: begrenzt auf max', () => {
  const gefolgt = Array.from({ length: 30 }, (_, i) => ({ login: 'k' + i, displayName: 'k' + i, live: false }));
  assert.equal(V.lokaleTreffer('k', { gefolgt }, 8).length, 8);
});

test('zusammenfuehren: lokale zuerst, Twitch-Treffer ohne Duplikate dahinter', () => {
  const lokal = [{ login: 'a', quelle: 'gefolgt' }];
  const twitch = [{ login: 'a', live: true }, { login: 'b', live: false }];
  const r = V.zusammenfuehren(lokal, twitch, 10);
  assert.deepEqual(r.map((t) => t.login), ['a', 'b']);
  assert.equal(r[1].quelle, 'twitch');
});

test('zusammenfuehren: lokaler Treffer uebernimmt Live-Status und Avatar aus Twitch', () => {
  const r = V.zusammenfuehren([{ login: 'a', live: false, quelle: 'favorit' }], [{ login: 'a', live: true, avatar: 'x.png', game: 'Just Chatting' }], 10);
  assert.equal(r[0].live, true);
  assert.equal(r[0].avatar, 'x.png');
  assert.equal(r[0].quelle, 'favorit');
});

test('zusammenfuehren: begrenzt auf max', () => {
  const twitch = Array.from({ length: 20 }, (_, i) => ({ login: 't' + i }));
  assert.equal(V.zusammenfuehren([], twitch, 10).length, 10);
});

test('sollSuchen: nur fuer kanalartige Eingaben, nicht fuer VOD-Links/IDs', () => {
  assert.equal(V.sollSuchen('papa'), true);
  assert.equal(V.sollSuchen('p'), true);
  assert.equal(V.sollSuchen(''), false);
  assert.equal(V.sollSuchen('2251234567'), false);
  assert.equal(V.sollSuchen('https://www.twitch.tv/videos/2251234567'), false);
  assert.equal(V.sollSuchen('twitch.tv/papaplatte'), false);
});
