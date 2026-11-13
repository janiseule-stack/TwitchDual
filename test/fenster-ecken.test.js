const { test } = require('node:test');
const assert = require('node:assert');
const E = require('../src/fenster-ecken');

// getNativeWindowHandle() liefert unter Windows einen 8-Byte-Puffer (HWND, little endian).
const griff = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const fenster = (n, kaputt = false) => ({ isDestroyed: () => kaputt, getNativeWindowHandle: () => griff(n) });

test('hwndAus: liest den Fenster-Griff als Zahl', () => {
  assert.equal(E.hwndAus(griff(0x1a2b3c)), '1715004');
});

test('skript: setzt Ecken (33 = nicht runden) und Rand (34 = keine Farbe) fuer jedes Fenster', () => {
  const s = E.skript(['111', '222']);
  assert.match(s, /DwmSetWindowAttribute/);
  assert.match(s, /111/);
  assert.match(s, /222/);
  assert.match(s, /33/);
  assert.match(s, /34/);
  assert.match(s, /4294967294/, 'DWMWA_COLOR_NONE');
});

test('eckenAus: ausserhalb von Windows passiert nichts', () => {
  let gestartet = 0;
  E.eckenAus([fenster(1)], { platform: 'darwin', starte: () => { gestartet++; } });
  assert.equal(gestartet, 0);
});

test('eckenAus: unter Windows ein PowerShell-Aufruf fuer alle lebenden Fenster', () => {
  const aufrufe = [];
  E.eckenAus([fenster(5), fenster(6, true), null, fenster(7)], {
    platform: 'win32', starte: (prog, args) => aufrufe.push({ prog, args })
  });
  assert.equal(aufrufe.length, 1);
  assert.equal(aufrufe[0].prog, 'powershell.exe');
  const i = aufrufe[0].args.indexOf('-EncodedCommand');
  assert.ok(i >= 0, 'Skript kodiert uebergeben (keine Shell-Quoting-Fallen)');
  const skript = Buffer.from(aufrufe[0].args[i + 1], 'base64').toString('utf16le');
  assert.match(skript, /\b5\b/);
  assert.match(skript, /\b7\b/);
  assert.doesNotMatch(skript, /\b6\b/, 'zerstoertes Fenster bleibt aussen vor');
});

test('eckenAus: keine lebenden Fenster -> kein Aufruf', () => {
  let gestartet = 0;
  E.eckenAus([fenster(1, true)], { platform: 'win32', starte: () => { gestartet++; } });
  assert.equal(gestartet, 0);
});
