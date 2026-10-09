const { test } = require('node:test');
const assert = require('node:assert');
const { AuthManager } = require('../src/auth-manager');

function speicher(bundle) {
  let b = bundle;
  return { available: () => true, load: () => b, save: (x) => { b = x; }, clear: () => { b = null; }, get: () => b };
}
const ABGELAUFEN = { access: 'A1', refresh: 'R1', userId: '9', login: 'zuschauer', expiresAt: 0 };

test('gleichzeitige getAccess bei abgelaufenem Token: nur EIN Refresh (Refresh-Token gilt nur einmal)', async () => {
  let aufrufe = 0;
  const authApi = {
    refreshTokens: async ({ refreshToken }) => {
      aufrufe++;
      if (refreshToken !== 'R1') { const e = new Error('Token-Refresh fehlgeschlagen (400)'); e.status = 400; throw e; }
      await new Promise((r) => setTimeout(r, 5));
      return { access_token: 'A2', refresh_token: 'R2', expires_in: 14400 };
    }
  };
  const am = new AuthManager({ tokenStore: speicher({ ...ABGELAUFEN }), authApi });
  const [a, b, c] = await Promise.all([am.getAccess(), am.getAccess(), am.getAccess()]);
  assert.equal(aufrufe, 1);
  assert.deepEqual([a.accessToken, b.accessToken, c.accessToken], ['A2', 'A2', 'A2']);
  assert.equal(am.status().loggedIn, true);
});

test('Netzfehler beim Refresh: angemeldet bleiben, naechster Aufruf versucht es neu', async () => {
  let netz = false;
  const authApi = {
    refreshTokens: async () => {
      if (!netz) throw new TypeError('fetch failed');
      return { access_token: 'A2', refresh_token: 'R2', expires_in: 14400 };
    }
  };
  const store = speicher({ ...ABGELAUFEN });
  const am = new AuthManager({ tokenStore: store, authApi });
  assert.equal(await am.getAccess(), null);
  assert.equal(am.status().loggedIn, true);
  assert.ok(store.get(), 'Token bleibt gespeichert');
  netz = true;
  assert.equal((await am.getAccess()).accessToken, 'A2');
});

test('Twitch lehnt den Refresh-Token ab (400): sauber abmelden', async () => {
  const authApi = { refreshTokens: async () => { const e = new Error('x'); e.status = 400; throw e; } };
  let gemeldet = null;
  const am = new AuthManager({ tokenStore: speicher({ ...ABGELAUFEN }), authApi, onChanged: (s) => { gemeldet = s; } });
  assert.equal(await am.getAccess(), null);
  assert.equal(am.status().loggedIn, false);
  assert.equal(gemeldet.loggedIn, false);
});
