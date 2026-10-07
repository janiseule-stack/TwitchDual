const { test } = require('node:test');
const assert = require('node:assert');
const { createRuntime } = require('../renderer/lib/theme-runtime');

function aufbau({ fenster = 'chat', welten = {}, ladeFehler = false } = {}) {
  const styleProps = new Map();
  const listener = new Map();          // typ -> Set(fn)
  const elemente = new Map();          // id -> el
  const doc = {
    documentElement: {
      dataset: {},
      style: { setProperty: (k, v) => styleProps.set(k, v), removeProperty: (k) => styleProps.delete(k) }
    },
    head: { appendChild: (el) => { if (el.id) elemente.set(el.id, el); } },
    getElementById: (id) => elemente.get(id) || null,
    createElement: () => {
      const attr = {};
      const el = {
        id: '', rel: '', onerror: null,
        setAttribute: (k, v) => { attr[k] = v; }, getAttribute: (k) => attr[k],
        remove: () => { elemente.delete(el.id); }
      };
      return el;
    },
    addEventListener: (t, fn) => { if (!listener.has(t)) listener.set(t, new Set()); listener.get(t).add(fn); },
    removeEventListener: (t, fn) => { if (listener.has(t)) listener.get(t).delete(fn); }
  };
  const timer = new Map(); let tid = 0;
  const win = {
    TwitchDualWelten: {},
    requestAnimationFrame: (fn) => { fn(0); return 1; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms) => { timer.set(++tid, { fn, ms }); return tid; },
    clearTimeout: (id) => timer.delete(id)
  };
  const geladen = [];
  const ladeSkript = (url) => {
    geladen.push(url);
    if (ladeFehler) return Promise.reject(new Error('404'));
    const id = url.split('/').slice(-2)[0];
    if (welten[id]) win.TwitchDualWelten[id] = welten[id];
    return Promise.resolve();
  };
  const engines = [];
  const erzeugeEngine = (opts) => {
    const e = { opts, gestoppt: false, faktor: opts.faktor, pausiert: false, weiterAufrufe: 0,
      stop() { e.gestoppt = true; }, setFaktor(f) { e.faktor = f; }, pausieren(p) { e.pausiert = p; }, weiter() { e.weiterAufrufe++; } };
    engines.push(e);
    return e;
  };
  const meldungen = [];
  const ebenen = { hinten: { getBoundingClientRect: () => ({ left: 0, top: 0 }) }, vorn: {}, gast: {} };
  const rt = createRuntime({ fenster, doc, win, ebenen, ladeSkript, erzeugeEngine,
    melde: (b, e, d) => meldungen.push({ b, e, d }) });
  const anzahlListener = () => [...listener.values()].reduce((n, s) => n + s.size, 0);
  return { rt, doc, win, styleProps, listener, anzahlListener, geladen, engines, meldungen, timer, elemente };
}

// Eine Welt-Attrappe, die ihre Aufrufe protokolliert.
function protokollWelt(log, extra = {}) {
  return () => ({
    start: () => log.push('start'), stop: () => log.push('stop'),
    ereignis: (art) => log.push('ereignis:' + art), gast: () => log.push('gast'),
    ...extra
  });
}

test('Stufe aus: Farben + CSS ja, aber keine Welt, kein Listener, kein Timer', async () => {
  const log = [];
  const a = aufbau({ welten: { sakura: protokollWelt(log) } });
  await a.rt.anwenden({ theme: 'sakura', effekte: 'aus' });
  assert.equal(a.doc.documentElement.dataset.theme, 'sakura');
  assert.equal(a.elemente.get('theme-css').getAttribute('href'), '../themes/sakura/theme.css');
  assert.deepEqual(a.geladen, []);
  assert.deepEqual(log, []);
  assert.equal(a.anzahlListener(), 0);
  assert.equal(a.timer.size, 0);
  assert.equal(a.rt.weltAktiv, false);
});

test('Wechsel normal -> aus beendet Welt, Engine und Listener restlos', async () => {
  const log = [];
  const a = aufbau({ fenster: 'video', welten: { sakura: protokollWelt(log) } });
  a.rt.setzeGastBedingung(() => true);
  await a.rt.anwenden({ theme: 'sakura', effekte: 'normal' });
  assert.deepEqual(log, ['start']);
  assert.ok(a.anzahlListener() > 0);
  assert.equal(a.timer.size, 1, 'Gast-Timer laeuft');
  await a.rt.anwenden({ theme: 'sakura', effekte: 'aus' });
  assert.deepEqual(log, ['start', 'stop']);
  assert.equal(a.engines[0].gestoppt, true);
  assert.equal(a.anzahlListener(), 0);
  assert.equal(a.timer.size, 0);
  a.rt.gastJetzt();
  a.rt.ereignis('kiste', {});
  assert.deepEqual(log, ['start', 'stop']);
});

test('Neon Dual setzt Akzent-Variablen, andere Themes entfernen sie wieder', async () => {
  const a = aufbau({ welten: { 'neon-dual': protokollWelt([]), sakura: protokollWelt([]) } });
  await a.rt.anwenden({ theme: 'neon-dual', chatAccent: '#ff4fa3', chatAlpha: 50 });
  assert.equal(a.styleProps.get('--accent'), '#ff4fa3');
  assert.equal(a.styleProps.get('--chat-alpha'), '0.5');
  assert.equal(a.elemente.get('theme-css'), undefined);
  await a.rt.anwenden({ theme: 'sakura', chatAlpha: 50 });
  assert.equal(a.styleProps.has('--accent'), false);
  assert.equal(a.styleProps.has('--onair-from'), false);
  assert.equal(a.styleProps.get('--chat-alpha'), '0.5');
  await a.rt.anwenden({ theme: 'neon-dual' });
  assert.equal(a.elemente.get('theme-css'), undefined, 'Theme-CSS wieder entfernt');
});

test('Video-Fenster: --chat-alpha immer 1, Neon nutzt videoAccent', async () => {
  const a = aufbau({ fenster: 'video', welten: { 'neon-dual': protokollWelt([]) } });
  await a.rt.anwenden({ theme: 'neon-dual', videoAccent: '#112233', chatAlpha: 30 });
  assert.equal(a.styleProps.get('--chat-alpha'), '1');
  assert.equal(a.styleProps.get('--accent'), '#112233');
});

test('Gleiches Theme, andere Stufe: nur Faktor, kein Neuladen', async () => {
  const log = [];
  const a = aufbau({ welten: { koi: protokollWelt(log) } });
  await a.rt.anwenden({ theme: 'koi', effekte: 'normal' });
  await a.rt.anwenden({ theme: 'koi', effekte: 'viel' });
  assert.deepEqual(log, ['start']);
  assert.equal(a.engines.length, 1);
  assert.equal(a.engines[0].faktor, 1.8);
});

test('Ueberholter Ladevorgang: nur das zuletzt gewaehlte Theme startet', async () => {
  const log = [];
  const a = aufbau({ welten: { sakura: protokollWelt(log, { start: () => log.push('sakura') }), wald: protokollWelt(log, { start: () => log.push('wald') }) } });
  const p1 = a.rt.anwenden({ theme: 'sakura' });
  const p2 = a.rt.anwenden({ theme: 'wald' });
  await Promise.all([p1, p2]);
  assert.deepEqual(log, ['wald']);
  assert.equal(a.engines.length, 1);
});

test('Welt wirft beim Start: Diagnose, keine Listener, App laeuft weiter', async () => {
  const a = aufbau({ welten: { blasen: () => ({ start() { throw new Error('kaputt'); }, stop() {} }) } });
  await a.rt.anwenden({ theme: 'blasen' });
  assert.equal(a.rt.weltAktiv, false);
  assert.equal(a.anzahlListener(), 0);
  assert.deepEqual(a.meldungen[0], { b: 'theme', e: 'welt-fehler', d: { theme: 'blasen', phase: 'start', fehler: 'kaputt' } });
  assert.equal(a.doc.documentElement.dataset.theme, 'blasen', 'Farben bleiben');
});

test('Welt-Skript laedt nicht: Diagnose phase laden', async () => {
  const a = aufbau({ ladeFehler: true });
  await a.rt.anwenden({ theme: 'wald' });
  assert.equal(a.meldungen[0].e, 'welt-fehler');
  assert.equal(a.meldungen[0].d.phase, 'laden');
  assert.equal(a.rt.weltAktiv, false);
});

test('Ereignis: fehlender Anschluss ist ok, werfender stoppt die Welt', async () => {
  const log = [];
  const a = aufbau({ welten: { sakura: () => ({ start() {}, stop() { log.push('stop'); } }), wald: () => ({ start() {}, stop() {}, ereignis() { throw new Error('bumm'); } }) } });
  await a.rt.anwenden({ theme: 'sakura' });
  a.rt.ereignis('kiste', { betrag: 50, ursprung: { x: 1, y: 2 } });
  assert.equal(a.rt.weltAktiv, true);
  await a.rt.anwenden({ theme: 'wald' });
  a.rt.ereignis('kiste', {});
  assert.equal(a.rt.weltAktiv, false);
  assert.equal(a.meldungen.at(-1).d.phase, 'ereignis');
});

test('Gast: nur im Video-Fenster, nur wenn die Bedingung stimmt', async () => {
  const log = [];
  const a = aufbau({ fenster: 'video', welten: { koi: protokollWelt(log) } });
  let darf = false;
  a.rt.setzeGastBedingung(() => darf);
  await a.rt.anwenden({ theme: 'koi' });
  a.rt.gastJetzt();
  assert.deepEqual(log, ['start']);
  darf = true;
  a.rt.gastJetzt();
  assert.deepEqual(log, ['start', 'gast']);
  const c = aufbau({ fenster: 'chat', welten: { koi: protokollWelt([]) } });
  c.rt.setzeGastBedingung(() => true);
  await c.rt.anwenden({ theme: 'koi' });
  assert.equal(c.timer.size, 0, 'Chat plant keine Gaeste');
});

test('Klick: nur ins Leere, Koordinaten relativ zur hinteren Ebene', async () => {
  const klicks = [];
  const a = aufbau({ welten: { blasen: () => ({ start() {}, stop() {}, klickInsLeere: (x, y) => klicks.push([x, y]) }) } });
  await a.rt.anwenden({ theme: 'blasen' });
  const klick = [...a.listener.get('click')][0];
  klick({ target: { closest: () => ({}) }, clientX: 5, clientY: 5 });       // Knopf
  klick({ target: { closest: () => null }, clientX: 40, clientY: 60 });     // Hintergrund
  assert.deepEqual(klicks, [[40, 60]]);
});

test('pausieren reicht an die Engine weiter, Aufheben weckt Schleifen', async () => {
  const a = aufbau({ welten: { wald: protokollWelt([]) } });
  await a.rt.anwenden({ theme: 'wald' });
  a.rt.pausieren(true);
  assert.equal(a.engines[0].pausiert, true);
  a.rt.pausieren(false);
  assert.equal(a.engines[0].pausiert, false);
  assert.equal(a.engines[0].weiterAufrufe, 1);
});

// Review I2: pausiert (Home zu / Nur-Video) duerfen Maus und Klick nichts
// erzeugen - sonst entstehen unsichtbare Partikel im versteckten Home.
test('pausiert: Maus und Klick erreichen die Welt nicht', async () => {
  const log = [];
  const a = aufbau({ fenster: 'video', welten: { sakura: () => ({ start() {}, stop() {},
    maus: () => log.push('maus'), klickInsLeere: () => log.push('klick') }) } });
  await a.rt.anwenden({ theme: 'sakura' });
  a.rt.pausieren(true);
  for (const fn of a.listener.get('mousemove') || []) fn({ clientX: 1, clientY: 1 });
  for (const fn of a.listener.get('click') || []) fn({ target: { closest: () => null }, clientX: 1, clientY: 1 });
  assert.deepEqual(log, []);
  a.rt.pausieren(false);
  for (const fn of a.listener.get('click') || []) fn({ target: { closest: () => null }, clientX: 1, clientY: 1 });
  assert.deepEqual(log, ['klick']);
});

// --- Welle 1b ----------------------------------------------------------------
test('Anpassung Akzent/Hintergrund setzt Inline-Variablen, Entfernen raeumt auf', async () => {
  const a = aufbau({ welten: { sakura: protokollWelt([]) } });
  await a.rt.anwenden({ theme: 'sakura', anpassungen: { 'sakura:aquarell': { akzent: '#112233', hintergrund: '#101010' } } });
  assert.equal(a.styleProps.get('--accent'), '#112233');
  assert.equal(a.styleProps.get('--text'), '#ededf4');
  assert.equal(a.doc.documentElement.dataset.hell, '0', 'dunkler eigener Grund -> keine Namens-Abdunklung');
  await a.rt.anwenden({ theme: 'sakura' });
  assert.equal(a.styleProps.has('--accent'), false);
  assert.equal(a.styleProps.has('--text'), false);
  assert.equal(a.doc.documentElement.dataset.hell, '1', 'Sakura-Original ist hell');
});

test('Neon: data-hell 0 und keine Flaechen-Inline-Reste', async () => {
  const a = aufbau({ welten: { koi: protokollWelt([]), 'neon-dual': protokollWelt([]) } });
  await a.rt.anwenden({ theme: 'koi', anpassungen: { 'koi:aquarell': { hintergrund: '#ffffff' } } });
  assert.equal(a.doc.documentElement.dataset.hell, '1');
  await a.rt.anwenden({ theme: 'neon-dual' });
  assert.equal(a.doc.documentElement.dataset.hell, '0');
  assert.equal(a.styleProps.has('--text'), false);
  assert.equal(a.styleProps.has('--line'), false);
});

test('Welt bekommt die effektive Partikelfarbe', async () => {
  let farben = null;
  const a = aufbau({ welten: { wald: (ctx) => { farben = ctx.farben; return { start() {}, stop() {} }; } } });
  await a.rt.anwenden({ theme: 'wald', anpassungen: { wald: { partikel: '#ff00ff' } } });
  assert.deepEqual(farben, { partikel: '#ff00ff' });
});

test('Partikelfarbe aendern startet die Welt neu (genau eine), Akzent nicht', async () => {
  const log = [];
  const a = aufbau({ welten: { koi: protokollWelt(log) } });
  await a.rt.anwenden({ theme: 'koi' });
  await a.rt.anwenden({ theme: 'koi', anpassungen: { 'koi:aquarell': { akzent: '#123456' } } });
  assert.deepEqual(log, ['start']);
  await a.rt.anwenden({ theme: 'koi', anpassungen: { 'koi:aquarell': { akzent: '#123456', partikel: '#abcdef' } } });
  assert.deepEqual(log, ['start', 'stop', 'start']);
  assert.equal(a.engines.filter((e) => !e.gestoppt).length, 1);
});

// --- Gezeichnete Welten: Varianten -------------------------------------------
test('Variante: data-variante, stile.js vor welt.js, Wechsel startet neu', async () => {
  const log = [];
  const a = aufbau({ welten: { koi: (o) => ({ start: () => log.push('start:' + o.variante), stop: () => log.push('stop') }) } });
  await a.rt.anwenden({ theme: 'koi', variante: { koi: 'tusche' } });
  assert.equal(a.doc.documentElement.dataset.variante, 'tusche');
  assert.deepEqual(a.geladen, ['../themes/koi/stile.js', '../themes/koi/welt.js']);
  await a.rt.anwenden({ theme: 'koi', variante: { koi: 'tusche' }, effekte: 'viel' });
  assert.deepEqual(log, ['start:tusche'], 'nur Faktor');
  await a.rt.anwenden({ theme: 'koi', variante: { koi: 'lofi' } });
  assert.deepEqual(log, ['start:tusche', 'stop', 'start:lofi']);
  assert.equal(a.geladen.length, 2, 'Skripte nur einmal');
  await a.rt.anwenden({ theme: 'wald' });
  assert.equal(a.doc.documentElement.dataset.variante, undefined, 'Theme ohne Varianten');
});

test('Vorschau einer Variante bekommt deren Id', async () => {
  const gesehen = [];
  const a = aufbau({ welten: { koi: (o) => { gesehen.push(o.variante + '/' + o.farben.partikel); return {}; } } });
  await a.rt.starteVorschau({}, 'koi', 'bleiglas');
  await a.rt.starteVorschau({}, 'koi');
  assert.deepEqual(gesehen, ['bleiglas/#ff6a3a', 'aquarell/#e0714f']);
});

test('gastErzwingen: nur im Video-Fenster, ohne Gast-Bedingung', async () => {
  const log = [];
  const v = aufbau({ fenster: 'video', welten: { koi: protokollWelt(log) } });
  await v.rt.anwenden({ theme: 'koi' });
  v.rt.setzeGastBedingung(() => false);
  v.rt.gastErzwingen();
  assert.deepEqual(log, ['start', 'gast']);
  const log2 = [];
  const c = aufbau({ fenster: 'chat', welten: { koi: protokollWelt(log2) } });
  await c.rt.anwenden({ theme: 'koi' });
  c.rt.gastErzwingen();
  assert.deepEqual(log2, ['start']);
});

test('Gast: Haeufigkeit aus plant nichts, Wechsel plant neu, Schwarm kommt versetzt', async () => {
  const log = [];
  const a = aufbau({ fenster: 'video', welten: { koi: protokollWelt(log) } });
  a.rt.setzeGastBedingung(() => true);
  await a.rt.anwenden({ theme: 'koi', gastHaeufigkeit: 'aus' });
  assert.equal(a.timer.size, 0, 'aus -> kein Timer');
  await a.rt.anwenden({ theme: 'koi', gastHaeufigkeit: 'oft', gastAnzahl: 'schwarm' });
  assert.equal(a.timer.size, 1, 'neu geplant');
  const [plan] = [...a.timer.values()];
  assert.ok(plan.ms >= 40000 && plan.ms <= 90000, 'Abstand aus "oft": ' + plan.ms);
  a.rt.gastErzwingen();
  assert.deepEqual(log.filter((x) => x === 'gast').length, 1, 'erster sofort');
  const folge = [...a.timer.entries()].filter(([, t]) => t.ms < 5000);
  assert.equal(folge.length, 4, 'vier weitere versetzt');
  for (const [, t] of folge) t.fn();
  assert.deepEqual(log.filter((x) => x === 'gast').length, 5);
});

test('Gast-Ebene verdeckt den Player nur waehrend eines Auftritts', async () => {
  const log = [];
  const a = aufbau({ fenster: 'video', welten: { koi: protokollWelt(log) } });
  const klassen = new Set();
  a.rt.stop();
  // eigene Laufzeit mit Gast-Ebene, die Klassen kennt
  const { createRuntime } = require('../renderer/lib/theme-runtime');
  const timer = [];
  const win = { ...a.win, TwitchDualWelten: { koi: protokollWelt(log) },
    setTimeout: (fn, ms) => { timer.push({ fn, ms }); return timer.length; }, clearTimeout: () => {} };
  const gast = { classList: { add: (k) => klassen.add(k), remove: (k) => klassen.delete(k) } };
  const rt = createRuntime({ fenster: 'video', doc: a.doc, win, ebenen: { hinten: { getBoundingClientRect: () => ({ left: 0, top: 0 }) }, gast },
    ladeSkript: () => Promise.resolve(), erzeugeEngine: (o) => ({ faktor: o.faktor, stop() {}, setFaktor() {}, pausieren() {}, weiter() {} }) });
  await rt.anwenden({ theme: 'koi', gastHaeufigkeit: 'aus' });
  assert.equal(klassen.has('aktiv'), false, 'ohne Auftritt unsichtbar');
  rt.gastErzwingen();
  assert.equal(klassen.has('aktiv'), true, 'waehrend des Auftritts sichtbar');
  const aus = timer.find((t) => t.ms >= 14000);
  assert.ok(aus, 'Ausblenden geplant');
  aus.fn();
  assert.equal(klassen.has('aktiv'), false, 'danach wieder weg');
});
