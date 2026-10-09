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
