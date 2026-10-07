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

for (const id of ['wald']) {
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

// --- Welle 1b: Partikelfarbe ---------------------------------------------------
function sammelEngine() {
  const stile = [];
  const e = {
    element(p) { stile.push(JSON.stringify((p && p.stil) || {})); return { style: {}, appendChild() {} }; },
    spawn(p) { stile.push(JSON.stringify(p.stil || {})); return { style: {}, isConnected: true, getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) }; },
    schleife() {}, intervall(fn) { fn(); }, entferne() {},
    groesse: () => ({ w: 300, h: 200 }), rechteck: () => ({ left: 0, top: 0 }), faktor: 1
  };
  return { e, stile };
}
for (const id of ['wald', 'blasen']) {
  test(id + ': Partikel nutzen farben.partikel', () => {
    const fabrik = ladeWelt(id);
    const { e, stile } = sammelEngine();
    const welt = fabrik({ engine: e, fenster: 'chat', FxEngine, farben: { partikel: '#12ab34' } });
    welt.start();
    welt.ereignis('kiste', { betrag: 50, ursprung: { x: 100, y: 100 } });
    assert.ok(stile.some((s) => s.includes('#12ab34')), 'Farbe taucht in Partikel-Stilen auf: ' + stile.slice(0, 3).join(' | '));
  });
}

// --- Koi (gezeichnet): jede Variante mit Ersatz-Canvas -----------------------
// Kontext-Attrappe: jede Methode ist ein No-op, Erzeuger liefern brauchbare
// Objekte, Farb-Zuweisungen werden mitgeschrieben.
function fakeCtx(farben) {
  const ziel = {};
  return new Proxy(ziel, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'getImageData' || k === 'createImageData') {
        return (...a) => { const w = a.length === 4 ? a[2] : a[0], h = a.length === 4 ? a[3] : a[1]; return { data: new Uint8ClampedArray(Math.max(1, w * h) * 4) }; };
      }
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'createPattern') return () => ({});
      return () => {};
    },
    set(o, k, v) { if (k === 'fillStyle' || k === 'strokeStyle') farben.add(String(v)); o[k] = v; return true; }
  });
}
function canvasDoc(farben) {
  return {
    createElement: (tag) => {
      const el = { tag, style: {}, width: 0, height: 0, kinder: [], appendChild(c) { el.kinder.push(c); }, remove() {},
        animate: () => ({ cancel() {} }) };
      if (tag === 'canvas') el.getContext = () => fakeCtx(farben);
      return el;
    }
  };
}
function ladeGezeichnet(id, farben) {
  global.window = global.window || {};
  global.document = canvasDoc(farben);
  for (const datei of ['stile.js', 'welt.js']) {
    const p = path.join(__dirname, '..', 'renderer', 'themes', id, datei);
    delete require.cache[p];
    require(p);
  }
  return global.window.TwitchDualWelten[id];
}
function ladeKoi(farben) { return ladeGezeichnet('koi', farben); }
function koiEngine(farben) {
  const ebene = { clientWidth: 0, clientHeight: 0, kinder: [], appendChild(c) { ebene.kinder.push(c); } };
  const engine = FxEngine.createEngine({
    ebenen: { hinten: ebene, gast: ebene }, doc: canvasDoc(farben), dpr: 1,
    sichtbar: () => true, raf: () => 1, caf: () => {}, setInterval: () => 1, clearInterval: () => {}
  });
  const schleifen = [];
  const orig = engine.schleife;
  engine.schleife = (fn) => { schleifen.push(fn); return orig.call(engine, () => {}); };
  return { engine, ebene, schleifen };
}

const KOI_VARIANTEN = require('../renderer/lib/themes').themeById('koi').varianten.map((v) => v.id);
for (const variante of KOI_VARIANTEN) {
  test('koi/' + variante + ': startet bei 0x0, zeichnet sobald sichtbar, Partikelfarbe kommt vor', () => {
    const farben = new Set();
    const fabrik = ladeKoi(farben);
    assert.ok(global.window.KoiStile.stile[variante], 'Stil vorhanden');
    const { engine, ebene, schleifen } = koiEngine(farben);
    const welt = fabrik({ engine, fenster: 'chat', FxEngine, farben: { partikel: '#12ab34' }, variante });
    welt.start();
    assert.equal(ebene.kinder.length, 1, 'eine Leinwand');
    for (const fn of schleifen) fn(40);           // unsichtbar: darf nicht werfen
    ebene.clientWidth = 360; ebene.clientHeight = 500;
    for (let i = 0; i < 20; i++) for (const fn of schleifen) fn(40);
    welt.maus(100, 100);
    welt.klickInsLeere(120, 140);
    welt.ereignis('kiste', { ursprung: { x: 300, y: 480 } });
    welt.ereignis('punkte', { ursprung: { x: 300, y: 480 } });
    welt.ereignis('raid', { name: 'Testkanal', anzahl: 120 });
    welt.ereignis('abo', { name: 'TestZuschauer', monate: 12, ursprung: { x: 180, y: 220 } });
    welt.ereignis('abo', { name: 'Ohne Ort' });
    for (let i = 0; i < 200; i++) for (const fn of schleifen) fn(40);   // Schwarm zieht ganz durch
    assert.ok(farben.has('#12ab34'), 'Partikelfarbe benutzt');
    welt.gast();
    welt.stop();
    engine.stop();
    assert.equal(ebene.kinder.length >= 1, true);
  });
}

test('koi: unbekannte Variante faellt auf Aquarell zurueck', () => {
  const farben = new Set();
  const fabrik = ladeKoi(farben);
  const { engine, ebene, schleifen } = koiEngine(farben);
  const welt = fabrik({ engine, fenster: 'chat', FxEngine, farben: { partikel: '#12ab34' }, variante: 'gibtsnicht' });
  welt.start();
  ebene.clientWidth = 200; ebene.clientHeight = 200;
  for (let i = 0; i < 5; i++) for (const fn of schleifen) fn(40);
  assert.ok(farben.has('#dfeae2'), 'Aquarell-Grund gezeichnet');
});

test('koi: waehrend einer Abo-Welle bilden die Fische keinen Haufen', () => {
  const farben = new Set();
  const fabrik = ladeKoi(farben);
  const { engine, ebene, schleifen } = koiEngine(farben);
  let jetzt = 0;
  const echt = Date.now;
  Date.now = () => jetzt;
  try {
    const welt = fabrik({ engine, fenster: 'chat', FxEngine, farben: { partikel: '#12ab34' }, variante: 'lofi' });
    welt.start();
    ebene.clientWidth = 1000; ebene.clientHeight = 600;
    const tick = (ms) => { for (let t = 0; t < ms; t += 33) { jetzt += 33; for (const fn of schleifen) fn(33); } };
    tick(500);
    // Abo-Welle: 15 Abos im Abstand von 1,5 s, gemessen MITTEN in der Welle.
    const messungen = [];
    for (let i = 0; i < 15; i++) {
      welt.ereignis('abo', { name: 'A' + i, ursprung: { x: 900, y: 80 } });
      tick(1500);
      if (i >= 8) messungen.push(welt.fischPositionen());
    }
    const p = messungen[messungen.length - 1];
    if (process.env.KOI_DEBUG) console.log('Abstaende', messungen.map((m) => { let s2 = 0, n = 0; for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) { s2 += Math.hypot(m[i].x - m[j].x, m[i].y - m[j].y); n++; } return Math.round(s2 / n); }).join(','));
    let summe = 0, paare = 0, kleinster = Infinity;
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
      const d = Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
      summe += d; paare++; kleinster = Math.min(kleinster, d);
    }
    assert.ok(summe / paare > 80, 'mittlerer Abstand ' + Math.round(summe / paare));
    assert.ok(kleinster > 15, 'kleinster Abstand ' + Math.round(kleinster));
  } finally {
    Date.now = echt;
  }
});

test('koi: Gast kommt von aussen, schwimmt umher, verlaesst das Bild woanders', () => {
  const farben = new Set();
  const fabrik = ladeKoi(farben);
  const bilder = [];
  const gast = { clientWidth: 1000, clientHeight: 600, kinder: [], appendChild(c) { gast.kinder.push(c); } };
  const hinten = { clientWidth: 0, clientHeight: 0, appendChild() {} };
  const engine = FxEngine.createEngine({ ebenen: { hinten, gast }, doc: canvasDoc(farben), dpr: 1,
    sichtbar: () => true, raf: (fn) => { bilder.push(fn); return bilder.length; }, caf() {}, setInterval: () => 1, clearInterval() {} });
  let jetzt = 0;
  const echt = Date.now;
  Date.now = () => jetzt;
  try {
    const welt = fabrik({ engine, fenster: 'video', FxEngine, farben: { partikel: '#12ab34' }, variante: 'lofi' });
    welt.start();
    engine.pausieren(true);                 // Teich ruht waehrend des Streams
    welt.gast();
    let zeit = 0, bilderZahl = 0;
    while (bilder.length && zeit < 40000) {
      const fn = bilder.shift();
      jetzt += 33; zeit += 33; bilderZahl++;
      fn(zeit);
    }
    assert.equal(bilder.length, 0, 'Animation endet von selbst');
    assert.ok(zeit > 5000 && zeit < 30000, 'Auftritt dauert ein paar Sekunden: ' + zeit + ' ms');
    assert.ok(bilderZahl > 100, 'wurde wirklich animiert');
  } finally {
    Date.now = echt;
  }
});

// --- Sakura (gezeichnet): jede Variante ---------------------------------------
const SAKURA_VARIANTEN = require('../renderer/lib/themes').themeById('sakura').varianten.map((v) => v.id);
for (const variante of SAKURA_VARIANTEN) {
  test('sakura/' + variante + ': startet bei 0x0, zeichnet sobald sichtbar, alle Ereignisse laufen durch', () => {
    const farben = new Set();
    const fabrik = ladeGezeichnet('sakura', farben);
    assert.ok(global.window.SakuraStile.stile[variante], 'Stil vorhanden');
    const { engine, ebene, schleifen } = koiEngine(farben);
    const welt = fabrik({ engine, fenster: 'chat', FxEngine, farben: { partikel: '#12ab34' }, variante });
    welt.start();
    assert.equal(ebene.kinder.length, 1, 'eine Leinwand');
    for (const fn of schleifen) fn(40);           // unsichtbar: darf nicht werfen
    ebene.clientWidth = 360; ebene.clientHeight = 500;
    for (let i = 0; i < 30; i++) for (const fn of schleifen) fn(40);
    assert.ok(welt.blattZahl() > 0, 'Blueten fallen');
    welt.maus(100, 100);
    welt.klickInsLeere(120, 140);
    welt.ereignis('kiste', { ursprung: { x: 300, y: 480 } });
    welt.ereignis('punkte', { ursprung: { x: 300, y: 480 } });
    welt.ereignis('raid', { name: 'Testkanal', anzahl: 120 });
    welt.ereignis('abo', { name: 'TestZuschauer', monate: 12, ursprung: { x: 180, y: 220 } });
    welt.ereignis('abo', { zeilen: ['Ohne Ort', 'verschenkt 5 Abos'] });
    for (let i = 0; i < 300; i++) for (const fn of schleifen) fn(40);   // Sturm zieht ganz durch
    assert.ok(farben.has('#12ab34') || [...farben].some((f) => f.includes('18,171,52')), 'Partikelfarbe benutzt');
    assert.ok(welt.blattZahl() < 400, 'Blaetter laufen nicht voll: ' + welt.blattZahl());
    welt.stop();
    engine.stop();
  });
}

test('sakura: Gast weht ueber das Video und endet von selbst', () => {
  const farben = new Set();
  const fabrik = ladeGezeichnet('sakura', farben);
  const bilder = [];
  const gast = { clientWidth: 1000, clientHeight: 600, kinder: [], appendChild(c) { gast.kinder.push(c); } };
  const hinten = { clientWidth: 0, clientHeight: 0, appendChild() {} };
  const engine = FxEngine.createEngine({ ebenen: { hinten, gast }, doc: canvasDoc(farben), dpr: 1,
    sichtbar: () => true, raf: (fn) => { bilder.push(fn); return bilder.length; }, caf() {}, setInterval: () => 1, clearInterval() {} });
  for (const variante of SAKURA_VARIANTEN) {
    const welt = fabrik({ engine, fenster: 'video', FxEngine, farben: { partikel: '#12ab34' }, variante });
    welt.start();
    engine.pausieren(true);
    welt.gast();
    welt.gast();                                 // zweiter Gast in derselben Schleife
    let zeit = 0;
    while (bilder.length && zeit < 40000) { const fn = bilder.shift(); zeit += 33; fn(zeit); }
    assert.equal(bilder.length, 0, variante + ': Animation endet von selbst');
    assert.ok(zeit > 3000 && zeit < 14000, variante + ': Auftritt passt in die Gast-Dauer: ' + zeit + ' ms');
    welt.stop();
  }
});

test('sakura: Hanami-Fluss - Blueten landen im Wasser und treiben weg', () => {
  const farben = new Set();
  const fabrik = ladeGezeichnet('sakura', farben);
  const { engine, ebene, schleifen } = koiEngine(farben);
  const welt = fabrik({ engine, fenster: 'chat', FxEngine, farben: { partikel: '#12ab34' }, variante: 'fluss' });
  welt.start();
  ebene.clientWidth = 400; ebene.clientHeight = 600;
  for (let i = 0; i < 400; i++) for (const fn of schleifen) fn(40);
  assert.ok(welt.schwimmZahl() > 0, 'es treiben Blueten');
});

test('sakura: es fallen verschiedene Formen (Blatt, Bluete, gefuellte, Paar)', () => {
  const farben = new Set();
  const fabrik = ladeGezeichnet('sakura', farben);
  const { engine, ebene, schleifen } = koiEngine(farben);
  const welt = fabrik({ engine, fenster: 'chat', FxEngine, farben: { partikel: '#12ab34' }, variante: 'holzschnitt' });
  welt.start();
  ebene.clientWidth = 400; ebene.clientHeight = 600;
  for (let i = 0; i < 40; i++) welt.klickInsLeere(200, 200);   // viele Blaetter auf einmal
  for (const fn of schleifen) fn(40);
  assert.deepEqual(welt.formen(), ['blatt', 'bluete', 'paar', 'yae']);
});
