const { test } = require('node:test');
const assert = require('node:assert');
const PointsIcon = require('../renderer/lib/points-icon');

// Eigene Liste statt der echten: die echte darf wachsen, ohne dass Tests
// umfallen. Getestet wird die Regel, nicht der Inhalt der Liste.
const LISTE = [
  { name: 'Gold', id: 'g1', farbton: 45 },
  { name: 'Gold2', id: 'g2', farbton: 50 },
  { name: 'Blau', id: 'b1', farbton: 215 },
  { name: 'Lila', id: 'l1', farbton: 280 },
  { name: 'Pink', id: 'p1', farbton: 320 }
];

test('waehlt aus der Farbfamilie der Akzentfarbe', () => {
  // #ffb300 ist Gold, Farbton ~42 -> nur die beiden Gold-Eintraege sind nah.
  const e = PointsIcon.waehleEmote('#ffb300', 'kanal', LISTE);
  assert.ok(['g1', 'g2'].includes(e.id), 'erwartet Gold, bekam ' + e.id);
});

test('weicht auf die naechstliegenden aus, wenn keine Familie passt', () => {
  // #00ff00 ist Gruen, Farbton 120 - kein Eintrag liegt innerhalb von 60 Grad.
  const e = PointsIcon.waehleEmote('#00ff00', 'kanal', LISTE);
  assert.ok(e, 'darf nicht null sein, sonst faellt das Symbol ganz weg');
});

test('derselbe Kanal liefert immer dasselbe Emote', () => {
  const a = PointsIcon.waehleEmote('#ffb300', 'papaplatte', LISTE);
  const b = PointsIcon.waehleEmote('#ffb300', 'papaplatte', LISTE);
  assert.equal(a.id, b.id);
});

test('verschiedene Kanaele koennen verschiedene Emotes liefern', () => {
  const ids = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    .map((k) => PointsIcon.waehleEmote('#ffb300', k, LISTE).id));
  assert.ok(ids.size > 1, 'Auswahl haengt nicht vom Kanalnamen ab');
});

// Der Test oben nutzt Ein-Zeichen-Kanalnamen und nur zwei Kandidaten (Gold-
// Paar) - dort liefert bereits das erste Zeichen allein genug Streuung, ganz
// ohne die n*31-Rechnung von quersumme() zu brauchen. Dieser Test hier nimmt
// mehrzeichige, echte Twitch-Kanalnamen mit demselben Anfangsbuchstaben und
// eine Kandidatenmenge von fuenf statt zwei: ein quersumme(), das nur das
// erste Zeichen auswertet, wuerde alle "p"-Namen auf denselben Kandidaten
// abbilden und diesen Test durchfallen lassen.
const LISTE_FUENF_KANDIDATEN = [
  { name: 's1', id: 's1', farbton: 180 },
  { name: 's2', id: 's2', farbton: 210 },
  { name: 's3', id: 's3', farbton: 240 },
  { name: 's4', id: 's4', farbton: 270 },
  { name: 's5', id: 's5', farbton: 300 }
];

test('gleicher Anfangsbuchstabe liefert trotzdem unterschiedliche Emotes (echte Streuung, nicht nur erstes Zeichen)', () => {
  // #0000ff ist reines Blau, Farbton 240 - alle fuenf Kandidaten liegen
  // innerhalb von 60 Grad, also entscheidet erst quersumme() ueber den
  // vollen Namen, nicht mehr die Farbfamilie.
  const kanaele = ['papaplatte', 'pokimane', 'peter', 'pinguin'];
  const ids = new Set(kanaele.map((k) => PointsIcon.waehleEmote('#0000ff', k, LISTE_FUENF_KANDIDATEN).id));
  assert.ok(ids.size > 1, 'gleicher Anfangsbuchstabe darf nicht auf dasselbe Emote kollabieren');
});

test('leere Liste liefert null', () => {
  assert.equal(PointsIcon.waehleEmote('#ffb300', 'kanal', []), null);
});

test('unbrauchbare Akzentfarbe liefert null statt zu werfen', () => {
  assert.equal(PointsIcon.waehleEmote('keinhex', 'kanal', LISTE), null);
  assert.equal(PointsIcon.waehleEmote(null, 'kanal', LISTE), null);
});

test('fehlender Kanalname liefert trotzdem ein Emote', () => {
  const e = PointsIcon.waehleEmote('#ffb300', null, LISTE);
  assert.ok(e && e.id);
});

test('Farbton wird ueber die 360-Grad-Grenze hinweg gemessen', () => {
  // Farbton 350 (Rot) liegt 30 Grad von 320 (Pink), nicht 30 weniger als 360.
  const e = PointsIcon.waehleEmote('#ff0033', 'kanal', LISTE);
  assert.equal(e.id, 'p1');
});

test('emoteUrl baut die 7TV-Adresse', () => {
  assert.equal(PointsIcon.emoteUrl('abc'), 'https://cdn.7tv.app/emote/abc/2x.webp');
});

test('waehleEmote liefert die URL gleich mit', () => {
  const e = PointsIcon.waehleEmote('#ffb300', 'kanal', LISTE);
  assert.equal(e.url, PointsIcon.emoteUrl(e.id));
});

test('die echte Liste ist brauchbar bestueckt', () => {
  assert.ok(PointsIcon.EMOTES.length >= 5);
  for (const e of PointsIcon.EMOTES) {
    assert.ok(typeof e.id === 'string' && e.id.length > 0, e.name + ' ohne ID');
    assert.ok(e.farbton >= 0 && e.farbton < 360, e.name + ' mit unbrauchbarem Farbton');
  }
});
