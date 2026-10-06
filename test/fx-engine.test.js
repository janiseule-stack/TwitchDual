const { test } = require('node:test');
const assert = require('node:assert');
const { createEngine, tr } = require('../renderer/lib/fx-engine');

// --- Attrappen: genug DOM fuer die Engine, ohne Browser ----------------------
function fakeEl() {
  const el = {
    style: {}, className: '', textContent: '', parent: null,
    remove() { if (el.parent) el.parent.kinder.delete(el); el.parent = null; },
    animate(keyframes, opts) {
      const a = { keyframes, opts, onfinish: null, abgebrochen: false, cancel() { a.abgebrochen = true; } };
      el.anim = a;
      return a;
    }
  };
  return el;
}
function fakeEbene() {
  const e = {
    kinder: new Set(), clientWidth: 300, clientHeight: 200,
    appendChild(el) { el.parent = e; e.kinder.add(el); },
    getBoundingClientRect() { return { left: 10, top: 20, width: 300, height: 200 }; }
  };
  return e;
}
function aufbau(extra = {}) {
  const doc = { visibilityState: 'visible', createElement: () => fakeEl() };
  const hinten = fakeEbene(), vorn = fakeEbene();
  const intervalle = new Map(); let iid = 0;
  const frames = new Map(); let fid = 0;
  const engine = createEngine({
    ebenen: { hinten, vorn }, doc, max: 5,
    setInterval: (fn) => { intervalle.set(++iid, fn); return iid; },
    clearInterval: (id) => intervalle.delete(id),
    raf: (fn) => { frames.set(++fid, fn); return fid; },
    caf: (id) => frames.delete(id),
    ...extra
  });
  const tickIntervalle = () => [...intervalle.values()].forEach((f) => f());
  const tickFrame = (t) => { const alle = [...frames.entries()]; frames.clear(); alle.forEach(([, f]) => f(t)); };
  return { engine, doc, hinten, vorn, intervalle, frames, tickIntervalle, tickFrame };
}
const kf = [{ transform: tr(0, 0) }, { transform: tr(10, 10) }];

test('spawn haengt an, setzt Grundstil und raeumt nach Ablauf auf', () => {
  const { engine, hinten } = aufbau();
  const el = engine.spawn({ inhalt: '🌸', keyframes: kf, dauerMs: 500 });
  assert.ok(el);
  assert.equal(hinten.kinder.size, 1);
  assert.equal(el.style.position, 'absolute');
  assert.equal(el.style.pointerEvents, 'none');
  assert.equal(el.textContent, '🌸');
  assert.equal(engine.anzahl(), 1);
  el.anim.onfinish();
  assert.equal(hinten.kinder.size, 0);
  assert.equal(engine.anzahl(), 0);
});

test('spawn waehlt die Ebene, fehlende Ebene -> null', () => {
  const { engine, vorn } = aufbau();
  assert.ok(engine.spawn({ ebene: 'vorn', keyframes: kf, dauerMs: 100 }));
  assert.equal(vorn.kinder.size, 1);
  assert.equal(engine.spawn({ ebene: 'gast', keyframes: kf, dauerMs: 100 }), null);
});

test('Obergrenze skaliert mit dem Faktor, Faktor 0 erzeugt nichts', () => {
  const { engine } = aufbau();
  for (let i = 0; i < 5; i++) assert.ok(engine.spawn({ keyframes: kf, dauerMs: 100 }));
  assert.equal(engine.spawn({ keyframes: kf, dauerMs: 100 }), null);
  const b = aufbau({ faktor: 0.4 });           // round(5 * 0.4) = 2
  assert.ok(b.engine.spawn({ keyframes: kf, dauerMs: 100 }));
  assert.ok(b.engine.spawn({ keyframes: kf, dauerMs: 100 }));
  assert.equal(b.engine.spawn({ keyframes: kf, dauerMs: 100 }), null);
  const c = aufbau({ faktor: 0 });
  assert.equal(c.engine.spawn({ keyframes: kf, dauerMs: 100 }), null);
  assert.equal(c.engine.element({}), null);
});

test('element ist dauerhaft und zaehlt zur Obergrenze', () => {
  const { engine, hinten } = aufbau();
  const fisch = engine.element({ stil: { width: '10px' } });
  assert.equal(fisch.style.width, '10px');
  assert.equal(engine.anzahl(), 1);
  engine.entferne(fisch);
  assert.equal(hinten.kinder.size, 0);
  assert.equal(engine.anzahl(), 0);
});

test('entferne bricht die Animation eines Partikels ab', () => {
  const { engine } = aufbau();
  const el = engine.spawn({ keyframes: kf, dauerMs: 100 });
  engine.entferne(el);
  assert.equal(el.anim.abgebrochen, true);
  assert.equal(engine.anzahl(), 0);
});

test('intervall laeuft nur sichtbar und unpausiert', () => {
  const { engine, doc, tickIntervalle } = aufbau();
  let n = 0;
  engine.intervall(() => n++, 100);
  tickIntervalle(); assert.equal(n, 1);
  doc.visibilityState = 'hidden'; tickIntervalle(); assert.equal(n, 1);
  doc.visibilityState = 'visible'; engine.pausieren(true); tickIntervalle(); assert.equal(n, 1);
  engine.pausieren(false); tickIntervalle(); assert.equal(n, 2);
});

test('schleife: laeuft, haelt bei Pause an (kein neuer Frame), weiter() startet neu', () => {
  const { engine, frames, tickFrame } = aufbau();
  const dts = [];
  engine.schleife((dt) => dts.push(dt));
  tickFrame(1000); tickFrame(1016);
  assert.deepEqual(dts, [16, 16]);
  engine.pausieren(true);
  tickFrame(1032);
  assert.equal(frames.size, 0, 'pausiert: kein Frame mehr angefordert');
  engine.pausieren(false);
  engine.weiter();
  assert.equal(frames.size, 1);
  tickFrame(5000);
  assert.equal(dts.length, 3);
  assert.equal(dts[2], 16, 'nach Pause kein Riesen-dt');
});

test('stop raeumt alles und blockiert weitere Partikel', () => {
  const { engine, hinten, intervalle, frames } = aufbau();
  const p = engine.spawn({ keyframes: kf, dauerMs: 100 });
  engine.element({});
  engine.intervall(() => {}, 100);
  engine.schleife(() => {});
  engine.stop();
  assert.equal(hinten.kinder.size, 0);
  assert.equal(p.anim.abgebrochen, true);
  assert.equal(intervalle.size, 0);
  assert.equal(frames.size, 0);
  assert.equal(engine.anzahl(), 0);
  assert.equal(engine.spawn({ keyframes: kf, dauerMs: 100 }), null);
  assert.equal(engine.laeuft(), false);
});

test('groesse und rechteck lesen die Ebene', () => {
  const { engine } = aufbau();
  assert.deepEqual(engine.groesse('hinten'), { w: 300, h: 200 });
  assert.deepEqual(engine.groesse('gast'), { w: 0, h: 0 });
  assert.equal(engine.rechteck('hinten').left, 10);
});
