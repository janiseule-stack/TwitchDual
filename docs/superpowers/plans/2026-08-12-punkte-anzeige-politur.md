# Punkte-Anzeige Politur — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Kanalpunkte-Ecke im Chat-Footer zeigt sichtbar, dass und wieviel dazukommt, und traegt statt eines Emojis ein kanaleigenes bzw. farblich passendes Symbol.

**Architecture:** Reine Rechenlogik wandert in zwei DOM-freie UMD-Module unter `renderer/lib/` (`points-state.js` erweitert, `points-icon.js` neu) und wird mit `node:test` abgedeckt. `main.js` verdrahtet nur; der Renderer stellt dar. Kein neuer Netzverkehr — Symbol und Name kommen aus der bestehenden Kontext-Abfrage, der Zugewinn aus der Differenz zweier Staende.

**Tech Stack:** Electron, reines JS ohne Build-Schritt, `node --test` (Node-eigener Runner), UMD-Module (Browser via `<script>`, Node via `require`).

## Global Constraints

- **Sprache:** Kommentare, Commit-Botschaften und Testnamen auf Deutsch, ohne Umlaute im Quelltext (`ae/oe/ue/ss`) — wie im gesamten Bestand. Nutzersichtbare Texte mit korrekten Umlauten.
- **Kein `prefers-reduced-motion`-Zweig.** Auf dem Zielrechner sind Windows-Animationseffekte systemweit aus; der Zweig wuerde die neuen Animationen dauerhaft stumm schalten. Projektweite Entscheidung.
- **Nichts scheitert still.** Jeder Fehlerpfad landet sichtbar in der Oberflaeche, nicht nur in der Konsole.
- **Preload ist sandboxed** — kein `fs`, kein `require` im Renderer ausser den `<script>`-Libs.
- **Tests muessen vor und nach jeder Aufgabe gruen sein:** `npm test`.
- **UMD-Muster** fuer neue Libs exakt wie `renderer/lib/points-state.js:10-16`.

---

## Vorbedingung

- [ ] **Schritt 0: Ausgangslage gruen**

```bash
cd C:/Users/janis/TwitchDual
npm test
git status --short
```

Erwartet: alle Tests gruen. Arbeitsbaum sauber bis auf die beiden Dokumente
`docs/superpowers/specs/2026-08-12-punkte-anzeige-politur-design.md` und
`docs/superpowers/plans/2026-08-12-punkte-anzeige-politur.md` (noch nicht
committet). Diese beiden zuerst committen:

```bash
git add docs/superpowers/specs/2026-08-12-punkte-anzeige-politur-design.md docs/superpowers/plans/2026-08-12-punkte-anzeige-politur.md
git commit -m "docs: Entwurf und Plan fuer die Punkte-Anzeige"
```

---

### Task 1: `claim()` reicht den Stand nach dem Einloesen durch

**Warum zuerst:** `main.js` meldet heute nach einem Kisten-Claim den Stand von
*vor* dem Claim (`main.js:478-510`) — die Anzeige hinkt bis zu 15 s hinterher.
Die Mutation fragt `currentPoints` bereits ab (`src/twitch-points.js:19`),
Zeile 95 wirft den Wert weg. Er wird fuer den Kistenbetrag ohnehin gebraucht.

**Files:**
- Modify: `src/twitch-points.js:91-96`
- Test: `test/twitch-points.test.js`

**Interfaces:**
- Consumes: nichts
- Produces: `claim(token, channelID, claimID, extraHeaders)` liefert
  `{ ok: boolean, error: string|null, currentPoints: number|null }`

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

An `test/twitch-points.test.js` anhaengen. Das Muster fuer den fetch-Ersatz aus
den bestehenden Tests derselben Datei uebernehmen — zuerst die Datei lesen und
den dortigen Stil spiegeln (Hilfsfunktion fuer `fetchImpl`, Aufbau der
Antwort). Falls dort ein Helfer existiert, diesen benutzen statt einen zweiten
zu bauen.

```js
test('claim reicht currentPoints durch', async () => {
  const api = createPointsApi({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: { claimCommunityPoints: { currentPoints: 1250, error: null } } })
    })
  });
  const r = await api.claim('tok', '123', 'claim-1', {});
  assert.equal(r.ok, true);
  assert.equal(r.currentPoints, 1250);
});

test('claim ohne currentPoints liefert null statt zu werfen', async () => {
  const api = createPointsApi({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: { claimCommunityPoints: { error: null } } })
    })
  });
  const r = await api.claim('tok', '123', 'claim-1', {});
  assert.equal(r.ok, true);
  assert.equal(r.currentPoints, null);
});

test('claim mit Fehler liefert ok=false und keinen Stand', async () => {
  const api = createPointsApi({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: { claimCommunityPoints: { error: { code: 'ALREADY_CLAIMED' } } } })
    })
  });
  const r = await api.claim('tok', '123', 'claim-1', {});
  assert.equal(r.ok, false);
  assert.equal(r.error, 'ALREADY_CLAIMED');
  assert.equal(r.currentPoints, null);
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestaetigen**

```bash
npm test -- --test-name-pattern="currentPoints"
```

Erwartet: FAIL — `r.currentPoints` ist `undefined`, nicht `1250`.

- [ ] **Schritt 3: Umsetzen**

`src/twitch-points.js`, Methode `claim` ersetzen:

```js
    async claim(token, channelID, claimID, extraHeaders) {
      const d = await ruf(token, M_CLAIM, { input: { channelID, claimID } }, extraHeaders);
      const r = d && d.claimCommunityPoints;
      const fehler = r && r.error ? r.error.code : null;
      // currentPoints ist der Stand NACH dem Einloesen. Die Kontext-Abfrage
      // liefert den Stand davor - die Differenz ist der Kistenbetrag. Bei
      // einem Fehlschlag ist der Wert bedeutungslos, deshalb null.
      const stand = !fehler && r && typeof r.currentPoints === 'number' ? r.currentPoints : null;
      return { ok: !fehler, error: fehler, currentPoints: stand };
    },
```

- [ ] **Schritt 4: Tests laufen lassen**

```bash
npm test
```

Erwartet: alles gruen, auch die bestehenden `twitch-points`-Tests.

- [ ] **Schritt 5: Commit**

```bash
git add src/twitch-points.js test/twitch-points.test.js
git commit -m "fix: claim liefert den Stand nach dem Einloesen zurueck"
```

---

### Task 2: `context()` liefert Symbol und Name der Kanalpunkte

**Files:**
- Modify: `src/twitch-points.js:11-16` (`Q_CONTEXT`) und `src/twitch-points.js:75-89` (`context`)
- Test: `test/twitch-points.test.js`

**Interfaces:**
- Consumes: nichts
- Produces: `context(token, channelLogin)` liefert zusaetzlich zu den
  bestehenden Feldern `punkteName: string|null` und `iconUrl: string|null`

**Belegt am 2026-08-12** gegen die echte API: Papaplatte liefert
`{name: "Papapoints", image: {url: "https://static-cdn.jtvnw.net/channel-points-icons/…"}}`,
xQc/shroud/Knossi liefern fuer beide `null`. Das Feld ist ohne Anmeldung
abrufbar, kostet also nichts extra in derselben Abfrage.

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```js
test('context liefert Name und Symbol der Kanalpunkte', async () => {
  const api = createPointsApi({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: { community: {
        id: '50985620', displayName: 'Papaplatte',
        channel: {
          communityPointsSettings: { name: 'Papapoints', image: { url: 'https://cdn/icon-1.png' } },
          self: { communityPoints: { balance: 4200, availableClaim: null } }
        }
      } } })
    })
  });
  const c = await api.context('tok', 'papaplatte');
  assert.equal(c.balance, 4200);
  assert.equal(c.punkteName, 'Papapoints');
  assert.equal(c.iconUrl, 'https://cdn/icon-1.png');
});

test('context ohne communityPointsSettings liefert beide Felder als null', async () => {
  const api = createPointsApi({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: { community: {
        id: '1', displayName: 'xQc',
        channel: {
          communityPointsSettings: null,
          self: { communityPoints: { balance: 10, availableClaim: null } }
        }
      } } })
    })
  });
  const c = await api.context('tok', 'xqc');
  assert.equal(c.punkteName, null);
  assert.equal(c.iconUrl, null);
});

test('context mit Name aber ohne Bild liefert nur den Namen', async () => {
  const api = createPointsApi({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: { community: {
        id: '1', displayName: 'Kanal',
        channel: {
          communityPointsSettings: { name: 'Sternchen', image: null },
          self: { communityPoints: { balance: 10, availableClaim: null } }
        }
      } } })
    })
  });
  const c = await api.context('tok', 'kanal');
  assert.equal(c.punkteName, 'Sternchen');
  assert.equal(c.iconUrl, null);
});

test('context ohne community liefert weiterhin lauter null', async () => {
  const api = createPointsApi({
    fetchImpl: async () => ({ ok: true, json: async () => ({ data: { community: null } }) })
  });
  const c = await api.context('tok', 'gibtsnicht');
  assert.equal(c.channelID, null);
  assert.equal(c.balance, null);
  assert.equal(c.punkteName, null);
  assert.equal(c.iconUrl, null);
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestaetigen**

```bash
npm test -- --test-name-pattern="context"
```

Erwartet: FAIL — `c.punkteName` ist `undefined`.

- [ ] **Schritt 3: Abfrage erweitern**

`src/twitch-points.js`, `Q_CONTEXT` ersetzen:

```js
const Q_CONTEXT = `query($channelLogin: String!) {
  community: user(login: $channelLogin) {
    id displayName
    channel {
      communityPointsSettings { name image { url } }
      self { communityPoints { balance availableClaim { id } } }
    }
  }
}`;
```

- [ ] **Schritt 4: Rueckgabe erweitern**

`src/twitch-points.js`, Methode `context`. Zuerst die Datei an dieser Stelle
lesen — der Aufbau (`const c = …; if (!c) return {…}`) muss erhalten bleiben,
nur um zwei Felder ergaenzt. Der Frueh-Ausstieg fuer `!c` bekommt die neuen
Felder ebenfalls als `null`, sonst sind sie dort `undefined`:

```js
      if (!c) return { channelID: null, displayName: null, balance: null, claimID: null, punkteName: null, iconUrl: null };
```

Und im Normalfall, neben den bestehenden Feldern:

```js
      // Kanaleigenes Punkte-Symbol und -Name. Rund die Haelfte der Kanaele
      // setzt beides nicht (am 2026-08-12 gegen die echte API geprueft) -
      // der Renderer hat dafuer eine Rueckfallebene.
      const cps = c.channel && c.channel.communityPointsSettings;
      // …
        punkteName: (cps && cps.name) || null,
        iconUrl: (cps && cps.image && cps.image.url) || null
```

- [ ] **Schritt 5: Tests laufen lassen**

```bash
npm test
```

Erwartet: alles gruen.

- [ ] **Schritt 6: Commit**

```bash
git add src/twitch-points.js test/twitch-points.test.js
git commit -m "feat: Kontext-Abfrage liefert Symbol und Name der Kanalpunkte"
```

---

### Task 3: Zugewinn-Rechnung in `points-state.js`

**Files:**
- Modify: `renderer/lib/points-state.js`
- Test: `test/points-state.test.js`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `zuwaechse(neuerStand, kistenBetrag = 0)` -> `Array<{ betrag: number, quelle: 'passiv'|'kiste' }>`
  - `standVergessen()` -> `undefined`
  - `zuruecksetzen()` loescht zusaetzlich die Basislinie

**Regeln (aus der Spec):**

1. Basislinie unbekannt -> setzen, **leere Liste**. Ohne das knallt beim
   Kanalwechsel ein `+12.350` auf den Schirm.
2. `gesamt = neuerStand - letzterStand`, danach Basislinie fortschreiben.
3. `gesamt <= 0` -> leere Liste (Einloesungen sind kein Gewinn).
4. `kiste = min(kistenBetrag, gesamt)`, `passiv = gesamt - kiste`.
5. Reihenfolge `passiv`, dann `kiste`; Eintraege mit `betrag <= 0` fallen raus.

- [ ] **Schritt 1: Fehlschlagende Tests schreiben**

An `test/points-state.test.js` anhaengen:

```js
test('erster Stand setzt nur die Basislinie', () => {
  const s = createPointsState();
  assert.deepEqual(s.zuwaechse(12350), []);
});

test('passiver Zuwachs ergibt einen passiv-Eintrag', () => {
  const s = createPointsState();
  s.zuwaechse(1000);
  assert.deepEqual(s.zuwaechse(1010), [{ betrag: 10, quelle: 'passiv' }]);
});

test('Kistenbetrag wird getrennt vom Rest gemeldet', () => {
  const s = createPointsState();
  s.zuwaechse(1000);
  assert.deepEqual(s.zuwaechse(1060, 50), [
    { betrag: 10, quelle: 'passiv' },
    { betrag: 50, quelle: 'kiste' }
  ]);
});

test('reiner Kistengewinn ergibt nur einen kiste-Eintrag', () => {
  const s = createPointsState();
  s.zuwaechse(1000);
  assert.deepEqual(s.zuwaechse(1050, 50), [{ betrag: 50, quelle: 'kiste' }]);
});

test('Kistenbetrag ist auf den Gesamtzuwachs gedeckelt', () => {
  // Zwischendurch eingeloest: der Stand steigt weniger als die Kiste hergab.
  const s = createPointsState();
  s.zuwaechse(1000);
  assert.deepEqual(s.zuwaechse(1020, 50), [{ betrag: 20, quelle: 'kiste' }]);
});

test('sinkender Stand loest nichts aus', () => {
  const s = createPointsState();
  s.zuwaechse(1000);
  assert.deepEqual(s.zuwaechse(400), []);
});

test('gleicher Stand loest nichts aus', () => {
  const s = createPointsState();
  s.zuwaechse(1000);
  assert.deepEqual(s.zuwaechse(1000), []);
});

test('standVergessen macht den naechsten Stand zur neuen Basislinie', () => {
  const s = createPointsState();
  s.zuwaechse(1000);
  s.standVergessen();
  assert.deepEqual(s.zuwaechse(9999), []);
  assert.deepEqual(s.zuwaechse(10009), [{ betrag: 10, quelle: 'passiv' }]);
});

test('zuruecksetzen loescht die Basislinie mit', () => {
  const s = createPointsState();
  s.zuwaechse(1000);
  s.zuruecksetzen();
  assert.deepEqual(s.zuwaechse(5000), []);
});
```

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag bestaetigen**

```bash
npm test -- --test-name-pattern="Basislinie|Zuwachs|Kisten|sinkender|standVergessen"
```

Erwartet: FAIL — `s.zuwaechse is not a function`.

- [ ] **Schritt 3: Umsetzen**

`renderer/lib/points-state.js`. Neben `let abstand` eine weitere Variable:

```js
    let letzterStand = null;
```

Im zurueckgegebenen Objekt zwei Methoden ergaenzen:

```js
      // Vergleicht den neuen Stand mit dem zuletzt gesehenen und zerlegt den
      // Zuwachs in Kiste und passiven Tropfen. kistenBetrag kommt aus der
      // Claim-Antwort (Stand danach minus Stand davor) und ist 0, wenn in
      // diesem Takt keine Kiste geklappt hat.
      zuwaechse(neuerStand, kistenBetrag = 0) {
        if (typeof neuerStand !== 'number' || !Number.isFinite(neuerStand)) return [];
        // Erster Stand nach Kanalwechsel/Anmeldung ist die Basislinie, kein
        // Gewinn - sonst meldet die Anzeige beim Umschalten den vollen
        // Kontostand als Zuwachs.
        if (letzterStand === null) { letzterStand = neuerStand; return []; }
        const gesamt = neuerStand - letzterStand;
        letzterStand = neuerStand;
        // Einloesungen senken den Stand. Kein Gewinn -> keine Meldung.
        if (gesamt <= 0) return [];
        // Deckel: wurde zwischen zwei Takten zusaetzlich eingeloest, ist der
        // sichtbare Zuwachs kleiner als die Kiste hergab.
        const kiste = Math.max(0, Math.min(kistenBetrag || 0, gesamt));
        const passiv = gesamt - kiste;
        const liste = [];
        if (passiv > 0) liste.push({ betrag: passiv, quelle: 'passiv' });
        if (kiste > 0) liste.push({ betrag: kiste, quelle: 'kiste' });
        return liste;
      },
      // Kanalwechsel: der Stand des neuen Kanals hat mit dem alten nichts zu
      // tun. Ohne das waere die Differenz der volle neue Kontostand.
      standVergessen() {
        letzterStand = null;
      },
```

Und in `zuruecksetzen()` die Basislinie mitloeschen — nach einem Neu-Anmelden
ist der erste Stand eine frische Basislinie, kein Gewinn:

```js
      zuruecksetzen() {
        abstand = intervalMs;
        letzteAbfrage = null;
        letzterStand = null;
      },
```

Den bestehenden Kommentarblock ueber `zuruecksetzen` (Zeilen 45-50) um eine
Zeile ergaenzen, die erklaert, warum die Basislinie hier **doch** faellt,
waehrend Kanalsperren und Kisten-Zaehler bleiben.

- [ ] **Schritt 4: Tests laufen lassen**

```bash
npm test
```

Erwartet: alles gruen.

- [ ] **Schritt 5: Commit**

```bash
git add renderer/lib/points-state.js test/points-state.test.js
git commit -m "feat: Zugewinn aus zwei Staenden in Kiste und passiv zerlegen"
```

---

### Task 4: Emote-Auswahl nach Akzentfarbe (`points-icon.js`)

**Files:**
- Create: `renderer/lib/points-icon.js`
- Create: `test/points-icon.test.js`

**Interfaces:**
- Consumes: nichts
- Produces (global `window.PointsIcon`, unter Node `require('../renderer/lib/points-icon')`):
  - `EMOTES` -> `Array<{ name: string, id: string, farbton: number }>`
  - `emoteUrl(id)` -> `string`
  - `waehleEmote(accentHex, channelLogin, liste = EMOTES)` -> `{ name, id, farbton, url } | null`

**Kuratierte Liste — am 2026-08-12 einzeln in Originalgroesse gesichtet.**
7TVs Katalog besteht ueberwiegend aus Foto- und Meme-Emotes; von 17 gepruefften
Kandidaten waren 5 brauchbar. Der Name sagt nichts ueber das Bild (`gem` ist
ein Foto eines Mannes, `crystallis` ein Gesicht). Farbtoene sind aus der
Sichtpruefung **geschaetzt, nicht gemessen** — fuer eine Auswahl in
60-Grad-Schritten reicht das.

- [ ] **Schritt 1: Fehlschlagende Tests schreiben**

Neue Datei `test/points-icon.test.js`:

```js
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
```

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag bestaetigen**

```bash
npm test -- --test-name-pattern="Farbfamilie|naechstliegenden|Kanal liefert|emoteUrl"
```

Erwartet: FAIL — Modul `renderer/lib/points-icon.js` existiert nicht.

- [ ] **Schritt 3: Modul anlegen**

Neue Datei `renderer/lib/points-icon.js`:

```js
// Waehlt das Ersatz-Symbol fuer den Punktestand, wenn der Kanal kein eigenes
// gesetzt hat. UMD wie points-state.js: laeuft im Browser und unter Node.
//
// Regel: Farbfamilie folgt der Akzentfarbe des Fensters, die Auswahl
// innerhalb der Familie folgt dem Kanalnamen. Damit wechselt das Symbol mit
// dem Kanal, bleibt fuer denselben Kanal aber stabil - ein bei jedem Takt
// wechselndes Symbol waere Flackern, kein Wiedererkennungswert.
//
// Die Farbtoene sind aus der Sichtpruefung der Bilder geschaetzt, nicht
// gemessen. Fuer eine Auswahl in 60-Grad-Schritten reicht das.
//
// Hex-Auswertung bewusst eigenstaendig statt ThemeLib.normalizeHex: eine
// UMD-Abhaengigkeit zwischen zwei Libs muesste in beiden Welten (Browser-
// Global und Node-require) aufgeloest werden und waere mehr Umstand als die
// vier Zeilen hier.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PointsIcon = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // Handverlesen am 2026-08-12: einzeln in Originalgroesse angesehen. 7TVs
  // Katalog ist ueberwiegend Foto- und Meme-Material, das bei 18 px zu Matsch
  // wird - nur einfache Geometrie mit klarem Umriss bleibt lesbar.
  // Bekannte Luecke: Gruen und echtes Cyan fehlen; dort greift die
  // Ausweichregel. Die Liste ist reine Daten und darf wachsen.
  const EMOTES = [
    { name: 'heart',       id: '01KZ2PG8B9TNSPYCR5DM1JFG6F', farbton: 0 },
    { name: 'CoinSpin',    id: '01KTQBP5NBM4T6VN1X1VM234SR', farbton: 45 },
    { name: 'Diamond',     id: '01KYZBYQEFNJMEMVXW9QKRM8EF', farbton: 215 },
    { name: 'CrystalBall', id: '01KYGN8CP0JV0JG5RACB4PHX7T', farbton: 280 },
    { name: 'PixelHeart',  id: '01KF76P304N9AY0HKV32MN5A8C', farbton: 320 }
  ];

  const NAH_GRAD = 60;   // Breite einer Farbfamilie
  const ERSATZ_ANZAHL = 3; // wieviele Naechstliegende, wenn keine Familie passt

  function hexZuFarbton(input) {
    if (typeof input !== 'string') return null;
    let s = input.trim().toLowerCase();
    if (s[0] === '#') s = s.slice(1);
    if (/^[0-9a-f]{3}$/.test(s)) s = s.replace(/./g, (c) => c + c);
    if (!/^[0-9a-f]{6}$/.test(s)) return null;
    const r = parseInt(s.slice(0, 2), 16) / 255;
    const g = parseInt(s.slice(2, 4), 16) / 255;
    const b = parseInt(s.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    if (d === 0) return 0; // Grau hat keinen Farbton -> wie Rot behandeln
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  }

  // Kuerzester Weg auf dem Farbkreis - 350 und 10 sind 20 Grad auseinander,
  // nicht 340.
  function farbAbstand(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  // Stabile Streuung ueber den Kanalnamen. Keine Krypto noetig, nur eine
  // Zahl, die sich bei aehnlichen Namen unterscheidet.
  function quersumme(text) {
    let n = 0;
    const s = typeof text === 'string' ? text : '';
    for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) % 100000;
    return n;
  }

  function emoteUrl(id) {
    return 'https://cdn.7tv.app/emote/' + id + '/2x.webp';
  }

  function waehleEmote(accentHex, channelLogin, liste = EMOTES) {
    if (!Array.isArray(liste) || liste.length === 0) return null;
    const h = hexZuFarbton(accentHex);
    if (h === null) return null;
    let kandidaten = liste.filter((e) => farbAbstand(e.farbton, h) <= NAH_GRAD);
    if (kandidaten.length === 0) {
      // Keine passende Familie (z.B. gruene Akzentfarbe): die naechsten
      // nehmen, statt gar kein Symbol zu zeigen.
      kandidaten = liste
        .slice()
        .sort((a, b) => farbAbstand(a.farbton, h) - farbAbstand(b.farbton, h))
        .slice(0, ERSATZ_ANZAHL);
    }
    const e = kandidaten[quersumme(channelLogin) % kandidaten.length];
    return { ...e, url: emoteUrl(e.id) };
  }

  return { EMOTES, emoteUrl, waehleEmote, hexZuFarbton, farbAbstand };
});
```

- [ ] **Schritt 4: Tests laufen lassen**

```bash
npm test
```

Erwartet: alles gruen. Faellt „verschiedene Kanaele koennen verschiedene
Emotes liefern" um, streut `quersumme` zu schwach — dann den Test **nicht**
abschwaechen, sondern die Streufunktion pruefen.

- [ ] **Schritt 5: Commit**

```bash
git add renderer/lib/points-icon.js test/points-icon.test.js
git commit -m "feat: Ersatz-Symbol nach Akzentfarbe und Kanal waehlen"
```

---

### Task 5: `main.js` verdrahten

**Files:**
- Modify: `main.js:466-522` (`punkteTick`)
- Modify: `main.js:199` und `main.js:234` (Kanalwechsel live und VOD)

**Interfaces:**
- Consumes: `claim().currentPoints` (Task 1), `context().punkteName/.iconUrl`
  (Task 2), `pointsState.zuwaechse()` / `.standVergessen()` (Task 3)
- Produces: die `points-update`-Nachricht traegt zusaetzlich
  `zuwaechse: Array<{betrag, quelle}>`, `punkteName: string|null`,
  `iconUrl: string|null`, `channelLogin: string|null`

**Kein automatischer Test.** `main.js` ist in diesem Projekt nicht
testabgedeckt (kein Electron-Harness). Die Rechenlogik liegt deshalb komplett
in Task 1-4 und ist dort abgedeckt; hier wird nur verdrahtet. Verifikation
laeuft ueber Task 10 am echten Programm.

- [ ] **Schritt 1: Kanalwechsel-Stellen ergaenzen**

An **beiden** Stellen, die heute schon `balance: null` senden — `main.js:199`
(Live-Zweig) und `main.js:234` (VOD-Zweig) — direkt nach dem `broadcast`:

```js
      pointsState.standVergessen();
```

Beim bestehenden Kommentar („Kanalwechsel: Chip sofort leeren…") einen Halbsatz
ergaenzen: die Basislinie muss mit, sonst meldet der neue Kanal seinen vollen
Kontostand als Zuwachs.

- [ ] **Schritt 2: `punkteTick` umbauen**

Den Block ab `pointsState.abfrageOk(Date.now());` (`main.js:496`) bis zum
`broadcast` (`main.js:510`) ersetzen:

```js
      pointsState.abfrageOk(Date.now());
      // ctx.balance ist der Stand VOR einem Claim. Klappt die Kiste, liefert
      // die Mutation den Stand danach - erst der ist aktuell, und die
      // Differenz ist der Kistenbetrag.
      let stand = ctx.balance;
      let kistenBetrag = 0;
      if (ctx.claimID && pointsState.darfClaimen(ctx.claimID)) {
        try {
          const r = await kisteEinloesen(ctx.channelID, ctx.claimID);
          if (!r.ok) {
            pointsState.claimFehlgeschlagen(ctx.claimID);
          } else if (r.currentPoints != null) {
            kistenBetrag = Math.max(0, r.currentPoints - ctx.balance);
            stand = r.currentPoints;
          }
          // r.ok ohne currentPoints: Stand bleibt der aus context(), der
          // Zuwachs faellt beim naechsten Takt als "passiv" auf. Lieber eine
          // ungenaue Einordnung als gar keine Meldung.
        } catch (e) {
          // Wirft kisteEinloesen (z.B. beide Integrity-Versuche mit
          // IntegrityCheckFailed abgelehnt), zaehlt das genauso als
          // Fehlversuch - sonst greift die Drei-Versuche-Sperre nie und die
          // Kiste wird bei jedem zurueckgefahrenen Takt erneut versucht.
          pointsState.claimFehlgeschlagen(ctx.claimID);
          throw e;
        }
      }
      broadcast('points-update', {
        balance: stand,
        displayName: ctx.displayName,
        fehler: null,
        zuwaechse: pointsState.zuwaechse(stand, kistenBetrag),
        punkteName: ctx.punkteName,
        iconUrl: ctx.iconUrl,
        channelLogin: currentLiveChannel
      });
```

- [ ] **Schritt 3: Startfaehigkeit pruefen**

```bash
npm test
node -e "require('./main.js')" 2>&1 | head -5
```

Der zweite Aufruf bricht erwartungsgemaess mit einem Electron-Fehler ab (kein
`app`-Kontext) — er soll nur belegen, dass **kein Syntaxfehler** drin ist.
Erscheint stattdessen ein `SyntaxError`, ist der Umbau kaputt.

- [ ] **Schritt 4: Commit**

```bash
git add main.js
git commit -m "feat: Zuwachs, Symbol und Kanal an die Anzeige melden"
```

---

### Task 6: Chip-Aufbau in HTML und CSS

**Files:**
- Modify: `renderer/chat/index.html:85-89` (Footer)
- Modify: `renderer/chat/chat.css:110-117` (Chip-Block)

**Interfaces:**
- Consumes: nichts
- Produces: DOM-Knoten `#points-wrap`, `#points-icon` (`<img>`),
  `#points-svg`, `#points-value`, `#points-gain` — Task 8 und 9 schreiben
  ausschliesslich in diese.

**Warum der Umbau:** `$pointsChip.textContent = …` (`chat.js:1151`) loescht
jedes Kind-Element. Mit Symbol **und** eingeblendeter `+N` geht das nicht mehr
— der Chip braucht eine feste Struktur, in die nur noch gezielt geschrieben
wird.

- [ ] **Schritt 1: Footer ersetzen**

`renderer/chat/index.html`, die Zeile mit `points-chip` ersetzen:

```html
    <span id="points-wrap">
      <span id="points-chip" class="hidden" title="Kanalpunkte">
        <img id="points-icon" class="hidden" alt="" />
        <!-- Letzte Rueckfallebene: bewusst KEIN Netzbild. Eine Ebene, die
             selbst an einem fremden CDN haengt, kann genau den Fehler haben,
             den sie abfangen soll. Erbt ueber currentColor die Akzentfarbe. -->
        <svg id="points-svg" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6" />
          <circle cx="8" cy="8" r="2.6" fill="currentColor" />
        </svg>
        <span id="points-value"></span>
      </span>
      <!-- Geschwister, nicht Kind: als Kind wuerde jedes Schreiben in den
           Chip die Animation mitreissen. -->
      <span id="points-gain" class="hidden" aria-hidden="true"></span>
    </span>
```

- [ ] **Schritt 2: CSS ersetzen**

`renderer/chat/chat.css`, den Block ab dem Kommentar „Kanalpunkte-Chip"
(Zeilen 110-117) ersetzen. Der bestehende Kommentar zu `.klickbar` bleibt
inhaltlich erhalten:

```css
/* Kanalpunkte-Chip: Stand, Fehler oder Anmelde-Knopf im Footer.
   .klickbar statt [onclick]-Selektor, weil ein per JS gesetztes onclick
   kein Attribut im DOM ist und der Selektor daher nie treffen wuerde.
   #points-wrap ist der Bezugsrahmen fuer die eingeblendete +N - die liegt
   absolut daneben und schiebt den Footer deshalb nicht auseinander. */
#points-wrap { position: relative; display: inline-flex; align-items: center; }
#points-chip { cursor: default; display: inline-flex; align-items: center; gap: 5px; }
#points-chip.hidden { display: none; }
#points-chip.klickbar { cursor: pointer; }
#points-chip.err { color: #ff6b6b; }
#points-chip.stale { opacity: 0.55; }

/* 18 px statt der Footer-typischen 14: darunter ist von einem 7TV-Emote
   nichts mehr zu erkennen (am 2026-08-12 an echten Bildern geprueft). */
#points-icon, #points-svg { height: 18px; width: 18px; flex-shrink: 0; }
#points-icon { object-fit: contain; }
#points-svg { color: var(--accent); }
#points-icon.hidden, #points-svg.hidden { display: none; }

/* Zugewinn: steigt auf und blendet aus. Kiste deutlich, passiv dezent.
   Bewusst ohne prefers-reduced-motion - auf dem Zielrechner sind
   Windows-Animationen systemweit aus, der Zweig wuerde das hier
   dauerhaft stumm schalten. */
#points-gain {
  position: absolute; left: 100%; bottom: 0; margin-left: 6px;
  white-space: nowrap; pointer-events: none; font-variant-numeric: tabular-nums;
}
#points-gain.hidden { display: none; }
#points-gain.passiv {
  color: var(--muted); font-size: 11px;
  animation: gain-float 1.1s ease-out forwards;
}
#points-gain.kiste {
  color: var(--accent); font-size: 13px; font-weight: 700;
  text-shadow: 0 0 8px var(--accent-glow);
  animation: gain-float 1.6s ease-out forwards;
}
@keyframes gain-float {
  from { opacity: 0; transform: translateY(4px); }
  18%  { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(-10px); }
}

/* Der Belohnungen-Knopf zuckt mit, damit der Blick die Quelle findet. */
#rewards-btn.wackelt-kiste  { animation: reward-wobble 600ms ease-out; }
#rewards-btn.wackelt-passiv { animation: reward-wobble-klein 400ms ease-out; }
@keyframes reward-wobble {
  25% { transform: rotate(-10deg) scale(1.14); }
  50% { transform: rotate(8deg) scale(1.10); }
  75% { transform: rotate(-4deg) scale(1.05); }
}
@keyframes reward-wobble-klein {
  33% { transform: rotate(-4deg) scale(1.06); }
  66% { transform: rotate(3deg) scale(1.03); }
}
```

- [ ] **Schritt 3: Screenshot ziehen und ansehen**

```bash
npm run shots
```

Danach `design-screens/chat-live.png` **oeffnen und wirklich ansehen**. Der
Footer darf nicht umbrechen und nicht hoeher werden als noetig. Der Chip ist in
diesem Zustand leer (kein `points-update` im Screenshot-Werkzeug) — geprueft
wird hier nur, dass nichts kaputtgeht.

- [ ] **Schritt 4: Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.css
git commit -m "feat: Chip-Aufbau fuer Symbol und Zugewinn-Anzeige"
```

---

### Task 7: peepoMoney auf den Belohnungen-Knopf

**Files:**
- Modify: `renderer/chat/index.html:56`
- Modify: `renderer/chat/chat.css:358-359`

**Interfaces:**
- Consumes: nichts
- Produces: nichts (rein visuell)

Emote-ID am 2026-08-12 ueber die 7TV-Suche aufgeloest, URL mit HEAD geprueft:
HTTP 200, `image/webp`, animiert.

- [ ] **Schritt 1: Knopf ersetzen**

```html
    <button id="rewards-btn" type="button" title="Belohnungen" aria-label="Belohnungen"><img src="https://cdn.7tv.app/emote/01FHPG3BCR00093JSPCMYFBG0E/1x.webp" alt="peepoMoney"></button>
```

- [ ] **Schritt 2: CSS-Regeln erweitern**

`renderer/chat/chat.css`: die bestehenden Regeln fuer `#emote-btn` um
`#rewards-btn` ergaenzen, damit beide Knoepfe gleich hoch bleiben und das Bild
mittig sitzt:

```css
#emote-btn, #rewards-btn { padding: 4px 6px; display: inline-flex; align-items: center; }
#emote-btn img, #rewards-btn img { height: 20px; width: auto; display: block; }
```

- [ ] **Schritt 3: Am echten Programm ansehen**

```bash
npm start
```

`npm run shots` taugt hier **nicht**: `tools/ui-shots.js:59-61` blockt alle
http(s)-Requests, das Emote laedt im Screenshot also nie. Im laufenden
Programm pruefen, dass der Knopf das Emote zeigt und genauso hoch ist wie der
catJAM-Knopf daneben.

- [ ] **Schritt 4: Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.css
git commit -m "feat: peepoMoney statt Geschenk-Emoji auf dem Belohnungen-Knopf"
```

---

### Task 8: Symbol-Ebenen im Renderer

**Files:**
- Modify: `renderer/chat/chat.js:1130-1186` (`zeigePunkte`, `starteWebLogin`, Startblock)
- Modify: `renderer/chat/index.html` (Script-Einbindung `points-icon.js`)

**Interfaces:**
- Consumes: `window.PointsIcon.waehleEmote()` (Task 4), die DOM-Knoten aus
  Task 6, `themePrefs.chatAccent` (`chat.js:662`)
- Produces: `setzePunkteSymbol(iconUrl, channelLogin)` — von Task 9 nicht
  gebraucht, aber von `applyTheme` (Schritt 5)

**Drei Ebenen:** Kanal-Icon -> 7TV-Emote -> Inline-SVG. Jede faengt die
vorherige ueber `onerror` ab.

- [ ] **Schritt 1: Lib einbinden**

`renderer/chat/index.html`, bei den `<script>`-Zeilen, **vor** `chat.js`:

```html
  <script src="../lib/points-icon.js"></script>
```

- [ ] **Schritt 2: `zeigePunkte` ersetzen**

`renderer/chat/chat.js`. Die Knoten-Referenzen neben `$pointsChip` ergaenzen
und `zeigePunkte` ersetzen:

```js
const $pointsChip = document.getElementById('points-chip');
const $pointsIcon = document.getElementById('points-icon');
const $pointsSvg = document.getElementById('points-svg');
const $pointsValue = document.getElementById('points-value');
const $pointsGain = document.getElementById('points-gain');
// Fuer die Symbolwahl: der Kanal kommt mit points-update, die Akzentfarbe aus
// den Theme-Einstellungen. Gemerkt, damit ein Farbwechsel das Symbol neu
// waehlen kann, ohne auf den naechsten Takt zu warten.
let letzterIconUrl = null;
let letzterKanal = null;

// Ebene 1 Kanal-Icon, Ebene 2 passendes 7TV-Emote, Ebene 3 eingebautes SVG.
// Ebene 3 ist bewusst kein Netzbild - sie muss auch dann noch da sein, wenn
// gar nichts laedt.
function setzePunkteSymbol(iconUrl, channelLogin) {
  letzterIconUrl = iconUrl || null;
  letzterKanal = channelLogin || null;
  const emote = PointsIcon.waehleEmote(themePrefs.chatAccent, letzterKanal);
  const ebene2 = emote ? emote.url : null;
  const zeigeSvg = () => {
    $pointsIcon.classList.add('hidden');
    $pointsSvg.classList.remove('hidden');
  };
  const zeige = (url, weiter) => {
    $pointsSvg.classList.add('hidden');
    $pointsIcon.classList.remove('hidden');
    $pointsIcon.onerror = weiter;
    $pointsIcon.src = url;
  };
  if (letzterIconUrl) zeige(letzterIconUrl, () => (ebene2 ? zeige(ebene2, zeigeSvg) : zeigeSvg()));
  else if (ebene2) zeige(ebene2, zeigeSvg);
  else zeigeSvg();
}

function zeigePunkte(p) {
  if (!$pointsChip) return;
  $pointsChip.classList.remove('hidden', 'err', 'stale', 'klickbar');
  if (p && p.fehler) {
    // Nichts scheitert still: Fehler steht im Chip, nicht nur in der Konsole.
    const abgelaufen = /abgelaufen/i.test(p.fehler);
    $pointsChip.classList.add(abgelaufen ? 'err' : 'stale');
    $pointsIcon.classList.add('hidden');
    $pointsSvg.classList.add('hidden');
    $pointsValue.textContent = abgelaufen ? '⚠ Anmeldung abgelaufen' : '⚠ ' + p.fehler;
    $pointsChip.onclick = abgelaufen ? starteWebLogin : null;
    $pointsChip.classList.toggle('klickbar', abgelaufen);
    return;
  }
  // balance == null ohne Fehler: bewusste Loeschung bei Quell-/Kanalwechsel
  // (main.js). Bis der neue Stand da ist (binnen ~15s), lieber nichts zeigen
  // als eine falsche Zahl vom alten Kanal.
  if (!p || p.balance == null) { $pointsChip.classList.add('hidden'); return; }
  setzePunkteSymbol(p.iconUrl, p.channelLogin);
  $pointsChip.title = p.punkteName || 'Kanalpunkte';
  $pointsValue.textContent = p.balance.toLocaleString('de-DE');
  $pointsChip.onclick = null;
  $pointsChip.classList.remove('klickbar');
  if (p.zuwaechse && p.zuwaechse.length) spieleZuwaechse(p.zuwaechse);
}
```

- [ ] **Schritt 3: Die uebrigen Schreibzugriffe umstellen**

In `starteWebLogin` und im Startblock darunter steht noch dreimal
`$pointsChip.textContent = …`. Jede dieser Stellen schreibt jetzt in
`$pointsValue` und blendet beide Symbolknoten aus — sonst haengt beim
Anmelde-Hinweis ein Symbol davor:

```js
    $pointsIcon.classList.add('hidden');
    $pointsSvg.classList.add('hidden');
    $pointsValue.textContent = '⚠ ' + r.error;
```

```js
  $pointsIcon.classList.add('hidden');
  $pointsSvg.classList.add('hidden');
  $pointsValue.textContent = '…';
```

```js
    $pointsIcon.classList.add('hidden');
    $pointsSvg.classList.add('hidden');
    $pointsValue.textContent = 'Für Kanalpunkte anmelden';
```

Die Muenz-Emojis entfallen dabei ersatzlos — das Symbol ist jetzt Sache von
`setzePunkteSymbol`.

- [ ] **Schritt 4: Vorlaeufiges `spieleZuwaechse` einsetzen**

Damit `zeigePunkte` nicht auf eine noch nicht existierende Funktion verweist
(Task 9 fuellt sie), direkt darunter:

```js
function spieleZuwaechse(liste) {
  // In Task 9 gefuellt.
}
```

- [ ] **Schritt 5: Symbol bei Farbwechsel neu waehlen**

Am Ende von `applyTheme` (`chat.js:711`), damit ein Griff zum Farbwaehler nicht
bis zum naechsten Takt wirkungslos bleibt:

```js
  // Akzentfarbe bestimmt die Farbfamilie des Ersatz-Symbols - ohne das
  // haengt nach einem Farbwechsel bis zu 15 s das alte Emote da.
  if ($pointsValue && $pointsValue.textContent) setzePunkteSymbol(letzterIconUrl, letzterKanal);
```

**Achtung — Reihenfolge:** `applyTheme` steht bei Zeile ~687, `$pointsValue`
und `letzterIconUrl` werden erst bei ~1133 mit `const`/`let` angelegt. Wird
`applyTheme` **synchron** vor dieser Zeile aufgerufen, gibt es einen
`ReferenceError` (Temporal Dead Zone), und das Chat-Fenster startet ohne
Farben. Der bestehende Aufruf haengt an `getUiPrefs().then(...)`, laeuft also
erst nach dem Durchlauf des Skripts — das ist unkritisch. **Vor dem Commit
pruefen:**

```bash
grep -n "applyTheme(" renderer/chat/chat.js
```

Jeder Treffer muss entweder eine Definition, ein `.then(applyTheme)` oder ein
Aufruf aus einem Ereignis-Handler sein. Findet sich ein synchroner Aufruf auf
oberster Ebene, die vier Deklarationen (`$pointsValue`, `$pointsIcon`,
`$pointsSvg`, `letzterIconUrl`, `letzterKanal`) vor `applyTheme` ziehen statt
den Aufruf zu entfernen. Nach der Aenderung `npm start` — startet das
Chat-Fenster farbig, ist der Pfad sauber.

- [ ] **Schritt 6: Am echten Programm pruefen**

```bash
npm start
```

Zu pruefen: Kanal **mit** eigenem Symbol (z.B. `papaplatte`, `trymacs`) zeigt
das Twitch-Icon; Kanal **ohne** (z.B. `xqc`, `knossi`) zeigt ein Emote; ein
Griff zum Farbwaehler im ⚙-Popup wechselt bei Kanaelen ohne eigenes Symbol die
Farbfamilie. Tooltip nennt den Kanalnamen der Punkte, wo gesetzt.

Das SVG (Ebene 3) laesst sich hier nicht ausloesen — dafuer Schritt 7.

- [ ] **Schritt 7: Ebene 3 erzwingen**

Bei laufendem Programm in der Entwicklerkonsole des Chat-Fensters:

```js
setzePunkteSymbol('https://example.invalid/gibtsnicht.png', 'testkanal');
```

Erwartet: kurz nichts, dann das SVG in der Akzentfarbe. **Kein** kaputtes
Bild-Symbol. Danach ein Kanalwechsel stellt den Normalzustand her.

- [ ] **Schritt 8: Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.js
git commit -m "feat: dreistufiges Symbol vor dem Punktestand"
```

---

### Task 9: Zugewinn-Animation

**Files:**
- Modify: `renderer/chat/chat.js` (`spieleZuwaechse` aus Task 8, Schritt 4)

**Interfaces:**
- Consumes: `p.zuwaechse` aus `points-update` (Task 5), die CSS-Klassen
  `passiv`/`kiste` und `wackelt-kiste`/`wackelt-passiv` (Task 6)
- Produces: nichts

- [ ] **Schritt 1: Funktion fuellen**

Den Platzhalter aus Task 8 ersetzen:

```js
const $rewardsBtnAnim = document.getElementById('rewards-btn');

// Spielt die Zugewinne nacheinander ab. Zwei im selben Takt (Kiste plus
// passiver Tropfen) sind moeglich - versetzt, sonst liegen zwei Zahlen
// uebereinander.
function spieleZuwaechse(liste) {
  liste.forEach((z, i) => {
    setTimeout(() => zeigeZuwachs(z), i * 450);
  });
}

function zeigeZuwachs(z) {
  if (!$pointsGain) return;
  const kiste = z.quelle === 'kiste';
  $pointsGain.textContent = '+' + z.betrag.toLocaleString('de-DE');
  // Klasse weg -> Reflow erzwingen -> Klasse wieder dran. Ohne das Auslesen
  // von offsetWidth fasst der Browser beide Aenderungen zusammen und die
  // Animation laeuft beim zweiten Mal nicht erneut.
  $pointsGain.className = '';
  void $pointsGain.offsetWidth;
  $pointsGain.classList.add(kiste ? 'kiste' : 'passiv');
  if ($rewardsBtnAnim) {
    $rewardsBtnAnim.classList.remove('wackelt-kiste', 'wackelt-passiv');
    void $rewardsBtnAnim.offsetWidth;
    $rewardsBtnAnim.classList.add(kiste ? 'wackelt-kiste' : 'wackelt-passiv');
  }
}
```

- [ ] **Schritt 2: `#points-gain` nach dem Ausblenden wieder verstecken**

Die Animation endet auf `opacity: 0` (`forwards`), der Knoten bliebe aber im
Layout stehen. Am Ende von Task 9 einmalig registrieren:

```js
// animationend statt Timer: der Knoten verschwindet genau dann, wenn die
// Animation wirklich durch ist - auch wenn sie unterwegs neu gestartet wurde.
if ($pointsGain) {
  $pointsGain.addEventListener('animationend', () => {
    $pointsGain.className = 'hidden';
  });
}
if ($rewardsBtnAnim) {
  $rewardsBtnAnim.addEventListener('animationend', () => {
    $rewardsBtnAnim.classList.remove('wackelt-kiste', 'wackelt-passiv');
  });
}
```

- [ ] **Schritt 3: Ohne Warten pruefen**

Passive Punkte kommen alle paar Minuten, eine Kiste noch seltener — darauf zu
warten ist keine Verifikation. Bei laufendem Programm (`npm start`) in der
Entwicklerkonsole des Chat-Fensters:

```js
zeigePunkte({ balance: 12350, punkteName: 'Testpunkte', iconUrl: null,
  channelLogin: 'testkanal', fehler: null,
  zuwaechse: [{ betrag: 10, quelle: 'passiv' }, { betrag: 50, quelle: 'kiste' }] });
```

Erwartet: `+10` dezent, ~450 ms spaeter `+50` in Akzentfarbe und groesser;
der peepoMoney-Knopf wackelt zweimal, beim zweiten Mal kraeftiger. Der Footer
darf dabei **nicht** breiter werden oder ruckeln.

Zweimal hintereinander ausfuehren: die Animation muss beim zweiten Aufruf
erneut laufen (Reflow-Trick aus Schritt 1).

- [ ] **Schritt 4: Commit**

```bash
git add renderer/chat/chat.js
git commit -m "feat: Zugewinn wird sichtbar animiert"
```

---

### Task 10: Gesamtdurchlauf, Version, Doku

**Files:**
- Modify: `package.json` (Version)
- Modify: `docs/TODO.md`

- [ ] **Schritt 1: Volle Testsuite**

```bash
npm test
```

Erwartet: alles gruen.

- [ ] **Schritt 2: Screenshots erneuern und ansehen**

```bash
npm run shots
```

`design-screens/chat-live.png` und `chat-idle.png` **oeffnen und ansehen**.
Der Footer muss sauber sitzen.

**Achtung:** `tools/ui-shots.js:59-61` blockt alle http(s)-Requests. Im
Screenshot erscheint deshalb nie ein Kanal-Icon und nie ein 7TV-Emote —
sichtbar ist bestenfalls das SVG. Wer hier „visuell geprueft" abhakt, hat das
Entscheidende nicht gesehen. Die Bildpfade sind in Task 7-9 am laufenden
Programm geprueft worden; dieser Schritt deckt nur das Layout ab.

- [ ] **Schritt 3: Echtlauf mit angemeldetem Konto**

```bash
npm start
```

Einen Live-Kanal mit Kanalpunkten oeffnen und laufen lassen, bis der Takt
greift. Zu pruefen:

- Der Stand erscheint mit Symbol und passendem Tooltip.
- Nach einer eingeloesten Kiste **springt der Stand sofort** — nicht erst 15 s
  spaeter. Das ist der Fehler aus Task 1; wenn er noch da ist, ist die
  Verdrahtung in Task 5 unvollstaendig.
- Ein Kanalwechsel loest **keine** Zugewinn-Animation aus.

- [ ] **Schritt 4: Version und Doku**

`package.json` auf `1.10.0` (neue sichtbare Funktionen, keine
Bruch-Aenderung). In `docs/TODO.md` den Eintrag zu dieser Aenderung nachziehen
— die Datei zuerst lesen und dem dortigen Aufbau folgen.

- [ ] **Schritt 5: Commit**

```bash
git add package.json docs/TODO.md
git commit -m "chore: v1.10.0 - Punkte-Anzeige mit Symbol und Zugewinn"
```

- [ ] **Schritt 6: Release**

Nach dem Muster in `docs/TODO.md`. **Release-Assets danach pruefen** — in der
Vergangenheit sind Releases als Entwurf haengengeblieben und die Blockmap
gefehlt.

---

## Offene Punkte

- **Gruen und Cyan fehlen in der Emote-Liste.** Fuer ein Cyan-Fenster greift
  die Ausweichregel und es bleibt praktisch bei `Diamond` — der Wechsel pro
  Kanal ist auf dieser Seite duenn. `EMOTES` in
  `renderer/lib/points-icon.js` ist reine Daten und darf wachsen, ohne dass
  Code oder Tests sich aendern. Neue Kandidaten **vorher in Originalgroesse
  ansehen**: 7TVs Katalog ist ueberwiegend Foto-Material, und der Name sagt
  nichts ueber das Bild.
- **Farbtoene sind geschaetzt, nicht gemessen.** Wer es genauer will, misst
  den Durchschnittsfarbton der Bilder nach und traegt ihn ein.
