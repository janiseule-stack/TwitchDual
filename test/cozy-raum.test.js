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
  // Runde 2: Raum Klar zuerst, Pixelify Sans nur als Ersatz fuer fehlende Zeichen
  assert.ok(/@font-face[^}]*'Raum Klar'[^}]*schrift\/RaumKlar\.ttf/s.test(raum));
  assert.ok(/--schrift-pixel\s*:\s*'Raum Klar',\s*'Pixelify Sans'/.test(raum));
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
test('Chat: Szenen-Streifen sitzt zwischen Kopf und Nachrichten, ohne Schild', () => {
  const kopf = chatHtml.indexOf('id="head"'), szene = chatHtml.indexOf('id="szene"'), mitte = chatHtml.indexOf('id="chat-mitte"');
  assert.ok(kopf > -1 && kopf < szene && szene < mitte);
  // Das LIVE-Schild sitzt seit Runde 4 im Video-Fenster (Janis 10.11.2026).
  assert.ok(!chatHtml.includes('id="onair-bar"') && !chatHtml.includes('id="oa-label"'));
  assert.ok(!chatCss.includes('#onair-bar') && !chatCss.includes('#oa-label'));
  assert.ok(chatHtml.includes('lib/szene.js'));
});
test('Chat: body.onair wird weiter gepflegt, Streifen bekommt seine Masse', () => {
  assert.ok(chatJs.includes("classList.toggle('onair'"));
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
  // Runde 4: die rote Lampe sitzt im LIVE-Schild auf der Lautsprecher-Flaeche
  // ganz links in der Leiste, nicht mehr bei den Stream-Infos.
  assert.ok(!videoHtml.includes('si-lampe'));
  const bar = videoHtml.slice(videoHtml.indexOf('id="bar"'), videoHtml.indexOf('class="bar-left"'));
  assert.ok(bar.includes('id="onair-bar"') && bar.includes('id="oa-label"'));
  // 3c: das LIVE-Schild ist ein PixelLab-Bild, keine rote Lampe mehr
  assert.ok(!bar.includes('lampe rot') && !bar.includes('lampe-rot'));
  assert.ok(/body\.onair #onair-bar\s*\{[^}]*visibility:\s*visible/.test(videoHtml));
});
test('Video: Profilbild in der Leiste ist grob verpixelt und eckig', () => {
  assert.ok(/<canvas id="si-avatar-pixel" width="16" height="16"/.test(videoHtml));
  const js = lies('renderer/video/video.js');
  assert.ok(js.includes("getElementById('si-avatar-pixel')") && js.includes('drawImage'));
  const regel = videoHtml.slice(videoHtml.indexOf('#si-avatar-pixel {'), videoHtml.indexOf('}', videoHtml.indexOf('#si-avatar-pixel {')));
  assert.ok(regel.includes('image-rendering: pixelated') && !regel.includes('border-radius: 50%'));
  assert.ok(/#si-avatar\s*\{[^}]*display:\s*none/.test(videoHtml));
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

// --- Runde 2 (Janis 10.11.2026): keine alten Emotes mehr als Symbole ---------
test('Symbole: Pixel-Bilder liegen lokal vor', () => {
  for (const n of ['smiley', 'truhe', 'flieger', 'muenze']) {
    assert.ok(fs.existsSync(path.join(wurzel, 'renderer/themes/cozy/symbol-' + n + '.png')), n);
  }
});
test('Chat: Feld-Knoepfe zeigen Pixel-Symbole statt Emotes aus dem Netz', () => {
  for (const [id, bild] of [['emote-btn', 'symbol-smiley.png'], ['rewards-btn', 'symbol-truhe.png'], ['chat-send', 'symbol-flieger.png']]) {
    const start = chatHtml.indexOf('id="' + id + '"');
    const knopf = chatHtml.slice(start, chatHtml.indexOf('</button>', start));
    assert.ok(knopf.includes('../themes/cozy/' + bild), id);
  }
  assert.ok(!/cdn\.7tv\.app|betterttv/.test(chatHtml));
});
test('Kanalpunkte: Ersatz-Symbol ist die Pixel-Muenze, kein Emote', () => {
  for (const datei of ['renderer/chat/chat.js', 'renderer/video/home.js']) {
    const js = lies(datei);
    assert.ok(!js.includes('waehleEmote'), datei);
    assert.ok(js.includes('themes/cozy/symbol-muenze.png'), datei);
  }
});
test('Video: Ads blocked ohne Emote, Lampe blinkt beim Blocken', () => {
  assert.ok(!videoHtml.includes('ads-emote'));
  assert.ok(!lies('renderer/video/video.js').includes('AdsEmotes'));
  assert.ok(!fs.existsSync(path.join(wurzel, 'renderer/lib/ads-emotes.js')));
  assert.ok(/#ads-indicator\.blocking \.lampe\s*\{[^}]*animation/.test(videoHtml));
  assert.ok(/#ads-indicator\s*\{[^}]*var\(--schrift-pixel\)/.test(videoHtml));
});

// --- Runde 3 (Janis 10.11.2026): Streifen fuellt die Breite, Knoepfe mit Bild-Zeichen
test('Chat: Streifen fuellt die Breite, Bild liegt in einer skalierten Ebene', () => {
  assert.ok(/<div id="szene">\s*<div class="szene-bildebene"><\/div>/.test(chatHtml));
  const regel = chatCss.slice(chatCss.indexOf('.szene-bildebene {'), chatCss.indexOf('}', chatCss.indexOf('.szene-bildebene {')));
  assert.ok(regel.includes('streifen.png'));
  assert.ok(!regel.includes('tapete.png'));
  assert.ok(/0 0 \/ 344px 72px/.test(regel));
  assert.ok(regel.includes('image-rendering: pixelated'));
  assert.ok(/transform:\s*scale\(var\(--szene-f/.test(regel) && /transform-origin:\s*0 0/.test(regel));
  assert.ok(/top:\s*var\(--szene-oben/.test(regel));
  assert.ok(chatJs.includes('--szene-oben'));
});
test('Knoepfe: jedes Zeichen ist ein eigenes Bild, kein Schriftzeichen', () => {
  const belegung = { 'win-min': 'min', 'win-max': 'max', 'win-close': 'zu', 'settings-btn': 'zahnrad',
    'home-btn': 'home', 'vollbild-btn': 'teilen', 'video-only-btn': 'vollbild' };
  for (const [id, name] of Object.entries(belegung)) {
    assert.ok(fs.existsSync(path.join(wurzel, 'renderer/themes/cozy/knopf-' + name + '.png')), name);
    assert.ok(raum.includes('.pixel-knopf.k-' + name) && raum.includes('knopf-' + name + '.png'), name);
    for (const html of [chatHtml, videoHtml]) {
      if (!html.includes('id="' + id + '"')) continue;
      assert.ok(new RegExp('id="' + id + '" class="pixel-knopf k-' + name + '"').test(html), id);
    }
  }
  const knopf = raum.slice(raum.indexOf('.pixel-knopf {'), raum.indexOf('}', raum.indexOf('.pixel-knopf {')));
  assert.ok(/font-size:\s*0/.test(knopf));
});

test('beide Fenster binden raum.css direkt nach farben.css ein', () => {
  for (const datei of ['renderer/chat/index.html', 'renderer/video/index.html']) {
    const html = lies(datei);
    const f = html.indexOf('../themes/cozy/farben.css');
    const r = html.indexOf('../themes/cozy/raum.css');
    assert.ok(f > -1 && r > f, datei);
  }
});
