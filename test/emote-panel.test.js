// Emote-Leiste: das Kanal-Grid (900+ Emotes) wird nur neu gebaut, wenn sich die
// Emote-Liste geaendert hat, nicht bei jedem Oeffnen (Review 13.11.2026, Fund 7).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const js = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'chat', 'chat.js'), 'utf8');

test('openEmotePanel: Kanal-Grid nur bei neuer emoteMap neu fuellen', () => {
  const i = js.indexOf('async function openEmotePanel(');
  const r = js.slice(i, js.indexOf('\n}', i));
  assert.ok(/let epChannelFuer = null;/.test(js), 'Merker fuer die gezeigte Liste');
  assert.ok(r.includes('if (epChannelFuer !== emoteMap) {'), r);
  const innen = r.slice(r.indexOf('if (epChannelFuer !== emoteMap) {'));
  assert.ok(innen.indexOf('fillEmoteGrid($epChannel,') < innen.indexOf('epChannelFuer = emoteMap;'));
  assert.ok(innen.indexOf('epChannelFuer = emoteMap;') < innen.indexOf('\n  }'), 'beides im Zweig');
});
