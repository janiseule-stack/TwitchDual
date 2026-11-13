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

test('Ruecken-Schrift: Groesse aus Variable, dunkel auf hellen Ruecken, ohne Schatten', () => {
  assert.ok(js.includes("setProperty('--ruecken-schrift', Raum.rueckenSchrift(f) + 'px')"));
  const name = css.match(/\.ruecken-name \{[^}]*\}/)[0];
  assert.ok(name.includes('font-size: var(--ruecken-schrift'));
  assert.ok(!/text-shadow/.test(name));
  assert.ok(/\.ruecken\.r-live \.ruecken-name, \.ruecken\.r-favorit \.ruecken-name \{ color: var\(--zettel-tinte\); \}/.test(css));
});

test('home-raum-dom.js setzt window.HomeRaumDom', () => {
  assert.ok(/window\.HomeRaumDom\s*=\s*\(function/.test(js));
});

test('home-raum-dom.js: alle Namen der Schnittstelle stehen im return', () => {
  const r = schnittstelle();
  const namen = ['init', 'zeigeAnsicht', 'ansicht', 'zeichneRegal', 'zeichneKarte', 'kartenScrollen', 'karteOffen',
    'fachBlaettern', 'zeigeAblauf', 'versteckeAblauf', 'zeigeTafel', 'versteckeTafel', 'tafelOffen', 'zeigeSchild',
    'setzeTv', 'neuAusrichten'];
  for (const n of namen) assert.ok(new RegExp('\\b' + n + '\\b').test(r), n);
  for (const alt of ['zeichneBuehne', 'zeichneStaender', 'vodsScrollen', 'fachBlaetternNeu']) {
    assert.ok(!new RegExp('\\b' + alt + '\\b').test(r), alt);
  }
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
  for (const n of ['raum-tv-aus.png', 'regal.png', 'regal-wand.png', 'huelle.png', 'huelle-gross-vorn.png', 'karte.png', 'zettel.png']) {
    assert.ok(js.includes(n) || css.includes(n), n);
  }
  assert.ok(js.includes("'../themes/cozy/hover-' + f.id + '.png'"), 'Hover-Bilder');
  assert.ok(!js.includes('lampe-rot.png'));
  assert.ok(!js.includes('lampe-klein.png') && !css.includes('lampe-klein.png') && !css.includes('.huelle-lampe'));
  assert.ok(!js.includes('huelle-gross-rueck.png') && !js.includes('platte-vorn.png'));
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

test('home-raum-dom.js: VOD-Vorschau als Canvas 64x36 (16:9, nur noch die Karte)', () => {
  assert.ok(/width\s*=\s*64;/.test(js) && /height\s*=\s*36;/.test(js));
  assert.ok(!/height\s*=\s*18;/.test(js), 'alte 64x18-Liste entfaellt');
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

test('Vorderer Zettel entfaellt (die Karte zeigt die Infos)', () => {
  assert.ok(!/VORN_ZETTEL|zettelPlatz|zettelZeilen/.test(js));
  assert.ok(!/VORN_HUELLE|VORN_PLATTE|SUCH_ZETTEL|ZETTEL_RAND_OBEN/.test(js));
  assert.ok(!/\.vorn-zettel|\.zettel-text|\.vorn\b/.test(css));
  // ZETTEL_RAND und .zettel bleiben (Tafel, Such-Zettel)
  assert.ok(/ZETTEL_RAND\s*=\s*6;/.test(js) && /\.zettel\s*\{/.test(css));
});

test('Doppelklick legt auf: Cover, Ruecken (waehle, dann laden) und Karten-Huelle', () => {
  const pruefe = (f, kopf) => {
    const d = f.indexOf("addEventListener('dblclick'");
    assert.ok(d > -1, kopf);
    const teil = f.slice(d);
    assert.ok(teil.indexOf('waehle()') > -1 && teil.indexOf("ruf(t.regalH, 'laden'") > teil.indexOf('waehle()'), kopf + ': waehle dann laden');
    assert.ok(f.includes("p.addEventListener('click', waehle)"), kopf + ': Einfachklick bleibt waehlen');
  };
  pruefe(rumpf(js, 'function zeichneBrett('), 'Cover');
  pruefe(rumpf(js, 'function baueRuecken('), 'Ruecken');
  const k = rumpf(js, 'function baueKarte(');
  // Der erste Klick nimmt die Platte heraus, die Karte liegt sofort darueber: der
  // Doppelklick landet auf .karte-platz und legt dort die Live-Platte auf.
  // Janis 13.11.: Doppelklick auf Cover 2/3 landete mit dem zweiten Klick auf der Info-Seite
  // der eben geoeffneten Karte (nachgerechnet fuer alle Groessen) und lud nichts. Hat der
  // erste Klick die Karte geoeffnet (karteFrisch), gehoert der zweite zum Doppelklick:
  // er loest nichts auf der Karte aus (Capture, stopPropagation) und der dblclick laedt.
  assert.ok(/t\.karteWurzel\.addEventListener\('click', \(e\) => \{\s*if \(e\.detail > 1 && t\.karteFrisch\) \{ e\.stopPropagation\(\); e\.preventDefault\(\); return; \}\s*t\.karteFrisch = false;\s*\}, true\);/.test(k), 'zweiter Klick geschluckt, jeder einzelne Klick beendet "frisch"');
  assert.ok(/t\.karteWurzel\.addEventListener\('dblclick', \(e\) => \{\s*const frisch = t\.karteFrisch;\s*t\.karteFrisch = false;\s*const s = t\.karteStand;\s*if \(\(frisch \|\| e\.target === t\.karteWurzel\) && s && s\.kanal && s\.modus === 'live' && t\.karteLaden\) t\.karteLaden\(s\.kanal\.login\);/.test(k));
  const zk = rumpf(js, 'function zeichneKarte(');
  const neu = zk.slice(zk.indexOf('if (t.karteLogin !== k.login) {'));
  assert.ok(neu.indexOf('t.karteFrisch = true') > -1 && neu.indexOf('t.karteFrisch = true') < neu.indexOf('} else {'), 'nur beim Herausnehmen einer neuen Platte');
  // Janis 13.11.: ein Klick auf die grosse Huelle (Profilbild) legt die Live-Platte auf;
  // der zweite Klick eines Doppelklicks laedt nicht doppelt (ladeWert sperrt).
  assert.ok(/t\.karteHuelle\.addEventListener\('click'[\s\S]*?s\.modus === 'live'[\s\S]*?t\.karteLaden\(s\.kanal\.login\)/.test(k));
  assert.ok(!/t\.karteHuelle\.addEventListener\('dblclick'/.test(k), 'kein zweiter Weg ueber dblclick');
  assert.ok(/\.karte-vorn\.live \.karte-huelle\s*\{[^}]*cursor:\s*pointer/.test(css), 'Hand nur bei Live-Platten');
  assert.ok(rumpf(js, 'function zeichneKarteVorn(').includes("vornSeite.classList.toggle('live', s.modus === 'live')"));
  // keine zweite Lade-Logik
  assert.ok(!js.includes('submitLoad') && !js.includes('ladeWert'));
});

test('Ruecken-Fach: Fenster per Raum.REGAL.ruecken, Blaettern in ganzen Schritten, Anhebung bleibt im Fach', () => {
  const R = require('../renderer/lib/raum.js');
  const teil = { kante: R.REGAL.ruecken.b, abstand: R.REGAL.ruecken.abstand };
  for (const art of ['live', 'unten']) {
    const f = R.REGAL.faecher[art];
    assert.strictEqual(R.fachFenster(100, 0, f.b, 0, teil).sichtbar, Math.floor(f.b / R.REGAL.ruecken.b), art);
    // Ruecken steht unten im Fach; 1 Bildpixel Anhebung bleibt im Fach
    assert.ok(f.h - R.REGAL.ruecken.h - 1 >= 0, art);
  }
  const b = rumpf(js, 'function fachBlaettern(');
  assert.ok(b.includes('Raum.REGAL.faecher[art].b') && b.includes('kante: Raum.REGAL.ruecken.b'));
  assert.ok(/\.ruecken\.gewaehlt, \.ruecken\.vorschlag\s*\{\s*transform:\s*translateY/.test(css));
});

// --- Regal neu, Task 9b: Karte ersetzt die grosse Huelle --------------------------
test('Karte ersetzt die grosse Huelle: Fenster aus GROSS_FENSTER, Masse aus Raum.kartenMasse, alte Teile weg', () => {
  assert.ok(/GROSS_FENSTER\s*=\s*\{\s*x:\s*32,\s*y:\s*32,\s*b:\s*65,\s*h:\s*65\s*\}/.test(js));
  assert.ok(!/GROSS_LISTE|GROSS_KANTE|grossOffen|\bt\.gross\b|t\.grossHuelle/.test(js));
  assert.ok(!/function baueGross\(|function zeichneFach\(/.test(js));
  assert.ok(!/function zeichneGross\(|function zeichneVodListe\(|function vodsScrollen\(/.test(js));
  // Profilbild in Fenstergroesse (65x65), nicht halbiert
  assert.ok(rumpf(js, 'function zeichneKarte(').includes('profilbild(k, t.karteFenster, GROSS_FENSTER)'));
  const n = rumpf(js, 'function neuAusrichten(');
  assert.ok(!n.includes('Raum.grossKante') && !n.includes("'--n'") && !n.includes("'--vod-k'"));
  assert.ok(n.includes('Raum.kartenMasse(wirt.clientWidth, wirt.clientHeight)'));
  assert.ok(!/\.gross[\s{.,-]/.test(css), 'kein .gross*-CSS mehr');
  assert.ok(!/\.huelle-lampe|\.vorn-zettel|\.zettel-text/.test(css));
});

test('Karte dreht sich um: rotateY, Vorder- und Rueckseite, 400 ms, Animationen aus sofort', () => {
  assert.ok(/\.karte-karte\s*\{[^}]*transform-style:\s*preserve-3d;[^}]*transition:\s*transform 400ms/.test(css));
  assert.ok(/\.karte-karte\.gedreht\s*\{\s*transform:\s*rotateY\(180deg\)/.test(css));
  assert.ok(/\.karte-seite\s*\{[^}]*backface-visibility:\s*hidden/.test(css));
  assert.ok(/\.karte-rueck\s*\{\s*transform:\s*rotateY\(180deg\)/.test(css));
  assert.ok(/\[data-animationen="aus"\][^{]*\{[^}]*transition:\s*none/.test(css));
});

test('Rueckseite der Karte: ↑/↓ scrollen die Liste (home.js fragt zuerst kartenScrollen), keine Seiten', () => {
  assert.ok(!/JE_SEITE|VOD_PLAETZE|'vodSeite'|r\.seite/.test(js), 'Seiten-Logik entfaellt');
  const homeJs = lies('renderer/video/home.js');
  const sch = homeJs.slice(homeJs.indexOf('function schritt('), homeJs.indexOf('\n}', homeJs.indexOf('function schritt(')));
  assert.ok(/seite === 'rueck'[^\n]*HomeRaumDom\.kartenScrollen\(r\)/.test(sch), 'Rueckseite offen -> kartenScrollen');
  assert.ok(sch.indexOf('kartenScrollen') < sch.indexOf('waehle('), 'vor dem Weiterblaettern');
  assert.ok(sch.includes("[...b.brett.map((kanal) => ({ kanal, art: 'brett' })), ...b.live]"), 'Reihe = Brett, dann Live');
  assert.ok(!sch.includes('fachBlaettern'), 'Regal von nahe: ohne Karte wechselt ↑/↓ das Fach');
});

test('Zuruecklegen: Klick daneben und ✕ rufen zuruecklegen; Esc-Kette in home.js', () => {
  const b = rumpf(js, 'function baueKarte(');
  assert.ok(/if \(e\.target === t\.karteWurzel && t\.karteZu\) t\.karteZu\(\)/.test(b), 'Klick daneben');
  assert.ok(rumpf(js, 'function zeichneKarte(').includes("t.karteZu = () => ruf(h, 'zuruecklegen')"));
  const homeJs = lies('renderer/video/home.js');
  const z = rumpfOben(homeJs, 'function zurueckSchritt(');
  const reihe = ['tafelOffen()', "seite === 'rueck'", 'herausgenommen', 'raumPasst()'].map((s) => z.indexOf(s));
  assert.ok(reihe[0] > -1 && reihe.every((x, i) => i === 0 || x > reihe[i - 1]), 'Tafel > Rueckseite > Karte > Raum');
  // Rueckseite einer offline Platte: Esc legt gleich zurueck
  assert.ok(/seite === 'rueck' && herausgenommen && gezeigt\(\)\.modus !== 'offline'/.test(z));
  const k = rumpfOben(homeJs, 'function kannZurueck(');
  for (const s of ['tafelOffen()', 'herausgenommen', 'raumPasst()']) assert.ok(k.includes(s), s);
});

test('Alte gekachelte Rueckseite im Buecherfach ist weg (samt CSS)', () => {
  for (const alt of ['vorn-rueck', 'rueck-text', 'rueck-vod', 'rueck-knopf', 'rueck-links', 'rueck-fuss', 'huelle-rueck.png', 't.rueck']) {
    assert.ok(!js.includes(alt) && !css.includes(alt), alt);
  }
});

test('home-raum-dom.js: Handler-Namen von Regal und Karte', () => {
  for (const h of ['laden', 'stern', 'umdrehen', 'zuruecklegen', 'vod', 'mehrVods', 'waehle']) {
    assert.ok(js.includes("'" + h + "'"), h);
  }
  for (const alt of ["'rueckseiteZu'", "'vods'", "'mehr'", 'zeichneBuehne', 'zeichneStaender', 'baueFachPlatte']) {
    assert.ok(!js.includes(alt), alt);
  }
});

test('home-raum-dom.js: Mausrad blaettert nicht bei offener Tafel', () => {
  const i = js.indexOf("'wheel'");
  assert.ok(i > -1);
  assert.ok(js.slice(i, i + 300).includes('tafelOffen()'));
});

test('home-raum-dom.js: neuer Fach-Inhalt holt die gewaehlte Platte in Sicht', () => {
  const z = rumpf(js, 'function zeichneFachNeu(');
  assert.ok(/const umgebaut = fach\.schluessel !== schluessel/.test(z));
  assert.ok(/neu = ziel >= 0 && \(zielLogin !== fach\.gewaehlt \|\| umgebaut\)/.test(z));
});

test('home-raum-dom.js: Fokus im Fach setzt scrollLeft zurueck und blaettert per fachFenster', () => {
  const i = js.indexOf("'focusin'");
  assert.ok(i > -1);
  const teil = js.slice(i, i + 500);
  assert.ok(teil.includes('scrollLeft = 0') && teil.includes('Raum.fachFenster') && teil.includes('zeigeFachNeu('));
});

test('home-raum-dom.js: altes Fach (Raum.FACH) ist ganz weg', () => {
  assert.ok(!js.includes('Raum.FACH'));
  assert.ok(!/function baueGross\(|function zeichneFach\(/.test(js));
  assert.ok(!/const faecher = \{|function zeigeFach\(|function baueRegal\(\)/.test(js));
  // nur die alte Klasse .fach (Regal von nahe bringt .fach-hinweis / .fach-fahrt)
  assert.ok(!/\.fach(?![-\w])|\.fach-reihe/.test(css));
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
  for (const id of ['home-close', 'home-kanaele', 'home-such-zeile', 'home-suche',
    'refresh-btn', 'home-hinweis', 'auth-bar', 'home-version']) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
  // "Alle VODs" entfaellt (Regal neu, Task 9b)
  for (const id of ['home-title', 'home-vod-view', 'vod-list']) assert.ok(!html.includes('id="' + id + '"'), id);
  assert.ok(!html.includes('Alle VODs'));
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
  for (const n of ['beiFlaeche', 'beiSchliessen']) assert.ok(new RegExp('\\b' + n + '\\b').test(initOpt), n);
  assert.ok(!homeJs.includes('beiZurueck') && !js.includes('beiZurueck'), 'Zurueck laeuft ueber das Schild (Task 9e)');
  assert.ok(!initOpt.includes('showKanaeleView'));
  assert.ok(homeJs.includes('Raum.passtAlsRaum('));
  assert.ok(/mindestMs:\s*7900/.test(homeJs), 'Auflegen neu: Summe ABLAUF_MS');
  assert.ok(/HomeRaumDom\.zeigeAblauf\([^)]*\(\)\s*=>\s*laufwerk\.ueberspringen\(\)\)/.test(homeJs));
  assert.ok(homeJs.includes('HomeRaumDom.versteckeAblauf()'));
  // Regal von nahe: ←/→ blaettert in Fach 2/3
  assert.ok(homeJs.includes("HomeRaumDom.fachBlaettern(HomeRaumDom.nahFach() === 1 ? 'live' : 'unten'"));
  assert.ok(!homeJs.includes("fachBlaettern('offline'"));
  assert.ok(homeJs.includes('HomeRaumDom.setzeTv('));
  assert.ok(homeJs.includes('HomeRaumDom.neuAusrichten()'));
  assert.ok(/addEventListener\('resize'/.test(homeJs));
  // ✕ nur ueber init (sonst feuert alles doppelt)
  assert.ok(!/\$homeClose\.addEventListener/.test(homeJs));
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
  // VOD auf der Karte laedt ueber ladeWert (kein eigenes submitLoad + closeHome)
  const h = homeJs.slice(homeJs.indexOf('const karteHandler'), homeJs.indexOf('};', homeJs.indexOf('const karteHandler')));
  assert.ok(/\bvod: \(id\) => ladeWert\(id, /.test(h));
  assert.strictEqual((homeJs.match(/^(?!\s*\/\/).*twitchDual\.submitLoad\(/gm) || []).length, 1);
});

test('video.js: window.laeuftEtwas, home.js fragt nur diese Auskunft', () => {
  assert.ok(videoJs.includes('window.laeuftEtwas = () => infoQuelle ? {'));
  assert.ok(videoJs.includes("login: infoQuelle.mode === 'live' ? infoQuelle.wert : null,"));
  // VOD: Vorschaubild aus den Stream-Infos (Fernseher im Home)
  assert.ok(videoJs.includes("vorschau: infoQuelle.mode === 'vod' && info && info.art === 'vod' ? (info.vorschau || null) : null,"));
  assert.ok(homeJs.includes('HomeBuehne.tvVorschau(l, Date.now())'));
  assert.ok(videoJs.indexOf('window.laeuftEtwas') > videoJs.indexOf('let infoQuelle'));
  assert.ok(homeJs.includes('laeuftEtwas()'));
  assert.ok(!homeJs.includes("contains('onair')"));
});

test('home.js: Klick im Raum, Ansichten und Tasten', () => {
  for (const f of ["'regal'", "'fernseher'", "'plattenspieler'", "'bild'", "'lampe'"]) assert.ok(homeJs.includes(f), f);
  assert.ok(homeJs.includes("zeigeSchild('Nichts geladen')"));
  assert.ok(homeJs.includes("zeigeTafel('konto'") && homeJs.includes("zeigeTafel('licht'"));
  assert.ok(!homeJs.includes("zeigeTafel('vods'"));
  assert.ok(!/TAFEL_TITEL\s*=\s*\{[^}]*vods/.test(js) && !js.includes("art === 'vods'"));
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
  for (const bleibt of ['#home {', '#auth-bar', '.empty', '#home-hinweis', '#home-version', '.hidden']) {
    assert.ok(homeCss.includes(bleibt), bleibt);
  }
  // "Alle VODs" entfaellt samt CSS
  assert.ok(!homeCss.includes('#home-vod-view') && !/\.vod\b/.test(homeCss) && !homeCss.includes('#home-title'));
});

// --- Regal neu, Task 9b: home.js schaltet um --------------------------------------
const homeRumpf = (kopf) => {
  const s = homeJs.indexOf(kopf);
  return s < 0 ? '' : homeJs.slice(s, homeJs.indexOf('\n}', s));
};

test('home.js nutzt keine Buehne und kein "Alle VODs" mehr', () => {
  assert.ok(!homeJs.includes('createBuehne'));
  assert.ok(!/openVods|buildVodCard|channelVods\([^)]*100\)/.test(homeJs));
  for (const alt of ['showVodView', 'showKanaeleView', 'emptyMsg', '$vodView', '$vodList', '$homeTitle', 'VODS_MAX',
    'vodSeite', 'buehnenHandler', 'staenderHandler', 'wendeSucheAn', 'function reihe(', 'mitStern',
    'oeffnenAusstehend', 'offlineAnsicht', 'function loginVon(', 'zeichneBuehne', 'zeichneStaender', 'staenderEintraege',
    'huellenText', 'vodsScrollen']) {
    assert.ok(!homeJs.includes(alt), alt);
  }
  assert.ok(!/\brueckseite\b/.test(homeJs), 'rueckseite entfaellt (vods.login)');
});

test('home.js: Zustand herausgenommen/seite/vods, gezeigt() nie null', () => {
  assert.ok(/let herausgenommen = null;/.test(homeJs));
  assert.ok(/let seite = 'vorn';/.test(homeJs));
  assert.ok(/let vods = null;/.test(homeJs));
  const g = homeRumpf('function gezeigt(');
  assert.ok(g.includes("HomeBuehne.herausgenommenStand(herausgenommen, kanaele) || { kanal: null, modus: 'live' }"));
  const b = homeRumpf('function belegung(');
  assert.ok(b.includes('HomeBuehne.regalBelegung({'));
  assert.ok(b.includes('nadel: nadel()') && b.includes('suche: !!nadel()'));
  assert.ok(b.includes('plaetze: Raum.fachFenster(99, -1, Raum.REGAL.brett.b, 0).sichtbar'));
  assert.ok(!/nadel: nadel[,\s}]/.test(homeJs), 'nadel ist eine Funktion: immer nadel()');
  // der vod-Handler liest den Kanal der Karte, nicht gezeigt()
  assert.ok(!homeJs.includes('gezeigt().kanal'));
});

test('home.js: openHome setzt herausgenommen = null und vods = null', () => {
  const o = homeRumpf('function openHome(');
  assert.ok(o.includes('herausgenommen = null;') && o.includes('vods = null;'));
});

test('home.js: waehle - twitch+live laedt sofort, offline zeigt die Rueckseite und laedt VODs', () => {
  const w = homeRumpf('function waehle(');
  assert.ok(/art === 'twitch' && k\.live\) \{?\s*ladeWert\(k\.login, k\)/.test(w), 'twitch+live -> ladeWert');
  assert.ok(w.includes('herausgenommen = { login: k.login, art, kanal: k }'));
  assert.ok(w.includes("seite = k.live ? 'vorn' : 'rueck'"));
  assert.ok(/if \(seite === 'rueck'\) ladeVods\(/.test(w), 'offline laedt die VODs sofort');
});

test('home.js: VODs laden mit Laufnummer, Nachladen nur einmal gleichzeitig', () => {
  const l = homeRumpf('function ladeVods(');
  assert.ok(l.includes('window.twitchDual.channelVods(login, limit)'));
  assert.ok(/nr !== vodsNr|vodsNr !== nr/.test(l), 'verspaetete Antworten verworfen');
  assert.ok(l.includes('HomeBuehne.vodsZusammen(') && l.includes('HomeBuehne.vodLimit(') && l.includes('HomeBuehne.laufendesVod('));
  const m = homeRumpf('function mehrVods(');
  assert.ok(/!vods \|\| vods\.laedtNach \|\| !vods\.weitere/.test(m));
  const setzen = m.indexOf('vods.laedtNach = true');
  assert.ok(setzen > -1 && setzen < m.indexOf('ladeVods('), 'laedtNach synchron vor der Anfrage');
});

test('home.js: Enter - vordere aus herausgenommen (live) oder bester Treffer', () => {
  const v = homeRumpf('function vordere(');
  assert.ok(v.includes("g.modus === 'live'") && v.includes('herausgenommen'));
  assert.ok(v.includes('besterTreffer()'));
  const b = homeRumpf('function besterTreffer(');
  assert.ok(b.includes('HomeListe.besterTreffer([...b.brett, ...b.live.map((e) => e.kanal)], nadel())'));
  assert.ok(/vordere: vordere\(\)/.test(homeJs), 'enterZiel bekommt vordere()');
});

test('home.js: Refresh haengt nicht mehr an $kanaeleView', () => {
  assert.ok(!homeJs.includes('$kanaeleView'));
  assert.ok(/setInterval\(\(\) => \{\s*if \(!\$home\.classList\.contains\('hidden'\)\) ladeKanaele\(\);/.test(homeJs));
});

test('home.js: Suche tippen und Anmelden/Abmelden legen die Karte zurueck', () => {
  assert.ok(homeRumpf('function sucheGetippt(').includes('legeZurueck()'));
  assert.ok(homeRumpf('function renderAuth(').includes('legeZurueck()'));
  const z = homeRumpf('function legeZurueck(');
  assert.ok(z.includes('herausgenommen = null') && z.includes('vods = null'));
});

test('home.js: renderHome zeichnet Regal, Karte und Fernseher', () => {
  const r = homeRumpf('function renderHome(');
  assert.ok(r.includes('const b = belegung();') && r.includes('HomeRaumDom.zeichneRegal(b, '));
  assert.ok(r.includes('brettText(b)') && r.includes('besterTreffer(b)'));
  assert.ok(r.includes('HomeRaumDom.zeichneKarte('));
  assert.ok(r.includes('zeichneTv()'));
  assert.ok(homeJs.includes('function brettText('));
  assert.ok(homeJs.includes('Kein Live-Treffer – unten in den Fächern'));
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

// --- Auflegen neu (Plan 2026-11-13-auflegen-neu, Task 2) ---
test('Ablauf: Abschnitte 500/1500/1200/1500/700/500/2000, Summe 7900 = mindestMs in home.js', () => {
  const m = ablaufMs();
  assert.deepStrictEqual(m, { raum: 500, spieler: 1500, auflegen: 1200, zurueck: 1500, an: 700, zeigen: 500, tv: 2000 });
  const summe = Object.values(m).reduce((a, b) => a + b, 0);
  assert.strictEqual(summe, 7900);
  assert.ok(new RegExp('mindestMs:\\s*' + summe + '\\b').test(homeJs));
});

test('zeigeAblauf: raum -> spieler -> dreht -> zurueck (ohne spieler) -> an -> tv zu den Abschnittsgrenzen', () => {
  const r = rumpf(js, 'function zeigeAblauf(');
  assert.ok(r.length > 0);
  const reihe = ["'ablauf-raum'", "'ablauf-spieler'", "'ablauf-dreht'", "'ablauf-zurueck'", "'ablauf-an'", "'ablauf-tv'"].map((k) => r.indexOf(k));
  assert.ok(reihe[0] > -1 && reihe.every((x, i) => i === 0 || x > reihe[i - 1]), 'Reihenfolge');
  assert.ok(r.includes('abschnitt(m.raum, ()'), 'spieler');
  assert.ok(r.includes('abschnitt(m.raum + m.spieler, ()'), 'dreht');
  assert.ok(r.includes('abschnitt(m.raum + m.spieler + m.auflegen, ()'), 'zurueck');
  assert.ok(r.includes('abschnitt(m.raum + m.spieler + m.auflegen + m.zurueck, ()'), 'an');
  assert.ok(r.includes('abschnitt(m.raum + m.spieler + m.auflegen + m.zurueck + m.an + m.zeigen, ()'), 'tv');
  const zur = r.slice(r.indexOf("'ablauf-zurueck'") - 120, r.indexOf("'ablauf-zurueck'") + 80);
  assert.ok(zur.includes(".remove('ablauf-spieler')"), 'beim Zurueck faellt spieler weg');
  assert.ok(/function abschnitt\(ms, f\) \{ ablaufTimer\.push\(setTimeout\(f, ms\)\); \}/.test(js));
  assert.ok(r.includes('aus(t.dreht, false)'), 'Sprite an');
  assert.strictEqual((r.match(/neuAusrichten\(\)/g) || []).length, 3, 'Kamera bei spieler, zurueck und tv');
});

test('CSS: Kamera-Uebergaenge je Abschnitt, tv-Regel zuletzt', () => {
  assert.ok(/#home\.im-ablauf #raum-ebene\s*\{[^}]*transition:\s*opacity 500ms/.test(css));
  const sp = css.search(/#home\.ablauf-spieler #raum-ebene \.raum-bildebene\s*\{[^}]*transition:\s*transform 1500ms ease-in-out/);
  const zu = css.search(/#home\.ablauf-zurueck #raum-ebene \.raum-bildebene\s*\{[^}]*transition:\s*transform 1500ms ease-in-out/);
  const tv = css.search(/#home\.ablauf-tv #raum-ebene \.raum-bildebene\s*\{[^}]*transition:\s*transform 2000ms ease-in/);
  assert.ok(sp > -1 && zu > -1 && tv > sp && tv > zu, 'tv gewinnt (gleiche Spezifitaet, spaeter)');
  assert.ok(!css.includes('ablauf-zoom') && !js.includes('ablauf-zoom'), 'alter Abschnitt weg');
  assert.ok(!css.includes('2500ms') && !css.includes('ablauf-flug') && !css.includes('ablauf-platte'));
});

test('CSS: Fernseher im Ablauf erst aus, flackert dann an (harte Schritte)', () => {
  assert.ok(/#home\.im-ablauf:not\(\.ablauf-an\):not\(\.ablauf-tv\) \.raum-tv\s*\{\s*visibility:\s*hidden;\s*\}/.test(css));
  assert.ok(/#home\.ablauf-an \.raum-tv\s*\{\s*animation:\s*raum-tv-an 700ms steps\(1\) 1 both;\s*\}/.test(css));
  const k = /@keyframes raum-tv-an\s*\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(k, 'keyframes');
  assert.ok((k[1].match(/visibility:\s*hidden/g) || []).length >= 2, 'mindestens zweimal aus');
  assert.ok(/100%\s*\{\s*visibility:\s*visible;\s*\}/.test(k[1]), 'am Ende an');
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

test('Kamera: lageSpieler im Abschnitt spieler, lageTv im Abschnitt tv, sonst Ruhelage', () => {
  const r = rumpf(js, 'function kameraZiel(');
  assert.ok(r.includes("k.contains('ablauf-tv')") && r.includes('Raum.lageTv(wirt.clientWidth, wirt.clientHeight)'));
  assert.ok(r.includes("k.contains('ablauf-spieler')") && r.includes('Raum.lageSpieler(wirt.clientWidth, wirt.clientHeight)'));
  assert.ok(r.indexOf("'ablauf-tv'") < r.indexOf("'ablauf-spieler'"), 'tv geht vor');
  assert.ok(!js.includes('Raum.kameraZiel'), 'ganzzahliger Zoom entfaellt');
  // Groessenwechsel im Ablauf: neuAusrichten nimmt die Lage des laufenden Abschnitts
  assert.ok(rumpf(js, 'function neuAusrichten(').includes('const kamera = kameraZiel();'));
});

test('Karte ist waehrend des Ablaufs ausgeblendet (die alte grosse Huelle gibt es nicht mehr)', () => {
  assert.ok(/#home\.im-ablauf \.karte-platz\s*\{[^}]*display:\s*none/.test(css));
  assert.ok(!css.includes('.gross-platz'));
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
  for (const k of ["'im-ablauf'", "'ablauf-raum'", "'ablauf-spieler'", "'ablauf-dreht'", "'ablauf-zurueck'", "'ablauf-an'", "'ablauf-tv'"]) assert.ok(r.includes(k), k);
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
  assert.ok(u.indexOf('plattenspielerLaeuft') < u.indexOf('if (!knopf || !el) return;'), 'vor dem fruehen Ausstieg');
});

test('Holzwand hinter dem Raum: eigene Skalierung mit RAUM_RAHMEN, Regal bleibt (Janis 11.11.: C)', () => {
  const r = rumpf(js, 'function baueRaum(');
  assert.ok(r.includes("bildEl('../themes/cozy/raum-wand.png', 'raum-wand')"));
  assert.ok(r.indexOf("'raum-wand'") > r.indexOf('t.raumBild'), 'ueber dem Raum-Bild (deckt dessen schwarzen Rand)');
  assert.ok(r.indexOf("'raum-wand'") < r.indexOf('RaumLebenDom.baue'), 'unter dem Leben');
  assert.ok(/\.raum-wand\s*\{[^}]*left:\s*-80px[^}]*width:\s*504px[^}]*height:\s*192px/.test(css));
  const n = rumpf(js, 'function neuAusrichten(');
  assert.ok(n.includes('skalRaum = Raum.skalierung(wirt.clientWidth, wirt.clientHeight, Raum.RAUM_RAHMEN)'));
  assert.ok(/const s = skalRaum;/.test(n), 'Raum-Ebene mit skalRaum');
  assert.ok(n.includes('richteRegalNeuAus(wirt.clientWidth, wirt.clientHeight)'), 'Regal mit eigener Skalierung');
  assert.ok(rumpf(js, 'function baueRaum(').includes('Raum.zuBild(e.clientX - box.left, e.clientY - box.top, skalRaum)'), 'Klicks im Raum');
});

test('Schild links ist der Weg ins Home: Klick oeffnet, im Home ein Schritt zurueck (wie Esc), sonst zum Stream', () => {
  const homeJs = lies('renderer/video/home.js');
  assert.ok(homeJs.includes("const $homeBtn = document.getElementById('onair-bar')"));
  const i = homeJs.indexOf("$homeBtn.addEventListener('click'");
  assert.ok(i > -1);
  const klick = homeJs.slice(i, homeJs.indexOf('});', i));
  assert.ok(/if \(\$home\.classList\.contains\('hidden'\)\) \{ openHome\(\); return; \}/.test(klick));
  assert.ok(klick.includes('escZaehler += 1') && klick.includes('if (!zurueckSchritt()) closeHomeResume();'), 'gleiche Kette wie Esc');
  const video = lies('renderer/video/video.js');
  const u = rumpf(video, 'function updateOnAir(');
  assert.ok(u.includes("classList.toggle('leer', !onAirMode)"), 'ohne Quelle leer und nicht klickbar');
  assert.ok(u.includes("schild-aus.png"));
});

test('Ohne Stream/VOD bleibt Home offen: kein ☰ und kein ✕, Esc schliesst nicht (Janis 11.11.)', () => {
  const homeJs = lies('renderer/video/home.js');
  const k = rumpfOben(homeJs, 'function kannSchliessen(');
  assert.ok(k.includes('window.laeuftEtwas && window.laeuftEtwas()'));
  // closeHomeResume ist der einzige Schliess-Weg zurueck zur Quelle (☰, ✕, Esc, Fernseher)
  const c = rumpfOben(homeJs, 'function closeHomeResume(');
  assert.ok(/^\s*if \(!kannSchliessen\(\)\) return;/m.test(c.split('\n').slice(1, 6).join('\n')), 'gleich am Anfang');
  const z = rumpfOben(homeJs, 'function zeigeSchliessKnoepfe(');
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

// Abschlusspruefung 13.11.: renderHome (60-s-Timer, Punkte, VODs, Suche) darf das neue
// Bild im Ablauf nicht mit der alten Quelle ueberschreiben; nach einem Fehler zeigt der
// Fernseher wieder, was laeuft.
test('zeichneTv ruht waehrend des Auflegens, der Fehlerweg setzt den Fernseher zurueck', () => {
  const z = rumpfOben(homeJs, 'function zeichneTv(');
  assert.ok(/^\s*if \(ladenLaeuft \|\| laufwerk\.laeuft\) return;/m.test(z), 'nichts tun, solange aufgelegt wird');
  const lw = homeJs.indexOf('async function ladeWert(');
  const r = homeJs.slice(lw, homeJs.indexOf('\n}', lw));
  const fehler = r.slice(r.indexOf("$hinweis.textContent = (r && r.error) || 'Laden fehlgeschlagen'"));
  assert.ok(fehler.includes('zeichneTv();'), 'Fehler: Fernseher zurueck auf das Laufende');
});

test('Laufschrift mit dem Kanalnamen vorne am Plattenspieler (Janis 13.11.)', () => {
  const b = rumpf(js, 'function baueRaum(');
  assert.ok(b.includes("t.lauf = el('div', 'raum-laufschrift raum-aus')"));
  assert.ok(b.includes("t.laufText = el('span', 'laufschrift-text')"));
  assert.ok(b.includes("'matrix(' + Raum.laufMatrix().join(', ') + ')'"), 'schraeg wie die Front');
  assert.ok(b.indexOf('r.bild.appendChild(t.lauf)') > b.indexOf('r.bild.appendChild(t.dreht)'), 'in der skalierten Bildebene, ueber der Platte');
  assert.ok(!/tvName|zeigeTvName|raum-tv-name/.test(js + css), 'Name auf dem TV entfaellt');
  const s = rumpf(js, 'function setzeTv(');
  assert.ok(s.indexOf('zeigeLaufschrift(url ? o : null)') > -1 && s.indexOf('zeigeLaufschrift(url ? o : null)') < s.indexOf('url === tvVorschau'), 'Name auch bei gleichem Bild');
  const z = rumpf(js, 'function zeigeLaufschrift(');
  assert.ok(!z.includes('lauf-punkt') && !css.includes('.lauf-punkt'), 'ohne roten Punkt (Janis 13.11.)');
  assert.ok(z.includes('for (let i = 0; i < 2; i++)'), 'zweimal hintereinander: nahtlose Schleife');
  assert.ok(z.includes('aus(t.lauf, !text)'));
  // CSS: Feld 18x4 Bildpixel (Raum.LAUF_FELD), Text laeuft endlos von rechts nach links (-50 % = eine Kopie)
  assert.ok(/\.raum-laufschrift\s*\{[^}]*width:\s*18px[^}]*height:\s*4px[^}]*transform-origin:\s*0 0[^}]*overflow:\s*hidden/.test(css));
  assert.ok(/\.laufschrift-text\s*\{[^}]*animation:\s*raum-laufschrift \d+ms linear infinite/.test(css));
  assert.ok(/@keyframes raum-laufschrift\s*\{\s*to\s*\{\s*transform:\s*translateX\(-50%\);\s*\}\s*\}/.test(css));
  // Auflegen: erst sichtbar, wenn die Platte aufgelegt ist
  assert.ok(/#home\.im-ablauf:not\(\.ablauf-dreht\) \.raum-laufschrift\s*\{\s*visibility:\s*hidden;\s*\}/.test(css));
  // home.js: Name beim Auflegen und im Ruhezustand
  const lw = homeJs.indexOf('async function ladeWert(');
  const r = homeJs.slice(lw, homeJs.indexOf('\n}', lw));
  assert.ok(r.includes('HomeRaumDom.setzeTv(tvBild ? { vorschauUrl: tvBild, name: tvName, live: istLive } : null)'));
  const t = rumpfOben(homeJs, 'function zeichneTv(');
  assert.ok(t.includes("{ vorschauUrl: url, name: aufgelegt(), live: l.mode === 'live' }"));
});

test('Fernseher-Masse kommen aus raum.js, nicht als Zahlen in home-raum-dom.js', () => {
  assert.ok(!/x:\s*206,\s*y:\s*52/.test(js));
});

test('home.js: Auflegen legt das neue Bild in den (noch verborgenen) Fernseher - live Vorschau, VOD Vorschaubild, sonst aus', () => {
  const lw = homeJs.indexOf('async function ladeWert(');
  const r = homeJs.slice(lw, homeJs.indexOf('\n}', lw));
  const tv = r.indexOf('HomeRaumDom.setzeTv(');
  assert.ok(tv > -1, 'setzeTv in ladeWert');
  assert.ok(tv < r.indexOf('HomeRaumDom.zeigeAblauf('), 'vor dem Ablauf (CSS verbirgt es bis ablauf-an)');
  assert.ok(r.includes('HomeBuehne.vorschauUrl(kanal.login, Date.now())'));
  assert.ok(/wert === kanal\.login/.test(r) && /!kanal\.offline/.test(r));
  assert.ok(r.includes('vodVorschau(wert)'), 'VOD: Vorschaubild aus der Liste');
  const v = rumpfOben(homeJs, 'function vodVorschau(');
  assert.ok(v.includes('vods && vods.liste') && v.includes('v.id === id') && /\.thumb \|\| null/.test(v));
  assert.ok(/\{ vorschauUrl: \w+[^}]*\} : null\)/.test(r), 'ohne Bild: Fernseher aus (null)');
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
test('Doppelklick: Karte und Ablauf ignorieren den zweiten Klick (detail > 1)', () => {
  const g = rumpf(js, 'function baueKarte(');
  const gk = g.indexOf("addEventListener('click'");
  assert.ok(gk >= 0 && g.indexOf('e.detail > 1', gk) > gk && g.indexOf('e.detail > 1', gk) < g.indexOf('t.karteZu()', gk));
  // zuruecklegen ist der Handler hinter t.karteZu
  assert.ok(rumpf(js, 'function zeichneKarte(').includes("ruf(h, 'zuruecklegen')"));
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

// --- Regal neu, Task 8: Karte (grosse Platte vorn, Rueckseite mit nachladender VOD-Liste) ---
test('Karte: zeichneKarte, kartenScrollen, karteOffen stehen in der Schnittstelle', () => {
  const r = schnittstelle();
  for (const n of ['zeichneKarte', 'kartenScrollen', 'karteOffen']) assert.ok(new RegExp('\\b' + n + '\\b').test(r), n);
});

test('Karte: baueKarte nutzt huelle-gross-vorn, karte.png und karte-rueck.png; init ruft baueKarte; ein .karte-platz', () => {
  const b = rumpf(js, 'function baueKarte(');
  assert.ok(b.length > 0);
  assert.ok(b.includes("'../themes/cozy/huelle-gross-vorn.png'"));
  assert.ok(js.includes('karte.png') || css.includes('karte.png'));
  assert.ok(js.includes('karte-rueck.png') || css.includes('karte-rueck.png'));
  assert.ok(rumpf(js, 'function init(').includes('baueKarte('));
  assert.strictEqual((js.match(/'karte-platz[ ']/g) || []).length, 1);
});

test('Karte: neuAusrichten setzt die Kartenmasse, die alten Zeilen der grossen Huelle sind weg', () => {
  const n = rumpf(js, 'function neuAusrichten(');
  assert.ok(n.includes('Raum.kartenMasse(wirt.clientWidth, wirt.clientHeight)'));
  for (const v of ['--karte-b', '--karte-h', '--karte-n', '--karte-schrift', '--karte-schrift-klein', '--karte-vod-k']) {
    assert.ok(n.includes("'" + v + "'"), v);
  }
  assert.ok(!n.includes('Raum.grossKante('));
});

test('Karte: zeichneKarte kennt alle Handler (laden, stern, umdrehen, zuruecklegen, vod, mehrVods)', () => {
  const z = rumpf(js, 'function zeichneKarte(');
  assert.ok(z.length > 0);
  for (const h of ['laden', 'stern', 'umdrehen', 'zuruecklegen', 'vod', 'mehrVods']) assert.ok(z.includes("'" + h + "'"), h);
  assert.ok(/stand\.seite === 'rueck'/.test(z));
  // "Vorderseite" auf der Rueckseite auch fuer markierte Platten (nur offline nicht)
  assert.ok(/if \(stand\.modus !== 'offline'\) \{\s*const vorn = knopf\('karte-knopf', 'Vorderseite'/.test(z));
});

test('Karte: Vorschau-Canvas 64x36 links in jeder Zeile, Zeilen nur ueber eine Funktion (auch beim Anhaengen)', () => {
  const v = rumpf(js, 'function zeichneKarteVods(');
  assert.ok(v.includes('const anhaengen ='));
  assert.ok(v.includes('laufend'));
  const z = rumpf(js, 'function karteVodZeile(');
  assert.ok(/c\.width = 64;/.test(z) && /c\.height = 36;/.test(z));
  assert.ok(z.includes('v.game') && z.includes('vodBild(v.thumb, c)'));
  assert.ok(z.indexOf('b.append(c, ') > -1, 'Vorschau vor dem Text');
  // beide Wege (neu bauen, anhaengen) bauen Zeilen nur mit karteVodZeile
  assert.ok((v.match(/karteVodZeile\(/g) || []).length >= 2);
  assert.ok(!/createElement\('canvas'\)/.test(v));
  const a = v.indexOf('if (anhaengen)');
  const e = v.indexOf('} else {', a);
  assert.ok(a > -1 && e > a);
  const teil = v.slice(a, e);
  assert.ok(!teil.includes('replaceChildren') && !teil.includes('scrollTop = 0'), 'anhaengen baut nicht neu');
  assert.ok(v.slice(e).includes('replaceChildren') && v.slice(e).includes('scrollTop = 0'), 'neu bauen');
  // Zuschnitt 16:9 aus der Canvas-Form, nicht fest 32:9
  assert.ok(rumpf(js, 'function vodBild(').includes('c.height / c.width'));
});

test('Karte: Nachladen per scroll an .karte-vods (weitere, laedtNach, 2 Zeilenhoehen vor dem Ende)', () => {
  const s = rumpf(js, 'function karteNachladen(');
  assert.ok(s.includes('scrollHeight') && s.includes('scrollTop') && s.includes('clientHeight'));
  assert.ok(s.includes('weitere') && s.includes('laedtNach') && s.includes('2 *') && s.includes("'mehrVods'") === false);
  const b = rumpf(js, 'function baueKarte(');
  assert.ok(/t\.karteVods\.addEventListener\('scroll', karteNachladen\)/.test(b));
  // kurze Liste ohne Scrollleiste laedt trotzdem weiter
  assert.ok(rumpf(js, 'function zeichneKarteVods(').includes('karteNachladen'));
  const k = rumpf(js, 'function kartenScrollen(');
  assert.ok(k.includes('karteOffen()') && k.includes('t.karteVods.scrollBy('));
  assert.ok(rumpf(js, 'function karteOffen(').includes("classList.contains('raum-aus')"));
  assert.ok(!rumpf(js, 'function karteOffen(').includes('gedreht'), 'karteOffen = herausgenommen (vorn oder hinten)');
  assert.ok(k.includes("classList.contains('gedreht')"), 'nur die Rueckseite scrollt');
});

test('Karte: wechselt nur das laufende VOD, ziehen die vorhandenen Zeilen die Markierung nach', () => {
  const v = rumpf(js, 'function zeichneKarteVods(');
  const a = v.indexOf('if (anhaengen)');
  const teil = v.slice(a, v.indexOf('} else {', a));
  assert.ok(/kv\.laufend !== laufend/.test(teil) && teil.includes('karteSetzeLaufend(laufend)'));
  assert.ok(/t\.karteKv = \{[^}]*laufend/.test(v), 'laufend im Anhaenge-Stand');
  const s = rumpf(js, 'function karteSetzeLaufend(');
  assert.ok(s.includes("toggle('laeuft'") && s.includes('b.dataset.id') && s.includes('karteVodInfo('));
});

test('Karte: Huelle fuellt die linke Haelfte (Bild 128/111 skaliert, Fenster mit dunkler Flaeche), ✕ skaliert mit --karte-n', () => {
  const regel = (sel) => (new RegExp('(^|\\n)' + sel.replace(/\./g, '\\.') + '\\s*\\{([^}]*)\\}').exec(css) || [])[2] || '';
  assert.ok(regel('.karte-huelle').includes('--karte-s: calc(var(--karte-n, 2) * 128 / 111)'));
  assert.ok(/left:\s*calc\(-9px \* var\(--karte-s\)\)/.test(regel('.karte-bild')));
  assert.ok(/background:\s*var\(--zettel-tinte\)/.test(regel('.karte-fenster')), 'Fenster nie durchsichtig');
  const zu = regel('.karte-zu');
  assert.ok(/width:\s*calc\(16px \* var\(--karte-n, 2\)\)/.test(zu) && /right:\s*calc\(2px \* var\(--karte-n, 2\)\)/.test(zu));
  assert.ok(!/right:\s*-/.test(zu), 'innerhalb der Karte');
  // Platz fuer das ✕: Kopf der Rueckseite und erste Tafelzeilen enden davor (Rand 10n + Platz 10n > 2n + 16n)
  assert.ok(/--karte-zu-platz:\s*calc\(10px \* var\(--karte-n, 2\)\)/.test(regel('.karte')));
  assert.ok(/padding-right:\s*var\(--karte-zu-platz\)/.test(regel('.karte-kopf')));
  assert.ok(/\.karte-info > \.karte-kopfzeile\s*\{[^}]*padding-right:\s*var\(--karte-zu-platz\)/.test(css));
  assert.ok(/\.karte-platz\s*\{[^}]*background:\s*rgb\(18 5 5 \/ \.55\)/.test(css), 'gleiche Abdunklung wie .gross-platz');
});

// Janis 13.11.: Info-Seite neu ohne neue Bilder - Raum Klar mit geordneten Groessen,
// Vorschaubild oben (Aufteilung 1), echte Knoepfe aus knopf.png statt Links.
test('Karte vorn: Kopfzeile (Status + Name gross), Live-Vorschau oben, Rest klein, Knoepfe unten', () => {
  const v = rumpf(js, 'function zeichneKarteVorn(');
  const p = (s) => { const i = v.indexOf(s); assert.ok(i > -1, s); return i; };
  assert.ok(p("el('div', 'karte-kopfzeile')") < p('karteVorschau(k, s.modus)'), 'Kopfzeile vor dem Bild');
  assert.ok(p('karteVorschau(k, s.modus)') < p("'karte-titel'"), 'Bild vor dem Titel');
  assert.ok(p("'karte-titel'") < p("el('div', 'karte-knoepfe')"));
  // Zuschauer und Laufzeit in einer Zeile, Punkte darunter
  assert.ok(v.includes("[k.viewersLabel ? k.viewersLabel + ' Zuschauer' : '', lauf ? 'seit ' + lauf : '']"));
  const b = rumpf(js, 'function karteVorschau(');
  assert.ok(b.includes("modus !== 'live'") && b.includes('return null'), 'nur live');
  assert.ok(b.includes('HomeBuehne.vorschauUrl(k.login, Date.now())'));
  assert.ok(b.includes('t.karteBild') && b.includes('login === k.login'), 'gleiche Platte: Bild behalten (kein Flackern)');
  assert.ok(b.includes('vodBild(url, c)'));
  // Live-Punkt rot und blinkend (Janis 13.11.), eigener Span vor "LIVE"
  assert.ok(v.includes("st.append(el('span', 'karte-live-punkt', '●'), ' LIVE')"));
  assert.ok(/\.karte-live-punkt\s*\{[^}]*color:\s*rgb\(220 40 32\)[^}]*animation:\s*karte-blinken 1s steps\(1\) infinite/.test(css), 'gleiches Rot wie der Live-Punkt im Regal');
  assert.ok(/@keyframes karte-blinken\s*\{\s*50%\s*\{\s*opacity:\s*0;\s*\}\s*\}/.test(css));
});

test('Karte vorn CSS: Name gross, Rest klein, Bild fuellt den Platz bis 16:9, Knoepfe aus knopf.png', () => {
  const regel = (sel) => (new RegExp('(^|\\n)' + sel.replace(/\./g, '\\.').replace(/>/g, '\\>') + '\\s*\\{([^}]*)\\}').exec(css) || [])[2] || '';
  assert.ok(/font-size:\s*var\(--karte-schrift,/.test(regel('.karte-info > .karte-kopfzeile .karte-name')));
  assert.ok(!/--karte-schrift,/.test(regel('.karte-info > .karte-titel')), 'Titel klein');
  const bild = regel('.karte-info > .karte-vorschau');
  assert.ok(/flex:\s*1 1 0/.test(bild) && /min-height:\s*0/.test(bild));
  assert.ok(bild.includes('max-height: calc((var(--karte-h) - 20px * var(--karte-n)) * 9 / 16)'));
  const k = regel('.karte-info .karte-knopf');
  assert.ok(k.includes("border-image: url('../themes/cozy/knopf.png') 8 fill / .6667em / 0 stretch"));
  assert.ok(/height:\s*2\.6667em/.test(k) && /color:\s*var\(--text\)/.test(k));
  assert.ok(/text-decoration:\s*none/.test(k), 'keine unterstrichenen Links');
});

test('Karte: Klick daneben und ✕ legen zurueck (Doppelklick ignoriert), Doppelklick auf die Huelle legt auf', () => {
  const b = rumpf(js, 'function baueKarte(');
  const k = b.indexOf("addEventListener('click'");
  assert.ok(k > -1 && b.indexOf('e.detail > 1', k) > k && b.indexOf('e.detail > 1', k) < b.indexOf('t.karteZu', k));
  assert.ok(/e\.target === t\.karteWurzel/.test(b));
  assert.ok(/knopf\('pixel-knopf k-zu karte-zu', '✕'/.test(b));
  const d = b.indexOf("addEventListener('dblclick'");
  assert.ok(d > -1 && b.indexOf("s.modus === 'live'", d) > d && b.indexOf('t.karteLaden(', d) > d);
  assert.ok(rumpf(js, 'function zeichneKarte(').includes("t.karteLaden = (login) => ruf(h, 'laden', login)"));
});

test('Karte: 9-Slice-Literalwerte im CSS gleich regal.json, border-width mit --karte-n', () => {
  const q = path.join(wurzel, 'tools/raum-quellen/regal.json');
  assert.ok(fs.existsSync(q));
  const regal = JSON.parse(fs.readFileSync(q, 'utf8'));
  const slice = (r) => [r.oben, r.rechts, r.unten, r.links].join(' ');
  const regel = (sel) => {
    const m = new RegExp('(^|\\n)' + sel.replace(/\./g, '\\.') + '\\s*\\{([^}]*)\\}').exec(css);
    return m ? m[2] : '';
  };
  const info = regel('.karte-info');
  const rueck = regel('.karte-rueck');
  assert.ok(info.includes("border-image: url('../themes/cozy/karte.png')"), 'Info-Bild');
  assert.ok(rueck.includes("border-image: url('../themes/cozy/karte-rueck.png')"), 'Rueck-Bild');
  assert.ok(info.includes('border-image-slice: ' + slice(regal.karte.rand) + ' fill'), 'Slice Info');
  assert.ok(rueck.includes('border-image-slice: ' + slice(regal.rueckseite.rand) + ' fill'), 'Slice Rueck');
  for (const r of [info, rueck]) {
    assert.ok(r.includes('border-width: calc(10px * var(--karte-n))'));
    assert.ok(/image-rendering:\s*pixelated/.test(r));
  }
  const bild = (r) => /border-image:[^;]*\bfill\b/.test(r) || /border-image-slice:[^;]*\bfill\b/.test(r);
  assert.ok(bild(info) && bild(rueck));
});

test('Karte: CSS (Platz verborgen im Ablauf, Drehen, Liste scrollt, Hover nur Aufhellen/Anheben)', () => {
  assert.ok(/#home\.im-ablauf \.karte-platz\s*\{\s*display:\s*none;?\s*\}/.test(css));
  assert.ok(/\.karte-karte\.gedreht\s*\{\s*transform:\s*rotateY\(180deg\)/.test(css));
  assert.ok(/\.karte-karte\s*\{[^}]*transition:\s*transform 400ms/.test(css));
  assert.ok(/\.karte-seite\s*\{[^}]*backface-visibility:\s*hidden/.test(css));
  assert.ok(/\.karte-vods\s*\{[^}]*overflow-y:\s*auto/.test(css));
  assert.ok(/\.karte-vod canvas\s*\{[^}]*calc\(64px \* var\(--karte-vod-k, 1\)\)[^}]*calc\(36px \* var\(--karte-vod-k, 1\)\)/.test(css));
  assert.ok(/\.karte-vod:hover[^{]*\{[^}]*brightness/.test(css) && /\.karte-vod:hover[^{]*\{[^}]*translateY/.test(css));
  const k = css.slice(css.indexOf('/* --- Karte'));
  assert.ok(k.length > 10);
  assert.ok(!/box-shadow|outline:\s*\d|border-color:\s*var\(--accent|background:\s*var\(--accent/.test(k));
  assert.ok(!/:hover[^{]*\{[^}]*color:/.test(k), 'Hover nicht per Farbe');
});

test('tools/home-groessen.js: Ansichten karte und rueckseite mit Beispieldaten, am Ende zeichneKarte(null)', () => {
  const g = lies('tools/home-groessen.js');
  assert.ok(g.includes('zeichneKarte(') && g.includes("'karte'") && g.includes("'rueckseite'"));
  assert.ok(g.includes('zeichneKarte(null, {})'));
  assert.ok(g.includes('beispiel'));
});

// --- Regal neu, Task 9a: Wand, Ausstellbrett, Plattenruecken (Baustein, noch unverdrahtet) ---
const regalNeu = () => rumpf(js, 'function baueRegalNeu(');

test('Regal neu: zeichneRegal in der Schnittstelle', () => {
  assert.ok(/\bzeichneRegal\b/.test(schnittstelle()));
});

test('Regal neu: baueRegalNeu legt oben/unten, Wand und dann das Regal-Bild; init ruft es (Task 9b)', () => {
  const b = regalNeu();
  assert.ok(b.length > 0, 'baueRegalNeu');
  const i = (n) => b.indexOf("'../themes/cozy/" + n + "'");
  for (const n of ['regal-oben.png', 'regal-unten.png', 'regal-wand.png', 'regal.png']) assert.ok(i(n) > -1, n);
  assert.ok(i('regal-wand.png') < i('regal.png'), 'Wand vor Regal');
  assert.ok(i('regal-oben.png') < i('regal.png') && i('regal-unten.png') < i('regal.png'), 'Streifen unter dem Regal');
  assert.ok(b.includes('Raum.REGAL_LEINWAND'), 'Lage der Streifen aus der Leinwand');
  const i0 = rumpf(js, 'function init(');
  assert.ok(i0.includes('baueRegalNeu()'), 'verdrahtet');
  assert.ok(!/baueRegal\(\)/.test(i0), 'altes Regal nicht mehr');
  // t.regal ist die neue Ebene, die Karte haengt an ihr
  assert.ok(/t\.regal = t\.regalNeu/.test(js) || /t\.regal = r;/.test(regalNeu()));
  assert.ok(i0.includes('t.regal.e.appendChild(baueKarte())'));
});

test('Regal neu: richteRegalNeuAus nutzt die Fach-Skalierung (Regal von nahe)', () => {
  const r = rumpf(js, 'function richteRegalNeuAus(');
  assert.ok(r.includes('Raum.skalierungFach(w, h, nahFachNr)'));
  assert.ok(!r.includes('Raum.skalierung('), 'nicht die alte Skalierung');
  assert.ok(r.includes("setProperty('--f'"), 'eigener Faktor fuer die Textschicht');
});

test('Regal neu: neuer Code nutzt Raum.REGAL.faecher, nicht Raum.FACH', () => {
  for (const kopf of ['function zeichneRegal(', 'function fachBlaettern(', 'function baueRegalNeu(', 'function zeichneFachNeu(', 'function zeigeFachNeu(']) {
    const r = rumpf(js, kopf);
    assert.ok(r.length > 0, kopf);
    assert.ok(!r.includes('Raum.FACH'), kopf);
  }
  assert.ok(regalNeu().includes('Raum.REGAL.faecher'));
  assert.ok(rumpf(js, 'function fachBlaettern(').includes('Raum.REGAL.faecher'));
});

test('Regal neu: Cover per huelle() auf dem Brett, Live-Punkt als CSS (rund), kein live-zeichen.png', () => {
  const z = rumpf(js, 'function zeichneBrett(');
  assert.ok(z.includes('huelle('), 'Cover = huelle()');
  assert.ok(z.includes('Raum.REGAL.brett'));
  assert.ok(z.includes('Raum.REGAL.livePunkt.cover'));
  assert.ok(/ruf\(t\.regalH, 'waehle', jetzt\(\), 'brett'\)/.test(z), "Klick waehlt mit 'brett'");
  assert.ok(js.includes("'live-punkt'"));
  assert.ok(/\.live-punkt\s*\{[^}]*border-radius:\s*50%/.test(css));
  assert.ok(!js.includes('live-zeichen.png') && !css.includes('live-zeichen.png'));
});

test('Regal neu: Ruecken in der Textschicht, Bild je Art, Name laengs, Blaettern per fachFenster mit REGAL.ruecken', () => {
  for (const art of ['live', 'favorit', 'offline', 'twitch']) {
    assert.ok(css.includes("url('../themes/cozy/ruecken-" + art + ".png')"), art);
  }
  const ru = rumpf(js, 'function baueRuecken(');
  assert.ok(ru.includes("'ruecken r-' + e.art"), 'Klasse je Art');
  assert.ok(ru.includes('Raum.REGAL.ruecken.fenster') && ru.includes('Raum.REGAL.ruecken.name'));
  assert.ok(ru.includes('profilbild(k, fenster'), 'Mini-Profilbild');
  assert.ok(/const punkte = Raum\.REGAL\.livePunkt;\s*const P = punkte\.ruecken;/.test(ru), 'Live-Punkt am Ruecken');
  assert.ok(/r\.text\.(append|appendChild)\([^)]*fach/.test(regalNeu()) || /r\.text\.(append|appendChild)\(box\)/.test(regalNeu()), 'Faecher in der Textschicht');
  assert.ok(/\.ruecken-name\s*\{[^}]*writing-mode:\s*vertical-rl/.test(css));
  const teil = /Raum\.fachFenster\([^;]*kante: Raum\.REGAL\.ruecken\.b, abstand: Raum\.REGAL\.ruecken\.abstand/;
  assert.ok(teil.test(rumpf(js, 'function fachBlaettern(')), 'Blaettern');
  assert.ok(teil.test(rumpf(js, 'function zeichneFachNeu(')), 'Umbau');
  assert.ok(teil.test(regalNeu()), 'focusin');
});

test('Regal neu: Doppelklick auf einen Ruecken legt nur Live auf, nie twitch', () => {
  const ru = rumpf(js, 'function baueRuecken(');
  const d = ru.indexOf("addEventListener('dblclick'");
  assert.ok(d > -1);
  const teil = ru.slice(d);
  assert.ok(/e\.art === 'twitch' \|\| !kj\.live/.test(teil));
  assert.ok(teil.indexOf("ruf(t.regalH, 'laden'") > -1);
});

test('Regal neu: CSS der Ruecken pixelgenau, ohne Verlauf; Hover/Fokus nur heller/angehoben', () => {
  const a = css.indexOf('/* --- Regal neu');
  assert.ok(a > -1);
  const teil = css.slice(a, css.indexOf('/* ---', a + 10));
  assert.ok(/\.ruecken\s*\{[^}]*image-rendering:\s*pixelated/.test(teil));
  assert.ok(/\.ruecken\s*\{[^}]*background-size:\s*100% 100%/.test(teil));
  assert.ok(!/gradient/.test(teil));
  assert.ok(!/box-shadow|outline:\s*\d|border-color:\s*var\(--accent|background:\s*var\(--accent/.test(teil));
  assert.ok(!/:hover[^{]*\{[^}]*color:/.test(teil), 'Hover nicht per Farbe');
  assert.ok(/:hover[^{]*\{[^}]*brightness/.test(teil));
});

test('Regal neu: Mausrad blaettert nicht bei offener Tafel oder Karte', () => {
  const b = regalNeu();
  const i = b.indexOf("'wheel'");
  assert.ok(i > -1);
  const teil = b.slice(i, i + 300);
  assert.ok(teil.includes('tafelOffen()') && teil.includes('karteOffen()'));
  assert.ok(teil.includes('fachBlaettern('));
});

test('Regal neu: eigene Namen (faecherNeu, t.plattenRuecken), alter Weg ist weg (Task 9b)', () => {
  assert.ok(/const faecherNeu = \{/.test(js));
  assert.ok(js.includes('t.plattenRuecken'));
  for (const alt of ['function baueRegal(', 'function zeichneFach(', 'function zeigeFach(', 'fachBlaetternNeu']) assert.ok(!js.includes(alt), alt);
  assert.ok(/function fachBlaettern\(art, richtung\)/.test(js));
});

// --- Task 9c/9e: weicher Uebergang Raum <-> Regal (Nahbild waechst aus dem Regal) ---
function fahrtMs() {
  const m = /const FAHRT_MS = (\d+);/.exec(js);
  assert.ok(m, 'FAHRT_MS');
  return Number(m[1]);
}

test('Fahrt (Zoom an Ort): Raum zoomt 700 ms, Nahbild waechst/blendet im letzten Drittel ein bzw. im ersten aus', () => {
  const m = fahrtMs();
  assert.strictEqual(m, 700);
  assert.ok(/#home\.fahrt-hin #regal-ebene\s*\{[^}]*transition:\s*transform 230ms ease-out 470ms, opacity 230ms linear 470ms/.test(css));
  assert.ok(/#home\.fahrt-zurueck #regal-ebene\s*\{[^}]*transition:\s*transform 230ms ease-in, opacity 230ms linear;/.test(css));
  assert.ok(new RegExp('#home\\.fahrt-hin #raum-ebene\\s*\\{[^}]*transition:\\s*transform ' + m + 'ms ease-in;').test(css));
  assert.ok(new RegExp('#home\\.fahrt-zurueck #raum-ebene\\s*\\{[^}]*transition:\\s*transform ' + m + 'ms ease-out;').test(css));
  assert.ok(/#home\.fahrt #regal-ebene,\s*#home\.fahrt #raum-ebene\s*\{[^}]*transform-origin:\s*0 0/.test(css));
  assert.ok(/#home\.fahrt-leer #regal-ebene\s*\{[^}]*opacity:\s*0/.test(css));
  // keine Raum-Kamera mehr beim Regal-Wechsel
  assert.ok(!/fahrt-kamera|fahrt-blende|fahrt-regal/.test(css + js));
  // waehrend der Fahrt kein Hover/Klick in den Ebenen, Raum-Text wie im Ablauf verborgen
  assert.ok(/#home\.fahrt #raum-ebene \*[^{]*\{[^}]*pointer-events:\s*none/.test(css));
  assert.ok(/#home\.fahrt #regal-ebene \*[^{]*\{[^}]*pointer-events:\s*none/.test(css));
  assert.ok(/#home\.fahrt #raum-ebene \.raum-textschicht\s*\{[^}]*visibility:\s*hidden/.test(css));
});

test('Fahrt: Animationen aus schaltet die Uebergaenge ab und wechselt sofort', () => {
  // CSS: die Aus-Regel erfasst alles unter #home.raum-home (auch die Fahrt-Ebenen)
  assert.ok(/html\[data-animationen="aus"\] #home\.raum-home \*[^{]*\{[^}]*transition:\s*none !important/.test(css));
  // JS: ohne Animationen keine Fahrt (sofortiger Wechsel)
  const r = rumpf(js, 'function kannFahren(');
  assert.ok(r.includes("document.documentElement.dataset.animationen !== 'aus'"));
  assert.ok(r.includes("'im-ablauf'"), 'nicht waehrend des Auflegens');
});

test('Fahrt: Zoom an Ort als Standard, Pixel-Blende per Einstellung, Abbruch setzt beide Ebenen zurueck', () => {
  const r = rumpf(js, 'function kameraZiel(');
  assert.ok(!r.includes('fahrt') && !js.includes('Raum.kameraRegal'), 'die Bild-Kamera bleibt beim Ablauf');
  assert.ok(!js.includes('kameraZiel(Raum.HOVER.regal'));
  assert.ok(!/regalWachsen|raumZoomRegal/.test(js), 'verworfene Fahrten sind weg');
  const f = rumpf(js, 'function fahre(');
  assert.ok(f.includes("document.documentElement.dataset.uebergang === 'pixel'") && f.includes('fahrePixel(ziel)') && f.includes('fahreZoom(ziel)'));
  const z = rumpf(js, 'function fahreZoom(');
  assert.ok(z.includes('Raum.zoomAmOrt(wirt.clientWidth, wirt.clientHeight)'));
  assert.ok(!z.includes('neuAusrichten()') && !z.includes('t.raum.bild'), 'nur die ganze Raum-Ebene bewegt sich');
  // Vergleichs-Taste F8 ist weg, die Einstellung steht in der Licht-Tafel (und im ⚙ des Chats)
  assert.ok(!/wechsleFahrtArt|fahrtArt|'F8'/.test(js + homeJs));
  assert.ok(homeJs.includes('saveThemePrefs({ pixelUebergang: $lichtPixel.checked })'));
  assert.ok(homeJs.includes("$lichtPixel.checked = document.documentElement.dataset.uebergang === 'pixel'"));
  // jeder Abbruch setzt beide Ebenen zurueck (Transform und Pixel-Filter)
  const s = rumpf(js, 'function stoppeFahrt(');
  assert.ok(s.includes('[t.regal, t.raum]') && s.includes("x.e.style.transform = ''") && s.includes("x.e.style.filter = ''"));
});

test('Pixel-Uebergang: Video-Fenster setzt data-uebergang, Chat-⚙ hat den Schalter', () => {
  const video = lies('renderer/video/video.js');
  assert.ok(video.includes("document.documentElement.dataset.uebergang = p.pixelUebergang ? 'pixel' : 'zoom'"));
  const chatHtml = lies('renderer/chat/index.html');
  const chat = lies('renderer/chat/chat.js');
  assert.ok(/<input type="checkbox" id="opt-pixel-uebergang" \/>/.test(chatHtml));
  assert.ok(chat.includes('$optPixelUebergang.checked = themePrefs.pixelUebergang'));
  assert.ok(chat.includes('saveThemePrefs({ pixelUebergang: $optPixelUebergang.checked })'));
});

test('Fahrt (Pixel-Blende): 4 Stufen grob, Wechsel bei der groebsten, 4 Stufen scharf, nichts bewegt sich', () => {
  const p = rumpf(js, 'function fahrePixel(');
  assert.ok(/const PIXEL_SCHRITT_MS = FAHRT_MS \/ 8;/.test(js));
  assert.ok(p.includes('setzePixelFilter(Raum.pixelStufen(skalRaum.faktor))'));
  assert.ok(p.includes("'url(#raum-pix-' + i + ')'"));
  assert.ok(!p.includes('transform'), 'keine Bewegung');
  assert.ok(p.includes('fahrtSchritt(nr, 4 * PIXEL_SCHRITT_MS'), 'Wechsel in der Mitte');
  assert.ok(p.includes('fahrtSchritt(nr, FAHRT_MS, () => stoppeFahrt())'));
  // fahrt-leer nur hin (sonst waere das Regal beim Zurueck sofort unsichtbar)
  assert.ok(/if \(ziel === 'regal'\) \{\s*k\.add\('fahrt-leer'\)/.test(p));
  const b = rumpf(js, 'function bauePixelFilter(');
  for (const x of ['<feFlood', '<feTile', '<feMorphology operator="dilate"', 'operator="in"', "'<filter id=\"raum-pix-' + i"]) assert.ok(b.includes(x), x);
  assert.ok(js.includes('baueAblauf(), bauePixelFilter())'));
});

test('Fahrt: Laufnummer gegen Doppelstart, letzter Wunsch gewinnt', () => {
  assert.ok(/let fahrtNr = 0;/.test(js));
  const s = rumpf(js, 'function stoppeFahrt(');
  assert.ok(s.includes('fahrtNr += 1') && s.includes('clearTimeout(') && s.includes('fahrtZiel = null'));
  assert.ok(s.includes('FAHRT_KLASSEN'));
  assert.ok(/function fahrtSchritt\(nr, ms, f\) \{[^}]*setTimeout\(\(\) => \{ if \(nr === fahrtNr\) f\(\); \}, ms\)/.test(js));
  const z = rumpf(js, 'function zeigeAnsicht(');
  assert.ok(/function zeigeAnsicht\(a, weich\)/.test(z));
  assert.ok(z.includes('fahrtZiel === ziel) return'), 'gleiche Fahrt laeuft schon: nicht neu starten');
  assert.ok(z.includes('!fahrtZiel'), 'andere Fahrt laeuft: sofort wechseln');
  assert.ok(z.indexOf('stoppeFahrt()') > -1 && z.indexOf('stoppeFahrt()') < z.indexOf('fahre('), 'jede Ansicht beendet die laufende Fahrt');
});

test('Fahrt hin (Zoom an Ort): Regal startet klein und durchsichtig, waechst auf volle Groesse, dann Raum verborgen', () => {
  const r = rumpf(js, 'function fahreZoom(');
  const hin = r.slice(0, r.indexOf('} else {'));
  const p = (s) => { const i = hin.indexOf(s); assert.ok(i > -1, s); return i; };
  assert.ok(p("k.add('fahrt', 'fahrt-leer')") < p('e.style.transform = klein'));
  assert.ok(p('e.style.transform = klein') < p('aus(e, false)'), 'Startlage vor dem Einblenden');
  assert.ok(p('aus(e, false)') < p('void e.offsetWidth'), 'Regal da (Fokus), Startzustand festschreiben');
  assert.ok(p('void e.offsetWidth') < p("k.add('fahrt-hin')"));
  assert.ok(p("k.add('fahrt-hin')") < p("k.remove('fahrt-leer')") && p("k.remove('fahrt-leer')") < p("e.style.transform = ''"));
  assert.ok(p("k.add('fahrt-hin')") < p('t.raum.e.style.transform = gross'), 'Raum zoomt erst mit Uebergang');
  const ende = hin.slice(p('fahrtSchritt(nr, FAHRT_MS, ()'));
  assert.ok(ende.includes('stoppeFahrt()') && ende.includes('aus(t.raum.e, true)'));
});

test('Fahrt zurueck (Zoom an Ort): Raum herangezoomt darunter, Regal schrumpft und blendet aus, dann verborgen', () => {
  const r = rumpf(js, 'function fahreZoom(');
  const zur = r.slice(r.indexOf('} else {'));
  const p = (s) => { const i = zur.indexOf(s); assert.ok(i > -1, s); return i; };
  assert.ok(p("k.add('fahrt')") < p('t.raum.e.style.transform = gross'), 'Raum startet herangezoomt');
  assert.ok(p('t.raum.e.style.transform = gross') < p('aus(t.raum.e, false)'));
  assert.ok(p('aus(t.raum.e, false)') < p('void e.offsetWidth'));
  assert.ok(p('void e.offsetWidth') < p("k.add('fahrt-zurueck', 'fahrt-leer')"));
  assert.ok(p("k.add('fahrt-zurueck', 'fahrt-leer')") < p('e.style.transform = klein'));
  assert.ok(p("k.add('fahrt-zurueck', 'fahrt-leer')") < p("t.raum.e.style.transform = ''"), 'Raum zoomt mit Uebergang heraus');
  const nach = zur.slice(p('fahrtSchritt(nr, FAHRT_MS, ()'));
  assert.ok(nach.indexOf('aus(e, true)') > -1 && nach.indexOf('aus(e, true)') < nach.indexOf('stoppeFahrt()'), 'erst verbergen, dann Transform zuruecksetzen');
});

test('home.js: Klick aufs Regal und Zurueck fahren weich, Home-Oeffnen und Strg+L sofort', () => {
  assert.ok(/function zeigeRegal\(fokus, weich\) \{\s*HomeRaumDom\.zeigeAnsicht\('regal', weich\);/.test(homeJs));
  assert.ok(/function zeigeRaum\(weich\) \{/.test(homeJs) && homeJs.includes("HomeRaumDom.zeigeAnsicht('raum', weich);"));
  assert.ok(homeJs.includes("if (id === 'regal') zeigeRegal(true, true);"));
  const z = rumpfOben(homeJs, 'function zurueckSchritt(');
  assert.ok(z.includes('zeigeRaum(true)'));
  const o = rumpfOben(homeJs, 'function openHome(');
  assert.ok(o.includes("if (ziel === 'regal' || !raumPasst()) zeigeRegal(true);") && o.includes('else zeigeRaum();'));
  assert.ok(homeJs.includes('else { schliesseTafel(); zeigeRegal(false); }'), 'Strg+L bei offenem Home: sofort');
});

// --- Task 9e Teil B: Zurueck ueber das Schild oben links ------------------------------
test('Task 9e: #home-back ist weg (HTML, home.js, home-raum-dom.js, CSS)', () => {
  for (const [name, q] of [['index.html', html], ['home.js', homeJs], ['home-raum-dom.js', js], ['home-raum.css', css], ['home.css', homeCss]]) {
    assert.ok(!q.includes('home-back') && !q.includes('$homeBack'), name);
  }
  assert.ok(!homeJs.includes('zeigeZurueckKnopf'));
});

test('Task 9e: Schild zeigt im Home bei kannZurueck den Pfeil (Klasse zurueck), auch ohne Quelle klickbar', () => {
  const z = rumpfOben(homeJs, 'function zeigeZurueckSchild(');
  assert.ok(z.includes("!$home.classList.contains('hidden') && kannZurueck()"));
  assert.ok(z.includes("$homeBtn.classList.toggle('zurueck', zurueck)"));
  // closeHome nimmt den Pfeil wieder weg
  assert.ok(rumpfOben(homeJs, 'function closeHome(').includes('zeigeZurueckSchild()'));
  // .leer sperrt nur ohne zurueck; Pfeil auch ohne Hover
  const stil = html.slice(html.indexOf('#onair-bar {'), html.indexOf('#status, #si-oben'));
  assert.ok(/#onair-bar\.leer:not\(\.zurueck\)\s*\{[^}]*pointer-events:\s*none/.test(stil));
  assert.ok(!/#onair-bar\.leer\s*\{/.test(stil), 'keine Sperre, die zurueck uebergeht');
  assert.ok(/#onair-bar\.zurueck #oa-pfeil[^{]*\{[^}]*display:\s*block/.test(stil));
});

// --- Regal von nahe, Task 3: Tasten und Suche in home.js ------------------------------
const tasten = () => {
  const i = homeJs.indexOf("document.addEventListener('keydown'");
  return homeJs.slice(i, homeJs.indexOf('\n});', i));
};

test('home.js: ↑/↓ ohne Karte wechselt das Fach, mit Karte vorn die Platte, Rueckseite scrollt', () => {
  const sch = rumpfOben(homeJs, 'function schritt(');
  assert.ok(/seite === 'rueck'[^\n]*HomeRaumDom\.kartenScrollen\(r\)/.test(sch));
  assert.ok(/if \(!herausgenommen\) \{ HomeRaumDom\.nahFachWechsel\(r\); return; \}/.test(sch), 'ohne Karte: Fach');
  assert.ok(sch.indexOf('kartenScrollen') < sch.indexOf('nahFachWechsel'), 'Rueckseite zuerst');
  assert.ok(/HomeRaumDom\.zeigeNahFach\(HomeRaumDom\.fachVon\(k\.login\)\)/.test(sch), 'Fach der neuen Platte, ohne Fahrt');
  assert.ok(sch.indexOf('waehle(') < sch.indexOf('zeigeNahFach('), 'nach dem Herausnehmen');
});

test('home.js: ←/→ blaettert in Fach 2/3, nicht im Suchfeld', () => {
  const k = tasten();
  const i = k.indexOf("e.key === 'ArrowLeft' || e.key === 'ArrowRight'");
  assert.ok(i > -1);
  const teil = k.slice(i, k.indexOf('return;\n  }', i));
  assert.ok(teil.includes('document.activeElement === $suche'), 'nicht im Suchfeld');
  assert.ok(teil.includes('herausgenommen') && teil.includes('tafel'), 'nicht bei Karte/Tafel');
  assert.ok(teil.includes('HomeRaumDom.nahFach() === 0'), 'nur Fach 2/3');
  assert.ok(teil.includes("e.key === 'ArrowRight' ? 1 : -1"));
});

test('home.js: Tippen im Regal fokussiert das Suchfeld', () => {
  const k = tasten();
  assert.ok(/HomeRaumDom\.ansicht\(\) === 'regal' && document\.activeElement !== \$suche/.test(k));
  const i = k.indexOf("HomeRaumDom.ansicht() === 'regal' && document.activeElement !== $suche");
  const teil = k.slice(i, i + 400);
  assert.ok(teil.includes('$suche.focus()') && teil.includes('$suche.value = e.key') && teil.includes('sucheGetippt()'));
  assert.ok(!teil.includes('zeigeRegal('), 'kein Fachwechsel durch zeigeRegal');
});

test('home.js: Suche faehrt ins Fach des besten Treffers, ohne Treffer in Fach 3 bei Offline/Twitch-Treffern', () => {
  const f = rumpfOben(homeJs, 'function folgeTreffer(');
  assert.ok(f.includes('if (!nadel()) return;'), 'leere Suche: Fach bleibt');
  assert.ok(f.includes('besterTreffer(b)'));
  assert.ok(f.includes('HomeRaumDom.zeigeNahFach(HomeRaumDom.fachVon(k.login), true)'));
  assert.ok(/else if \(b\.unten\.length > 0\) HomeRaumDom\.zeigeNahFach\(2, true\)/.test(f));
  const s = rumpfOben(homeJs, 'function sucheGetippt(');
  assert.ok(s.lastIndexOf('folgeTreffer()') > s.lastIndexOf('renderHome()'), 'nach dem Zeichnen');
  assert.ok(/if \(gueltig\) \{ renderHome\(\); folgeTreffer\(\); \}/.test(s), 'auch nach den Twitch-Treffern');
});

// --- Regal von nahe, Task 2: Fach fuer Fach (Plan 2026-11-13-regal-nah) -------------
test('Regal nah: richteRegalNeuAus nutzt Raum.skalierungFach und setzt --raum-schrift-gross', () => {
  const r = rumpf(js, 'function richteRegalNeuAus(');
  assert.ok(r.includes('Raum.skalierungFach(w, h, nahFachNr)'));
  assert.ok(!r.includes('Raum.skalierungRegal('), 'nicht mehr die Gesamtansicht');
  assert.ok(r.includes("setProperty('--raum-schrift-gross', Raum.schriftPx(f, 5) + 'px')"));
  assert.ok(r.includes("setProperty('--f'") && r.includes("setProperty('--ruecken-schrift'"));
});

test('Regal nah: zeigeNahFach/nahFach/nahFachWechsel/fachVon in der Schnittstelle', () => {
  for (const n of ['zeigeNahFach', 'nahFach', 'nahFachWechsel', 'fachVon']) {
    assert.ok(new RegExp('\\b' + n + '\\b').test(schnittstelle()), n);
    assert.ok(js.includes('function ' + n + '('), n);
  }
  const z = rumpf(js, 'function zeigeNahFach(');
  assert.ok(z.includes('Raum.naechstesFach('), 'zeigeNahFach geht ueber naechstesFach');
  assert.ok(rumpf(js, 'function nahFachWechsel(').includes('Raum.naechstesFach('));
});

test('Regal nah: zeichneRegal verlaesst ein leeres Fach per naechstesFach(…, 0, …)', () => {
  const z = rumpf(js, 'function zeichneRegal(');
  assert.ok(/Raum\.naechstesFach\(nahFachNr, 0, leereFaecher\(\)\)/.test(z));
  assert.ok(z.includes('setzeHinweis()'), 'Hinweis neu gezaehlt');
  assert.ok(rumpf(js, 'function zeigeNahFach(').includes('setzeHinweis()'));
  const l = rumpf(js, 'function leereFaecher(');
  assert.ok(l.includes('faecherNeu.live.anzahl === 0') && l.includes('faecherNeu.unten.anzahl === 0'));
});

test('Regal nah: Fachfahrt auf t.regalInnen mit Raum.fachFahrt, Klasse fach-fahrt in FAHRT_KLASSEN, stoppeFahrt setzt regalInnen zurueck, neuAusrichten bricht ab', () => {
  const b = regalNeu();
  assert.ok(/t\.regalInnen = el\('div', 'regal-innen'\)/.test(b));
  assert.ok(/t\.regalInnen\.append\(r\.bild, r\.text\)/.test(b), 'umschliesst Bild- und Textschicht');
  assert.ok(/FAHRT_KLASSEN = \[[^\]]*'fach-fahrt'/.test(js));
  const f = rumpf(js, 'function fahreFach(');
  assert.ok(f.includes('Raum.fachFahrt(') && f.includes('fahrtSchritt(') && f.includes('t.regalInnen.style.transform'));
  assert.ok(f.includes("'fach-fahrt-sprung'"), 'Sprung ohne Uebergang');
  const s = rumpf(js, 'function stoppeFahrt(');
  assert.ok(s.includes("t.regalInnen.style.transform = ''"));
  const n = rumpf(js, 'function neuAusrichten(');
  assert.ok(/if \(fachZiel !== null\) stoppeFahrt\(\)/.test(n));
  assert.ok(/#home\.raum-home\.fach-fahrt \.regal-innen\s*\{[^}]*transform-origin:\s*0 0;[^}]*transition:\s*transform 350ms ease-in-out/.test(css));
  assert.ok(/#home\.raum-home\.fach-fahrt-sprung \.regal-innen\s*\{[^}]*transition:\s*none/.test(css));
});

test('Regal nah: Mausrad an der Regal-Ebene (Sperre 400, Shift blaettert), nicht bei Tafel/Karte', () => {
  const b = regalNeu();
  const i = b.indexOf("r.e.addEventListener('wheel'");
  assert.ok(i > -1, 'an der Regal-Ebene');
  const teil = b.slice(i, b.indexOf('{ passive: false }', i));
  assert.ok(teil.includes('tafelOffen()') && teil.includes('karteOffen()'));
  assert.ok(teil.includes('e.shiftKey') && teil.includes('fachBlaettern('));
  assert.ok(teil.includes('nahFachWechsel(') && teil.includes('RAD_SPERRE_MS'));
  assert.ok(/const RAD_SPERRE_MS = 400;/.test(js));
  assert.strictEqual(b.split("'wheel'").length - 1, 1, 'keine Wheel-Handler mehr an den Fach-Boxen');
});

test('Regal nah: focusin faehrt ins Fach des Elements', () => {
  const b = regalNeu();
  const i = b.indexOf("r.e.addEventListener('focusin'");
  assert.ok(i > -1);
  const teil = b.slice(i, i + 400);
  assert.ok(teil.includes('fachVon(') && teil.includes('zeigeNahFach(') && teil.includes('true'));
});

test('Regal nah: Fach 0 nur beim Wechsel Raum -> Regal', () => {
  const z = rumpf(js, 'function zeigeAnsicht(');
  assert.ok(/if \(ziel === 'regal' && aktuell !== 'regal'\) nahFachNr = 0;/.test(z));
  assert.ok(z.indexOf('nahFachNr = 0') < z.indexOf('aktuell = ziel'), 'vor dem Umschalten geprueft');
});

test('Regal nah: Suchleiste fest oben, such-zettel weg', () => {
  const b = regalNeu();
  assert.ok(!js.includes('such-zettel') && !css.includes('such-zettel'));
  assert.ok(/t\.suchOben = el\('div', 'zettel such-oben'\)/.test(b));
  assert.ok(/r\.e\.append\([^)]*t\.suchOben/.test(b), 'ausserhalb von regalInnen');
  const a = rumpf(js, 'function richteRegalNeuAus(');
  assert.ok(a.includes('Raum.REGAL.such.b * f') && a.includes('Raum.REGAL.such.h * f'));
  assert.ok(/\.such-oben\s*\{[^}]*top:\s*8px/.test(css));
});

test('Regal nah: CSS Hinweis unten rechts, Hover-Name und Hinweis waehrend der Fahrt verborgen', () => {
  assert.ok(/\.fach-hinweis\s*\{[^}]*right:[^}]*bottom:[^}]*font-size:\s*var\(--raum-schrift\)[^}]*color:\s*#f4e4c9[^}]*opacity:\s*\.8/.test(css));
  assert.ok(/#home\.fach-fahrt \.fach-hinweis/.test(css));
  const h = rumpf(js, 'function setzeHinweis(');
  assert.ok(h.includes("'▲▼ Fach '"), 'Text');
  assert.ok(/aus\(t\.fachHinweis, m < 2\)/.test(h), 'bei nur einem Fach verborgen');
});
