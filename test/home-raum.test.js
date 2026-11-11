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
  for (const n of ['raum-tv-aus.png', 'regal.png', 'huelle.png', 'huelle-gross-vorn.png', 'huelle-gross-rueck.png', 'platte-vorn.png', 'zettel.png', 'lampe-klein.png']) {
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
  assert.ok(/left:\s*0/.test(regel) && /right:\s*0/.test(regel) && /text-align:\s*center/.test(regel));
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

// --- Runde 2, Task 3b: Platte rausnehmen, VODs auf der Rueckseite -------------
test('Grosse Huelle: PixelLab-Bilder vorn/hinten, Fenster und Liste aus Konstanten, ganzzahlig', () => {
  assert.ok(/GROSS_FENSTER\s*=\s*\{\s*x:\s*32,\s*y:\s*32,\s*b:\s*65,\s*h:\s*65\s*\}/.test(js));
  assert.ok(/GROSS_LISTE\s*=\s*\{\s*x:\s*21,\s*y:\s*31,\s*b:\s*86,\s*h:\s*68\s*\}/.test(js));
  const b = rumpf(js, 'function baueGross(');
  assert.ok(b.includes("'../themes/cozy/huelle-gross-vorn.png'") && b.includes("'../themes/cozy/huelle-gross-rueck.png'"));
  // Profilbild in Fenstergroesse (65x65), nicht halbiert
  assert.ok(rumpf(js, 'function zeichneGross(').includes('profilbild(k, t.grossFenster, GROSS_FENSTER)'));
  const n = rumpf(js, 'function neuAusrichten(');
  assert.ok(n.includes('Raum.grossKante(wirt.clientHeight, wirt.clientWidth)'));
  assert.ok(n.includes("setProperty('--n', n)"));
  assert.ok(/Math\.round\(\(wirt\.clientWidth - kante\) \/ 2\)/.test(n) && /Math\.round\(\(wirt\.clientHeight - kante\) \/ 2\)/.test(n), 'mittig auf ganzen Pixeln');
  assert.ok(/\.gross\s*\{[^}]*width:\s*calc\(128px \* var\(--n, 2\)\)/.test(css));
  assert.ok(/\.gross-bild\s*\{[^}]*image-rendering:\s*pixelated/.test(css));
});

test('Grosse Huelle dreht sich um: rotateY, Vorder- und Rueckseite, 400 ms, Animationen aus sofort', () => {
  assert.ok(/\.gross-karte\s*\{[^}]*transform-style:\s*preserve-3d;[^}]*transition:\s*transform 400ms/.test(css));
  assert.ok(/\.gross-karte\.gedreht\s*\{\s*transform:\s*rotateY\(180deg\)/.test(css));
  assert.ok(/\.gross-seite\s*\{[^}]*backface-visibility:\s*hidden/.test(css));
  assert.ok(/\.gross-rueck\s*\{\s*transform:\s*rotateY\(180deg\)/.test(css));
  const z = rumpf(js, 'function zeichneGross(');
  const weg = z.indexOf("classList.remove('gedreht')", z.indexOf('t.grossLogin !== k.login'));
  const reflow = z.indexOf('void t.grossKarte.offsetWidth');
  const dreh = z.indexOf("classList.add('gedreht')");
  assert.ok(weg > -1 && reflow > weg && dreh > reflow, 'Vorderseite festschreiben, dann umdrehen');
  assert.ok(/\[data-animationen="aus"\][^{]*\{[^}]*transition:\s*none/.test(css));
});

test('Rueckseite: scrollbare Liste aller VODs, Klick -> vod, Alle VODs (mehr) am Ende, keine Seiten', () => {
  const l = rumpf(js, 'function zeichneVodListe(');
  assert.ok(/for \(const v of r\.vods \|\| \[\]\)/.test(l), 'alle VODs, nicht nur eine Seite');
  assert.ok(l.includes("ruf(t.grossH, 'vod', v.id)"));
  assert.ok(l.includes("'gross-vod-titel'") && l.includes('v.publishedLabel, v.lengthLabel'));
  assert.ok(l.includes('if (r.mehr)') && l.includes("ruf(t.grossH, 'mehr', t.grossK)"));
  assert.ok(!/JE_SEITE|VOD_PLAETZE|'vodSeite'|r\.seite/.test(js), 'Seiten-Logik entfaellt');
  assert.ok(/\.gross-liste\s*\{[^}]*overflow-y:\s*auto/.test(css));
  assert.ok(/\.gross-liste\s*\{[^}]*font-family:\s*var\(--schrift-pixel\);\s*font-size:\s*var\(--raum-schrift\)/.test(css));
  // ↑/↓ scrollen die Liste (home.js fragt zuerst vodsScrollen)
  const s = rumpf(js, 'function vodsScrollen(');
  assert.ok(s.includes('grossOffen()') && s.includes('t.grossListe.scrollBy('));
  assert.ok(/\bvodsScrollen\b/.test(schnittstelle()));
  const homeJs = lies('renderer/video/home.js');
  const sch = homeJs.slice(homeJs.indexOf('function schritt('), homeJs.indexOf('\n}', homeJs.indexOf('function schritt(')));
  assert.ok(/^\s*if \(rueckseite && HomeRaumDom\.vodsScrollen\(r\)\) return;/m.test(sch));
  assert.ok(sch.indexOf('vodsScrollen') < sch.indexOf('offlineAnsicht'), 'vor dem Schliessen');
});

test('Zuruecklegen: Klick daneben und ✕ rufen rueckseiteZu; Esc bleibt in home.js', () => {
  const b = rumpf(js, 'function baueGross(');
  assert.ok(/if \(e\.target === t\.gross\) ruf\(t\.grossH, 'rueckseiteZu'\)/.test(b), 'Klick daneben');
  assert.ok(/knopf\('pixel-knopf k-zu gross-zu', '✕', [^,]+, \(\) => ruf\(t\.grossH, 'rueckseiteZu'\)\)/.test(b), '✕');
  const homeJs = lies('renderer/video/home.js');
  assert.ok(homeJs.includes('else if (rueckseite) { rueckseite = null; renderHome(); }'), 'Esc-Kette');
  assert.ok(homeJs.includes('rueckseiteZu: () => { rueckseite = null; renderHome(); }'));
  // home.js gibt die ganze geladene Liste weiter
  assert.ok(homeJs.includes('rueckseite: g.kanal ? rueckseite : null'));
});

test('Alte gekachelte Rueckseite im Buecherfach ist weg (samt CSS)', () => {
  for (const alt of ['vorn-rueck', 'rueck-text', 'rueck-vod', 'rueck-knopf', 'rueck-links', 'rueck-fuss', 'huelle-rueck.png', 't.rueck']) {
    assert.ok(!js.includes(alt) && !css.includes(alt), alt);
  }
  // herausgenommen: Huelle und Platte fehlen im Fach
  const z = rumpf(js, 'function zeichneBuehne(');
  assert.ok(z.includes('aus(t.vornHuelle, !k || gedreht)') && z.includes('aus(t.vornPlatte, !k || gedreht)'));
  assert.ok(z.includes('zeichneGross(s, h)'));
});

test('home-raum-dom.js: Handler-Namen der alten Buehne bleiben', () => {
  for (const h of ['laden', 'stern', 'vods', 'rueckseiteZu', 'vod', 'mehr', 'waehle']) {
    assert.ok(js.includes("'" + h + "'"), h);
  }
  // vodSeite bleibt als Schnittstelle in home.js, die Liste blaettert nicht mehr
  assert.ok(lies('renderer/video/home.js').includes('vodSeite:'));
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
  assert.ok(/mindestMs:\s*5200/.test(homeJs));
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
  assert.ok(/onLoad\(\(\) => \{ zeigeSchliessKnoepfe\(\); if \(!laufwerk\.laeuft\) closeHome\(\); \}\)/.test(homeJs));
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
// Rumpf einer Funktion auf oberster Ebene (schliessende Klammer in Spalte 0).
function rumpfOben(quelle, kopf) {
  const start = quelle.indexOf(kopf);
  if (start < 0) return '';
  const ende = quelle.indexOf('\n}\n', start);
  return quelle.slice(start, ende < 0 ? undefined : ende);
}

function rumpf(quelle, kopf) {
  const start = quelle.indexOf(kopf);
  if (start < 0) return '';
  const ende = quelle.indexOf('\n  }\n', start);
  return quelle.slice(start, ende < 0 ? undefined : ende);
}

// --- Runde 2, Task 4: Auflegen mit Kamera zum Plattenspieler und drehender Platte ---
function ablaufMs() {
  const m = /ABLAUF_MS\s*=\s*(\{[^}]*\})/.exec(js);
  assert.ok(m, 'ABLAUF_MS');
  return Function('return ' + m[1])();
}

test('Ablauf: Phasenlaengen 500/1200/1500/2000, Summe 5200 = mindestMs in home.js', () => {
  const m = ablaufMs();
  assert.deepStrictEqual(m, { raum: 500, spieler: 1200, dreht: 1500, zoom: 2000 });
  const summe = m.raum + m.spieler + m.dreht + m.zoom;
  assert.strictEqual(summe, 5200);
  assert.ok(new RegExp('mindestMs:\\s*' + summe + '\\b').test(homeJs));
});

test('zeigeAblauf: Klassen ablauf-raum, -spieler, -dreht, -zoom nacheinander zu den Phasengrenzen', () => {
  const r = rumpf(js, 'function zeigeAblauf(');
  assert.ok(r.length > 0);
  const reihe = ["'ablauf-raum'", "'ablauf-spieler'", "'ablauf-dreht'", "'ablauf-zoom'"].map((k) => r.indexOf(k));
  assert.ok(reihe[0] > -1 && reihe.every((x, i) => i === 0 || x > reihe[i - 1]), 'Reihenfolge');
  assert.ok(r.includes('abschnitt(m.raum, ()'), 'spieler nach raum');
  assert.ok(r.includes('abschnitt(m.raum + m.spieler, ()'), 'dreht nach raum+spieler');
  assert.ok(r.includes('abschnitt(m.raum + m.spieler + m.dreht, ()'), 'zoom nach raum+spieler+dreht');
  assert.ok(/function abschnitt\(ms, f\) \{ ablaufTimer\.push\(setTimeout\(f, ms\)\); \}/.test(js));
  assert.ok(r.includes('aus(t.dreht, false)'), 'Sprite an');
  assert.strictEqual((r.match(/neuAusrichten\(\)/g) || []).length, 2, 'Kamera bei spieler und zoom');
});

test('CSS: Uebergaenge passen zu den Phasen, Zoom-Regel steht nach der Spieler-Regel', () => {
  const m = ablaufMs();
  assert.ok(/#home\.im-ablauf #raum-ebene\s*\{[^}]*transition:\s*opacity 500ms/.test(css));
  const sp = css.search(new RegExp('#home\\.ablauf-spieler #raum-ebene \\.raum-bildebene\\s*\\{[^}]*transition:\\s*transform ' + m.spieler + 'ms'));
  const zo = css.search(new RegExp('#home\\.ablauf-zoom #raum-ebene \\.raum-bildebene\\s*\\{[^}]*transition:\\s*transform ' + m.zoom + 'ms'));
  assert.ok(sp > -1 && zo > sp, 'zoom gewinnt (gleiche Spezifitaet, spaeter)');
  assert.ok(!css.includes('2500ms') && !css.includes('ablauf-flug') && !css.includes('ablauf-platte'));
});

test('Drehende Platte: platte-dreht.png als Sprite an (258, 82), 8 Bilder je 54x50, steps(8), ~10 Bilder/s', () => {
  assert.ok(/const DREHT = \{ x: 258, y: 82, b: 54, h: 50, bilder: 8 \}/.test(js));
  const raum = rumpf(js, 'function baueRaum(');
  assert.ok(/t\.dreht = lage\(el\('div', 'ablauf-dreht-platte raum-aus'\), DREHT\)/.test(raum));
  assert.ok(raum.includes('r.bild.appendChild(t.dreht)'), 'in der skalierten Bildebene');
  assert.ok(raum.indexOf('r.bild.appendChild(t.dreht)') > raum.indexOf('t.hover[f.id]'), 'ueber dem Hover-Bild');
  const regel = /\.ablauf-dreht-platte\s*\{([^}]*)\}/.exec(css);
  assert.ok(regel);
  assert.ok(regel[1].includes("url('../themes/cozy/platte-dreht.png') 0 0 / 432px 50px no-repeat"), 'Streifen in Bildpixeln');
  const anim = /animation:\s*raum-platte-dreht (\d+)ms steps\(8\) infinite/.exec(regel[1]);
  assert.ok(anim);
  const bilderProSek = 8 / (Number(anim[1]) / 1000);
  assert.ok(bilderProSek >= 9 && bilderProSek <= 11, 'ca. 10 Bilder/s');
  assert.ok(/@keyframes raum-platte-dreht\s*\{\s*to\s*\{\s*background-position:\s*-432px 0;\s*\}\s*\}/.test(css));
  assert.ok(fs.existsSync(path.join(wurzel, 'renderer/themes/cozy/platte-dreht.png')));
});

test('Kamera: Plattenspieler im Abschnitt spieler, Fernseher im Zoom, sonst Ruhelage', () => {
  const r = rumpf(js, 'function kameraZiel(');
  assert.ok(r.includes("k.contains('ablauf-zoom') ? Raum.TV_RECHTECK"));
  assert.ok(r.includes("k.contains('ablauf-spieler') ? Raum.PLATTENSPIELER_RECHTECK : null"));
  assert.ok(r.indexOf('ablauf-zoom') < r.indexOf('ablauf-spieler'), 'Zoom geht vor (beide Klassen gesetzt)');
});

test('Grosse Huelle ist waehrend des Ablaufs ausgeblendet', () => {
  assert.ok(/#home\.im-ablauf \.gross-platz\s*\{[^}]*display:\s*none/.test(css));
});

test('Ablauf: Klick oder Taste auf #home-ablauf ruft beiUeberspringen', () => {
  const r = rumpf(js, 'function baueAblauf(');
  assert.ok(r.includes("'home-ablauf'"));
  assert.ok(/t\.ablauf\.addEventListener\('click'/.test(r) && /t\.ablauf\.addEventListener\('keydown'/.test(r));
  assert.ok(/ablaufRuf\s*=\s*typeof beiUeberspringen === 'function'/.test(js));
});

test('versteckeAblauf raeumt Klassen, Timer, Sprite und Kamera weg', () => {
  const r = rumpf(js, 'function versteckeAblauf(');
  assert.ok(r.includes('clearTimeout('));
  for (const k of ["'im-ablauf'", "'ablauf-raum'", "'ablauf-spieler'", "'ablauf-dreht'", "'ablauf-zoom'"]) assert.ok(r.includes(k), k);
  assert.ok(r.includes('aus(t.dreht, !spielt)'), 'Sprite aus, ausser es laeuft gerade etwas');
  assert.ok(r.includes('zeigeAnsicht(aktuell)'), 'Ansicht und Kamera zurueck (ruft neuAusrichten)');
  assert.ok(r.indexOf('classList.remove(') < r.indexOf('zeigeAnsicht(aktuell)'), 'Klassen weg vor der Ruhelage');
});

test('Plattenspieler dreht, solange ein Stream oder VOD laeuft (Janis 11.11.)', () => {
  assert.ok(schnittstelle().includes('plattenspielerLaeuft'), 'exportiert');
  const r = rumpf(js, 'function plattenspielerLaeuft(');
  assert.ok(r.includes('spielt = !!an'));
  assert.ok(r.includes("classList.contains('im-ablauf')"), 'im Ablauf steuert der Ablauf die Platte');
  assert.ok(r.includes('aus(t.dreht, !spielt)'));
  // Zustand vor dem Aufbau merken: init zeigt die Platte gleich richtig
  assert.ok(rumpf(js, 'function init(').includes('aus(t.dreht, !spielt)'));
  // video.js meldet jeden On-Air-Wechsel (LIVE und VOD spielen = dreht)
  const video = lies('renderer/video/video.js');
  const u = rumpf(video, 'function updateOnAir(');
  assert.ok(/HomeRaumDom\.plattenspielerLaeuft\(label !== null\)/.test(u), 'meldet an HomeRaumDom');
  assert.ok(u.indexOf('plattenspielerLaeuft') < u.indexOf("if (!el) return;"), 'vor dem fruehen Ausstieg');
});

test('Holzwand hinter dem Raum: eigene Skalierung mit RAUM_RAHMEN, Regal bleibt (Janis 11.11.: C)', () => {
  const r = rumpf(js, 'function baueRaum(');
  assert.ok(r.includes("bildEl('../themes/cozy/raum-wand.png', 'raum-wand')"));
  assert.ok(r.indexOf("'raum-wand'") > r.indexOf('t.raumBild'), 'ueber dem Raum-Bild (deckt dessen schwarzen Rand)');
  assert.ok(r.indexOf("'raum-wand'") < r.indexOf('RaumLebenDom.baue'), 'unter dem Leben');
  assert.ok(/\.raum-wand\s*\{[^}]*left:\s*-80px[^}]*width:\s*504px[^}]*height:\s*192px/.test(css));
  const n = rumpf(js, 'function neuAusrichten(');
  assert.ok(n.includes('skalRaum = Raum.skalierung(wirt.clientWidth, wirt.clientHeight, Raum.RAUM_RAHMEN)'));
  assert.ok(/r === t\.raum \? skalRaum : skal/.test(n), 'Raum-Ebene mit skalRaum, Regal mit skal');
  assert.ok(rumpf(js, 'function baueRaum(').includes('Raum.zuBild(e.clientX - box.left, e.clientY - box.top, skalRaum)'), 'Klicks im Raum');
});

test('Ohne Stream/VOD bleibt Home offen: kein ☰ und kein ✕, Esc schliesst nicht (Janis 11.11.)', () => {
  const homeJs = lies('renderer/video/home.js');
  const k = rumpfOben(homeJs, 'function kannSchliessen(');
  assert.ok(k.includes('window.laeuftEtwas && window.laeuftEtwas()'));
  // closeHomeResume ist der einzige Schliess-Weg zurueck zur Quelle (☰, ✕, Esc, Fernseher)
  const c = rumpfOben(homeJs, 'function closeHomeResume(');
  assert.ok(/^\s*if \(!kannSchliessen\(\)\) return;/m.test(c.split('\n').slice(1, 6).join('\n')), 'gleich am Anfang');
  const z = rumpfOben(homeJs, 'function zeigeSchliessKnoepfe(');
  assert.ok(z.includes("$homeBtn.classList.toggle('hidden', !kannSchliessen())"));
  assert.ok(z.includes("getElementById('home-close')"));
  assert.ok(rumpfOben(homeJs, 'function openHome(').includes('zeigeSchliessKnoepfe()'));
  assert.ok(/twitchDual\.onLoad\(\(\) => \{[^}]*zeigeSchliessKnoepfe\(\)/.test(homeJs), 'nach dem Laden erscheinen sie');
});

test('Doppelklick markiert nichts: Video-Fenster ohne Textauswahl, Home raeumt Auswahl weg (Janis 11.11.)', () => {
  const html = lies('renderer/video/index.html');
  assert.ok(/body\s*\{[^}]*user-select:\s*none/.test(html), 'body user-select: none');
  const homeJs = lies('renderer/video/home.js');
  assert.ok(rumpfOben(homeJs, 'function closeHome(').includes('getSelection().removeAllRanges()'));
});

test('Home liegt direkt unter der Leiste (kein Holzstreifen dazwischen, Janis 11.11.)', () => {
  const homeCss = lies('renderer/video/home.css');
  assert.ok(!homeCss.includes('top: 63px'), 'keine feste alte Hoehe');
  assert.ok(/#home\s*\{[^}]*top:\s*var\(--leiste-h, 50px\)/.test(homeCss));
  const video = lies('renderer/video/video.js');
  assert.ok(/new ResizeObserver\(/.test(video), 'Hoehe der Leiste gemessen');
  assert.ok(video.includes("setProperty('--leiste-h'"));
});

test('Fliegende Platte entfaellt samt CSS', () => {
  assert.ok(!js.includes('platte-klein.png') && !js.includes('t.flug') && !js.includes('FLUG_KANTE') && !js.includes('Raum.TELLER'));
  assert.ok(!css.includes('ablauf-flug') && !css.includes('--dx'));
});

test('Kamera-Ziele (ganzzahliger Faktor) decken das Fenster und bleiben im Bild', () => {
  const R = require('../renderer/lib/raum.js');
  for (const [w, h] of [[688, 384], [1397, 1332], [1920, 1080], [2560, 1440], [800, 1400], [3000, 500]]) {
    const cover = R.skalierung(w, h).faktor;
    for (const rect of [R.PLATTENSPIELER_RECHTECK, R.TV_RECHTECK]) {
      const z = R.kameraZiel(rect, w, h);
      assert.ok(Number.isInteger(z.faktor) && z.faktor > cover, 'naeher als die Ruhelage');
      // sichtbarer Ausschnitt in Bildpixeln liegt innerhalb des Rechtecks (+1 px Rundung)
      const links = -z.x / z.faktor, oben = -z.y / z.faktor;
      const rechts = links + w / z.faktor, unten = oben + h / z.faktor;
      assert.ok(links >= rect.x - 1 && rechts <= rect.x + rect.b + 1, w + 'x' + h + ' waagerecht');
      assert.ok(oben >= rect.y - 1 && unten <= rect.y + rect.h + 1, w + 'x' + h + ' senkrecht');
    }
  }
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
  assert.ok(js.includes('? Raum.TV_RECHTECK') && js.includes('Raum.kameraZiel(ziel, wirt.clientWidth, wirt.clientHeight)'));
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

test('home-raum.css: Animationen aus -> Uebergaenge und Sprite still, keine CSS-Rotation der Platte', () => {
  assert.ok(/\[data-animationen="aus"\][^{]*\{[^}]*transition:\s*none[^}]*animation:\s*none/.test(css));
  // ohne Animationen startet home.js keinen Ablauf
  const lw = homeJs.indexOf('async function ladeWert(');
  assert.ok(/const mitLaufwerk = !!kanal && !effekteAus\(\);/.test(homeJs.slice(lw, homeJs.indexOf('\n}', lw))));
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

// --- Schluss-Fixes Runde 2: Doppelklick, Fake-Fett, ganze Pixel -----------------
test('Doppelklick: grosse Huelle und Ablauf ignorieren den zweiten Klick (detail > 1)', () => {
  const g = rumpf(js, 'function baueGross(');
  const gk = g.indexOf("addEventListener('click'");
  assert.ok(gk >= 0 && g.indexOf('e.detail > 1', gk) > gk && g.indexOf('e.detail > 1', gk) < g.indexOf("rueckseiteZu')", gk));
  const a = rumpf(js, 'function baueAblauf(');
  const w = a.indexOf('const weiter = (e) => {');
  assert.ok(w >= 0);
  assert.ok(a.indexOf('e.detail > 1', w) > w && a.indexOf('e.detail > 1', w) < a.indexOf('ablaufRuf();', w));
});

test('Raum Klar hat ein Gewicht: font-synthesis aus, damit kein Fake-Fett die Pixel verschmiert', () => {
  const raumCss = lies('renderer/themes/cozy/raum.css');
  assert.ok(/body\s*\{[^}]*font-synthesis:\s*none/.test(raumCss));
  assert.ok(/<link[^>]*themes\/cozy\/raum\.css/.test(lies('renderer/video/index.html')));
  assert.ok(/<link[^>]*themes\/cozy\/raum\.css/.test(lies('renderer/chat/index.html')));
});

test('Text liegt auf ganzen Bildschirm-Pixeln: round() im CSS, gerundete Textschicht, Name ohne Bruch-Translate', () => {
  const t = /\.text-teil\s*\{([^}]*)\}/.exec(css)[1];
  for (const p of ['left', 'top', 'width', 'height']) {
    assert.ok(new RegExp('(^|[\\s;])' + p + ':\\s*round\\(calc\\([^;]*\\),\\s*1px\\)').test(t), p);
  }
  const n = rumpf(js, 'function neuAusrichten(');
  assert.ok(n.includes('Math.round(s.links)') && n.includes('Math.round(s.oben)'));
  const name = /\.raum-name\s*\{([^}]*)\}/.exec(css)[1];
  assert.ok(!/translateX/.test(name) && /text-align:\s*center/.test(name) && /left:\s*0/.test(name) && /right:\s*0/.test(name));
});

// --- Etappe 3, Task 5: Home-Raum lebt (Regen, Katze, Dampf, Lampe) ---------------------
const homeFunktion = (kopf) => {
  const s = homeJs.indexOf(kopf);
  return s < 0 ? '' : homeJs.slice(s, homeJs.indexOf('\n}', s));
};

test('baueRaum: RaumLebenDom.baue mit RaumLeben.HOME in r.bild, ueber dem Raum-Bild, unter TV und Hover', () => {
  const r = rumpf(js, 'function baueRaum(');
  const b = r.search(/t\.leben = RaumLebenDom\.baue\(document, r\.bild, RaumLeben\.HOME, '\.\.\/themes\/cozy\/leben-home-'\)/);
  assert.ok(b > -1, 'Aufruf fehlt');
  assert.ok(b > r.indexOf('r.bild.appendChild(t.raumBild)'), 'ueber dem Raum-Bild');
  assert.ok(b < r.indexOf('r.bild.appendChild(t.tv)'), 'unter dem Fernseher (Lampe ragt in den Bildschirm)');
  assert.ok(b < r.indexOf('t.hover[f.id]'), 'vor den Hover-Bildern');
});

test('HomeRaumDom.leben in der Schnittstelle, schaltet an/aus', () => {
  assert.ok(/\bleben\b/.test(schnittstelle()));
  const r = rumpf(js, 'function leben(');
  assert.ok(r.includes('t.leben.an()') && r.includes('t.leben.aus()'));
  assert.ok(!rumpf(js, 'function versteckeAblauf(').includes('leben'), 'Ablauf laesst die Animationen in Ruhe');
});

test('home.js: openHome/closeHome schalten das Leben, Beobachter auf data-animationen', () => {
  assert.ok(homeFunktion('function openHome(').includes('HomeRaumDom.leben(!effekteAus())'));
  assert.ok(homeFunktion('function closeHome(').includes('HomeRaumDom.leben(false)'));
  assert.ok(/new MutationObserver\(/.test(homeJs));
  assert.ok(/attributeFilter:\s*\['data-animationen'\]/.test(homeJs));
  const m = homeJs.slice(homeJs.indexOf('new MutationObserver('));
  const rumpfM = m.slice(0, m.indexOf('.observe('));
  assert.ok(rumpfM.includes("$home.classList.contains('hidden')") && rumpfM.includes('HomeRaumDom.leben(!effekteAus())'));
});

test('home-raum.css: Leben-Regeln (Streifen, steps, selten, Keyframes)', () => {
  assert.ok(/\.raum-leben\s*\{[^}]*position:\s*absolute;[^}]*pointer-events:\s*none;[^}]*image-rendering:\s*pixelated;[^}]*animation:\s*raum-leben var\(--dauer\) steps\(var\(--bilder\)\) infinite;/.test(css));
  assert.ok(/\.raum-leben\.selten:not\(\.spielt\)\s*\{\s*animation:\s*none;\s*\}/.test(css));
  assert.ok(/\.raum-leben\.selten\.spielt\s*\{\s*animation-iteration-count:\s*1;\s*\}/.test(css));
  assert.ok(/@keyframes raum-leben\s*\{\s*to\s*\{\s*background-position:\s*calc\(-1 \* var\(--sb\)\) 0;\s*\}\s*\}/.test(css));
  assert.ok(/\.raum-leben\.ruht\s*\{\s*animation:\s*none;\s*\}/.test(css));
});

test('index.html laedt raum-leben-dom.js nach raum-leben.js und vor home-raum-dom.js', () => {
  const a = html.indexOf('../lib/raum-leben.js');
  const b = html.indexOf('../lib/raum-leben-dom.js');
  assert.ok(a > -1 && b > a && b < html.indexOf('src="home-raum-dom.js"'));
});
