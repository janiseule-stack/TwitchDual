// Welten mit einer Engine-Attrappe unter Node laden (Review I1): startet eine
// Welt, waehrend ihre Ebene unsichtbar ist (Home zu -> Groesse 0x0), duerfen
// Gluehwuermchen/Fische nicht in einer Ecke kleben bleiben.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const FxEngine = require('../renderer/lib/fx-engine');

function ladeWelt(id) {
  global.window = global.window || {};
  global.document = global.document || { createElement: () => ({ style: {}, appendChild() {} }) };
  const datei = path.join(__dirname, '..', 'renderer', 'themes', id, 'welt.js');
  delete require.cache[datei];
  require(datei);
  return global.window.TwitchDualWelten[id];
}

function fakeEngine() {
  const e = {
    groesse: { w: 0, h: 0 }, schleifen: [], elemente: [], faktor: 1,
    element() { const el = { style: {}, appendChild() {} }; e.elemente.push(el); return el; },
    spawn() { return null; },
    schleife(fn) { e.schleifen.push(fn); },
    intervall() {},
    rechteck() { return { left: 0, top: 0 }; }
  };
  e.api = {
    element: e.element, spawn: e.spawn, schleife: e.schleife, intervall: e.intervall, rechteck: e.rechteck,
    groesse: () => e.groesse, get faktor() { return e.faktor; }
  };
  return e;
}

function positionen(e) {
  return e.elemente.map((el) => {
    const m = /translate\(([-\d.]+)px,([-\d.]+)px\)/.exec(el.style.transform || '');
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
  });
}

for (const id of ['wald', 'koi']) {
  test(id + ': Start bei unsichtbarer Ebene verteilt sich, sobald sie Groesse hat', () => {
    const fabrik = ladeWelt(id);
    const e = fakeEngine();
    const welt = fabrik({ engine: e.api, fenster: 'video', FxEngine });
    welt.start();                         // Home zu: 0x0
    assert.ok(e.elemente.length >= 2);
    e.groesse = { w: 600, h: 400 };       // Home geht auf
    for (const fn of e.schleifen) fn(16);
    const pos = positionen(e);
    assert.ok(pos.every(Boolean), 'alle positioniert');
    const xs = pos.map((p) => Math.round(p.x));
    assert.ok(new Set(xs).size === xs.length, 'nicht alle an derselben Stelle: ' + xs);
    assert.ok(Math.max(...xs) > 100, 'nicht in der linken Ecke geklumpt: ' + xs);
  });
}
