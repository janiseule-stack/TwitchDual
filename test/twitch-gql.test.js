const { test } = require('node:test');
const assert = require('node:assert');
const { fetchWithRetry, gql } = require('../src/twitch-gql');
const { fetchVodComments, resolveUserId } = require('../src/twitch-api');
const { res, fakeFetch, fast } = require('./helpers');

test('fetchWithRetry: 5xx wird wiederholt, dann Erfolg', async () => {
  const { fn, calls } = fakeFetch([res(500), res(200, { x: 1 })]);
  const r = await fetchWithRetry('u', {}, { ...fast, fetchImpl: fn });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 2);
});

test('fetchWithRetry: 4xx wird NICHT wiederholt', async () => {
  const { fn, calls } = fakeFetch([res(404)]);
  const r = await fetchWithRetry('u', {}, { ...fast, fetchImpl: fn });
  assert.equal(r.status, 404); // Aufrufer entscheidet
  assert.equal(calls.length, 1);
});

test('fetchWithRetry: Netzwerkfehler wird wiederholt', async () => {
  const { fn, calls } = fakeFetch([new Error('ECONNRESET'), res(200, {})]);
  const r = await fetchWithRetry('u', {}, { ...fast, fetchImpl: fn });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 2);
});

test('fetchWithRetry: nach retries+1 Fehlversuchen fliegt der letzte Fehler', async () => {
  const { fn, calls } = fakeFetch([res(503), res(503), new Error('timeout')]);
  await assert.rejects(
    fetchWithRetry('u', {}, { ...fast, fetchImpl: fn, retries: 2 }),
    /timeout/
  );
  assert.equal(calls.length, 3);
});

test('gql: setzt Client-ID-Header und wirft bei 4xx', async () => {
  const { fn, calls } = fakeFetch([res(400)]);
  await assert.rejects(gql({ query: 'q' }, { ...fast, fetchImpl: fn }), /GQL HTTP 400/);
  assert.ok(calls[0].init.headers['Client-ID']);
});

test('fetchVodComments: IntegrityCheckFailed wird sichtbarer Fehler', async () => {
  const { fn } = fakeFetch([
    res(200, [{
      errors: [{ message: 'failed integrity check' }],
      data: { video: { comments: null } }
    }])
  ]);
  await assert.rejects(
    fetchVodComments('123', { offsetSeconds: 0 }, { ...fast, fetchImpl: fn }),
    /Twitch-GQL: failed integrity check.*Integrity-Sperre/
  );
});

test('fetchVodComments: comments=null OHNE errors bleibt leere Liste', async () => {
  const { fn } = fakeFetch([res(200, [{ data: { video: { comments: null } } }])]);
  const r = await fetchVodComments('123', {}, { ...fast, fetchImpl: fn });
  assert.deepEqual(r, { comments: [] });
});

test('fetchVodComments: Mapping (id, offset, name, color, fragments)', async () => {
  const { fn, calls } = fakeFetch([
    res(200, [{
      data: { video: { comments: { edges: [{
        node: {
          id: 'c1', contentOffsetSeconds: 42,
          commenter: { id: 'u77', displayName: 'Max', login: 'max' },
          message: {
            userColor: '#f00',
            userBadges: [{ setID: 'moderator', version: '1' }, { setID: 'vip' }, { setID: '', version: '' }],
            fragments: [{ text: 'hi ' }, { text: 'OMEGALUL', emote: null }]
          }
        }
      }] } } }
    }])
  ]);
  const r = await fetchVodComments('123', { offsetSeconds: 42.9 }, { ...fast, fetchImpl: fn });
  assert.deepEqual(r.comments, [{
    id: 'c1', offset: 42, name: 'Max', color: '#f00',
    userId: 'u77',
    badges: [
      { set: 'moderator', version: '1' },
      { set: 'vip', version: '1' }
    ],
    fragments: [{ text: 'hi ', emote: null }, { text: 'OMEGALUL', emote: null }]
  }]);
  // Offset wird abgerundet an die API gegeben.
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent[0].variables.contentOffsetSeconds, 42);
});

test('resolveUserId: unbekannter Channel wirft verstaendlichen Fehler', async () => {
  const { fn } = fakeFetch([res(200, { data: { user: null } })]);
  await assert.rejects(
    resolveUserId('GibtEsNicht', { ...fast, fetchImpl: fn }),
    /Channel "gibtesnicht" nicht gefunden/
  );
});
