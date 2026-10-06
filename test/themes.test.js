const { test } = require('node:test');
const assert = require('node:assert');
const K = require('../renderer/lib/themes');

test('THEMES: Welle 1 komplett, Neon Dual zuerst', () => {
  assert.deepEqual(K.THEMES.map((t) => t.id), ['neon-dual', 'sakura', 'wald', 'koi', 'blasen']);
  for (const t of K.THEMES) {
    assert.equal(typeof t.name, 'string');
    assert.equal(typeof t.hell, 'boolean');
    assert.equal(typeof t.vorschau, 'string');
  }
  assert.equal(K.THEMES.filter((t) => t.farbenFrei).length, 1);
  assert.equal(K.themeById('neon-dual').farbenFrei, true);
});

test('themeById/cleanTheme: Muell faellt auf Neon Dual', () => {
  for (const muell of [undefined, null, '', 'gibtsnicht', 42, {}, 'constructor', '__proto__']) {
    assert.equal(K.cleanTheme(muell), 'neon-dual', String(muell));
  }
  assert.equal(K.cleanTheme('koi'), 'koi');
});

test('cleanEffekte: nur die vier Stufen', () => {
  assert.equal(K.cleanEffekte('aus'), 'aus');
  assert.equal(K.cleanEffekte('viel'), 'viel');
  for (const muell of [undefined, 'AUS', 'max', 0, null]) assert.equal(K.cleanEffekte(muell), 'normal');
});

test('EFFEKT_FAKTOR: aus=0, steigt monoton', () => {
  const f = K.EFFEKT_STUFEN.map((s) => K.EFFEKT_FAKTOR[s]);
  assert.deepEqual(f, [0, 0.4, 1, 1.8]);
});

test('cleanThemePrefs: Bestandsdaten ohne theme -> Neon Dual, Farben bleiben', () => {
  const p = K.cleanThemePrefs({ videoAccent: '#ABC', chatAccent: '#ff4fa3', chatAlpha: 60 });
  assert.deepEqual(p, { videoAccent: '#aabbcc', chatAccent: '#ff4fa3', chatAlpha: 60, theme: 'neon-dual', effekte: 'normal' });
  assert.deepEqual(K.cleanThemePrefs(null), { videoAccent: '#35e0ff', chatAccent: '#ff4fa3', chatAlpha: 100, theme: 'neon-dual', effekte: 'normal' });
});

test('mergeThemePrefs: Teil-Speicherung behaelt theme und effekte', () => {
  const gespeichert = { videoAccent: '#111111', chatAccent: '#222222', chatAlpha: 80, theme: 'sakura', effekte: 'wenig' };
  // Preset-Klick / Farbwaehler schicken nur Farben + Alpha:
  const nachPreset = K.mergeThemePrefs(gespeichert, { videoAccent: '#35e0ff', chatAccent: '#ff4fa3', chatAlpha: 80 });
  assert.equal(nachPreset.theme, 'sakura');
  assert.equal(nachPreset.effekte, 'wenig');
  // Galerie schickt nur das Theme:
  const nachGalerie = K.mergeThemePrefs(gespeichert, { theme: 'koi' });
  assert.equal(nachGalerie.videoAccent, '#111111');
  assert.equal(nachGalerie.chatAlpha, 80);
  assert.equal(nachGalerie.effekte, 'wenig');
  // Kaputter Speicher + Update:
  assert.equal(K.mergeThemePrefs(undefined, { effekte: 'aus' }).effekte, 'aus');
});

test('istKlickInsLeere: App-Elemente nie, Hintergrund ja', () => {
  const ziel = (treffer) => ({ closest: (sel) => { assert.equal(sel, K.KLICK_SPERRE); return treffer; } });
  assert.equal(K.istKlickInsLeere(ziel(null)), true);
  assert.equal(K.istKlickInsLeere(ziel({ tagName: 'BUTTON' })), false);
  assert.equal(K.istKlickInsLeere(null), false);
  assert.equal(K.istKlickInsLeere({}), false);
  for (const sel of ['button', 'a', 'input', 'textarea', '[contenteditable]', '.msg', '#composer', '#settings-pop', '#theme-galerie', 'iframe']) {
    assert.ok(K.KLICK_SPERRE.split(',').map((s) => s.trim()).includes(sel), sel);
  }
});
