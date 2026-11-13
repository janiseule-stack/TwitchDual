// Maus ueber dem Video ausblenden, wenn sie still steht (Janis 13.11.2026).
// Die Logik steht in preload.js (laeuft im player.twitch.tv-iframe, Sandbox ohne
// require) und wird hier herausgeloest und mit Attrappen ausgefuehrt.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
const start = src.indexOf('function mausWeg(');
const ende = src.indexOf('// ende mausWeg', start);

function attrappe() {
  const hoerer = {};
  const kopf = { kinder: [], appendChild(e) { this.kinder.push(e); e.parent = this; } };
  const doc = {
    head: kopf,
    documentElement: kopf,
    addEventListener(art, f) { (hoerer[art] = hoerer[art] || []).push(f); },
    createElement() { return { id: '', textContent: '', remove() { kopf.kinder = kopf.kinder.filter((x) => x !== this); } }; },
    feuere(art) { (hoerer[art] || []).forEach((f) => f({})); },
    versteckt() { return kopf.kinder.some((e) => e.id === 'twitchdual-maus-weg' && /cursor:\s*none !important/.test(e.textContent)); },
    hoerer
  };
  let jetzt = 0;
  let timer = [];
  const uhr = {
    setTimeout(f, ms) { const t = { f, bei: jetzt + ms }; timer.push(t); return t; },
    clearTimeout(t) { timer = timer.filter((x) => x !== t); },
    weiter(ms) { jetzt += ms; const faellig = timer.filter((t) => t.bei <= jetzt); timer = timer.filter((t) => t.bei > jetzt); faellig.forEach((t) => t.f()); }
  };
  return { doc, uhr };
}

function lade() {
  assert.ok(start > -1 && ende > start, 'mausWeg in preload.js');
  return vm.runInNewContext('(' + src.slice(start, ende).trim() + ')');
}

test('mausWeg: nach 3 s still verschwindet die Maus, Bewegung holt sie sofort zurueck', () => {
  const mausWeg = lade();
  const { doc, uhr } = attrappe();
  mausWeg(doc, uhr);
  assert.ok(!doc.versteckt(), 'anfangs sichtbar');
  doc.feuere('mousemove');
  uhr.weiter(2900);
  assert.ok(!doc.versteckt(), 'vor 3 s noch da');
  doc.feuere('mousemove'); // Bewegung setzt die Wartezeit zurueck
  uhr.weiter(2900);
  assert.ok(!doc.versteckt());
  uhr.weiter(200);
  assert.ok(doc.versteckt(), 'nach 3 s still: weg');
  doc.feuere('mousemove');
  assert.ok(!doc.versteckt(), 'Bewegung: sofort wieder da');
  uhr.weiter(3000);
  assert.ok(doc.versteckt());
});

test('mausWeg: auch Klick holt die Maus zurueck; Verlassen des Videos zeigt sie wieder', () => {
  const mausWeg = lade();
  const { doc, uhr } = attrappe();
  mausWeg(doc, uhr);
  doc.feuere('mousemove');
  uhr.weiter(3000);
  doc.feuere('mousedown');
  assert.ok(!doc.versteckt());
  uhr.weiter(3000);
  assert.ok(doc.versteckt());
  doc.feuere('mouseout'); // relatedTarget leer = Maus hat das iframe verlassen
  assert.ok(!doc.versteckt(), 'ausserhalb des Videos nie versteckt');
  uhr.weiter(5000);
  assert.ok(!doc.versteckt(), 'ohne Maus im Video kein neues Verstecken');
});

test('preload: mausWeg laeuft nur im Player-iframe, nicht im eigenen Fenster', () => {
  assert.ok(src.includes("if (isTwitchFrame && location.hostname === 'player.twitch.tv') {"));
  assert.ok(src.includes('try { mausWeg(document, { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t) }); } catch'));
});
