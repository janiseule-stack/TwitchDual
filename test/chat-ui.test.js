const { test } = require('node:test');
const assert = require('node:assert');
const ChatUi = require('../renderer/lib/chat-ui');

// --- clampFontSize ---------------------------------------------------------
test('clampFontSize: gueltige Werte bleiben, Grenzen gelten', () => {
  assert.equal(ChatUi.clampFontSize(14), 14);
  assert.equal(ChatUi.clampFontSize(11), 11);
  assert.equal(ChatUi.clampFontSize(22), 22);
  assert.equal(ChatUi.clampFontSize(10), 11);
  assert.equal(ChatUi.clampFontSize(99), 22);
});

test('clampFontSize: Strings/Muell -> Zahl oder Default 14', () => {
  assert.equal(ChatUi.clampFontSize('16'), 16);
  assert.equal(ChatUi.clampFontSize(14.6), 15); // rundet
  assert.equal(ChatUi.clampFontSize('abc'), 14);
  assert.equal(ChatUi.clampFontSize(undefined), 14);
  assert.equal(ChatUi.clampFontSize(null), 14);
  assert.equal(ChatUi.clampFontSize(NaN), 14);
});

// --- emoteProvider ---------------------------------------------------------
test('emoteProvider: erkennt die vier Anbieter am Hostname', () => {
  assert.equal(ChatUi.emoteProvider('https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0'), 'Twitch');
  assert.equal(ChatUi.emoteProvider('https://cdn.7tv.app/emote/01ABC/2x.webp'), '7TV');
  assert.equal(ChatUi.emoteProvider('https://cdn.7tv.io/emote/01ABC/2x.webp'), '7TV');
  assert.equal(ChatUi.emoteProvider('https://cdn.betterttv.net/emote/5f1b0186cf6d2144653d2970/2x'), 'BTTV');
  assert.equal(ChatUi.emoteProvider('https://cdn.frankerfacez.com/emote/128054/2'), 'FFZ');
});

test('emoteProvider: unbekannt/kaputt -> leerer String', () => {
  assert.equal(ChatUi.emoteProvider('https://example.com/emote.png'), '');
  assert.equal(ChatUi.emoteProvider('kein-url'), '');
  assert.equal(ChatUi.emoteProvider(null), '');
  assert.equal(ChatUi.emoteProvider(undefined), '');
});

// --- lastMessagesOf --------------------------------------------------------
test('lastMessagesOf: letzte N des Users, chronologisch', () => {
  const entries = [
    { name: 'anna', text: 'eins' },
    { name: 'bob', text: 'zwei' },
    { name: 'anna', text: 'drei' },
    { name: 'anna', text: 'vier' }
  ];
  assert.deepEqual(ChatUi.lastMessagesOf(entries, 'anna', 2), ['drei', 'vier']);
  assert.deepEqual(ChatUi.lastMessagesOf(entries, 'anna'), ['eins', 'drei', 'vier']);
});

test('lastMessagesOf: kein Treffer / kaputte Eintraege -> leer bzw. uebersprungen', () => {
  assert.deepEqual(ChatUi.lastMessagesOf([], 'anna'), []);
  assert.deepEqual(ChatUi.lastMessagesOf([{ name: 'bob', text: 'x' }], 'anna'), []);
  assert.deepEqual(
    ChatUi.lastMessagesOf([null, { name: 'anna' }, { name: 'anna', text: 'ok' }], 'anna'),
    ['ok']
  );
});

// --- createRateMeter -------------------------------------------------------
test('createRateMeter: zaehlt Ereignisse im Fenster, alte fallen raus', () => {
  const m = ChatUi.createRateMeter({ windowMs: 1000 });
  assert.equal(m.tick(1000), 1);
  assert.equal(m.tick(1100), 2);
  assert.equal(m.tick(1900), 3);
  assert.equal(m.tick(2150), 2); // 1000 und 1100 sind aelter als 2150-1000 -> raus
});

test('createRateMeter: Fenstergrenze exakt', () => {
  const m = ChatUi.createRateMeter({ windowMs: 1000 });
  m.tick(0);
  assert.equal(m.tick(1000), 2);  // 0 ist genau am Rand -> zaehlt noch
  assert.equal(m.tick(1001), 2);  // jetzt ist 0 raus: 1000, 1001
});

test('createRateMeter: reset leert das Fenster', () => {
  const m = ChatUi.createRateMeter();
  m.tick(1); m.tick(2);
  m.reset();
  assert.equal(m.tick(3), 1);
});

// --- rateHeat --------------------------------------------------------------
test('rateHeat: 0 msg/min -> 0', () => {
  assert.strictEqual(ChatUi.rateHeat(0), 0);
});
test('rateHeat: an der Obergrenze -> 1', () => {
  assert.strictEqual(ChatUi.rateHeat(120), 1);
});
test('rateHeat: darueber wird geclampt auf 1', () => {
  assert.strictEqual(ChatUi.rateHeat(500), 1);
});
test('rateHeat: negativ -> 0', () => {
  assert.strictEqual(ChatUi.rateHeat(-5), 0);
});
test('rateHeat: Mitte -> 0.5', () => {
  assert.strictEqual(ChatUi.rateHeat(60), 0.5);
});
test('rateHeat: eigener max-Wert', () => {
  assert.strictEqual(ChatUi.rateHeat(30, 60), 0.5);
});
