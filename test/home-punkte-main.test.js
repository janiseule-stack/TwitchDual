const { test } = require('node:test');
const assert = require('node:assert');
const { homePunkte } = require('../src/home-punkte');

function fakeApi(antwort) {
  const aufrufe = [];
  return {
    aufrufe,
    context: async (token, login) => {
      aufrufe.push({ token, login });
      if (antwort instanceof Error) throw antwort;
      return antwort;
    }
  };
}

test('gueltiger Kanal liefert Stand und Symbol, mehr nicht', async () => {
  const api = fakeApi({ balance: 120, iconUrl: 'u', channelID: '1', claimID: 'x' });
  const r = await homePunkte({ login: 'kanal_a', token: 't', api });
  assert.deepStrictEqual(r, { ok: true, balance: 120, iconUrl: 'u' });
});

test('Login wird getrimmt und klein geschrieben', async () => {
  const api = fakeApi({ balance: 1, iconUrl: null });
  await homePunkte({ login: ' Kanal_A ', token: 't', api });
  assert.strictEqual(api.aufrufe[0].login, 'kanal_a');
});

test('ungueltige Logins: api wird nicht gerufen', async () => {
  for (const login of ['a b', 'x', '', null, undefined, 'a'.repeat(26)]) {
    const api = fakeApi({ balance: 1, iconUrl: null });
    const r = await homePunkte({ login, token: 't', api });
    assert.deepStrictEqual(r, { ok: false, error: 'ungueltiger Kanal' });
    assert.strictEqual(api.aufrufe.length, 0);
  }
});

test('ohne Token: nicht angemeldet, api nicht gerufen', async () => {
  const api = fakeApi({ balance: 1, iconUrl: null });
  const r = await homePunkte({ login: 'kanal_a', token: null, api });
  assert.deepStrictEqual(r, { ok: false, error: 'nicht angemeldet' });
  assert.strictEqual(api.aufrufe.length, 0);
});

test('abgelaufener Token setzt abgelaufen', async () => {
  const api = fakeApi(new Error('Anmeldung abgelaufen (HTTP 401)'));
  const r = await homePunkte({ login: 'kanal_a', token: 't', api });
  assert.deepStrictEqual(r, { ok: false, error: 'Anmeldung abgelaufen (HTTP 401)', abgelaufen: true });
});

test('gesperrt setzt gesperrt', async () => {
  const api = fakeApi(new Error('Von Twitch gesperrt: service error'));
  const r = await homePunkte({ login: 'kanal_a', token: 't', api });
  assert.deepStrictEqual(r, { ok: false, error: 'Von Twitch gesperrt: service error', gesperrt: true });
});

test('anderer Fehler ohne Flags', async () => {
  const api = fakeApi(new Error('Twitch-Fehler: x'));
  const r = await homePunkte({ login: 'kanal_a', token: 't', api });
  assert.deepStrictEqual(r, { ok: false, error: 'Twitch-Fehler: x' });
});
