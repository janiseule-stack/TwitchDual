'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const DIR = path.join(__dirname, '..', 'renderer', 'themes', 'cozy');

const MASSE = {
  'raum.png': [344, 192],
  'regal.png': [344, 192],
  'raum-tv-aus.png': [344, 192],
  'raum-tv-maske.png': [344, 192],
  'huelle.png': [40, 40],
  'huelle-rueck.png': [40, 40],
  'platte-klein.png': [12, 12],
  'platte-vorn.png': [36, 36],
  'zettel.png': [129, 96],
  'schild.png': [131, 41],
};

const KOPF = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function lade(name) {
  return fs.readFileSync(path.join(DIR, name));
}

// Kleiner PNG-Dekoder: nur Farbtyp 6, 8 Bit. Gibt {w, h, px} (RGBA) zurueck.
function dekodiere(buf) {
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  assert.strictEqual(buf[24], 8, 'nur 8 Bit unterstuetzt');
  assert.strictEqual(buf[25], 6, 'nur Farbtyp 6 (RGBA) unterstuetzt');
  const teile = [];
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const typ = buf.toString('ascii', pos + 4, pos + 8);
    if (typ === 'IDAT') teile.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const roh = zlib.inflateSync(Buffer.concat(teile));
  const bpp = 4;
  const zeile = w * bpp;
  const px = Buffer.alloc(h * zeile);
  for (let y = 0; y < h; y++) {
    const f = roh[y * (zeile + 1)];
    const src = y * (zeile + 1) + 1;
    for (let i = 0; i < zeile; i++) {
      const x = roh[src + i];
      const a = i >= bpp ? px[y * zeile + i - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * zeile + i] : 0;
      const c = i >= bpp && y > 0 ? px[(y - 1) * zeile + i - bpp] : 0;
      let v;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error('unbekannter PNG-Filter ' + f);
      px[y * zeile + i] = v & 255;
    }
  }
  return { w, h, px };
}

function zaehleGruen(bild) {
  let n = 0;
  for (let i = 0; i < bild.px.length; i += 4) {
    if (bild.px[i + 1] > 200 && bild.px[i] < 90) n++;
  }
  return n;
}

for (const [name, [w, h]] of Object.entries(MASSE)) {
  test(`${name}: vorhanden, PNG, ${w}x${h}`, () => {
    const buf = lade(name);
    assert.ok(buf.subarray(0, 8).equals(KOPF), 'kein PNG-Kopf');
    assert.strictEqual(buf.readUInt32BE(16), w);
    assert.strictEqual(buf.readUInt32BE(20), h);
  });
}

test('raum-tv-aus.png hat kein Gruen mehr', () => {
  assert.strictEqual(zaehleGruen(dekodiere(lade('raum-tv-aus.png'))), 0);
});

test('raum-tv-aus.png ist ausserhalb der gruenen Pixel gleich raum.png', () => {
  const raum = dekodiere(lade('raum.png'));
  const aus = dekodiere(lade('raum-tv-aus.png'));
  assert.strictEqual(aus.w, raum.w);
  assert.strictEqual(aus.h, raum.h);
  let geprueft = 0;
  for (let i = 0; i < raum.px.length; i += 4) {
    if (raum.px[i + 1] > 200 && raum.px[i] < 90) continue;
    for (let k = 0; k < 4; k++) {
      if (aus.px[i + k] !== raum.px[i + k]) assert.fail('Pixel ' + (i / 4) + ' weicht ab');
    }
    geprueft++;
  }
  assert.ok(geprueft > 0);
});

test('huelle-rueck.png ist die PixelLab-Quelle aus tools/raum-quellen/', () => {
  const a = dekodiere(lade('huelle-rueck.png'));
  const b = dekodiere(fs.readFileSync(path.join(__dirname, '..', 'tools', 'raum-quellen', 'huelle-rueck.png')));
  assert.strictEqual(a.w, b.w);
  assert.strictEqual(a.h, b.h);
  assert.ok(a.px.equals(b.px));
});

test('huelle.png ist im Fenster (2,2,36,36) durchsichtig', () => {
  const b = dekodiere(lade('huelle.png'));
  for (let y = 2; y < 38; y++) {
    for (let x = 2; x < 38; x++) {
      assert.strictEqual(b.px[(y * b.w + x) * 4 + 3], 0, `Pixel ${x},${y} nicht durchsichtig`);
    }
  }
});

test('raum-tv-maske.png deckt genau die gruenen Pixel von raum.png', () => {
  const maske = dekodiere(lade('raum-tv-maske.png'));
  let deckend = 0;
  for (let i = 3; i < maske.px.length; i += 4) if (maske.px[i] > 0) deckend++;
  const gruen = zaehleGruen(dekodiere(lade('raum.png')));
  assert.ok(gruen > 0, 'raum.png hat kein Gruen');
  assert.strictEqual(deckend, gruen);
});
