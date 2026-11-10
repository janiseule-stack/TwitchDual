// Cozy-Raum Etappe 1a: die alten Themes und ihre Bedienung sind weg, die
// gebliebenen Einstellungen sind da. Statische Pruefung der Quelltexte.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const wurzel = path.join(__dirname, '..');
const lies = (p) => fs.readFileSync(path.join(wurzel, p), 'utf8');

const chatHtml = lies('renderer/chat/index.html');
const chatJs = lies('renderer/chat/chat.js');

test('Chat: Bedienung der alten Themes ist weg', () => {
  for (const id of ['theme-galerie', 'theme-btn', 'welt-wuerfel', 'galerie-liste', 'opt-presets', 'opt-color-video',
    'opt-color-chat', 'opt-color-reset', 'opt-tf-akzent', 'opt-kiste', 'opt-gast-oft', 'opt-gast-viele', 'opt-effekte',
    'fx-hinten', 'fx-vorn', 'theme-deko']) {
    assert.ok(!chatHtml.includes('id="' + id + '"'), id);
  }
  assert.ok(!chatHtml.includes('data-art="gast"'));
});
test('Chat: gebliebene Einstellungen sind da', () => {
  for (const id of ['opt-ts', 'opt-badges', 'opt-font', 'opt-diag', 'opt-diag-open', 'opt-alpha-chat', 'opt-animationen', 'opt-fx-test']) {
    assert.ok(chatHtml.includes('id="' + id + '"'), id);
  }
});
test('Chat: laedt keine Theme-Bausteine mehr', () => {
  for (const s of ['lib/themes.js', 'lib/fx-engine.js', 'lib/theme-runtime.js']) assert.ok(!chatHtml.includes(s), s);
  for (const s of ['lib/theme.js', 'lib/kiste.js', 'lib/chat-ereignisse.js']) assert.ok(chatHtml.includes(s), s);
  for (const wort of ['ThemeRuntime', 'ThemeKatalog', 'FxEngine', 'themeRuntime', 'kisteStil', 'PRESETS', 'ereignisFilter', 'punkteUrsprung']) {
    assert.ok(!chatJs.includes(wort), wort);
  }
});

const videoHtml = lies('renderer/video/index.html');
const videoJs = lies('renderer/video/video.js');
test('Video: keine Theme-Ebenen und Theme-Bausteine mehr', () => {
  for (const s of ['id="fx-gast"', 'id="fx-hinten"', 'class="theme-deko"', 'lib/themes.js', 'lib/fx-engine.js', 'lib/theme-runtime.js']) {
    assert.ok(!videoHtml.includes(s), s);
  }
  assert.ok(videoHtml.includes('lib/theme.js'));
  for (const wort of ['ThemeRuntime', 'ThemeKatalog', 'themeRuntime', 'onFxTest', 'gastJetzt']) assert.ok(!videoJs.includes(wort), wort);
  assert.ok(videoJs.includes('ThemeLib.BALKEN'));
});
test('Home liest data-animationen statt data-effekte', () => {
  assert.ok(!lies('renderer/video/home.css').includes('data-effekte'));
  assert.ok(!lies('renderer/video/home.js').includes('dataset.effekte'));
});
test('Effekte testen kennt keinen Gast mehr', () => {
  assert.ok(!/FX_TEST_ARTEN = \[[^\]]*'gast'/.test(lies('main.js')));
});
