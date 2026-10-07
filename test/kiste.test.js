const { test } = require('node:test');
const assert = require('node:assert');
const K = require('../renderer/lib/kiste');

function fakeDoc() {
  const doc = {
    createElement: (tag) => {
      const el = {
        tag, className: '', innerHTML: '', kinder: [], props: {}, parent: null,
        style: { setProperty: (k, v) => { el.props[k] = v; } },
        appendChild(c) { c.parent = el; el.kinder.push(c); },
        remove() { if (el.parent) el.parent.kinder = el.parent.kinder.filter((k) => k !== el); el.parent = null; }
      };
      return el;
    }
  };
  return doc;
}

for (const [stil, teil, n] of [['geschenk', 'kfx-konfetti', 8], ['pixel', 'kfx-pix', 6]]) {
  test('spieleKiste ' + stil + ': Kiste mit Teilchen in die Leiste, raeumt sich auf', () => {
    const doc = fakeDoc();
    const wirt = doc.createElement('span');
    const timer = [];
    const el = K.spieleKiste({ doc, wirt, stil, setTimeout: (fn, ms) => timer.push({ fn, ms }) });
    assert.equal(el.className, 'kfx-kiste kfx-' + stil);
    assert.ok(el.innerHTML.includes(stil === 'pixel' ? 'kfx-auf' : 'kfx-deckel'), 'Oeffnen gezeichnet');
    assert.equal(el.kinder.filter((k) => k.className === teil).length, n);
    assert.ok(el.kinder.every((k) => /^-?\d+px$/.test(k.props['--dx']) && /^-\d+px$/.test(k.props['--dy'])), 'Flugbahn nach oben');
    assert.equal(wirt.kinder.length, 1);
    assert.equal(timer[0].ms, K.KISTE_MS);
    timer[0].fn();
    assert.equal(wirt.kinder.length, 0);
  });
}

test('cleanStil: unbekannt -> Geschenk', () => {
  assert.equal(K.cleanStil('pixel'), 'pixel');
  for (const muell of [undefined, null, '', 'gold', 42]) assert.equal(K.cleanStil(muell), 'geschenk');
  const doc = fakeDoc();
  const el = K.spieleKiste({ doc, wirt: doc.createElement('span'), stil: 'quatsch', setTimeout: () => {} });
  assert.equal(el.className, 'kfx-kiste kfx-geschenk');
});

test('spielePunkte: Chip pulsiert erneut, Funken raeumen sich auf', () => {
  const doc = fakeDoc();
  const wirt = doc.createElement('span');
  const klassen = new Set(['kfx-puls']);
  const chip = { offsetWidth: 10, classList: { remove: (k) => klassen.delete(k), add: (k) => klassen.add(k) } };
  const timer = [];
  K.spielePunkte({ doc, wirt, chip, setTimeout: (fn, ms) => timer.push({ fn, ms }) });
  assert.ok(klassen.has('kfx-puls'));
  assert.equal(wirt.kinder.length, 1);
  timer[0].fn();
  assert.equal(wirt.kinder.length, 0);
  // ohne Chip (unsichtbar/nicht da) kein Absturz
  K.spielePunkte({ doc, wirt, chip: null, setTimeout: () => {} });
});
