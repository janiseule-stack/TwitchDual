# Chat-Hintergrund „Regennacht-Stadt“ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hinter dem Chat liegt eine ruhige PixelLab-Nachtstadt im Regen mit Gewitter-Phasen, Fensterlichtern nach Uhrzeit und Abos, Passanten, Autos und Raids auf einem eigenen Straßenband.

**Architecture:** Bilder kommen aus PixelLab (Tasks 1–3, Hauptchat + Janis' Wahl), ein Python-Werkzeug schneidet sie zu und schreibt die Maße nach `tools/raum-quellen/stadt.json` (Task 4). Reine, testbare Logik in `renderer/lib/stadt.js` (Maße, Uhrzeit, Gewitter-Phasen, Regisseur, Raid-Plan; Task 5), DOM in `renderer/lib/stadt-dom.js` (Task 6), Anbindung an Chat-Ereignisse in `chat.js` (Task 7). Die Deckkraft-Einstellung entfällt (Task 8).

**Tech Stack:** Electron-Renderer, plain JS (UMD-Libs wie `raum-leben.js`), CSS, Python/Pillow (`tools/`), PixelLab-MCP, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-13-chat-stadt-design.md`

## Global Constraints

- **Sichtbare Bilder nur aus PixelLab;** Code darf nur zuschneiden, skalieren, ausstanzen, einfärben (auch abdunkeln), spiegeln und bewegen – nie selbst Grafik zeichnen (auch keine CSS-Verläufe als Bild). Steht wörtlich in jedem Helfer-Auftrag.
- Palette in jedem Prompt: „warm limited color palette (amber, brown, muted green, soft cream)“, draußen kühler Nachtton mit warmen Fensterlichtern; Stilvorlage `renderer/themes/cozy/streifen.png` (per `get_upload_url` hochladen, als `style_image_url`).
- PixelLab Tier 1: `create_image_pro` max 344×192, `inpaint_image` max 256 px je Seite, max 8 Aufträge gleichzeitig; Stand 13.11.: 1003 Generationen bis 10.12. Vor jeder Runde Kosten nennen; Janis: Runden ohne Einzel-Rückfrage, solange es nicht Hunderte sind. Budget dieses Plans: höchstens ~250.
- Entwürfe nur in `renderer/themes/cozy/entwuerfe/` (gitignored), zum Anschauen nach `entwuerfe/_ANSCHAUEN/` – **nur neue Dateien hinzufügen, nichts löschen oder überschreiben**, was nicht in dieser Sitzung angelegt wurde.
- Pixel-Maßstab wie der Streifen oben (`Szene.masse`), `image-rendering: pixelated`.
- Lesbarkeit: hinter dem Text bleibt die Helligkeit gleich (Blitz nur im Himmel, Ausgleich durch Abdunkeln); im mittleren Bereich höchstens 1 bewegtes Ding.
- Blitz: nie über die ganze Fläche, höchstens einer alle 4 s, ≤ 300 ms; „Animationen aus“: kein Blitz, keine Bewegung, bleibende Zustände (Abo-Fenster, Uhrzeit-Lichter) schalten hart um.
- Kein Ton. Kanalpunkte-Kiste bleibt im Streifen oben.
- Dateien nur mit Edit/Write ändern (kein `sed -i`, `printf >>`, `echo >>`, Heredoc); `npm test` grün vor jedem Commit; Commits mit zwei `-m` und `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Anschauen macht Janis: keine eigenen Screenshots per CDP aus Janis' laufender App; Größen-Prüfung über Unit-Tests der festen Größenliste.

## Review Focus

1. Sehr breite oder sehr niedrige Chat-Fenster (z. B. 1397×400, 400×1332, 2560×1440) → Straßenband und Skyline sichtbar, keine Lücken, Nachrichtenbereich behält mindestens 50 % der Höhe. Test in Task 5 (`Stadt.masse`).
2. Großer Raid (≥ 200) während schneller Chat → Bus + Menge laufen nur im Straßenband, Dauer passt zur Straßenbreite (kein Abbruch mittendrin). Test in Task 5 (`raidPlan`, `raidDauer`).
3. Geschenk mit vielen Abos (z. B. 50) → höchstens so viele Fenster an, wie es gibt; danach bleibt es hell, kein Fehler. Test in Task 5 (`aboFenster`).
4. Fenster wird im Gewitter/Raid vergrößert → Ebenen richten sich neu aus, laufende Figuren springen höchstens, Stadt bleibt deckend. Test in Task 6 (Resize ruft `Stadt.masse` neu).
5. „Animationen aus“ mitten im Gewitter oder Raid → Blitz weg, Figuren weg, Warteschlange leer, Abo-Fenster bleiben an. Test in Task 6/7.

---

### Task 1: Stadt-Grundbild (Hauptchat + Janis, kein Code)

**Files:** nur Entwürfe unter `renderer/themes/cozy/entwuerfe/stadt/`, Übersicht nach `entwuerfe/_ANSCHAUEN/50-stadt-varianten.png`.

- [ ] **Step 1:** Kosten nennen (3 Varianten `create_image_pro` 344×192), dann erzeugen: Blick aus einem Fenster im 2. Stock auf eine nasse Straße bei Nacht, Häuserfront gegenüber mit vielen Fenstern (die meisten dunkel), Skyline dahinter, Himmel mit Gewitterwolken, Regen; Varianten in Perspektive/Dichte verschieden (z. B. A Straße schräg von oben, B frontal, C Skyline weit).
- [ ] **Step 2:** Jedes Bild groß ansehen (Nähte, Perspektive, Lesbarkeit: dunkel genug hinter der Mitte?) – Ungeeignetes nicht zeigen. Übersicht nach `_ANSCHAUEN`, Janis wählt (Ergebnis in „Janis' Wahl“ unten eintragen).

### Task 2: Ebenen und Varianten der gewählten Stadt (Hauptchat + Janis, kein Code)

**Files:** Entwürfe `entwuerfe/stadt/`, Quellen nach `tools/raum-quellen/stadt/`.

- [ ] **Step 1:** Hohes Format: Himmel nach oben und Straße nach unten per `inpaint_image` (≤ 256 px je Stück) erweitern, bis Seitenverhältnis ≥ 1:1,4 (hoch) erreicht ist; Nähte groß prüfen.
- [ ] **Step 2:** Varianten derselben Szene per `inpaint`/Edit: **Häuser mit hellen Fenstern** (gleiches Bild, viele Fenster warm erleuchtet – Quelle für Fensterlichter und Abo-Fenster), **Himmel mit Blitz** (Wolken von innen hell, Blitzstrahl; 2 Varianten).
- [ ] **Step 3:** Pixelgleichheit prüfen: dunkle und helle Häuser-Variante unterscheiden sich nur in Fensterflächen (Skript zählt abweichende Pixel außerhalb erkannter Fenster ≈ 0); sonst nachbessern.
- [ ] **Step 4:** Janis zeigen (`_ANSCHAUEN/51-stadt-ebenen.png`), Wahl eintragen.

### Task 3: Figuren und Fahrzeuge (Hauptchat + Janis, kein Code)

**Files:** Entwürfe `entwuerfe/stadt-figuren/`, Quellen `tools/raum-quellen/stadt/`.

- [ ] **Step 1:** Im Straßen-Maßstab des gewählten Bilds (Figurhöhe aus Task 2 messen): Passant mit Schirm, Gehzyklus 8 Bilder (`animate_character` o. ä.), 2–3 Varianten; Auto mit Scheinwerfern (Seitenansicht, 2–4 Bilder); Bus mit Türen (fahren, halten/Tür auf); Lieferrad optional.
- [ ] **Step 2:** Prüfen, Janis wählt; Schirmfarben werden später per Einfärben variiert (kein neues Bild nötig).

### Task 4: Werkzeug `tools/stadt-bilder.py` und `tools/raum-quellen/stadt.json`

**Files:**
- Create: `tools/stadt-bilder.py`, `tools/raum-quellen/stadt.json`, Bilder `renderer/themes/cozy/stadt-*.png`
- Test: `test/stadt-bilder.test.js`

**Interfaces:**
- Produces `stadt.json`: `{ bild: { b, h }, ebenen: { himmel: {y, h}, haeuser: {y, h}, strasse: {y, h} }, fenster: [{ x, y, b, h }, …], figur: { b, h, bilder, msProBild, pxProBild }, auto: {…}, bus: {…}, strasseY }` (Bildpixel des fertigen hohen Bilds).
- Produces Bilder: `stadt-himmel.png`, `stadt-himmel-blitz-1.png`, `stadt-himmel-blitz-2.png`, `stadt-haeuser.png`, `stadt-haeuser-licht.png`, `stadt-strasse.png`, `stadt-passant.png` (Streifen), `stadt-auto.png`, `stadt-bus.png`.

- [ ] **Step 1: Failing test** `test/stadt-bilder.test.js`: `stadt.json` existiert und hat obige Felder; jede Fenster-Rechteck liegt in `ebenen.haeuser`; alle genannten PNGs existieren und haben die in `stadt.json` genannten Maße; `stadt-haeuser.png` und `stadt-haeuser-licht.png` gleich groß.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Werkzeug: setzt die Quellen pixelgleich zusammen (wie `tools/raum-bilder.py`), findet Fenster als zusammenhängende Flächen, in denen sich dunkle und helle Häuser-Variante unterscheiden (Mindestgröße 2×2 Bildpx), schreibt `stadt.json` und die PNGs. Python mit `-I`, Pfade als Argumente.
- [ ] **Step 4:** Werkzeug laufen lassen, `npm test` → PASS. Commit `feat(stadt): Bilder und stadt.json aus PixelLab-Quellen`.

### Task 5: Reine Logik `renderer/lib/stadt.js`

**Files:**
- Create: `renderer/lib/stadt.js` (UMD wie `raum-leben.js`; Maße als eingefrorene Kopie von `tools/raum-quellen/stadt.json` im Code, wie `REGAL` in `raum.js` ≈ Z. 76–80 – ein Test prüft Gleichheit mit der JSON-Datei)
- Test: `test/stadt.test.js`

**Interfaces (Produces):**
- `Stadt.masse(fensterBreite, chatHoehe)` → `{ faktor, links, oben, strasseH }`: Stadtbild deckend hinter Nachrichtenliste + Straßenband, Pixel-Maßstab = `Szene.masse(...).faktor` sofern deckend, sonst größer; `strasseH` = Höhe des Straßenbands in Bildschirm-px (Straße ganz sichtbar).
- `Stadt.lichtAnteil(stunde)` → Anteil 0..1 heller Fenster: 18–22 Uhr 0,6; 22–1 Uhr 0,4; 1–5 Uhr 0,12; 5–8 Uhr 0,25; tagsüber 0,3 (Werte als Konstante `LICHT_NACH_STUNDE`).
- `Stadt.aboFenster(anzahlFenster, schonAn, n)` → Liste von n Fenster-Indizes (noch dunkle zuerst, nie mehr als vorhanden).
- `Stadt.gewitter({ zufall })` → Zustandsautomat `{ naechste(jetztMs) → { phase: 'regen'|'gewitter', blitzInMs|null } }`: Regen 8–20 min, Gewitter 2–4 min, im Gewitter Blitz alle 4–15 s.
- `Stadt.regisseur({ zufall })` → `{ darf(ort: 'mitte'|'strasse'|'himmel') → bool, belegt(ort, ms), frei(ort) }` mit Budget: mitte ≤ 1, strasse ≤ 2, gesamt ≤ 3.
- `Stadt.raidPlan(anzahl)` → `{ figuren: n, bus: bool }` (1–9: 1 Figur; ab 10: 3; ab 50: Bus + 4; ab 200: Bus + 8).
- `Stadt.raidDauer(plan, strassenBreiteBildpx)` → ms (Laufstrecke Straßenbreite + Figurbreite, Bus-Halt 2000 ms).

- [ ] **Step 1: Failing tests** in `test/stadt.test.js`: `masse` über `[[1397, 1332], [1397, 400], [400, 1332], [2560, 1440], [900, 700]]` – deckend (kein Rand), Straßenband ganz sichtbar, Nachrichtenbereich ≥ 50 % der Chat-Höhe (Review Focus 1); `lichtAnteil` für 20/23/3/6/12 Uhr; `aboFenster(10, [0,1,2], 3)` = 3 neue Indizes ohne 0–2, `aboFenster(10, alle 10, 5)` = [] (Review Focus 3); `gewitter` mit fester Zufallsfolge: erst Regen ≥ 8 min, Blitzabstand ≥ 4 s; `regisseur` lehnt zweites „mitte“ ab; `raidPlan(5|20|80|250)`; `raidDauer` wächst mit Straßenbreite (Review Focus 2).
- [ ] **Step 2:** `node --test test/stadt.test.js` → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** PASS, `npm test` grün, Commit `feat(stadt): Logik fuer Masse, Licht, Gewitter, Regisseur, Raid`.

### Task 6: Stadt im Chat-Fenster `renderer/lib/stadt-dom.js`

**Files:**
- Create: `renderer/lib/stadt-dom.js`
- Modify: `renderer/chat/index.html` (Stadt-Ebene hinter `#messages`, Straßenband zwischen `#messages` und `#composer`, Skripte einbinden), `renderer/chat/chat.css` (Ebenen, Band, Abdunkeln, `[data-animationen="aus"]`)
- Test: `test/stadt-dom.test.js` (statisch wie `test/home-raum.test.js`)

**Interfaces (Produces):** `StadtDom.baue(doc, wirt, pfad, opt)` → `{ an(), aus(), richteAus(breite, hoehe), aboFenster(n), raid(plan) → Promise, stoppeRaid() }`.

- [ ] **Step 1: Failing tests:** Ebenen in Reihenfolge Himmel, Blitz-Himmel (verborgen), Häuser, Fensterlichter (Ausschnitte aus `stadt-haeuser-licht.png` an `stadt.json.fenster`), Straße (Band), Regen, Abdunkeln; Blitz nur auf Himmel-Ebene, gleichzeitig Abdunkeln der Mitte (`--stadt-dunkel` steigt während des Blitzes); Passant/Auto nur im Band, Auto mit gespiegelter, abgedunkelter Kopie darunter; `richteAus` beim Resize (Review Focus 4); `aus()` entfernt Figuren und Blitz, Abo-Fenster bleiben (Review Focus 5); Uhrzeit-Lichter alle 2–5 min einzeln weich (300 ms) bzw. bei Animationen aus hart.
- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen (Bewegung per CSS-Transform/`steps()` wie `raum-leben-dom.js`). **Step 4:** PASS + `npm test`, Commit `feat(chat): Regennacht-Stadt hinter dem Chat`.

### Task 7: Ereignisse – Raid in die Stadt, Abos als Fenster

**Files:**
- Modify: `renderer/chat/chat.js` (`zeigeChatEreignis`, `abspieler`-Aufbau ~Z. 786–811), `renderer/lib/raum-leben-dom.js` (Raid-Ebene im Streifen entfällt, Kiste bleibt)
- Test: `test/chat-leben.test.js`, `test/stadt-dom.test.js`

- [ ] **Step 1: Failing tests:** `raid` → `StadtDom.raid(Stadt.raidPlan(anzahl))`, Dauer `Stadt.raidDauer`; Streifen hat keine Raid-Ebene mehr (`raum-raid` weg), Kiste unverändert; `abo`/`geschenk` → `StadtDom.aboFenster(n)` (Geschenk: Anzahl der Abos), auch bei Animationen aus (hart); Test-Knöpfe unter „Ausprobieren“ lösen dieselben Wege aus.
- [ ] **Step 2–4:** FAIL → umsetzen → PASS + `npm test`, Commit `feat(chat): Raid in der Stadt, Abos machen Fenster hell`.

### Task 8: Deckkraft-Einstellung entfällt

**Files:** `renderer/lib/theme.js` (`chatAlpha`, `clampAlpha` falls nur dafür), `renderer/chat/chat.js` (~Z. 778–829), `renderer/chat/index.html` (Regler `opt-alpha-chat`), `renderer/chat/chat.css`, `renderer/themes/cozy/farben.css` (`--chat-alpha`), Tests `test/theme.test.js`, `test/cozy-farben.test.js`, `test/cozy-abriss.test.js` (vorher alle Fundstellen per Grep `chatAlpha|chat-alpha|opt-alpha` prüfen).

- [ ] **Step 1: Failing tests:** `cleanThemePrefs` liefert `{ animationen, pixelUebergang }` (kein `chatAlpha`; alter Store-Wert wird ignoriert); kein `opt-alpha-chat`/`--chat-alpha` mehr in Chat-HTML/CSS/JS; Chat-Hintergrund deckend.
- [ ] **Step 2–4:** FAIL → entfernen → PASS + `npm test`, Commit `refactor(chat): Deckkraft-Einstellung entfaellt (Stadt immer deckend)`.

### Task 9: Übergabe

- [ ] **Step 1:** `docs/TODO.md` (neuer Abschnitt „Chat-Stadt“: Stand, offene Optik-Fragen: Blitz-Stärke, Häufigkeiten, Abdunkeln, Figurgeschwindigkeit), Gedächtnis nachziehen.
- [ ] **Step 2:** `npm test` grün, Commit `docs: Chat-Stadt - Stand und offene Fragen`.
- [ ] **Step 3:** Dev-App neu starten (laufende `electron`-Instanz schließen, `npm start`); Janis schaut an, auch Raid/Abo über ⚙ → Ausprobieren.

## Janis' Wahl

- **Task 1 (13.11.2026):** Janis findet B (frontale Häuserzeile, `entwuerfe/stadt/1b-frontal.png`) und C (weite Skyline, `1c-skyline.png`) beide stark → **Kombination**: B bleibt unten (Häuser + Straße), die Erweiterung nach oben bekommt eine Skyline im Stil von C. A (schräg, mit Fensterrahmen) aussortiert.
- **Task 2 (13.11.2026):** Grundbild `entwuerfe/stadt/2-grund.png` (344×277) freigegeben, Lichtkegel der Laterne bleibt, Grundbild-Fenster reichen. Häuser hell `2-haeuser-licht.png`. **Nur ein Blitz-Himmel:** `2-himmel-blitz-1.png` (Original aus C); Blitz 2 „sieht doof aus“ → `stadt-himmel-blitz-2.png` entfällt.
- **Task 3 (13.11.2026):** Janis: „passt, bau mal damit, was du denkst ist gut“ → Passanten **45** und **2** (`entwuerfe/stadt-figuren/gehen-45/`, `gehen-2/`, je f1–f8), Auto **9** (`auto/a9.png`), Bus **3** (`bus/b3.png`, dazu Tür-auf-Variante), Regen **2** (hinten) und **3** (vorn) (`regen/r2.png`, `r3.png`). Schirme bleiben wie sie sind.
