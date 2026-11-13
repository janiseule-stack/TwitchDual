// App-Icon: Fernseher 08 aus PixelLab (Janis 13.11.2026) statt Electron-Standard.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..');
const lies = (p) => fs.readFileSync(path.join(wurzel, p), 'utf8');

test('Icon-Dateien liegen da: .ico fuer den Build, PNG fuer die Fenster, Quelle in raum-quellen', () => {
  for (const p of ['build/icon.ico', 'renderer/themes/cozy/app-icon.png', 'tools/raum-quellen/app-icon-08.png', 'tools/icon-bauen.py']) {
    assert.ok(fs.existsSync(path.join(wurzel, p)), p);
  }
  // .ico beginnt mit 0,0,1,0 und enthaelt 7 Groessen (16..256)
  const ico = fs.readFileSync(path.join(wurzel, 'build/icon.ico'));
  assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0]);
  assert.equal(ico.readUInt16LE(4), 7);
  // PNG 256x256
  const png = fs.readFileSync(path.join(wurzel, 'renderer/themes/cozy/app-icon.png'));
  assert.equal(png.readUInt32BE(16), 256);
  assert.equal(png.readUInt32BE(20), 256);
});

test('package.json: Windows-Build nimmt build/icon.ico', () => {
  const p = JSON.parse(lies('package.json'));
  assert.equal(p.build.win.icon, 'build/icon.ico');
});

test('main.js: Video- und Chat-Fenster bekommen das App-Icon', () => {
  const m = lies('main.js');
  assert.ok(m.includes("const APP_ICON = path.join(__dirname, 'renderer', 'themes', 'cozy', 'app-icon.png');"));
  const video = m.slice(m.indexOf('videoWin = new BrowserWindow({'), m.indexOf('chatWin = new BrowserWindow({'));
  const chat = m.slice(m.indexOf('chatWin = new BrowserWindow({'), m.indexOf('});', m.indexOf('chatWin = new BrowserWindow({')));
  assert.ok(video.includes('icon: APP_ICON,'), 'Video');
  assert.ok(chat.includes('icon: APP_ICON,'), 'Chat');
});
