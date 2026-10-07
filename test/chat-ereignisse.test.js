const { test } = require('node:test');
const assert = require('node:assert');
const { parseIrc } = require('../renderer/lib/irc');
const E = require('../renderer/lib/chat-ereignisse');

// Echte Twitch-USERNOTICE-Zeilen (gekuerzt, Namen ersetzt).
const RESUB = '@badge-info=subscriber/12;badges=subscriber/12;color=#FF4500;display-name=Mochi_Tee;' +
  'emotes=;login=mochi_tee;msg-id=resub;msg-param-cumulative-months=12;msg-param-sub-plan=1000;' +
  'room-id=1;system-msg=Mochi_Tee\\ssubscribed\\sat\\sTier\\s1. :tmi.twitch.tv USERNOTICE #papaplatte :gg wieder ein jahr';
const SUB_PRIME = '@display-name=Lurchi;login=lurchi;msg-id=sub;msg-param-cumulative-months=1;' +
  'msg-param-sub-plan=Prime :tmi.twitch.tv USERNOTICE #papaplatte';
const REGEN = '@display-name=Geber;login=geber;msg-id=submysterygift;msg-param-mass-gift-count=20;' +
  'msg-param-community-gift-id=777 :tmi.twitch.tv USERNOTICE #papaplatte';
const GESCHENK_AUS_REGEN = '@display-name=Geber;login=geber;msg-id=subgift;' +
  'msg-param-recipient-display-name=Glueckspilz;msg-param-community-gift-id=777 :tmi.twitch.tv USERNOTICE #papaplatte';
const GESCHENK_EINZELN = '@display-name=Geber;login=geber;msg-id=subgift;' +
  'msg-param-recipient-display-name=Nebel\\sKatze :tmi.twitch.tv USERNOTICE #papaplatte';
const ANON = '@display-name=AnAnonymousGifter;login=ananonymousgifter;msg-id=subgift;' +
  'msg-param-recipient-display-name=Wer :tmi.twitch.tv USERNOTICE #papaplatte';
const RAID = '@display-name=Fremder;login=fremder;msg-id=raid;msg-param-displayName=Fremder;' +
  'msg-param-viewerCount=1234 :tmi.twitch.tv USERNOTICE #papaplatte';
const UNBEKANNT = '@display-name=X;msg-id=announcement :tmi.twitch.tv USERNOTICE #papaplatte :hallo';

const ev = (zeile) => E.ereignisAus(parseIrc(zeile));

test('ereignisAus: Abo/Verlaengerung mit Monaten, Plan und eigener Nachricht', () => {
  assert.deepEqual(ev(RESUB), { art: 'abo', name: 'Mochi_Tee', monate: 12, prime: false, nachricht: 'gg wieder ein jahr' });
  assert.deepEqual(ev(SUB_PRIME), { art: 'abo', name: 'Lurchi', monate: 1, prime: true, nachricht: '' });
});

test('ereignisAus: Geschenke, Abo-Regen, Raid; Escapes aufgeloest', () => {
  assert.deepEqual(ev(REGEN), { art: 'abo-regen', name: 'Geber', anzahl: 20, gruppe: '777' });
  assert.deepEqual(ev(GESCHENK_EINZELN), { art: 'geschenk', name: 'Geber', empfaenger: 'Nebel Katze', gruppe: null });
  assert.equal(ev(ANON).name, 'Anonym');
  assert.deepEqual(ev(RAID), { art: 'raid', name: 'Fremder', anzahl: 1234 });
});

test('ereignisAus: alles andere null', () => {
  assert.equal(ev(UNBEKANNT), null);
  assert.equal(ev('@display-name=A :a!a@a PRIVMSG #x :hi'), null);
  assert.equal(E.ereignisAus(null), null);
});

test('zeile: verstaendlicher Text je Art', () => {
  assert.equal(E.zeile(ev(RESUB)), '⭐ Mochi_Tee abonniert seit 12 Monaten');
  assert.equal(E.zeile(ev(SUB_PRIME)), '⭐ Lurchi hat abonniert (Prime)');
  assert.equal(E.zeile(ev(REGEN)), '🎁 Geber verschenkt 20 Abos');
  assert.equal(E.zeile(ev(GESCHENK_EINZELN)), '🎁 Geber schenkt Nebel Katze ein Abo');
  assert.equal(E.zeile(ev(RAID)), '🚀 Fremder raidet mit 1.234 Zuschauern');
});

test('Filter: Abo-Regen gibt EINEN Effekt, seine Einzel-Geschenke keinen', () => {
  const f = E.createEreignisFilter({ abstandMs: 4000 });
  const regen = f.effekt(ev(REGEN), 1000);
  assert.deepEqual(regen, { art: 'abo', daten: { name: 'Geber', zeilen: ['Geber', '20 Abos verschenkt'] } });
  for (let i = 0; i < 20; i++) assert.equal(f.effekt(ev(GESCHENK_AUS_REGEN), 1100 + i), null);
  // Einzelnes Geschenk ausserhalb der Gruppe, nach der Pause: Effekt
  assert.deepEqual(f.effekt(ev(GESCHENK_EINZELN), 9000), { art: 'abo', daten: { name: 'Geber', zeilen: ['Geber', 'schenkt Nebel Katze ein Abo'] } });
});

test('Filter: Abos hoechstens alle abstandMs, Raid immer', () => {
  const f = E.createEreignisFilter({ abstandMs: 4000 });
  assert.deepEqual(f.effekt(ev(RESUB), 0), { art: 'abo', daten: { name: 'Mochi_Tee', zeilen: ['Mochi_Tee', 'seit 12 Monaten dabei'] } });
  assert.equal(f.effekt(ev(SUB_PRIME), 2000), null, 'zu dicht');
  assert.deepEqual(f.effekt(ev(RAID), 2100), { art: 'raid', daten: { name: 'Fremder', anzahl: 1234 } });
  assert.deepEqual(f.effekt(ev(SUB_PRIME), 4100).daten.zeilen, ['Lurchi', 'Prime-Abo']);
  const f2 = E.createEreignisFilter();
  assert.deepEqual(f2.effekt({ art: 'abo', name: 'Neu', monate: 1, prime: false }, 0).daten.zeilen, ['Neu', 'hat abonniert']);
});
