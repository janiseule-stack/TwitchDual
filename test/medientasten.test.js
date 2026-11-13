// Medientaste / Windows-Medienfenster pausiert den Stream: der Pause-Waechter darf das
// nicht als ungewollte Pause rueckgaengig machen (Review 13.11.2026, Fund 2).
// medientastenEinbauen steht in preload.js und wird hier herausgeloest und mit
// Attrappen ausgefuehrt.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
const start = src.indexOf('function medientastenEinbauen(');
const ende = src.indexOf('// ende medientastenEinbauen', start);

function attrappe() {
  const handler = {};
  const gemeldet = [];
  const video = { pausen: 0, plays: 0, pause() { this.pausen++; }, play() { this.plays++; return Promise.resolve(); } };
  const win = {
    navigator: { mediaSession: { setActionHandler(a, f) { handler[a] = f; } } },
    document: { querySelector: (s) => (s === 'video' ? video : null) },
    postMessage: (d) => gemeldet.push(d),
  };
  return { win, handler, gemeldet, video };
}

function lade() {
  assert.ok(start > -1 && ende > start, 'medientastenEinbauen in preload.js');
  return vm.runInNewContext('(' + src.slice(start, ende).trim() + ')');
}

test('Medientaste ohne Twitch-Handler: unser Handler meldet Nutzer-Eingabe und pausiert/spielt', () => {
  const { win, handler, gemeldet, video } = attrappe();
  lade()(win);
  assert.ok(handler.pause && handler.play && handler.stop, 'eigene Handler gesetzt');
  handler.pause();
  assert.strictEqual(JSON.stringify(gemeldet), JSON.stringify([{ source: 'twitchdual-nutzer' }]));
  assert.strictEqual(video.pausen, 1);
  handler.play();
  assert.strictEqual(video.plays, 1);
  handler.stop();
  assert.strictEqual(video.pausen, 2);
  assert.strictEqual(gemeldet.length, 3);
});

test('Twitch setzt eigene Handler: sie werden umwickelt (erst melden, dann Twitchs Aktion)', () => {
  const { win, handler, gemeldet, video } = attrappe();
  lade()(win);
  const reihenfolge = [];
  win.postMessage = () => reihenfolge.push('gemeldet');
  win.navigator.mediaSession.setActionHandler('pause', () => reihenfolge.push('twitch'));
  handler.pause();
  assert.deepStrictEqual(reihenfolge, ['gemeldet', 'twitch']);
  assert.strictEqual(video.pausen, 0, 'Twitchs Handler entscheidet selbst');
  // Twitch nimmt seinen Handler weg: unser eigener greift wieder
  win.navigator.mediaSession.setActionHandler('pause', null);
  handler.pause();
  assert.strictEqual(video.pausen, 1);
  // andere Aktionen bleiben unberuehrt
  const weiter = () => {};
  win.navigator.mediaSession.setActionHandler('nexttrack', weiter);
  assert.strictEqual(handler.nexttrack, weiter);
  assert.strictEqual(gemeldet.length, 0);
});

test('preload: Medientasten sofort (vor Twitchs Skripten) im Player-iframe einbauen', () => {
  assert.ok(src.includes("webFrame.executeJavaScript('(' + medientastenEinbauen.toString() + ')(window);')"));
  const a = src.indexOf("webFrame.executeJavaScript('(' + medientastenEinbauen.toString()");
  assert.ok(a > src.indexOf('if (!isTwitchFrame) return;') && a < src.indexOf("await ipcRenderer.invoke('get-vaft-source')"), 'ohne await, vor dem Laden von vaft');
});
