const { test } = require('node:test');
const assert = require('node:assert');
const browse = require('../src/twitch-browse');

const antwort = (body) => async () => ({ ok: true, status: 200, async json() { return body; } });

test('findChannel: existierender Kanal -> Modell (auch offline)', async () => {
  const fetchImpl = antwort({ data: { user: { login: 'streamer', displayName: 'Streamer', profileImageURL: 'a.png', stream: null } } });
  const k = await browse.findChannel('Streamer', { fetchImpl });
  assert.equal(k.login, 'streamer');
  assert.equal(k.live, false);
  assert.equal(k.avatar, 'a.png');
});

test('findChannel: unbekannter Kanal -> null statt Platzhalter', async () => {
  assert.equal(await browse.findChannel('gibtsnichtxyz', { fetchImpl: antwort({ data: { user: null } }) }), null);
});

test('findChannel: ungueltiger Login -> null ohne Abfrage', async () => {
  let gefragt = false;
  const fetchImpl = async () => { gefragt = true; throw new Error('nein'); };
  assert.equal(await browse.findChannel('a b', { fetchImpl }), null);
  assert.equal(gefragt, false);
});

test('sucheVorschlaege: nur Kanaele aus Twitchs Vorschlaegen, Reihenfolge bleibt, Haken uebernommen', async () => {
  let gesendet;
  const fetchImpl = async (_url, init) => {
    gesendet = JSON.parse(init.body);
    return { ok: true, status: 200, async json() { return { data: { searchSuggestions: { edges: [
      { node: { text: 'streamertv', content: { __typename: 'SearchSuggestionChannel', login: 'streamertv', isLive: false, isVerified: true, profileImageURL: 'a.png', user: { displayName: 'StreamerTV', stream: null } } } },
      { node: { text: 'Albion Online', content: { __typename: 'SearchSuggestionCategory' } } },
      { node: { text: 'stre', content: null } },
      { node: { text: 'zweiter', content: { __typename: 'SearchSuggestionChannel', login: 'zweiter', isLive: true, isVerified: true, profileImageURL: 'b.png', user: { displayName: 'Zweiter', stream: { viewersCount: 1234, game: { displayName: 'Just Chatting' } } } } } }
    ] } } }; } };
  };
  const r = await browse.sucheVorschlaege('stre', { fetchImpl });
  assert.equal(gesendet.variables.q, 'stre');
  assert.deepEqual(r, [
    { login: 'streamertv', displayName: 'StreamerTV', avatar: 'a.png', live: false, verifiziert: true, game: '' },
    { login: 'zweiter', displayName: 'Zweiter', avatar: 'b.png', live: true, verifiziert: true, game: 'Just Chatting' }
  ]);
});

// GQL-Fake: beantwortet users(logins:) mit den uebergebenen Nutzern, merkt Bloecke.
function usersFake(bekannt, { scheitertBlock = -1 } = {}) {
  const bloecke = [];
  const fetchImpl = async (_url, init) => {
    const { variables } = JSON.parse(init.body);
    const nr = bloecke.push(variables.logins) - 1;
    if (nr === scheitertBlock) return { ok: false, status: 400, async json() { return {}; } };
    const users = variables.logins.map((l) => bekannt[l] || null);
    return { ok: true, status: 200, async json() { return { data: { users } }; } };
  };
  return { fetchImpl, bloecke };
}
const nutzer = (login, live) => ({ login, displayName: login.toUpperCase(), profileImageURL: login + '.png', stream: live ? { id: 's', title: 't', viewersCount: 5, game: { displayName: 'G' } } : null });

test('getLiveStatus: Bloecke zu 100, eine Abfrage pro Block', async () => {
  const logins = Array.from({ length: 250 }, (_, i) => 'k' + i);
  const { fetchImpl, bloecke } = usersFake({});
  const r = await browse.getLiveStatus(logins, { fetchImpl, retries: 0 });
  assert.deepEqual(bloecke.map((b) => b.length), [100, 100, 50]);
  assert.equal(r.length, 250);
});

test('getLiveStatus: unbekannte als Platzhalter, live zuerst, Duplikate einmal', async () => {
  const { fetchImpl } = usersFake({ streamer: nutzer('streamer', false), zweiter: nutzer('zweiter', true) });
  const r = await browse.getLiveStatus(['Streamer', 'gibtsnicht', 'zweiter', 'streamer'], { fetchImpl, retries: 0 });
  assert.deepEqual(r.map((k) => k.login), ['zweiter', 'gibtsnicht', 'streamer']);
  assert.equal(r[0].live, true);
  assert.deepEqual(r[1], { login: 'gibtsnicht', displayName: 'gibtsnicht', avatar: null, live: false });
});

test('getLiveStatus: gescheiterter Block -> nur dessen Kanaele mit error', async () => {
  const logins = Array.from({ length: 150 }, (_, i) => 'k' + i);
  const { fetchImpl } = usersFake({ k120: nutzer('k120', true) }, { scheitertBlock: 0 });
  const r = await browse.getLiveStatus(logins, { fetchImpl, retries: 0 });
  assert.equal(r.find((k) => k.login === 'k5').error, true);
  assert.equal(r.find((k) => k.login === 'k120').live, true);
  assert.equal(r.find((k) => k.login === 'k130').error, undefined);
});

test('getLiveStatus: GQL-Fehler mit HTTP 200 (users null) -> error statt stumm offline', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, async json() { return { errors: [{ message: 'timeout' }], data: { users: null } }; } });
  const r = await browse.getLiveStatus(['streamer', 'zweiter'], { fetchImpl, retries: 0 });
  assert.deepEqual(r.map((k) => k.error), [true, true]);
});
