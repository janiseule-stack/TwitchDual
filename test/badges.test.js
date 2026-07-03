const { test } = require('node:test');
const assert = require('node:assert');
const Badges = require('../renderer/lib/badges');

test('parseBadgeTag: Set/Version-Paare inkl. Wahl-Badges', () => {
  assert.deepEqual(
    Badges.parseBadgeTag({ badges: 'subscriber/24,premium/1,game-developer/1' }),
    [
      { set: 'subscriber', version: '24' },
      { set: 'premium', version: '1' },
      { set: 'game-developer', version: '1' }
    ]
  );
});

test('parseBadgeTag: kaputte/leere Tags werfen nie', () => {
  assert.deepEqual(Badges.parseBadgeTag({ badges: '' }), []);
  assert.deepEqual(Badges.parseBadgeTag({}), []);
  assert.deepEqual(Badges.parseBadgeTag(null), []);
  // fehlende Version -> '1'; leere Teile fliegen raus
  assert.deepEqual(
    Badges.parseBadgeTag({ badges: 'vip,,broadcaster/' }),
    [{ set: 'vip', version: '1' }, { set: 'broadcaster', version: '1' }]
  );
});

test('subMonths: Abo-Monate aus badge-info (subscriber und founder)', () => {
  assert.equal(Badges.subMonths({ 'badge-info': 'subscriber/26' }), 26);
  assert.equal(Badges.subMonths({ 'badge-info': 'founder/14' }), 14);
  assert.equal(Badges.subMonths({ 'badge-info': 'predictions/blue-1' }), null);
  assert.equal(Badges.subMonths({}), null);
  assert.equal(Badges.subMonths(null), null);
});

const GLOBAL = [
  { setID: 'moderator', version: '1', title: 'Moderator', imageURL: 'https://cdn/mod/2' },
  { setID: 'subscriber', version: '0', title: 'Subscriber', imageURL: 'https://cdn/sub0/2' },
  { setID: 'premium', version: '1', title: 'Prime Gaming', imageURL: 'https://cdn/prime/2' }
];
const CHANNEL = [
  { setID: 'subscriber', version: '0', title: 'Sub', imageURL: 'https://cdn/ch-sub0/2' },
  { setID: 'subscriber', version: '24', title: '2-Year Sub', imageURL: 'https://cdn/ch-sub24/2' },
  { setID: 'bits', version: '1000', title: 'cheer 1000', imageURL: 'https://cdn/ch-bits1k/2' }
];

test('buildCatalog: Kanal ueberschreibt global, set/* als Versions-Fallback', () => {
  const cat = Badges.buildCatalog(GLOBAL, CHANNEL);
  assert.equal(cat['moderator/1'].url, 'https://cdn/mod/2');
  assert.equal(cat['subscriber/0'].url, 'https://cdn/ch-sub0/2');   // Kanal gewinnt
  assert.equal(cat['subscriber/24'].url, 'https://cdn/ch-sub24/2');
  assert.equal(cat['bits/1000'].url, 'https://cdn/ch-bits1k/2');
  assert.equal(cat['subscriber/*'].url, 'https://cdn/ch-sub0/2');   // erste Kanal-Version
  assert.equal(cat['moderator/*'].url, 'https://cdn/mod/2');
});

test('buildCatalog: kaputte Eintraege/Listen werfen nie', () => {
  assert.deepEqual(Badges.buildCatalog(null, undefined), {});
  const cat = Badges.buildCatalog([null, {}, { setID: 'x', version: '1' }], []);
  assert.deepEqual(cat, {}); // ohne imageURL kein Eintrag
});

test('resolve: bekannte Badges -> Bilder, unbekanntes Set -> weglassen', () => {
  const cat = Badges.buildCatalog(GLOBAL, CHANNEL);
  const out = Badges.resolve(
    [
      { set: 'moderator', version: '1' },
      { set: 'subscriber', version: '24' },
      { set: 'voellig-unbekannt', version: '1' },
      { set: 'subscriber', version: '99' } // unbekannte Version -> set/*
    ],
    cat
  );
  assert.deepEqual(out.map((b) => b.url), [
    'https://cdn/mod/2', 'https://cdn/ch-sub24/2', 'https://cdn/ch-sub0/2'
  ]);
});

test('resolve: months landet im Subscriber-Tooltip', () => {
  const cat = Badges.buildCatalog(GLOBAL, CHANNEL);
  const out = Badges.resolve([{ set: 'subscriber', version: '24' }], cat, { months: 26 });
  assert.equal(out[0].title, '2-Year Sub (26 Monate)');
});

test('resolve: leerer Katalog -> Kuerzel-Fallback fuer bekannte Typen', () => {
  const out = Badges.resolve(
    [{ set: 'broadcaster', version: '1' }, { set: 'premium', version: '1' }],
    {}
  );
  assert.deepEqual(out, [
    { fallback: 'B', color: '#eb0400', title: 'broadcaster' }
  ]);
});

test('resolve: kaputte Eingaben werfen nie', () => {
  assert.deepEqual(Badges.resolve(null, null), []);
  assert.deepEqual(Badges.resolve([null, {}], undefined), []);
});
