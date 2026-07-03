const { test } = require('node:test');
const assert = require('node:assert');
const { res, fakeFetch, fast } = require('./helpers');
const {
  fetchGlobalBadges, fetchChannelBadges
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
