// test/chat-send-core.test.js
const test = require('node:test');
const assert = require('node:assert');
const core = require('../src/chat-send-core');

test('formatPrivmsg baut die IRC-Zeile', () => {
  assert.equal(core.formatPrivmsg('Janis', 'hallo welt'), 'PRIVMSG #janis :hallo welt');
});

test('formatPrivmsg entfernt CR/LF (kein IRC-Injection)', () => {
  assert.equal(core.formatPrivmsg('c', 'a\r\nJOIN #evil'), 'PRIVMSG #c :a JOIN #evil');
});

test('RateLimiter erlaubt max Nachrichten pro Fenster', () => {
  const rl = new core.RateLimiter(2, 1000);
  assert.equal(rl.tryAcquire(0), true);
  assert.equal(rl.tryAcquire(100), true);
  assert.equal(rl.tryAcquire(200), false);   // 3. im Fenster -> blockiert
  assert.equal(rl.tryAcquire(1200), true);   // Fenster weiter -> wieder frei
});

test('noticeText uebersetzt bekannte msg-id', () => {
  assert.match(core.noticeText('msg_slowmode', 'x'), /Slow-Mode/i);
  assert.match(core.noticeText('msg_followersonly', 'x'), /Follower/i);
  assert.match(core.noticeText('msg_banned', 'x'), /gebannt|gesperrt/i);
});

test('noticeText faellt auf Rohtext zurueck', () => {
  assert.equal(core.noticeText('unbekannt_xyz', 'Roh-Meldung'), 'Roh-Meldung');
});

// Diagnose-Protokoll 08-10/2026: 62 von 74 "senden-fehler" waren Raum-Modus-
// Wechsel, die Twitch an ALLE Zuschauer schickt - keine Sendefehler.
test('isNoticeInfo erkennt Raum-Modus-Wechsel als Info', () => {
  for (const id of ['emote_only_on', 'emote_only_off', 'slow_on', 'slow_off',
    'subs_on', 'subs_off', 'followers_on', 'followers_on_zero', 'followers_off',
    'r9k_on', 'r9k_off']) {
    assert.equal(core.isNoticeInfo(id), true, id);
  }
});

test('isNoticeInfo laesst echte Ablehnungen und Unbekanntes als Fehler', () => {
  for (const id of ['msg_slowmode', 'msg_emoteonly', 'msg_banned', 'msg_requires_verified_phone_number', null, undefined, 'unbekannt_xyz']) {
    assert.equal(core.isNoticeInfo(id), false, String(id));
  }
});

test('noticeText uebersetzt Raum-Modus-Wechsel und Telefon-Pflicht', () => {
  assert.match(core.noticeText('emote_only_on', 'This room is now in emote-only mode.'), /Nur-Emote/i);
  assert.match(core.noticeText('slow_off', 'This room is no longer in slow mode.'), /Slow-Mode/i);
  assert.match(core.noticeText('subs_on', 'x'), /Abonnenten/i);
  assert.match(core.noticeText('msg_requires_verified_phone_number', 'x'), /Telefon/i);
});

test('parseRoomstate liest Tags', () => {
  const r = core.parseRoomstate({ 'followers-only': '10', 'subs-only': '0', slow: '30', 'emote-only': '1' });
  assert.equal(r.followersOnly, 10);
  assert.equal(r.subsOnly, false);
  assert.equal(r.slowSeconds, 30);
  assert.equal(r.emoteOnly, true);
});
