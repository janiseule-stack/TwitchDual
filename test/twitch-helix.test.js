// test/twitch-helix.test.js
const test = require('node:test');
const assert = require('node:assert');
const helix = require('../src/twitch-helix');

// fetch-Mock, der eine Sequenz von Antworten pro Aufruf zurueckgibt.
function seqFetch(responses) {
  let i = 0;
  return async (url, opts) => {
    const body = responses[i++];
    return { ok: true, status: 200, async json() { return body; } };
  };
}

test('getFollowedChannels fuehrt mehrere Seiten zusammen', async () => {
  const fetchImpl = seqFetch([
    { data: [{ broadcaster_login: 'a', broadcaster_name: 'A', broadcaster_id: '1' }], pagination: { cursor: 'C' } },
    { data: [{ broadcaster_login: 'b', broadcaster_name: 'B', broadcaster_id: '2' }], pagination: {} }
  ]);
  const r = await helix.getFollowedChannels({ userId: '9', accessToken: 'AT', fetchImpl });
  assert.deepEqual(r.map((c) => c.login), ['a', 'b']);
  assert.equal(r[1].displayName, 'B');
});

test('getUserEmotes baut die Bild-URL aus dem Template', async () => {
  const fetchImpl = seqFetch([
    { data: [{ id: '007', name: 'Kappa' }], template: 'https://cdn/{{id}}/{{format}}/{{theme_mode}}/{{scale}}', pagination: {} }
  ]);
  const r = await helix.getUserEmotes({ userId: '9', accessToken: 'AT', fetchImpl });
  assert.equal(r[0].name, 'Kappa');
  assert.equal(r[0].url, 'https://cdn/007/static/dark/2.0');
});

test('getFollowedChannels sendet Client-Id und Bearer-Header', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => { seen = opts; return { ok: true, status: 200, async json() { return { data: [], pagination: {} }; } }; };
  await helix.getFollowedChannels({ userId: '9', accessToken: 'AT', fetchImpl });
  assert.ok(seen.headers['Client-Id']);
  assert.equal(seen.headers.Authorization, 'Bearer AT');
});
