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

// --- Einpassen in den Bildschirm (Arbeitsbereich ohne Taskleiste) ------------
const wa = { x: 0, y: 0, width: 1920, height: 1040 };
const passt = (b) => b.x >= wa.x && b.y >= wa.y && b.x + b.width <= wa.x + wa.width && b.y + b.height <= wa.y + wa.height;

test('einpassen rechts: Chat wuerde rechts rausragen -> Video rueckt nach links', () => {
  const v = { x: 1000, y: 100, width: 800, height: 450 };
  const r = D.einpassen(v, { x: 0, y: 0, width: 400, height: 450 }, 'rechts', wa);
  assert.deepEqual(r.video, { x: 720, y: 100, width: 800, height: 450 });
  assert.ok(passt(r.chat) && passt(r.video));
});

test('einpassen rechts: zusammen zu breit -> Video wird schmaler, Hoehe passt mit', () => {
  const v = { x: 0, y: 0, width: 1800, height: 1013 };
  const r = D.einpassen(v, { x: 0, y: 0, width: 400, height: 500 }, 'rechts', wa);
  assert.equal(r.video.width + r.chat.width, 1920);
  assert.equal(r.chat.width, 400);
  assert.ok(passt(r.chat) && passt(r.video));
});

test('einpassen links: Chat wuerde links rausragen -> Video rueckt nach rechts', () => {
  const r = D.einpassen({ x: 100, y: 100, width: 800, height: 450 }, { x: 0, y: 0, width: 350, height: 450 }, 'links', wa);
  assert.equal(r.video.x, 350);
  assert.equal(r.chat.x, 0);
  assert.ok(passt(r.chat) && passt(r.video));
});

test('einpassen unten: Chat wuerde unten rausragen -> Video rueckt hoch bzw. wird niedriger', () => {
  const r = D.einpassen({ x: 100, y: 600, width: 800, height: 450 }, { x: 0, y: 0, width: 800, height: 300 }, 'unten', wa);
  assert.equal(r.video.y, 290);
  assert.ok(passt(r.chat) && passt(r.video));
  const r2 = D.einpassen({ x: 0, y: 0, width: 1600, height: 900 }, { x: 0, y: 0, width: 1600, height: 400 }, 'unten', wa);
  assert.equal(r2.video.height + r2.chat.height, 1040);
  assert.ok(passt(r2.chat) && passt(r2.video));
});

test('einpassen: zu kleiner Bildschirm -> auch der Chat schrumpft, aber nie unter das Minimum', () => {
  const klein = { x: 0, y: 0, width: 900, height: 700 };
  const r = D.einpassen({ x: 0, y: 0, width: 800, height: 450 }, { x: 0, y: 0, width: 500, height: 450 }, 'rechts', klein);
  assert.equal(r.video.width + r.chat.width, 900);
  assert.ok(r.video.width >= D.MIN.videoBreite && r.chat.width >= D.MIN.chatBreite);
});

test('einpassen: zweiter Monitor mit Versatz wird beachtet', () => {
  const rechterMonitor = { x: 1920, y: 0, width: 1920, height: 1040 };
  const r = D.einpassen({ x: 3000, y: 50, width: 800, height: 450 }, { x: 0, y: 0, width: 400, height: 450 }, 'rechts', rechterMonitor);
  assert.equal(r.chat.x + r.chat.width, 3840);
  assert.equal(r.video.x, 2640);
});
