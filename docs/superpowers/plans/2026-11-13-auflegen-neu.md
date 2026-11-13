# Auflegen neu (Punkt 9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Auflege-Animation im Home wird zu drei ruhigen Zooms (rein zum Plattenspieler, raus zum Raum, rein in den Fernseher) mit flackerndem Fernseher dazwischen.

**Architecture:** Die Kamera bleibt die heutige: `transform: translate(x, y) scale(f)` mit Ursprung `0 0` an `#raum-ebene .raum-bildebene`, gesetzt in `neuAusrichten()` über `kameraZiel()` je Ablauf-Klasse, bewegt per CSS-Transition. Eine solche Transition interpoliert `x` und `f` mit derselben Kurve – damit bleibt der Fixpunkt F der beiden Lagen fest stehen (`x(p) = F.x − P.x · f(p)` ist linear in `f`). „Schieben“ entsteht nur, wenn F weit weg vom Gegenstand liegt (heute: Spieler → TV bei fast gleichem Faktor). Neu werden die Ziel-Lagen so gerechnet, dass F **im Gegenstand** liegt; das prüft ein Unit-Test. Neue Lagen als reine Funktionen in `renderer/lib/raum.js`.

**Tech Stack:** Electron-Renderer, plain JS (UMD-Lib), CSS, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-13-auflegen-neu-design.md`

## Global Constraints

- Keine neuen Bilder, kein PixelLab; vorhandene: `raum-tv-aus.png`, TV-Canvas (`t.tv`, Klasse `raum-tv`), `platte-dreht.png`.
- Nichts darf seitlich wandern: Fixpunkt jeder Kamerafahrt liegt im Zielgegenstand (Spieler bzw. TV-Bildschirm in Ruhelage).
- Freie (krumme) Faktoren erlaubt, `image-rendering: pixelated` bleibt.
- Abschnitte und Dauern (ms), eine Quelle `ABLAUF_MS` in `home-raum-dom.js`: `{ raum: 500, spieler: 1500, auflegen: 1200, zurueck: 1500, an: 700, zeigen: 500, tv: 2000 }`, Summe **7900** = `mindestMs` in `home.js`.
- `spielerAnteil` = **0.5** (Plattenspieler-Höhe ≈ 50 % der Fensterhöhe), Konstante in `raum.js`.
- Überspringen (Klick/Taste), Fehlerweg, „Animationen aus“ = kein Ablauf: unverändert.
- Dateien nur mit Edit/Write ändern (kein `sed -i`, `printf >>`, Heredoc); `npm test` grün vor jedem Commit; Commit-Zeilen mit zwei `-m` und `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Fenster wird während des Ablaufs vergrößert/verkleinert → Kamera springt auf die Lage des laufenden Abschnitts für die neue Größe (heute schon über `neuAusrichten()` + `kameraZiel()`; muss für die neuen Klassen gelten). Test in Task 2.
2. Überspringen oder Fehler mitten im Flackern → alle neuen Klassen weg, TV wieder sichtbar (Ruhe). Test in Task 2 (`versteckeAblauf`).
3. Extreme Fenster (3000×500, 800×1400, 700×900) → Plattenspieler ganz im Fenster, keine leeren Ränder. Test in Task 1.
4. VOD ohne `thumb` bzw. nicht in `vods.liste` → TV flackert und bleibt dunkel (`setzeTv(null)`), kein Fehler. Test in Task 2.
5. Zweites Auflegen kurz nach dem ersten → `ladeWert` sperrt schon (`ladenLaeuft || laufwerk.laeuft`), keine Änderung; nur nicht kaputt machen.

---

### Task 1: Kamera-Lagen und Fixpunkt in `raum.js`

**Files:**
- Modify: `renderer/lib/raum.js` (neue Funktionen; `kameraZiel` entfällt samt Export)
- Test: `test/raum.test.js` (Test „kameraZiel: Rechteck fuellt das Fenster deckend“ ersetzen), `test/home-raum.test.js` (Test „Kamera-Ziele (ganzzahliger Faktor) …“ Zeilen ~666–680 ersetzen bzw. entfernen)

**Interfaces:**
- Produces (alle in `Raum`, Lage = `{ faktor, x, y }` wie `translate(x px, y px) scale(faktor)`, Ursprung 0 0):
  - `SPIELER_ANTEIL = 0.5`
  - `lageRuhe(w, h)` → `{ faktor: s.faktor, x: s.links, y: s.oben }` mit `s = skalierung(w, h, RAUM_RAHMEN)`
  - `lageSpieler(w, h)` → Faktor `SPIELER_ANTEIL * h / PLATTENSPIELER_RECHTECK.h`, gezoomt um die Mitte des Plattenspielers in Ruhelage (Mitte bleibt am Bildschirm); danach so wenig wie nötig verschieben, dass (a) der Plattenspieler ganz im Fenster liegt und (b) der sichtbare Bildausschnitt in x ∈ [RAUM_RAHMEN.x, RAUM_RAHMEN.x + RAUM_RAHMEN.b] und y ∈ [0, BILD.hoehe] bleibt. Passt beides nicht, Faktor verkleinern, bis es passt (nie unter `lageRuhe(...).faktor`).
  - `lageTv(w, h)` → Faktor `max(w / TV_RECHTECK.b, h / TV_RECHTECK.h)` (nicht gerundet), TV-Mitte auf Fenstermitte.
  - `fixpunkt(a, b)` → `{ x, y }` Bildschirmpunkt, der bei der Fahrt a → b stehen bleibt: Bildpunkt `P = (b.x − a.x) / (a.faktor − b.faktor)` (je Achse), `F = a.faktor · P + a.x`; `null`, wenn die Faktoren gleich sind.

- [ ] **Step 1: Failing tests in `test/raum.test.js`** (Größen `[...GROESSEN, [700, 900], [3000, 500], [800, 1400]]`, je Größe `w, h`; Bildschirm-Rechteck eines Bild-Rechtecks r bei Lage L: `{ x: L.x + r.x·L.faktor, y: …, b: r.b·L.faktor, h: … }`):
  - `lageSpieler`: Plattenspieler-Rechteck ganz im Fenster (±1 px); Höhe = `0.5 · h` ±1 px, außer der Faktor wurde nach Regel verkleinert (dann Höhe < `0.5 · h` und ≥ Ruhe-Höhe); sichtbarer Ausschnitt `[-x/f, (w−x)/f] × [-y/f, (h−y)/f]` innerhalb der Grenzen oben (±0,5 Bildpx).
  - `fixpunkt(lageRuhe, lageSpieler)` liegt im Bildschirm-Rechteck des Plattenspielers **in Ruhelage** (Kern-Anforderung „nicht schieben“).
  - `lageTv`: TV-Rechteck deckt das Fenster (links ≤ 0, rechts ≥ w, oben ≤ 0, unten ≥ h, ±1 px).
  - `fixpunkt(lageRuhe, lageTv)` liegt im Bildschirm-Rechteck des TV in Ruhelage.
  - Fixpunkt-Probe: für a = Ruhe, b = Spieler und p ∈ {0, .25, .5, .75, 1}: Lage `{ faktor: a.f + (b.f−a.f)p, x: a.x + (b.x−a.x)p, y: … }` bildet den Bildpunkt unter F immer auf F ab (±1e-6).
  - `fixpunkt(a, a)` → `null`.
  - `kameraZiel` gibt es nicht mehr (`R.kameraZiel === undefined`).
- [ ] **Step 2:** `node --test test/raum.test.js` → FAIL (Funktionen fehlen).
- [ ] **Step 3:** Funktionen wie unter Interfaces in `renderer/lib/raum.js` umsetzen und exportieren; `kameraZiel` entfernen.
- [ ] **Step 4:** `node --test test/raum.test.js` → PASS. (`home-raum-dom.js` nutzt `Raum.kameraZiel` noch → Task 2; `npm test` hier noch nicht grün erwartet, daher kein eigener Commit.)

### Task 2: Ablauf in `home-raum-dom.js`, CSS, `home.js`

**Files:**
- Modify: `renderer/video/home-raum-dom.js` (`ABLAUF_MS`, `kameraZiel()`, `zeigeAblauf`, `versteckeAblauf`)
- Modify: `renderer/video/home-raum.css` (Ablauf-Regeln ab „Auflegen: durchsichtige Fangschicht“, ~Z. 325–342)
- Modify: `renderer/video/home.js` (`mindestMs`, `ladeWert` TV-Bild für VOD)
- Test: `test/home-raum.test.js` (Tests „Ablauf: Phasenlaengen …“, „zeigeAblauf: Klassen …“, „CSS: Uebergaenge …“, „Kamera: Plattenspieler …“, „versteckeAblauf …“, „Fernseher-Rechteck kommt aus Raum.TV_RECHTECK“, „home.js: Auflegen zeigt den neuen Kanal …“ an den neuen Ablauf anpassen)

**Interfaces:**
- Consumes: `Raum.lageRuhe`, `Raum.lageSpieler`, `Raum.lageTv` (Task 1).
- Klassen an `#home` (zusätzlich zu `im-ablauf`), in dieser Reihenfolge gesetzt: `ablauf-raum` (0) → `ablauf-spieler` (500) → `ablauf-dreht` (2000, Platte an: `aus(t.dreht, false)`) → `ablauf-zurueck` (3200, **`ablauf-spieler` wird dabei entfernt**) → `ablauf-an` (4700) → `ablauf-tv` (5900, Ende 7900). Zeiten = laufende Summe von `ABLAUF_MS`.

- [ ] **Step 1: Failing tests** in `test/home-raum.test.js` (bestehende Ablauf-Tests ersetzen):
  - `ABLAUF_MS` deepEqual `{ raum: 500, spieler: 1500, auflegen: 1200, zurueck: 1500, an: 700, zeigen: 500, tv: 2000 }`, Summe 7900, `mindestMs: 7900` in `home.js`.
  - `zeigeAblauf`: Klassen in obiger Reihenfolge; `abschnitt(…)`-Zeiten als Summen aus `m.*`; beim Zurück `classList.remove('ablauf-spieler')`; `neuAusrichten()` bei spieler, zurueck und tv (3×).
  - `kameraZiel()`: `ablauf-tv` → `Raum.lageTv(…)`, sonst `ablauf-spieler` → `Raum.lageSpieler(…)`, sonst `null` (Ruhe). `ablauf-tv` wird vor `ablauf-spieler` geprüft. Kein `Raum.kameraZiel` mehr in `js`.
  - CSS: `#home.ablauf-spieler #raum-ebene .raum-bildebene { transition: transform 1500ms ease-in-out }`, `#home.ablauf-zurueck … 1500ms ease-in-out`, `#home.ablauf-tv … 2000ms ease-in`; die tv-Regel steht nach den anderen beiden.
  - CSS TV: `#home.im-ablauf:not(.ablauf-an):not(.ablauf-tv) .raum-tv { visibility: hidden; }`; `#home.ablauf-an .raum-tv { animation: raum-tv-an 700ms steps(1) 1 both; }`; `@keyframes raum-tv-an` mit mindestens zwei „aus“-Stufen (`visibility: hidden`) vor dem Ende, Ende sichtbar.
  - `versteckeAblauf` entfernt `'im-ablauf', 'ablauf-raum', 'ablauf-spieler', 'ablauf-dreht', 'ablauf-zurueck', 'ablauf-an', 'ablauf-tv'`.
  - Größenwechsel: `neuAusrichten()` nutzt weiter `kameraZiel()` (Review Focus 1) – bestehender Nachweis `const kamera = kameraZiel();` in `neuAusrichten` bleibt.
  - `home.js` `ladeWert`: TV-Bild vor `zeigeAblauf` gesetzt; live wie heute (`HomeBuehne.vorschauUrl(kanal.login, Date.now())`), sonst VOD-Bild über eine neue Funktion `vodVorschau(id)` (sucht in `vods && vods.liste` den Eintrag mit `v.id === id`, gibt `v.thumb || null`), ohne Treffer `null` → `setzeTv(null)` (Review Focus 4).
- [ ] **Step 2:** `npm test` → die neuen Tests FAIL.
- [ ] **Step 3:** `ABLAUF_MS`, `kameraZiel()`, `zeigeAblauf`, `versteckeAblauf` in `home-raum-dom.js`, die CSS-Regeln (alte `ablauf-zoom`-Regel ersetzen; Kommentare der Abschnitte nachziehen), `mindestMs` und `vodVorschau` + Aufruf in `ladeWert` in `home.js` umsetzen. Flacker-Schritte (hart, ohne Überblendung) wählt der Bauende, z. B. an 0–11 %, aus 11–20 %, an 20–29 %, aus 29–46 %, an ab 46 %.
- [ ] **Step 4:** `npm test` → alles grün (inkl. Task 1).
- [ ] **Step 5: Commit** (Task 1 + 2 zusammen, da erst hier grün):

```bash
git add renderer/lib/raum.js renderer/video/home-raum-dom.js renderer/video/home-raum.css renderer/video/home.js test/raum.test.js test/home-raum.test.js
git commit -m "feat(home): Auflegen neu - sanft zum Plattenspieler, raus zum Raum, TV flackert an, rein in den TV" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Doku und Übergabe

**Files:**
- Modify: `docs/TODO.md` (Abschnitt „Regal neu“ → „Nächste Schritte“ Punkt 1 als gebaut markieren; offene Optik-Fragen: Dauern, `SPIELER_ANTEIL`, Flacker-Muster)

- [ ] **Step 1:** TODO nachziehen.
- [ ] **Step 2:** `npm test` grün, Commit `docs: Auflegen neu - Stand und offene Fragen`.
- [ ] **Step 3:** Dev-App neu starten (laufende `electron`-Instanz schließen, `npm start`), Janis schaut an. Keine eigenen Screenshots oder Eingaben in die App.
