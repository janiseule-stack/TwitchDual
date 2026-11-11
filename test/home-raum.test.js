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
  // '.png' allein: Endung der zusammengesetzten Hover-Namen (unten geprueft)
  for (const b of bilder) assert.ok(/^['"]\.\.\/themes\/cozy\/[a-z0-9-]+\.png['"]$/.test(b) || b === "'.png'", b);
  for (const n of ['raum-tv-aus.png', 'regal.png', 'huelle.png', 'huelle-rueck.png', 'platte-vorn.png', 'zettel.png', 'lampe-klein.png']) {
    assert.ok(js.includes(n) || css.includes(n), n);
  }
  assert.ok(js.includes("'../themes/cozy/hover-' + f.id + '.png'"), 'Hover-Bilder');
  assert.ok(!js.includes('lampe-rot.png'));
  assert.ok(/\.huelle-lampe\s*\{[^}]*width:\s*11px;[^}]*height:\s*8px/.test(css), 'Lampe 11x8 in Bildkoordinaten');
  assert.ok(!/https?:/.test(js));
});

test('home-raum-dom.js: Huellen-Fenster als eine Konstante, Profilbild-Canvas volle Fenstergroesse', () => {
  assert.ok(/HUELLE_FENSTER\s*=\s*\{\s*x:\s*2,\s*y:\s*2,\s*b:\s*36,\s*h:\s*36\s*\}/.test(js));
  assert.strictEqual((js.match(/HUELLE_FENSTER\s*=/g) || []).length, 1);
  // 36x36 (Fach und vordere Huelle), aus der Konstante abgeleitet, nicht mehr halbiert
  const r = rumpf(js, 'function profilbild(');
  assert.ok(/const m = masse \|\| HUELLE_FENSTER;/.test(r));
  assert.ok(/c\.width = m\.b;/.test(r) && /c\.height = m\.h;/.test(r));
  assert.ok(!/HUELLE_FENSTER\.[bh]\s*\/\s*2/.test(js));
  assert.ok(js.includes('drawImage'));
});

test('home-raum-dom.js: Profilbild mit error-Zweig und Anfangsbuchstabe', () => {
  const i = js.indexOf("'error'");
  assert.ok(i > -1, 'error-Zweig');
  assert.ok(/anfangsbuchstabe/i.test(js));
  assert.ok(/charAt\(0\)|\[0\]/.test(js) && js.includes('toUpperCase'));
});

test('home-raum-dom.js: VOD-Vorschau als Canvas 64x18 (doppelt so fein)', () => {
  assert.ok(/width\s*=\s*64;/.test(js) && /height\s*=\s*18;/.test(js));
  assert.ok(!/width\s*=\s*32;/.test(js) && !/height\s*=\s*9;/.test(js));
});

// --- Runde 2, Task 3: Schrift, Hover, Zettel, Doppelklick --------------------
test('Schrift: Vielfache von 12 px aus neuAusrichten, Text-Ebenen nutzen die Variable', () => {
  const r = rumpf(js, 'function neuAusrichten(');
  assert.ok(r.includes("setProperty('--raum-schrift', Raum.schriftPx(f) + 'px')"));
  assert.ok(r.includes("setProperty('--raum-schrift-gross', Raum.schriftPx(f, 5) + 'px')"));
  assert.ok(r.includes("setProperty('--rand', Raum.randPx(f, ZETTEL_RAND) + 'px')"));
  // keine Schriftgroessen oder Rahmen mehr aus dem (gebrochenen) Faktor
  assert.ok(!/calc\(var\(--f[^)]*\)\s*\*\s*[45]px\)/.test(css), 'Schrift f*4px/f*5px');
  assert.ok(!/calc\(6px \* var\(--f\)\)/.test(css), 'Rand 6px*f');
  assert.ok(/\.text-teil\s*\{[^}]*font-size:\s*var\(--raum-schrift\);[^}]*line-height:\s*1;/.test(css));
  assert.ok(/\.tafel-kopf\s*\{[^}]*font-size:\s*var\(--raum-schrift-gross\)/.test(css));
  assert.ok(/#home-ablauf\s*\{[^}]*font-size:\s*var\(--raum-schrift-gross\)/.test(css));
  assert.ok(/\.tafel-rahmen\s*\{[^}]*border-width:\s*var\(--rand\)/.test(css));
});

test('Hover: keine Winkel, kein Holzschild; hover-<id>.png an Raum.HOVER, aufgehellt, 120 ms', () => {
  for (const alt of ['raum-winkel', 'raum-schild', 'schild.png']) {
    assert.ok(!js.includes(alt) && !css.includes(alt), alt);
  }
  const r = rumpf(js, 'function baueRaum(');
  assert.ok(r.includes('Raum.HOVER[f.id]'));
  assert.ok(/lage\(bildEl\('\.\.\/themes\/cozy\/hover-' \+ f\.id \+ '\.png', 'raum-hover'\), h\)/.test(r));
  assert.ok(r.indexOf('raum-hover') > r.indexOf('t.tv'), 'ueber der TV-Canvas');
  assert.ok(/\.raum-hover\s*\{[^}]*filter:\s*brightness\(1\.3\);[^}]*transition:\s*opacity 120ms/.test(css));
  assert.ok(/\.raum-hover\.an\s*\{[^}]*opacity:\s*1/.test(css));
});

test('Name unten mittig: unskaliert, Schatten, ueber der Hinweiszeile; zeigeSchild nutzt den Platz', () => {
  assert.ok(/t\.name = el\('div', 'raum-name raum-aus'\);\s*r\.e\.appendChild\(t\.name\)/.test(js), 'in der unskalierten Ebene');
  const regel = css.slice(css.indexOf('.raum-name {'), css.indexOf('}', css.indexOf('.raum-name {')));
  assert.ok(/left:\s*50%/.test(regel) && /translateX\(-50%\)/.test(regel));
  const unten = Number((/bottom:\s*(\d+)px/.exec(regel) || [])[1]);
  assert.ok(unten >= 12 + 36, 'Abstand >= 12 px und ueber #home-hinweis');
  assert.ok(/color:\s*var\(--text\)/.test(regel) && /text-shadow:/.test(regel));
  assert.ok(regel.includes('font-size: var(--raum-schrift)'));
  assert.ok(/#home\.im-ablauf \.raum-name\s*\{[^}]*display:\s*none/.test(css));
  const s = rumpf(js, 'function zeigeSchild(');
  assert.ok(s.includes('hinweisText') && s.includes('zeigeUnten()'));
  assert.ok(rumpf(js, 'function zeigeUnten(').includes('hinweisText || hoverName'));
});

test('Text-Ebene des Raums ist waehrend des Ablaufs ausgeblendet', () => {
  assert.ok(/#home\.im-ablauf #raum-ebene \.raum-textschicht\s*\{[^}]*visibility:\s*hidden/.test(css));
});

test('Zettel: oben 12 geschnitten, Text beginnt unter der Kante, Zeilen nach Raum.zettelZeilen', () => {
  assert.ok(/ZETTEL_RAND_OBEN\s*=\s*12;/.test(js));
  assert.ok(js.includes('innen(VORN_ZETTEL, ZETTEL_RAND_OBEN)'));
  assert.ok(/\.zettel\.vorn-zettel\s*\{[^}]*border-width:\s*12px 6px 6px;[^}]*zettel\.png'\)\s*12 6 6 fill \/ 12px 6px 6px/.test(css));
  const p = rumpf(js, 'function zettelPlatz(');
  assert.ok(p.includes('Raum.zettelZeilen((VORN_ZETTEL.h - ZETTEL_RAND_OBEN - ZETTEL_RAND) * skal.faktor'));
  assert.ok(p.includes('Raum.schriftPx(skal.faktor)'));
  const z = rumpf(js, 'function zeichneZettel(');
  for (const b of ['platz.titel', 'platz.spiel', 'platz.laufzeit', 'platz.punkte']) assert.ok(z.includes(b), b);
  assert.ok(/\.zettel-text > div\s*\{[^}]*height:\s*1em;[^}]*white-space:\s*nowrap;[^}]*text-overflow:\s*ellipsis/.test(css));
  // Groesse aendert sich -> Zeilen neu
  assert.ok(rumpf(js, 'function neuAusrichten(').includes('zeichneZettel(t.vornStand, t.buehneH)'));
});

test('Doppelklick legt auf: Fach-Huelle (waehle, dann laden) und vordere Huelle', () => {
  const f = rumpf(js, 'function baueFachPlatte(');
  const d = f.indexOf("addEventListener('dblclick'");
  assert.ok(d > -1);
  const teil = f.slice(d);
  assert.ok(teil.indexOf('waehle()') > -1 && teil.indexOf("ruf(t.buehneH, 'laden'") > teil.indexOf('waehle()'), 'waehle dann laden');
  assert.ok(/e\.art !== 'live' \|\| !kj\.live/.test(teil), 'nur Live-Platten');
  assert.ok(f.includes("p.addEventListener('click', waehle)"), 'Einfachklick bleibt waehlen');
  const r = rumpf(js, 'function baueRegal(');
  assert.ok(/t\.vornHuelle\.addEventListener\('dblclick'[\s\S]*?s\.modus === 'live'[\s\S]*?ruf\(t\.buehneH, 'laden', s\.kanal\.login\)/.test(r));
  // keine zweite Lade-Logik
  assert.ok(!js.includes('submitLoad') && !js.includes('ladeWert'));
});

test('Fach: genau 4 ganze Huellen, Blaettern in ganzen Schritten, Anhebung bleibt im Fach', () => {
  // Fachbreite 175: 4 * 40 + 3 * 4 = 172 <= 175 < 5 * 44 - 4
  const R = require('../renderer/lib/raum.js');
  for (const art of ['live', 'offline']) {
    assert.strictEqual(R.fachFenster(10, 0, R.FACH[art].b, 0).sichtbar, 4, art);
    // Huelle steht unten im Fach (y = h - 40); -3 px Anhebung darf nicht ueber 0
    assert.ok(R.FACH[art].h - R.HUELLE.kante - 3 >= 0, art);
  }
  assert.ok(/translateX\(' \+ \(-f\.start \* \(Raum\.HUELLE\.kante \+ Raum\.HUELLE\.abstand\)\)/.test(js));
  assert.ok(/\.fach \.huelle\.gewaehlt\s*\{\s*transform:\s*translateY\(-3px\)/.test(css));
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

test('home-raum.css: Zettel als 9-Slice mit Rand 6', () => {
  assert.ok(/border-image:\s*url\('\.\.\/themes\/cozy\/zettel\.png'\)\s*6 fill/.test(css));
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

// --- Task 5: Auflegen-Ablauf und Fernseher-Bild ---------------------------------
function rumpf(quelle, kopf) {
  const start = quelle.indexOf(kopf);
  if (start < 0) return '';
  const ende = quelle.indexOf('\n  }\n', start);
  return quelle.slice(start, ende < 0 ? undefined : ende);
}

test('zeigeAblauf: Klassen ablauf-raum, ablauf-platte, ablauf-zoom nacheinander, Dauern 500/1500/2500', () => {
  assert.ok(/ABLAUF_MS\s*=\s*\{\s*raum:\s*500,\s*platte:\s*1500,\s*zoom:\s*2500\s*\}/.test(js));
  const r = rumpf(js, 'function zeigeAblauf(');
  assert.ok(r.length > 0);
  const a = r.indexOf("'ablauf-raum'");
  const p = r.indexOf("'ablauf-platte'");
  const z = r.indexOf("'ablauf-zoom'");
  assert.ok(a > -1 && p > a && z > p, 'Reihenfolge');
  assert.ok((r.match(/setTimeout\(/g) || []).length >= 2, 'Timer fuer Platte und Zoom');
  for (const ms of ['500ms', '1500ms', '2500ms']) assert.ok(css.includes(ms), ms);
});

test('Ablauf: Klick oder Taste auf #home-ablauf ruft beiUeberspringen', () => {
  const r = rumpf(js, 'function baueAblauf(');
  assert.ok(r.includes("'home-ablauf'"));
  assert.ok(/t\.ablauf\.addEventListener\('click'/.test(r) && /t\.ablauf\.addEventListener\('keydown'/.test(r));
  assert.ok(/ablaufRuf\s*=\s*typeof beiUeberspringen === 'function'/.test(js));
});

test('versteckeAblauf raeumt Klassen, Timer, Platte und Kamera weg', () => {
  const r = rumpf(js, 'function versteckeAblauf(');
  assert.ok(r.includes('clearTimeout('));
  for (const k of ["'im-ablauf'", "'ablauf-raum'", "'ablauf-platte'", "'ablauf-zoom'"]) assert.ok(r.includes(k), k);
  assert.ok(r.includes('t.flug'), 'fliegende Platte');
  assert.ok(r.includes('neuAusrichten()'), 'Kamera zurueck');
  assert.ok(r.includes('zeigeAnsicht(aktuell)'), 'Ansicht zurueck');
});

test('Kamera und fliegende Platte nutzen Raum-Geometrie', () => {
  assert.ok(js.includes('Raum.kameraZiel(Raum.TV_RECHTECK'));
  assert.ok(js.includes('Raum.TELLER'));
  assert.ok(js.includes('../themes/cozy/platte-klein.png'));
  assert.ok(/Raum\.FLAECHEN\.find\(\(f\) => f\.id === 'regal'\)/.test(js));
});

test('setzeTv: Vorschau verpixelt, affin auf TV_ECKEN, Maske per destination-in, kein getImageData', () => {
  assert.ok(!js.includes('getImageData'));
  assert.ok(js.includes('../themes/cozy/raum-tv-maske.png'));
  assert.ok(js.includes("globalCompositeOperation = 'destination-in'"));
  assert.ok(js.includes('setTransform('));
  assert.ok(/imageSmoothingEnabled\s*=\s*false/.test(js));
  assert.ok(/width\s*=\s*27/.test(js) && /height\s*=\s*38/.test(js), 'kleine Canvas 27x38');
  assert.ok(/width\s*=\s*Raum\.BILD\.breite/.test(js) && /height\s*=\s*Raum\.BILD\.hoehe/.test(js), 'TV-Canvas 344x192');
  for (const i of [0, 1, 3]) assert.ok(js.includes('Raum.TV_ECKEN[' + i + ']'), 'Ecke ' + i);
  const r = rumpf(js, 'function setzeTv(');
  assert.ok(r.length > 0);
  assert.ok(js.includes('clearRect('), 'Ladefehler leert die Canvas');
});

test('setzeTv: bloesser Adresswechsel (?t=) leert die Canvas nicht, Kanalwechsel, null und Fehler schon', () => {
  const r = rumpf(js, 'function setzeTv(');
  assert.ok(!/\n    leereTv\(\);/.test(r), 'kein unbedingtes Leeren auf oberster Ebene');
  assert.ok(/if \(!url \|\| [^)]*tvLogin[^)]*\) leereTv\(\);/.test(r), 'leeren nur bei null oder anderem Kanal');
  assert.ok(/const fehler = \(\) => \{ if \(nr === tvNr\) \{ leereTv\(\);/.test(r), 'Fehlerzweig leert');
  assert.ok(/nr === tvNr/.test(r), 'veraltete Ladungen verworfen');
});

test('Fernseher-Rechteck kommt aus Raum.TV_RECHTECK', () => {
  assert.ok(js.includes('Raum.kameraZiel(Raum.TV_RECHTECK'));
  assert.ok(!/x:\s*206,\s*y:\s*52/.test(js));
});

test('home.js: Auflegen zeigt den neuen Kanal im Fernseher (live) oder schaltet ihn aus', () => {
  const lw = homeJs.indexOf('async function ladeWert(');
  const r = homeJs.slice(lw, homeJs.indexOf('\n}', lw));
  const tv = r.indexOf('HomeRaumDom.setzeTv(');
  assert.ok(tv > -1, 'setzeTv in ladeWert');
  assert.ok(tv < r.indexOf('HomeRaumDom.zeigeAblauf('), 'vor dem Ablauf');
  assert.ok(r.includes('HomeBuehne.vorschauUrl(kanal.login, Date.now())'));
  assert.ok(/\{ vorschauUrl: [^}]*\} : null\)/.test(r), 'offline/VOD: Fernseher aus (null)');
  assert.ok(/wert === kanal\.login/.test(r) && /!kanal\.offline/.test(r));
});

test('home.css: Hinweiszeile und Version weichen im Ablauf', () => {
  assert.ok(/#home\.im-ablauf #home-hinweis[^{]*\{[^}]*display:\s*none/.test(homeCss));
  assert.ok(/#home\.im-ablauf #home-version/.test(homeCss));
});

test('home-raum.css: Animationen aus -> Uebergaenge still, keine Platten-Drehung', () => {
  assert.ok(/\[data-animationen="aus"\][^{]*\{[^}]*transition:\s*none/.test(css));
  assert.ok(!css.includes('raum-dreh') && !/rotate\(/.test(css));
  assert.ok(!/bildEl\('\.\.\/themes\/cozy\/platte-vorn\.png', 'ablauf-platte'\)/.test(js), 'alte drehende Platte im Ablauf weg');
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
