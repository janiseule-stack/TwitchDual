const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Preloads laufen in der Electron-Sandbox: dort ist require() auf wenige
// Module beschraenkt (electron, events, timers, url). Ein require('fs') o.ae.
// laesst das KOMPLETTE Preload sterben -> window.twitchDual fehlt, App tot
// (keine Favoriten, kein Laden, kein Chat). Dateien liest der Main-Prozess
// und liefert sie per IPC (z. B. 'get-vaft-source').

const ALLOWED = new Set([
  'electron',
  'events', 'node:events',
  'timers', 'node:timers',
  'url', 'node:url'
]);

test('preload.js benutzt nur sandbox-faehige requires', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  const bad = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    if (!ALLOWED.has(m[1])) bad.push(m[1]);
  }
  assert.deepEqual(bad, [],
    `Nicht sandbox-faehige requires im Preload: ${bad.join(', ')}`);
});
