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
const chatHtml = lies('renderer/chat/index.html');
const chatCss = lies('renderer/chat/chat.css');
const chatJs = lies('renderer/chat/chat.js');
test('Chat: Szenen-Streifen sitzt zwischen Kopf und Nachrichten und traegt das Schild', () => {
  const kopf = chatHtml.indexOf('id="head"'), szene = chatHtml.indexOf('id="szene"'), mitte = chatHtml.indexOf('id="chat-mitte"');
  assert.ok(kopf > -1 && kopf < szene && szene < mitte);
  const block = chatHtml.slice(szene, mitte);
  assert.ok(block.includes('id="onair-bar"') && block.includes('id="oa-label"') && block.includes('lampe rot'));
  assert.ok(!chatHtml.includes('class="oa-line"'));
  assert.ok(chatHtml.includes('lib/szene.js'));
});
test('Chat: Schild haengt weiter an body.onair und #oa-label', () => {
  assert.ok(/body\.onair #onair-bar/.test(chatCss));
  assert.ok(chatJs.includes("getElementById('oa-label')") && chatJs.includes("classList.toggle('onair'"));
  assert.ok(chatJs.includes('Szene.masse') && chatJs.includes('--szene-f'));
});
test('Chat: Rahmen-Klassen an Kopf und Feld, Knoepfe als Pixel-Knopf', () => {
  assert.ok(/id="head" class="[^"]*rahmen-leiste-chat/.test(chatHtml));
  assert.ok(/id="chat-feld" class="[^"]*rahmen-feld/.test(chatHtml));
  for (const id of ['settings-btn', 'win-min', 'win-max', 'win-close']) {
    assert.ok(new RegExp('id="' + id + '" class="[^"]*pixel-knopf').test(chatHtml), id);
  }
});
test('Chat: keine Verlaeufe, kein Blur, Streifen und Leisten ohne Deckkraft-Variable', () => {
  assert.ok(!/gradient|backdrop-filter/.test(chatCss));
  for (const sel of ['#szene {', '#composer {', '#footer {']) {
    const regel = chatCss.slice(chatCss.indexOf(sel), chatCss.indexOf('}', chatCss.indexOf(sel)));
    assert.ok(chatCss.indexOf(sel) > -1, sel);
    assert.ok(!/var\(--(bg|panel|hover)\)/.test(regel), sel + ' traegt Deckkraft');
  }
});
test('Chat: harte Kanten an Tafeln, Feldern und Nachrichten', () => {
  const start = chatCss.indexOf('/* --- Cozy: harte Kanten');
  assert.ok(start > -1);
  const block = chatCss.slice(start);
  for (const sel of ['#settings-pop', '.opt-reiter button', '#opt-diag-open', '.opt-fx-test button', '#emote-panel', '#rewards-panel', '#ac-bar', '.msg', '#new-msgs', '#user-card', '#emote-tip']) {
    assert.ok(block.includes(sel), sel);
  }
  assert.ok(/border-radius:\s*0/.test(block));
});

const videoHtml = lies('renderer/video/index.html');
test('Video: Leiste ist das TV-Gehaeuse, Knoepfe sind Pixel-Knoepfe', () => {
  assert.ok(/id="bar" class="[^"]*rahmen-leiste-video/.test(videoHtml));
  for (const id of ['home-btn', 'vollbild-btn', 'video-only-btn', 'win-min', 'win-max', 'win-close']) {
    assert.ok(new RegExp('id="' + id + '" class="[^"]*pixel-knopf').test(videoHtml), id);
  }
});
test('Video: Lampen fuer Ads blocked (gruen) und Live (rot)', () => {
  const start = videoHtml.indexOf('id="ads-indicator"');
  const ads = videoHtml.slice(start, videoHtml.indexOf('</span></span>', start));
  assert.ok(ads.includes('lampe gruen'));
  assert.ok(/id="si-lampe" class="lampe rot"/.test(videoHtml));
  assert.ok(/#stream-info\.live #si-lampe/.test(videoHtml));
});
test('Video: keine On-Air-Linie mehr, Nur-Video blendet die Leiste weiter aus', () => {
  assert.ok(!videoHtml.includes('class="oa-line"'));
  assert.ok(videoHtml.includes('id="oa-label"'));
  // vorhandener Selektor: "body.video-only #bar, body.video-only #onair-bar { display: none; }"
  assert.ok(/body\.video-only #bar,?[^{]*\{[^}]*display:\s*none/.test(videoHtml));
  const stil = videoHtml.slice(videoHtml.indexOf('<style>'), videoHtml.indexOf('</style>'));
  assert.ok(!/#onair-bar[^{]*\{[^}]*gradient/.test(stil) && !/#oa-label\s*\{[^}]*gradient/.test(stil));
});
test('Video: leerer Player zeigt die Tapete', () => {
  assert.ok(/id="player" class="[^"]*tapete/.test(videoHtml));
});

test('beide Fenster binden raum.css direkt nach farben.css ein', () => {
  for (const datei of ['renderer/chat/index.html', 'renderer/video/index.html']) {
    const html = lies(datei);
    const f = html.indexOf('../themes/cozy/farben.css');
    const r = html.indexOf('../themes/cozy/raum.css');
    assert.ok(f > -1 && r > f, datei);
  }
});
