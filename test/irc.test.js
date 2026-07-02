const { test } = require('node:test');
const assert = require('node:assert');
const { parseIrc, badgeTypes, privmsgText, emoteTokens } = require('../renderer/lib/irc');

// Realistische Twitch-IRC-Zeile (gekuerzt) mit Badges, Farbe, Display-Name.
const SAMPLE =
  '@badge-info=subscriber/26;badges=subscriber/24,premium/1;color=#B22222;' +
  'display-name=MaxMuster;emotes=;flags=;mod=0;room-id=123;subscriber=1;' +
  'turbo=0;user-type= :maxmuster!maxmuster@maxmuster.tmi.twitch.tv ' +
  'PRIVMSG #somechannel :hallo :) wie gehts';

test('parseIrc: PRIVMSG mit Tags, Prefix, Text mit Doppelpunkt', () => {
  const m = parseIrc(SAMPLE);
  assert.equal(m.command, 'PRIVMSG');
  assert.equal(m.tags['display-name'], 'MaxMuster');
  assert.equal(m.tags['color'], '#B22222');
  assert.equal(m.tags['badges'], 'subscriber/24,premium/1');
  assert.equal(m.prefix.split('!')[0], 'maxmuster');
  assert.equal(privmsgText(m.params), 'hallo :) wie gehts');
});

test('parseIrc: Tags mit leerem Wert und ohne =', () => {
  const m = parseIrc('@emotes=;vip :x!x@x PRIVMSG #c :hi');
  assert.equal(m.tags['emotes'], '');
  assert.equal(m.tags['vip'], '');
});

test('parseIrc: Zeile ohne Tags (PING, 366)', () => {
  assert.equal(parseIrc('PING :tmi.twitch.tv').command, 'PING');
  const joined = parseIrc(':nick.tmi.twitch.tv 366 nick #chan :End of /NAMES list');
  assert.equal(joined.command, '366');
});

test('badgeTypes: Moderator + Subscriber werden erkannt', () => {
  assert.deepEqual(
    badgeTypes({ badges: 'moderator/1,subscriber/12' }),
    ['moderator', 'subscriber']
  );
  assert.deepEqual(badgeTypes({ badges: 'broadcaster/1' }), ['broadcaster']);
  assert.deepEqual(badgeTypes({ badges: '' }), []);
  assert.deepEqual(badgeTypes({}), []);
  assert.deepEqual(badgeTypes(null), []);
});

test('emoteTokens: ein Emote mitten im Text', () => {
  assert.deepEqual(emoteTokens('hi Kappa hi', '25:3-7'), [
    { type: 'text', value: 'hi ' },
    { type: 'emote', name: 'Kappa', id: '25' },
    { type: 'text', value: ' hi' }
  ]);
});

test('emoteTokens: mehrere Emotes, mehrfaches Vorkommen', () => {
  // "Kappa hi Kappa VoHiYo" -> 25 an 0-4 und 9-13, 81274 an 15-20
  assert.deepEqual(emoteTokens('Kappa hi Kappa VoHiYo', '25:0-4,9-13/81274:15-20'), [
    { type: 'emote', name: 'Kappa', id: '25' },
    { type: 'text', value: ' hi ' },
    { type: 'emote', name: 'Kappa', id: '25' },
    { type: 'text', value: ' ' },
    { type: 'emote', name: 'VoHiYo', id: '81274' }
  ]);
});

test('emoteTokens: Ranges zaehlen Codepoints (Emoji davor)', () => {
  // Das Herz ist EIN Codepoint mit 2 UTF-16-Einheiten; Twitch zaehlt Codepoints.
  assert.deepEqual(emoteTokens('💜 Kappa', '25:2-6'), [
    { type: 'text', value: '💜 ' },
    { type: 'emote', name: 'Kappa', id: '25' }
  ]);
});

test('emoteTokens: leerer/kaputter Tag -> reiner Text, wirft nie', () => {
  assert.deepEqual(emoteTokens('nur text', ''), [{ type: 'text', value: 'nur text' }]);
  assert.deepEqual(emoteTokens('nur text', null), [{ type: 'text', value: 'nur text' }]);
  // Range ausserhalb des Texts / verkehrt herum -> ignorieren
  assert.deepEqual(emoteTokens('kurz', '25:0-99'), [{ type: 'text', value: 'kurz' }]);
  assert.deepEqual(emoteTokens('kurz', '25:3-1'), [{ type: 'text', value: 'kurz' }]);
  assert.deepEqual(emoteTokens('kurz', 'kaputt'), [{ type: 'text', value: 'kurz' }]);
  assert.deepEqual(emoteTokens('', '25:0-4'), []);
});
