const { test } = require('node:test');
const assert = require('node:assert');
const { res, fakeFetch, fast } = require('./helpers');
const {
  fetchBttvEmotes, fetchBttvGlobal, fetchFfzEmotes, fetchFfzGlobal, mergeEmotes
} = require('../src/twitch-api');

test('fetchBttvEmotes: Kanal- und geteilte Emotes, Modifier raus', async () => {
  const { fn, calls } = fakeFetch([res(200, {
    channelEmotes: [{ id: 'aaa', code: 'eigenesEmote', animated: false }],
    sharedEmotes: [
      { id: 'bbb', code: 'Clap', animated: true },
      { id: 'ccc', code: 'w!', modifier: true }
    ]
  })]);
  const map = await fetchBttvEmotes('123', { ...fast, fetchImpl: fn });
  assert.deepEqual(map, {
    eigenesEmote: 'https://cdn.betterttv.net/emote/aaa/2x.webp',
    Clap: 'https://cdn.betterttv.net/emote/bbb/2x.webp'
  });
  assert.equal(calls[0].url, 'https://api.betterttv.net/3/cached/users/twitch/123');
});

test('fetchBttvEmotes: 404 (kein BTTV) / Fehler -> leer', async () => {
  const { fn } = fakeFetch([res(404)]);
  assert.deepEqual(await fetchBttvEmotes('123', { ...fast, fetchImpl: fn }), {});
  const { fn: fn2 } = fakeFetch([new Error('offline')]);
  assert.deepEqual(await fetchBttvEmotes('123', { ...fast, retries: 0, fetchImpl: fn2 }), {});
});

test('fetchBttvGlobal: Array von Emotes', async () => {
  const { fn } = fakeFetch([res(200, [{ id: 'g1', code: ':tf:' }, { id: 'g2', code: 'z!', modifier: true }])]);
  assert.deepEqual(await fetchBttvGlobal({ ...fast, fetchImpl: fn }), {
    ':tf:': 'https://cdn.betterttv.net/emote/g1/2x.webp'
  });
});

test('fetchFfzEmotes: alle Sets des Raums, animiert bevorzugt, 2x vor 1x', async () => {
  const { fn, calls } = fakeFetch([res(200, {
    room: {},
    sets: {
      '1': { emoticons: [
        { name: 'PepeLaugh', urls: { '1': 'https://cdn.ffz/1/1', '2': 'https://cdn.ffz/1/2' } },
        { name: 'nurKlein', urls: { '1': 'https://cdn.ffz/2/1' } }
      ] },
      '2': { emoticons: [
        { name: 'tanzt', urls: { '1': 'https://cdn.ffz/3/1' }, animated: { '2': 'https://cdn.ffz/3/anim2' } },
        { name: 'mod', modifier: true, urls: { '1': 'x' } },
        { name: 'ohneUrl', urls: {} }
      ] }
    }
  })]);
  const map = await fetchFfzEmotes('123', { ...fast, fetchImpl: fn });
  assert.deepEqual(map, {
    PepeLaugh: 'https://cdn.ffz/1/2',
    nurKlein: 'https://cdn.ffz/2/1',
    tanzt: 'https://cdn.ffz/3/anim2'
  });
  assert.equal(calls[0].url, 'https://api.frankerfacez.com/v1/room/id/123');
});

test('fetchFfzGlobal: nur die default_sets zaehlen als global', async () => {
  const { fn } = fakeFetch([res(200, {
    default_sets: [3],
    sets: {
      '3': { emoticons: [{ name: 'ZreknarF', urls: { '1': 'https://cdn.ffz/z' } }] },
      '999': { emoticons: [{ name: 'nurFuerAddon', urls: { '1': 'https://cdn.ffz/a' } }] }
    }
  })]);
  assert.deepEqual(await fetchFfzGlobal({ ...fast, fetchImpl: fn }), {
    ZreknarF: 'https://cdn.ffz/z'
  });
});

test('fetchFfzEmotes: Fehler -> leer', async () => {
  const { fn } = fakeFetch([res(404)]);
  assert.deepEqual(await fetchFfzEmotes('123', { ...fast, fetchImpl: fn }), {});
});

test('mergeEmotes: Kanal schlaegt global, 7TV schlaegt BTTV schlaegt FFZ', () => {
  const m = mergeEmotes({
    global: { sevenTv: { a: '7g', g: '7g' }, bttv: { a: 'bg', b: 'bg' }, ffz: { c: 'fg' } },
    kanal: { sevenTv: { k: '7k' }, bttv: { k: 'bk', g: 'bk' }, ffz: { k: 'fk', c: 'fk' } }
  });
  assert.deepEqual(m, { a: '7g', b: 'bg', c: 'fk', g: 'bk', k: '7k' });
});

test('mergeEmotes: Kanal-Emotes stehen in der Reihenfolge VOR den globalen', () => {
  const m = mergeEmotes({
    global: { sevenTv: { glob: 'g' } },
    kanal: { sevenTv: { kanal: 'k' }, bttv: { b: 'b' } }
  });
  assert.deepEqual(Object.keys(m), ['kanal', 'b', 'glob']);
});

test('mergeEmotes: fehlende Quellen sind ok', () => {
  assert.deepEqual(mergeEmotes({}), {});
});
