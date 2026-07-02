const { test } = require('node:test');
const assert = require('node:assert');
const VodReplayCore = require('../renderer/lib/vod-replay');

// Hilfen: Kommentar bauen + Core mit Fake-Fetch verdrahten.
function c(id, offset, text = 'hi') {
  return { id, offset, name: 'user', color: null, fragments: [{ text, emote: null }] };
}

// pages: (videoId, offset) => { ok, comments } — pro Test frei definierbar.
function makeCore(pages, opts = {}) {
  const rendered = [];
  const errors = [];
  let cleared = 0;
  const fetchCalls = [];
  const core = new VodReplayCore({
    videoId: 'v1',
    fetchPage: async (videoId, offset) => {
      fetchCalls.push(offset);
      return pages(videoId, offset);
    },
    onMessage: (cm) => rendered.push(cm.id),
    onClear: () => { cleared++; },
    onError: (msg) => errors.push(msg),
    ...opts
  });
  return { core, rendered, errors, fetchCalls, getCleared: () => cleared };
}

test('merge: dedupliziert per id und sortiert nach offset', () => {
  const { core } = makeCore(() => ({ ok: true, comments: [] }));
  assert.equal(core.merge([c('a', 5), c('b', 3)]), 2);
  assert.equal(core.merge([c('a', 5), c('c', 4)]), 1); // 'a' schon gesehen
  assert.deepEqual(core.buffer.map((x) => x.id), ['b', 'c', 'a']);
});

test('merge: Fallback-Schluessel ohne id (offset|name|text)', () => {
  const { core } = makeCore(() => ({ ok: true, comments: [] }));
  const noId = { id: null, offset: 7, name: 'x', fragments: [{ text: 'hey' }] };
  assert.equal(core.merge([noId]), 1);
  assert.equal(core.merge([{ ...noId }]), 0); // gleicher Inhalt -> Duplikat
});

test('onTime initial: laedt Fenster bei t und rendert Kommentare <= t', async () => {
  const { core, rendered, fetchCalls } = makeCore((_v, off) => ({
    ok: true,
    comments: off === 100 ? [c('a', 98), c('b', 100), c('c', 110)] : []
  }));
  await core.onTime(100.4);
  assert.deepEqual(fetchCalls, [100]);
  assert.deepEqual(rendered, ['a', 'b']); // 'c' liegt in der Zukunft
  assert.equal(core.coveredUntil, 110);
});

test('advance rendert nachrueckend, ohne doppelt zu zeigen', async () => {
  const { core, rendered } = makeCore((_v, off) => ({
    ok: true,
    comments: off === 0 ? [c('a', 1), c('b', 2), c('c', 50)] : []
  }));
  await core.onTime(0);
  core.advance(2);
  core.advance(2); // idempotent
  assert.deepEqual(rendered, ['a', 'b']);
});

test('ensureCoverage: kein Fortschritt -> Fenster um VOD_GAP_STEP verschieben', async () => {
  const { core } = makeCore(() => ({ ok: true, comments: [] }));
  await core.onTime(0);            // initialer Seek, leeres Fenster
  const covered0 = core.coveredUntil;
  await core.ensureCoverage(0);    // stille Luecke
  assert.equal(core.coveredUntil, covered0 + VodReplayCore.VOD_GAP_STEP);
});

test('ensureCoverage: kein neuer Fetch solange Puffer weit genug reicht', async () => {
  const { core, fetchCalls } = makeCore((_v, off) => ({
    ok: true,
    comments: off === 0 ? [c('a', 0), c('b', 200)] : []
  }));
  await core.onTime(0);            // coveredUntil = 200
  await core.onTime(0.5);
  await core.onTime(1.0);
  assert.deepEqual(fetchCalls, [0]); // nur der initiale Seek
});

test('Sprungerkennung: >SEEK_THRESHOLD Differenz loest Seek mit Clear aus', async () => {
  const { core, fetchCalls, getCleared } = makeCore(() => ({ ok: true, comments: [] }));
  await core.onTime(10);
  await core.onTime(500); // Sprung
  assert.deepEqual(fetchCalls, [10, 500]);
  assert.equal(getCleared(), 2); // je Seek einmal geleert
  assert.equal(core.buffer.length, 0);
});

test('Seek-Race: langsamer alter Fetch verschmutzt neue Position nicht', async () => {
  // Fetch-Antworten manuell aufloesbar machen, um Ueberlappung zu erzwingen.
  const pending = new Map(); // offset -> resolve
  const { core, rendered } = makeCore(() => { throw new Error('unused'); });
  core.fetchPage = (_v, off) => new Promise((resolve) => pending.set(off, resolve));

  const p1 = core.onTime(100);   // initialer Seek -> Fetch(100) haengt
  const p2 = core.onTime(500);   // Sprung waehrenddessen -> Fetch(500) haengt
  // Neuen Fetch zuerst beantworten, den alten danach (kommt "zu spaet" an).
  pending.get(500)({ ok: true, comments: [c('neu', 499)] });
  pending.get(100)({ ok: true, comments: [c('alt', 99)] });
  await Promise.all([p1, p2]);

  assert.deepEqual(core.buffer.map((x) => x.id), ['neu']); // 'alt' verworfen
  assert.deepEqual(rendered, ['neu']);
  assert.equal(core.coveredUntil, 500);
  assert.equal(core.fetching, false); // Flag gehoert der neuen Epoche
});

test('Seek-Race: waehrend Seek eintreffendes ensureCoverage-Fenster wird verworfen', async () => {
  const pending = new Map();
  const { core } = makeCore((_v, off) => ({
    ok: true,
    comments: off === 0 ? [c('a', 0)] : []
  }));
  await core.onTime(0); // initialisiert, coveredUntil=0

  // ensureCoverage-Fetch haengt, dann kommt ein Seek dazwischen.
  core.fetchPage = (_v, off) => new Promise((resolve) => pending.set(off, resolve));
  const pCov = core.onTime(1);    // -> Fetch(0..) fuer Coverage haengt
  const pSeek = core.onTime(900); // Sprung -> neue Epoche, Fetch(900) haengt
  pending.get(900)({ ok: true, comments: [c('z', 901)] });
  const covOffset = [...pending.keys()].find((k) => k !== 900);
  pending.get(covOffset)({ ok: true, comments: [c('stale', 2)] });
  await Promise.all([pCov, pSeek]);

  assert.deepEqual(core.buffer.map((x) => x.id), ['z']);
  assert.equal(core.coveredUntil, 901);
});

test('Fetch-Fehler: onError wird gemeldet, Replay laeuft weiter', async () => {
  let fail = true;
  const { core, errors } = makeCore(() => {
    if (fail) return { ok: false, error: 'GQL HTTP 500' };
    return { ok: true, comments: [c('a', 40)] };
  });
  await core.onTime(0);
  assert.deepEqual(errors, ['GQL HTTP 500']);
  fail = false;
  await core.onTime(31); // coveredUntil=0 -> neuer Fetch noetig
  assert.equal(core.buffer.length, 1);
});
