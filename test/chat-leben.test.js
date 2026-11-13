'use strict';
// Etappe 3, Task 6: Chat-Streifen lebt (Regen, Katze, Lampe), Raid und Kiste als
// Effekte im Streifen. DOM-Code statisch geprueft wie test/home-raum.test.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const lies = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const chatJs = lies('renderer/chat/chat.js');
const chatCss = lies('renderer/chat/chat.css');
const chatHtml = lies('renderer/chat/index.html');

// Rumpf einer Top-Level-Funktion: von "function name(" bis zur ersten "\n}" danach.
function rumpf(quelle, name) {
  const start = quelle.indexOf('function ' + name + '(');
  assert.ok(start > -1, name + ' fehlt');
  return quelle.slice(start, quelle.indexOf('\n}', start) + 2);
}

test('chat.css: Animationen aus haelt den Streifen an, keine Verlaeufe', () => {
  assert.ok(chatCss.includes('html[data-animationen="aus"] #szene * { animation: none !important'));
  assert.ok(!/gradient/.test(chatCss));
});

test('chat.css: Leben-Regeln wie im Home, Raid-Ebene mit Glasmaske, Kiste nur beim Spielen', () => {
  assert.ok(/\.raum-leben\s*\{[^}]*animation:\s*raum-leben var\(--dauer\) steps\(var\(--bilder\)\) infinite/.test(chatCss));
  assert.ok(/\.raum-leben\.selten:not\(\.spielt\)\s*\{\s*animation:\s*none/.test(chatCss));
  assert.ok(/\.raum-leben\.selten\.spielt\s*\{\s*animation-iteration-count:\s*1/.test(chatCss));
  assert.ok(/\.raum-leben\.ruht\s*\{\s*animation:\s*none/.test(chatCss));
  assert.ok(/\.raum-leben\.verdeckt\s*\{\s*visibility:\s*hidden/.test(chatCss));
  assert.ok(/@keyframes raum-leben\s*\{\s*to\s*\{\s*background-position:\s*calc\(-1 \* var\(--sb\)\) 0/.test(chatCss));
  const raid = chatCss.slice(chatCss.indexOf('.raum-raid {'), chatCss.indexOf('}', chatCss.indexOf('.raum-raid {')));
  assert.ok(raid.includes("url('../themes/cozy/streifen-glas-maske.png')"), 'Glasmaske');
  assert.ok(/(^|[^-])mask:/.test(raid) && raid.includes('-webkit-mask:'));
  assert.ok(raid.includes('var(--mx) var(--my)') && raid.includes('344px 72px'));
  assert.ok(raid.includes('overflow: hidden'));
  assert.ok(/\.raum-raid-figur\s*\{[^}]*animation:\s*raum-raid-geht var\(--dauer\) steps\(var\(--schritte\)\) var\(--verzug\) 1 both/.test(chatCss));
  assert.ok(/@keyframes raum-raid-geht\s*\{\s*from\s*\{\s*transform:\s*translateX\(var\(--von\)\);?\s*\}\s*to\s*\{\s*transform:\s*translateX\(var\(--bis\)\)/.test(chatCss));
  assert.ok(/\.raum-raid-geht\s*\{[^}]*animation:\s*raum-leben var\(--dauer\) steps\(var\(--bilder\)\) var\(--verzug\) infinite/.test(chatCss));
  assert.ok(/\.raum-kiste\s*\{[^}]*display:\s*none/.test(chatCss));
  assert.ok(/\.raum-kiste\.spielt\s*\{[^}]*display:\s*block;[^}]*animation:\s*raum-leben var\(--dauer\) steps\(var\(--bilder\)\) 1/.test(chatCss));
  // Pixel bleiben Pixel, keine weichen Uebergaenge
  for (const sel of ['.raum-leben {', '.raum-raid-geht {', '.raum-kiste {']) {
    const r = chatCss.slice(chatCss.indexOf(sel), chatCss.indexOf('}', chatCss.indexOf(sel)));
    assert.ok(r.includes('image-rendering: pixelated'), sel);
    assert.ok(!/transition|opacity|filter/.test(r), sel);
  }
});

test('index.html laedt raum-leben-dom.js nach raum-leben.js und vor chat.js', () => {
  const a = chatHtml.indexOf('../lib/raum-leben.js');
  const b = chatHtml.indexOf('../lib/raum-leben-dom.js');
  assert.ok(a > -1 && b > a && b < chatHtml.indexOf('src="chat.js"'));
});

test('chat.js: Leben im Streifen und Abspieler verdrahtet', () => {
  assert.ok(/RaumLebenDom\.baue\(document, \$szeneEbene, RaumLeben\.STREIFEN, '\.\.\/themes\/cozy\/leben-streifen-'\)/.test(chatJs));
  assert.ok(/querySelector\('#szene \.szene-bildebene'\)/.test(chatJs));
  assert.ok(/RaumLebenDom\.effekte\(document, \$szeneEbene, '\.\.\/themes\/cozy\/'/.test(chatJs));
  assert.ok(chatJs.indexOf('RaumLebenDom.baue(') < chatJs.indexOf('RaumLebenDom.effekte('), 'Kiste liegt ueber dem Leben');
  assert.ok(chatJs.includes("document.documentElement.dataset.animationen !== 'aus'"));
  assert.ok(chatJs.includes('RaumLeben.abspieler({'));
  assert.ok(chatJs.includes('RaumLeben.warteschlange({'));
  assert.ok(chatJs.includes("ev.art === 'raid' ? RaumLeben.raidDauer(RaumLeben.schirmAnzahl(ev.daten.anzahl)) : RaumLeben.DAUER_KISTE"));
  // vor applyTheme definiert (applyTheme nutzt leben/abspieler)
  assert.ok(chatJs.indexOf('const abspieler =') < chatJs.indexOf('function applyTheme('));
});

test('applyTheme: aus -> leben.aus(), stadt.aus() und abspieler.aus(), an -> leben.an(), stadt.an()', () => {
  const r = rumpf(chatJs, 'applyTheme');
  assert.ok(/if \(themePrefs\.animationen\) \{ leben\.an\(\); stadt\.an\(\); \}\s*else \{ leben\.aus\(\); stadt\.aus\(\); abspieler\.aus\(\); \}/.test(r), r);
});

test('zeigeChatEreignis: nur Raid meldet einen Effekt, Diagnose sagt ehrlich ob', () => {
  const r = rumpf(chatJs, 'zeigeChatEreignis');
  assert.ok(r.includes("ev.art === 'raid'"));
  assert.ok(r.includes("abspieler.melde('raid', ev)"));
  assert.ok(!/melde\('abo'|art === 'abo'/.test(r), 'kein Abo-Effekt');
  assert.ok(!r.includes('effekt: false'));
  assert.ok(/const effekt = ev\.art === 'raid' && lebenAktiv\(\);/.test(r));
  assert.ok(/if \(effekt\) abspieler\.melde\('raid', ev\);/.test(r));
  assert.ok(/diag\('chat', 'ereignis', \{ art: ev\.art, effekt \}\)/.test(r));
  assert.ok(!chatJs.includes('bis Etappe 3 nur als Zeile'), 'alter Kommentar');
});

test('zeigeZuwachs: Kiste meldet den Effekt vor dem Abbruch ohne $pointsGain', () => {
  const r = rumpf(chatJs, 'zeigeZuwachs');
  const melde = r.indexOf("abspieler.melde('kiste'");
  const ab = r.indexOf('if (!$pointsGain) return;');
  assert.ok(melde > -1 && ab > -1 && melde < ab);
  assert.ok(/if \(z && z\.quelle === 'kiste'\) abspieler\.melde\('kiste', /.test(r));
});
