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
  assert.deepEqual(p, { videoAccent: '#aabbcc', chatAccent: '#ff4fa3', chatAlpha: 60, theme: 'neon-dual', effekte: 'normal', anpassungen: {}, variante: {} });
  assert.deepEqual(K.cleanThemePrefs(null), { videoAccent: '#35e0ff', chatAccent: '#ff4fa3', chatAlpha: 100, theme: 'neon-dual', effekte: 'normal', anpassungen: {}, variante: {} });
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

// --- Welle 1b ----------------------------------------------------------------
test('THEMES: jedes Theme hat gueltige Originalfarben', () => {
  for (const t of K.THEMES) {
    for (const k of ['akzent', 'hintergrund', 'partikel']) assert.match(t.farben[k], /^#[0-9a-f]{6}$/, t.id + '.' + k);
  }
});

test('cleanAnpassungen: nur Nicht-Neon-Themes, nur drei Schluessel, nur Hex', () => {
  const roh = {
    sakura: { akzent: '#ABC', hintergrund: 'rot', partikel: '#112233', fremd: '#000000' },
    'neon-dual': { akzent: '#123456' },
    gibtsnicht: { akzent: '#123456' },
    koi: 'kaputt'
  };
  assert.deepEqual(K.cleanAnpassungen(roh), { sakura: { akzent: '#aabbcc', partikel: '#112233' } });
  assert.deepEqual(K.cleanAnpassungen(null), {});
});

test('cleanThemePrefs liefert anpassungen, Standard leer', () => {
  assert.deepEqual(K.cleanThemePrefs(null).anpassungen, {});
});

test('mergeThemePrefs: Anpassung eines Themes laesst andere stehen', () => {
  const g = { theme: 'wald', anpassungen: { sakura: { akzent: '#111111' }, wald: { partikel: '#222222' } } };
  const neu = K.mergeThemePrefs(g, { anpassungen: { wald: { hintergrund: '#333333' } } });
  assert.deepEqual(neu.anpassungen.sakura, { akzent: '#111111' });
  assert.deepEqual(neu.anpassungen.wald, { hintergrund: '#333333' });
  // Zuruecksetzen = leeres Objekt -> Theme faellt aus den Anpassungen raus
  assert.equal(K.mergeThemePrefs(neu, { anpassungen: { wald: {} } }).anpassungen.wald, undefined);
});

test('effektiveFarben: Anpassung schlaegt Original', () => {
  const p = K.cleanThemePrefs({ theme: 'sakura', anpassungen: { sakura: { partikel: '#00ff00' } } });
  assert.deepEqual(K.effektiveFarben(p), { akzent: K.themeById('sakura').farben.akzent, hintergrund: K.themeById('sakura').farben.hintergrund, partikel: '#00ff00' });
});

test('balkenFarbe: Neon null, sonst effektiver Hintergrund', () => {
  assert.equal(K.balkenFarbe(K.cleanThemePrefs({ theme: 'neon-dual' })), null);
  assert.equal(K.balkenFarbe(K.cleanThemePrefs({ theme: 'blasen' })), K.themeById('blasen').farben.hintergrund);
  assert.equal(K.balkenFarbe(K.cleanThemePrefs({ theme: 'wald', anpassungen: { wald: { hintergrund: '#101010' } } })), '#101010');
});

test('istSichereFarbe: nur Hex und rgb/rgba', () => {
  for (const ok of ['#fff', '#fff4f8', '#fff4f8cc', 'rgb(1, 2, 3)', 'rgba(1,2,3,.5)']) assert.equal(K.istSichereFarbe(ok), true, ok);
  for (const boese of ['red; } body { display:none', '#fff;}', 'url(x)', 'rgb(1,2,3)) ; x', '', null, 42, 'expression(alert(1))']) {
    assert.equal(K.istSichereFarbe(boese), false, String(boese));
  }
});

// --- Gezeichnete Welten: Varianten ------------------------------------------
test('Koi hat fuenf Varianten mit gueltigen Farben', () => {
  const koi = K.themeById('koi');
  assert.deepEqual(koi.varianten.map((v) => v.id), ['aquarell', 'lofi', 'holzschnitt', 'tusche', 'bleiglas']);
  for (const v of koi.varianten) {
    assert.equal(typeof v.name, 'string');
    assert.equal(typeof v.hell, 'boolean');
    for (const k of ['akzent', 'hintergrund', 'partikel']) assert.match(v.farben[k], /^#[0-9a-f]{6}$/, v.id + '.' + k);
  }
});

test('cleanVariante: nur Themes mit Varianten, nur gueltige Ids', () => {
  assert.deepEqual(K.cleanVariante({ koi: 'tusche', sakura: 'tusche', wald: 'x', gibtsnicht: 'a' }), { koi: 'tusche' });
  assert.deepEqual(K.cleanVariante({ koi: 'quatsch' }), {});
  assert.deepEqual(K.cleanVariante({ koi: { id: 'tusche' } }), {});
  assert.deepEqual(K.cleanVariante(null), {});
});

test('varianteFuer: gewaehlte, sonst erste, ohne Varianten null', () => {
  assert.equal(K.varianteFuer(K.cleanThemePrefs({ theme: 'koi', variante: { koi: 'lofi' } })).id, 'lofi');
  assert.equal(K.varianteFuer(K.cleanThemePrefs({ theme: 'koi' })).id, 'aquarell');
  assert.equal(K.varianteFuer(K.cleanThemePrefs({ theme: 'sakura', variante: { koi: 'lofi' } })), null);
});

test('mergeThemePrefs: Variante bleibt beim Theme-Wechsel und mischt pro Theme', () => {
  const g = K.cleanThemePrefs({ theme: 'koi', variante: { koi: 'bleiglas' } });
  const weg = K.mergeThemePrefs(g, { theme: 'sakura' });
  assert.equal(weg.variante.koi, 'bleiglas');
  const zurueck = K.mergeThemePrefs(weg, { theme: 'koi' });
  assert.equal(K.varianteFuer(zurueck).id, 'bleiglas');
  assert.equal(K.mergeThemePrefs(g, { variante: { koi: 'tusche' } }).variante.koi, 'tusche');
});

test('effektiveFarben: Variante schlaegt Theme, Anpassung schlaegt Variante', () => {
  const lofi = K.varianteVon('koi', 'lofi');
  const p = K.cleanThemePrefs({ theme: 'koi', variante: { koi: 'lofi' } });
  assert.deepEqual(K.effektiveFarben(p), lofi.farben);
  const q = K.cleanThemePrefs({ theme: 'koi', variante: { koi: 'lofi' }, anpassungen: { 'koi:lofi': { akzent: '#010203' } } });
  assert.equal(K.effektiveFarben(q).akzent, '#010203');
  assert.equal(K.effektiveFarben(q).hintergrund, lofi.farben.hintergrund);
});

test('Anpassungen bei Varianten: pro Variante, alter Theme-Schluessel faellt weg', () => {
  assert.deepEqual(K.cleanAnpassungen({ koi: { akzent: '#111111' }, 'koi:tusche': { akzent: '#222222' }, 'koi:gibtsnicht': { akzent: '#333333' } }),
    { 'koi:tusche': { akzent: '#222222' } });
  const p = K.cleanThemePrefs({ theme: 'koi', variante: { koi: 'tusche' }, anpassungen: { 'koi:tusche': { akzent: '#222222' } } });
  assert.equal(K.anpassungsSchluesselFuer(p), 'koi:tusche');
  assert.equal(K.effektiveFarben(p).akzent, '#222222');
  // Andere Variante bleibt unberuehrt
  const q = K.cleanThemePrefs({ ...p, variante: { koi: 'lofi' } });
  assert.equal(K.effektiveFarben(q).akzent, K.varianteVon('koi', 'lofi').farben.akzent);
  // Ohne gewaehlte Variante gilt die erste
  assert.equal(K.anpassungsSchluesselFuer(K.cleanThemePrefs({ theme: 'koi' })), 'koi:aquarell');
  assert.equal(K.anpassungsSchluesselFuer(K.cleanThemePrefs({ theme: 'sakura' })), 'sakura');
});
