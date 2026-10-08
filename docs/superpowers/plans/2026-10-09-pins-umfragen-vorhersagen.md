# Pins, Umfragen, Vorhersagen im Chat — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Angepinnte Nachricht, laufende Umfrage und Vorhersage des Live-Kanals erscheinen im Chat-Fenster; auf Vorhersagen kann man mit Web-Login setzen.

**Architecture:** Main holt beim Laden eines Live-Kanals den Startzustand per Twitch-GQL (persisted queries, anonym oder mit Web-Token), haelt eine Hermes-WebSocket-Verbindung fuer Live-Updates und fragt Pin/Umfrage alle 10 s nach. Ein DOM-freier Zustand (`renderer/lib/kanal-ereignisse.js`) bildet GQL- und Hermes-Daten auf ein Format ab und erzeugt Effekt-Signale; Main schickt `{stand, signale}` per IPC ans Chat-Fenster, das Pin-Leiste und Ereignis-Karten zeichnet. Setzen laeuft ueber `MakePrediction` mit Integrity-Kopfzeilen.

**Tech Stack:** Electron 33, Node `node:test`, Paket `ws` (schon installiert), Vanilla-JS-Renderer, UMD-Libs.

**Spec:** `docs/superpowers/specs/2026-10-09-pins-umfragen-vorhersagen-design.md` (Messdaten: `docs/TODO.md`, Abschnitt „Angepinnte Nachrichten, Umfragen, Vorhersagen (Mess-Versuch 2026-10-09)")

**Abweichung von der Spec (bewusst):** Der Zustand lebt im **Main** (Steuerung), nicht im Renderer. Grund: Effekt-Signale und Setz-Pruefung brauchen denselben Zustand, und so ist alles ohne DOM testbar. Der Renderer bekommt fertige `{stand, signale}` und zeichnet nur.

## Global Constraints

- Web-Client-ID: `kimne78kx3ncx6brgo4mv6wki5h1ko`; GQL-Endpunkt `https://gql.twitch.tv/gql`.
- Hermes: `wss://hermes.twitch.tv/v1?clientId=kimne78kx3ncx6brgo4mv6wki5h1ko`; `notification.pubsub` ist ein String → zweimal parsen.
- Persisted-Hashes (Stand 09.10.2026):
  - `GetPinnedChat` `450320a012e0f1704586e55755307ca3f8a4c611d678687cc3e202471a33e615`
  - `ChannelPollContext_GetViewablePoll` `b2386b4f33494ae5b67b92c4279ce9aad3bd912b1f7e1f07fc6a42d5cb6afc5d`
  - `ChannelPointsPredictionContext` `d364abb25d0ad06fc973de923fb10a7631c6cfb4ef7d24cd3e9811593db09ccd`
  - `UserPredictionEventRestriction` `e0c56e52f9743ad3f5d9b5b201da5f44e4d1028d2e32787f8e72641daaea55f6`
  - `MakePrediction` `b44682ecc88358817009f20e69d75081b1e58825bb40aa53d5dbadcc17c881d8`
- Einsatz: mindestens 10, hoechstens 250.000 und hoechstens Guthaben.
- Der Web-Token verlaesst den Main nie (kein IPC gibt ihn heraus), steht nie im Diagnose-Protokoll.
- Preload ist sandboxed: nur `electron`/`events`/`timers`/`url` requiren (`test/preload-sandbox.test.js`).
- Nur Live-Kanaele; VOD und Home → alles aus.
- Animationen immer an (`prefers-reduced-motion` wird bewusst ignoriert).
- Texte in der Oberflaeche deutsch. Code-Kommentare deutsch, ohne Umlaute (Stil des Repos).
- Kein Versions-Bump, kein Release in diesem Plan.
- Tests: `npm test` (= `node --test`), alle muessen gruen sein (vorher 432).

## Review Focus

1. **Kanalwechsel waehrend laufender Startabfrage** — die Antwort des alten Kanals darf den neuen nicht befuellen (Task 5, Test „veraltete Antwort wird verworfen").
2. **App-Start mitten in einer laufenden/aufgeloesten Vorhersage** — kein Start-Effekt beim ersten Laden, keine alte aufgeloeste Vorhersage als Karte (Task 1, Tests „erstes Laden ohne Signal" und „fremde aufgeloeste Vorhersage wird ignoriert").
3. **Doppelte Hermes-Rahmen** (Twitch schickt `event-updated` ~1×/s) — Gewinn-/Verlust-Effekt genau einmal pro Vorhersage (Task 1, Test „Ende-Signal nur einmal").
4. **Guthaben kleiner als Chip-Betrag oder unter 10** — Chip deaktiviert statt unsinniger Betrag (Task 2, Test „chipBetrag Grenzen").
5. **Hermes stirbt still (kein keepalive)** — Verbindung gilt nach 2× keepaliveSec als tot und verbindet neu (Task 3, Test „keepalive-Ausfall").

---

## Dateien

| Datei | Verantwortung |
|---|---|
| `renderer/lib/kanal-ereignisse.js` (neu, UMD `KanalEreignisse`) | Abbildung GQL/Hermes → Zustand, Effekt-Signale, Rechenhilfen (Quote, Countdown, Chips) |
| `src/hermes.js` (neu) | Hermes-WebSocket: welcome → authenticate → subscribe, Rahmen entpacken, keepalive-Waechter, Neuverbindung |
| `src/twitch-kanal-ereignisse.js` (neu) | GQL: Startzustand-Batch, eigene Nutzer-ID, Setzen, Fehlertexte |
| `src/integrity-aufruf.js` (neu) | „mit Integrity-Kopfzeilen aufrufen, bei Ablehnung genau einmal neu ernten" — aus `kisteEinloesen` herausgezogen |
| `src/kanal-ereignisse-steuerung.js` (neu) | Ablauf: Kanal geladen → Start → Themen → Rueckfall-Takt; Setzen; sendet `{stand, signale}` |
| `renderer/lib/theme-runtime.js` (aendern) | neue Effekt-Arten auf vorhandene abbilden |
| `main.js`, `preload.js` (aendern) | Verdrahtung, IPC |
| `renderer/chat/ereignis-karten.js` (neu) | DOM: Pin-Leiste + Karten + Setzen-Bedienung |
| `renderer/chat/index.html`, `chat.css`, `chat.js` (aendern) | Einbau |
| `test/fixtures/kanal-ereignisse/*.json` (neu, schon erzeugt) | echte, token-freie Antworten vom 09.10. |

Die Fixtures liegen bereits im Arbeitsbaum (`start-batch.json`: Pin eliasn97 + gesperrte Vorhersage jynxzi; `umfrage-aktiv.json`: Umfrage ludwig; `hermes-rahmen.json`: welcome, subscribeResponse, authenticateResponse, event-updated, prediction-made, points-spent). Sie werden in Task 1 mit-committet.

---

### Task 1: Zustand — Abbildung und Signale

**Files:**
- Create: `renderer/lib/kanal-ereignisse.js`
- Test: `test/kanal-ereignisse.test.js`
- Commit dazu: `test/fixtures/kanal-ereignisse/*.json`

**Interfaces:**
- Produces:
  - `createZustand()` → `{ ausStart(daten, jetztMs, { erstes }) → Signal[], ausHermes(thema, nutzlast, jetztMs) → { signale: Signal[], unbekannt: boolean }, eigenerTipp({ eventId, optionId, punkte }) → Signal[], stand() → Stand }`
  - `daten` fuer `ausStart`: `{ pin?, umfrage?, vorhersage? }` — Schluessel fehlt = Teil unveraendert; Wert `null` = nichts da bzw. Abfrage gescheitert. `pin` ist ein GQL-Knoten aus `pinnedChatMessages.edges[].node`, `umfrage` das GQL-`viewablePoll`, `vorhersage` ein GQL-Prediction-Event (camelCase).
  - `Stand = { pin, umfrage, vorhersage, meinTipp, guthaben }` mit
    - `pin: { id, text, absender: { name, farbe }, angeheftetVon, endetUm } | null`
    - `umfrage: { id, titel, status, endetUm, optionen: [{ id, titel, stimmen, anteil }], gesamt, mehrfach } | null`
    - `vorhersage: { id, titel, status, einreichungBis, optionen: [{ id, titel, farbe, punkte, nutzer, anteil, quote, topEinsatz }], gewinnerId } | null` (status: `ACTIVE|LOCKED|RESOLVED|CANCELED`)
    - `meinTipp: { eventId, optionId, punkte } | null`, `guthaben: number | null`
  - `Signal = { art: 'ereignis-start', welche: 'umfrage'|'vorhersage', id } | { art: 'tipp-gewonnen', id, betrag } | { art: 'tipp-verloren', id }`

- [ ] **Step 1: Failing tests schreiben**

```js
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
```

- [ ] **Step 2: Tests laufen lassen, muessen scheitern**

Run: `node --test test/kanal-ereignisse.test.js`
Expected: FAIL mit `Cannot find module '../renderer/lib/kanal-ereignisse'`

- [ ] **Step 3: Implementierung**

```js
// renderer/lib/kanal-ereignisse.js
// Pins, Umfragen, Vorhersagen: bildet Twitch-GQL (camelCase) und Hermes
// (snake_case) auf EIN Format ab und erzeugt Effekt-Signale. DOM-frei, UMD
// wie chat-ereignisse.js -> mit echten Mitschnitten (09.10.2026) getestet.
// Spec: docs/superpowers/specs/2026-10-09-pins-umfragen-vorhersagen-design.md
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KanalEreignisse = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_EINSATZ = 10;
  const MAX_EINSATZ = 250000;
  // Zwischenzustaende zeigen wir wie "gesperrt": Einreichung ist vorbei,
  // Ergebnis steht noch aus.
  const STATUS_ALIAS = { RESOLVE_PENDING: 'LOCKED', CANCEL_PENDING: 'LOCKED' };
  const ENDGUELTIG = new Set(['RESOLVED', 'CANCELED']);

  const ms = (iso) => (iso ? Date.parse(iso) : null);

  function pinAus(node) {
    if (!node || !node.pinnedMessage) return null;
    const m = node.pinnedMessage;
    const s = m.sender || {};
    const von = node.pinnedBy;
    return {
      id: node.id,
      text: (m.content && m.content.text) || '',
      absender: { name: s.displayName || s.login || '', farbe: s.chatColor || null },
      angeheftetVon: von ? (von.displayName || von.login || null) : null,
      endetUm: ms(node.endsAt)
    };
  }

  function umfrageAus(p, jetzt) {
    if (!p) return null;
    const optionen = (p.choices || []).map((c) => ({
      id: c.id, titel: c.title, stimmen: (c.votes && c.votes.total) || 0
    }));
    const summe = optionen.reduce((n, o) => n + o.stimmen, 0);
    const rest = typeof p.remainingDurationMilliseconds === 'number' ? p.remainingDurationMilliseconds : null;
    return {
      id: p.id,
      titel: p.title,
      status: p.status,
      endetUm: p.status === 'ACTIVE' && rest !== null ? jetzt + rest : ms(p.endedAt),
      optionen: optionen.map((o) => ({ ...o, anteil: summe ? o.stimmen / summe : 0 })),
      gesamt: (p.votes && p.votes.total) || summe,
      mehrfach: !!(p.settings && p.settings.multichoice && p.settings.multichoice.isEnabled)
    };
  }

  // snake: true fuer Hermes-Nutzlasten, false fuer GQL.
  function vorhersageAus(e, snake) {
    if (!e) return null;
    const roh = (e.outcomes || []).map((o) => {
      const top = (snake ? o.top_predictors : o.topPredictors) || [];
      return {
        id: o.id,
        titel: o.title,
        farbe: o.color,
        punkte: (snake ? o.total_points : o.totalPoints) || 0,
        nutzer: (snake ? o.total_users : o.totalUsers) || 0,
        topEinsatz: top.reduce((m, t) => Math.max(m, t.points || 0), 0)
      };
    });
    const summe = roh.reduce((n, o) => n + o.punkte, 0);
    const erstellt = ms(snake ? e.created_at : e.createdAt);
    const fenster = snake ? e.prediction_window_seconds : e.predictionWindowSeconds;
    const gewinner = snake ? e.winning_outcome_id : (e.winningOutcome && e.winningOutcome.id);
    return {
      id: e.id,
      titel: e.title,
      status: STATUS_ALIAS[e.status] || e.status,
      einreichungBis: erstellt !== null && fenster ? erstellt + fenster * 1000 : null,
      optionen: roh.map((o) => ({
        ...o,
        anteil: summe ? o.punkte / summe : 0,
        quote: o.punkte ? summe / o.punkte : null
      })),
      gewinnerId: gewinner || null
    };
  }

  function createZustand() {
    const z = { pin: null, umfrage: null, vorhersage: null, meinTipp: null, guthaben: null };
    const gemeldet = new Set(); // 'start:<id>' / 'ende:<id>' -> jedes Signal genau einmal

    // Neue Umfrage/Vorhersage uebernehmen. Eine bereits beendete, die wir
    // nicht schon zeigen, ist Vergangenheit (z. B. beim Kanal-Laden) -> weg.
    function uebernehme(art, neu, istBeendet, erstes, signale) {
      const alt = z[art];
      if (neu && istBeendet(neu) && (!alt || alt.id !== neu.id)) neu = null;
      z[art] = neu;
      if (!neu) return;
      const k = 'start:' + neu.id;
      if (!istBeendet(neu) && !gemeldet.has(k)) {
        gemeldet.add(k);
        if (!erstes) signale.push({ art: 'ereignis-start', welche: art, id: neu.id });
      }
    }

    function endeSignal(signale) {
      const v = z.vorhersage;
      const t = z.meinTipp;
      if (!v || v.status !== 'RESOLVED' || !t || t.eventId !== v.id) return;
      const k = 'ende:' + v.id;
      if (gemeldet.has(k)) return;
      gemeldet.add(k);
      const opt = v.optionen.find((o) => o.id === t.optionId);
      if (v.gewinnerId === t.optionId && opt && opt.quote) {
        signale.push({ art: 'tipp-gewonnen', id: v.id, betrag: Math.floor(t.punkte * opt.quote) });
      } else {
        signale.push({ art: 'tipp-verloren', id: v.id });
      }
    }

    const umfrageBeendet = (u) => u.status !== 'ACTIVE';
    const vorhersageBeendet = (v) => ENDGUELTIG.has(v.status);

    return {
      ausStart(daten, jetzt, { erstes } = {}) {
        const signale = [];
        if ('pin' in daten) z.pin = pinAus(daten.pin);
        if ('umfrage' in daten) uebernehme('umfrage', umfrageAus(daten.umfrage, jetzt), umfrageBeendet, erstes, signale);
        if ('vorhersage' in daten) uebernehme('vorhersage', vorhersageAus(daten.vorhersage, false), vorhersageBeendet, erstes, signale);
        endeSignal(signale);
        return signale;
      },

      ausHermes(thema, nutzlast, jetzt) {
        const signale = [];
        const art = String(thema).split('.')[0];
        const typ = nutzlast && nutzlast.type;
        const d = (nutzlast && nutzlast.data) || {};
        if (art === 'predictions-channel-v1' && d.event) {
          uebernehme('vorhersage', vorhersageAus(d.event, true), vorhersageBeendet, false, signale);
          endeSignal(signale);
          return { signale, unbekannt: false };
        }
        if (art === 'predictions-user-v1' && d.prediction && /prediction-(made|updated)/.test(typ)) {
          z.meinTipp = { eventId: d.prediction.event_id, optionId: d.prediction.outcome_id, punkte: d.prediction.points };
          return { signale, unbekannt: false };
        }
        if (art === 'community-points-user-v1' && d.balance && typeof d.balance.balance === 'number') {
          z.guthaben = d.balance.balance;
          return { signale, unbekannt: false };
        }
        // Alles andere ist ungemessen (Pin, Umfrage, prediction-result, ...)
        // -> der Aufrufer protokolliert es, der 10-s-Rueckfall haelt Pin und
        // Umfrage aktuell.
        return { signale, unbekannt: true };
      },

      eigenerTipp({ eventId, optionId, punkte }) {
        const t = z.meinTipp;
        z.meinTipp = t && t.eventId === eventId && t.optionId === optionId
          ? { ...t, punkte: t.punkte + punkte }
          : { eventId, optionId, punkte };
        const signale = [];
        endeSignal(signale);
        return signale;
      },

      stand() {
        return JSON.parse(JSON.stringify(z));
      }
    };
  }

  return { createZustand, MIN_EINSATZ, MAX_EINSATZ };
});
```

- [ ] **Step 4: Tests laufen lassen**

Run: `node --test test/kanal-ereignisse.test.js`
Expected: PASS (alle Tests)

- [ ] **Step 5: Commit**

```bash
git add renderer/lib/kanal-ereignisse.js test/kanal-ereignisse.test.js test/fixtures/kanal-ereignisse
git commit -m "feat: Zustand fuer Pins, Umfragen, Vorhersagen aus GQL und Hermes"
```

---

### Task 2: Zustand — Rechenhilfen fuer die Anzeige

**Files:**
- Modify: `renderer/lib/kanal-ereignisse.js` (Rueckgabe-Objekt erweitern)
- Test: `test/kanal-ereignisse.test.js` (anhaengen)

**Interfaces:**
- Consumes: `Stand` aus Task 1.
- Produces (alle am Modul-Export, neben `createZustand`):
  - `quoteText(quote: number|null) → string` (z. B. `'1:1,94'`, `null` → `'–'`)
  - `countdownText(restMs: number|null) → string` (`'11:18'`, `'0:05'`, `null` → `''`)
  - `restMs(bisMs: number|null, jetztMs) → number|null` (nie negativ)
  - `setzbareOptionen(stand) → string[]` (Options-IDs; leer wenn nicht `ACTIVE`; nach eigenem Tipp nur dessen Option)
  - `chipBetrag(art: '100'|'1000'|'10%'|'25%'|'alles', guthaben: number|null) → number|null`
  - `eigenerBetrag(text: string, guthaben: number|null) → { betrag } | { fehler: string }`
  - `CHIPS = ['100', '1000', '10%', '25%', 'alles']`

- [ ] **Step 1: Failing tests anhaengen**

```js
test('quoteText und countdownText', () => {
  assert.equal(KE.quoteText(1.9412), '1:1,94');
  assert.equal(KE.quoteText(null), '–');
  assert.equal(KE.countdownText(678000), '11:18');
  assert.equal(KE.countdownText(5000), '0:05');
  assert.equal(KE.countdownText(null), '');
  assert.equal(KE.restMs(1000, 5000), 0);
  assert.equal(KE.restMs(null, 5000), null);
});

test('setzbareOptionen: alle, nach eigenem Tipp nur dieselbe, gesperrt keine', () => {
  const z = KE.createZustand();
  z.ausStart({ vorhersage: aktiv }, T0, { erstes: true });
  assert.equal(KE.setzbareOptionen(z.stand()).length, 2);
  z.eigenerTipp({ eventId: aktiv.id, optionId: aktiv.outcomes[1].id, punkte: 10 });
  assert.deepEqual(KE.setzbareOptionen(z.stand()), [aktiv.outcomes[1].id]);
  z.ausStart({ vorhersage: { ...aktiv, status: 'LOCKED' } }, T0, { erstes: false });
  assert.deepEqual(KE.setzbareOptionen(z.stand()), []);
});

test('chipBetrag Grenzen', () => {
  assert.equal(KE.chipBetrag('100', 5000), 100);
  assert.equal(KE.chipBetrag('1000', 500), 500, 'gekappt aufs Guthaben');
  assert.equal(KE.chipBetrag('10%', 28446), 2844);
  assert.equal(KE.chipBetrag('25%', 28446), 7111);
  assert.equal(KE.chipBetrag('alles', 28446), 28446);
  assert.equal(KE.chipBetrag('alles', 999999), 250000, 'Twitch-Hoechstwert');
  assert.equal(KE.chipBetrag('10%', 50), null, '5 < 10');
  assert.equal(KE.chipBetrag('100', 9), null, 'Guthaben unter 10');
  assert.equal(KE.chipBetrag('100', null), null);
});

test('eigenerBetrag prueft Eingabe', () => {
  assert.deepEqual(KE.eigenerBetrag('10500', 28446), { betrag: 10500 });
  assert.deepEqual(KE.eigenerBetrag(' 10.500 ', 28446), { betrag: 10500 });
  assert.deepEqual(KE.eigenerBetrag('5', 28446), { fehler: 'Mindestens 10 Punkte' });
  assert.deepEqual(KE.eigenerBetrag('30000', 28446), { fehler: 'Nicht genug Punkte' });
  assert.deepEqual(KE.eigenerBetrag('300000', 999999), { fehler: 'Höchstens 250.000 Punkte' });
  assert.deepEqual(KE.eigenerBetrag('abc', 28446), { fehler: 'Bitte eine Zahl eingeben' });
});
```

- [ ] **Step 2: Laufen lassen, muss scheitern**

Run: `node --test test/kanal-ereignisse.test.js`
Expected: FAIL mit `KE.quoteText is not a function`

- [ ] **Step 3: Implementierung** — vor `return { createZustand, ... }` einfuegen und den Export erweitern:

```js
  function quoteText(q) {
    return q ? '1:' + q.toFixed(2).replace('.', ',') : '–';
  }

  function restMs(bis, jetzt) {
    return bis === null || bis === undefined ? null : Math.max(0, bis - jetzt);
  }

  function countdownText(rest) {
    if (rest === null || rest === undefined) return '';
    const s = Math.ceil(rest / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function setzbareOptionen(stand) {
    const v = stand && stand.vorhersage;
    if (!v || v.status !== 'ACTIVE') return [];
    const t = stand.meinTipp;
    if (t && t.eventId === v.id) return [t.optionId];
    return v.optionen.map((o) => o.id);
  }

  const CHIPS = ['100', '1000', '10%', '25%', 'alles'];

  function chipBetrag(art, guthaben) {
    if (typeof guthaben !== 'number' || guthaben < MIN_EINSATZ) return null;
    const roh = art === 'alles' ? guthaben
      : art === '10%' ? Math.floor(guthaben * 0.1)
      : art === '25%' ? Math.floor(guthaben * 0.25)
      : Number(art);
    const b = Math.min(roh, MAX_EINSATZ, guthaben);
    return b >= MIN_EINSATZ ? b : null;
  }

  function eigenerBetrag(text, guthaben) {
    const roh = String(text || '').replace(/[\s.']/g, '');
    if (!/^\d+$/.test(roh)) return { fehler: 'Bitte eine Zahl eingeben' };
    const b = Number(roh);
    if (b < MIN_EINSATZ) return { fehler: 'Mindestens 10 Punkte' };
    if (b > MAX_EINSATZ) return { fehler: 'Höchstens 250.000 Punkte' };
    if (typeof guthaben === 'number' && b > guthaben) return { fehler: 'Nicht genug Punkte' };
    return { betrag: b };
  }
```

Export ersetzen durch:

```js
  return {
    createZustand, MIN_EINSATZ, MAX_EINSATZ, CHIPS,
    quoteText, restMs, countdownText, setzbareOptionen, chipBetrag, eigenerBetrag
  };
```

- [ ] **Step 4: Laufen lassen**

Run: `node --test test/kanal-ereignisse.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add renderer/lib/kanal-ereignisse.js test/kanal-ereignisse.test.js
git commit -m "feat: Rechenhilfen fuer Quote, Countdown und Einsatz-Chips"
```

---

### Task 3: Hermes-Client

**Files:**
- Create: `src/hermes.js`
- Test: `test/hermes.test.js`

**Interfaces:**
- Produces: `createHermes({ WebSocketImpl, getToken, onEreignis, onStatus, diag, setTimeoutImpl, clearTimeoutImpl, jetzt, delay })` → `{ setzeThemen(themen: string[]), schliesse() }`
  - `onEreignis(thema: string, nutzlast: object)` — Nutzlast schon doppelt geparst
  - `onStatus('verbunden' | 'wieder-da' | 'getrennt')` — `'wieder-da'` bei jedem welcome nach dem ersten innerhalb derselben Themenliste
  - `diag(ereignis: string, detail: object)` — enthaelt nie das Token
  - Abmelden einzelner Themen ist ungemessen → `setzeThemen` mit anderer Liste schliesst und verbindet frisch; leere Liste = getrennt bleiben.

- [ ] **Step 1: Failing tests**

```js
// test/hermes.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { createHermes } = require('../src/hermes');
const fix = require('./fixtures/kanal-ereignisse/hermes-rahmen.json');

function fakeWsKlasse() {
  const instanzen = [];
  class FakeWs {
    constructor(url, opts) { this.url = url; this.opts = opts; this.gesendet = []; this.zu = false; instanzen.push(this); }
    send(s) { this.gesendet.push(JSON.parse(s)); }
    close() { this.zu = true; if (this.onclose) this.onclose({}); }
    rein(obj) { this.onmessage({ data: typeof obj === 'string' ? obj : JSON.stringify(obj) }); }
  }
  FakeWs.instanzen = instanzen;
  return FakeWs;
}

function fakeTimer() {
  let n = 0; const offen = new Map();
  return {
    setTimeoutImpl: (fn, ms) => { const id = ++n; offen.set(id, { fn, ms }); return id; },
    clearTimeoutImpl: (id) => offen.delete(id),
    feuere(msGleich) { for (const [id, t] of [...offen]) if (msGleich === undefined || t.ms === msGleich) { offen.delete(id); t.fn(); } },
    offen
  };
}

function aufbau({ token = null } = {}) {
  const Ws = fakeWsKlasse();
  const timer = fakeTimer();
  const ereignisse = []; const status = []; const diags = [];
  const h = createHermes({
    WebSocketImpl: Ws, getToken: () => token,
    onEreignis: (t, n) => ereignisse.push([t, n]), onStatus: (s) => status.push(s),
    diag: (e, d) => diags.push([e, d]),
    setTimeoutImpl: timer.setTimeoutImpl, clearTimeoutImpl: timer.clearTimeoutImpl,
    jetzt: () => 0, delay: () => 1234
  });
  return { h, Ws, timer, ereignisse, status, diags };
}

test('ohne Themen keine Verbindung', () => {
  const a = aufbau();
  a.h.setzeThemen([]);
  assert.equal(a.Ws.instanzen.length, 0);
});

test('welcome -> subscribe je Thema, anonym ohne authenticate', () => {
  const a = aufbau();
  a.h.setzeThemen(['polls.1', 'predictions-channel-v1.1']);
  const ws = a.Ws.instanzen[0];
  assert.match(ws.url, /^wss:\/\/hermes\.twitch\.tv\/v1\?clientId=kimne78kx3ncx6brgo4mv6wki5h1ko$/);
  ws.rein(fix.welcome);
  assert.deepEqual(ws.gesendet.map((r) => r.type), ['subscribe', 'subscribe']);
  assert.deepEqual(ws.gesendet.map((r) => r.subscribe.pubsub.topic), ['polls.1', 'predictions-channel-v1.1']);
  assert.equal(ws.gesendet[0].subscribe.type, 'pubsub');
  assert.deepEqual(a.status, ['verbunden']);
});

test('mit Token: authenticate zuerst, Token nie im diag', () => {
  const a = aufbau({ token: 'GEHEIM123' });
  a.h.setzeThemen(['polls.1']);
  const ws = a.Ws.instanzen[0];
  ws.rein(fix.welcome);
  assert.equal(ws.gesendet[0].type, 'authenticate');
  assert.equal(ws.gesendet[0].authenticate.token, 'GEHEIM123');
  assert.equal(ws.gesendet[1].type, 'subscribe');
  ws.rein(fix.authenticateResponse);
  assert.ok(!JSON.stringify(a.diags).includes('GEHEIM123'));
});

test('notification wird doppelt geparst und dem Thema zugeordnet', () => {
  const a = aufbau();
  a.h.setzeThemen(['predictions-channel-v1.411377640']);
  const ws = a.Ws.instanzen[0];
  ws.rein(fix.welcome);
  const aboId = ws.gesendet[0].subscribe.id;
  const rahmen = JSON.parse(fix.eventUpdated);
  rahmen.notification.subscription.id = aboId;
  ws.rein(rahmen);
  assert.equal(a.ereignisse.length, 1);
  assert.equal(a.ereignisse[0][0], 'predictions-channel-v1.411377640');
  assert.equal(a.ereignisse[0][1].type, 'event-updated');
});

test('kaputte notification wird gemeldet, nicht geworfen', () => {
  const a = aufbau();
  a.h.setzeThemen(['polls.1']);
  const ws = a.Ws.instanzen[0];
  ws.rein(fix.welcome);
  ws.rein({ type: 'notification', notification: { subscription: { id: ws.gesendet[0].subscribe.id }, pubsub: '{kaputt' } });
  assert.equal(a.ereignisse.length, 0);
  assert.equal(a.diags.at(-1)[0], 'rahmen-kaputt');
});

test('keepalive-Ausfall: nach 2x keepaliveSec zu, dann Neuverbindung mit Neu-Abo', () => {
  const a = aufbau();
  a.h.setzeThemen(['polls.1']);
  const ws1 = a.Ws.instanzen[0];
  ws1.rein(fix.welcome); // keepaliveSec 15 -> Waechter 30000
  a.timer.feuere(30000);
  assert.equal(ws1.zu, true);
  a.timer.feuere(1234); // Backoff
  const ws2 = a.Ws.instanzen[1];
  assert.ok(ws2, 'neue Verbindung');
  ws2.rein(fix.welcome);
  assert.equal(ws2.gesendet[0].subscribe.pubsub.topic, 'polls.1');
  assert.deepEqual(a.status, ['verbunden', 'getrennt', 'wieder-da']);
});

test('keepalive setzt den Waechter zurueck', () => {
  const a = aufbau();
  a.h.setzeThemen(['polls.1']);
  const ws = a.Ws.instanzen[0];
  ws.rein(fix.welcome);
  ws.rein({ type: 'keepalive', id: 'k', timestamp: 'x' });
  assert.equal([...a.timer.offen.values()].filter((t) => t.ms === 30000).length, 1);
});

test('andere Themenliste: alte Verbindung zu ohne Neuverbindung, neue auf', () => {
  const a = aufbau();
  a.h.setzeThemen(['polls.1']);
  a.Ws.instanzen[0].rein(fix.welcome);
  a.h.setzeThemen(['polls.2']);
  assert.equal(a.Ws.instanzen[0].zu, true);
  assert.equal(a.Ws.instanzen.length, 2);
  a.timer.feuere(1234);
  assert.equal(a.Ws.instanzen.length, 2, 'kein Reconnect der alten');
  a.Ws.instanzen[1].rein(fix.welcome);
  assert.equal(a.Ws.instanzen[1].gesendet[0].subscribe.pubsub.topic, 'polls.2');
});

test('gleiche Themenliste: nichts passiert', () => {
  const a = aufbau();
  a.h.setzeThemen(['polls.1']);
  a.h.setzeThemen(['polls.1']);
  assert.equal(a.Ws.instanzen.length, 1);
});

test('schliesse: zu und keine Neuverbindung', () => {
  const a = aufbau();
  a.h.setzeThemen(['polls.1']);
  a.h.schliesse();
  a.timer.feuere();
  assert.equal(a.Ws.instanzen.length, 1);
  assert.equal(a.Ws.instanzen[0].zu, true);
});
```

- [ ] **Step 2: Laufen lassen, muss scheitern**

Run: `node --test test/hermes.test.js`
Expected: FAIL mit `Cannot find module '../src/hermes'`

- [ ] **Step 3: Implementierung**

```js
// src/hermes.js
// Twitchs Ereignis-Strom "Hermes" (Nachfolger von pubsub-edge, gemessen
// 2026-08-12 und 2026-10-09, siehe docs/TODO.md). Electron-frei: die
// WebSocket-Klasse wird uebergeben (Default: Paket 'ws', wie chat-send.js).
// Abmelden einzelner Themen ist ungemessen -> eine neue Themenliste heisst
// neue Verbindung.
const { randomUUID } = require('crypto');
const Backoff = require('../renderer/lib/backoff');

const HERMES_URL = 'wss://hermes.twitch.tv/v1?clientId=kimne78kx3ncx6brgo4mv6wki5h1ko';

const neueId = () => randomUUID().replace(/-/g, '').slice(0, 21);

function createHermes({
  WebSocketImpl = require('ws'),
  getToken = () => null,
  onEreignis = () => {},
  onStatus = () => {},
  diag = () => {},
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  jetzt = Date.now,
  delay = (versuch) => Backoff.delay(versuch)
} = {}) {
  let themen = [];            // aktuelle Liste
  let aboZuThema = new Map(); // abo-id -> thema (pro Verbindung neu)
  let ws = null;
  let waechter = null;
  let wiederTimer = null;
  let versuch = 0;
  let begruesst = false;      // schon ein welcome fuer diese Themenliste?

  function sende(sock, obj) {
    sock.send(JSON.stringify({ ...obj, timestamp: new Date(jetzt()).toISOString() }));
  }

  function stoppeTimer() {
    if (waechter) { clearTimeoutImpl(waechter); waechter = null; }
    if (wiederTimer) { clearTimeoutImpl(wiederTimer); wiederTimer = null; }
  }

  function waechterNeu(sock, keepaliveSec) {
    if (waechter) clearTimeoutImpl(waechter);
    waechter = setTimeoutImpl(() => {
      diag('keepalive-ausfall', {});
      sock.close();
    }, (keepaliveSec || 15) * 2000);
  }

  // Alte Verbindung schliessen, ohne dass ihr onclose eine Neuverbindung plant.
  function trenneStill() {
    stoppeTimer();
    if (!ws) return;
    const alt = ws;
    ws = null;
    alt.onclose = null;
    alt.onmessage = null;
    try { alt.close(); } catch (e) { /* schon zu */ }
  }

  function verbinde() {
    if (!themen.length) return;
    const sock = new WebSocketImpl(HERMES_URL, { headers: { Origin: 'https://www.twitch.tv' } });
    ws = sock;
    aboZuThema = new Map();
    let keepaliveSec = 15;

    sock.onmessage = (ev) => {
      if (ws !== sock) return;
      let d;
      try { d = JSON.parse(String(ev.data)); } catch (e) { diag('rahmen-kaputt', { stufe: 'umschlag' }); return; }
      waechterNeu(sock, keepaliveSec);
      if (d.welcome) {
        keepaliveSec = d.welcome.keepaliveSec || 15;
        waechterNeu(sock, keepaliveSec);
        const token = getToken();
        if (token) sende(sock, { id: neueId(), type: 'authenticate', authenticate: { token } });
        for (const thema of themen) {
          const aboId = neueId();
          aboZuThema.set(aboId, thema);
          sende(sock, { type: 'subscribe', id: neueId(), subscribe: { id: aboId, type: 'pubsub', pubsub: { topic: thema } } });
        }
        versuch = 0;
        onStatus(begruesst ? 'wieder-da' : 'verbunden');
        begruesst = true;
        return;
      }
      if (d.type === 'notification' && d.notification) {
        const thema = aboZuThema.get(d.notification.subscription && d.notification.subscription.id);
        if (!thema) return;
        let nutzlast;
        try { nutzlast = JSON.parse(d.notification.pubsub); } catch (e) {
          diag('rahmen-kaputt', { stufe: 'pubsub', thema });
          return;
        }
        onEreignis(thema, nutzlast);
        return;
      }
      if (d.type === 'subscribeResponse' && d.subscribeResponse && d.subscribeResponse.result !== 'ok') {
        diag('abo-fehler', { ergebnis: d.subscribeResponse.result });
      }
      if (d.type === 'authenticateResponse' && d.authenticateResponse && d.authenticateResponse.result !== 'ok') {
        diag('anmeldung-fehler', { ergebnis: d.authenticateResponse.result });
      }
    };

    sock.onerror = () => { /* onclose folgt */ };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      stoppeTimer();
      onStatus('getrennt');
      if (!themen.length) return;
      const warte = delay(versuch++);
      diag('neuverbindung', { versuch, warteMs: warte });
      wiederTimer = setTimeoutImpl(() => { wiederTimer = null; verbinde(); }, warte);
    };
  }

  return {
    setzeThemen(neu) {
      const liste = [...new Set(neu || [])];
      if (liste.length === themen.length && liste.every((t, i) => t === themen[i])) return;
      themen = liste;
      trenneStill();
      begruesst = false;
      versuch = 0;
      if (themen.length) verbinde();
    },
    schliesse() {
      themen = [];
      trenneStill();
    }
  };
}

module.exports = { createHermes, HERMES_URL };
```

Hinweis zum Test „keepalive-Ausfall": `sock.close()` im Fake ruft `onclose` synchron → `'getrennt'` + Backoff-Timer (1234 ms). Der Test feuert erst 30000, dann 1234.

- [ ] **Step 4: Laufen lassen**

Run: `node --test test/hermes.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hermes.js test/hermes.test.js
git commit -m "feat: Hermes-Client mit keepalive-Waechter und Neuverbindung"
```

---

### Task 4: GQL-Aufrufe und Integrity-Hilfe

**Files:**
- Create: `src/twitch-kanal-ereignisse.js`, `src/integrity-aufruf.js`
- Modify: `main.js:521-555` (`kisteEinloesen` nutzt die neue Hilfe)
- Test: `test/twitch-kanal-ereignisse.test.js`, `test/integrity-aufruf.test.js`

**Interfaces:**
- Produces:
  - `createKanalEreignisseApi({ fetchImpl, neueTransaktionsId })` → `{ startzustand({ channelID, login, token }) → Promise<{ pin, umfrage, vorhersage, fehler: string[] }>, meineId(token) → Promise<string|null>, setze({ token, eventID, outcomeID, points, kopf }) → Promise<{ ok: boolean, code: string|null }> }` — `setze` wirft bei Integrity-Ablehnung einen Fehler mit `.integrity = true`, bei 401/403 `'Anmeldung abgelaufen (HTTP …)'`.
  - `fehlerText(code: string) → string` (Modul-Export)
  - `createIntegrityAufruf({ store, ernte, jetzt, melde })` → `mitIntegrity(fn: (kopf) => Promise<T>) → Promise<T | { ok:false, error }>`

- [ ] **Step 1: Failing tests**

```js
// test/twitch-kanal-ereignisse.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { createKanalEreignisseApi, fehlerText } = require('../src/twitch-kanal-ereignisse');
const batch = require('./fixtures/kanal-ereignisse/start-batch.json');

function fakeFetch(antworten, status = 200) {
  const aufrufe = [];
  const f = async (url, opts) => {
    aufrufe.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
    const a = antworten.shift();
    return { status, text: async () => JSON.stringify(a) };
  };
  f.aufrufe = aufrufe;
  return f;
}

test('startzustand: ein Batch mit drei persisted queries, anonym', async () => {
  const f = fakeFetch([batch]);
  const api = createKanalEreignisseApi({ fetchImpl: f });
  const r = await api.startzustand({ channelID: '238813810', login: 'eliasn97', token: null });
  const b = f.aufrufe[0].body;
  assert.deepEqual(b.map((x) => x.operationName), ['GetPinnedChat', 'ChannelPollContext_GetViewablePoll', 'ChannelPointsPredictionContext']);
  assert.deepEqual(b[0].variables, { channelID: '238813810', count: 1 });
  assert.deepEqual(b[1].variables, { login: 'eliasn97' });
  assert.deepEqual(b[2].variables, { count: 1, channelLogin: 'eliasn97' });
  assert.equal(b[0].extensions.persistedQuery.sha256Hash, '450320a012e0f1704586e55755307ca3f8a4c611d678687cc3e202471a33e615');
  assert.equal(f.aufrufe[0].headers['Client-ID'], 'kimne78kx3ncx6brgo4mv6wki5h1ko');
  assert.equal(f.aufrufe[0].headers.Authorization, undefined);
  assert.ok(r.pin && r.pin.pinnedMessage);
  assert.equal(r.vorhersage.status, 'LOCKED');
  assert.deepEqual(r.fehler, []);
});

test('startzustand mit Token schickt OAuth', async () => {
  const f = fakeFetch([batch]);
  await createKanalEreignisseApi({ fetchImpl: f }).startzustand({ channelID: '1', login: 'x', token: 'tok' });
  assert.equal(f.aufrufe[0].headers.Authorization, 'OAuth tok');
});

test('startzustand: kaputter Teil wird null, andere bleiben', async () => {
  const kaputt = JSON.parse(JSON.stringify(batch));
  kaputt[0] = { errors: [{ message: 'PersistedQueryNotFound' }], extensions: { operationName: 'GetPinnedChat' } };
  const r = await createKanalEreignisseApi({ fetchImpl: fakeFetch([kaputt]) }).startzustand({ channelID: '1', login: 'x' });
  assert.equal(r.pin, null);
  assert.ok(r.vorhersage);
  assert.deepEqual(r.fehler, ['pin: PersistedQueryNotFound']);
});

test('startzustand: Netzfehler -> alles null, Fehler benannt', async () => {
  const f = async () => { throw new Error('offline'); };
  const r = await createKanalEreignisseApi({ fetchImpl: f }).startzustand({ channelID: '1', login: 'x' });
  assert.deepEqual(r, { pin: null, umfrage: null, vorhersage: null, fehler: ['netz: offline'] });
});

test('vorhersage: aktiv vor gesperrt vor aufgeloest', async () => {
  const b = JSON.parse(JSON.stringify(batch));
  const c = b[2].data.community.channel;
  c.activePredictionEvents = [{ ...c.lockedPredictionEvents[0], id: 'aktiv', status: 'ACTIVE' }];
  const r = await createKanalEreignisseApi({ fetchImpl: fakeFetch([b]) }).startzustand({ channelID: '1', login: 'x' });
  assert.equal(r.vorhersage.id, 'aktiv');
});

test('meineId fragt currentUser roh ab', async () => {
  const f = fakeFetch([{ data: { currentUser: { id: '999' } } }]);
  assert.equal(await createKanalEreignisseApi({ fetchImpl: f }).meineId('tok'), '999');
  assert.match(f.aufrufe[0].body.query, /currentUser\s*\{\s*id\s*\}/);
});

test('setze: erst Restriction, dann MakePrediction mit Integrity-Kopf', async () => {
  const f = fakeFetch([
    [{ data: {}, extensions: { operationName: 'UserPredictionEventRestriction' } }],
    [{ data: { makePrediction: { error: null } }, extensions: { operationName: 'MakePrediction' } }]
  ]);
  const api = createKanalEreignisseApi({ fetchImpl: f, neueTransaktionsId: () => 'abc123' });
  const r = await api.setze({ token: 'tok', eventID: 'e', outcomeID: 'o', points: 10500, kopf: { 'Client-Integrity': 'INT' } });
  assert.deepEqual(r, { ok: true, code: null });
  assert.equal(f.aufrufe[0].body[0].operationName, 'UserPredictionEventRestriction');
  assert.deepEqual(f.aufrufe[0].body[0].variables, { eventID: 'e' });
  const m = f.aufrufe[1];
  assert.equal(m.body[0].operationName, 'MakePrediction');
  assert.deepEqual(m.body[0].variables, { input: { eventID: 'e', outcomeID: 'o', points: 10500, transactionID: 'abc123' } });
  assert.equal(m.body[0].extensions.persistedQuery.sha256Hash, 'b44682ecc88358817009f20e69d75081b1e58825bb40aa53d5dbadcc17c881d8');
  assert.equal(m.headers['Client-Integrity'], 'INT');
  assert.equal(m.headers.Authorization, 'OAuth tok');
});

test('setze: Twitch-Fehlercode', async () => {
  const f = fakeFetch([[{ data: {} }], [{ data: { makePrediction: { error: { code: 'NOT_ENOUGH_POINTS' } } } }]]);
  const r = await createKanalEreignisseApi({ fetchImpl: f }).setze({ token: 't', eventID: 'e', outcomeID: 'o', points: 10, kopf: {} });
  assert.deepEqual(r, { ok: false, code: 'NOT_ENOUGH_POINTS' });
});

test('setze: Integrity-Ablehnung wirft mit .integrity', async () => {
  const f = fakeFetch([[{ data: {} }], [{ errors: [{ message: 'failed integrity check' }] }]]);
  await assert.rejects(
    createKanalEreignisseApi({ fetchImpl: f }).setze({ token: 't', eventID: 'e', outcomeID: 'o', points: 10, kopf: {} }),
    (e) => e.integrity === true);
});

test('setze: 401 heisst Anmeldung abgelaufen', async () => {
  const f = fakeFetch([[{}]], 401);
  await assert.rejects(
    createKanalEreignisseApi({ fetchImpl: f }).setze({ token: 't', eventID: 'e', outcomeID: 'o', points: 10, kopf: {} }),
    /Anmeldung abgelaufen/);
});

test('fehlerText: bekannt deutsch, unbekannt roh', () => {
  assert.equal(fehlerText('NOT_ENOUGH_POINTS'), 'Nicht genug Punkte');
  assert.equal(fehlerText('IRGENDWAS'), 'Twitch lehnt ab: IRGENDWAS');
});
```

```js
// test/integrity-aufruf.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { createIntegrityAufruf } = require('../src/integrity-aufruf');

function store(start) {
  let satz = start;
  return { holen: () => satz, setzen: (s) => { satz = s; }, verwerfen: () => { satz = null; } };
}
const SATZ = { integrity: 'I1', deviceId: 'D', sessionId: 'S', version: 'V' };

test('vorhandener Satz wird als Kopfzeilen uebergeben', async () => {
  const m = createIntegrityAufruf({ store: store(SATZ), ernte: async () => null });
  const r = await m(async (kopf) => kopf);
  assert.deepEqual(r, { 'Client-Integrity': 'I1', 'X-Device-Id': 'D', 'Client-Session-Id': 'S', 'Client-Version': 'V' });
});

test('kein Satz: ernten, misslingt -> ok:false', async () => {
  const m = createIntegrityAufruf({ store: store(null), ernte: async () => null });
  assert.deepEqual(await m(async () => 'nie'), { ok: false, error: 'Integrity-Kopfzeilen nicht erhalten' });
});

test('Ablehnung: genau einmal neu ernten und wiederholen', async () => {
  let ernten = 0; const kopfe = [];
  const m = createIntegrityAufruf({ store: store(SATZ), ernte: async () => { ernten++; return { ...SATZ, integrity: 'I2' }; } });
  const r = await m(async (kopf) => {
    kopfe.push(kopf['Client-Integrity']);
    if (kopf['Client-Integrity'] === 'I1') { const e = new Error('x'); e.integrity = true; throw e; }
    return 'ok';
  });
  assert.equal(r, 'ok');
  assert.equal(ernten, 1);
  assert.deepEqual(kopfe, ['I1', 'I2']);
});

test('andere Fehler werden durchgereicht', async () => {
  const m = createIntegrityAufruf({ store: store(SATZ), ernte: async () => null });
  await assert.rejects(m(async () => { throw new Error('netz'); }), /netz/);
});
```

- [ ] **Step 2: Laufen lassen, muss scheitern**

Run: `node --test test/twitch-kanal-ereignisse.test.js test/integrity-aufruf.test.js`
Expected: FAIL mit `Cannot find module`

- [ ] **Step 3: Implementierung `src/twitch-kanal-ereignisse.js`**

```js
// src/twitch-kanal-ereignisse.js
// Pins, Umfragen, Vorhersagen ueber Twitchs Web-GQL. Persisted queries,
// mitgeschnitten am 09.10.2026 (docs/TODO.md). Anonym abfragbar, nur
// Client-ID; mit Web-Token zusaetzlich die eigenen Daten. fetch wird
// uebergeben -> kein Electron, voll testbar.
const { randomUUID } = require('crypto');

const WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const ENDPUNKT = 'https://gql.twitch.tv/gql';

const HASH = {
  pin: '450320a012e0f1704586e55755307ca3f8a4c611d678687cc3e202471a33e615',
  umfrage: 'b2386b4f33494ae5b67b92c4279ce9aad3bd912b1f7e1f07fc6a42d5cb6afc5d',
  vorhersage: 'd364abb25d0ad06fc973de923fb10a7631c6cfb4ef7d24cd3e9811593db09ccd',
  restriktion: 'e0c56e52f9743ad3f5d9b5b201da5f44e4d1028d2e32787f8e72641daaea55f6',
  setzen: 'b44682ecc88358817009f20e69d75081b1e58825bb40aa53d5dbadcc17c881d8'
};

// Codes nicht gemessen (nur der Erfolgsfall ist belegt) - gaengige Namen aus
// Twitchs Oberflaeche; alles andere wird roh angezeigt und protokolliert.
const FEHLER_TEXT = {
  NOT_ENOUGH_POINTS: 'Nicht genug Punkte',
  EVENT_NOT_ACTIVE: 'Einreichung ist vorbei',
  EVENT_LOCKED: 'Einreichung ist vorbei',
  MAX_POINTS_PER_EVENT: 'Höchstbetrag für diese Vorhersage erreicht',
  MULTIPLE_OUTCOMES: 'Du hast schon auf die andere Option gesetzt',
  USER_BANNED: 'Du bist in diesem Kanal gesperrt',
  DUPLICATE_TRANSACTION: 'Doppelt abgeschickt, bitte neu laden'
};

function fehlerText(code) {
  return FEHLER_TEXT[code] || 'Twitch lehnt ab: ' + code;
}

const persisted = (operationName, hash, variables) => ({
  operationName, variables, extensions: { persistedQuery: { version: 1, sha256Hash: hash } }
});

function createKanalEreignisseApi({ fetchImpl = fetch, neueTransaktionsId = () => randomUUID().replace(/-/g, '') } = {}) {
  async function post(body, token, kopf) {
    const headers = { ...(kopf || {}), 'Client-ID': WEB_CLIENT_ID, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'OAuth ' + token;
    const res = await fetchImpl(ENDPUNKT, { method: 'POST', headers, body: JSON.stringify(body) });
    if (res.status === 401 || res.status === 403) throw new Error('Anmeldung abgelaufen (HTTP ' + res.status + ')');
    return JSON.parse(await res.text());
  }

  // Einzelantwort eines Batch-Eintrags: Fehler -> Exception mit Integrity-Merker.
  function pruefe(antwort) {
    const errs = antwort && antwort.errors;
    if (errs && errs.length) {
      const m = errs[0].message || 'unbekannt';
      const e = new Error('Twitch-Fehler: ' + m);
      if (/integrity/i.test(m) || (errs[0].extensions && errs[0].extensions.code === 'IntegrityCheckFailed')) e.integrity = true;
      throw e;
    }
    return antwort.data;
  }

  return {
    async startzustand({ channelID, login, token }) {
      let antwort;
      try {
        antwort = await post([
          persisted('GetPinnedChat', HASH.pin, { channelID, count: 1 }),
          persisted('ChannelPollContext_GetViewablePoll', HASH.umfrage, { login }),
          persisted('ChannelPointsPredictionContext', HASH.vorhersage, { count: 1, channelLogin: login })
        ], token);
      } catch (e) {
        return { pin: null, umfrage: null, vorhersage: null, fehler: ['netz: ' + e.message] };
      }
      const fehler = [];
      const teil = (name, i, zieh) => {
        const a = Array.isArray(antwort) ? antwort[i] : null;
        if (!a || (a.errors && a.errors.length)) {
          fehler.push(name + ': ' + ((a && a.errors && a.errors[0].message) || 'keine Antwort'));
          return null;
        }
        try { return zieh(a.data) || null; } catch (e) { fehler.push(name + ': Form unerwartet'); return null; }
      };
      const pin = teil('pin', 0, (d) => {
        const kanten = d.channel && d.channel.pinnedChatMessages && d.channel.pinnedChatMessages.edges;
        return kanten && kanten[0] && kanten[0].node;
      });
      const umfrage = teil('umfrage', 1, (d) => d.channel && d.channel.viewablePoll);
      const vorhersage = teil('vorhersage', 2, (d) => {
        const c = d.community && d.community.channel;
        if (!c) return null;
        const aufgeloest = c.resolvedPredictionEvents && c.resolvedPredictionEvents.edges;
        return (c.activePredictionEvents || [])[0]
          || (c.lockedPredictionEvents || [])[0]
          || (aufgeloest && aufgeloest[0] && aufgeloest[0].node);
      });
      return { pin, umfrage, vorhersage, fehler };
    },

    async meineId(token) {
      const a = await post({ query: 'query { currentUser { id } }' }, token);
      const d = pruefe(a);
      return (d && d.currentUser && d.currentUser.id) || null;
    },

    // Reihenfolge wie die echte Seite (Mitschnitt 09.10.): erst Restriction,
    // dann MakePrediction. Das Ergebnis der Restriction ist ungemessen und
    // wird nicht ausgewertet.
    async setze({ token, eventID, outcomeID, points, kopf }) {
      await post([persisted('UserPredictionEventRestriction', HASH.restriktion, { eventID })], token, kopf);
      const a = await post([persisted('MakePrediction', HASH.setzen, {
        input: { eventID, outcomeID, points, transactionID: neueTransaktionsId() }
      })], token, kopf);
      const d = pruefe(Array.isArray(a) ? a[0] : a);
      const err = d && d.makePrediction && d.makePrediction.error;
      return { ok: !err, code: err ? err.code : null };
    }
  };
}

module.exports = { createKanalEreignisseApi, fehlerText, HASH };
```

- [ ] **Step 4: Implementierung `src/integrity-aufruf.js`**

```js
// src/integrity-aufruf.js
// "Mit Integrity-Kopfzeilen aufrufen": Satz aus dem Speicher, sonst ernten;
// lehnt Twitch ab (fehler.integrity), Satz verwerfen, GENAU einmal neu ernten
// und wiederholen. Vorher inline in main.js kisteEinloesen - jetzt auch fuers
// Setzen auf Vorhersagen.
function createIntegrityAufruf({ store, ernte, jetzt = Date.now, melde = () => {} }) {
  const kopfAus = (s) => ({
    'Client-Integrity': s.integrity,
    'X-Device-Id': s.deviceId,
    'Client-Session-Id': s.sessionId,
    'Client-Version': s.version
  });
  const KEIN_SATZ = { ok: false, error: 'Integrity-Kopfzeilen nicht erhalten' };

  async function hole(grund) {
    const s = await ernte();
    melde('integrity-ernte', { ergebnis: s ? 'ok' : 'fehlgeschlagen', grund });
    if (s) store.setzen(s, jetzt());
    return s;
  }

  return async function mitIntegrity(fn) {
    let satz = store.holen(jetzt());
    if (!satz) {
      satz = await hole('kein Satz im Speicher');
      if (!satz) return KEIN_SATZ;
    }
    try {
      return await fn(kopfAus(satz));
    } catch (e) {
      if (!e.integrity) throw e;
      store.verwerfen();
      const neu = await hole('Satz abgelehnt, zweiter Versuch');
      if (!neu) return KEIN_SATZ;
      return await fn(kopfAus(neu));
    }
  };
}

module.exports = { createIntegrityAufruf };
```

- [ ] **Step 5: `kisteEinloesen` in main.js umstellen**

Direkt nach `const integrity = createIntegrityStore({});` (main.js ~Z. 411) einfuegen:

```js
const { createIntegrityAufruf } = require('./src/integrity-aufruf');
const mitIntegrity = createIntegrityAufruf({
  store: integrity,
  ernte: () => ernteIntegrity({ BrowserWindow, ses: session.defaultSession }),
  melde: (ereignis, detail) => diagLog.melde('punkte', ereignis, detail)
});
```

Und die komplette Funktion `kisteEinloesen` (main.js ~Z. 518–555, inklusive Kommentar darueber) ersetzen durch:

```js
// Kiste einloesen. Twitch verlangt dafuer Integrity-Kopfzeilen aus einer
// echten Seitensitzung (src/integrity-aufruf.js: holen, bei Ablehnung genau
// einmal erneuern).
function kisteEinloesen(channelID, claimID) {
  return mitIntegrity((kopf) => pointsApi.claim(webToken, channelID, claimID, kopf));
}
```

- [ ] **Step 6: Alle Tests laufen lassen**

Run: `npm test`
Expected: PASS, keine bestehenden Tests rot

- [ ] **Step 7: Commit**

```bash
git add src/twitch-kanal-ereignisse.js src/integrity-aufruf.js test/twitch-kanal-ereignisse.test.js test/integrity-aufruf.test.js main.js
git commit -m "feat: GQL fuer Pins/Umfragen/Vorhersagen, Integrity-Aufruf als eigenes Modul"
```

---

### Task 5: Steuerung (Ablauf ohne Electron)

**Files:**
- Create: `src/kanal-ereignisse-steuerung.js`
- Test: `test/kanal-ereignisse-steuerung.test.js`

**Interfaces:**
- Consumes: `createZustand`, `setzbareOptionen`, `eigenerBetrag` (Task 1/2); `api.startzustand`, `api.setze`, `fehlerText` (Task 4); `hermes.setzeThemen` (Task 3); `mitIntegrity` (Task 4).
- Produces: `createSteuerung({ api, hermes, getToken, getUserId, mitIntegrity, senden, diag, jetzt, setIntervalImpl, clearIntervalImpl })` → `{ kanalGeladen({ login, channelID }) → Promise<void>, aus(), hermesEreignis(thema, nutzlast), hermesStatus(status), setze({ outcomeID, points }) → Promise<{ ok, text }> }`
  - `senden({ stand: Stand|null, signale: Signal[], angemeldet: boolean })` — IPC-Nutzlast `kanal-ereignisse`.

- [ ] **Step 1: Failing tests**

```js
// test/kanal-ereignisse-steuerung.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { createSteuerung } = require('../src/kanal-ereignisse-steuerung');
const batch = require('./fixtures/kanal-ereignisse/start-batch.json');

const gesperrt = batch[2].data.community.channel.lockedPredictionEvents[0];
const aktiv = { ...gesperrt, status: 'ACTIVE' };
const pinNode = batch[0].data.channel.pinnedChatMessages.edges[0].node;

function aufbau({ token = null, start } = {}) {
  const gesendet = []; const themen = []; const diags = []; const intervalle = [];
  const api = {
    aufrufe: [],
    async startzustand(a) { api.aufrufe.push(a); return typeof start === 'function' ? start(a) : (start || { pin: pinNode, umfrage: null, vorhersage: aktiv, fehler: [] }); },
    async setze(a) { api.gesetzt = a; return api.setzErgebnis || { ok: true, code: null }; }
  };
  const s = createSteuerung({
    api,
    hermes: { setzeThemen: (t) => themen.push(t) },
    getToken: () => token,
    getUserId: async () => (token ? '999' : null),
    mitIntegrity: async (fn) => fn({ 'Client-Integrity': 'I' }),
    senden: (p) => gesendet.push(p),
    diag: (e, d) => diags.push([e, d]),
    jetzt: () => Date.parse('2026-10-08T23:00:00Z'),
    setIntervalImpl: (fn, ms) => { intervalle.push({ fn, ms, aktiv: true }); return intervalle.length; },
    clearIntervalImpl: (id) => { intervalle[id - 1].aktiv = false; }
  });
  return { s, api, gesendet, themen, diags, intervalle };
}

test('kanalGeladen: Start holen, senden, Themen anonym', async () => {
  const a = aufbau();
  await a.s.kanalGeladen({ login: 'jynxzi', channelID: '411377640' });
  assert.deepEqual(a.api.aufrufe[0], { channelID: '411377640', login: 'jynxzi', token: null });
  const letzte = a.gesendet.at(-1);
  assert.equal(letzte.stand.vorhersage.status, 'ACTIVE');
  assert.ok(letzte.stand.pin);
  assert.deepEqual(letzte.signale, []);
  assert.equal(letzte.angemeldet, false);
  assert.deepEqual(a.themen.at(-1), ['pinned-chat-updates-v1.411377640', 'polls.411377640', 'predictions-channel-v1.411377640']);
});

test('mit Login zusaetzlich Nutzer-Themen', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'jynxzi', channelID: '411377640' });
  assert.ok(a.themen.at(-1).includes('predictions-user-v1.999'));
  assert.ok(a.themen.at(-1).includes('community-points-user-v1.999'));
  assert.equal(a.gesendet.at(-1).angemeldet, true);
});

test('veraltete Antwort wird verworfen', async () => {
  let loesen;
  const a = aufbau({ start: (arg) => arg.login === 'alt' ? new Promise((r) => { loesen = r; }) : { pin: null, umfrage: null, vorhersage: null, fehler: [] } });
  const altLauf = a.s.kanalGeladen({ login: 'alt', channelID: '1' });
  await a.s.kanalGeladen({ login: 'neu', channelID: '2' });
  loesen({ pin: pinNode, umfrage: null, vorhersage: aktiv, fehler: [] });
  await altLauf;
  assert.equal(a.gesendet.at(-1).stand.pin, null);
  assert.deepEqual(a.themen.at(-1), ['pinned-chat-updates-v1.2', 'polls.2', 'predictions-channel-v1.2']);
});

test('Rueckfall-Takt alle 10 s holt nur Pin und Umfrage', async () => {
  const a = aufbau();
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  const takt = a.intervalle.find((i) => i.aktiv);
  assert.equal(takt.ms, 10000);
  a.api.aufrufe.length = 0;
  await takt.fn();
  assert.equal(a.api.aufrufe.length, 1);
  assert.ok(a.gesendet.at(-1).stand.vorhersage, 'Vorhersage bleibt aus dem Start');
});

test('aus: Themen leer, Takt weg, leerer Stand gesendet', async () => {
  const a = aufbau();
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  a.s.aus();
  assert.deepEqual(a.themen.at(-1), []);
  assert.equal(a.intervalle.every((i) => !i.aktiv), true);
  assert.equal(a.gesendet.at(-1).stand, null);
});

test('Startfehler landen im diag', async () => {
  const a = aufbau({ start: { pin: null, umfrage: null, vorhersage: null, fehler: ['pin: PersistedQueryNotFound'] } });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  assert.ok(a.diags.some(([e, d]) => e === 'start-fehler' && d.fehler[0] === 'pin: PersistedQueryNotFound'));
});

test('unbekannter Hermes-Rahmen: hoechstens 3x je Typ protokolliert', async () => {
  const a = aufbau();
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  for (let i = 0; i < 5; i++) a.s.hermesEreignis('polls.1', { type: 'POLL_UPDATE', data: { i } });
  assert.equal(a.diags.filter(([e]) => e === 'hermes-rahmen').length, 3);
});

test('wieder-da holt den kompletten Start neu', async () => {
  const a = aufbau();
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  a.api.aufrufe.length = 0;
  await a.s.hermesStatus('wieder-da');
  assert.equal(a.api.aufrufe.length, 1);
});

test('setze ohne Login', async () => {
  const a = aufbau();
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  assert.deepEqual(await a.s.setze({ outcomeID: aktiv.outcomes[0].id, points: 100 }), { ok: false, text: 'Zum Setzen anmelden' });
});

test('setze mit Login: ruft api.setze mit Integrity-Kopf, merkt eigenen Tipp', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  const nein = aktiv.outcomes[1].id;
  const r = await a.s.setze({ outcomeID: nein, points: 10500 });
  assert.deepEqual(r, { ok: true, text: '10.500 gesetzt' });
  assert.deepEqual(a.api.gesetzt, { token: 'tok', eventID: aktiv.id, outcomeID: nein, points: 10500, kopf: { 'Client-Integrity': 'I' } });
  assert.deepEqual(a.gesendet.at(-1).stand.meinTipp, { eventId: aktiv.id, optionId: nein, punkte: 10500 });
});

test('setze auf gesperrte Gegen-Option wird lokal abgelehnt', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  await a.s.setze({ outcomeID: aktiv.outcomes[1].id, points: 10 });
  const r = await a.s.setze({ outcomeID: aktiv.outcomes[0].id, points: 10 });
  assert.deepEqual(r, { ok: false, text: 'Nur noch auf deine Option möglich' });
});

test('setze: Twitch-Fehlercode wird uebersetzt', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  a.api.setzErgebnis = { ok: false, code: 'NOT_ENOUGH_POINTS' };
  assert.deepEqual(await a.s.setze({ outcomeID: aktiv.outcomes[0].id, points: 10 }), { ok: false, text: 'Nicht genug Punkte' });
});

test('setze: ungueltiger Betrag', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  assert.deepEqual(await a.s.setze({ outcomeID: aktiv.outcomes[0].id, points: 5 }), { ok: false, text: 'Mindestens 10 Punkte' });
});
```

- [ ] **Step 2: Laufen lassen, muss scheitern**

Run: `node --test test/kanal-ereignisse-steuerung.test.js`
Expected: FAIL mit `Cannot find module`

- [ ] **Step 3: Implementierung**

```js
// src/kanal-ereignisse-steuerung.js
// Ablauf fuer Pins/Umfragen/Vorhersagen, ohne Electron: Kanal geladen ->
// Startzustand (GQL) -> Hermes-Themen -> 10-s-Rueckfall fuer Pin/Umfrage
// (deren Hermes-Rahmen sind ungemessen). Der Zustand lebt hier; das
// Chat-Fenster bekommt { stand, signale, angemeldet } und zeichnet nur.
const KE = require('../renderer/lib/kanal-ereignisse');
const { fehlerText } = require('./twitch-kanal-ereignisse');

const RUECKFALL_MS = 10000;
const MAX_PROTOKOLL_JE_TYP = 3;

function createSteuerung({
  api, hermes, getToken, getUserId, mitIntegrity, senden,
  diag = () => {}, jetzt = Date.now,
  setIntervalImpl = setInterval, clearIntervalImpl = clearInterval
}) {
  let lauf = 0;          // steigt bei jedem Kanalwechsel -> alte Antworten erkennen
  let kanal = null;      // { login, channelID }
  let zustand = null;
  let takt = null;
  let unbekanntGezaehlt = new Map();

  const angemeldet = () => !!getToken();

  function schicke(signale) {
    senden({ stand: zustand ? zustand.stand() : null, signale: signale || [], angemeldet: angemeldet() });
  }

  async function holeStart(nr, nurTeile) {
    const daten = await api.startzustand({ channelID: kanal.channelID, login: kanal.login, token: getToken() || null });
    if (nr !== lauf || !zustand) return null;
    if (daten.fehler && daten.fehler.length) diag('start-fehler', { kanal: kanal.login, fehler: daten.fehler });
    const teile = nurTeile
      ? Object.fromEntries(nurTeile.map((k) => [k, daten[k]]))
      : { pin: daten.pin, umfrage: daten.umfrage, vorhersage: daten.vorhersage };
    return teile;
  }

  function stoppeTakt() {
    if (takt !== null) { clearIntervalImpl(takt); takt = null; }
  }

  return {
    async kanalGeladen({ login, channelID }) {
      const nr = ++lauf;
      stoppeTakt();
      kanal = { login, channelID };
      zustand = KE.createZustand();
      unbekanntGezaehlt = new Map();
      const teile = await holeStart(nr);
      if (!teile) return;
      const signale = zustand.ausStart(teile, jetzt(), { erstes: true });
      diag('start', { kanal: login, pin: !!teile.pin, umfrage: !!teile.umfrage, vorhersage: !!teile.vorhersage });
      schicke(signale);
      const themen = [`pinned-chat-updates-v1.${channelID}`, `polls.${channelID}`, `predictions-channel-v1.${channelID}`];
      if (getToken()) {
        const uid = await getUserId();
        if (nr !== lauf) return;
        if (uid) themen.push(`predictions-user-v1.${uid}`, `community-points-user-v1.${uid}`);
      }
      hermes.setzeThemen(themen);
      takt = setIntervalImpl(async () => {
        try {
          const t = await holeStart(nr, ['pin', 'umfrage']);
          if (t) schicke(zustand.ausStart(t, jetzt(), { erstes: false }));
        } catch (e) { diag('rueckfall-fehler', { fehler: e.message }); }
      }, RUECKFALL_MS);
    },

    aus() {
      lauf++;
      stoppeTakt();
      kanal = null;
      zustand = null;
      hermes.setzeThemen([]);
      schicke([]);
    },

    hermesEreignis(thema, nutzlast) {
      if (!zustand) return;
      const r = zustand.ausHermes(thema, nutzlast, jetzt());
      if (r.unbekannt) {
        const typ = String(thema).split('.')[0] + ':' + (nutzlast && nutzlast.type);
        const n = (unbekanntGezaehlt.get(typ) || 0) + 1;
        unbekanntGezaehlt.set(typ, n);
        if (n <= MAX_PROTOKOLL_JE_TYP) diag('hermes-rahmen', { typ, nutzlast: JSON.stringify(nutzlast).slice(0, 1500) });
        return;
      }
      schicke(r.signale);
    },

    async hermesStatus(status) {
      diag('hermes-status', { status });
      if (status !== 'wieder-da' || !kanal) return;
      const nr = lauf;
      try {
        const teile = await holeStart(nr);
        if (teile) schicke(zustand.ausStart(teile, jetzt(), { erstes: false }));
      } catch (e) { diag('start-fehler', { fehler: [e.message] }); }
    },

    async setze({ outcomeID, points }) {
      const token = getToken();
      if (!token) return { ok: false, text: 'Zum Setzen anmelden' };
      if (!zustand) return { ok: false, text: 'Kein Live-Kanal' };
      const stand = zustand.stand();
      const v = stand.vorhersage;
      if (!v || v.status !== 'ACTIVE') return { ok: false, text: 'Einreichung ist vorbei' };
      if (!KE.setzbareOptionen(stand).includes(outcomeID)) return { ok: false, text: 'Nur noch auf deine Option möglich' };
      const b = KE.eigenerBetrag(String(points), stand.guthaben);
      if (b.fehler) return { ok: false, text: b.fehler };
      const nr = lauf;
      try {
        const r = await mitIntegrity((kopf) => api.setze({ token, eventID: v.id, outcomeID, points: b.betrag, kopf }));
        if (r && r.error) { diag('setzen-fehler', { grund: r.error }); return { ok: false, text: r.error }; }
        if (!r.ok) { diag('setzen-fehler', { code: r.code }); return { ok: false, text: fehlerText(r.code) }; }
        diag('setzen', { eventID: v.id, outcomeID, punkte: b.betrag });
        if (nr === lauf && zustand) schicke(zustand.eigenerTipp({ eventId: v.id, optionId: outcomeID, punkte: b.betrag }));
        return { ok: true, text: b.betrag.toLocaleString('de-DE') + ' gesetzt' };
      } catch (e) {
        diag('setzen-fehler', { fehler: e.message, integrity: !!e.integrity });
        return { ok: false, text: e.integrity ? 'Twitch hat die Prüfung abgelehnt, bitte nochmal' : e.message };
      }
    }
  };
}

module.exports = { createSteuerung };
```

Hinweis: `toLocaleString('de-DE')` liefert unter Node mit voller ICU `10.500`. Falls der Test auf einer Node ohne ICU `10,500` liefert: Node 20+ hat volle ICU, das Repo nutzt `toLocaleString('de-DE')` bereits in `chat.js`.

- [ ] **Step 4: Laufen lassen**

Run: `node --test test/kanal-ereignisse-steuerung.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/kanal-ereignisse-steuerung.js test/kanal-ereignisse-steuerung.test.js
git commit -m "feat: Steuerung fuer Pins/Umfragen/Vorhersagen mit Rueckfall-Takt und Setzen"
```

---

### Task 6: Effekt-Arten in der Theme-Runtime

**Files:**
- Modify: `renderer/lib/theme-runtime.js:294` (`ereignis`)
- Test: `test/theme-runtime.test.js` (anhaengen)

**Interfaces:**
- Produces: `rt.ereignis('ereignis-start' | 'tipp-verloren' | 'tipp-gewonnen', daten)` erreicht die Welt als `'punkte'` / `'punkte'` / `'kiste'`.

- [ ] **Step 1: Failing test anhaengen**

```js
test('neue Ereignis-Arten werden auf vorhandene Welt-Effekte abgebildet', async () => {
  const log = [];
  const a = aufbau({ welten: { sakura: protokollWelt(log) } });
  await a.rt.anwenden({ theme: 'sakura', effekte: 'normal' });
  a.rt.ereignis('ereignis-start', {});
  a.rt.ereignis('tipp-verloren', {});
  a.rt.ereignis('tipp-gewonnen', {});
  a.rt.ereignis('raid', {});
  assert.deepEqual(log.filter((l) => l.startsWith('ereignis:')),
    ['ereignis:punkte', 'ereignis:punkte', 'ereignis:kiste', 'ereignis:raid']);
});
```

- [ ] **Step 2: Laufen lassen, muss scheitern**

Run: `node --test test/theme-runtime.test.js`
Expected: FAIL (`ereignis:ereignis-start` statt `ereignis:punkte`)

- [ ] **Step 3: Implementierung** — in `theme-runtime.js` die Zeile

```js
      ereignis(art, daten) { rufe('ereignis', (w) => w.ereignis && w.ereignis(art, daten || {})); },
```

ersetzen durch

```js
      // Neue Arten (Vorhersagen/Umfragen) laufen ueber vorhandene Welt-Effekte,
      // damit alle Welten ohne Einzelarbeit reagieren.
      ereignis(art, daten) {
        const welt = ERSATZ_ART[art] || art;
        rufe('ereignis', (w) => w.ereignis && w.ereignis(welt, daten || {}));
      },
```

und oben in der Factory (vor `function createRuntime`) ergaenzen:

```js
  const ERSATZ_ART = { 'ereignis-start': 'punkte', 'tipp-verloren': 'punkte', 'tipp-gewonnen': 'kiste' };
```

- [ ] **Step 4: Laufen lassen**

Run: `node --test test/theme-runtime.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add renderer/lib/theme-runtime.js test/theme-runtime.test.js
git commit -m "feat: Effekt-Arten fuer Vorhersagen auf vorhandene Welt-Effekte abbilden"
```

---

### Task 7: Verdrahtung in main.js und preload.js

**Files:**
- Modify: `main.js` (Block nach `kisteEinloesen`; `submit-load` Live/VOD; `home-open`/`home-close`; Web-Login/Logout; `will-quit`)
- Modify: `preload.js:110` (drei Bruecken)
- Test: `npm test` (inkl. `test/preload-sandbox.test.js`)

**Interfaces:**
- Consumes: `createKanalEreignisseApi` (Task 4), `createHermes` (Task 3), `createSteuerung` (Task 5), `mitIntegrity` (Task 4).
- Produces (fuer Task 8/9): IPC `kanal-ereignisse` (Main → Chat, Nutzlast `{ stand, signale, angemeldet }`), `ipcMain.handle('vorhersage-setzen', { outcomeID, points }) → { ok, text }`, `ipcMain.on('link-oeffnen', url)`; Preload: `window.twitchDual.onKanalEreignisse(cb)`, `vorhersageSetzen(outcomeID, points)`, `linkOeffnen(url)`.

- [ ] **Step 1: Block in main.js** direkt nach der neuen `kisteEinloesen`-Funktion einfuegen:

```js
// --- Pins, Umfragen, Vorhersagen -----------------------------------------
// Spec: docs/superpowers/specs/2026-10-09-pins-umfragen-vorhersagen-design.md
// Ablauf in src/kanal-ereignisse-steuerung.js; hier nur Electron-Anschluss.
const { createKanalEreignisseApi } = require('./src/twitch-kanal-ereignisse');
const { createHermes } = require('./src/hermes');
const { createSteuerung } = require('./src/kanal-ereignisse-steuerung');

const kanalApi = createKanalEreignisseApi({});
let currentLiveChannelId = null; // Twitch-ID zu currentLiveChannel
let meineWebId = null;           // Nutzer-ID des Web-Logins, zwischengespeichert

async function webNutzerId() {
  if (!webTokenNutzbar()) return null;
  if (!meineWebId) {
    try { meineWebId = await kanalApi.meineId(webToken); } catch (e) { return null; }
  }
  return meineWebId;
}

const kanalDiag = (ereignis, detail) => diagLog.melde('kanal-ereignisse', ereignis, detail);
let kanalSteuerung = null;
const hermes = createHermes({
  getToken: () => (webTokenNutzbar() ? webToken : null),
  onEreignis: (thema, nutzlast) => kanalSteuerung.hermesEreignis(thema, nutzlast),
  onStatus: (status) => { kanalSteuerung.hermesStatus(status).catch(() => {}); },
  diag: kanalDiag
});
kanalSteuerung = createSteuerung({
  api: kanalApi,
  hermes,
  getToken: () => (webTokenNutzbar() ? webToken : null),
  getUserId: webNutzerId,
  mitIntegrity,
  senden: (nutzlast) => broadcast('kanal-ereignisse', nutzlast),
  diag: kanalDiag
});

function kanalEreignisseStarten() {
  if (!currentLiveChannel || !currentLiveChannelId) { kanalSteuerung.aus(); return; }
  kanalSteuerung.kanalGeladen({ login: currentLiveChannel, channelID: currentLiveChannelId })
    .catch((e) => kanalDiag('start-fehler', { fehler: [e.message] }));
}

ipcMain.handle('vorhersage-setzen', (_e, { outcomeID, points } = {}) =>
  kanalSteuerung.setze({ outcomeID: String(outcomeID || ''), points: Number(points) }));

// Links aus der Pin-Leiste: nur https, immer im Systembrowser.
ipcMain.on('link-oeffnen', (_e, url) => {
  if (/^https:\/\//.test(String(url))) shell.openExternal(String(url));
});
```

- [ ] **Step 2: Ausloeser einhaengen**

In `submit-load`, Live-Zweig, direkt nach `currentLiveChannel = user.login;`:

```js
      currentLiveChannelId = user.id;
      kanalEreignisseStarten();
```

Im VOD-Zweig direkt nach `currentLiveChannel = null;`:

```js
    currentLiveChannelId = null;
    kanalSteuerung.aus();
```

In `ipcMain.on('home-open', …)` als letzte Zeile: `kanalSteuerung.aus();`
In `ipcMain.on('home-close', …)` als letzte Zeile: `kanalEreignisseStarten();`

Im Web-Login-Erfolg (`onToken`, nach `pointsState.zuruecksetzen();`) und in `web-login-logout` (nach `webToken = null;`):

```js
        meineWebId = null;
        kanalEreignisseStarten(); // neu abonnieren: mit/ohne Nutzer-Themen
```

(Im Logout-Handler ohne die fuehrenden Leerzeichen der inneren Ebene.)

Im App-Ende: `app.on('will-quit', () => { kanalSteuerung.aus(); });` — falls es schon einen `will-quit`-Handler gibt, die Zeile dort hinzufuegen (`grep -n "will-quit" main.js`).

- [ ] **Step 3: Preload** — in `preload.js` nach `onPointsUpdate: …,` einfuegen:

```js
    // Pins/Umfragen/Vorhersagen: fertiger Stand aus dem Main, Setzen per
    // invoke. Der Token bleibt im Main.
    onKanalEreignisse: (cb) => { ipcRenderer.on('kanal-ereignisse', (_e, p) => cb(p)); },
    vorhersageSetzen: (outcomeID, points) => ipcRenderer.invoke('vorhersage-setzen', { outcomeID, points }),
    linkOeffnen: (url) => ipcRenderer.send('link-oeffnen', url),
```

- [ ] **Step 4: Tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Rauchtest Start** — App starten und nach 20 s beenden, nur auf Absturz pruefen (kein Anschauen der Oberflaeche):

```bash
npx electron . --remote-debugging-port=9333
```

Erwartung: kein `ReferenceError`/`TypeError` in der Konsole beim Start. Danach die TwitchDual-Electron-Prozesse beenden:
`Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | ? CommandLine -match TwitchDual | Stop-Process`

- [ ] **Step 6: Commit**

```bash
git add main.js preload.js
git commit -m "feat: Pins/Umfragen/Vorhersagen in main und preload verdrahten"
```

---

### Task 8: Chat-Fenster — Pin-Leiste und Ereignis-Karten (Anzeige)

**Files:**
- Create: `renderer/chat/ereignis-karten.js`
- Modify: `renderer/chat/index.html` (Container + Script-Tags), `renderer/chat/chat.css` (Stile), `renderer/chat/chat.js` (Anschluss)

**Interfaces:**
- Consumes: `KanalEreignisse` (global, Task 1/2), `window.twitchDual.onKanalEreignisse`, `linkOeffnen`, `startWebLogin` (Task 7); in chat.js vorhanden: `themeRuntime`, `zeigeZuwachs({ quelle, betrag })`, `punkteUrsprung()`.
- Produces: `EreignisKarten.create({ doc, wirt, KE, setzen, linkOeffnen, anmelden, effekt, jetzt })` → `{ zeige({ stand, signale, angemeldet }) }`. `setzen(outcomeID, points) → Promise<{ ok, text }>` wird in Task 9 genutzt.

- [ ] **Step 1: Container und Skripte** — in `renderer/chat/index.html` direkt vor `<div id="messages"></div>`:

```html
  <div id="kanal-ereignisse"></div>
```

und vor `<script src="chat.js"></script>`:

```html
  <script src="../lib/kanal-ereignisse.js"></script>
  <script src="ereignis-karten.js"></script>
```

- [ ] **Step 2: `renderer/chat/ereignis-karten.js`**

```js
// Pin-Leiste + Karten fuer Umfrage/Vorhersage. Bekommt fertige Staende aus
// dem Main (kanal-ereignisse), zeichnet nur. Spec:
// docs/superpowers/specs/2026-10-09-pins-umfragen-vorhersagen-design.md
(function (root) {
  const ZU_NACH_ENDE_MS = 30000;

  function create({ doc, wirt, KE, setzen, linkOeffnen, anmelden, effekt, jetzt = Date.now }) {
    let stand = null;
    let angemeldet = false;
    let pinWeg = null;            // ID des weggeklickten Pins
    const eingeklappt = new Set(); // Karten-IDs, die der Nutzer zugeklappt hat
    const endeSeit = new Map();    // Karten-ID -> Zeitpunkt, ab dem sie beendet ist
    let pinOffen = false;
    let auswahl = null;            // { optionId, betrag } fuer Task 9
    let meldung = null;            // { text, ok } Rueckmeldung beim Setzen

    const el = (tag, cls, text) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };

    // Text mit klickbaren https-Links (keine HTML-Einschleusung: nur Textknoten).
    function textMitLinks(text) {
      const f = doc.createDocumentFragment();
      const teile = String(text).split(/(https:\/\/\S+)/g);
      for (const t of teile) {
        if (/^https:\/\//.test(t)) {
          const a = el('a', 'ke-link', t);
          a.href = '#';
          a.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); linkOeffnen(t); });
          f.appendChild(a);
        } else if (t) f.appendChild(doc.createTextNode(t));
      }
      return f;
    }

    // Einblende-Animation nur beim ersten Auftauchen einer ID - gezeichnet wird
    // bis zu 1x pro Sekunde neu (Hermes event-updated), sonst flackert es.
    const gesehen = new Set();
    function neuKlasse(id) {
      if (gesehen.has(id)) return '';
      gesehen.add(id);
      return ' neu';
    }

    function pinLeiste(p) {
      const b = el('div', 'ke-pin' + (pinOffen ? ' offen' : '') + neuKlasse(p.id));
      b.appendChild(el('span', 'ke-pin-icon', '📌'));
      const t = el('div', 'ke-pin-text');
      const name = el('span', 'ke-pin-name', p.absender.name + ': ');
      if (p.absender.farbe) name.style.color = p.absender.farbe;
      t.appendChild(name);
      t.appendChild(textMitLinks(p.text));
      if (pinOffen && p.angeheftetVon) t.appendChild(el('div', 'ke-pin-von', 'angeheftet von ' + p.angeheftetVon));
      b.appendChild(t);
      const x = el('button', 'ke-x', '✕');
      x.title = 'Ausblenden';
      x.addEventListener('click', (ev) => { ev.stopPropagation(); pinWeg = p.id; zeichne(); });
      b.appendChild(x);
      b.addEventListener('click', () => { pinOffen = !pinOffen; zeichne(); });
      return b;
    }

    // bis: Zeitpunkt fuer den Countdown (ms) oder null fuer festen Text.
    function kopf(karte, id, titel, untertitel, bis) {
      const k = el('div', 'ke-kopf');
      k.appendChild(el('span', 'ke-titel', titel));
      const zeit = el('span', 'ke-zeit', untertitel);
      if (bis) zeit.dataset.bis = String(bis);
      k.appendChild(zeit);
      k.addEventListener('click', () => {
        if (eingeklappt.has(id)) eingeklappt.delete(id); else eingeklappt.add(id);
        zeichne();
      });
      karte.appendChild(k);
    }

    function balken(anteil, farbe) {
      const b = el('div', 'ke-balken');
      const f = el('div', 'ke-balken-fuell' + (farbe ? ' ' + farbe.toLowerCase() : ''));
      f.style.width = Math.round(anteil * 1000) / 10 + '%';
      b.appendChild(f);
      return b;
    }

    function umfrageKarte(u) {
      const karte = el('div', 'ke-karte ke-umfrage' + (eingeklappt.has(u.id) ? ' zu' : '') + neuKlasse(u.id));
      const laeuft = u.status === 'ACTIVE';
      kopf(karte, u.id, '📊 ' + u.titel, laeuft ? KE.countdownText(KE.restMs(u.endetUm, jetzt())) : 'beendet',
        laeuft ? u.endetUm : null);
      if (eingeklappt.has(u.id)) return karte;
      const max = Math.max(...u.optionen.map((o) => o.stimmen));
      for (const o of u.optionen) {
        const z = el('div', 'ke-option' + (u.status !== 'ACTIVE' && o.stimmen === max ? ' gewinner' : ''));
        const zeile = el('div', 'ke-zeile');
        zeile.appendChild(el('span', 'ke-opt-titel', o.titel));
        zeile.appendChild(el('span', 'ke-opt-wert', Math.round(o.anteil * 100) + ' % · ' + o.stimmen.toLocaleString('de-DE')));
        z.appendChild(zeile);
        z.appendChild(balken(o.anteil));
        karte.appendChild(z);
      }
      if (u.status === 'ACTIVE') karte.appendChild(el('div', 'ke-hinweis', 'Abstimmen auf twitch.tv'));
      return karte;
    }

    function vorhersageKarte(v) {
      const karte = el('div', 'ke-karte ke-vorhersage' + (eingeklappt.has(v.id) ? ' zu' : '') + neuKlasse(v.id));
      const status = v.status === 'ACTIVE' ? KE.countdownText(KE.restMs(v.einreichungBis, jetzt()))
        : v.status === 'LOCKED' ? 'Warte auf Ergebnis'
        : v.status === 'CANCELED' ? 'Abgebrochen – Punkte zurück'
        : 'Ergebnis';
      kopf(karte, v.id, '🔮 ' + v.titel, status, v.status === 'ACTIVE' ? v.einreichungBis : null);
      if (eingeklappt.has(v.id)) return karte;
      const t = stand.meinTipp && stand.meinTipp.eventId === v.id ? stand.meinTipp : null;
      for (const o of v.optionen) {
        const z = el('div', 'ke-option' + (v.gewinnerId === o.id ? ' gewinner' : '') + (t && t.optionId === o.id ? ' meins' : ''));
        z.dataset.option = o.id;
        const zeile = el('div', 'ke-zeile');
        zeile.appendChild(el('span', 'ke-opt-titel ' + String(o.farbe || '').toLowerCase(), o.titel));
        zeile.appendChild(el('span', 'ke-opt-wert', Math.round(o.anteil * 100) + ' %'));
        z.appendChild(zeile);
        z.appendChild(balken(o.anteil, o.farbe));
        const info = el('div', 'ke-info');
        info.textContent = o.punkte.toLocaleString('de-DE') + ' · ' + KE.quoteText(o.quote) + ' · ' +
          o.nutzer.toLocaleString('de-DE') + ' 👤 · Top ' + o.topEinsatz.toLocaleString('de-DE');
        z.appendChild(info);
        if (t && t.optionId === o.id) z.appendChild(el('div', 'ke-meins', t.punkte.toLocaleString('de-DE') + ' gesetzt'));
        karte.appendChild(z);
      }
      if (root.EreignisKartenSetzen) root.EreignisKartenSetzen.bediene({ doc, karte, v, stand, angemeldet, KE, el, auswahl: () => auswahl, waehle, sende, meldung: () => meldung, anmelden });
      return karte;
    }

    // Fuer Task 9 (Setzen-Bedienung).
    function waehle(a) { auswahl = a; meldung = null; zeichne(); }
    async function sende() {
      if (!auswahl) return;
      const a = auswahl;
      meldung = { text: 'Setze …', ok: true };
      zeichne();
      const r = await setzen(a.optionId, a.betrag);
      meldung = { text: r.text, ok: r.ok };
      if (r.ok) auswahl = null;
      zeichne();
    }

    function sichtbar(eintrag, istEnde) {
      if (!eintrag) return false;
      if (!istEnde) { endeSeit.delete(eintrag.id); return true; }
      if (!endeSeit.has(eintrag.id)) endeSeit.set(eintrag.id, jetzt());
      return jetzt() - endeSeit.get(eintrag.id) < ZU_NACH_ENDE_MS;
    }

    function zeichne() {
      // Tippt der Nutzer gerade einen eigenen Betrag, ueberlebt das den Neuaufbau.
      const a = doc.activeElement;
      const fokus = a && a.classList && a.classList.contains('ke-feld')
        ? { option: a.dataset.option, wert: a.value } : null;
      wirt.textContent = '';
      if (!stand) return;
      if (stand.pin && stand.pin.id !== pinWeg) wirt.appendChild(pinLeiste(stand.pin));
      const u = stand.umfrage;
      if (sichtbar(u, u && u.status !== 'ACTIVE')) wirt.appendChild(umfrageKarte(u));
      const v = stand.vorhersage;
      if (sichtbar(v, v && (v.status === 'RESOLVED' || v.status === 'CANCELED'))) wirt.appendChild(vorhersageKarte(v));
      if (fokus) {
        const f = [...wirt.querySelectorAll('.ke-feld')].find((x) => x.dataset.option === fokus.option);
        if (f) { f.value = fokus.wert; f.focus(); }
      }
    }

    // Countdown laeuft ohne Neuaufbau weiter (nur die Zeit-Texte).
    setInterval(() => {
      for (const s of wirt.querySelectorAll('.ke-zeit[data-bis]')) {
        s.textContent = KE.countdownText(KE.restMs(Number(s.dataset.bis), jetzt()));
      }
    }, 1000);

    return {
      zeige(p) {
        const altVorhersage = stand && stand.vorhersage && stand.vorhersage.id;
        stand = p && p.stand;
        angemeldet = !!(p && p.angemeldet);
        if (!stand || !stand.vorhersage || stand.vorhersage.id !== altVorhersage) { auswahl = null; meldung = null; }
        for (const s of (p && p.signale) || []) {
          if (s.art === 'ereignis-start') eingeklappt.delete(s.id); // neu -> aufklappen
          effekt(s);
        }
        zeichne();
      }
    };
  }

  root.EreignisKarten = { create };
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 3: Anschluss in `chat.js`** — am Ende der Datei anhaengen:

```js
// --- Pins, Umfragen, Vorhersagen (fertiger Stand aus dem Main) -------------
const ereignisKarten = EreignisKarten.create({
  doc: document,
  wirt: document.getElementById('kanal-ereignisse'),
  KE: KanalEreignisse,
  setzen: (outcomeID, points) => window.twitchDual.vorhersageSetzen(outcomeID, points),
  linkOeffnen: (url) => window.twitchDual.linkOeffnen(url),
  anmelden: () => window.twitchDual.startWebLogin(),
  effekt: (s) => {
    // Gewinn: grosser Effekt + "+X" am Chip ueber denselben Weg wie die Kiste.
    if (s.art === 'tipp-gewonnen') zeigeZuwachs({ quelle: 'kiste', betrag: s.betrag });
    else themeRuntime.ereignis(s.art, { ursprung: punkteUrsprung() });
  }
});
window.twitchDual.onKanalEreignisse((p) => ereignisKarten.zeige(p));
```

- [ ] **Step 4: Stile** — ans Ende von `renderer/chat/chat.css`:

```css
/* --- Pins, Umfragen, Vorhersagen ------------------------------------------ */
#kanal-ereignisse { display: flex; flex-direction: column; gap: 6px; padding: 0 8px; }
#kanal-ereignisse:empty { display: none; }
#kanal-ereignisse > :first-child { margin-top: 6px; }
.ke-pin, .ke-karte {
  background: var(--panel); border: 1px solid var(--accent-border); border-radius: 8px;
  box-shadow: 0 0 12px var(--accent-glow);
}
.ke-pin.neu, .ke-karte.neu { animation: ke-rein .35s cubic-bezier(.2, .9, .3, 1.2); }
@keyframes ke-rein { from { opacity: 0; transform: translateY(-8px) scale(.97); } to { opacity: 1; transform: none; } }
.ke-pin { display: flex; gap: 6px; align-items: flex-start; padding: 5px 8px; cursor: pointer; font-size: .9em; }
.ke-pin-text { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ke-pin.offen .ke-pin-text { white-space: normal; }
.ke-pin-name { font-weight: 600; }
.ke-pin-von { color: var(--muted); font-size: .85em; margin-top: 2px; }
.ke-link { color: var(--accent-title); }
.ke-x { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 0 2px; }
.ke-x:hover { color: var(--text); }
.ke-karte { padding: 6px 8px 8px; }
.ke-kopf { display: flex; justify-content: space-between; gap: 8px; cursor: pointer; font-weight: 600; }
.ke-titel { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--accent-title); }
.ke-zeit { font-family: var(--mono); color: var(--muted); white-space: nowrap; }
.ke-karte.zu .ke-kopf { margin: 0; }
.ke-option { margin-top: 6px; }
.ke-option.gewinner .ke-opt-titel::after { content: ' 🏆'; }
.ke-zeile { display: flex; justify-content: space-between; gap: 8px; font-size: .9em; }
.ke-opt-wert, .ke-info { font-family: var(--mono); color: var(--muted); }
.ke-info { font-size: .8em; margin-top: 2px; }
.ke-opt-titel.blue { color: #4fa3ff; }
.ke-opt-titel.pink { color: #ff4fa3; }
.ke-balken { height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; margin-top: 3px; }
.ke-balken-fuell { height: 100%; background: var(--accent); border-radius: 3px; transition: width .6s cubic-bezier(.2, .9, .3, 1); }
.ke-balken-fuell.blue { background: #4fa3ff; }
.ke-balken-fuell.pink { background: #ff4fa3; }
.ke-meins { font-size: .85em; color: var(--accent-title); margin-top: 2px; }
.ke-hinweis { color: var(--muted); font-size: .8em; margin-top: 6px; }
```

- [ ] **Step 5: Tests + Rauchtest**

Run: `npm test` → PASS.
Dann App wie in Task 7 Step 5 starten, einen Live-Kanal mit Pin laden (z. B. aus `docs/TODO.md` bekannt: eliasn97, falls live) und mit `node tools/cdp-eval.js chat "document.getElementById('kanal-ereignisse').children.length"` pruefen, dass ≥ 1 Element da ist. Keine Screenshots — anschauen macht Janis.

- [ ] **Step 6: Commit**

```bash
git add renderer/chat/ereignis-karten.js renderer/chat/index.html renderer/chat/chat.css renderer/chat/chat.js
git commit -m "feat: Pin-Leiste und Karten fuer Umfragen und Vorhersagen im Chat"
```

---

### Task 9: Chat-Fenster — Setzen mit Schnell-Chips

**Files:**
- Create: `renderer/chat/ereignis-setzen.js`
- Modify: `renderer/chat/index.html` (Script-Tag), `renderer/chat/chat.css`

**Interfaces:**
- Consumes: Haken `root.EreignisKartenSetzen.bediene({ doc, karte, v, stand, angemeldet, KE, el, auswahl, waehle, sende, meldung, anmelden })` aus Task 8; `KE.CHIPS`, `KE.chipBetrag`, `KE.eigenerBetrag`, `KE.setzbareOptionen`.
- Produces: Bedienung in der Vorhersage-Karte: Chips je setzbarer Option, eigenes Feld, Bestaetigungsknopf „N auf X setzen", Rueckmeldung.

- [ ] **Step 1: Script-Tag** in `index.html` direkt nach `ereignis-karten.js`:

```html
  <script src="ereignis-setzen.js"></script>
```

- [ ] **Step 2: `renderer/chat/ereignis-setzen.js`**

```js
// Setzen-Bedienung fuer die Vorhersage-Karte (ereignis-karten.js ruft
// EreignisKartenSetzen.bediene). Erster Klick waehlt, zweiter bestaetigt.
(function (root) {
  function bediene({ doc, karte, v, stand, angemeldet, KE, el, auswahl, waehle, sende, meldung, anmelden }) {
    if (v.status !== 'ACTIVE') return;
    const box = el('div', 'ke-setzen');
    if (!angemeldet) {
      const b = el('button', 'ke-anmelden', 'Zum Setzen anmelden');
      b.addEventListener('click', anmelden);
      box.appendChild(b);
      karte.appendChild(box);
      return;
    }
    const setzbar = KE.setzbareOptionen(stand);
    const a = auswahl();
    for (const o of v.optionen) {
      const reihe = el('div', 'ke-chips' + (setzbar.includes(o.id) ? '' : ' aus'));
      reihe.appendChild(el('span', 'ke-chips-name ' + String(o.farbe || '').toLowerCase(), o.titel));
      for (const art of KE.CHIPS) {
        const betrag = KE.chipBetrag(art, stand.guthaben);
        const label = art === 'alles' ? 'Alles' : art.endsWith('%') ? art : Number(art).toLocaleString('de-DE');
        const c = el('button', 'ke-chip', label);
        c.disabled = !setzbar.includes(o.id) || betrag === null;
        if (a && a.optionId === o.id && a.betrag === betrag) c.classList.add('gewaehlt');
        c.addEventListener('click', () => waehle({ optionId: o.id, betrag }));
        reihe.appendChild(c);
      }
      const feld = el('input', 'ke-feld');
      feld.type = 'text';
      feld.inputMode = 'numeric';
      feld.placeholder = 'eigener';
      feld.dataset.option = o.id; // damit zeichne() Fokus und Text wiederherstellt
      feld.disabled = !setzbar.includes(o.id);
      feld.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        const r = KE.eigenerBetrag(feld.value, stand.guthaben);
        if (r.fehler) { feld.classList.add('falsch'); feld.title = r.fehler; return; }
        waehle({ optionId: o.id, betrag: r.betrag });
      });
      reihe.appendChild(feld);
      box.appendChild(reihe);
    }
    if (a) {
      const opt = v.optionen.find((o) => o.id === a.optionId);
      const los = el('button', 'ke-los', a.betrag.toLocaleString('de-DE') + ' auf ' + (opt ? opt.titel : '?') + ' setzen');
      los.addEventListener('click', sende);
      box.appendChild(los);
    }
    const m = meldung();
    if (m) box.appendChild(el('div', 'ke-meldung' + (m.ok ? '' : ' fehler'), m.text));
    if (typeof stand.guthaben === 'number') {
      box.appendChild(el('div', 'ke-guthaben', 'Guthaben ' + stand.guthaben.toLocaleString('de-DE')));
    }
    karte.appendChild(box);
  }
  root.EreignisKartenSetzen = { bediene };
})(typeof self !== 'undefined' ? self : this);
```

Hinweis: `stand.guthaben` kommt sonst nur ueber Hermes `points-spent` und waere bis zur ersten Ausgabe `null` → alle Chips deaktiviert. Step 3 speist deshalb das Guthaben aus dem 15-s-Punkte-Takt ein.

- [ ] **Step 3: Guthaben aus dem Punkte-Takt** — `src/kanal-ereignisse-steuerung.js` um eine Methode erweitern und testen.

Test anhaengen an `test/kanal-ereignisse-steuerung.test.js`:

```js
test('guthaben aus dem Punkte-Takt landet im Stand', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  a.s.guthaben(28446);
  assert.equal(a.gesendet.at(-1).stand.guthaben, 28446);
  a.s.guthaben(28446);
  assert.equal(a.gesendet.filter((g) => g.stand && g.stand.guthaben === 28446).length, 1, 'unveraendert -> nicht erneut senden');
});
```

In `renderer/lib/kanal-ereignisse.js` im Zustand-Objekt (neben `eigenerTipp`):

```js
      setzeGuthaben(wert) {
        if (typeof wert !== 'number' || wert === z.guthaben) return false;
        z.guthaben = wert;
        return true;
      },
```

In `src/kanal-ereignisse-steuerung.js` im Rueckgabe-Objekt:

```js
    guthaben(wert) {
      if (zustand && zustand.setzeGuthaben(wert)) schicke([]);
    },
```

In `main.js` in `punkteTick()` direkt vor `broadcast('points-update', { balance: stand, …`:

```js
      kanalSteuerung.guthaben(stand);
```

Run: `node --test test/kanal-ereignisse-steuerung.test.js` → PASS.

- [ ] **Step 4: Stile** ans Ende von `chat.css`:

```css
.ke-setzen { margin-top: 8px; display: flex; flex-direction: column; gap: 5px; }
.ke-chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.ke-chips.aus { opacity: .4; }
.ke-chips-name { font-size: .8em; min-width: 52px; font-weight: 600; }
.ke-chips-name.blue { color: #4fa3ff; }
.ke-chips-name.pink { color: #ff4fa3; }
.ke-chip {
  font-family: var(--mono); font-size: .8em; padding: 2px 7px; border-radius: 10px;
  background: var(--hover); color: var(--text); border: 1px solid var(--line); cursor: pointer;
  transition: transform .12s, border-color .12s;
}
.ke-chip:hover:not(:disabled) { border-color: var(--accent); transform: translateY(-1px); }
.ke-chip:disabled { opacity: .35; cursor: default; }
.ke-chip.gewaehlt { border-color: var(--accent); box-shadow: 0 0 8px var(--accent-glow); }
.ke-feld {
  width: 70px; font-family: var(--mono); font-size: .8em; padding: 2px 6px; border-radius: 10px;
  background: var(--bg); color: var(--text); border: 1px solid var(--line);
}
.ke-feld.falsch { border-color: #ff5a5a; }
.ke-los, .ke-anmelden {
  align-self: stretch; padding: 5px; border-radius: 6px; border: 0; cursor: pointer; font-weight: 600;
  background: var(--accent); color: #0b0b11; animation: ke-puls 1.6s ease-in-out infinite;
}
@keyframes ke-puls { 50% { box-shadow: 0 0 14px var(--accent-glow); } }
.ke-meldung { font-size: .85em; color: var(--accent-title); }
.ke-meldung.fehler { color: #ff7a7a; }
.ke-guthaben { font-family: var(--mono); font-size: .75em; color: var(--muted); text-align: right; }
```

- [ ] **Step 5: Tests + Rauchtest**

Run: `npm test` → PASS. App starten (Task 7 Step 5), pruefen, dass beim Start keine Fehler in der Konsole stehen.

- [ ] **Step 6: Commit**

```bash
git add renderer/chat/ereignis-setzen.js renderer/chat/index.html renderer/chat/chat.css renderer/lib/kanal-ereignisse.js src/kanal-ereignisse-steuerung.js test/kanal-ereignisse-steuerung.test.js main.js
git commit -m "feat: Setzen auf Vorhersagen mit Schnell-Chips und Bestaetigung"
```

---

### Task 10: Doku und Uebergabe zum Live-Test

**Files:**
- Modify: `docs/TODO.md` (Abschnitt „Angepinnte Nachrichten, Umfragen, Vorhersagen" um Umsetzungsstand ergaenzen)

- [ ] **Step 1: TODO ergaenzen** — am Ende des Mess-Abschnitts:

```markdown
- **Umgesetzt (Branch `feat/kanal-ereignisse`, kein Release):** Pin-Leiste,
  Umfrage-/Vorhersage-Karten, Setzen mit Schnell-Chips, Effekte ueber
  `theme-runtime` (`ereignis-start`/`tipp-verloren` → punkte, `tipp-gewonnen` →
  Kiste + „+X"). Zustand im Main (`src/kanal-ereignisse-steuerung.js`).
  Diagnose-Bereich `kanal-ereignisse` protokolliert die ersten 3 unbekannten
  Hermes-Rahmen je Typ → nach dem Live-Test auswerten und in
  `renderer/lib/kanal-ereignisse.js` `ausHermes` nachziehen (Pin, Umfrage,
  Sperren/Aufloesen, `prediction-result`).
- Bekannte Luecke: eigener Tipp nach App-Neustart unbekannt (`self.recentPredictions`
  im Startzustand ungemessen) → Gegen-Option dann nicht ausgegraut; Twitch lehnt
  ab, die Karte zeigt den Fehlertext.
- Naechster Schritt: Umfrage-Abstimmen messen (laufende Umfrage, Dev-App,
  `node tools/cdp-mitschnitt.js <kanal>`), dann Knopf einbauen.
```

- [ ] **Step 2: Gesamttest**

Run: `npm test`
Expected: PASS, Anzahl = 432 + neue Tests

- [ ] **Step 3: Commit und Push**

```bash
git add docs/TODO.md
git commit -m "docs: Umsetzungsstand Pins/Umfragen/Vorhersagen"
git push
```

- [ ] **Step 4: Uebergabe** — Janis bitten: Diagnose-Schalter an, Dev-App (`npm start`, installierte App vorher schliessen) mit (1) Pin-Kanal, (2) laufender Umfrage, (3) Vorhersage mit kleinem Einsatz testen; danach `diagnose.log` auswerten.
