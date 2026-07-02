const { test } = require('node:test');
const assert = require('node:assert');
const { parseIrc, badgeTypes, privmsgText } = require('../renderer/lib/irc');

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
