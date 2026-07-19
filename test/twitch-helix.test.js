// test/twitch-helix.test.js
const test = require('node:test');
const assert = require('node:assert');
const helix = require('../src/twitch-helix');

// fetch-Mock, der eine Sequenz von Antworten pro Aufruf zurueckgibt.
// calls (falls uebergeben) sammelt {url, opts} je Aufruf, damit Tests die
// tatsaechlich konstruierte Cursor-URL (nicht nur die Aufrufreihenfolge) pruefen koennen.
function seqFetch(responses, calls) {
  let i = 0;
  return async (url, opts) => {
    if (calls) calls.push({ url, opts });
    const body = responses[i++];
    return { ok: true, status: 200, async json() { return body; } };
  };
}

test('getFollowedChannels fuehrt mehrere Seiten zusammen', async () => {
  const calls = [];
  const fetchImpl = seqFetch([
    { data: [{ broadcaster_login: 'a', broadcaster_name: 'A', broadcaster_id: '1' }], pagination: { cursor: 'C' } },
    { data: [{ broadcaster_login: 'b', broadcaster_name: 'B', broadcaster_id: '2' }], pagination: {} }
  ], calls);
  const r = await helix.getFollowedChannels({ userId: '9', accessToken: 'AT', fetchImpl });
  assert.deepEqual(r.map((c) => c.login), ['a', 'b']);
  assert.equal(r[1].displayName, 'B');

  // Cursor-URL-Konstruktion tatsaechlich pruefen (nicht nur Aufrufreihenfolge):
  assert.equal(calls.length, 2);
  assert.ok(!calls[0].url.includes('after='), 'erste Anfrage darf keinen after-Cursor enthalten: ' + calls[0].url);
  assert.ok(calls[1].url.includes('&after=C'), 'zweite Anfrage muss den Cursor aus Seite 1 mit & anhaengen: ' + calls[1].url);
  assert.equal(calls[1].opts.headers.Authorization, 'Bearer AT');
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
