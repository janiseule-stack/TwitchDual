const { test } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const P = require('../src/fenster-paar');

function fenster(name, log) {
  const w = new EventEmitter();
  w.minimiert = false;
  w.sichtbar = true;
  w.weg = false;
  w.isDestroyed = () => w.weg;
  w.isVisible = () => w.sichtbar;
  w.isMinimized = () => w.minimiert;
  w.moveTop = () => log.push(`${name}.moveTop`);
  w.minimize = () => { log.push(`${name}.minimize`); w.minimiert = true; w.emit('minimize'); };
  w.showInactive = () => { log.push(`${name}.showInactive`); w.minimiert = false; w.emit('restore'); };
  return w;
}

function aufbau() {
  const log = [];
  let uhr = 10000;
  const video = fenster('video', log);
  const chat = fenster('chat', log);
  P.verbinde(video, chat, () => uhr);
  return { log, video, chat, vor: (ms) => { uhr += ms; } };
}

test('Fokus von aussen (Alt+Tab aus dem Spiel): Partner hoch, fokussiertes Fenster obenauf', () => {
  const { log, video } = aufbau();
  video.emit('focus');
  assert.deepStrictEqual(log, ['chat.moveTop', 'video.moveTop']);
});

test('Fokus kommt gerade vom Partner (Klick Video -> Chat): nichts umsortieren', () => {
  const { log, video, chat, vor } = aufbau();
  video.emit('blur');
  vor(5);
  chat.emit('focus');
  assert.deepStrictEqual(log, []);
});

test('Fokus lange nach dem Partner-Blur (Spiel dazwischen): Partner wieder hoch', () => {
  const { log, video, chat, vor } = aufbau();
  video.emit('blur');
  vor(P.PARTNER_WECHSEL_MS + 1000);
  chat.emit('focus');
  assert.deepStrictEqual(log, ['video.moveTop', 'chat.moveTop']);
});

test('Fokus: minimierter, unsichtbarer oder zerstoerter Partner bleibt in Ruhe', () => {
  for (const zustand of ['minimiert', 'unsichtbar', 'weg']) {
    const { log, video, chat } = aufbau();
    if (zustand === 'minimiert') chat.minimiert = true;
    if (zustand === 'unsichtbar') chat.sichtbar = false;
    if (zustand === 'weg') chat.weg = true;
    video.emit('focus');
    assert.deepStrictEqual(log, [], zustand);
  }
});

test('Minimieren nimmt den Partner mit - ohne Endlosschleife', () => {
  const { log, video, chat } = aufbau();
  video.minimiert = true;
  video.emit('minimize');
  assert.deepStrictEqual(log, ['chat.minimize']);
  assert.ok(chat.minimiert);
});

test('Wiederherstellen holt den Partner inaktiv zurueck - ohne Endlosschleife', () => {
  const { log, video, chat } = aufbau();
  video.minimiert = true;
  chat.minimiert = true;
  video.minimiert = false;
  video.emit('restore');
  assert.deepStrictEqual(log, ['chat.showInactive']);
  assert.ok(!chat.minimiert);
});
