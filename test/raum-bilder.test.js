'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const DIR = path.join(__dirname, '..', 'renderer', 'themes', 'cozy');

const REGAL_JSON = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'raum-quellen', 'regal.json'), 'utf8'));
const RUECKEN = REGAL_JSON.ruecken;
const HOV = REGAL_JSON.hover;

const MASSE = {
  'raum.png': [344, 192],
  'regal.png': [344, 192],
  'regal-wand.png': [504, 192],
  'ruecken-live.png': [RUECKEN.b, RUECKEN.h],
  'ruecken-favorit.png': [RUECKEN.b, RUECKEN.h],
  'ruecken-offline.png': [RUECKEN.b, RUECKEN.h],
  'ruecken-twitch.png': [RUECKEN.b, RUECKEN.h],
  'karte.png': [96, 96],
  'karte-rueck.png': [96, 96],
  'raum-tv-aus.png': [344, 192],
  'raum-tv-maske.png': [344, 192],
  'huelle.png': [40, 40],
  'huelle-rueck.png': [40, 40],
  'platte-klein.png': [12, 12],
  'platte-vorn.png': [36, 36],
  'zettel.png': [129, 96],
  'schild.png': [131, 41],
  'hover-regal.png': [HOV.b, HOV.h],
  'hover-lampe.png': [39, 112],
  'hover-fernseher.png': [78, 78],
  'hover-plattenspieler.png': [54, 50],
  'hover-bild.png': [40, 62],
  'platte-dreht.png': [432, 50],
  'huelle-gross-vorn.png': [128, 128],
  'huelle-gross-rueck.png': [128, 128],
  'schild-live.png': [32, 19],
  'schild-vod.png': [32, 19],
  'schild-aus.png': [32, 19],
  'schild-pfeil.png': [256, 19],
  'leiste-video-links.png': [334, 39],
  'raum-wand.png': [504, 192],
};

// Ursprung der Hover-Ausschnitte im Raum (Klickflaeche - 4)
const HOVER_URSPRUNG = {
  regal: [HOV.x, HOV.y],
  lampe: [161, 2],
  fernseher: [194, 34],
  plattenspieler: [258, 82],
  bild: [278, 32],
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

// gelbWeg (leben.json, Janis: Regen ohne Gelb): gelbliche Pixel kuehl einfaerben,
// gleiche Regel wie tools/raum-bilder.py (int() = Math.trunc, Werte sind >= 0).
function gelbWeg(p) {
  const [r, g, b, a] = p;
  if (r - b > 5 && Math.abs(r - g) < 25) {
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    if (l < 130) return [Math.trunc(l * 0.82), Math.trunc(l * 0.95), Math.min(255, Math.trunc(l * 1.2)), a];
  }
  return [r, g, b, a];
}
const LEBEN_JSON = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'raum-quellen', 'leben.json'), 'utf8'));
const GELB_WEG = LEBEN_JSON.home.animationen.filter((a) => a.gelbWeg).map((a) => a.gelbWeg);
const inGelbWeg = (x, y) => GELB_WEG.some((r) => x >= r.x && x < r.x + r.b && y >= r.y && y < r.y + r.h);

test('raum-tv-aus.png ist ausserhalb der gruenen Pixel gleich raum.png (im gelbWeg-Rechteck kuehl eingefaerbt)', () => {
  const raum = dekodiere(lade('raum.png'));
  const aus = dekodiere(lade('raum-tv-aus.png'));
  assert.strictEqual(aus.w, raum.w);
  assert.strictEqual(aus.h, raum.h);
  let geprueft = 0;
  for (let i = 0; i < raum.px.length; i += 4) {
    if (raum.px[i + 1] > 200 && raum.px[i] < 90) continue;
    const n = i / 4;
    const soll = inGelbWeg(n % raum.w, Math.floor(n / raum.w))
      ? gelbWeg([raum.px[i], raum.px[i + 1], raum.px[i + 2], raum.px[i + 3]])
      : [raum.px[i], raum.px[i + 1], raum.px[i + 2], raum.px[i + 3]];
    for (let k = 0; k < 4; k++) {
      if (aus.px[i + k] !== soll[k]) assert.fail('Pixel ' + n + ' weicht ab');
    }
    geprueft++;
  }
  assert.ok(geprueft > 0);
});

test('gelbWeg: im Rechteck bleibt kein gelblicher Pixel in raum-tv-aus.png', () => {
  assert.ok(GELB_WEG.length > 0);
  const aus = dekodiere(lade('raum-tv-aus.png'));
  for (const r of GELB_WEG) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.b; x++) {
        const i = (y * aus.w + x) * 4;
        const p = [aus.px[i], aus.px[i + 1], aus.px[i + 2], aus.px[i + 3]];
        assert.deepStrictEqual(gelbWeg(p), p, `${x},${y} noch gelblich`);
      }
    }
  }
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

test('huelle.png hat deckende Kante oben, unten, links und rechts', () => {
  const b = dekodiere(lade('huelle.png'));
  const deckend = (x, y) => b.px[(y * b.w + x) * 4 + 3] > 0;
  const hat = (xs, ys) => xs.some((x) => ys.some((y) => deckend(x, y)));
  const alle = Array.from({ length: 40 }, (_, i) => i);
  assert.ok(hat(alle, [0, 1]), 'oben');
  assert.ok(hat(alle, [38, 39]), 'unten');
  assert.ok(hat([0, 1], alle), 'links');
  assert.ok(hat([38, 39], alle), 'rechts');
});

for (const [id, [ox, oy]] of Object.entries(HOVER_URSPRUNG)) {
  test(`hover-${id}.png: jeder deckende Pixel gleich raum-tv-aus.png an (${ox},${oy})+Pixel`, () => {
    const h = dekodiere(lade(`hover-${id}.png`));
    const aus = dekodiere(lade('raum-tv-aus.png'));
    let deckend = 0;
    let abweichungen = 0;
    for (let y = 0; y < h.h; y++) {
      for (let x = 0; x < h.w; x++) {
        const i = (y * h.w + x) * 4;
        if (h.px[i + 3] === 0) continue;
        deckend++;
        const j = ((oy + y) * aus.w + (ox + x)) * 4;
        for (let k = 0; k < 4; k++) if (h.px[i + k] !== aus.px[j + k]) { abweichungen++; break; }
      }
    }
    assert.ok(deckend > 0, 'nichts deckend');
    assert.strictEqual(abweichungen, 0, abweichungen + ' Pixel weichen ab');
  });
}

test('hover-fernseher.png: Bildschirm-Pixel (gruen in raum.png) sind durchsichtig', () => {
  const [ox, oy] = HOVER_URSPRUNG.fernseher;
  const h = dekodiere(lade('hover-fernseher.png'));
  const raum = dekodiere(lade('raum.png'));
  let durchsichtig = 0;
  for (let y = 0; y < h.h; y++) {
    for (let x = 0; x < h.w; x++) {
      const j = ((oy + y) * raum.w + (ox + x)) * 4;
      const gruen = raum.px[j + 1] > 200 && raum.px[j] < 90;
      const a = h.px[(y * h.w + x) * 4 + 3];
      if (gruen) { assert.strictEqual(a, 0, `Bildschirm-Pixel ${x},${y} nicht durchsichtig`); durchsichtig++; }
    }
  }
  assert.ok(durchsichtig > 100, 'zu wenig Bildschirm-Pixel');
});

test('platte-dreht.png: 8 Bilder je 54x50, nur Pixel innerhalb der Flaeche von hover-plattenspieler.png', () => {
  const s = dekodiere(lade('platte-dreht.png'));
  const hov = dekodiere(lade('hover-plattenspieler.png'));
  let deckend = 0;
  for (let f = 0; f < 8; f++) {
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 54; x++) {
        const a = s.px[(y * s.w + f * 54 + x) * 4 + 3];
        if (a > 0) {
          deckend++;
          assert.ok(hov.px[(y * hov.w + x) * 4 + 3] > 0, `Bild ${f + 1} Pixel ${x},${y} ausserhalb der Flaeche`);
        }
      }
    }
  }
  assert.ok(deckend > 8 * 100, 'zu wenig deckende Pixel');
});

// Janis 11.11.2026: nur die Platte dreht; der Schalter vorne (ab Zeile 32) blinkte in der
// Schleife -> unterhalb von TELLER_BIS bleibt jedes Bild wie Quellbild 1.
const TELLER_BIS = 32;
test('platte-dreht.png: oben (Platte) = Quellbild N, darunter (Schalter) = Quellbild 1, Rest durchsichtig', () => {
  const s = dekodiere(lade('platte-dreht.png'));
  const hov = dekodiere(lade('hover-plattenspieler.png'));
  const quelle = (n) => dekodiere(fs.readFileSync(path.join(__dirname, '..', 'tools', 'raum-quellen', `platte-dreht-${n}.png`)));
  const erstes = quelle(1);
  for (let n = 1; n <= 8; n++) {
    const qn = quelle(n);
    for (let y = 0; y < 50; y++) {
      const q = y < TELLER_BIS ? qn : erstes;
      for (let x = 0; x < 54; x++) {
        const i = (y * s.w + (n - 1) * 54 + x) * 4;
        if (hov.px[(y * hov.w + x) * 4 + 3] > 0) {
          const j = ((y + 2) * q.w + (x + 2)) * 4;
          for (let k = 0; k < 4; k++) {
            if (s.px[i + k] !== q.px[j + k]) assert.fail(`Bild ${n} Pixel ${x},${y} weicht von der Quelle ab`);
          }
        } else {
          assert.strictEqual(s.px[i + 3], 0, `Bild ${n} Pixel ${x},${y} muss durchsichtig sein`);
        }
      }
    }
  }
});

test('schrift/RaumKlar.ttf: vorhanden, TrueType-Kennung', () => {
  const b = fs.readFileSync(path.join(DIR, 'schrift', 'RaumKlar.ttf'));
  const k = b.subarray(0, 4);
  assert.ok(k.equals(Buffer.from([0, 1, 0, 0])) || k.toString('ascii') === 'true', 'keine TrueType-Kennung');
});

// Grosse Huelle (Task 3b): Quelle = Janis' Wahl (entwuerfe/gross/vorn-1, rueck-2).
const QUELLEN = path.join(__dirname, '..', 'tools', 'raum-quellen');
const imRechteck = (x, y, r) => x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3];

for (const [name, loch] of [['huelle-gross-vorn.png', [32, 32, 65, 65]], ['huelle-gross-rueck.png', [19, 30, 90, 70]]]) {
  test(`${name}: im Rechteck ${loch.join(',')} durchsichtig, sonst gleich der PixelLab-Quelle`, () => {
    const a = dekodiere(lade(name));
    const q = dekodiere(fs.readFileSync(path.join(QUELLEN, name)));
    assert.strictEqual(a.w, q.w);
    assert.strictEqual(a.h, q.h);
    let deckend = 0;
    for (let y = 0; y < a.h; y++) {
      for (let x = 0; x < a.w; x++) {
        const i = (y * a.w + x) * 4;
        if (imRechteck(x, y, loch)) { assert.strictEqual(a.px[i + 3], 0, `${x},${y} nicht durchsichtig`); continue; }
        for (let k = 0; k < 4; k++) if (a.px[i + k] !== q.px[i + k]) assert.fail(`${x},${y} weicht von der Quelle ab`);
        if (a.px[i + 3] > 0) deckend++;
      }
    }
    assert.ok(deckend > 200, 'zu wenig deckende Pixel');
  });
}

test('huelle-gross-vorn: das Fenster ist genau die cremefarbene Innenflaeche der Quelle', () => {
  const q = dekodiere(fs.readFileSync(path.join(QUELLEN, 'huelle-gross-vorn.png')));
  const quelle = dekodiere(fs.readFileSync(path.join(__dirname, '..', 'renderer', 'themes', 'cozy', 'entwuerfe', 'gross', 'vorn-1.png')));
  assert.ok(q.px.equals(quelle.px), 'Quelle = Janis\' Wahl vorn-1.png');
  let n = 0;
  for (let y = 0; y < q.h; y++) {
    for (let x = 0; x < q.w; x++) {
      const i = (y * q.w + x) * 4;
      const creme = q.px[i] === 241 && q.px[i + 1] === 237 && q.px[i + 2] === 225 && q.px[i + 3] === 255;
      assert.strictEqual(creme, imRechteck(x, y, [32, 32, 65, 65]), `${x},${y}`);
      if (creme) n++;
    }
  }
  assert.strictEqual(n, 65 * 65);
  const r = dekodiere(fs.readFileSync(path.join(QUELLEN, 'huelle-gross-rueck.png')));
  const rq = dekodiere(fs.readFileSync(path.join(__dirname, '..', 'renderer', 'themes', 'cozy', 'entwuerfe', 'gross', 'rueck-2.png')));
  assert.ok(r.px.equals(rq.px), 'Quelle = Janis\' Wahl rueck-2.png');
});

// Schild in der Leiste (Janis 11.11.2026): Gitter weg, eingebauter Leuchtkasten.
// PixelLab hat in den Leisten-Ausschnitt (64x39) gemalt; der Kasten (x 9-40, y 10-28)
// wird ausgeschnitten und doppelt gross ueber die Leiste gelegt.
const KASTEN = { x: 9, y: 10, b: 32, h: 19 };
function kasten(quelle) {
  return (x, y) => {
    const i = ((KASTEN.y + y) * quelle.w + (KASTEN.x + x)) * 4;
    return quelle.px.subarray(i, i + 4);
  };
}
for (const [name, q] of [['schild-live.png', 'leiste-schild-live.png'], ['schild-vod.png', 'leiste-schild-vod.png'], ['schild-aus.png', 'leiste-schild-aus.png']]) {
  test(`${name}: Leuchtkasten aus ${q} (PixelLab, Janis' Wahl), unveraendert ausgeschnitten`, () => {
    const a = dekodiere(lade(name));
    const k = kasten(dekodiere(fs.readFileSync(path.join(QUELLEN, q))));
    for (let y = 0; y < KASTEN.h; y++) {
      for (let x = 0; x < KASTEN.b; x++) {
        const i = (y * a.w + x) * 4;
        assert.ok(a.px.subarray(i, i + 4).equals(k(x, y)), name + ' ' + x + ',' + y);
      }
    }
  });
}
test('schild-pfeil.png: 8 Bilder der PixelLab-Pfeil-Animation, je Leuchtkasten 32x19', () => {
  const a = dekodiere(lade('schild-pfeil.png'));
  for (let n = 0; n < 8; n++) {
    const k = kasten(dekodiere(fs.readFileSync(path.join(QUELLEN, `leiste-schild-pfeil-${n}.png`))));
    for (let y = 0; y < KASTEN.h; y++) {
      for (let x = 0; x < KASTEN.b; x++) {
        const i = (y * a.w + n * KASTEN.b + x) * 4;
        assert.ok(a.px.subarray(i, i + 4).equals(k(x, y)), 'Bild ' + n + ' ' + x + ',' + y);
      }
    }
  }
});
test('leiste-video-links.png: Lautsprecher-Gitter durch PixelLab-Metall ersetzt, Rest unveraendert', () => {
  const a = dekodiere(lade('leiste-video-links.png'));
  const roh = dekodiere(fs.readFileSync(path.join(QUELLEN, 'leiste-video-links-roh.png')));
  const glatt = dekodiere(fs.readFileSync(path.join(QUELLEN, 'leiste-glatt.png')));
  for (let y = 0; y < 39; y++) {
    for (let x = 0; x < 334; x++) {
      const i = (y * 334 + x) * 4;
      const imGitter = x >= 7 && x < 44 && y >= 6 && y < 31;
      const soll = imGitter ? glatt.px.subarray((y * glatt.w + x) * 4, (y * glatt.w + x) * 4 + 4) : roh.px.subarray(i, i + 4);
      assert.ok(a.px.subarray(i, i + 4).equals(soll), x + ',' + y);
    }
  }
});

test('Schild eingebunden: doppelt gross, scharf, Pfeil-Animation in 8 Schritten, Leuchten im Bild', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'video', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'video', 'video.js'), 'utf8');
  assert.ok(js.includes('schild-live.png') && js.includes('schild-vod.png') && js.includes('schild-aus.png'));
  assert.ok(/aria-label/.test(js) && js.includes("'VOD'") && js.includes("'Live'"));
  const regeln = html.slice(html.indexOf('#onair-bar {'), html.indexOf('#status, #si-oben'));
  assert.ok(regeln.includes('image-rendering: pixelated'));
  assert.ok(/#oa-label\s*\{[^}]*width:\s*64px;[^}]*height:\s*38px/.test(regeln));
  assert.ok(/#oa-pfeil\s*\{[^}]*schild-pfeil\.png[^}]*512px 38px/.test(regeln));
  assert.ok(/animation:\s*oa-pfeil 1000ms steps\(8\) infinite/.test(regeln));
  assert.ok(/#onair-bar:not\(\.leer\):hover #oa-pfeil[^{]*\{[^}]*display:\s*block/.test(regeln));
  assert.ok(!/box-shadow|glow|filter/.test(regeln), 'Leuchten kommt aus dem PixelLab-Bild');
});

// Etappe 3 (Leben): je Animation und Datei ein Bildstreifen leben-home-<datei>.png,
// bilder x ziel.b breit, ziel.h hoch. Bild 0 = Standbild-Ausschnitt, Bild 1..n nur
// die Pixel, die sich vom Standbild unterscheiden (Rest durchsichtig).
const LEBEN = JSON.parse(fs.readFileSync(path.join(QUELLEN, 'leben.json'), 'utf8'));
for (const a of LEBEN.home.animationen) {
  for (const datei of a.dateien) {
    const name = `leben-home-${datei}.png`;
    const z = a.ziel;
    test(`${name}: ${a.bilder} Bilder je ${z.b}x${z.h}, Bild 0 = ${LEBEN.home.standbild} an (${z.x},${z.y})`, () => {
      const s = dekodiere(lade(name));
      assert.strictEqual(s.w, a.bilder * z.b);
      assert.strictEqual(s.h, z.h);
      const still = dekodiere(lade(LEBEN.home.standbild));
      let abweichungen = 0;
      for (let y = 0; y < z.h; y++) {
        for (let x = 0; x < z.b; x++) {
          const i = (y * s.w + x) * 4;
          const j = ((z.y + y) * still.w + (z.x + x)) * 4;
          for (let k = 0; k < 4; k++) if (s.px[i + k] !== still.px[j + k]) { abweichungen++; break; }
        }
      }
      assert.strictEqual(abweichungen, 0, abweichungen + ' Pixel weichen ab');
    });

    test(`${name}: Bild 1..${a.bilder - 1} nur PixelLab-Pixel, mindestens ein Bild deckend`, () => {
      const s = dekodiere(lade(name));
      let deckend = 0;
      for (let f = 1; f < a.bilder; f++) {
        const qPfad = path.join(QUELLEN, `leben-home-${datei}-${f}.png`);
        const q = fs.existsSync(qPfad) ? dekodiere(fs.readFileSync(qPfad)) : null;
        for (let y = 0; y < z.h; y++) {
          for (let x = 0; x < z.b; x++) {
            const i = (y * s.w + f * z.b + x) * 4;
            if (s.px[i + 3] === 0) continue;
            deckend++;
            if (!q) continue;
            const j = ((z.y - a.quelle.y + y) * q.w + (z.x - a.quelle.x + x)) * 4;
            const roh = [q.px[j], q.px[j + 1], q.px[j + 2], q.px[j + 3]];
            const soll = a.gelbWeg && inGelbWeg(z.x + x, z.y + y) ? gelbWeg(roh) : roh;
            for (let k = 0; k < 4; k++) if (s.px[i + k] !== soll[k]) assert.fail(`Bild ${f} Pixel ${x},${y} weicht von der Quelle ab`);
          }
        }
      }
      assert.ok(deckend > 0, 'kein Bild hat deckende Pixel');
    });
  }
}

// --- Etappe 3, Task 6: Chat-Streifen ------------------------------------------------
// Glasmaske: Flutfuellung ueber die gemessenen Glasfarben (Saat + jede weitere Scheibe),
// 344x72, deckend nur auf Glas. Streifen-Animationen: Bild 0 und unveraenderte Pixel
// sind auf Glas durchsichtig (Regen/Raid darunter bleiben sichtbar), sonst Standbild.
const S = LEBEN.streifen;
const STILL_S = () => dekodiere(lade(S.standbild));
const inR = (x, y, r) => x >= r.x && x < r.x + r.b && y >= r.y && y < r.y + r.h;
const ladeQuelle = (name) => {
  const p = path.join(QUELLEN, name);
  return fs.existsSync(p) ? dekodiere(fs.readFileSync(p)) : null;
};

test('streifen-glas-maske.png: 344x72, deckend nur in GLAS, deckt mindestens 50 % davon, Saat deckend', () => {
  const m = dekodiere(lade('streifen-glas-maske.png'));
  assert.strictEqual(m.w, 344);
  assert.strictEqual(m.h, 72);
  const g = S.glas;
  let drin = 0;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const a = m.px[(y * m.w + x) * 4 + 3];
      if (a === 0) continue;
      assert.ok(inR(x, y, g), `${x},${y} deckend ausserhalb GLAS`);
      assert.strictEqual(a, 255);
      drin++;
    }
  }
  assert.ok(drin >= 0.5 * g.b * g.h, drin + ' von ' + g.b * g.h);
  assert.strictEqual(m.px[(g.saat.y * m.w + g.saat.x) * 4 + 3], 255, 'Saat');
});

test('streifen-glas-maske.png: Rahmen und Sprossen sind durchsichtig, die Scheiben deckend', () => {
  const m = dekodiere(lade('streifen-glas-maske.png'));
  const a = (x, y) => m.px[(y * m.w + x) * 4 + 3];
  // Sprossen zwischen den Scheiben, Querholz oben, Fensterbank unten (gemessen in streifen.png)
  for (const [x, y] of [[131, 30], [133, 40], [213, 30], [214, 20], [170, 10], [120, 11], [170, 54], [150, 55]]) {
    assert.strictEqual(a(x, y), 0, `Rahmen ${x},${y}`);
  }
  // linke, mittlere, rechte Scheibe
  for (const [x, y] of [[115, 30], [170, 30], [228, 30]]) assert.strictEqual(a(x, y), 255, `Glas ${x},${y}`);
});

for (const a of S.animationen) {
  for (const datei of a.dateien) {
    const name = `leben-streifen-${datei}.png`;
    const z = a.ziel;
    test(`${name}: ${a.bilder} Bilder je ${z.b}x${z.h}; deckend = Standbild oder PixelLab, durchsichtig nur auf Glas`, () => {
      const s = dekodiere(lade(name));
      assert.strictEqual(s.w, a.bilder * z.b);
      assert.strictEqual(s.h, z.h);
      const still = STILL_S();
      const m = dekodiere(lade('streifen-glas-maske.png'));
      let bewegt = 0;
      for (let f = 0; f < a.bilder; f++) {
        const q = f === 0 ? null : ladeQuelle(`leben-streifen-${datei}-${f}.png`);
        for (let y = 0; y < z.h; y++) {
          for (let x = 0; x < z.b; x++) {
            const i = (y * s.w + f * z.b + x) * 4;
            const ax = z.x + x, ay = z.y + y;
            const j = (ay * still.w + ax) * 4;
            if (s.px[i + 3] === 0) {
              assert.strictEqual(m.px[j + 3], 255, `Bild ${f} ${x},${y} durchsichtig, aber kein Glas`);
              continue;
            }
            let gleichStill = true;
            for (let k = 0; k < 4; k++) if (s.px[i + k] !== still.px[j + k]) gleichStill = false;
            if (f === 0) { assert.ok(gleichStill, `Bild 0 ${x},${y} weicht vom Standbild ab`); continue; }
            if (gleichStill) continue;
            bewegt++;
            if (!q) continue;
            const jq = ((ay - a.quelle.y) * q.w + (ax - a.quelle.x)) * 4;
            for (let k = 0; k < 4; k++) if (s.px[i + k] !== q.px[jq + k]) assert.fail(`Bild ${f} ${x},${y} weicht von der Quelle ab`);
          }
        }
      }
      assert.ok(bewegt > 0, 'kein Bild bewegt sich');
    });
  }
}

test('leben-kiste.png: Bildstreifen wie die Streifen-Animationen, Bild 0 = Standbild', () => {
  const k = S.kiste;
  const z = k.ziel;
  const s = dekodiere(lade('leben-kiste.png'));
  assert.strictEqual(s.w, k.bilder * z.b);
  assert.strictEqual(s.h, z.h);
  const still = STILL_S();
  const m = dekodiere(lade('streifen-glas-maske.png'));
  let bewegt = 0;
  for (let f = 0; f < k.bilder; f++) {
    const q = f === 0 ? null : ladeQuelle(`leben-streifen-${k.datei}-${f}.png`);
    for (let y = 0; y < z.h; y++) {
      for (let x = 0; x < z.b; x++) {
        const i = (y * s.w + f * z.b + x) * 4;
        const ax = z.x + x, ay = z.y + y;
        const j = (ay * still.w + ax) * 4;
        if (s.px[i + 3] === 0) { assert.strictEqual(m.px[j + 3], 255, `Bild ${f} ${x},${y}`); continue; }
        let gleich = true;
        for (let c = 0; c < 4; c++) if (s.px[i + c] !== still.px[j + c]) gleich = false;
        if (f === 0) { assert.ok(gleich, `Bild 0 ${x},${y}`); continue; }
        if (gleich) continue;
        bewegt++;
        if (!q) continue;
        const jq = ((ay - k.quelle.y) * q.w + (ax - k.quelle.x)) * 4;
        for (let c = 0; c < 4; c++) if (s.px[i + c] !== q.px[jq + c]) assert.fail(`Bild ${f} ${x},${y} weicht von der Quelle ab`);
      }
    }
  }
  assert.ok(bewegt > 100, 'Kiste bewegt sich kaum');
});

for (const datei of S.raid.dateien) {
  test(`leben-${datei}.png: Gehzyklus ${S.raid.bilder} Bilder je ${S.raid.b}x${S.raid.h}, Bild k = PixelLab-Bild k`, () => {
    const r = S.raid;
    const s = dekodiere(lade(`leben-${datei}.png`));
    assert.strictEqual(s.w, r.bilder * r.b);
    assert.strictEqual(s.h, r.h);
    let deckend = 0;
    for (let f = 0; f < r.bilder; f++) {
      const q = ladeQuelle(`leben-streifen-${datei}-${f}.png`);
      for (let y = 0; y < r.h; y++) {
        for (let x = 0; x < r.b; x++) {
          const i = (y * s.w + f * r.b + x) * 4;
          if (s.px[i + 3] > 0) deckend++;
          if (!q) continue;
          const j = (y * q.w + x) * 4;
          if (q.px[j + 3] === 0) { assert.strictEqual(s.px[i + 3], 0, `Bild ${f} ${x},${y}`); continue; }
          for (let c = 0; c < 4; c++) if (s.px[i + c] !== q.px[j + c]) assert.fail(`Bild ${f} ${x},${y} weicht ab`);
        }
      }
    }
    assert.ok(deckend > r.bilder * 50, 'Figur fehlt');
  });
}

// Holzwand hinter dem Raum (Janis 11.11.: Variante C). 504x192, der Raum liegt bei x=80.
test('raum-wand.png: PixelLab-Holzwand (links/rechts), deckt nur den dunklen Aussenbereich', () => {
  const w = dekodiere(lade('raum-wand.png'));
  const raum = dekodiere(lade('raum-tv-aus.png'));
  const quelleL = dekodiere(fs.readFileSync(path.join(QUELLEN, 'raum-wand-links.png')));
  const quelleR = dekodiere(fs.readFileSync(path.join(QUELLEN, 'raum-wand-rechts.png')));
  const VERSATZ = 80;
  const at = (b, x, y) => { const i = (y * b.w + x) * 4; return [b.px[i], b.px[i + 1], b.px[i + 2], b.px[i + 3]]; };
  let gedeckt = 0;
  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 504; x++) {
      const p = at(w, x, y);
      // PixelLab-Quelle: links bis x 251, rechts ab 252 (Quelle beginnt bei 248)
      const q = x < 252 ? at(quelleL, x, y) : at(quelleR, x - 248, y);
      const innen = x >= VERSATZ && x < VERSATZ + 344;
      if (!innen) {
        assert.strictEqual(p[3], 255, 'aussen deckend ' + x + ',' + y);
        assert.deepStrictEqual(p.slice(0, 3), q.slice(0, 3), 'aussen = Quelle ' + x + ',' + y);
        continue;
      }
      const r = at(raum, x - VERSATZ, y);
      if (p[3] > 0) {
        gedeckt++;
        assert.ok(r[0] + r[1] + r[2] < 60, 'deckt nur dunkle Raum-Pixel ' + x + ',' + y);
      }
      // Wand ueber Raum ergibt genau das PixelLab-Bild (Variante C)
      const sicht = p[3] > 0 ? p : r;
      assert.deepStrictEqual(sicht.slice(0, 3), q.slice(0, 3), 'zusammen = Variante C ' + x + ',' + y);
    }
  }
  assert.ok(gedeckt > 5000, 'schwarzer Aussenbereich gedeckt: ' + gedeckt);
});

// --- Regal neu, Task 7 ----------------------------------------------------------------
const pxAt = (b, x, y) => { const i = (y * b.w + x) * 4; return [b.px[i], b.px[i + 1], b.px[i + 2], b.px[i + 3]]; };
const quelleDatei = (name) => dekodiere(fs.readFileSync(path.join(QUELLEN, name)));

test('regal-wand.png: aussen (x < 80, x >= 424) deckend = PixelLab-Quelle, innen (x 80..423) ganz durchsichtig', () => {
  const w = dekodiere(lade('regal-wand.png'));
  const l = quelleDatei('regal-wand-links.png');
  const r = quelleDatei('regal-wand-rechts.png');
  let aussen = 0;
  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 504; x++) {
      const p = pxAt(w, x, y);
      if (x >= 80 && x < 424) { assert.strictEqual(p[3], 0, `innen ${x},${y} nicht durchsichtig`); continue; }
      const q = x < 252 ? pxAt(l, x, y) : pxAt(r, x - 248, y);
      assert.strictEqual(p[3], 255, `aussen ${x},${y} nicht deckend`);
      assert.deepStrictEqual(p.slice(0, 3), q.slice(0, 3), `aussen ${x},${y} weicht von der Quelle ab`);
      aussen++;
    }
  }
  assert.strictEqual(aussen, 160 * 192);
});

test('regal.png = regal-basis.png mit regal-neu.png bei (80, 0) eingefuegt, pixelgleich', () => {
  const a = dekodiere(lade('regal.png'));
  const basis = quelleDatei('regal-basis.png');
  const neu = quelleDatei('regal-neu.png');
  assert.strictEqual(a.w, 344);
  assert.strictEqual(a.h, 192);
  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 344; x++) {
      const soll = x >= 80 && x < 80 + neu.w ? pxAt(neu, x - 80, y) : pxAt(basis, x, y);
      assert.deepStrictEqual(pxAt(a, x, y), soll, `${x},${y}`);
    }
  }
});

for (const art of Object.keys(REGAL_JSON.rueckenFarben)) {
  test(`ruecken-${art}.png: Alpha-Maske der Quelle, Farbe = round(L * farbe / 255), L = round(0.299r+0.587g+0.114b) (+-1)`, () => {
    const a = dekodiere(lade(`ruecken-${art}.png`));
    const q = quelleDatei('ruecken.png');
    const b = RUECKEN.bild;
    const farbe = REGAL_JSON.rueckenFarben[art];
    assert.strictEqual(a.w, RUECKEN.b);
    assert.strictEqual(a.h, RUECKEN.h);
    let deckend = 0;
    for (let y = 0; y < a.h; y++) {
      for (let x = 0; x < a.w; x++) {
        const s = pxAt(q, b.x + x, b.y + y);
        const p = pxAt(a, x, y);
        assert.strictEqual(p[3], s[3], `Alpha ${x},${y}`);
        if (s[3] === 0) continue;
        deckend++;
        const l = Math.round(0.299 * s[0] + 0.587 * s[1] + 0.114 * s[2]);
        for (let k = 0; k < 3; k++) {
          const soll = Math.round((l * farbe[k]) / 255);
          assert.ok(Math.abs(p[k] - soll) <= 1, `Kanal ${k} bei ${x},${y}: ${p[k]} statt ${soll}`);
        }
      }
    }
    assert.ok(deckend > 50, 'Ruecken fast leer');
  });
}

for (const [name, quelle] of [['karte.png', 'karte.png'], ['karte-rueck.png', 'karte-rueck.png']]) {
  test(`${name} = PixelLab-Quelle unveraendert`, () => {
    assert.ok(dekodiere(lade(name)).px.equals(quelleDatei(quelle).px));
  });
}

test('hover-regal.png: Quelle hover-regal.png unveraendert, Ursprung und Groesse aus regal.json', () => {
  const a = dekodiere(lade('hover-regal.png'));
  const q = quelleDatei('hover-regal.png');
  assert.deepStrictEqual([a.w, a.h], [HOV.b, HOV.h]);
  assert.ok(a.px.equals(q.px));
});

test('live-zeichen.png gibt es nicht (der Live-Punkt ist CSS)', () => {
  assert.ok(!fs.existsSync(path.join(DIR, 'live-zeichen.png')));
});

test('raum-tv-maske.png deckt genau die gruenen Pixel von raum.png', () => {
  const maske = dekodiere(lade('raum-tv-maske.png'));
  let deckend = 0;
  for (let i = 3; i < maske.px.length; i += 4) if (maske.px[i] > 0) deckend++;
  const gruen = zaehleGruen(dekodiere(lade('raum.png')));
  assert.ok(gruen > 0, 'raum.png hat kein Gruen');
  assert.strictEqual(deckend, gruen);
});
