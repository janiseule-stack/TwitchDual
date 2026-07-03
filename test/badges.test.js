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
