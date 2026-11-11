// Cozy-Raum Etappe 2, Task 3: Darstellung Raum und Regal (HomeRaumDom).
// Statische Pruefung der Quelltexte (Anschauen macht Janis).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const wurzel = path.join(__dirname, '..');
const lies = (p) => (fs.existsSync(path.join(wurzel, p)) ? fs.readFileSync(path.join(wurzel, p), 'utf8') : '');

const js = lies('renderer/video/home-raum-dom.js');
const css = lies('renderer/video/home-raum.css');

// Inhalt des letzten "return { ... }" der Datei (die Schnittstelle).
function schnittstelle() {
  const start = js.lastIndexOf('return {');
  if (start < 0) return '';
  return js.slice(start, js.indexOf('}', start));
}

test('home-raum-dom.js setzt window.HomeRaumDom', () => {
  assert.ok(/window\.HomeRaumDom\s*=\s*\(function/.test(js));
});

test('home-raum-dom.js: alle Namen der Schnittstelle stehen im return', () => {
  const r = schnittstelle();
  const namen = ['init', 'zeigeAnsicht', 'ansicht', 'zeichneBuehne', 'zeichneStaender', 'fachBlaettern',
    'zeigeAblauf', 'versteckeAblauf', 'zeigeTafel', 'versteckeTafel', 'tafelOffen', 'zeigeSchild',
    'setzeTv', 'neuAusrichten'];
  for (const n of namen) assert.ok(new RegExp('\\b' + n + '\\b').test(r), n);
});

test('home-raum-dom.js: keine alte CD-Darstellung', () => {
  for (const alt of ['cd-huelle', 'cd-laufwerk', 'home-staender']) assert.ok(!js.includes(alt), alt);
});

test('home-raum-dom.js: nutzt die Raum-Geometrie', () => {
  for (const f of ['Raum.skalierung', 'Raum.treffer', 'Raum.fachFenster', 'Raum.zuBild']) assert.ok(js.includes(f), f);
  assert.ok(js.includes('clientWidth') && js.includes('clientHeight'));
});

test('home-raum-dom.js: eigene Bilder nur aus ../themes/cozy/', () => {
  const bilder = js.match(/['"][^'"\s]*\.(png|jpe?g|gif|webp|svg)['"]/g) || [];
  assert.ok(bilder.length > 0);
  for (const b of bilder) assert.ok(/^['"]\.\.\/themes\/cozy\/[a-z0-9-]+\.png['"]$/.test(b), b);
  for (const n of ['raum-tv-aus.png', 'regal.png', 'huelle.png', 'huelle-rueck.png', 'platte-vorn.png', 'zettel.png', 'schild.png', 'lampe-klein.png']) {
    assert.ok(js.includes(n) || css.includes(n), n);
  }
  assert.ok(!js.includes('lampe-rot.png'));
  assert.ok(/\.huelle-lampe\s*\{[^}]*width:\s*11px;[^}]*height:\s*8px/.test(css), 'Lampe 11x8 in Bildkoordinaten');
  assert.ok(!/https?:/.test(js));
});

test('home-raum-dom.js: Huellen-Fenster als eine Konstante, Profilbild-Canvas halbe Fenstergroesse', () => {
  assert.ok(/HUELLE_FENSTER\s*=\s*\{\s*x:\s*2,\s*y:\s*2,\s*b:\s*36,\s*h:\s*36\s*\}/.test(js));
  assert.strictEqual((js.match(/HUELLE_FENSTER\s*=/g) || []).length, 1);
  // 18x18, aus der Konstante abgeleitet
  assert.ok(/width\s*=\s*HUELLE_FENSTER\.b\s*\/\s*2/.test(js) && /height\s*=\s*HUELLE_FENSTER\.h\s*\/\s*2/.test(js));
  assert.ok(js.includes('drawImage'));
});

test('home-raum-dom.js: Profilbild mit error-Zweig und Anfangsbuchstabe', () => {
  const i = js.indexOf("'error'");
  assert.ok(i > -1, 'error-Zweig');
  assert.ok(/anfangsbuchstabe/i.test(js));
  assert.ok(/charAt\(0\)|\[0\]/.test(js) && js.includes('toUpperCase'));
});

test('home-raum-dom.js: VOD-Vorschau als Canvas 32x9', () => {
  assert.ok(/width\s*=\s*32/.test(js) && /height\s*=\s*9/.test(js));
});

test('home-raum-dom.js: Handler-Namen der alten Buehne bleiben', () => {
  for (const h of ['laden', 'stern', 'vods', 'rueckseiteZu', 'vod', 'vodSeite', 'mehr', 'waehle']) {
    assert.ok(js.includes("'" + h + "'"), h);
  }
});

test('home-raum-dom.js: Mausrad blaettert nicht bei offener Tafel', () => {
  const i = js.indexOf("'wheel'");
  assert.ok(i > -1);
  assert.ok(js.slice(i, i + 300).includes('tafelOffen()'));
});

test('home-raum-dom.js: neuer Fach-Inhalt holt die gewaehlte Platte in Sicht', () => {
  assert.ok(/const umgebaut = fach\.schluessel !== schluessel/.test(js));
  assert.ok(/neu = index >= 0 && \(gewaehlt !== fach\.gewaehlt \|\| umgebaut\)/.test(js));
});

test('home-raum-dom.js: Fokus im Fach setzt scrollLeft zurueck und blaettert per fachFenster', () => {
  const i = js.indexOf("'focusin'");
  assert.ok(i > -1);
  const teil = js.slice(i, i + 500);
  assert.ok(teil.includes('scrollLeft = 0') && teil.includes('Raum.fachFenster') && teil.includes('zeigeFach('));
});

test('home-raum.css: Blaetter-Pfeile ohne transform (home.css :active skaliert)', () => {
  const start = css.indexOf('.rueck-links, .rueck-rechts {');
  assert.ok(start > -1);
  assert.ok(!css.slice(start, css.indexOf('}', start)).includes('transform'));
});

test('home-raum.css: keine Verlaeufe, kein Blur, Ebenen pixelgenau', () => {
  assert.ok(css.length > 0);
  assert.ok(!/gradient|backdrop-filter/.test(css));
  for (const sel of ['#raum-ebene', '#regal-ebene']) {
    const start = css.indexOf(sel);
    assert.ok(start > -1, sel);
  }
  const regel = css.slice(css.indexOf('.raum-bildebene'), css.indexOf('}', css.indexOf('.raum-bildebene')));
  assert.ok(regel.includes('image-rendering: pixelated'));
  assert.ok(regel.includes('transform-origin: 0 0'));
  assert.ok(css.includes('var(--schrift-pixel)'));
});

test('home-raum.css: Zettel und Schild als 9-Slice mit Rand 6', () => {
  assert.ok(/border-image:\s*url\('\.\.\/themes\/cozy\/zettel\.png'\)\s*6 fill/.test(css));
  assert.ok(/border-image:\s*url\('\.\.\/themes\/cozy\/schild\.png'\)\s*6 fill/.test(css));
});

// --- Task 4: Home ist der Raum (home.js haengt an HomeRaumDom) ---------------
const html = lies('renderer/video/index.html');
const homeJs = lies('renderer/video/home.js');
const homeCss = lies('renderer/video/home.css');
const videoJs = lies('renderer/video/video.js');

test('index.html laedt Raum, Darstellung und Stylesheet, nicht mehr die CD-Buehne', () => {
  const raumJs = html.indexOf('src="../lib/raum.js"');
  const dom = html.indexOf('src="home-raum-dom.js"');
  const home = html.indexOf('src="home.js"');
  assert.ok(raumJs > -1 && dom > raumJs && home > dom, 'Reihenfolge raum.js < home-raum-dom.js < home.js');
  assert.ok(html.indexOf('href="home-raum.css"') > html.indexOf('href="home.css"'));
  assert.ok(!html.includes('home-buehne-dom.js'));
});

test('index.html: alte Buehne raus, gebliebene Elemente da', () => {
  for (const id of ['home-head', 'home-namen', 'home-buehne', 'cd-huelle', 'cd-info', 'cd-laufwerk', 'home-staender']) {
    assert.ok(!html.includes('id="' + id + '"'), id);
  }
  for (const id of ['home-close', 'home-back', 'home-title', 'home-kanaele', 'home-such-zeile', 'home-suche',
    'refresh-btn', 'home-hinweis', 'home-vod-view', 'vod-list', 'auth-bar', 'home-version']) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
});

test('home-buehne-dom.js ist geloescht', () => {
  assert.ok(!fs.existsSync(path.join(wurzel, 'renderer/video/home-buehne-dom.js')));
});

test('home.js nutzt HomeRaumDom statt der CD-Buehne', () => {
  for (const alt of ['HomeBuehneDom', 'zeichneNamen', 'zeichneMitte', 'setzeMitteY', 'cdWechsel', 'namenAuswahl',
    'ResizeObserver', 'transitionend', '$staender', '$huelle', '$namen', '$buehneFlaeche', "'wheel'"]) {
    assert.ok(!homeJs.includes(alt), alt);
  }
  const i = homeJs.indexOf('HomeRaumDom.init({');
  assert.ok(i > -1);
  const initOpt = homeJs.slice(i, homeJs.indexOf('});', i));
  for (const n of ['beiFlaeche', 'beiSchliessen', 'beiZurueck', 'beiTafelZu']) assert.ok(new RegExp('\\b' + n + '\\b').test(initOpt), n);
  assert.ok(homeJs.includes('Raum.passtAlsRaum('));
  assert.ok(/mindestMs:\s*4500/.test(homeJs));
  assert.ok(/HomeRaumDom\.zeigeAblauf\([^)]*\(\)\s*=>\s*laufwerk\.ueberspringen\(\)\)/.test(homeJs));
  assert.ok(homeJs.includes('HomeRaumDom.versteckeAblauf()'));
  assert.ok(homeJs.includes("HomeRaumDom.fachBlaettern('offline'"));
  assert.ok(homeJs.includes('HomeRaumDom.setzeTv('));
  assert.ok(homeJs.includes('HomeRaumDom.neuAusrichten()'));
  assert.ok(/addEventListener\('resize'/.test(homeJs));
  // ✕ und ← nur ueber init (sonst feuert alles doppelt)
  assert.ok(!/\$homeClose\.addEventListener|\$homeBack\.addEventListener/.test(homeJs));
});

test('home.js: Schliessen-Wege', () => {
  assert.strictEqual((homeJs.match(/notifyHomeClose/g) || []).length, 1);
  // Aufrufe von closeHome( ohne die Definition: 2x in closeHomeResume, 1x im Erfolg von ladeWert, 1x in onLoad
  assert.strictEqual((homeJs.match(/(?<!function )\bcloseHome\(/g) || []).length, 4);
  const start = homeJs.indexOf('function closeHomeResume(');
  const rumpf = homeJs.slice(start, homeJs.indexOf('\n}', start));
  assert.strictEqual((rumpf.match(/\bcloseHome\(/g) || []).length, 2);
  assert.ok(rumpf.includes('notifyHomeClose'));
  const lw = homeJs.indexOf('async function ladeWert(');
  assert.ok(/if \(ok\) \{[^}]*closeHome\(\)/.test(homeJs.slice(lw, homeJs.indexOf('\n}', lw))));
  assert.ok(/onLoad\(\(\) => \{ if \(!laufwerk\.laeuft\) closeHome\(\); \}\)/.test(homeJs));
  // VOD-Karte laedt ueber ladeWert (kein eigenes submitLoad + closeHome)
  assert.ok(homeJs.includes('ladeWert(v.id, null)'));
  assert.strictEqual((homeJs.match(/^(?!\s*\/\/).*twitchDual\.submitLoad\(/gm) || []).length, 1);
});

test('video.js: window.laeuftEtwas, home.js fragt nur diese Auskunft', () => {
  assert.ok(videoJs.includes("window.laeuftEtwas = () => infoQuelle ? { mode: infoQuelle.mode, login: infoQuelle.mode === 'live' ? infoQuelle.wert : null } : null"));
  assert.ok(videoJs.indexOf('window.laeuftEtwas') > videoJs.indexOf('let infoQuelle'));
  assert.ok(homeJs.includes('laeuftEtwas()'));
  assert.ok(!homeJs.includes("contains('onair')"));
});

test('home.js: Klick im Raum, Ansichten und Tasten', () => {
  for (const f of ["'regal'", "'fernseher'", "'plattenspieler'", "'bild'", "'lampe'"]) assert.ok(homeJs.includes(f), f);
  assert.ok(homeJs.includes("zeigeSchild('Nichts geladen')"));
  assert.ok(homeJs.includes("zeigeTafel('konto'") && homeJs.includes("zeigeTafel('licht'") && homeJs.includes("zeigeTafel('vods'"));
  assert.ok(homeJs.includes('saveThemePrefs({ animationen'));
  assert.ok(homeJs.includes('Weitere Einstellungen: ⚙ im Chat'));
  assert.ok(homeJs.includes('HomeRaumDom.tafelOffen()'));
  assert.ok(homeJs.includes("openHome('regal')"));
});

test('home.css: nur noch Home-Grundregeln, keine Verlaeufe, kein Blur', () => {
  assert.ok(homeCss.length > 0);
  assert.ok(!/gradient|backdrop-filter/.test(homeCss));
  for (const alt of ['cd-', 'namen-', '.album', 'staender', 'lw-', 'inlay-', '#home-head', '#home-buehne']) {
    assert.ok(!homeCss.includes(alt), alt);
  }
  for (const bleibt of ['#home {', '#home-vod-view', '.vod', '#auth-bar', '.empty', '#home-hinweis', '#home-version', '.hidden']) {
    assert.ok(homeCss.includes(bleibt), bleibt);
  }
});

test('Renderer nennt die alte CD-Buehne nicht mehr', () => {
  const dateien = [];
  for (const ordner of ['renderer/video', 'renderer/lib']) {
    for (const f of fs.readdirSync(path.join(wurzel, ordner))) if (/\.(js|css|html)$/.test(f)) dateien.push(ordner + '/' + f);
  }
  for (const d of dateien) {
    assert.ok(!/cd-huelle|cd-laufwerk|cd-info|home-staender|home-namen|home-buehne"|HomeBuehneDom/.test(lies(d)), d);
  }
});
