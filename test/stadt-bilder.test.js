'use strict';
// Chat-Stadt (Regennacht): Bilder und stadt.json aus tools/stadt-bilder.py.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const DIR = path.join(__dirname, '..', 'renderer', 'themes', 'cozy');
const JSON_PFAD = path.join(__dirname, '..', 'tools', 'raum-quellen', 'stadt.json');

function ladeJson() {
  assert.ok(fs.existsSync(JSON_PFAD), 'tools/raum-quellen/stadt.json fehlt');
  return JSON.parse(fs.readFileSync(JSON_PFAD, 'utf8'));
}

// Kleiner PNG-Dekoder (wie raum-bilder.test.js): nur Farbtyp 6, 8 Bit.
function dekodiere(name) {
  const p = path.join(DIR, name);
  assert.ok(fs.existsSync(p), name + ' fehlt');
  const buf = fs.readFileSync(p);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  assert.strictEqual(buf[24], 8, name + ': nur 8 Bit');
  assert.strictEqual(buf[25], 6, name + ': nur RGBA');
  const teile = [];
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    if (buf.toString('ascii', pos + 4, pos + 8) === 'IDAT') teile.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const roh = zlib.inflateSync(Buffer.concat(teile));
  const zeile = w * 4;
  const px = Buffer.alloc(h * zeile);
  for (let y = 0; y < h; y++) {
    const f = roh[y * (zeile + 1)];
    const src = y * (zeile + 1) + 1;
    for (let i = 0; i < zeile; i++) {
      const x = roh[src + i];
      const a = i >= 4 ? px[y * zeile + i - 4] : 0;
      const b = y > 0 ? px[(y - 1) * zeile + i] : 0;
      const c = i >= 4 && y > 0 ? px[(y - 1) * zeile + i - 4] : 0;
      let v;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) {
        const p0 = a + b - c;
        const pa = Math.abs(p0 - a), pb = Math.abs(p0 - b), pc = Math.abs(p0 - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error('unbekannter PNG-Filter ' + f);
      px[y * zeile + i] = v & 255;
    }
  }
  return { w, h, px };
}

const pixel = (bild, x, y) => bild.px.readUInt32BE((y * bild.w + x) * 4);

test('stadt.json: Felder fuer Bild, Ebenen, Fenster, Figuren, Fahrzeuge, Regen, Strasse', () => {
  const s = ladeJson();
  assert.ok(s.bild.b > 0 && s.bild.h > 0);
  for (const e of ['himmel', 'haeuser', 'strasse']) {
    assert.ok(Number.isInteger(s.ebenen[e].y) && s.ebenen[e].h > 0, 'Ebene ' + e);
  }
  // Ebenen liegen lueckenlos untereinander und fuellen das Bild
  assert.strictEqual(s.ebenen.himmel.y, 0);
  assert.strictEqual(s.ebenen.haeuser.y, s.ebenen.himmel.y + s.ebenen.himmel.h);
  assert.strictEqual(s.ebenen.strasse.y, s.ebenen.haeuser.y + s.ebenen.haeuser.h);
  assert.strictEqual(s.ebenen.strasse.y + s.ebenen.strasse.h, s.bild.h);
  assert.ok(Array.isArray(s.fenster) && s.fenster.length >= 20, 'mindestens 20 Fenster');
  for (const k of ['b', 'h', 'bilder', 'msProBild', 'pxProBild']) assert.ok(s.figur[k] > 0, 'figur.' + k);
  // 7 verschiedene Passanten (Janis 13.11.: „paar mehr Leute, verschiedene Passanten“)
  assert.ok(Array.isArray(s.figur.varianten) && s.figur.varianten.length >= 7);
  // Blitz-Strahl (PixelLab-Effekt „TwitchDual Stadt-Blitz“): Bildstreifen, Oberkante im Himmel
  for (const k of ['b', 'h', 'bilder', 'msProBild']) assert.ok(s.strahl[k] > 0, 'strahl.' + k);
  assert.ok(s.strahl.y >= 0 && s.strahl.y + s.strahl.h <= s.ebenen.haeuser.y + 10, 'Strahl endet in der Skyline');
  // Leuchtende Wolke (Lage der Blitz-Ebene): der Strahl kommt aus ihr (Janis 13.11.)
  const w = s.blitzWolke;
  assert.ok(w.b >= s.strahl.b && w.h > 0, 'Wolke breit genug');
  assert.ok(s.strahl.y >= w.y && s.strahl.y <= w.y + w.h, 'Strahl beginnt in der Wolke');
  for (const k of ['auto', 'bus']) assert.ok(s[k].b > 0 && s[k].h > 0, k);
  // Autos 1,4x in mehreren Farben (Janis 13.11.), Radlinie fuer die Spiegelung
  assert.ok(Array.isArray(s.auto.varianten) && s.auto.varianten.length >= 2);
  assert.ok(s.auto.radY > s.auto.h / 2 && s.auto.radY < s.auto.h);
  assert.ok(s.bus.tuerX > 0 && s.bus.tuerX < s.bus.b);
  // Regen: PixelLab-Effekt (vfx_workbench) als Bildstreifen je Ebene, nahtlose Schleife
  assert.deepStrictEqual(s.regen.dateien, ['stadt-regen-himmel.png', 'stadt-regen-strasse.png']);
  assert.ok(s.regen.bilder >= 8 && s.regen.msProBild > 0);
  // Fuesse der Passanten auf dem Gehweg, Fahrzeuge auf der Fahrbahn: beides im Strassenband
  const band = s.ebenen.strasse;
  for (const y of [s.gehwegY, s.fahrbahnY]) assert.ok(y > band.y && y <= band.y + band.h, 'im Band: ' + y);
  assert.ok(s.gehwegY < s.fahrbahnY);
  // Review Focus 1/Final-Fund: Passanten und Autos ganz im Band (nicht hinter dem Text)
  assert.ok(band.y <= s.gehwegY - s.figur.h, 'Passant ragt ueber das Band');
  assert.ok(band.y <= s.fahrbahnY - s.auto.h, 'Auto ragt ueber das Band');
});

test('Fenster liegen unter dem Himmel im Bild und sind mindestens 2x2', () => {
  const s = ladeJson();
  for (const f of s.fenster) {
    assert.ok(f.b >= 2 && f.h >= 2, JSON.stringify(f));
    assert.ok(f.x >= 0 && f.x + f.b <= s.bild.b, JSON.stringify(f));
    assert.ok(f.y >= s.ebenen.haeuser.y && f.y + f.h <= s.bild.h, 'Fenster im Himmel: ' + JSON.stringify(f));
  }
});

test('alle Stadt-Bilder existieren und haben die Masse aus stadt.json', () => {
  const s = ladeJson();
  const erwartet = {
    'stadt.png': [s.bild.b, s.bild.h],
    'stadt-haeuser-licht.png': [s.bild.b, s.bild.h],
    'stadt-himmel-blitz.png': [s.bild.b, s.bild.h],
    'stadt-bus.png': [s.bus.b, s.bus.h],
    'stadt-bus-tuer.png': [s.bus.b, s.bus.h],
  };
  for (const v of s.auto.varianten) erwartet[v] = [s.auto.b, s.auto.h];
  erwartet['stadt-blitz-strahl.png'] = [s.strahl.b * s.strahl.bilder, s.strahl.h];
  for (const d of s.regen.dateien) erwartet[d] = [s.bild.b * s.regen.bilder, s.bild.h];
  for (const v of s.figur.varianten) erwartet[v] = [s.figur.b * s.figur.bilder, s.figur.h];
  for (const [name, [b, h]] of Object.entries(erwartet)) {
    const bild = dekodiere(name);
    assert.deepStrictEqual([bild.w, bild.h], [b, h], name);
  }
});

test('helle Haeuser unterscheiden sich vom Grundbild nur in den Fenstern', () => {
  const s = ladeJson();
  const dunkel = dekodiere('stadt.png');
  const hell = dekodiere('stadt-haeuser-licht.png');
  const inFenster = (x, y) => s.fenster.some((f) => x >= f.x && x < f.x + f.b && y >= f.y && y < f.y + f.h);
  let ausserhalb = 0;
  for (let y = 0; y < dunkel.h; y++) {
    for (let x = 0; x < dunkel.w; x++) {
      if (pixel(dunkel, x, y) !== pixel(hell, x, y) && !inFenster(x, y)) ausserhalb++;
    }
  }
  assert.strictEqual(ausserhalb, 0);
});

test('Blitz-Ebene ist nur im Himmel sichtbar, sonst durchsichtig', () => {
  const s = ladeJson();
  const blitz = dekodiere('stadt-himmel-blitz.png');
  const ende = s.ebenen.himmel.y + s.ebenen.himmel.h;
  let sichtbar = 0;
  for (let y = 0; y < blitz.h; y++) {
    for (let x = 0; x < blitz.w; x++) {
      const a = blitz.px[(y * blitz.w + x) * 4 + 3];
      if (a > 0) {
        sichtbar++;
        assert.ok(y < ende, 'Blitz-Pixel unter dem Himmel bei y ' + y);
      }
    }
  }
  assert.ok(sichtbar > 100, 'Blitz-Ebene ist leer');
});
