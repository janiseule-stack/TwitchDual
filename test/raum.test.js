const test = require('node:test');
const assert = require('node:assert');
const R = require('../renderer/lib/raum.js');

test('Konstanten: Bildgroesse, Reihenfolge und Namen der Flaechen', () => {
  assert.deepStrictEqual(R.BILD, { breite: 344, hoehe: 192 });
  assert.deepStrictEqual(R.FLAECHEN.map((f) => f.id), ['plattenspieler', 'fernseher', 'bild', 'lampe', 'regal']);
  assert.deepStrictEqual(R.FLAECHEN.map((f) => f.name), ['Plattenspieler', 'Fernseher', 'Konto', 'Licht', 'Platten']);
  assert.deepStrictEqual(R.HUELLE, { kante: 40, abstand: 4 });
  assert.deepStrictEqual(R.TELLER, { x: 284, y: 113 });
});

test('Regal neu (Task 9b): altes Fach, Zettel-Zeilen und grosse Huelle entfallen', () => {
  for (const alt of ['FACH', 'zettelZeilen', 'grossKante']) assert.ok(!(alt in R), alt);
});

test('TV_ECKEN: vier Ecken im Bildschirmbereich', () => {
  assert.strictEqual(R.TV_ECKEN.length, 4);
  for (const e of R.TV_ECKEN) {
    assert.ok(e.x >= 206 && e.x <= 233, 'x ' + e.x);
    assert.ok(e.y >= 52 && e.y <= 90, 'y ' + e.y);
  }
});

test('TV_RECHTECK: Fernseher-Bildschirm, eingefroren', () => {
  assert.deepStrictEqual(R.TV_RECHTECK, { x: 206, y: 52, b: 27, h: 38 });
  assert.ok(Object.isFrozen(R.TV_RECHTECK));
});

test('RAHMEN: Raum ohne den dunklen Bildrand (x 12-331 von 344)', () => {
  assert.deepStrictEqual(R.RAHMEN, { x: 12, b: 320 });
  assert.ok(Object.isFrozen(R.RAHMEN));
});

test('skalierung: deckt das Fenster mit dem Raum ohne dunklen Rand, mittig (Janis 11.11.: Variante A)', () => {
  // 1536x1030 (Video neben Chat, Full HD): Hoehe deckt (5,3646), sichtbar 286,3 Bildpixel,
  // Mitte x=172 -> links 28,8 Bildpixel -> -154,6 -> -155
  const a = R.skalierung(1536, 1030);
  assert.ok(Math.abs(a.faktor - 1030 / 192) < 1e-12);
  assert.strictEqual(a.links, -155);
  assert.strictEqual(a.oben, 0);
  // sehr breit: Breite deckt mit dem Rahmen (2000/320 = 6,25), links genau am Rahmen,
  // senkrecht mittig: (600/2 - 96*6,25) = -300
  assert.deepStrictEqual(R.skalierung(2000, 600), { faktor: 6.25, links: -75, oben: -300 });
  // Rahmen-Seitenverhaeltnis genau (320x192 * 2): passt exakt
  assert.deepStrictEqual(R.skalierung(640, 384), { faktor: 2, links: -24, oben: 0 });
  for (const [b, h] of [[0, 0], [NaN, 5], [-1, -1], ['x', {}]]) assert.deepStrictEqual(R.skalierung(b, h), { faktor: 1, links: 0, oben: 0 });
});

test('skalierung: nie dunkler Bildrand, 60 zufaellige Groessen (sichtbar nur x 12-332)', () => {
  let seed = 777;
  const zufall = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 60; i++) {
    const b = Math.round(300 + zufall() * 3000);
    const h = Math.round(200 + zufall() * 1800);
    const s = R.skalierung(b, h);
    const l = -s.links / s.faktor;
    const r = l + b / s.faktor;
    assert.ok(l >= 12 - 1 / s.faktor, 'links ' + b + 'x' + h + ': ' + l);
    assert.ok(r <= 332 + 1 / s.faktor, 'rechts ' + b + 'x' + h + ': ' + r);
  }
});

test('skalierung: nie ein Rand, 20 zufaellige Groessen', () => {
  let seed = 12345;
  const zufall = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 20; i++) {
    const b = Math.round(300 + zufall() * 2200);
    const h = Math.round(200 + zufall() * 1500);
    const s = R.skalierung(b, h);
    assert.ok(s.links <= 0 && s.oben <= 0, b + 'x' + h);
    assert.ok(s.links + 344 * s.faktor >= b - 1e-6, 'rechts ' + b + 'x' + h);
    assert.ok(s.oben + 192 * s.faktor >= h - 1e-6, 'unten ' + b + 'x' + h);
    assert.ok(Number.isInteger(s.links) && Number.isInteger(s.oben));
  }
});

test('skalierung: Gegenstaende x 100-314 sichtbar, solange Breite/Hoehe >= 214/192 (ca. 1,115)', () => {
  const sichtbar = (b, h) => {
    const s = R.skalierung(b, h);
    const l = R.zuBild(0, 0, s).x;
    const r = R.zuBild(b - 1, 0, s).x;
    return l <= 100 && r >= 313;
  };
  assert.ok(sichtbar(1024, 768));   // 4:3
  assert.ok(sichtbar(1120, 1000));  // 1,12: sichtbare Breite 215 Bildpixel
  assert.ok(sichtbar(1300, 1000));  // 1,3: Mitte 172 wuerde den Plattenspieler abschneiden -> verschoben
  assert.ok(sichtbar(1536, 1030));
  assert.ok(!sichtbar(1100, 1000)); // 1,10: nur 211 Bildpixel, Raender der Gegenstaende abgeschnitten
  assert.ok(!sichtbar(1000, 1000)); // 1:1
});

// Janis 11.11.: Raum steht vor der PixelLab-Holzwand (raum-wand.png, 504 breit, Raum bei x=80)
const GROESSEN = [[2960, 1390], [2040, 952], [1920, 1030], [1536, 1030], [1280, 670], [900, 700]];

test('RAUM_RAHMEN: Raum samt Holzwand x -80 bis 424', () => {
  assert.deepStrictEqual(R.RAUM_RAHMEN, { x: -80, b: 504 });
  assert.ok(Object.isFrozen(R.RAUM_RAHMEN));
});

test('skalierung mit RAUM_RAHMEN: feste Groessen zeigen die ganze Hoehe (Kaffee, Lampe), nie ueber die Wand hinaus', () => {
  for (const [b, h] of GROESSEN) {
    const s = R.skalierung(b, h, R.RAUM_RAHMEN);
    assert.ok(Math.abs(s.faktor - h / 192) < 1e-9, b + 'x' + h + ': ganze Hoehe sichtbar');
    assert.strictEqual(s.oben, 0, b + 'x' + h);
    const l = -s.links / s.faktor;
    const r = l + b / s.faktor;
    assert.ok(l >= -80 - 1 / s.faktor && r <= 424 + 1 / s.faktor, b + 'x' + h + ': innerhalb der Wand');
    assert.ok(l <= 100 && r >= 314, b + 'x' + h + ': alle Gegenstaende sichtbar');
  }
  // Ultrawide bildschirmfuellend: 409 Bildpixel breit, mittig auf 172 -> links -32,4 -> 235
  assert.deepStrictEqual(R.skalierung(2960, 1390, R.RAUM_RAHMEN), { faktor: 1390 / 192, links: 235, oben: 0 });
});

test('REGAL_RAHMEN: eingefroren, x -80, b 504, ganz', () => {
  assert.ok(Object.isFrozen(R.REGAL_RAHMEN));
  assert.strictEqual(R.REGAL_RAHMEN.x, -80);
  assert.strictEqual(R.REGAL_RAHMEN.b, 504);
  assert.strictEqual(R.REGAL_RAHMEN.ganz, true);
  assert.deepStrictEqual([R.REGAL_RAHMEN.von, R.REGAL_RAHMEN.bis, R.REGAL_RAHMEN.mitte], [100, 300, 200]);
  assert.strictEqual(R.RAUM_RAHMEN.ganz, undefined);
});

test('skalierung mit REGAL_RAHMEN: feste Groessen zeigen die ganze Hoehe und von..bis', () => {
  const rr = R.REGAL_RAHMEN;
  for (const [b, h] of GROESSEN) {
    const s = R.skalierung(b, h, rr);
    assert.ok(Math.abs(s.faktor - h / 192) < 1e-9, b + 'x' + h + ': ganze Hoehe');
    assert.strictEqual(s.oben, 0, b + 'x' + h);
    const l = -s.links / s.faktor;
    const r = l + b / s.faktor;
    const eps = 1 / s.faktor;
    assert.ok(l <= rr.von + eps && r >= rr.bis - eps, b + 'x' + h + ': von..bis sichtbar');
    assert.ok(l >= -80 - eps && r <= 424 + eps, b + 'x' + h + ': innerhalb -80..424');
  }
});

test('skalierung mit REGAL_RAHMEN: hochkant 700x900 und 500x1000 -> von..bis ganz sichtbar, oben > 0, ganzzahlig', () => {
  const rr = R.REGAL_RAHMEN;
  for (const [b, h] of [[700, 900], [500, 1000]]) {
    const s = R.skalierung(b, h, rr);
    assert.ok(s.oben > 0, b + 'x' + h + ': oben > 0');
    assert.ok(Number.isInteger(s.oben) && Number.isInteger(s.links), b + 'x' + h + ': ganzzahlig');
    assert.ok(s.faktor <= b / (rr.bis - rr.von) + 1e-9, b + 'x' + h + ': Breite bestimmt den Faktor');
    const l = -s.links / s.faktor;
    const r = l + b / s.faktor;
    const eps = 1 / s.faktor;
    assert.ok(l <= rr.von + eps && r >= rr.bis - eps, b + 'x' + h + ': von..bis sichtbar');
    assert.ok(s.oben + 192 * s.faktor <= h + 1, b + 'x' + h + ': Bild passt in die Hoehe');
  }
});

test('REGAL_LEINWAND: x -80, y -64, 504x320, eingefroren', () => {
  assert.deepStrictEqual(R.REGAL_LEINWAND, { x: -80, y: -64, b: 504, h: 320 });
  assert.ok(Object.isFrozen(R.REGAL_LEINWAND));
});

test('skalierungRegal: Regal (von..bis, 0..192) liegt ganz im Fenster, ganzzahlig', () => {
  const rr = R.REGAL_RAHMEN;
  for (const [b, h] of [...GROESSEN, [700, 900], [500, 1000]]) {
    const s = R.skalierungRegal(b, h);
    const id = b + 'x' + h;
    assert.ok(Number.isInteger(s.links) && Number.isInteger(s.oben), id + ': ganzzahlig');
    assert.ok(!Object.is(s.links, -0) && !Object.is(s.oben, -0), id + ': kein -0');
    assert.ok(s.links + rr.von * s.faktor >= -1, id + ': Regal links');
    assert.ok(s.links + rr.bis * s.faktor <= b + 1, id + ': Regal rechts');
    assert.ok(s.oben >= -1, id + ': Regal oben');
    assert.ok(s.oben + 192 * s.faktor <= h + 1, id + ': Regal unten');
  }
});

test('skalierungRegal: Regal-Anteil an der Fensterhoehe', () => {
  const anteil = (b, h) => 192 * R.skalierungRegal(b, h).faktor / h;
  assert.ok(Math.abs(R.skalierungRegal(2960, 1390).faktor - 5.87) < 0.01);
  assert.ok(Math.abs(anteil(2960, 1390) - 0.81) < 0.01);
  assert.ok(Math.abs(anteil(1920, 1030) - 0.71) < 0.01);
  assert.ok(Math.abs(anteil(900, 700) - 0.60) < 0.01);
});

test('skalierungRegal: 500x1000 hochkant -> dunkler Rand oben', () => {
  const s = R.skalierungRegal(500, 1000);
  assert.ok(s.oben > 0);
  assert.ok(Math.abs(s.faktor - 2.5) < 1e-9);
});

test('kartenMasse auf der Groessenliste', () => {
  for (const [b, h] of GROESSEN) {
    const k = R.kartenMasse(b, h);
    const id = b + 'x' + h;
    assert.ok(Number.isInteger(k.n) && k.n >= 1, id);
    assert.strictEqual(k.kante, 128 * k.n, id);
    assert.strictEqual(k.breite, 2 * k.kante, id);
    assert.strictEqual(k.hoehe, k.kante, id);
    assert.ok(k.breite + 96 <= b, id + ': Platz fuer Knoepfe');
    assert.ok(k.kante <= 0.7 * h || k.n === 1, id + ': hoechstens 70 % Hoehe');
    assert.ok(k.links >= 0 && k.oben >= 0, id);
    assert.ok(k.links + k.breite <= b, id);
    assert.ok(k.oben + k.hoehe <= h - 44, id + ': Hinweiszeile');
  }
  assert.deepStrictEqual(R.kartenMasse(1280, 670).schrift, { gross: 24, klein: 12 });
  const a = R.kartenMasse(1280, 670);
  assert.strictEqual(a.n, 3); assert.strictEqual(a.kante, 384); assert.strictEqual(a.vodK, 2);
  const c = R.kartenMasse(2960, 1390);
  assert.strictEqual(c.n, 7); assert.strictEqual(c.kante, 896); assert.strictEqual(c.vodK, 4);
  assert.deepStrictEqual(c.schrift, { gross: 48, klein: 24 });
  assert.strictEqual(R.kartenMasse(900, 700).n, 3);
});

test('kartenMasse: Muell -> n 1', () => {
  for (const [b, h] of [[NaN, NaN], [undefined, undefined], [-5, 'x'], [0, 0], [100, 100]]) {
    assert.strictEqual(R.kartenMasse(b, h).n, 1);
  }
});

test('skalierung ohne Rahmen-Angabe bleibt beim Raum ohne Wand (Regal-Ansicht)', () => {
  assert.deepStrictEqual(R.skalierung(1536, 1030), R.skalierung(1536, 1030, R.RAHMEN));
});

test('skalierung: zu schmal fuer alle Gegenstaende -> auf deren Mitte (x 207)', () => {
  // 1397x1332: Hoehe deckt (6,9375), 201,4 Bildpixel sichtbar, Mitte 207 -> links 106,32 -> -737,55 -> -738
  assert.deepStrictEqual(R.skalierung(1397, 1332), { faktor: 6.9375, links: -738, oben: 0 });
});

test('passtAlsRaum: Fenster mindestens 688x384', () => {
  assert.strictEqual(R.passtAlsRaum(688, 384), true);
  assert.strictEqual(R.passtAlsRaum(687, 384), false);
  assert.strictEqual(R.passtAlsRaum(688, 383), false);
  assert.strictEqual(R.passtAlsRaum(NaN, 400), false);
});

test('HOVER und PLATTENSPIELER_RECHTECK', () => {
  assert.deepStrictEqual(R.PLATTENSPIELER_RECHTECK, { x: 262, y: 86, b: 46, h: 42 });
  assert.deepStrictEqual(R.HOVER.regal, { x: 86, y: 9, b: 77, h: 121 });
  assert.deepStrictEqual(R.FLAECHEN.find((f) => f.id === 'regal'), { id: 'regal', name: 'Platten', x: 90, y: 13, b: 69, h: 113 });
  assert.deepStrictEqual(R.HOVER.lampe, { x: 161, y: 2, b: 39, h: 112 });
  assert.deepStrictEqual(R.HOVER.fernseher, { x: 194, y: 34, b: 78, h: 78 });
  assert.deepStrictEqual(R.HOVER.plattenspieler, { x: 258, y: 82, b: 54, h: 50 });
  assert.deepStrictEqual(R.HOVER.bild, { x: 278, y: 32, b: 40, h: 62 });
  for (const f of R.FLAECHEN) {
    assert.strictEqual(R.HOVER[f.id].x, f.x - 4, f.id);
    assert.strictEqual(R.HOVER[f.id].y, f.y - 4, f.id);
  }
});

// --- Regal neu, Task 7 ----------------------------------------------------------------
const fs = require('node:fs');
const path = require('node:path');
const REGAL_JSON = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'raum-quellen', 'regal.json'), 'utf8'));

test('REGAL gleich regal.json (Abbildung aus dem Plan, eingefroren)', () => {
  const j = REGAL_JSON;
  const soll = {
    brett: j.brett,
    faecher: j.faecher,
    such: j.such,
    ruecken: { b: j.ruecken.b, h: j.ruecken.h, abstand: j.ruecken.abstand, fenster: j.ruecken.fenster, name: j.ruecken.name },
    livePunkt: j.livePunkt,
    karteRand: j.karte.rand,
    rueckRand: j.rueckseite.rand,
  };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(R.REGAL)), soll);
  assert.ok(Object.isFrozen(R.REGAL));
  assert.ok(Object.isFrozen(R.REGAL.brett) && Object.isFrozen(R.REGAL.faecher.live) && Object.isFrozen(R.REGAL.ruecken.fenster));
  assert.ok(Object.isFrozen(R.REGAL.livePunkt.cover) && Object.isFrozen(R.REGAL.karteRand));
});

test('REGAL_RAHMEN von/bis/mitte aus regal.json.bereich', () => {
  const b = REGAL_JSON.bereich;
  assert.deepStrictEqual([R.REGAL_RAHMEN.von, R.REGAL_RAHMEN.bis, R.REGAL_RAHMEN.mitte], [b.von, b.bis, b.mitte]);
  assert.ok(Object.isFrozen(R.REGAL_RAHMEN));
});

test('HOVER.regal aus regal.json.hover, FLAECHEN.regal 4 px nach innen; Hover endet vor der Lampe', () => {
  const h = REGAL_JSON.hover;
  assert.deepStrictEqual(R.HOVER.regal, { x: h.x, y: h.y, b: h.b, h: h.h });
  const f = R.FLAECHEN.find((q) => q.id === 'regal');
  assert.deepStrictEqual([f.x, f.y, f.b, f.h], [h.x + 4, h.y + 4, h.b - 8, h.h - 8]);
  assert.ok(R.HOVER.regal.x + R.HOVER.regal.b <= 168);
});

test('REGAL: alle Rechtecke in 344x192, Brett fasst mindestens 3 Cover und ist mindestens 44 hoch', () => {
  const alle = [R.REGAL.brett, R.REGAL.faecher.live, R.REGAL.faecher.unten, R.REGAL.such];
  for (const r of alle) {
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.b <= 344 && r.y + r.h <= 192, JSON.stringify(r));
  }
  assert.ok(R.fachFenster(10, -1, R.REGAL.brett.b, 0).sichtbar >= 3);
  assert.ok(R.REGAL.brett.h >= 44);
});

test('REGAL auf der Groessenliste ganz sichtbar (Bildschirm-Pixel)', () => {
  const alle = [R.REGAL.brett, R.REGAL.faecher.live, R.REGAL.faecher.unten, R.REGAL.such];
  for (const [b, h] of GROESSEN) {
    const s = R.skalierung(b, h, R.REGAL_RAHMEN);
    for (const r of alle) {
      const x0 = s.links + r.x * s.faktor, x1 = s.links + (r.x + r.b) * s.faktor;
      const y0 = s.oben + r.y * s.faktor, y1 = s.oben + (r.y + r.h) * s.faktor;
      assert.ok(x0 >= -1e-6 && x1 <= b + 1e-6 && y0 >= -1e-6 && y1 <= h + 1e-6, `${b}x${h}: ${JSON.stringify(r)}`);
    }
  }
});

test('fachFenster mit teil: Kante und Abstand aus dem Teil', () => {
  assert.strictEqual(R.fachFenster(30, 0, 100, 0, { kante: 8, abstand: 1 }).sichtbar, 11);
  assert.deepStrictEqual(R.fachFenster(30, 0, 175, 0), { start: 0, sichtbar: 4 });
});

test('zuBild und treffer mit nicht ganzzahligem Faktor', () => {
  const s = R.skalierung(1400, 800);
  const mitte = R.FLAECHEN.find((f) => f.id === 'fernseher');
  const fx = s.links + (mitte.x + mitte.b / 2) * s.faktor;
  const fy = s.oben + (mitte.y + mitte.h / 2) * s.faktor;
  const p = R.zuBild(fx, fy, s);
  assert.deepStrictEqual(p, { x: mitte.x + 35, y: mitte.y + 35 });
  assert.strictEqual(R.treffer(p.x, p.y), 'fernseher');
  assert.deepStrictEqual(R.zuBild(s.links, s.oben, s), { x: 0, y: 0 });
});

test('treffer: jede Flaeche in ihrer Mitte, Ueberlappung nach Reihenfolge, daneben null', () => {
  for (const f of R.FLAECHEN) assert.strictEqual(R.treffer(f.x + f.b / 2, f.y + f.h / 2) !== null, true, f.id);
  assert.strictEqual(R.treffer(130, 60), 'regal');
  assert.strictEqual(R.treffer(265, 100), 'plattenspieler');   // liegt auch im Fernseher-Rechteck
  assert.strictEqual(R.treffer(20, 180), null);
  assert.strictEqual(R.treffer(NaN, 3), null);
});

test('treffer: halboffene Raender', () => {
  assert.strictEqual(R.treffer(164, 60), null);
  assert.strictEqual(R.treffer(165, 60), 'lampe');
});

test('zuBild: rechnet Fenster- in Bildkoordinaten', () => {
  assert.deepStrictEqual(R.zuBild(12 + 4 * 100, 16 + 4 * 50, { faktor: 4, links: 12, oben: 16 }), { x: 100, y: 50 });
  assert.deepStrictEqual(R.zuBild(12 + 4 * 100 + 3, 16 + 4 * 50 + 3, { faktor: 4, links: 12, oben: 16 }), { x: 100, y: 50 });
});

test('kameraZiel: Rechteck fuellt das Fenster deckend', () => {
  const z = R.kameraZiel({ x: 206, y: 52, b: 27, h: 38 }, 1400, 800);
  assert.deepStrictEqual(z, { faktor: 52, x: -10714, y: -3292 });
  assert.ok(z.faktor * 27 >= 1400 && z.faktor * 38 >= 800);
  assert.ok(Math.abs(z.x + (206 + 13.5) * z.faktor - 700) < 1);
  assert.ok(Math.abs(z.y + (52 + 19) * z.faktor - 400) < 1);
});

// Task 9c Fix K-1: Kamera der Fahrt legt das Regal im Raum genau auf das Regal der Nahansicht.
test('kameraRegal: Regal im Raum deckt sich mit dem Regal der Nahansicht (±1 px)', () => {
  const H = R.HOVER.regal;
  for (const [b, h] of GROESSEN) {
    const s = R.skalierungRegal(b, h);
    const k = R.kameraRegal(b, h);
    assert.ok(Number.isInteger(k.x) && Number.isInteger(k.y), b + 'x' + h + ': ganze Pixel');
    assert.ok(Math.abs(H.h * k.faktor - 192 * s.faktor) <= 1, b + 'x' + h + ': Hoehe');
    const mitteX = (R.REGAL_RAHMEN.von + R.REGAL_RAHMEN.bis) / 2;
    assert.ok(Math.abs(k.x + (H.x + H.b / 2) * k.faktor - (s.links + mitteX * s.faktor)) <= 1, b + 'x' + h + ': Mitte x');
    assert.ok(Math.abs(k.y + (H.y + H.h / 2) * k.faktor - (s.oben + 96 * s.faktor)) <= 1, b + 'x' + h + ': Mitte y');
  }
  const gross = R.kameraRegal(2960, 1390);
  assert.ok(Math.abs(gross.faktor - 9.3) < 0.1, 'Faktor ~9,3 statt 39: ' + gross.faktor);
});

test('fachFenster: gewaehlte Huelle ist immer sichtbar', () => {
  assert.deepStrictEqual(R.fachFenster(30, 0, 175, 0), { start: 0, sichtbar: 4 });
  assert.deepStrictEqual(R.fachFenster(30, 9, 175, 0), { start: 6, sichtbar: 4 });
  assert.deepStrictEqual(R.fachFenster(30, 2, 175, 6), { start: 2, sichtbar: 4 });
  assert.deepStrictEqual(R.fachFenster(3, -1, 175, 5), { start: 0, sichtbar: 4 });
  assert.strictEqual(R.fachFenster(5, 0, 10, 0).sichtbar, 1);
  assert.deepStrictEqual(R.fachFenster(0, -1, 175, 3), { start: 0, sichtbar: 4 });
  assert.deepStrictEqual(R.fachFenster(5, 9, 175, 0), { start: 1, sichtbar: 4 });
});

test('schriftPx: Vielfache von 12 (12 x round(f / 3), mindestens 12)', () => {
  assert.strictEqual(R.schriftPx(2), 12);
  assert.strictEqual(R.schriftPx(25 / 6), 12);
  assert.strictEqual(R.schriftPx(4.5), 24);
  assert.strictEqual(R.schriftPx(6.9375), 24);
  assert.strictEqual(R.schriftPx(7.5), 36);
  assert.strictEqual(R.schriftPx(0.5), 12);
  assert.strictEqual(R.schriftPx(NaN), 12);
  assert.strictEqual(R.schriftPx(25 / 6, 5), 24); // round(1,74)
  assert.strictEqual(R.schriftPx(2, 5), 12);
  for (let f = 0.5; f < 12; f += 0.0625) assert.strictEqual(R.schriftPx(f) % 12, 0, 'f ' + f);
});

test('randPx: ganze Bildschirm-Pixel, mindestens 1', () => {
  assert.strictEqual(R.randPx(25 / 6, 6), 25);
  assert.strictEqual(R.randPx(2, 6), 12);
  assert.strictEqual(R.randPx(0, 6), 1);
  assert.ok(Number.isInteger(R.randPx(6.9375, 6)));
});

