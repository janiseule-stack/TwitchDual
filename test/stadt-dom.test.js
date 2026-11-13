'use strict';
// Chat-Stadt im Chat-Fenster (renderer/lib/stadt-dom.js): Ebenen, Blitz, Fensterlichter,
// Strassen-Leben, Raid, Groessenwechsel, "Animationen aus". Schein-DOM + statische Pruefung.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Stadt = require('../renderer/lib/stadt.js');
const StadtDom = require('../renderer/lib/stadt-dom.js');

const lies = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const S = Stadt.STADT;

function scheinEl(tag) {
  const klassen = new Set();
  const hoerer = {};
  const props = {};
  const el = {
    tag, dataset: {}, kinder: [], eltern: null,
    set className(v) { klassen.clear(); String(v).split(/\s+/).filter(Boolean).forEach((k) => klassen.add(k)); },
    get className() { return [...klassen].join(' '); },
    classList: {
      add: (...k) => k.forEach((x) => klassen.add(x)),
      remove: (...k) => k.forEach((x) => klassen.delete(x)),
      contains: (k) => klassen.has(k),
      toggle: (k, an) => { if (an === undefined ? !klassen.has(k) : an) klassen.add(k); else klassen.delete(k); },
    },
    style: { setProperty: (k, v) => { props[k] = String(v); }, props },
    appendChild(k) { if (k.eltern) k.eltern.removeChild(k); k.eltern = el; el.kinder.push(k); return k; },
    removeChild(k) { const i = el.kinder.indexOf(k); if (i > -1) el.kinder.splice(i, 1); k.eltern = null; return k; },
    remove() { if (el.eltern) el.eltern.removeChild(el); },
    addEventListener: (art, f) => { (hoerer[art] = hoerer[art] || []).push(f); },
    feuere(art) { (hoerer[art] || []).forEach((f) => f({ type: art, target: el })); },
  };
  return el;
}
const scheinDoc = () => ({ createElement: scheinEl });

function scheinUhr() {
  const timer = new Map();
  let nr = 0;
  let jetzt = 0;
  const uhr = {
    setTimeout: (f, ms) => { timer.set(++nr, { f, bei: jetzt + ms }); return nr; },
    clearTimeout: (id) => { timer.delete(id); },
    jetzt: () => jetzt,
    timer,
    // Zeit vorstellen und alle faelligen Timer der Reihe nach ausfuehren
    vor(ms) {
      const ziel = jetzt + ms;
      for (;;) {
        let naechster = null;
        for (const [id, t] of timer) if (t.bei <= ziel && (!naechster || t.bei < naechster[1].bei)) naechster = [id, t];
        if (!naechster) break;
        timer.delete(naechster[0]);
        jetzt = naechster[1].bei;
        naechster[1].f();
      }
      jetzt = ziel;
    },
  };
  return uhr;
}

// Gewitter-Attrappe: sofort Gewitter, Blitz alle 5 s
function dauerGewitter() {
  let letzter = -Infinity;
  return {
    naechste(t) {
      if (letzter > t) return { phase: 'gewitter', blitzInMs: letzter - t, wechselInMs: 1e9 };
      letzter = Math.max(t, letzter) + 5000;
      return { phase: 'gewitter', blitzInMs: letzter - t, wechselInMs: 1e9 };
    },
  };
}

function aufbau(extra) {
  const uhr = scheinUhr();
  const wirt = scheinEl('div');
  const band = scheinEl('div');
  const stadt = StadtDom.baue(scheinDoc(), wirt, 'p/', Object.assign({
    setTimeout: uhr.setTimeout, clearTimeout: uhr.clearTimeout, jetzt: uhr.jetzt,
    zufall: () => 0.5, stunde: () => 20, band, gewitter: dauerGewitter(),
  }, extra || {}));
  const ebene = wirt.kinder[0];
  const teil = (k) => ebene.kinder.find((e) => e.classList.contains(k));
  return { uhr, wirt, band, stadt, ebene, teil };
}

test('baue: Bildebene mit Grundbild, Ebenen in fester Reihenfolge', () => {
  const { ebene } = aufbau();
  assert.ok(ebene.classList.contains('stadt-bildebene'));
  assert.ok(ebene.style.backgroundImage.includes('p/stadt.png'));
  const reihe = ebene.kinder.map((e) => e.className.split(' ')[0]);
  // Regen am Himmel hinter den Haeusern, Regen auf der Strasse vor den Figuren
  assert.deepStrictEqual(reihe, ['stadt-blitz', 'stadt-regen', 'stadt-fenster-ebene', 'stadt-strasse', 'stadt-regen', 'stadt-dunkel']);
  assert.ok(ebene.kinder[1].classList.contains('himmel') && ebene.kinder[4].classList.contains('strasse'));
  assert.ok(ebene.kinder[0].style.backgroundImage.includes('p/stadt-himmel-blitz.png'));
  assert.ok(ebene.kinder[1].style.backgroundImage.includes('p/stadt-regen-himmel.png'));
  assert.ok(ebene.kinder[4].style.backgroundImage.includes('p/stadt-regen-strasse.png'));
  for (const r of [ebene.kinder[1], ebene.kinder[4]]) {
    assert.strictEqual(r.style.props['--bilder'], String(S.regen.bilder));
    assert.strictEqual(r.style.props['--dauer'], S.regen.bilder * S.regen.msProBild + 'ms');
    assert.strictEqual(r.style.props['--sb'], S.bild.b * S.regen.bilder + 'px');
  }
  // Abdunkeln nur ueber Himmel + Haeusern, nicht ueber dem Strassenband
  assert.strictEqual(ebene.kinder[5].style.height, S.ebenen.strasse.y + 'px');
});

test('Fensterlichter: Ausschnitte aus stadt-haeuser-licht.png an stadt.json.fenster, Anteil nach Uhrzeit', () => {
  const { teil } = aufbau();
  const fe = teil('stadt-fenster-ebene');
  assert.strictEqual(fe.kinder.length, S.fenster.length);
  S.fenster.forEach((f, i) => {
    const d = fe.kinder[i];
    assert.strictEqual(d.style.left, f.x + 'px');
    assert.strictEqual(d.style.top, f.y + 'px');
    assert.strictEqual(d.style.width, f.b + 'px');
    assert.strictEqual(d.style.height, f.h + 'px');
    assert.strictEqual(d.style.backgroundPosition, -f.x + 'px ' + -f.y + 'px');
    assert.ok(d.style.backgroundImage.includes('p/stadt-haeuser-licht.png'));
  });
  const an = fe.kinder.filter((d) => d.classList.contains('an')).length;
  assert.strictEqual(an, Math.round(Stadt.lichtAnteil(20) * S.fenster.length));
});

test('Uhrzeit-Lichter: alle 2-5 min eines naeher ans Ziel', () => {
  let stunde = 20;
  const { uhr, teil } = aufbau({ stunde: () => stunde });
  const fe = teil('stadt-fenster-ebene');
  const zaehle = () => fe.kinder.filter((d) => d.classList.contains('an')).length;
  const vorher = zaehle();
  stunde = 3; // nachts: weniger Licht
  uhr.vor(5 * 60000);
  assert.strictEqual(zaehle(), vorher - 1);
  uhr.vor(5 * 60000);
  assert.strictEqual(zaehle(), vorher - 2);
});

test('richteAus: Masse aus Stadt.masse als CSS-Variablen, Band-Hoehe, bei jedem Resize neu (Review Focus 4)', () => {
  const { stadt, wirt, band } = aufbau();
  for (const [b, h] of [[1397, 940], [400, 1200], [2560, 1100]]) {
    stadt.richteAus(b, h);
    const m = Stadt.masse(b, h);
    assert.strictEqual(wirt.style.props['--stadt-f'], String(m.faktor));
    assert.strictEqual(wirt.style.props['--stadt-links'], m.links + 'px');
    assert.strictEqual(wirt.style.props['--stadt-oben'], m.oben + 'px');
    assert.strictEqual(band.style.height, m.strasseH + 'px');
  }
});

test('Blitz nur auf der Himmel-Ebene, Mitte dunkelt dabei staerker ab, hoechstens 300 ms', () => {
  const { uhr, stadt, wirt, teil } = aufbau();
  const blitz = teil('stadt-blitz');
  stadt.an();
  const normal = Number(wirt.style.props['--stadt-dunkel']);
  uhr.vor(5000);
  assert.ok(blitz.classList.contains('an'), 'Blitz an');
  assert.ok(Number(wirt.style.props['--stadt-dunkel']) > normal, 'staerker abgedunkelt');
  uhr.vor(300);
  assert.ok(!blitz.classList.contains('an'), 'Blitz nach <= 300 ms aus');
  assert.strictEqual(Number(wirt.style.props['--stadt-dunkel']), normal);
});

test('Strassen-Leben: Passant und Auto nur im Band, Auto mit gespiegelter, abgedunkelter Kopie', () => {
  let z = 0;
  const werte = [0.1, 0.9, 0.5]; // Periode 3: Passant und Auto kommen beide vor
  const { uhr, stadt, teil } = aufbau({ zufall: () => werte[z++ % 3] });
  const strasse = teil('stadt-strasse');
  const gesehen = [];
  const anhaengen = strasse.appendChild;
  strasse.appendChild = (k) => { gesehen.push(k); return anhaengen(k); };
  stadt.an();
  let hoechstens = 0;
  for (let i = 0; i < 120; i++) { uhr.vor(1000); hoechstens = Math.max(hoechstens, strasse.kinder.length); }
  const passant = gesehen.find((k) => k.classList.contains('stadt-figur'));
  const auto = gesehen.find((k) => k.classList.contains('stadt-auto'));
  assert.ok(passant, 'Passant laeuft');
  assert.strictEqual(passant.style.top, S.gehwegY - S.figur.h + 'px');
  assert.ok(auto, 'Auto faehrt');
  assert.strictEqual(auto.style.top, S.fahrbahnY - S.auto.h + 'px');
  const spiegel = auto.kinder.find((k) => k.classList.contains('stadt-spiegel'));
  assert.ok(spiegel, 'Spiegelung');
  // Spiegelachse an der Radunterkante
  assert.strictEqual(spiegel.style.top, 2 * S.auto.radY - S.auto.h + 'px');
  const bild = auto.kinder.find((k) => k.classList.contains('stadt-auto-bild'));
  assert.ok(S.auto.varianten.some((v) => bild.style.backgroundImage.includes('p/' + v)), 'eine der Auto-Farben');
  for (const k of gesehen) assert.ok(parseFloat(k.style.top) >= S.ebenen.strasse.y - S.figur.h, 'im Band');
  assert.ok(hoechstens <= Stadt.BUDGET.strasse, 'Regisseur: hoechstens 2 auf der Strasse');
});

test('raid: Figuren nach Plan, Bus ab 50, endet nach Stadt.raidDauer', async () => {
  const { uhr, stadt, teil } = aufbau();
  const strasse = teil('stadt-strasse');
  stadt.an();
  stadt.richteAus(1397, 940);
  const plan = Stadt.raidPlan(250);
  let fertig = false;
  const p = stadt.raid(plan).then(() => { fertig = true; });
  assert.strictEqual(strasse.kinder.filter((k) => k.classList.contains('stadt-raid-figur')).length, plan.figuren);
  assert.strictEqual(strasse.kinder.filter((k) => k.classList.contains('stadt-bus')).length, 1);
  const breite = 1397 / Stadt.masse(1397, 940).faktor;
  uhr.vor(Stadt.raidDauer(plan, breite) - 1);
  await Promise.resolve();
  assert.strictEqual(fertig, false);
  uhr.vor(1);
  await p;
  assert.strictEqual(strasse.kinder.filter((k) => /stadt-(raid-figur|bus)/.test(k.className)).length, 0);
});

test('raidDauer: aus der aktuell sichtbaren Strassenbreite', () => {
  const { stadt } = aufbau();
  const plan = Stadt.raidPlan(80);
  assert.strictEqual(stadt.raidDauer(plan), Stadt.raidDauer(plan, S.bild.b));
  stadt.richteAus(400, 1200);
  const m = Stadt.masse(400, 1200);
  assert.strictEqual(stadt.raidDauer(plan), Stadt.raidDauer(plan, 400 / m.faktor));
});

test('raid im schmalen Chat (400x1332): Bus haelt sichtbar, Leute laufen wirklich (Final-Fund 2)', () => {
  const { stadt, teil } = aufbau();
  const strasse = teil('stadt-strasse');
  stadt.an();
  stadt.richteAus(400, 1332);
  const m = Stadt.masse(400, 1332);
  const sichtLinks = -m.links / m.faktor;
  const sichtBreite = 400 / m.faktor;
  stadt.raid(Stadt.raidPlan(250));
  const bus = strasse.kinder.find((k) => k.classList.contains('stadt-bus'));
  const halt = parseFloat(bus.style.props['--halt']);
  assert.ok(halt + S.bus.tuerX <= sichtLinks + sichtBreite, 'Tuer sichtbar');
  for (const f of strasse.kinder.filter((k) => k.classList.contains('stadt-raid-figur'))) {
    assert.ok(Number(f.style.props['--schritte']) >= 1, 'gueltige steps()');
    assert.ok(parseFloat(f.style.props['--bis']) > parseFloat(f.style.props['--von']), 'laeuft nach rechts');
  }
});

test('raid: kleine Raids ohne Bus, stoppeRaid raeumt sofort auf', async () => {
  const { stadt, teil } = aufbau();
  const strasse = teil('stadt-strasse');
  stadt.an();
  const p = stadt.raid(Stadt.raidPlan(20));
  assert.strictEqual(strasse.kinder.filter((k) => k.classList.contains('stadt-bus')).length, 0);
  assert.strictEqual(strasse.kinder.filter((k) => k.classList.contains('stadt-raid-figur')).length, 3);
  stadt.stoppeRaid();
  await p;
  assert.strictEqual(strasse.kinder.length, 0);
});

test('aboFenster: n dunkle Fenster gehen an und bleiben, auch bei Animationen aus (Review Focus 3)', () => {
  const { uhr, stadt, teil } = aufbau({ stunde: () => 3 });
  const fe = teil('stadt-fenster-ebene');
  const vorher = fe.kinder.filter((d) => d.classList.contains('an')).length;
  stadt.aus();
  stadt.aboFenster(5);
  assert.strictEqual(fe.kinder.filter((d) => d.classList.contains('abo')).length, 5, 'sofort, hart');
  assert.strictEqual(fe.kinder.filter((d) => d.classList.contains('an')).length, vorher + 5);
  stadt.aboFenster(500); // mehr als Fenster: kein Fehler, alles hell
  assert.strictEqual(fe.kinder.filter((d) => d.classList.contains('an')).length, S.fenster.length);
  uhr.vor(60 * 60000); // Uhrzeit-Takt schaltet keine Abo-Fenster aus
  assert.strictEqual(fe.kinder.filter((d) => d.classList.contains('abo')).length, S.fenster.length - vorher);
});

test('aboFenster bei laufenden Animationen: nacheinander', () => {
  const { uhr, stadt, teil } = aufbau({ stunde: () => 3 });
  const fe = teil('stadt-fenster-ebene');
  stadt.an();
  stadt.aboFenster(3);
  const abo = () => fe.kinder.filter((d) => d.classList.contains('abo')).length;
  assert.strictEqual(abo(), 1);
  uhr.vor(2000);
  assert.strictEqual(abo(), 3);
});

test('aus() mitten im Gewitter und Raid: Blitz weg, Figuren weg, Timer leer, Abo-Fenster bleiben (Review Focus 5)', async () => {
  const { uhr, stadt, wirt, teil } = aufbau();
  const strasse = teil('stadt-strasse');
  const blitz = teil('stadt-blitz');
  stadt.an();
  stadt.aboFenster(2);
  uhr.vor(5000); // Blitz laeuft
  assert.ok(blitz.classList.contains('an'));
  const p = stadt.raid(Stadt.raidPlan(80));
  stadt.aus();
  await p;
  assert.ok(!blitz.classList.contains('an'));
  assert.strictEqual(strasse.kinder.length, 0);
  assert.strictEqual(teil('stadt-fenster-ebene').kinder.filter((d) => d.classList.contains('abo')).length, 2);
  const normal = wirt.style.props['--stadt-dunkel'];
  uhr.vor(60000);
  assert.ok(!blitz.classList.contains('an'), 'kein neuer Blitz');
  assert.strictEqual(strasse.kinder.length, 0, 'kein neues Leben');
  assert.strictEqual(wirt.style.props['--stadt-dunkel'], normal);
});

test('chat.css: Stadt-Regeln pixelig, Abdunkeln ueber Variable, Animationen aus haelt alles an', () => {
  const css = lies('renderer/chat/chat.css');
  assert.ok(!/gradient/.test(css), 'keine Verlaeufe');
  assert.ok(css.includes('html[data-animationen="aus"] #stadt * { animation: none !important; transition: none !important; }'));
  const regel = (sel) => {
    const i = css.indexOf(sel + ' {');
    assert.ok(i > -1, sel + ' fehlt');
    return css.slice(i, css.indexOf('}', i));
  };
  assert.ok(regel('.stadt-bildebene').includes('image-rendering: pixelated'));
  assert.ok(regel('.stadt-bildebene').includes('transform: scale(var(--stadt-f, 1))'));
  assert.ok(regel('.stadt-dunkel').includes('opacity: var(--stadt-dunkel'));
  assert.ok(regel('.stadt-blitz').includes('visibility: hidden'));
  assert.ok(regel('.stadt-blitz.an').includes('visibility: visible'));
  assert.ok(regel('.stadt-fenster').includes('transition: opacity 300ms'));
  assert.ok(regel('#stadt').includes('overflow: hidden'));
  assert.ok(regel('#stadt-band').includes('pointer-events: none'));
});

test('index.html: Stadt hinter den Nachrichten, Band zwischen Nachrichten und Eingabe, Skripte vor chat.js', () => {
  const html = lies('renderer/chat/index.html');
  const stadt = html.indexOf('<div id="stadt">');
  const mitte = html.indexOf('<div id="chat-mitte">');
  const band = html.indexOf('<div id="stadt-band">');
  const composer = html.indexOf('<div id="composer">');
  assert.ok(html.indexOf('<div id="stadt-flaeche">') > -1);
  assert.ok(stadt > -1 && stadt < mitte && mitte < band && band < composer);
  const a = html.indexOf('../lib/stadt.js');
  const b = html.indexOf('../lib/stadt-dom.js');
  assert.ok(a > -1 && b > a && b < html.indexOf('src="chat.js"'));
});

test('chat.js: Stadt gebaut, bei Groessenwechsel ausgerichtet, an/aus mit den Animationen', () => {
  const js = lies('renderer/chat/chat.js');
  assert.ok(/StadtDom\.baue\(document, \$stadt, '\.\.\/themes\/cozy\/'/.test(js));
  assert.ok(js.includes('new ResizeObserver('));
  assert.ok(js.includes('stadt.richteAus($stadt.clientWidth, $stadt.clientHeight)'));
  const i = js.indexOf('function applyTheme(');
  const r = js.slice(i, js.indexOf('\n}', i));
  assert.ok(/if \(themePrefs\.animationen\) \{ leben\.an\(\); stadt\.an\(\); \}/.test(r), r);
  assert.ok(/else \{ leben\.aus\(\); stadt\.aus\(\); abspieler\.aus\(\); \}/.test(r), r);
});
