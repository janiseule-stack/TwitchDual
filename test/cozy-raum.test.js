// Cozy-Raum Etappe 1b: Pixel-Bilder, Pixel-Schrift und Rahmen in beiden
// Fenstern. Statische Pruefung der Quelltexte (Anschauen macht Janis).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const wurzel = path.join(__dirname, '..');
const lies = (p) => (fs.existsSync(path.join(wurzel, p)) ? fs.readFileSync(path.join(wurzel, p), 'utf8') : '');

const raum = lies('renderer/themes/cozy/raum.css');
test('raum.css: Pixel-Schrift lokal, keine Netz-Adresse', () => {
  assert.ok(/@font-face[^}]*Pixelify Sans[^}]*schrift\/PixelifySans\.ttf/s.test(raum));
  assert.ok(!/https?:/.test(raum));
  assert.ok(fs.existsSync(path.join(wurzel, 'renderer/themes/cozy/schrift/PixelifySans.ttf')));
  assert.ok(lies('renderer/themes/cozy/schrift/OFL.txt').includes('SIL Open Font License'));
  assert.ok(/--schrift-pixel\s*:\s*'Pixelify Sans'/.test(raum));
});
test('raum.css: Rahmen-Klassen nutzen die Bilder, pixelgenau und eckig', () => {
  for (const [klasse, bild] of [['.rahmen-leiste-chat', 'leiste-chat.png'], ['.rahmen-leiste-video', 'leiste-video-links.png'], ['.rahmen-feld', 'feld.png']]) {
    const regel = raum.slice(raum.indexOf(klasse + ' {'), raum.indexOf('}', raum.indexOf(klasse + ' {')));
    assert.ok(regel.includes(bild), klasse);
    assert.ok(/border-image:[^;]*fill/.test(regel), klasse + ' fill');
    assert.ok(regel.includes('image-rendering: pixelated'), klasse);
    assert.ok(fs.existsSync(path.join(wurzel, 'renderer/themes/cozy', bild)), bild);
  }
  assert.ok(!/gradient|backdrop-filter/.test(raum));
});
test('raum.css: Knopf, Lampen, Tapete', () => {
  for (const s of ['.pixel-knopf', '.lampe.rot', '.lampe.gruen', '.tapete', 'knopf.png', 'lampe-rot.png', 'lampe-gruen.png', 'tapete.png']) assert.ok(raum.includes(s), s);
});
test('beide Fenster binden raum.css direkt nach farben.css ein', () => {
  for (const datei of ['renderer/chat/index.html', 'renderer/video/index.html']) {
    const html = lies(datei);
    const f = html.indexOf('../themes/cozy/farben.css');
    const r = html.indexOf('../themes/cozy/raum.css');
    assert.ok(f > -1 && r > f, datei);
  }
});
