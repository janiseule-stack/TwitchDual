const { test } = require('node:test');
const assert = require('node:assert');
const { res, fakeFetch, fast } = require('./helpers');
const {
  fetchGlobalBadges, fetchChannelBadges, fetchBttvBadges, fetchFfzBadges
} = require('../src/badge-sources');

test('fetchGlobalBadges: liefert die GQL-Badge-Liste', async () => {
  const { fn } = fakeFetch([res(200, {
    data: { badges: [
      { setID: 'moderator', version: '1', title: 'Moderator', imageURL: 'https://cdn/m' },
      null
    ] }
  })]);
  const list = await fetchGlobalBadges({ ...fast, fetchImpl: fn });
  assert.deepEqual(list, [
    { setID: 'moderator', version: '1', title: 'Moderator', imageURL: 'https://cdn/m' }
  ]);
});

test('fetchGlobalBadges: Fehler -> leere Liste (fail-soft)', async () => {
  const { fn } = fakeFetch([res(400)]);
  assert.deepEqual(await fetchGlobalBadges({ ...fast, fetchImpl: fn }), []);
  const { fn: fn2 } = fakeFetch([new Error('offline'), new Error('offline'), new Error('offline')]);
  assert.deepEqual(await fetchGlobalBadges({ ...fast, fetchImpl: fn2 }), []);
});

test('fetchChannelBadges: broadcastBadges des Kanals, ohne ID leer', async () => {
  const { fn, calls } = fakeFetch([res(200, {
    data: { user: { broadcastBadges: [
      { setID: 'subscriber', version: '3', title: '3-Month Sub', imageURL: 'https://cdn/s3' }
    ] } }
  })]);
  const list = await fetchChannelBadges('123', { ...fast, fetchImpl: fn });
  assert.equal(list[0].setID, 'subscriber');
  assert.match(calls[0].init.body, /broadcastBadges/);
  assert.deepEqual(await fetchChannelBadges(null, { ...fast, fetchImpl: fn }), []);
});

test('fetchChannelBadges: user=null / Fehler -> leere Liste', async () => {
  const { fn } = fakeFetch([res(200, { data: { user: null } })]);
  assert.deepEqual(await fetchChannelBadges('123', { ...fast, fetchImpl: fn }), []);
});

test('fetchBttvBadges: providerId -> Badge-Liste', async () => {
  const { fn } = fakeFetch([res(200, [
    { providerId: '111', badge: { svg: 'https://cdn.bttv/dev.svg', description: 'BTTV Developer' } },
    { providerId: '111', badge: { svg: 'https://cdn.bttv/pro.svg', description: 'BTTV Pro' } },
    { providerId: '', badge: { svg: 'x' } },
    { providerId: '222' } // ohne badge -> ignorieren
  ])]);
  const map = await fetchBttvBadges({ ...fast, fetchImpl: fn });
  assert.deepEqual(map, {
    '111': [
      { url: 'https://cdn.bttv/dev.svg', title: 'BTTV Developer' },
      { url: 'https://cdn.bttv/pro.svg', title: 'BTTV Pro' }
    ]
  });
});

test('fetchBttvBadges: Fehler/kein Array -> leere Map', async () => {
  const { fn } = fakeFetch([res(500), res(500), res(500)]);
  assert.deepEqual(await fetchBttvBadges({ ...fast, fetchImpl: fn }), {});
  const { fn: fn2 } = fakeFetch([res(200, { not: 'array' })]);
  assert.deepEqual(await fetchBttvBadges({ ...fast, fetchImpl: fn2 }), {});
});

test('fetchFfzBadges: users-Map (badgeId -> [userId]) wird aufgeloest', async () => {
  const { fn } = fakeFetch([res(200, {
    badges: [
      { id: 2, title: 'FFZ Supporter', urls: { '1': '//cdn.ffz/1', '2': '//cdn.ffz/2' } },
      { id: 9, title: 'kaputt' } // ohne urls -> ignorieren
    ],
    users: { '2': [333, 444], '9': [555] }
  })]);
  const map = await fetchFfzBadges({ ...fast, fetchImpl: fn });
  assert.deepEqual(map, {
    '333': [{ url: 'https://cdn.ffz/2', title: 'FFZ Supporter' }],
    '444': [{ url: 'https://cdn.ffz/2', title: 'FFZ Supporter' }]
  });
});

test('fetchFfzBadges: Fehler -> leere Map', async () => {
  const { fn } = fakeFetch([new Error('offline'), new Error('offline'), new Error('offline')]);
  assert.deepEqual(await fetchFfzBadges({ ...fast, fetchImpl: fn }), {});
});
