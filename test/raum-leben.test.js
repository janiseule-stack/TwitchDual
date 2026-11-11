const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const RL = require('../renderer/lib/raum-leben.js');

test('schirmAnzahl: Stufen', () => {
  const eingabe = [0, undefined, 'x', 1, 9, 10, 49, 50, 199, 200, 100000];
  const soll = [1, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4];
  assert.deepStrictEqual(eingabe.map(RL.schirmAnzahl), soll);
});

test('Konstanten und Takt', () => {
  assert.strictEqual(RL.DAUER_KISTE, 4000);
  assert.strictEqual(RL.MAX_WARTEND, 3);
  assert.strictEqual(RL.MAX_ALTER, 30000);
  for (const k of Object.keys(RL.TAKT)) {
    assert.ok(RL.TAKT[k].msProBild >= 100 && RL.TAKT[k].msProBild <= 250, k);
  }
  assert.deepStrictEqual(RL.TAKT.katze.pause, { min: 8000, max: 20000 });
  assert.deepStrictEqual(RL.TAKT.lampe.pause, { min: 10000, max: 30000 });
  assert.strictEqual(RL.TAKT.regen.modus, 'schleife');
  assert.strictEqual(RL.TAKT.lampe.modus, 'selten');
});

test('naechstePause', () => {
  const p = { min: 8000, max: 20000 };
  assert.strictEqual(RL.naechstePause(() => 0, p), 8000);
  assert.strictEqual(RL.naechstePause(() => 1, p), 20000);
  assert.strictEqual(RL.naechstePause(() => 0.5, p), 14000);
});

test('warteschlange: Obergrenze, Reihenfolge, Alter, leeren', () => {
  let t = 0;
  const s = RL.warteschlange({ jetzt: () => t });
  for (let i = 0; i < 10; i++) s.rein('raid', { i });
  assert.strictEqual(s.laenge, 3);
  assert.deepStrictEqual([s.naechstes().daten.i, s.naechstes().daten.i, s.naechstes().daten.i], [7, 8, 9]);
  assert.strictEqual(s.naechstes(), null);

  s.rein('kiste', { a: 1 });
  t = 30001;
  assert.strictEqual(s.naechstes(), null);
  t = 40000;
  s.rein('kiste', { a: 2 });
  t = 70000;
  const ev = s.naechstes();
  assert.strictEqual(ev.art, 'kiste');
  assert.strictEqual(ev.zeit, 40000);

  s.rein('raid', {});
  s.leeren();
  assert.strictEqual(s.laenge, 0);
});

function fake() {
  const timer = [];
  return {
    timer,
    setTimeout: (fn, ms) => { timer.push({ fn, ms, weg: false }); return timer.length - 1; },
    clearTimeout: (id) => { if (timer[id]) timer[id].weg = true; },
    feuere: (i) => { if (!timer[i].weg) { timer[i].weg = true; timer[i].fn(); } },
  };
}

function bau(aktiv = () => true) {
  const f = fake();
  const log = { start: [], stop: 0 };
  const schlange = RL.warteschlange({ jetzt: () => 0 });
  const a = RL.abspieler({
    schlange, aktiv,
    starte: (ev) => log.start.push(ev.daten.n),
    stoppe: () => { log.stop++; },
    dauer: () => 1000,
    setTimeout: f.setTimeout, clearTimeout: f.clearTimeout,
  });
  return { f, log, schlange, a };
}

test('abspieler: nacheinander', () => {
  const { f, log, a } = bau();
  a.melde('raid', { n: 1 });
  a.melde('raid', { n: 2 });
  assert.deepStrictEqual(log.start, [1]);
  assert.strictEqual(a.laeuft, true);
  assert.strictEqual(f.timer[0].ms, 1000);
  f.feuere(0);
  assert.deepStrictEqual(log.start, [1, 2]);
  f.feuere(1);
  assert.strictEqual(a.laeuft, false);
});

test('abspieler: Ende der Dauer raeumt den Effekt auf (auch ohne animationend, z. B. Fenster verdeckt)', () => {
  const { f, log, a } = bau();
  a.melde('kiste', { n: 1 });
  assert.strictEqual(log.stop, 0);
  f.feuere(0);
  assert.strictEqual(log.stop, 1, 'nach der Dauer gestoppt');
  assert.strictEqual(a.laeuft, false);
  a.aus();
  assert.strictEqual(log.stop, 1, 'aus() danach stoppt nicht doppelt');
});

test('abspieler: aus() waehrend Lauf', () => {
  const { f, log, schlange, a } = bau();
  a.melde('raid', { n: 1 });
  a.melde('raid', { n: 2 });
  a.aus();
  assert.strictEqual(log.stop, 1);
  assert.strictEqual(schlange.laenge, 0);
  assert.strictEqual(a.laeuft, false);
  assert.strictEqual(f.timer[0].weg, true);
  f.feuere(0);
  assert.deepStrictEqual(log.start, [1]);
  // neuer Effekt nach aus(): alter Timer darf ihn nicht kuerzen
  a.melde('raid', { n: 3 });
  assert.deepStrictEqual(log.start, [1, 3]);
  f.feuere(0);
  assert.strictEqual(a.laeuft, true);
});

test('abspieler: starte wirft -> naechstes Ereignis laeuft', () => {
  const f = fake();
  const gestartet = [];
  const schlange = RL.warteschlange({ jetzt: () => 0 });
  const a = RL.abspieler({
    schlange, aktiv: () => true,
    starte: (ev) => { if (ev.daten.n === 1) throw new Error('kaputt'); gestartet.push(ev.daten.n); },
    stoppe() {}, dauer: () => 1000,
    setTimeout: f.setTimeout, clearTimeout: f.clearTimeout,
  });
  schlange.rein('raid', { n: 1 });
  schlange.rein('raid', { n: 2 });
  a.melde('raid', { n: 3 });
  assert.deepStrictEqual(gestartet, [2]);
  assert.strictEqual(a.laeuft, true);
  f.feuere(0);
  assert.deepStrictEqual(gestartet, [2, 3]);
  // einzelnes kaputtes Ereignis: danach nicht haengen
  const b = RL.abspieler({
    schlange: RL.warteschlange({ jetzt: () => 0 }), aktiv: () => true,
    starte: () => { throw new Error('x'); }, stoppe() {}, dauer: () => 1,
    setTimeout: f.setTimeout, clearTimeout: f.clearTimeout,
  });
  b.melde('raid', { n: 1 });
  assert.strictEqual(b.laeuft, false);
});

test('abspieler: aus() innerhalb von starte hinterlaesst keinen Timer', () => {
  const f = fake();
  const gestartet = [];
  let a;
  const schlange = RL.warteschlange({ jetzt: () => 0 });
  a = RL.abspieler({
    schlange, aktiv: () => true,
    starte: (ev) => { gestartet.push(ev.daten.n); if (ev.daten.n === 1) a.aus(); },
    stoppe() {}, dauer: () => 1000,
    setTimeout: f.setTimeout, clearTimeout: f.clearTimeout,
  });
  a.melde('raid', { n: 1 });
  assert.strictEqual(f.timer.length, 0);
  assert.strictEqual(a.laeuft, false);
  a.melde('raid', { n: 2 });
  assert.strictEqual(f.timer.length, 1);
  assert.strictEqual(a.laeuft, true);
});

test('abspieler: Ueberlauf und veraltete Ereignisse', () => {
  let t = 0;
  const f = fake();
  const gestartet = [];
  const a = RL.abspieler({
    schlange: RL.warteschlange({ jetzt: () => t }), aktiv: () => true,
    starte: (ev) => gestartet.push(ev.daten.n), stoppe() {}, dauer: () => 1000,
    setTimeout: f.setTimeout, clearTimeout: f.clearTimeout,
  });
  for (let n = 1; n <= 5; n++) a.melde('raid', { n });
  assert.deepStrictEqual(gestartet, [1]);
  t = 30001;
  f.feuere(0); // wartende 3..5 (Zeit 0) sind veraltet
  assert.deepStrictEqual(gestartet, [1]);
  assert.strictEqual(a.laeuft, false);
});

test('warteschlange: genau 30000 ms bleibt', () => {
  let t = 0;
  const s = RL.warteschlange({ jetzt: () => t });
  s.rein('raid', { n: 1 });
  t = 30000;
  assert.strictEqual(s.naechstes().daten.n, 1);
});

test('abspieler: inaktiv verwirft', () => {
  const { log, a } = bau(() => false);
  a.melde('raid', { n: 1 });
  assert.deepStrictEqual(log.start, []);
  assert.strictEqual(a.laeuft, false);
});

test('beide index.html laden raum-leben.js vor dem Hauptskript', () => {
  const lies = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const chat = lies('renderer/chat/index.html');
  const a = chat.indexOf('../lib/raum-leben.js');
  assert.ok(a > chat.indexOf('../lib/szene.js'));
  assert.ok(a > -1 && a < chat.indexOf('src="chat.js"'));
  const video = lies('renderer/video/index.html');
  const b = video.indexOf('raum-leben.js');
  assert.ok(b > -1 && b < video.indexOf('src="home-raum-dom.js"'));
});

// --- Etappe 3, Task 5: Home-Raum lebt ------------------------------------------------
const LEBEN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'raum-quellen', 'leben.json'), 'utf8'));

test('HOME: Ziel-Rechtecke, Bildzahl und Dateien identisch mit leben.json, Takt vorhanden', () => {
  const soll = LEBEN.home.animationen.map((a) => ({
    id: a.id, x: a.ziel.x, y: a.ziel.y, b: a.ziel.b, h: a.ziel.h, bilder: a.bilder, dateien: a.dateien,
  }));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(RL.HOME)), soll);
  for (const e of RL.HOME) assert.ok(RL.TAKT[e.id], 'Takt fuer ' + e.id);
  assert.ok(Object.isFrozen(RL.HOME));
});

// Kleines Schein-DOM fuer RaumLebenDom.baue
function scheinDoc() {
  return {
    createElement(tag) {
      const klassen = new Set();
      const hoerer = {};
      const props = {};
      return {
        tag, dataset: {},
        set className(v) { klassen.clear(); String(v).split(/\s+/).filter(Boolean).forEach((k) => klassen.add(k)); },
        get className() { return [...klassen].join(' '); },
        classList: {
          add: (...k) => k.forEach((x) => klassen.add(x)),
          remove: (...k) => k.forEach((x) => klassen.delete(x)),
          contains: (k) => klassen.has(k),
          toggle: (k, an) => { if (an === undefined ? !klassen.has(k) : an) klassen.add(k); else klassen.delete(k); },
        },
        style: { setProperty: (k, v) => { props[k] = String(v); }, props },
        addEventListener: (art, f) => { (hoerer[art] = hoerer[art] || []).push(f); },
        feuere(art) { (hoerer[art] || []).forEach((f) => f({ type: art, target: this })); },
      };
    },
  };
}
function scheinUhr() {
  const timer = new Map();
  let nr = 0;
  return {
    setTimeout: (f, ms) => { timer.set(++nr, { f, ms }); return nr; },
    clearTimeout: (id) => { timer.delete(id); },
    timer,
    feuereAlle() { const alle = [...timer.entries()]; timer.clear(); alle.forEach(([, t]) => t.f()); },
  };
}

const RLD = require('../renderer/lib/raum-leben-dom.js');

test('RaumLebenDom.baue: je Eintrag ein div.raum-leben in Bildpixeln mit --bilder, --dauer, --sb und Streifen', () => {
  const ebene = { kinder: [], appendChild(e) { this.kinder.push(e); } };
  const uhr = scheinUhr();
  RLD.baue(scheinDoc(), ebene, RL.HOME, '../themes/cozy/leben-home-', uhr);
  assert.strictEqual(ebene.kinder.length, RL.HOME.length);
  RL.HOME.forEach((e, i) => {
    const d = ebene.kinder[i];
    const takt = RL.TAKT[e.id];
    assert.ok(d.classList.contains('raum-leben'));
    assert.strictEqual(d.classList.contains('selten'), takt.modus === 'selten', e.id);
    assert.strictEqual(d.style.left, e.x + 'px');
    assert.strictEqual(d.style.top, e.y + 'px');
    assert.strictEqual(d.style.width, e.b + 'px');
    assert.strictEqual(d.style.height, e.h + 'px');
    assert.strictEqual(d.style.props['--bilder'], String(e.bilder));
    assert.strictEqual(d.style.props['--dauer'], e.bilder * takt.msProBild + 'ms');
    assert.strictEqual(d.style.props['--sb'], e.bilder * e.b + 'px');
    assert.strictEqual(d.style.backgroundImage, "url('../themes/cozy/leben-home-" + e.dateien[0] + ".png')");
    assert.ok(d.classList.contains('ruht'), 'vor an() still');
    assert.ok(!d.classList.contains('spielt'));
  });
  assert.strictEqual(uhr.timer.size, 0, 'keine Timer vor an()');
});

test('RaumLebenDom: an() spielt selten einmal, Pause per naechstePause, aus() raeumt alles weg', () => {
  const ebene = { kinder: [], appendChild(e) { this.kinder.push(e); } };
  const uhr = scheinUhr();
  let z = 0.5;
  const s = RLD.baue(scheinDoc(), ebene, RL.HOME, 'p-', { ...uhr, zufall: () => z });
  const el = (id) => ebene.kinder[RL.HOME.findIndex((e) => e.id === id)];
  s.an();
  for (const d of ebene.kinder) assert.ok(!d.classList.contains('ruht'));
  assert.ok(el('katze').classList.contains('spielt') && el('lampe').classList.contains('spielt'));
  assert.ok(!el('regen').classList.contains('spielt'), 'Schleife braucht kein spielt');
  s.an(); // doppelt: nichts doppelt planen
  assert.strictEqual(uhr.timer.size, 0);

  el('katze').feuere('animationend');
  assert.ok(!el('katze').classList.contains('spielt'));
  assert.strictEqual(uhr.timer.size, 1);
  assert.strictEqual([...uhr.timer.values()][0].ms, RL.naechstePause(() => z, RL.TAKT.katze.pause));

  // Zwei Katzen-Dateien: jeder Auftritt waehlt per Zufall eine.
  z = 0.99;
  uhr.feuereAlle();
  assert.ok(el('katze').classList.contains('spielt'));
  assert.strictEqual(el('katze').style.backgroundImage, "url('p-katze2.png')");
  el('katze').feuere('animationend');
  z = 0;
  uhr.feuereAlle();
  assert.strictEqual(el('katze').style.backgroundImage, "url('p-katze1.png')");

  el('lampe').feuere('animationend');
  assert.strictEqual(uhr.timer.size, 1);
  s.aus();
  assert.strictEqual(uhr.timer.size, 0, 'aus() loescht alle Timer');
  for (const d of ebene.kinder) {
    assert.ok(!d.classList.contains('spielt'));
    assert.ok(d.classList.contains('ruht'));
  }
  el('katze').feuere('animationend');
  assert.strictEqual(uhr.timer.size, 0, 'nach aus() nichts mehr planen');
  s.an();
  assert.ok(el('lampe').classList.contains('spielt'), 'wieder an');
});

// --- Etappe 3, Task 6: Chat-Streifen, Raid und Kiste ---------------------------------
test('STREIFEN, GLAS, KISTE, RAID: identisch mit leben.json', () => {
  const s = LEBEN.streifen;
  const soll = s.animationen.map((a) => ({
    id: a.id, x: a.ziel.x, y: a.ziel.y, b: a.ziel.b, h: a.ziel.h, bilder: a.bilder, dateien: a.dateien,
  }));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(RL.STREIFEN)), soll);
  for (const e of RL.STREIFEN) assert.ok(RL.TAKT[e.id], 'Takt fuer ' + e.id);
  assert.ok(Object.isFrozen(RL.STREIFEN));
  const g = s.glas;
  assert.deepStrictEqual({ ...RL.GLAS }, { x: g.x, y: g.y, b: g.b, h: g.h });
  const k = s.kiste;
  assert.deepStrictEqual({ ...RL.KISTE }, { x: k.ziel.x, y: k.ziel.y, b: k.ziel.b, h: k.ziel.h, bilder: k.bilder, msProBild: k.msProBild });
  const r = s.raid;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(RL.RAID)), {
    bilder: r.bilder, b: r.b, h: r.h, msProBild: r.msProBild, y: r.y, pxProBild: r.pxProBild, versatzMs: r.versatzMs, dateien: r.dateien,
  });
  for (const o of [RL.GLAS, RL.KISTE, RL.RAID]) assert.ok(Object.isFrozen(o));
});

test('Raid und Kiste: ruhiger Takt, Kiste endet vor DAUER_KISTE, Figur steht im Glas', () => {
  for (const ms of [RL.KISTE.msProBild, RL.RAID.msProBild]) assert.ok(ms >= 100 && ms <= 250, String(ms));
  assert.ok(RL.KISTE.bilder * RL.KISTE.msProBild <= RL.DAUER_KISTE);
  assert.ok(RL.RAID.y >= RL.GLAS.y && RL.RAID.y + RL.RAID.h <= RL.GLAS.y + RL.GLAS.h + 8);
  assert.ok(Number.isInteger(RL.RAID.pxProBild) && RL.RAID.pxProBild > 0);
});

test('raidDauer: Schritte ueber das Glas mal Takt plus Versatz je weiterer Figur', () => {
  const schritte = Math.ceil((RL.GLAS.b + RL.RAID.b) / RL.RAID.pxProBild);
  assert.strictEqual(RL.raidSchritte(), schritte);
  assert.strictEqual(RL.raidDauer(1), schritte * RL.RAID.msProBild);
  assert.strictEqual(RL.raidDauer(4), schritte * RL.RAID.msProBild + 3 * RL.RAID.versatzMs);
  assert.strictEqual(RL.raidDauer(RL.schirmAnzahl(100000)), RL.raidDauer(4));
  assert.strictEqual(RL.raidDauer(0), RL.raidDauer(1), 'Muell -> 1 Figur');
});

// Schein-DOM mit Baum fuer RaumLebenDom.effekte
function baumDoc() {
  const doc = scheinDoc();
  const erzeuge = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const el = erzeuge(tag);
    el.kinder = [];
    el.parent = null;
    el.appendChild = (k) => { k.parent = el; el.kinder.push(k); return k; };
    el.insertBefore = (k, vor) => {
      k.parent = el;
      const i = vor ? el.kinder.indexOf(vor) : -1;
      if (i < 0) el.kinder.push(k); else el.kinder.splice(i, 0, k);
      return k;
    };
    el.removeChild = (k) => { el.kinder.splice(el.kinder.indexOf(k), 1); k.parent = null; return k; };
    Object.defineProperty(el, 'firstChild', { get: () => el.kinder[0] || null });
    return el;
  };
  return doc;
}

test('RaumLebenDom.effekte: Raid-Ebene ueber GLAS unter dem Leben, Kiste obenauf', () => {
  const doc = baumDoc();
  const ebene = doc.createElement('div');
  const leben = RLD.baue(doc, ebene, RL.STREIFEN, 'p/leben-streifen-', scheinUhr());
  const katze = ebene.kinder.find((d) => d.dataset.leben === 'katze');
  const fx = RLD.effekte(doc, ebene, 'p/', { katze });
  assert.ok(leben && fx.starte && fx.stoppe);
  const raid = ebene.kinder[0];
  const kiste = ebene.kinder[ebene.kinder.length - 1];
  assert.ok(raid.classList.contains('raum-raid'), 'Raid-Ebene liegt unter Regen/Katze/Lampe');
  assert.strictEqual(raid.style.left, RL.GLAS.x + 'px');
  assert.strictEqual(raid.style.top, RL.GLAS.y + 'px');
  assert.strictEqual(raid.style.width, RL.GLAS.b + 'px');
  assert.strictEqual(raid.style.height, RL.GLAS.h + 'px');
  assert.strictEqual(raid.style.props['--mx'], -RL.GLAS.x + 'px');
  assert.strictEqual(raid.style.props['--my'], -RL.GLAS.y + 'px');
  assert.ok(kiste.classList.contains('raum-kiste'));
  assert.strictEqual(kiste.style.left, RL.KISTE.x + 'px');
  assert.strictEqual(kiste.style.top, RL.KISTE.y + 'px');
  assert.strictEqual(kiste.style.props['--bilder'], String(RL.KISTE.bilder));
  assert.strictEqual(kiste.style.props['--dauer'], RL.KISTE.bilder * RL.KISTE.msProBild + 'ms');
  assert.strictEqual(kiste.style.props['--sb'], RL.KISTE.bilder * RL.KISTE.b + 'px');
  assert.strictEqual(kiste.style.backgroundImage, "url('p/leben-kiste.png')");
  assert.ok(!kiste.classList.contains('spielt'));
});

test('RaumLebenDom.effekte: Raid setzt 1-4 Figuren, im Gehtakt versetzt, raeumt am Ende auf', () => {
  const doc = baumDoc();
  const ebene = doc.createElement('div');
  const fx = RLD.effekte(doc, ebene, 'p/', {});
  const raid = ebene.kinder[0];
  const schritte = RL.raidSchritte();
  fx.starte({ art: 'raid', daten: { anzahl: 120 } });
  assert.strictEqual(raid.kinder.length, 3);
  raid.kinder.forEach((f, i) => {
    assert.ok(f.classList.contains('raum-raid-figur'));
    assert.strictEqual(f.style.top, RL.RAID.y - RL.GLAS.y + 'px');
    assert.strictEqual(f.style.width, RL.RAID.b + 'px');
    assert.strictEqual(f.style.height, RL.RAID.h + 'px');
    assert.strictEqual(f.style.props['--schritte'], String(schritte));
    assert.strictEqual(f.style.props['--dauer'], schritte * RL.RAID.msProBild + 'ms');
    assert.strictEqual(f.style.props['--von'], -RL.RAID.b + 'px');
    const bis = -RL.RAID.b + schritte * RL.RAID.pxProBild;
    assert.ok(bis >= RL.GLAS.b, 'laeuft ganz hinaus');
    assert.strictEqual(f.style.props['--bis'], bis + 'px');
    assert.strictEqual(f.style.props['--verzug'], i * RL.RAID.versatzMs + 'ms');
    const g = f.kinder[0];
    assert.ok(g.classList.contains('raum-raid-geht'));
    assert.strictEqual(g.style.props['--bilder'], String(RL.RAID.bilder));
    assert.strictEqual(g.style.props['--dauer'], RL.RAID.bilder * RL.RAID.msProBild + 'ms');
    assert.strictEqual(g.style.props['--sb'], RL.RAID.bilder * RL.RAID.b + 'px');
    assert.strictEqual(g.style.props['--verzug'], i * RL.RAID.versatzMs + 'ms');
    assert.strictEqual(g.style.backgroundImage, "url('p/leben-" + RL.RAID.dateien[i % RL.RAID.dateien.length] + ".png')");
  });
  // Gehzyklus-Ende (innen, Schleife) zaehlt nicht; erst wenn alle Figuren durch sind, ist die Ebene leer.
  const [a, b, c] = raid.kinder;
  a.kinder[0].feuere('animationend');
  a.feuere('animationend');
  b.feuere('animationend');
  assert.strictEqual(raid.kinder.length, 3);
  c.feuere('animationend');
  assert.strictEqual(raid.kinder.length, 0);

  fx.starte({ art: 'raid', daten: {} });
  assert.strictEqual(raid.kinder.length, 1, 'ohne Anzahl 1 Figur');
  fx.starte({ art: 'raid', daten: { anzahl: 100000 } });
  assert.strictEqual(raid.kinder.length, 4, 'neuer Start raeumt den alten weg, hoechstens 4');
  fx.stoppe();
  assert.strictEqual(raid.kinder.length, 0);
});

test('RaumLebenDom.effekte: Kiste spielt einmal, Katze ist waehrenddessen verdeckt', () => {
  const doc = baumDoc();
  const ebene = doc.createElement('div');
  const katze = doc.createElement('div');
  const fx = RLD.effekte(doc, ebene, 'p/', { katze });
  const kiste = ebene.kinder[ebene.kinder.length - 1];
  fx.starte({ art: 'kiste', daten: { betrag: 50 } });
  assert.ok(kiste.classList.contains('spielt'));
  assert.ok(katze.classList.contains('verdeckt'));
  kiste.feuere('animationend');
  assert.ok(!kiste.classList.contains('spielt'));
  assert.ok(!katze.classList.contains('verdeckt'), 'Katze beginnt danach wieder');
  fx.starte({ art: 'kiste', daten: {} });
  fx.stoppe();
  assert.ok(!kiste.classList.contains('spielt'));
  assert.ok(!katze.classList.contains('verdeckt'));
  // Unbekannte Art: nichts passiert, kein Fehler
  fx.starte({ art: 'abo', daten: {} });
  assert.ok(!kiste.classList.contains('spielt'));
});

test('RaumLebenDom.effekte: Katze spielt nicht verdeckt weiter, beginnt nach der Kiste von vorn', () => {
  const doc = baumDoc();
  const ebene = doc.createElement('div');
  const katze = doc.createElement('div');
  const fx = RLD.effekte(doc, ebene, 'p/', { katze });
  const kiste = ebene.kinder[ebene.kinder.length - 1];
  // Katze mitten im seltenen Auftritt
  katze.classList.add('spielt');
  fx.starte({ art: 'kiste', daten: {} });
  assert.ok(!katze.classList.contains('spielt'), 'verdeckt angehalten');
  kiste.feuere('animationend');
  assert.ok(katze.classList.contains('spielt'), 'neu gestartet (von vorn)');
  assert.ok(!katze.classList.contains('verdeckt'));
  // Katze ruhte: bleibt danach ruhig
  katze.classList.remove('spielt');
  fx.starte({ art: 'kiste', daten: {} });
  kiste.feuere('animationend');
  assert.ok(!katze.classList.contains('spielt'));
  // Animationen aus (ruht): kein Neustart
  katze.classList.add('spielt');
  fx.starte({ art: 'kiste', daten: {} });
  katze.classList.add('ruht');
  fx.stoppe();
  assert.ok(!katze.classList.contains('spielt'));
});

test('raum-leben-dom.js: UMD, setzt RaumLebenDom, nutzt RaumLeben.TAKT und naechstePause', () => {
  const q = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'lib', 'raum-leben-dom.js'), 'utf8');
  assert.ok(q.includes('root.RaumLebenDom'));
  assert.ok(q.includes('TAKT[') && q.includes('naechstePause('));
  assert.ok(q.includes("'animationend'"));
});
