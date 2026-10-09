const { test } = require('node:test');
const assert = require('node:assert');
const A = require('../renderer/lib/anmeldung');

test('anzeige: beides da -> angemeldet mit Namen, kein Anmelde-Knopf', () => {
  assert.deepEqual(A.anzeige({ chat: true, punkte: true, name: 'zuschauer' }),
    { text: 'Angemeldet als zuschauer', knopf: null, abmelden: true });
});

test('anzeige: nichts da -> ein Knopf fuer alles', () => {
  assert.deepEqual(A.anzeige({ chat: false, punkte: false }),
    { text: 'Nicht angemeldet', knopf: 'Mit Twitch anmelden', abmelden: false });
});

test('anzeige: halb angemeldet -> unvollstaendig, sagt was fehlt', () => {
  assert.deepEqual(A.anzeige({ chat: true, punkte: false, name: 'x' }),
    { text: 'Anmeldung unvollständig – Kanalpunkte fehlen', knopf: 'Anmeldung abschließen', abmelden: true });
  assert.deepEqual(A.anzeige({ chat: false, punkte: true }),
    { text: 'Anmeldung unvollständig – Chat fehlt', knopf: 'Anmeldung abschließen', abmelden: true });
});

test('aktivierungsUrl: nimmt Twitchs URL mit device-code, sonst Code anhaengen', () => {
  assert.equal(A.aktivierungsUrl({ verification_uri: 'https://www.twitch.tv/activate?public=true&device-code=ABCD', user_code: 'ABCD' }),
    'https://www.twitch.tv/activate?public=true&device-code=ABCD');
  assert.equal(A.aktivierungsUrl({ verification_uri: 'https://www.twitch.tv/activate', user_code: 'WXYZ' }),
    'https://www.twitch.tv/activate?device-code=WXYZ');
});
