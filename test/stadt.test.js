'use strict';
// Chat-Stadt: reine Logik (Masse, Uhrzeit-Licht, Abo-Fenster, Gewitter, Regisseur, Raid).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Stadt = require('../renderer/lib/stadt.js');
const Szene = require('../renderer/lib/szene.js');

const JSON_DATEI = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'raum-quellen', 'stadt.json'), 'utf8'));

// Feste Zufallsfolge fuer reproduzierbare Tests
function folge(werte) {
  let i = 0;
  return () => werte[i++ % werte.length];
}

test('STADT ist eingefroren und gleich tools/raum-quellen/stadt.json', () => {
  assert.ok(Object.isFrozen(Stadt.STADT));
  assert.ok(Object.isFrozen(Stadt.STADT.fenster));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(Stadt.STADT)), JSON_DATEI);
});

// Review Focus 1: breite, niedrige, schmale, grosse Chats
const GROESSEN = [[1397, 1332], [1397, 400], [400, 1332], [2560, 1440], [900, 700]];

test('masse: Stadt deckt die ganze Flaeche, Strasse ganz sichtbar, Nachrichten >= 50 %', () => {
  const B = Stadt.STADT.bild;
  const S = Stadt.STADT.ebenen.strasse;
  for (const [breite, hoehe] of GROESSEN) {
    const m = Stadt.masse(breite, hoehe);
    const tag = breite + 'x' + hoehe;
    // deckend: kein Rand links/rechts/oben/unten
    assert.ok(m.links <= 0, tag + ' links');
    assert.ok(m.links + B.b * m.faktor >= breite - 0.5, tag + ' rechts');
    assert.ok(m.oben <= 0, tag + ' oben');
    assert.ok(Math.abs(m.oben + B.h * m.faktor - hoehe) < 0.5, tag + ' Bild endet unten am Band');
    // Strassenband = ganze Strasse
    assert.strictEqual(m.strasseH, Math.min(Math.round(S.h * m.faktor), Math.floor(hoehe / 2)), tag + ' strasseH');
    assert.ok(hoehe - m.strasseH >= hoehe * 0.5, tag + ' Nachrichtenbereich');
    // Pixel-Massstab wie im Streifen oben, sofern das deckt
    assert.ok(m.faktor >= Szene.faktor(breite) - 1e-9, tag + ' faktor');
  }
  // Chat 1397x1332: Stadtflaeche ~940 hoch (ohne Streifen und Eingabe) -> genau der Streifen-Massstab
  assert.strictEqual(Stadt.masse(1397, 940).faktor, Szene.faktor(1397));
});

test('masse: kaputte Werte geben Bild-Masse mit Faktor 1', () => {
  for (const [b, h] of [[0, 500], [NaN, 500], [500, 0], [-3, 9]]) {
    const m = Stadt.masse(b, h);
    assert.strictEqual(m.faktor, 1);
    assert.strictEqual(m.strasseH, Stadt.STADT.ebenen.strasse.h);
  }
});

test('masse: sehr niedriger Chat kappt das Band auf die halbe Hoehe', () => {
  const m = Stadt.masse(1397, 150);
  assert.ok(m.strasseH <= 75);
});

test('lichtAnteil nach Uhrzeit', () => {
  assert.strictEqual(Stadt.lichtAnteil(20), 0.6);
  assert.strictEqual(Stadt.lichtAnteil(23), 0.4);
  assert.strictEqual(Stadt.lichtAnteil(0), 0.4);
  assert.strictEqual(Stadt.lichtAnteil(3), 0.12);
  assert.strictEqual(Stadt.lichtAnteil(6), 0.25);
  assert.strictEqual(Stadt.lichtAnteil(12), 0.3);
  assert.ok(Object.isFrozen(Stadt.LICHT_NACH_STUNDE));
});

test('aboFenster: nur noch dunkle Fenster, nie mehr als vorhanden (Review Focus 3)', () => {
  const r = Stadt.aboFenster(10, [0, 1, 2], 3, folge([0.5, 0.1, 0.9]));
  assert.strictEqual(r.length, 3);
  assert.strictEqual(new Set(r).size, 3);
  for (const i of r) assert.ok(i >= 3 && i < 10, String(i));
  const alle = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.deepStrictEqual(Stadt.aboFenster(10, alle, 5), []);
  const viel = Stadt.aboFenster(72, [], 50);
  assert.strictEqual(new Set(viel).size, 50);
  assert.strictEqual(Stadt.aboFenster(5, [1], 50).length, 4);
});

test('gewitter: erst lange Regen, dann Gewitter mit Blitzen >= 4 s Abstand', () => {
  const g = Stadt.gewitter({ zufall: folge([0, 0.3, 0.7, 1, 0.5]) });
  const a = g.naechste(0);
  assert.strictEqual(a.phase, 'regen');
  assert.strictEqual(a.blitzInMs, null);
  assert.ok(a.wechselInMs >= 8 * 60000 && a.wechselInMs <= 20 * 60000);
  let t = a.wechselInMs;
  const gw = g.naechste(t);
  assert.strictEqual(gw.phase, 'gewitter');
  assert.ok(gw.wechselInMs >= 2 * 60000 && gw.wechselInMs <= 4 * 60000);
  const ende = t + gw.wechselInMs;
  let letzter = -Infinity;
  let blitze = 0;
  for (let i = 0; i < 200 && t < ende; i++) {
    const n = g.naechste(t);
    if (n.phase !== 'gewitter' || n.blitzInMs === null) break;
    const zeit = t + n.blitzInMs;
    assert.ok(zeit - letzter >= 4000, 'Abstand ' + (zeit - letzter));
    assert.ok(n.blitzInMs <= 15000);
    letzter = zeit;
    t = zeit;
    blitze++;
  }
  assert.ok(blitze >= 5, 'Blitze ' + blitze);
  assert.strictEqual(g.naechste(ende + 1).phase, 'regen');
});

test('gewitter: zweimal fragen vor dem Blitz plant keinen neuen', () => {
  const g = Stadt.gewitter({ zufall: folge([0, 0, 0.5]) });
  const t = g.naechste(0).wechselInMs;
  const a = g.naechste(t);
  const b = g.naechste(t + 1000);
  assert.strictEqual(b.blitzInMs, a.blitzInMs - 1000);
});

test('regisseur: Mitte hoechstens 1, Strasse hoechstens 2, gesamt hoechstens 3', () => {
  let jetzt = 0;
  const r = Stadt.regisseur({ jetzt: () => jetzt });
  assert.ok(r.darf('mitte'));
  r.belegt('mitte', 5000);
  assert.strictEqual(r.darf('mitte'), false);
  assert.ok(r.darf('strasse'));
  r.belegt('strasse', 5000);
  r.belegt('strasse', 5000);
  assert.strictEqual(r.darf('strasse'), false);
  assert.strictEqual(r.darf('himmel'), false, 'gesamt 3 erreicht');
  r.frei('strasse');
  assert.ok(r.darf('himmel'));
  jetzt = 6000; // abgelaufen
  assert.ok(r.darf('mitte'));
  assert.ok(r.darf('strasse'));
});

test('raidPlan: Gruppengroesse nach Raid-Groesse', () => {
  assert.deepStrictEqual(Stadt.raidPlan(5), { figuren: 1, bus: false });
  assert.deepStrictEqual(Stadt.raidPlan(20), { figuren: 3, bus: false });
  assert.deepStrictEqual(Stadt.raidPlan(80), { figuren: 4, bus: true });
  assert.deepStrictEqual(Stadt.raidPlan(250), { figuren: 8, bus: true });
  assert.deepStrictEqual(Stadt.raidPlan(0), { figuren: 1, bus: false });
  assert.deepStrictEqual(Stadt.raidPlan(NaN), { figuren: 1, bus: false });
});

test('raidDauer waechst mit der Strassenbreite und deckt den ganzen Weg (Review Focus 2)', () => {
  const F = Stadt.STADT.figur;
  for (const plan of [Stadt.raidPlan(5), Stadt.raidPlan(250)]) {
    const kurz = Stadt.raidDauer(plan, 200);
    const lang = Stadt.raidDauer(plan, 800);
    assert.ok(lang > kurz);
    const mindest = ((800 + F.b) / F.pxProBild) * F.msProBild;
    assert.ok(lang >= mindest, 'Figur kommt ganz durch');
  }
  assert.ok(Stadt.raidDauer(Stadt.raidPlan(250), 344) >= Stadt.raidDauer(Stadt.raidPlan(5), 344) + 2000);
});

// Janis 13.11.: „ich meine dass mans nicht sieht“ – Blitz nur aus einer Wolke, die im
// sichtbaren Ausschnitt liegt; Strahl beginnt im sichtbaren Teil der Wolke.
const sichtFuer = (b, h) => {
  const m = Stadt.masse(b, h);
  const links = -m.links / m.faktor;
  return { links, rechts: links + b / m.faktor, oben: -m.oben / m.faktor };
};
const sichtAnteil = (w, s) => {
  const bx = Math.max(0, Math.min(w.x + w.b, s.rechts) - Math.max(w.x, s.links));
  const hy = Math.max(0, w.y + w.h - Math.max(w.y, s.oben));
  return (bx * Math.min(hy, w.h)) / (w.b * w.h);
};

test('blitzWolken: mehrere leuchtende Wolken, jede breit genug, Strahl beginnt in jeder', () => {
  const S = Stadt.STADT;
  assert.ok(Object.isFrozen(S.blitzWolken) && S.blitzWolken.length >= 3, '2-3 verschiedene Wolken');
  for (const w of S.blitzWolken) {
    assert.ok(/^stadt-himmel-blitz-[a-z]+\.png$/.test(w.datei), w.datei);
    assert.ok(w.b >= S.strahl.b && w.h > 0);
    assert.ok(S.strahl.y >= w.y && S.strahl.y <= w.y + w.h, 'Strahl beginnt in ' + w.datei);
  }
});

test('blitzZiel: nur gut sichtbare Wolken, Strahl im sichtbaren Teil der Wolke', () => {
  const S = Stadt.STADT;
  const R = S.strahl;
  for (const [b, h] of [[1397, 903], [480, 1153], [400, 1111], [900, 675], [344, 277]]) {
    const s = sichtFuer(b, h);
    const gute = S.blitzWolken.map((w, i) => i).filter((i) => sichtAnteil(S.blitzWolken[i], s) >= Stadt.WOLKE_SICHTBAR);
    assert.ok(gute.length >= 1, b + 'x' + h + ': mindestens eine Wolke sichtbar');
    const gewaehlt = new Set();
    for (let k = 0; k < 20; k++) {
      const z = Stadt.blitzZiel(s, () => k / 20);
      assert.ok(z, b + 'x' + h);
      assert.ok(gute.includes(z.wolke), b + 'x' + h + ': Wolke ' + z.wolke + ' kaum sichtbar');
      gewaehlt.add(z.wolke);
      const w = S.blitzWolken[z.wolke];
      const von = Math.max(w.x, s.links);
      const bis = Math.min(w.x + w.b, s.rechts);
      if (bis - von >= R.b) assert.ok(z.x >= von - 0.5 && z.x + R.b <= bis + 0.5, b + 'x' + h + ': x ' + z.x);
      else assert.ok(Math.abs(z.x + R.b / 2 - (von + bis) / 2) <= 1, 'mittig im sichtbaren Teil');
    }
    assert.deepStrictEqual([...gewaehlt].sort(), gute.slice().sort(), b + 'x' + h + ': alle sichtbaren kommen dran');
  }
});

test('blitzZiel: kein Himmel zu sehen -> kein Blitz (null)', () => {
  for (const [b, h] of [[1397, 353], [1397, 143], [2560, 871]]) {
    assert.strictEqual(Stadt.blitzZiel(sichtFuer(b, h), () => 0.5), null, b + 'x' + h);
  }
});
