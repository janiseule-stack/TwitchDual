// Szenen-Streifen im Chat (Cozy-Raum Etappe 3, Janis 11.11.2026): nicht mehr
// ganzzahlig. Faktor = Breite/344, das Fenster im Bild ist immer ganz zu sehen
// (Streifen hoechstens 30 % der Chat-Hoehe), oben wird beschnitten.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const S = require('../renderer/lib/szene');

test('faktor: Breite durch 344, nicht ganzzahlig', () => {
  assert.strictEqual(S.faktor(688), 2);
  assert.strictEqual(S.faktor(344), 1);
  assert.ok(Math.abs(S.faktor(1397) - 4.061) < 0.001);
  assert.ok(S.faktor(300) < 1);
});
test('faktor/masse: Muell -> Standardwerte', () => {
  for (const b of [0, NaN, -5, undefined, 'x', {}]) {
    assert.strictEqual(S.faktor(b), 1);
    assert.deepStrictEqual(S.masse(b, 900), { faktor: 1, breite: 344, hoehe: 72, oben: 0 });
  }
});
test('masse: ohne Hoehe die volle Bildhoehe', () => {
  assert.deepStrictEqual(S.masse(688, undefined), { faktor: 2, breite: 688, hoehe: 144, oben: 0 });
});

// Kleiner PNG-Dekoder (Farbtyp 6, 8 Bit), wie in raum-bilder.test.js.
function dekodiere(buf) {
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  assert.strictEqual(buf[24], 8);
  assert.strictEqual(buf[25], 6);
  const teile = [];
  for (let pos = 8; pos < buf.length;) {
    const len = buf.readUInt32BE(pos);
    if (buf.toString('ascii', pos + 4, pos + 8) === 'IDAT') teile.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const roh = zlib.inflateSync(Buffer.concat(teile));
  const zeile = w * 4, px = Buffer.alloc(h * zeile);
  for (let y = 0; y < h; y++) {
    const f = roh[y * (zeile + 1)], src = y * (zeile + 1) + 1;
    for (let i = 0; i < zeile; i++) {
      const x = roh[src + i];
      const a = i >= 4 ? px[y * zeile + i - 4] : 0;
      const b = y > 0 ? px[(y - 1) * zeile + i] : 0;
      const c = i >= 4 && y > 0 ? px[(y - 1) * zeile + i - 4] : 0;
      let v;
      if (f === 0) v = x; else if (f === 1) v = x + a; else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[y * zeile + i] = v & 255;
    }
  }
  return { w, h, px };
}

test('KERN_OBEN: oberste Zeile mit Fensterrahmen-Holz (#6a311c) im Fenster-Bereich', () => {
  const bild = dekodiere(fs.readFileSync(path.join(__dirname, '..', 'renderer/themes/cozy/streifen.png')));
  assert.strictEqual(bild.w, S.BILD.breite);
  assert.strictEqual(bild.h, S.BILD.hoehe);
  const hatRahmen = (y) => {
    for (let x = 95; x <= 265; x++) {
      const i = (y * bild.w + x) * 4;
      if (bild.px[i] === 0x6a && bild.px[i + 1] === 0x31 && bild.px[i + 2] === 0x1c && bild.px[i + 3] === 255) return true;
    }
    return false;
  };
  assert.ok(hatRahmen(S.KERN_OBEN), 'Zeile KERN_OBEN hat Rahmenpixel');
  for (let y = 0; y < S.KERN_OBEN; y++) assert.ok(!hatRahmen(y), 'Zeile ' + y + ' darueber ohne Rahmen');
});

test('masse: Raster aus Breiten und Hoehen', () => {
  for (const W of [300, 400, 700, 1397, 1400, 2500]) {
    for (const H of [600, 700, 1000, 1332]) {
      const m = S.masse(W, H);
      const f = W / 344;
      const kern = Math.round((72 - S.KERN_OBEN) * f);
      assert.ok(Math.abs(m.faktor - f) < 1e-9, 'faktor ' + W);
      assert.strictEqual(m.breite, W);
      assert.ok(Number.isInteger(m.hoehe) && Number.isInteger(m.oben), W + 'x' + H);
      assert.ok(m.oben <= 0);
      assert.strictEqual(m.oben, m.hoehe - Math.round(72 * f));
      if (kern <= 0.3 * H) assert.ok(-m.oben <= Math.ceil(S.KERN_OBEN * f), 'Fenster sichtbar ' + W + 'x' + H);
      else assert.strictEqual(m.hoehe, Math.round(0.3 * H), 'Deckel 30 % ' + W + 'x' + H);
    }
  }
});
test('masse: niedriges Fenster behaelt eine Mindesthoehe', () => {
  assert.strictEqual(S.masse(1400, 100).hoehe, 48);
});
