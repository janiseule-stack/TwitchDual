// test/kanal-ereignisse.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const KE = require('../renderer/lib/kanal-ereignisse');
const batch = require('./fixtures/kanal-ereignisse/start-batch.json');
const umfrageFix = require('./fixtures/kanal-ereignisse/umfrage-aktiv.json');
const hermes = require('./fixtures/kanal-ereignisse/hermes-rahmen.json');

const T0 = Date.parse('2026-10-08T22:53:05Z');
const pinNode = batch[0].data.channel.pinnedChatMessages.edges[0].node;
const gesperrt = batch[2].data.community.channel.lockedPredictionEvents[0];
const nutzlast = (rahmen) => JSON.parse(JSON.parse(rahmen).notification.pubsub);
const eventUpdated = nutzlast(hermes.eventUpdated);
const aktiv = { ...gesperrt, status: 'ACTIVE', lockedAt: null };

test('Pin wird abgebildet', () => {
  const z = KE.createZustand();
  z.ausStart({ pin: pinNode }, T0, { erstes: true });
  const p = z.stand().pin;
  assert.equal(p.id, pinNode.id);
  assert.match(p.text, /LYORA-SHOP/);
  assert.equal(p.absender.name, 'silas3o');
  assert.equal(p.absender.farbe, '#FF69B4');
  assert.equal(p.angeheftetVon, 'silas3o');
  assert.equal(p.endetUm, null);
});

test('Umfrage: Anteile, Mehrfachwahl, Ende aus Restzeit', () => {
  const z = KE.createZustand();
  z.ausStart({ umfrage: umfrageFix.channel.viewablePoll }, T0, { erstes: true });
  const u = z.stand().umfrage;
  assert.equal(u.titel, 'what to do');
  assert.equal(u.status, 'ACTIVE');
  assert.equal(u.gesamt, 1431);
  assert.equal(u.mehrfach, true);
  assert.equal(u.endetUm, T0 + 76901);
  assert.deepEqual(u.optionen.map(o => [o.titel, o.stimmen]), [['Outer Wilds', 677], ['jet lag', 754]]);
  assert.ok(Math.abs(u.optionen[1].anteil - 754 / 1431) < 1e-9);
});

test('Vorhersage aus GQL: Quote, Anteil, Einreichungsende, Top-Einsatz', () => {
  const z = KE.createZustand();
  z.ausStart({ vorhersage: aktiv }, T0, { erstes: true });
  const v = z.stand().vorhersage;
  assert.equal(v.status, 'ACTIVE');
  assert.equal(v.einreichungBis, Date.parse(gesperrt.createdAt) + 1800 * 1000);
  const [ja, nein] = v.optionen;
  assert.equal(ja.titel, 'YESSSS');
  assert.equal(ja.farbe, 'BLUE');
  const summe = ja.punkte + nein.punkte;
  assert.ok(Math.abs(nein.quote - summe / nein.punkte) < 1e-9);
  assert.ok(Math.abs(ja.anteil + nein.anteil - 1) < 1e-9);
  assert.equal(ja.topEinsatz, 250000);
});

test('Vorhersage aus Hermes (snake_case) ergibt dasselbe Format', () => {
  const z = KE.createZustand();
  const r = z.ausHermes('predictions-channel-v1.411377640', eventUpdated, T0);
  assert.equal(r.unbekannt, false);
  const v = z.stand().vorhersage;
  assert.equal(v.id, '128e4464-1a73-4f3c-9e7f-d79b06a27755');
  assert.equal(v.optionen[1].titel, 'NOOO');
  assert.ok(v.optionen[1].punkte > 0);
  assert.equal(v.gewinnerId, null);
});

test('erstes Laden ohne Signal, neue Vorhersage danach mit Start-Signal', () => {
  const z = KE.createZustand();
  assert.deepEqual(z.ausStart({ vorhersage: aktiv }, T0, { erstes: true }), []);
  const neu = { ...aktiv, id: 'neu-1' };
  const s = z.ausStart({ vorhersage: neu }, T0, { erstes: false });
  assert.deepEqual(s, [{ art: 'ereignis-start', welche: 'vorhersage', id: 'neu-1' }]);
});

test('fremde aufgeloeste Vorhersage wird ignoriert', () => {
  const z = KE.createZustand();
  z.ausStart({ vorhersage: { ...aktiv, id: 'alt', status: 'RESOLVED', winningOutcome: { id: 'x' } } }, T0, { erstes: true });
  assert.equal(z.stand().vorhersage, null);
});

test('beendete fremde Umfrage wird ignoriert', () => {
  const z = KE.createZustand();
  const fertig = { ...umfrageFix.channel.viewablePoll, status: 'COMPLETED' };
  z.ausStart({ umfrage: fertig }, T0, { erstes: true });
  assert.equal(z.stand().umfrage, null);
});

test('prediction-made setzt meinTipp, points-spent das Guthaben', () => {
  const z = KE.createZustand();
  z.ausHermes('predictions-user-v1.999', nutzlast(hermes.predictionMade), T0);
  assert.deepEqual(z.stand().meinTipp, {
    eventId: '128e4464-1a73-4f3c-9e7f-d79b06a27755',
    optionId: 'b1e75c1a-270c-4954-ad33-54ac6383b329',
    punkte: 10500
  });
  z.ausHermes('community-points-user-v1.999', nutzlast(hermes.pointsSpent), T0);
  assert.equal(z.stand().guthaben, 17946);
});

test('eigenerTipp addiert auf derselben Option', () => {
  const z = KE.createZustand();
  z.eigenerTipp({ eventId: 'e', optionId: 'o', punkte: 100 });
  z.eigenerTipp({ eventId: 'e', optionId: 'o', punkte: 50 });
  assert.equal(z.stand().meinTipp.punkte, 150);
});

test('Aufloesung mit eigenem Tipp: Gewinn mit Betrag, Ende-Signal nur einmal', () => {
  const z = KE.createZustand();
  z.ausStart({ vorhersage: aktiv }, T0, { erstes: true });
  const nein = aktiv.outcomes[1];
  z.eigenerTipp({ eventId: aktiv.id, optionId: nein.id, punkte: 1000 });
  const fertig = { ...aktiv, status: 'RESOLVED', winningOutcome: { id: nein.id } };
  const s1 = z.ausStart({ vorhersage: fertig }, T0, { erstes: false });
  assert.equal(s1.length, 1);
  assert.equal(s1[0].art, 'tipp-gewonnen');
  const summe = aktiv.outcomes[0].totalPoints + nein.totalPoints;
  assert.equal(s1[0].betrag, Math.floor(1000 * summe / nein.totalPoints));
  assert.deepEqual(z.ausStart({ vorhersage: fertig }, T0, { erstes: false }), []);
});

test('Aufloesung gegen eigenen Tipp: Verlust', () => {
  const z = KE.createZustand();
  z.ausStart({ vorhersage: aktiv }, T0, { erstes: true });
  z.eigenerTipp({ eventId: aktiv.id, optionId: aktiv.outcomes[0].id, punkte: 10 });
  const fertig = { ...aktiv, status: 'RESOLVED', winningOutcome: { id: aktiv.outcomes[1].id } };
  assert.deepEqual(z.ausStart({ vorhersage: fertig }, T0, { erstes: false }), [{ art: 'tipp-verloren', id: aktiv.id }]);
});

test('Aufloesung ohne eigenen Tipp: kein Signal', () => {
  const z = KE.createZustand();
  z.ausStart({ vorhersage: aktiv }, T0, { erstes: true });
  const fertig = { ...aktiv, status: 'RESOLVED', winningOutcome: { id: aktiv.outcomes[1].id } };
  assert.deepEqual(z.ausStart({ vorhersage: fertig }, T0, { erstes: false }), []);
  assert.equal(z.stand().vorhersage.gewinnerId, aktiv.outcomes[1].id);
});

test('RESOLVE_PENDING wird als LOCKED gezeigt', () => {
  const z = KE.createZustand();
  const e = JSON.parse(JSON.stringify(eventUpdated));
  e.data.event.status = 'RESOLVE_PENDING';
  z.ausHermes('predictions-channel-v1.1', e, T0);
  assert.equal(z.stand().vorhersage.status, 'LOCKED');
});

test('Pin- und Umfrage-Rahmen sind (noch) unbekannt', () => {
  const z = KE.createZustand();
  assert.equal(z.ausHermes('pinned-chat-updates-v1.1', { type: 'pin-message', data: {} }, T0).unbekannt, true);
  assert.equal(z.ausHermes('polls.1', { type: 'POLL_UPDATE', data: {} }, T0).unbekannt, true);
});

test('Schluessel fehlt = Teil bleibt, null = Teil weg', () => {
  const z = KE.createZustand();
  z.ausStart({ pin: pinNode, vorhersage: aktiv }, T0, { erstes: true });
  z.ausStart({ pin: null }, T0, { erstes: false });
  assert.equal(z.stand().pin, null);
  assert.ok(z.stand().vorhersage);
});
