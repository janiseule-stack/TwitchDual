const test = require('node:test');
const assert = require('node:assert');
const R = require('../renderer/lib/raum.js');

test('Konstanten: Bildgroesse, Reihenfolge und Namen der Flaechen', () => {
  assert.deepStrictEqual(R.BILD, { breite: 344, hoehe: 192 });
  assert.deepStrictEqual(R.FLAECHEN.map((f) => f.id), ['plattenspieler', 'fernseher', 'bild', 'lampe', 'regal']);
  assert.deepStrictEqual(R.FLAECHEN.map((f) => f.name), ['Plattenspieler', 'Fernseher', 'Konto', 'Licht', 'Platten']);
  assert.deepStrictEqual(R.HUELLE, { kante: 40, abstand: 4 });
  assert.deepStrictEqual(R.TELLER, { x: 284, y: 113 });
  assert.deepStrictEqual(R.FACH.live, { x: 114, y: 19, b: 175, h: 46 });
  assert.deepStrictEqual(R.FACH.offline, { x: 114, y: 80, b: 175, h: 43 });
  assert.deepStrictEqual(R.FACH.vorn, { x: 114, y: 138, b: 175, h: 52 });
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
  assert.deepStrictEqual(R.HOVER.regal, { x: 96, y: 10, b: 72, h: 124 });
  assert.deepStrictEqual(R.HOVER.lampe, { x: 161, y: 2, b: 39, h: 112 });
  assert.deepStrictEqual(R.HOVER.fernseher, { x: 194, y: 34, b: 78, h: 78 });
  assert.deepStrictEqual(R.HOVER.plattenspieler, { x: 258, y: 82, b: 54, h: 50 });
  assert.deepStrictEqual(R.HOVER.bild, { x: 278, y: 32, b: 40, h: 62 });
  for (const f of R.FLAECHEN) {
    assert.strictEqual(R.HOVER[f.id].x, f.x - 4, f.id);
    assert.strictEqual(R.HOVER[f.id].y, f.y - 4, f.id);
  }
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

test('zettelZeilen: zuerst entfaellt die Laufzeit, dann die Kanalpunkte', () => {
  assert.deepStrictEqual(R.zettelZeilen(84, 12), { platz: 7, titel: true, spiel: true, punkte: true, laufzeit: true });
  assert.deepStrictEqual(R.zettelZeilen(72, 12), { platz: 6, titel: true, spiel: true, punkte: true, laufzeit: false });
  assert.deepStrictEqual(R.zettelZeilen(60, 12), { platz: 5, titel: true, spiel: true, punkte: false, laufzeit: false });
  assert.deepStrictEqual(R.zettelZeilen(59, 12), { platz: 4, titel: true, spiel: false, punkte: false, laufzeit: false });
  assert.strictEqual(R.zettelZeilen(100, 0).platz, 0);
});

test('grossKante: ganzzahliges Vielfaches von 128 in 70 % der Fensterhoehe', () => {
  assert.strictEqual(R.grossKante(800), 512);
  assert.strictEqual(R.grossKante(1332), 896);
  assert.strictEqual(R.grossKante(384), 256);
  assert.strictEqual(R.grossKante(100), 128);
  assert.strictEqual(R.grossKante(1332, 1397), 896);
  assert.strictEqual(R.grossKante(1332, 700), 512); // Breite begrenzt: (700 - 96) / 128 = 4
  assert.strictEqual(R.grossKante(800, 100), 128);
  for (let h = 200; h < 2000; h += 37) {
    const k = R.grossKante(h);
    assert.strictEqual(k % 128, 0);
    if (k > 128) assert.ok(k <= h * 0.7 && k + 128 > h * 0.7, 'h ' + h);
  }
});

test('zettelZeilen: vorderer Zettel (Innenhoehe 48 - 12 - 6 = 30 Bildpixel) zeigt bei jedem Faktor >= 2 die Pflichtzeilen', () => {
  for (let f = 2; f <= 12; f += 1 / 16) {
    const zeile = R.schriftPx(f);
    const innen = 30 * f;
    const z = R.zettelZeilen(innen, zeile);
    // Status, Name, Titel, Spiel, Knoepfe
    assert.ok(z.platz >= 5 && z.titel && z.spiel, 'f ' + f);
    // was gezeigt wird, passt senkrecht: Zeilenhoehe x Zeilen <= Innenhoehe
    const zeilen = 5 + (z.punkte ? 1 : 0) + (z.laufzeit ? 1 : 0);
    assert.ok(zeilen * zeile <= innen + 1e-9, 'f ' + f);
  }
});
