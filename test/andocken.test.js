const { test } = require('node:test');
const assert = require('node:assert');
const D = require('../src/andocken');

const video = { x: 100, y: 100, width: 800, height: 450 };

test('erkenneSeite: rechts, links, unten innerhalb der Schwelle', () => {
  assert.equal(D.erkenneSeite(video, { x: 912, y: 150, width: 300, height: 400 }), 'rechts');
  assert.equal(D.erkenneSeite(video, { x: -205, y: 120, width: 300, height: 400 }), 'links');
  assert.equal(D.erkenneSeite(video, { x: 150, y: 560, width: 600, height: 300 }), 'unten');
});

test('erkenneSeite: zu weit weg oder ohne Ueberlappung -> null', () => {
  assert.equal(D.erkenneSeite(video, { x: 960, y: 150, width: 300, height: 400 }), null, '60 px Abstand');
  assert.equal(D.erkenneSeite(video, { x: 905, y: 700, width: 300, height: 400 }), null, 'rechts, aber ganz unterhalb');
  assert.equal(D.erkenneSeite(video, { x: 1500, y: 560, width: 300, height: 300 }), null, 'unten, aber seitlich daneben');
});

test('erkenneSeite: ueberlappende Fenster docken nicht', () => {
  assert.equal(D.erkenneSeite(video, { x: 500, y: 200, width: 300, height: 300 }), null);
});

test('position: rechts/links mit Videohoehe, unten mit Videobreite; eigene Breite/Hoehe bleibt', () => {
  const chat = { x: 0, y: 0, width: 320, height: 999 };
  assert.deepEqual(D.position(video, chat, 'rechts'), { x: 900, y: 100, width: 320, height: 450 });
  assert.deepEqual(D.position(video, chat, 'links'), { x: -220, y: 100, width: 320, height: 450 });
  assert.deepEqual(D.position(video, { ...chat, height: 250 }, 'unten'), { x: 100, y: 550, width: 800, height: 250 });
});

test('istGeloest: erst ab mehr als der Schwelle vom Sollplatz weg', () => {
  const soll = { x: 900, y: 100, width: 320, height: 450 };
  assert.equal(D.istGeloest(soll, { ...soll, x: 915 }), false);
  assert.equal(D.istGeloest(soll, { ...soll, x: 950 }), true);
  assert.equal(D.istGeloest(soll, { ...soll, y: 160 }), true);
});

test('liesSeite: nur gueltige Seiten, sonst null', () => {
  assert.equal(D.liesSeite('rechts'), 'rechts');
  assert.equal(D.liesSeite('oben'), null);
  assert.equal(D.liesSeite(undefined), null);
});

// --- Einpassen: Video bleibt, Chat passt sich an (wie auf twitch.tv) ---------
const wa = { x: 0, y: 0, width: 1920, height: 1040 };
const passt = (b) => b.x >= wa.x && b.y >= wa.y && b.x + b.width <= wa.x + wa.width && b.y + b.height <= wa.y + wa.height;

test('einpassen rechts: genug Platz -> Video unveraendert, Chat schmaler bis er passt', () => {
  const v = { x: 100, y: 100, width: 1200, height: 675 };
  const r = D.einpassen(v, { x: 0, y: 0, width: 800, height: 400 }, 'rechts', wa);
  assert.deepEqual(r.video, v);
  assert.equal(r.chat.width, 620);
  assert.ok(passt(r.chat));
});

test('einpassen rechts: Chat passt schon -> bleibt so breit', () => {
  const v = { x: 100, y: 100, width: 800, height: 450 };
  const r = D.einpassen(v, { x: 0, y: 0, width: 350, height: 400 }, 'rechts', wa);
  assert.deepEqual(r.video, v);
  assert.equal(r.chat.width, 350);
});

test('einpassen rechts: kaum Platz -> Chat bekommt Twitch-Breite, Video rueckt dafuer', () => {
  const v = { x: 1000, y: 100, width: 800, height: 450 };
  const r = D.einpassen(v, { x: 0, y: 0, width: 500, height: 400 }, 'rechts', wa);
  assert.equal(r.chat.width, D.KOMFORT.chatBreite);
  assert.equal(r.video.width, 800);
  assert.ok(passt(r.chat) && passt(r.video));
});

test('einpassen links: gespiegelt', () => {
  const r = D.einpassen({ x: 600, y: 100, width: 1000, height: 560 }, { x: 0, y: 0, width: 900, height: 400 }, 'links', wa);
  assert.equal(r.chat.width, 600);
  assert.equal(r.chat.x, 0);
  const eng = D.einpassen({ x: 100, y: 100, width: 800, height: 450 }, { x: 0, y: 0, width: 500, height: 400 }, 'links', wa);
  assert.equal(eng.chat.width, D.KOMFORT.chatBreite);
  assert.ok(passt(eng.chat) && passt(eng.video));
});

test('einpassen unten: Chat niedriger; kaum Platz -> Komfort-Hoehe, Video rueckt hoch', () => {
  const r = D.einpassen({ x: 100, y: 100, width: 800, height: 450 }, { x: 0, y: 0, width: 800, height: 900 }, 'unten', wa);
  assert.equal(r.chat.height, 490);
  const eng = D.einpassen({ x: 100, y: 500, width: 800, height: 450 }, { x: 0, y: 0, width: 800, height: 400 }, 'unten', wa);
  assert.equal(eng.chat.height, D.KOMFORT.chatHoehe);
  assert.ok(passt(eng.chat) && passt(eng.video));
});

test('einpassen: zweiter Monitor mit Versatz wird beachtet', () => {
  const rechterMonitor = { x: 1920, y: 0, width: 1920, height: 1040 };
  const r = D.einpassen({ x: 2000, y: 50, width: 1200, height: 675 }, { x: 0, y: 0, width: 900, height: 450 }, 'rechts', rechterMonitor);
  assert.equal(r.chat.x + r.chat.width, 3840);
});

test('vollbild: Video links, Chat rechts mit ~20 % (340-480 px), fuellt den Bildschirm', () => {
  const r = D.vollbild(wa);
  assert.deepEqual(r.chat, { x: 1536, y: 0, width: 384, height: 1040 });
  assert.deepEqual(r.video, { x: 0, y: 0, width: 1536, height: 1040 });
  assert.equal(D.vollbild({ x: 0, y: 0, width: 1280, height: 680 }).chat.width, 340);
  assert.equal(D.vollbild({ x: 0, y: 0, width: 3440, height: 1400 }).chat.width, 480);
});
