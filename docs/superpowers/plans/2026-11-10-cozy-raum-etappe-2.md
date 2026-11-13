# Cozy-Raum Etappe 2 (Raum als Home) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home ist nicht mehr die CD-Bühne, sondern der Pixel-Raum: erst der ganze Raum als Hauptmenü mit fünf anklickbaren Gegenständen, dann die Regal-Ansicht mit Schallplatten; beim Abspielen fährt die Kamera zurück, die Platte landet auf dem Plattenspieler und die Kamera zoomt in den Fernseher.

**Architecture:** Die Steuerung in `renderer/video/home.js` (Kanäle laden, Suche, Enter-Reihenfolge, Sterne, VODs, Kanalpunkte, Anmeldung) und der Zustand in `renderer/lib/home-buehne.js` bleiben. Ausgetauscht wird nur die Darstellung: `renderer/video/home-buehne-dom.js` (CD-Hülle, Ständer, Laufwerk, Riesen-Namen) weicht `renderer/video/home-raum-dom.js` mit derselben Aufruf-Schnittstelle, wo es geht. Neu sind zwei DOM-freie Bausteine: `renderer/lib/raum.js` (Klickflächen in Bild-Koordinaten, Skalierung, Kamera-Ziele) und die Erweiterung des Laufwerk-Ablaufs um „Überspringen“. Kamera-Fahrten sind reine `transform`-Übergänge auf einer Raum-Ebene.

**Tech Stack:** Electron, Renderer als `<script>`-Dateien im UMD-Stil, CSS, Canvas 2D (TV-Bild), Python + Pillow nur als Bild-Werkzeug unter `tools/`, Tests mit `node --test` (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-10-cozy-raum-design.md` (Tabelle „Von Janis entschieden“, Abschnitt „Etappe 2 – Raum als Home“, „Technik“).

## Global Constraints

- Branch `feat/cozy-raum`. Kein Merge, kein Release, kein Versions-Bump.
- `npm test` ist nach jedem Task grün. Ausgangsstand: 606 Tests, 0 Fehler.
- Dateien nur mit Write/Edit anlegen und ändern, nie per Shell-Heredoc. Bilder entstehen durch `tools/raum-bilder.py`.
- Keine Zugangsdaten in Code, Tests, Commits.
- Pixel-Bilder nur ganzzahlig vergrößern, immer `image-rendering: pixelated`. Ausnahme: während einer Kamera-Fahrt darf der Zwischenstand unscharf skaliert sein; Start- und Endzustand sind ganzzahlig.
- Keine Verläufe und kein `backdrop-filter` in den neuen Home-Stilen.
- Unverändert bleiben und werden weiter benutzt: `renderer/lib/home-liste.js`, `renderer/lib/home-punkte.js`, `src/home-punkte.js`, `renderer/lib/anmeldung.js`, `renderer/lib/stream-info.js` und ihre Tests; in `renderer/lib/home-buehne.js` bleiben `createBuehne`, `createRad`, `vorschauUrl`, `staenderEintraege` unverändert.
- Verhalten, das erhalten bleiben muss (Home-CD-Specs `docs/superpowers/specs/2026-11-09-home-cd-design.md` und `…-v2-design.md`, soweit sie Verhalten beschreiben): Enter-Reihenfolge (`HomeListe.enterZiel`), Warten auf die Twitch-Suche höchstens 1500 ms, Esc geht schrittweise zurück, Stern ohne Netzabfrage, VOD-Rückseite mit 4 je Seite und „Alle VODs“ ab 24, Kanalpunkte nur für die gewählte Live-Platte, eine gerade offline gegangene gewählte Platte bleibt markiert stehen bis man weiterblättert, Home schließt erst wenn Ablauf **und** Laden fertig sind, Ladefehler zeigt die Hinweiszeile.
- `preload.js` und `main.js` bleiben unverändert (keine neuen IPC-Kanäle).
- Profilbilder 300 px und VOD-Bilder 640×360 wie bisher; sie werden grob verpixelt gezeigt (kleine Canvas, scharfkantig vergrößert, wie `#si-avatar-pixel` in der Video-Leiste).
- Die App nicht selbst anschauen, keine Screenshots: Anschauen macht Janis.
- Commit-Nachrichten enden mit `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Festlegungen (Claudes Vorschlag, soweit nicht im Entwurf entschieden; Janis gibt den Plan frei)

1. **Zwei Ansichten in Home:** `raum` (Hauptmenü) und `regal`. Home öffnet in `raum`. Ist das Fenster so klein, dass der Raum nicht mindestens in Faktor 2 passt (unter 688×384 nutzbarer Fläche), öffnet Home direkt in `regal`.
2. **Tippen im Raum:** ein Buchstabe oder eine Ziffer wechselt sofort in die Regal-Ansicht und landet im Suchfeld; Strg+L und der Klick auf die Stream-Infos (`window.homeMitSuche`) öffnen direkt die Regal-Ansicht mit Fokus im Suchfeld.
3. **Klick im Raum:** Regal → Regal-Ansicht. Fernseher → Home schließen und zum laufenden Stream zurück (läuft nichts: Hinweis-Schild „Nichts geladen“). Plattenspieler → Schild mit dem, was gerade aufliegt (Kanalname, bei VOD „VOD“), sonst „Leer“. Bild an der Wand → Tafel „Twitch-Konto“ (die heutige Anmelde-Zeile). Stehlampe → Tafel „Licht“ mit dem Schalter „Animationen“ (`saveThemePrefs({ animationen })`) und dem Satz „Weitere Einstellungen: ⚙ im Chat“. Katze, Tee, Fenster: nichts.
4. **Hover im Raum:** vier helle Pixel-Winkel an den Ecken der Klickfläche und ein kleines Holzschild mit dem Namen darüber (kein Umriss entlang der Form; dafür fehlen Masken).
5. **Regal-Ansicht:** `regal.png` füllt das Fenster (Faktor wie beim Raum). Oberes Fach = Live-Platten (★-Favoriten zuerst), mittleres Fach = Offline-Favoriten, bei Suche Offline- und Twitch-Treffer. Jede Platte ist eine Hülle 40×40 Bildpixel mit dem verpixelten Profilbild; Live-Platten tragen ein rotes Lämpchen, Offline-Platten sind entsättigt. Passen nicht alle ins Fach, blättert das Fach seitwärts (Mausrad im Fach, Pfeiltasten wie bisher über die Live-Reihe).
6. **Gewählte Platte:** steht groß vorn über dem Bücherfach (Hülle in doppelter Größe, die Schallplatte schaut rechts halb heraus), daneben der Zettel mit Kanal, Titel, Spiel, Zuschauern, Laufzeit, Kanalpunkten, ★ und den Knöpfen „Auflegen“ und „VODs“. „VODs“ dreht die Hülle um: 2×2 VOD-Bilder mit Blättern wie bisher.
7. **Suchfeld:** ein Papierzettel oben am Regal (über dem obersten Brett), darauf das Eingabefeld und ⟳.
8. **Auflegen-Ablauf** (ersetzt das Laufwerk; nur mit Kanal und „Animationen an“): Regal-Ansicht blendet zum Raum über (500 ms), eine kleine Platte fliegt vom Regal zum Plattenspieler und dreht sich dort (1500 ms), die Kamera zoomt in den Fernseher, bis der Bildschirm das Fenster füllt (2500 ms). Mindestdauer zusammen 4500 ms; ein Klick oder eine Taste überspringt den Rest (das Laden muss trotzdem fertig sein). Fehler: Ablauf weg, zurück in die Regal-Ansicht, Hinweiszeile.
9. **Fernseher im Raum:** läuft ein Live-Stream, zeigt der Bildschirm dessen Vorschaubild (`HomeBuehne.vorschauUrl`) verpixelt und in die schräge Bildschirmfläche gelegt; sonst eine dunkle „aus“-Fläche. Das Grün aus `raum.png` ist nie zu sehen.
10. **Entfällt:** CD-Hülle, CD, Laufwerk, Ständer, Riesen-Namen (`zeichneNamen`, `zeichneMitte`, `namenAuswahl`, `zeilenInhalt`, `setzeMitteY`), `cdWechsel`. Die alte Listen-Ansicht „Alle VODs“ (`#home-vod-view`) bleibt als Tafel über dem Regal.
11. **Home-Kopfzeile** (`#home-head` mit „Home“, ← und ✕) entfällt als Leiste: ✕ und ← werden Pixel-Knöpfe oben rechts über dem Bild; `#home-version` bleibt unten rechts.

## Feste Werte

Bildkoordinaten (Pixel im Originalbild), am Bild gemessen 10.11.2026:

| Was | Wert |
|---|---|
| `raum.png` | 344×192 |
| Klickfläche Regal | x 100, y 14, b 64, h 116 |
| Klickfläche Stehlampe | x 165, y 6, b 31, h 104 |
| Klickfläche Fernseher | x 198, y 38, b 70, h 70 |
| Klickfläche Plattenspieler | x 262, y 86, b 46, h 42 |
| Klickfläche Bild | x 282, y 36, b 32, h 54 |
| Reihenfolge bei Überlappung | Plattenspieler vor Fernseher vor Bild vor Lampe vor Regal |
| Grüner Bildschirm (umschließendes Rechteck) | x 206–232, y 52–89 |
| Plattenteller (Ziel der fliegenden Platte) | Mitte x 284, y 113 |
| `regal.png` | 344×192 |
| Oberes Fach (innen) | x 114, y 19, b 175, h 46 |
| Mittleres Fach (innen) | x 114, y 80, b 175, h 43 |
| Bücherfach (Platz der gewählten Platte) | x 114, y 138, b 175, h 52 |
| Hülle | 40×40, Fenster fürs Profilbild 30×30 bei (5, 5) |
| Abstand der Hüllen im Fach | 4 Bildpixel |
| Mindestdauer Auflegen | 4500 ms |

Die Eckpunkte der schrägen Bildschirmfläche (vier Punkte für die Verzerrung) sind **ungeprüft** und werden in Task 1 aus den grünen Pixeln berechnet und in `raum.js` eingetragen.

## Nach der Prüfung (11.11.2026, gilt vor allem Obigen)

Funde: `docs/superpowers/plans/2026-11-10-cozy-raum-etappe-2-pruefung.md` (P1 = Umsetzbarkeit, P2 = Code-Fakten). Ausgangsstand gemessen: 606 Tests, 0 Fehler.

**Bilder (Task 1)**
- Voraussetzung: Python 3 + Pillow. Die erzeugten PNGs werden committet; `npm test` braucht kein Python.
- `huelle.png` (heute 64×64) wird **überschrieben**; das Original vorher nach `entwuerfe/huelle-64.png` kopieren. Quelle der kleinen Platte ist `platte.png` (64×64), nearest-neighbour auf 12×12 (`platte-klein.png`) und auf 36×36 (`platte-vorn.png`, die halb herausschauende Platte vorn).
- `zettel.png` = Zuschnitt (27, 13)–(156, 109) aus `entwuerfe/zettel-schild.png` (129×96), Pinnnadel (Bereich x 80–106, y 13–37 im Original) mit Papier überdecken: die Zeilen aus dem gleichen y-Bereich bei x 40–66 hineinkopieren, danach groß ansehen. `schild.png` = Zuschnitt (26, 120)–(157, 161) (131×41). Beide werden **nur als 9-Slice-Rahmen** (`border-image`, Slice 6, Breite 6 Bildpixel × Faktor) benutzt, damit sie jede Größe annehmen.
- Test prüft Maße aller Dateien (auch `raum.png`, `regal.png`) **und** Inhalt per kleinem PNG-Dekoder in Node (`zlib.inflateSync`, nur Farbtyp 6/8 Bit nötig): `raum-tv-aus.png` hat 0 Pixel mit G > 200 und R < 90; `huelle.png` hat Alpha 0 im Fenster (5, 5, 30, 30); Zahl der deckenden Maskenpixel = Zahl der grünen Pixel in `raum.png`.
- `TV_ECKEN`: aus den grünen Pixeln die Extrempunkte von x+y (min = oben links, max = unten rechts) und x−y (max = oben rechts, min = unten links), als **Pixelkanten** (unten rechts +1). Ausgabe eine JSON-Zeile `{"tvEcken":[{x,y}×4]}`. Die Darstellung nutzt drei Ecken (oben links, oben rechts, unten links) für eine affine Abbildung; die Maske beschneidet den Rest. Test in Task 2: alle Ecken in x 206–233, y 52–90.

**Logik (Task 2)**
- `treffer` ist halboffen [x, x+b) × [y, y+h); Randtest `treffer(164, 60) === null`, `treffer(165, 60) === 'lampe'`. `zuBild` rundet mit `Math.floor`.
- `kameraZiel`: `faktor = Math.ceil(Math.max(W / b, H / h))`, `x = Math.round(W/2 − (rx + b/2)·faktor)`, `y` analog. Test genau: `kameraZiel({x:206,y:52,b:27,h:38},1400,800)` → `{ faktor: 52, x: -10714, y: -3292 }`.
- `fachFenster`: `sichtbar` hängt nur von der Fachbreite ab; `start` geklemmt auf `0 … max(0, anzahl − sichtbar)`; zusätzliche Fälle `fachFenster(0, -1, 175, 3)` → start 0, `fachFenster(5, 9, 175, 0)` → Index wird auf `anzahl − 1` geklemmt.
- `createLaufwerk` hat heute `laeuft`, `start`, `geladen`, `abbrechen`; neu `ueberspringen()` (Timer löschen, `zeitUm = true`, `pruefe()`). Die fünf Tests (P1-3 a–e) werden ausgeschrieben, mit den Fake-Timern der bestehenden Laufwerk-Tests.

**Darstellung (Task 3)**
- In Task 3 ist `zeigeAblauf` nur: `#home-ablauf` einblenden + Klick/Taste ruft `beiUeberspringen`; `setzeTv` zeigt nur `raum-tv-aus.png`. Die Prüfung auf `Raum.kameraZiel` steht erst in Task 5.
- Gemessen wird immer `#home.clientWidth/clientHeight` (für `skalierung`, `passtAlsRaum`, `neuAusrichten`).
- **Vordere Platte (ersetzt Festlegung 6, Optik von Janis zu beurteilen):** Hülle in 1× (40×40) bei Bildpunkt (118, 144) im Bücherfach, `platte-vorn.png` dahinter um 18 px nach rechts versetzt; Zettel (9-Slice) bei x 178–289, y 140–188 mit dem Text in der nicht skalierten Schicht. „VODs“: Hülle, Platte und Zettel weichen einer Rückseite über das ganze Bücherfach: 2×2 Vorschaubilder je 64×18 Bildpixel (Canvas 32×9, verpixelt), Blättern ‹ › an den Rändern.
- Mausrad: die Darstellung blättert selbst im Fach (Start je Fach ist interner Zustand von `HomeRaumDom`), ohne die Auswahl zu ändern; `zeichneStaender` setzt den Start mit `fachFenster` so, dass die gewählte Platte sichtbar ist.
- `init` bekommt zusätzlich die IDs: ✕ = `#home-close`, ← = `#home-back` bleiben als Pixel-Knöpfe erhalten; der Titel `#home-title` wandert in die Tafel (Überschrift der „Alle VODs“-Tafel).

**Home umstellen (Task 4)**
- `video.js` bekommt `window.laeuftEtwas = () => infoQuelle ? { mode: infoQuelle.mode, login: infoQuelle.mode === 'live' ? infoQuelle.wert : null } : null`. `home.js` nutzt nur diese Funktion (für Fernseher-Klick und `setzeTv`).
- `buildVodCard` lädt über `ladeWert(v.id, null)` statt `submitLoad` + `closeHome` (kein Ablauf ohne Kanal, `onLoad` schließt sofort – so wie heute bei VOD-Links per Enter).
- Schließen-Test (statisch): `closeHome(` steht in `home.js` nur in `closeHomeResume` (zweimal: früher Ausstieg und normaler Weg), im Erfolg von `ladeWert` und in `onLoad`; `notifyHomeClose` genau einmal.
- Aus `index.html` fliegen `#home-head`-Leiste, `#home-namen`, `#home-buehne`, `#cd-huelle`, `#cd-info`, `#home-staender` samt dem `ResizeObserver` auf `#cd-info`. `#home-kanaele` bleibt als Behälter der Regal-Ansicht (der 60-s-Refresh hängt an seiner Sichtbarkeit). grep-Prüfung: `cd-huelle|cd-laufwerk|cd-info|home-staender|home-namen|home-buehne"|HomeBuehneDom` → keine Treffer in `renderer/`.
- Gradient-/`backdrop-filter`-Test gilt auch für die verkleinerte `home.css`.
- Ziel je Aufrufer: Start der App und Home-Knopf → Raum; Strg+L und Klick auf die Stream-Infos (`homeMitSuche`) → Regal mit Fokus.
- Esc: `tafelOffen()` > Offline-Ansicht > Rückseite > Regal → Raum (wenn er passt) > schließen. ↑/↓ und Mausrad sind gesperrt, solange eine Tafel offen ist.

## Review Focus

1. Home wird geöffnet, während ein Stream läuft, und per Esc/✕/Fernseher wieder geschlossen: der Chat verbindet sich genau einmal neu (`notifyHomeClose`), nicht doppelt und nicht gar nicht. → Task 4, Test „Schließen-Wege“ (statisch) und Handprobe durch Janis.
2. Klick oder Taste während des Auflegens, bevor das Laden fertig ist: der Ablauf wartet aufs Laden und schließt dann sofort; schlägt das Laden fehl, steht man wieder im Regal mit Hinweis. → Task 2, Tests „überspringen“.
3. Fenstergröße ändert sich bei offenem Home (auch Andocken ◫): Bild-Faktor, Klickflächen und Kamera-Ziel stimmen danach wieder. → Task 2, Tests „skalierung“; Task 3 setzt bei `resize` neu.
4. Kanal ohne Profilbild oder Bild lädt nicht: die Hülle zeigt eine leere Fläche mit dem Anfangsbuchstaben, kein kaputtes Bild-Symbol. → Task 3, statischer Test auf den `error`-Zweig.
5. Mehr Platten als ins Fach passen (z. B. 30 Live-Kanäle): alle sind erreichbar, die gewählte ist immer im Sichtbereich. → Task 2, Test „fachFenster“.

---

### Task 1: Bilder vorbereiten (Werkzeug)

**Files:**
- Create: `tools/raum-bilder.py`
- Create (Ausgabe des Werkzeugs, in `renderer/themes/cozy/`): `raum-tv-aus.png` (344×192, `raum.png` mit dunkler „aus“-Fläche statt Grün), `raum-tv-maske.png` (344×192, grüne Pixel deckend weiß, alles andere durchsichtig), `huelle.png` (40×40, ersetzt die 64er-Auswahl: dunkler Rahmen wie Entwurf `huelle-06`, Fenster 30×30 durchsichtig), `huelle-rueck.png` (40×40, Rückseite, einfarbig Karton), `platte-klein.png` (12×12, die fliegende Platte im Raum), `zettel.png` und `schild.png` (aus `entwuerfe/zettel-schild.png` zugeschnitten; beim Zettel die Pinnnadel entfernen)
- Create: `test/raum-bilder.test.js`

**Interfaces:**
- Produces: die Dateien oben; `tools/raum-bilder.py renderer/themes/cozy` gibt die vier Eckpunkte der Bildschirmfläche aus (oben links, oben rechts, unten rechts, unten links), die Task 2 als `Raum.TV_ECKEN` einträgt.

- [ ] **Step 1: Test schreiben** — prüft je Datei: vorhanden, PNG-Kopf, Breite/Höhe (aus dem IHDR-Block gelesen, Bytes 16–23) gleich der Tabelle oben.
- [ ] **Step 2: Fehlschlag sehen** — `node --test test/raum-bilder.test.js` → FAIL.
- [ ] **Step 3: `tools/raum-bilder.py` schreiben und ausführen.** Grün = Pixel mit G > 200 und R < 90. „Aus“-Farbe `#1a1410` mit einer helleren Glanzlinie oben links. Jedes erzeugte Bild vergrößert ansehen (Regel „Bilder vor dem Zeigen prüfen“).
- [ ] **Step 4: Prüfen** — `npm test` → 0 Fehler.
- [ ] **Step 5: Commit** — `feat: Bild-Werkzeug und abgeleitete Bilder fuer den Raum`.

---

### Task 2: DOM-freie Logik (Raum-Geometrie, Fach-Fenster, Ablauf)

**Files:**
- Create: `renderer/lib/raum.js`, `test/raum.test.js`
- Modify: `renderer/lib/home-buehne.js` (`createLaufwerk` bekommt `ueberspringen()`; sonst nichts — `namenAuswahl`/`zeilenInhalt` entfallen erst in Task 4, weil `home.js` sie bis dahin aufruft), `test/home-buehne.test.js`

**Interfaces:**
- Produces (`Raum`, UMD wie `renderer/lib/szene.js`):
  - `BILD = { breite: 344, hoehe: 192 }`, `FLAECHEN = [{ id, name, x, y, b, h }]` mit den ids `plattenspieler`, `fernseher`, `bild`, `lampe`, `regal` in dieser Reihenfolge und den Namen „Plattenspieler“, „Fernseher“, „Konto“, „Licht“, „Platten“
  - `FACH = { live: {x,y,b,h}, offline: {x,y,b,h}, vorn: {x,y,b,h} }`, `HUELLE = { kante: 40, abstand: 4 }`, `TV_ECKEN` (vier `{x,y}`), `TELLER = { x: 284, y: 113 }`
  - `skalierung(fensterBreite, fensterHoehe) -> { faktor, links, oben }`: größter ganzer Faktor ≥ 1, bei dem das Bild ins Fenster passt; `links`/`oben` zentrieren (dürfen negativ sein, wenn das Fenster kleiner als das Bild ist); Müll → Faktor 1
  - `passtAlsRaum(fensterBreite, fensterHoehe) -> boolean` (Faktor ≥ 2)
  - `treffer(bildX, bildY) -> id | null` (erste Fläche der Reihenfolge)
  - `zuBild(fensterX, fensterY, skal) -> { x, y }` (Fenster- in Bildkoordinaten)
  - `kameraZiel(rechteck, fensterBreite, fensterHoehe) -> { faktor, x, y }`: Verschiebung und Vergrößerung, bei der `rechteck` (Bildkoordinaten) das Fenster füllt (deckend, Mitte auf Mitte)
  - `fachFenster(anzahl, gewaehltIndex, fachBreite, start) -> { start, sichtbar }`: wie viele Hüllen passen (`floor((fachBreite + abstand) / (kante + abstand))`, mindestens 1), und der kleinste Verschub von `start`, bei dem `gewaehltIndex` sichtbar ist; `gewaehltIndex < 0` lässt `start` (geklemmt auf `0…anzahl − sichtbar`)
- Produces (`HomeBuehne.createLaufwerk`): zusätzlich `ueberspringen()` — gilt die Mindestdauer als abgelaufen (Timer löschen); fertig wird es weiterhin erst, wenn auch `geladen(true)` kam.

- [ ] **Step 1: Tests schreiben** (`test/raum.test.js`, Ergänzung in `test/home-buehne.test.js`)

```js
test('skalierung: groesster ganzer Faktor, zentriert', () => {
  assert.deepStrictEqual(R.skalierung(1400, 800), { faktor: 4, links: 12, oben: 16 });
  assert.deepStrictEqual(R.skalierung(700, 400), { faktor: 2, links: 6, oben: 8 });
  assert.strictEqual(R.skalierung(300, 150).faktor, 1);
  for (const [b, h] of [[0, 0], [NaN, 5], [-1, -1], ['x', {}]]) assert.strictEqual(R.skalierung(b, h).faktor, 1);
});
test('passtAlsRaum: erst ab Faktor 2', () => {
  assert.strictEqual(R.passtAlsRaum(688, 384), true);
  assert.strictEqual(R.passtAlsRaum(687, 384), false);
});
test('treffer: jede Flaeche in ihrer Mitte, Ueberlappung nach Reihenfolge, daneben null', () => {
  for (const f of R.FLAECHEN) assert.strictEqual(R.treffer(f.x + f.b / 2, f.y + f.h / 2) !== null, true, f.id);
  assert.strictEqual(R.treffer(130, 60), 'regal');
  assert.strictEqual(R.treffer(265, 100), 'plattenspieler');   // liegt auch im Fernseher-Rechteck
  assert.strictEqual(R.treffer(20, 180), null);
  assert.strictEqual(R.treffer(NaN, 3), null);
});
test('zuBild: rechnet Fenster- in Bildkoordinaten', () => {
  assert.deepStrictEqual(R.zuBild(12 + 4 * 100, 16 + 4 * 50, { faktor: 4, links: 12, oben: 16 }), { x: 100, y: 50 });
});
test('kameraZiel: Rechteck fuellt das Fenster deckend', () => {
  const z = R.kameraZiel({ x: 206, y: 52, b: 27, h: 38 }, 1400, 800);
  assert.ok(z.faktor * 27 >= 1400 && z.faktor * 38 >= 800);
  // Mitte des Rechtecks landet in der Fenstermitte
  assert.ok(Math.abs(z.x + (206 + 13.5) * z.faktor - 700) < 1);
  assert.ok(Math.abs(z.y + (52 + 19) * z.faktor - 400) < 1);
});
test('fachFenster: gewaehlte Huelle ist immer sichtbar', () => {
  assert.deepStrictEqual(R.fachFenster(30, 0, 175, 0), { start: 0, sichtbar: 4 });
  assert.deepStrictEqual(R.fachFenster(30, 9, 175, 0), { start: 6, sichtbar: 4 });
  assert.deepStrictEqual(R.fachFenster(30, 2, 175, 6), { start: 2, sichtbar: 4 });
  assert.deepStrictEqual(R.fachFenster(3, -1, 175, 5), { start: 0, sichtbar: 4 });
  assert.strictEqual(R.fachFenster(5, 0, 10, 0).sichtbar, 1);
});
// home-buehne.test.js
test('Laufwerk: ueberspringen beendet die Mindestdauer, wartet aber aufs Laden', () => { /* start; ueberspringen -> noch nicht fertig; geladen(true) -> cb(true) */ });
test('Laufwerk: ueberspringen nach geladen(true) ist sofort fertig', () => { /* … */ });
test('Laufwerk: ueberspringen ohne Lauf tut nichts', () => { /* … */ });
```

- [ ] **Step 2: Fehlschlag sehen** — `npm test` → FAIL in den neuen Tests.
- [ ] **Step 3: `raum.js` schreiben, `createLaufwerk` um `ueberspringen()` ergänzen.**
- [ ] **Step 4: Prüfen** — `npm test` → 0 Fehler.
- [ ] **Step 5: Commit** — `feat: Raum-Geometrie, Fach-Fenster und ueberspringbarer Ablauf`.

---

### Task 3: Darstellung Raum und Regal

**Files:**
- Create: `renderer/video/home-raum-dom.js`, `renderer/video/home-raum.css`
- Create: `test/home-raum.test.js` (statisch)

**Interfaces:**
- Consumes: `Raum.*` (Task 2), Bilder (Task 1), Klassen aus `renderer/themes/cozy/raum.css`.
- Produces (`HomeRaumDom`, globales Objekt wie heute `HomeBuehneDom`):
  - `init({ wirt, beiFlaeche(id), beiSchliessen(), beiZurueck() })` baut einmalig die Ebenen in `#home`: `#raum-ebene` (Raum-Bild, TV-Canvas, Hover-Winkel, Schild), `#regal-ebene` (Regal-Bild, zwei Fächer, vordere Platte, Zettel, Such-Zettel), `#home-tafel` (Konto/Licht/Alle VODs), `#home-ablauf` (Auflegen)
  - `zeigeAnsicht('raum' | 'regal')`, `ansicht()`
  - `zeichneBuehne(stand, handler)` — gleiche Felder wie heute (`kanal, modus, rueckseite, punkte, leerText, ladend`), zeichnet vordere Platte + Zettel bzw. die VOD-Rückseite; Handler-Namen unverändert (`laden, stern, vods, rueckseiteZu, vod, vodSeite, mehr`)
  - `zeichneStaender(eintraege, gewaehltLogin, handler)` — gleiche Eingabe wie heute, verteilt auf die zwei Fächer (`art === 'live'` oben, sonst Mitte); Handler `waehle(k, art)`, `stern(k)`
  - `fachBlaettern(fach, richtung)`
  - `zeigeAblauf(kanal, beiUeberspringen)`, `versteckeAblauf()`
  - `zeigeTafel(art, inhaltElement)`, `versteckeTafel()`, `tafelOffen()`
  - `zeigeSchild(text)` (kurzer Hinweis im Raum, verschwindet nach 2 s)
  - `setzeTv({ vorschauUrl | null })`
  - `neuAusrichten()` (nach `resize`)

- [ ] **Step 1: Statischen Test schreiben** — prüft an den Quelltexten: alle Namen aus „Produces“ stehen im `return` von `home-raum-dom.js`; die Datei nennt weder `cd-huelle` noch `cd-laufwerk` noch `home-staender`; sie nutzt `Raum.skalierung`, `Raum.treffer`, `Raum.fachFenster`, `Raum.kameraZiel`; Bilder werden nur aus `../themes/cozy/` geladen außer Profil-/Vorschau-/VOD-Bildern; für Profilbilder gibt es einen `error`-Zweig mit Anfangsbuchstaben; `home-raum.css` enthält weder `gradient` noch `backdrop-filter` und setzt `image-rendering: pixelated` für die Ebenen.
- [ ] **Step 2: Fehlschlag sehen.**
- [ ] **Step 3: Schreiben.** Raum- und Regal-Bild liegen je in einer Ebene mit `transform: translate(x, y) scale(f)` und `transform-origin: 0 0`; alle Kinder (Fächer, Hüllen, Zettel) sind in Bildkoordinaten positioniert und skalieren mit. Text auf Zettel und Schild ist die Ausnahme: er sitzt in einer nicht skalierten Schicht darüber, positioniert aus Bildkoordinaten × Faktor, damit er lesbar bleibt (Pixel-Schrift `var(--schrift-pixel)`). Hüllen: `<canvas width="15" height="15">` fürs Profilbild im 30×30-Fenster.
- [ ] **Step 4: Prüfen** — `npm test` → 0 Fehler; `node --check renderer/video/home-raum-dom.js`.
- [ ] **Step 5: Commit** — `feat: Darstellung fuer Raum und Regal`.

---

### Task 4: Home umstellen

**Files:**
- Modify: `renderer/video/index.html` (`#home`-Inhalt, Script- und Stylesheet-Zeilen), `renderer/video/home.js`
- Delete: `renderer/video/home-buehne-dom.js`; aus `renderer/video/home.css` alles außer den Regeln für `#home` selbst, `#home-vod-view`/`.vod…`, `#auth-bar…`, `.empty`, `#home-hinweis`, `#home-version`
- Modify: `renderer/lib/home-buehne.js`, `test/home-buehne.test.js` (jetzt `namenAuswahl`, `zeilenInhalt` und ihre Tests entfernen)
- Modify: `test/home-raum.test.js`

**Interfaces:**
- Consumes: `HomeRaumDom.*` (Task 3), `Raum.passtAlsRaum`, `HomeBuehne.createLaufwerk(...).ueberspringen`.

Änderungen in `home.js` (alles andere bleibt):
- `HomeBuehneDom.` → `HomeRaumDom.`; `zeigeLaufwerk`/`versteckeLaufwerk` → `zeigeAblauf(kanal, () => laufwerk.ueberspringen())`/`versteckeAblauf`; `laufwerk` mit `mindestMs: 4500`.
- Entfernen: `$namen`, `$huelle`, `$buehneFlaeche`, `$staender`, `namenAuswahl`, `setzeMitteY` samt `ResizeObserver` und `transitionend`, die Aufrufe `zeichneNamen`/`zeichneMitte`, `cdWechsel`/`cdWechselLaeuft` (in `renderHome` wird immer direkt `zeichneHuelle()` gerufen), das Scrollen des Ständers in `schritt` (stattdessen `HomeRaumDom.fachBlaettern('offline', r)`), die beiden `wheel`-Listener (das Mausrad hängt die Darstellung an ihre Fächer und meldet über `init`).
- `openHome(ziel)`: `ziel === 'regal'` oder `!Raum.passtAlsRaum(...)` → Regal, sonst Raum. `$suche.focus()` nur in der Regal-Ansicht.
- Neu `beiFlaeche(id)`: `regal` → Regal-Ansicht + Fokus; `fernseher` → `closeHomeResume()` wenn etwas geladen ist (`document.body.classList.contains('onair')` oder die Stream-Infos haben einen Kanal — geprüft wird über die vorhandene globale Auskunft in `video.js`; fehlt eine, eine kleine Funktion `window.laeuftEtwas()` in `video.js` ergänzen), sonst `zeigeSchild('Nichts geladen')`; `plattenspieler` → `zeigeSchild(...)`; `bild` → Tafel mit `#auth-bar`; `lampe` → Tafel „Licht“.
- Tasten: im Raum wechselt ein druckbares Zeichen (ohne Strg/Alt/Meta) in die Regal-Ansicht und landet im Suchfeld; Esc: Tafel zu > „Alle VODs“ zu > Offline-Ansicht > Rückseite > Regal → Raum (nur wenn der Raum passt) > schließen.
- `window.homeMitSuche` öffnet die Regal-Ansicht.
- `renderHome` ruft zusätzlich `HomeRaumDom.setzeTv(...)` mit der Vorschau des laufenden Live-Kanals (oder `null`).
- `resize` → `HomeRaumDom.neuAusrichten()`.

- [ ] **Step 1: Statischen Test ergänzen** — `renderer/video/index.html` lädt `lib/raum.js`, `home-raum-dom.js`, `home-raum.css` und nicht mehr `home-buehne-dom.js`; `home.js` nennt weder `HomeBuehneDom` noch `zeichneNamen`, `setzeMitteY`, `cdWechsel`; „Schließen-Wege“: `notifyHomeClose` steht in `home.js` genau einmal (in `closeHomeResume`) und alle Schließ-Stellen außer dem Erfolg von `ladeWert` und `onLoad` gehen über `closeHomeResume`; `HomeBuehne` exportiert `namenAuswahl`/`zeilenInhalt` nicht mehr; die Datei `home-buehne-dom.js` existiert nicht.
- [ ] **Step 2: Fehlschlag sehen.**
- [ ] **Step 3: Umbauen.**
- [ ] **Step 4: Prüfen** — `npm test` → 0 Fehler; `node --check` für `home.js`, `video.js`; `git grep -n -E "cd-huelle|cd-laufwerk|home-staender|home-namen|HomeBuehneDom" -- renderer` → keine Treffer.
- [ ] **Step 5: Commit** — `feat: Home ist der Raum mit Regal-Ansicht`.

---

### Task 5: Auflegen-Ablauf und Fernseher-Bild

**Files:**
- Modify: `renderer/video/home-raum-dom.js`, `renderer/video/home-raum.css`, `test/home-raum.test.js`

**Interfaces:**
- Consumes: `Raum.kameraZiel`, `Raum.TV_ECKEN`, `Raum.TELLER`, `raum-tv-maske.png`, `platte-klein.png`.

- [ ] **Step 1: Statischen Test ergänzen** — `zeigeAblauf` setzt nacheinander die Klassen `ablauf-raum`, `ablauf-platte`, `ablauf-zoom` (drei `setTimeout`/Übergänge mit 500, 1500, 2500 ms); ein Klick oder eine Taste auf `#home-ablauf` ruft `beiUeberspringen`; `versteckeAblauf` räumt Klassen und Timer weg; `setzeTv` zeichnet auf eine Canvas mit `setTransform` und beschneidet mit `globalCompositeOperation = 'destination-in'` über die Maske (kein `getImageData`, das bei fremden Bildern blockiert wäre); bei `data-animationen="aus"` stehen die Übergänge still (`transition: none`).
- [ ] **Step 2: Fehlschlag sehen.**
- [ ] **Step 3: Schreiben.** Kamera = `transform` der Raum-Ebene auf `Raum.kameraZiel(<Rechteck des Bildschirms>, …)`. Die fliegende Platte ist ein Element in Bildkoordinaten mit einem Übergang von der Regal-Mitte zu `Raum.TELLER`.
- [ ] **Step 4: Prüfen** — `npm test` → 0 Fehler.
- [ ] **Step 5: `docs/TODO.md`** — Abschnitt „Etappe 2 (eingebaut, wartet auf Janis' Urteil)“ mit den Festlegungen 1–11 in Stichpunkten; nächster Schritt Etappe 3.
- [ ] **Step 6: Commit** — `feat: Auflegen-Ablauf und Fernseher-Bild im Raum`.

---

## Abnahme Etappe 2

- `npm test` grün; Testzahl vorher/nachher im Bericht.
- Keine Reste der CD-Bühne in `renderer/`.
- Janis schaut an: Raum als Hauptmenü, Hover und Klick der fünf Gegenstände, Regal mit Platten, Suche, gewählte Platte mit Zettel, VOD-Rückseite, Auflegen bis in den Fernseher, Konto- und Licht-Tafel.
