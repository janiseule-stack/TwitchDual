// test/twitch-auth.test.js
const test = require('node:test');
const assert = require('node:assert');
const auth = require('../src/twitch-auth');

// Ein Mini-fetch-Mock: gibt pro URL eine vorbereitete Antwort zurueck.
function mockFetch(handler) {
  return async (url, opts) => {
    const { status, body } = handler(url, opts);
    return {
      status,
      ok: status >= 200 && status < 300,
      async json() { return body; },
      async text() { return JSON.stringify(body); }
    };
  };
}

test('startDeviceAuth liefert user_code und verification_uri', async () => {
  const fetchImpl = mockFetch((url, opts) => {
    assert.ok(url.startsWith('https://id.twitch.tv/oauth2/device'));
    assert.match(opts.body, /client_id=/);
    assert.match(opts.body, /scopes=chat%3Aread\+chat%3Aedit/);
    return { status: 200, body: {
      device_code: 'DEV', user_code: 'ABCD-EFGH',
      verification_uri: 'https://www.twitch.tv/activate', expires_in: 1800, interval: 5
    } };
  });
  const r = await auth.startDeviceAuth({ fetchImpl });
  assert.equal(r.user_code, 'ABCD-EFGH');
  assert.equal(r.interval, 5);
});

test('pollTokenOnce: authorization_pending -> pending', async () => {
  const fetchImpl = mockFetch(() => ({ status: 400, body: { message: 'authorization_pending' } }));
  const r = await auth.pollTokenOnce({ deviceCode: 'DEV', fetchImpl });
  assert.equal(r.status, 'pending');
});

test('pollTokenOnce: Erfolg -> authorized mit Tokens', async () => {
  const fetchImpl = mockFetch(() => ({ status: 200, body: {
    access_token: 'AT', refresh_token: 'RT', expires_in: 14400, scope: ['chat:read']
  } }));
  const r = await auth.pollTokenOnce({ deviceCode: 'DEV', fetchImpl });
  assert.equal(r.status, 'authorized');
  assert.equal(r.tokens.access_token, 'AT');
});

test('pollTokenOnce: slow_down -> slow_down', async () => {
  const fetchImpl = mockFetch(() => ({ status: 400, body: { message: 'slow_down' } }));
  const r = await auth.pollTokenOnce({ deviceCode: 'DEV', fetchImpl });
  assert.equal(r.status, 'slow_down');
});

test('refreshTokens gibt neues Token-Paar zurueck', async () => {
  const fetchImpl = mockFetch((url, opts) => {
    assert.match(opts.body, /grant_type=refresh_token/);
    assert.ok(!/client_secret/.test(opts.body)); // Public Client: kein Secret
    return { status: 200, body: { access_token: 'AT2', refresh_token: 'RT2', expires_in: 14400, scope: [] } };
  });
  const r = await auth.refreshTokens({ refreshToken: 'RT', fetchImpl });
  assert.equal(r.access_token, 'AT2');
  assert.equal(r.refresh_token, 'RT2');
});

test('validateToken parst login und user_id', async () => {
  const fetchImpl = mockFetch((url, opts) => {
    assert.equal(opts.headers.Authorization, 'OAuth AT');
    return { status: 200, body: { login: 'janis', user_id: '123', expires_in: 14000, scopes: ['chat:edit'] } };
  });
  const r = await auth.validateToken({ accessToken: 'AT', fetchImpl });
  assert.equal(r.login, 'janis');
  assert.equal(r.userId, '123');
});
