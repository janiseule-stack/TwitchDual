const test = require('node:test');
const assert = require('node:assert/strict');
const HomeBuehne = require('../renderer/lib/home-buehne.js');
const { createBuehne, createRad, vorschauUrl, createLaufwerk } = HomeBuehne;

const k = (login, viewers = 0, extra = {}) => ({ login, displayName: login.toUpperCase(), viewers, ...extra });
const logins = (arr) => arr.map((x) => x.login);

function buehne(...ls) {
  const b = createBuehne();
  b.oeffnen(ls.map((l) => k(l)));
  return b;
}

test('oeffnen: erste CD aktuell; leer -> null, index -1', () => {
  const b = buehne('a', 'b');
  assert.equal(b.aktuelle().login, 'a');
  assert.equal(b.index(), 0);
  const leer = createBuehne();
  leer.oeffnen([]);
  assert.equal(leer.aktuelle(), null);
  assert.equal(leer.index(), -1);
});

test('blaettern: Anschlag', () => {
  const b = buehne('a', 'b');
  assert.equal(b.blaettern(-1), false);
  assert.equal(b.aktuelle().login, 'a');
  assert.equal(b.blaettern(1), true);
  assert.equal(b.aktuelle().login, 'b');
  assert.equal(b.blaettern(1), false);
  assert.equal(b.aktuelle().login, 'b');
});

test('aktualisieren: Reihenfolge bleibt, Werte frisch', () => {
  const b = createBuehne();
  b.oeffnen([k('a', 1), k('b', 2), k('c', 3)]);
  b.aktualisieren([k('c', 9), k('a', 8), k('b', 7)]);
  assert.deepEqual(logins(b.sichtbar()), ['a', 'b', 'c']);
  assert.equal(b.sichtbar()[0].viewers, 8);
});

test('aktualisieren: Neue hinten', () => {
  const b = buehne('a', 'b');
  b.aktualisieren([k('b'), k('a'), k('d')]);
  assert.deepEqual(logins(b.sichtbar()), ['a', 'b', 'd']);
});

test('aktualisieren: nicht-vordere weg, aktuelle per Login', () => {
  const b = buehne('a', 'b', 'c');
  b.springeZu('b');
  b.aktualisieren([k('b'), k('c')]);
  assert.deepEqual(logins(b.sichtbar()), ['b', 'c']);
  assert.equal(b.aktuelle().login, 'b');
});

test('aktualisieren: vordere fehlt -> markiert, bleibt', () => {
  const b = buehne('a', 'b', 'c');
  b.springeZu('b');
  b.aktualisieren([k('a'), k('c')]);
  assert.equal(b.aktuelle().login, 'b');
  assert.equal(b.aktuelle().offline, true);
  assert.deepEqual(logins(b.sichtbar()), ['a', 'b', 'c']);
});

test('blaettern nach Markierung', () => {
  const mk = () => {
    const b = buehne('a', 'b', 'c');
    b.springeZu('b');
    b.aktualisieren([k('a'), k('c')]);
    return b;
  };
  const v = mk();
  assert.equal(v.blaettern(1), true);
  assert.equal(v.aktuelle().login, 'c');
  assert.deepEqual(logins(v.sichtbar()), ['a', 'c']);
  const r = mk();
  assert.equal(r.blaettern(-1), true);
  assert.equal(r.aktuelle().login, 'a');
  assert.deepEqual(logins(r.sichtbar()), ['a', 'c']);
  const l = buehne('a', 'b', 'c');
  l.springeZu('c');
  l.aktualisieren([k('a'), k('b')]);
  assert.equal(l.blaettern(1), true);
  assert.equal(l.aktuelle().login, 'b');
  assert.deepEqual(logins(l.sichtbar()), ['a', 'b']);
});

test('blaettern nach Markierung: letzte CD weg -> leer', () => {
  const b = buehne('a');
  b.aktualisieren([]);
  assert.equal(b.aktuelle().offline, true);
  assert.equal(b.blaettern(1), true);
  assert.equal(b.aktuelle(), null);
  assert.equal(b.index(), -1);
});

test('filter: Teilreihe, Rueckkehr', () => {
  const b = buehne('a', 'b', 'c');
  b.filter(['c', 'b']);
  assert.deepEqual(logins(b.sichtbar()), ['b', 'c']);
  assert.equal(b.aktuelle().login, 'b');
  b.filter([]);
  assert.equal(b.aktuelle(), null);
  b.filter(null);
  assert.equal(b.aktuelle().login, 'a');
  assert.deepEqual(logins(b.sichtbar()), ['a', 'b', 'c']);
});

test('springeZu ausserhalb Filter -> false', () => {
  const b = buehne('a', 'b', 'c');
  b.filter(['b', 'c']);
  assert.equal(b.springeZu('a'), false);
  assert.equal(b.springeZu('c'), true);
  assert.equal(b.aktuelle().login, 'c');
});

test('Rad: Schwelle, Zeilen, Sperre', () => {
  const r = createRad();
  assert.equal(r.eingabe(20, 0, 0), 0);
  assert.equal(r.eingabe(20, 0, 10), 0);
  assert.equal(r.eingabe(20, 0, 20), 1);
  assert.equal(r.eingabe(100, 0, 120), 0);
  assert.equal(r.eingabe(100, 0, 300), 1);
  assert.equal(createRad().eingabe(4, 1, 0), 1);
  assert.equal(createRad().eingabe(-60, 0, 0), -1);
});

test('Riesen-Namen sind weg: namenAuswahl und zeilenInhalt nicht mehr exportiert', () => {
  assert.equal(HomeBuehne.namenAuswahl, undefined);
  assert.equal(HomeBuehne.zeilenInhalt, undefined);
});

test('leere Buehne: erster neuer Live-Kanal wird aktuell', () => {
  const b = createBuehne();
  b.oeffnen([]);
  b.aktualisieren([k('a'), k('b')]);
  assert.equal(b.aktuelle().login, 'a');
  assert.equal(b.blaettern(1), true);
  assert.equal(b.aktuelle().login, 'b');
});

test('markierte CD weggeblaettert bis leer, dann neuer Live-Kanal -> aktuell', () => {
  const b = buehne('a');
  b.aktualisieren([]);
  assert.equal(b.aktuelle().offline, true);
  assert.equal(b.blaettern(1), true);
  assert.equal(b.aktuelle(), null);
  b.aktualisieren([k('c')]);
  assert.equal(b.aktuelle().login, 'c');
  assert.equal(b.index(), 0);
});

test('vorschauUrl', () => {
  assert.ok(vorschauUrl('kanal_a', 120000).endsWith('kanal_a-640x360.jpg?t=2'));
});

test('tvVorschau: live -> Live-Vorschau, VOD -> sein Vorschaubild, sonst aus', () => {
  const { tvVorschau } = HomeBuehne;
  assert.equal(tvVorschau(null, 0), null);
  assert.equal(tvVorschau({ mode: 'live', login: 'kanal_a' }, 120000), vorschauUrl('kanal_a', 120000));
  assert.equal(tvVorschau({ mode: 'live', login: null }, 0), null);
  assert.equal(tvVorschau({ mode: 'vod', login: null, vorschau: 'https://x/v.jpg' }, 0), 'https://x/v.jpg');
  assert.equal(tvVorschau({ mode: 'vod', login: null, vorschau: null }, 0), null);
  assert.equal(tvVorschau({ mode: 'vod', login: null }, 0), null);
});

// --- Staender (Runde 2) entfaellt mit dem neuen Regal (Task 9b) ----------------
test('staenderEintraege entfaellt (regalBelegung ersetzt es)', () => {
  assert.equal('staenderEintraege' in HomeBuehne, false);
  assert.equal(typeof HomeBuehne.regalBelegung, 'function');
});

// --- Laufwerk-Ablauf (Runde 2) -------------------------------------------------
function laufwerk() {
  const z = { zeit: 0, timer: [], fertig: [] };
  let id = 1;
  z.lw = createLaufwerk({
    mindestMs: 1500,
    jetzt: () => z.zeit,
    setzeTimer: (fn, ms) => { const t = { id: id++, fn, ms }; z.timer.push(t); return t.id; },
    loescheTimer: (i) => { z.timer = z.timer.filter((t) => t.id !== i); },
  });
  z.feuere = () => { const l = z.timer; z.timer = []; l.forEach((t) => t.fn()); };
  return z;
}

test('Laufwerk: fertig erst nach Mindestzeit UND Laden', () => {
  const z = laufwerk();
  z.lw.start((ok) => z.fertig.push(ok));
  assert.equal(z.lw.laeuft, true);
  z.lw.geladen(true);              // Laden schneller als die Animation
  assert.deepEqual(z.fertig, []);
  z.feuere();                      // Mindestzeit vorbei
  assert.deepEqual(z.fertig, [true]);
  assert.equal(z.lw.laeuft, false);
});

test('Laufwerk: Laden langsamer als Mindestzeit', () => {
  const z = laufwerk();
  z.lw.start((ok) => z.fertig.push(ok));
  z.feuere();
  assert.deepEqual(z.fertig, []);
  z.lw.geladen(true);
  assert.deepEqual(z.fertig, [true]);
});

test('Laufwerk: Fehler beendet sofort mit false', () => {
  const z = laufwerk();
  z.lw.start((ok) => z.fertig.push(ok));
  z.lw.geladen(false);
  assert.deepEqual(z.fertig, [false]);
  assert.equal(z.timer.length, 0);
  z.lw.geladen(true);              // spaete Meldung ohne Wirkung
  assert.deepEqual(z.fertig, [false]);
});

test('Laufwerk: abbrechen ohne Rueckruf, start waehrend Lauf ignoriert', () => {
  const z = laufwerk();
  z.lw.start((ok) => z.fertig.push(ok));
  assert.equal(z.lw.start(() => z.fertig.push('zweiter')), false);
  z.lw.abbrechen();
  z.feuere();
  z.lw.geladen(true);
  assert.deepEqual(z.fertig, []);
  assert.equal(z.lw.laeuft, false);
});

test('Laufwerk: ueberspringen beendet die Mindestdauer, wartet aber aufs Laden', () => {
  const z = laufwerk();
  z.lw.start((ok) => z.fertig.push(ok));
  z.lw.ueberspringen();
  assert.deepEqual(z.fertig, []);
  assert.equal(z.timer.length, 0);   // loescheTimer wurde gerufen
  z.lw.geladen(true);
  assert.deepEqual(z.fertig, [true]);
});

test('Laufwerk: ueberspringen nach geladen(true) ist sofort fertig', () => {
  const z = laufwerk();
  z.lw.start((ok) => z.fertig.push(ok));
  z.lw.geladen(true);
  assert.deepEqual(z.fertig, []);
  z.lw.ueberspringen();
  assert.deepEqual(z.fertig, [true]);
  assert.equal(z.lw.laeuft, false);
});

test('Laufwerk: ueberspringen, dann Ladefehler ruft false genau einmal', () => {
  const z = laufwerk();
  z.lw.start((ok) => z.fertig.push(ok));
  z.lw.ueberspringen();
  z.lw.geladen(false);
  assert.deepEqual(z.fertig, [false]);
});

test('Laufwerk: ueberspringen ohne Lauf und doppelt tut nichts', () => {
  const z = laufwerk();
  assert.doesNotThrow(() => z.lw.ueberspringen());
  z.lw.start((ok) => z.fertig.push(ok));
  z.lw.ueberspringen();
  assert.doesNotThrow(() => z.lw.ueberspringen());
  assert.deepEqual(z.fertig, []);
});

test('Laufwerk: alter Timer-Rueckruf nach ueberspringen ruft nichts doppelt', () => {
  const z = laufwerk();
  z.lw.start((ok) => z.fertig.push(ok));
  const alt = z.timer.slice();
  z.lw.ueberspringen();
  z.lw.geladen(true);
  alt.forEach((t) => t.fn());
  assert.deepEqual(z.fertig, [true]);
});

// ---- Regal neu, Task 2: Belegung, Karten-Zustand, VOD-Nachladen ----
const abs = (o) => [
  ['favoriten', o.fav], ['live', o.live], ['offline', o.off], ['twitch', o.tw],
].filter(([, l]) => l && l.length).map(([art, kanaele]) => ({ art, kanaele }));

test('regalBelegung: 9 Live-Favoriten, 4 Plaetze -> Brett = 4 mit den meisten Zuschauern', () => {
  const zahlen = [5, 90, 10, 90, 3, 70, 1, 2, 4];
  const fav = zahlen.map((v, i) => k('f' + i, v, { favorit: true, live: true }));
  const r = HomeBuehne.regalBelegung({ abschnitte: abs({ fav }), plaetze: 4, suche: '' });
  assert.deepEqual(r.brett.map((x) => x.login), ['f1', 'f3', 'f5', 'f2']);
  assert.equal(r.live.length, 5);
  assert.ok(r.live.slice(0, 5).every((e) => e.art === 'favorit'));
  assert.deepEqual(r.live.map((e) => e.kanal.login), ['f0', 'f8', 'f4', 'f7', 'f6']);
});

test('regalBelegung: andere Live nach Zuschauern, ohne Suche unten nur Offline-Favoriten', () => {
  const live = [k('l1', 5, { live: true }), k('l2', 50, { live: true })];
  const off = [k('o1', 0, { favorit: true }), k('o2', 0)];
  const tw = [k('t1')];
  const r = HomeBuehne.regalBelegung({ abschnitte: abs({ live, off, tw }), plaetze: 4, suche: '' });
  assert.deepEqual(r.brett, []);
  assert.deepEqual(r.live.map((e) => [e.kanal.login, e.art]), [['l2', 'live'], ['l1', 'live']]);
  assert.deepEqual(r.unten.map((e) => [e.kanal.login, e.art]), [['o1', 'offline'], ['t1', 'twitch']]);
});

test('regalBelegung: ohne Suche kein Twitch-Treffer noetig, nur Offline-Favoriten', () => {
  const off = [k('o2', 0), k('o3', 0)];
  const r = HomeBuehne.regalBelegung({ abschnitte: abs({ off }), plaetze: 4, suche: '' });
  assert.deepEqual(r.unten, []);
});

test('regalBelegung: mit Suche unten Offline-Treffer, dann Twitch, jeder Login einmal', () => {
  const off = [k('o1', 0, { favorit: true }), k('o2', 0)];
  const tw = [k('t1'), k('o2'), k('t2')];
  const r = HomeBuehne.regalBelegung({ abschnitte: abs({ off, tw }), plaetze: 4, suche: 'o' });
  assert.deepEqual(r.unten.map((e) => [e.kanal.login, e.art]),
    [['o1', 'offline'], ['o2', 'offline'], ['t1', 'twitch'], ['t2', 'twitch']]);
});

test('regalBelegung: plaetze 0 oder kein Favorit -> Brett leer', () => {
  const fav = [k('f1', 10, { favorit: true, live: true })];
  const r0 = HomeBuehne.regalBelegung({ abschnitte: abs({ fav }), plaetze: 0, suche: '' });
  assert.deepEqual(r0.brett, []);
  assert.deepEqual(r0.live.map((e) => [e.kanal.login, e.art]), [['f1', 'favorit']]);
  const r1 = HomeBuehne.regalBelegung({ abschnitte: [], plaetze: 4, suche: '' });
  assert.deepEqual(r1, { brett: [], live: [], unten: [] });
});

test('vodLimit', () => {
  const v = HomeBuehne.vodLimit;
  assert.equal(HomeBuehne.VODS.schritt, 25);
  assert.equal(HomeBuehne.VODS.max, 100);
  assert.equal(v(0, 25), null);
  assert.equal(v(25, 25), 50);
  assert.equal(v(50, 50), 75);
  assert.equal(v(75, 75), 100);
  assert.equal(v(100, 100), null);
  assert.equal(v(40, 50), null);
});

test('vodsZusammen: alte behalten Reihenfolge, neue hinten', () => {
  const id = (x) => ({ id: x });
  const r = HomeBuehne.vodsZusammen([id('a'), id('b')], [id('x'), id('a'), id('b'), id('c')]);
  assert.deepEqual(r.vods.map((x) => x.id), ['a', 'b', 'x', 'c']);
  assert.equal(r.neuAb, 2);
  const l = HomeBuehne.vodsZusammen([], [id('a')]);
  assert.deepEqual(l.vods.map((x) => x.id), ['a']);
  assert.equal(l.neuAb, 0);
});

test('laufendesVod', () => {
  const kanal = { live: true, start: '2026-11-11T18:00:00Z' };
  const vod = (p) => [{ id: 'v1', published: p }];
  assert.equal(HomeBuehne.laufendesVod(vod('2026-11-11T18:05:00Z'), kanal), 'v1');
  assert.equal(HomeBuehne.laufendesVod(vod('2026-11-11T19:00:00Z'), kanal), null);
  assert.equal(HomeBuehne.laufendesVod(vod('2026-11-11T18:05:00Z'), { live: false, start: kanal.start }), null);
  assert.equal(HomeBuehne.laufendesVod([], kanal), null);
});

test('herausgenommenStand', () => {
  const s = HomeBuehne.herausgenommenStand;
  assert.equal(s(null, []), null);
  const alt = k('a', 5, { live: true, title: 'alt' });
  const frisch = k('a', 9, { live: true, title: 'neu' });
  const r = s({ login: 'a', art: 'brett', kanal: alt }, [frisch]);
  assert.equal(r.modus, 'live');
  assert.equal(r.kanal.title, 'neu');
  const aus = k('a', 0, { live: false });
  for (const art of ['brett', 'live', 'favorit']) {
    const m = s({ login: 'a', art, kanal: alt }, [aus]);
    assert.equal(m.modus, 'markiert', art);
    assert.equal(m.kanal, aus);
  }
  assert.equal(s({ login: 'a', art: 'offline', kanal: aus }, [aus]).modus, 'offline');
  const fehlt = s({ login: 'z', art: 'twitch', kanal: alt }, [frisch]);
  assert.equal(fehlt.kanal, alt);
});
