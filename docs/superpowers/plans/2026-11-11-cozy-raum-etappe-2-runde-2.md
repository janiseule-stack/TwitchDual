# Cozy-Raum Etappe 2 – Runde 2 (Janis' Korrekturen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Janis' Urteil vom 11.11.2026 umsetzen: Raum füllt das ganze Fenster, neue PixelLab-Schrift, Hover ohne Ecken und Holzschilder, Profilbilder nur leicht verpixelt, nichts abgeschnitten, neues Auflegen (Kamera zum Plattenspieler, Platte dreht sich, Schwenk in den Fernseher).

**Ausgangsstand:** Branch `feat/cozy-raum` bei cdb726c, 671 Tests grün. Darstellung `renderer/video/home-raum-dom.js` + `home-raum.css`, Geometrie `renderer/lib/raum.js`, Steuerung `renderer/video/home.js`, Bild-Werkzeug `tools/raum-bilder.py` mit Quellen in `tools/raum-quellen/`.

## Von Janis entschieden (11.11.2026)

| Punkt | Entscheidung |
|---|---|
| Füllen | „Ausfüllen, Rand ab“: Raum deckt das Fenster, Überstand wird abgeschnitten |
| Schrift | PixelLab-Schrift **„Raum Klar“** (12 px, Regular) |
| Profilbilder | „leicht“ verpixelt (doppelt so fein wie bisher) |
| Hover | **A**: Gegenstand leuchtet in seiner Form auf (PixelLab-Ausschnitt), Name klein unten; Ecken und Holzschilder weg |
| Auflegen | Kamera fährt zum Plattenspieler, Platte dreht sich (PixelLab-Animation **b**), dann Schwenk + Zoom in den Fernseher; Fernseher-Bild bleibt wie es ist |
| Abgeschnitten | Text auf dem Zettel (oberste Zeile ragt oben heraus) – Janis bestätigt per Screenshot |
| VODs | „Die Platte wird groß, man kann sie wie rausnehmen und dann hinten drauf VODs scrollen“ |
| LIVE-Schild | **C**: echtes kleines Schild aus PixelLab statt leuchtendem Lämpchen (Variante wählt Janis) |

## Global Constraints

- Branch `feat/cozy-raum`, kein Merge, kein Release, kein Versions-Bump. `npm test` nach jedem Task grün.
- **Keine selbst gezeichnete Grafik.** Sichtbare Bilder nur aus PixelLab-Quellen; Code darf zuschneiden, ausstanzen, skalieren, einfärben (Helligkeit/Filter), einsetzen.
- Dateien nur mit Write/Edit; nie Heredocs/Here-Strings. Commit-Fußzeile per zweitem `-m`.
- App nicht selbst anschauen, keine Screenshots: Anschauen macht Janis.
- `preload.js`/`main.js` unverändert. Alle bisherigen Verhaltensregeln von Home bleiben (Enter-Reihenfolge, Esc schrittweise, Schließen erst nach Ablauf **und** Laden, Chat verbindet genau einmal neu).
- Die bisherige Regel „nur ganzzahlig skalieren“ gilt für den Raum **nicht mehr** (Janis' Wahl „Ausfüllen“); `image-rendering: pixelated` bleibt überall.

## Quellen (schon erzeugt, liegen in `renderer/themes/cozy/entwuerfe/`, gitignored)

| Quelle | Inhalt |
|---|---|
| `entwuerfe/schrift/klar.ttf` | Schrift „Raum Klar“, 12 px, ohne ä ö ü ß und ohne Leerzeichen-Glyphe |
| `entwuerfe/hover/{regal,lampe,fernseher,plattenspieler,bild}.png` | PixelLab-Ausschnitte (remove_background) der fünf Gegenstände; jeweils aus `raum-tv-aus.png` bei (x−4, y−4) der Klickfläche aus `Raum.FLAECHEN` geschnitten, gleiche Größe wie der Ausschnitt (b+8 × h+8) |
| `entwuerfe/platte-dreht/b-0.png … b-8.png` | 9 Bilder 64×64 (0 = Eingabe, 1–8 = Animation), Ausschnitt (256, 80)–(320, 144) des Raums |

---

### Task 1: Quellen übernehmen und Bilder bauen

**Files:** `tools/raum-quellen/` (neu: `schrift-klar.ttf`, `hover-*.png` ×5, `platte-dreht-1.png … -8.png`), `tools/raum-bilder.py`, `renderer/themes/cozy/` (neu: `hover-*.png`, `platte-dreht.png`, `schrift/RaumKlar.ttf`), `test/raum-bilder.test.js`

- [ ] Quellen per `cp` nach `tools/raum-quellen/` kopieren (Namen siehe oben).
- [ ] Werkzeug: `hover-<id>.png` = Ausschnitt unverändert kopieren (die Lage steht in Task 2 als Konstante). Ausnahme `hover-fernseher.png`: die Bildschirm-Pixel (grün in `raum.png`) bekommen Alpha 0, damit beim Aufleuchten das Stream-Bild sichtbar bleibt. (Gemessen 11.11.: alle fünf Ausschnitte sind pixelgleich mit `raum-tv-aus.png`, 0 Abweichungen.) Prüfen und im Test festhalten: jeder deckende Pixel des Ausschnitts ist gleich dem Pixel von `raum-tv-aus.png` an der Stelle (Ausschnitt-Ursprung + Pixel) – sonst passt er beim Aufleuchten nicht deckungsgleich (Abweichungen zählen und, falls > 0, im Bericht nennen statt still zu reparieren).
- [ ] Werkzeug: `platte-dreht.png` = Bildstreifen 8 × (54 × 50): für jedes Bild 1–8 der Animation nur die Pixel innerhalb der deckenden Fläche von `hover-plattenspieler.png` übernehmen (Lage des Plattenspieler-Ausschnitts im Raum: (258, 82); im 64er-Ausschnitt also Versatz (2, 2)); alles andere Alpha 0.
- [ ] Schrift nach `renderer/themes/cozy/schrift/RaumKlar.ttf` kopieren (Werkzeug oder `cp`).
- [ ] Tests: Maße (`hover-*` je b+8 × h+8, `platte-dreht.png` 432×50), Deckungsgleichheit der Hover-Bilder, Schrift-Datei vorhanden und beginnt mit TrueType-Kennung (`00 01 00 00` oder `true`).
- [ ] Commit `feat: PixelLab-Quellen fuer Hover, drehende Platte und Schrift`.

### Task 2: Raum füllt das Fenster, Geometrie

**Files:** `renderer/lib/raum.js`, `test/raum.test.js`

- [ ] `skalierung(W, H)` deckt jetzt: `faktor = max(W / 344, H / 192)` (nicht mehr ganzzahlig; Müll → 1). Ausschnitt: waagerecht zentriert auf die Mitte der Gegenstände `MITTE_X = 207` (Mitte von x 100–314), senkrecht auf die Bildmitte; danach so geklemmt, dass kein Rand entsteht (`links ≤ 0`, `links ≥ W − 344·faktor`, ebenso `oben`). `links`/`oben` gerundet.
- [ ] Neue Konstante `HOVER = { <id>: { x, y } }` = Ursprung der Hover-Bilder (Klickfläche − 4).
- [ ] `PLATTENSPIELER_RECHTECK = { x: 262, y: 86, b: 46, h: 42 }` für die Kamera.
- [ ] `passtAlsRaum` bleibt (Fenster mindestens 688×384), nutzt aber nicht mehr den Faktor ≥ 2, sondern direkt die Maße.
- [ ] Tests: genaue Werte für 1400×800 (Breite deckt: Faktor 1400/344 ≈ 4,07 vs 800/192 ≈ 4,17 → 4,1667; Ausschnitt geklemmt), 1397×1332, 700×400; kein Rand bei 20 zufälligen Größen; bei 4:3 bleiben die Klickflächen x 100–314 sichtbar, solange `H·344/192 ≥ …` (rechnerisch prüfen und im Test festhalten, ab welchem Seitenverhältnis das nicht mehr geht).
- [ ] `zuBild`, `treffer`, `kameraZiel` funktionieren unverändert mit nicht ganzzahligem Faktor (Test).
- [ ] Commit `feat: Raum fuellt das Fenster`.

### Task 3: Darstellung (Schrift, Hover, Profilbilder, nichts abgeschnitten)

**Files:** `renderer/themes/cozy/raum.css` (Schrift), `renderer/video/home-raum-dom.js`, `renderer/video/home-raum.css`, `test/home-raum.test.js`

- [ ] **Schrift:** `@font-face` „Raum Klar“ aus `schrift/RaumKlar.ttf`; `--schrift-pixel: 'Raum Klar', 'Pixelify Sans', …` (Pixelify bleibt nur als Ersatz für ä ö ü ß und fehlende Zeichen). Gilt für die ganze App (Chat-Leisten nutzen dieselbe Variable). Schriftgröße im Text der Home-Ebenen auf Vielfache von 12 px (`12 × max(1, round(f / 3))` als CSS-Variable aus `neuAusrichten`), damit die Pixel-Schrift scharf bleibt.
- [ ] **Hover:** Ecken (`.hover-winkel`) und Holzschild (`schild.png`) im Raum entfernen. Beim Überfahren: `hover-<id>.png` an `Raum.HOVER[id]` in der skalierten Ebene einblenden, mit `filter: brightness(1.3)` (kurzer Übergang 120 ms, bei „Animationen aus“ ohne Übergang). Der Name steht klein unten mittig im Raum (Text-Ebene, neue Schrift, Farbe `--text`, dunkler Schatten per `text-shadow` für Lesbarkeit). `zeigeSchild(text)` (Hinweise wie „Nichts geladen“) nutzt denselben Platz unten statt des Holzschilds.
- [ ] **Profilbilder:** Canvas = volle Fenstergröße der Hülle (`HUELLE_FENSTER.b × .h` = 36×36) statt der halben; gilt für Fach-Hüllen und die vordere Hülle. VOD-Vorschauen ebenso doppelt so fein (64×18 Canvas statt 32×9).
- [ ] **Zettel:** alle Zeilen passen senkrecht in den Zettel (Zeilenhöhe × Zeilen ≤ Innenhöhe bei jedem Faktor ≥ 2); Titel und Spiel einzeilig mit „…“; reicht die Höhe nicht, entfallen zuerst Laufzeit, dann Kanalpunkte (statischer + kleiner Rechen-Test einer reinen Hilfsfunktion `zettelZeilen(innenHoehe, zeilenHoehe)`).
- [ ] **Doppelklick legt auf** (Janis 11.11.: „nervt immer unten auf Auflegen zu drücken“): Doppelklick auf eine Hülle im Fach wählt sie und legt sie sofort auf – derselbe Weg wie der Knopf „Auflegen“ (Handler `waehle` dann `laden`, keine zweite Lade-Logik). Ebenso Doppelklick auf die vordere Hülle. Der Einfachklick bleibt „wählen“. Statischer Test.
- [ ] **Zettel oben:** die erste Zeile (Status · Zuschauer · Laufzeit) beginnt innerhalb des Zettels (Innenabstand oben ≥ Rahmenbreite), nichts ragt über den Rand.
- [ ] **Fach:** vollständig sichtbare Hüllen; eine angeschnittene Hülle am Fachrand darf nicht entstehen (Fachbreite 175 → genau 4 Hüllen; `translateX` nur in ganzen Hüllen-Schritten; die gewählte Hülle ragt mit `translateY(-3px)` nicht oben aus dem Fach – Fach-Innenhöhe prüfen, sonst Anhebung auf 2 px oder in die Hülle verlegen). **Janis' Screenshot der abgeschnittenen Stelle wird vor dem Bau nachgereicht und im Brief ergänzt.**
- [ ] Commit `feat: neue Schrift, Hover in Form, feinere Profilbilder, nichts abgeschnitten`.

### Task 3b: Platte rausnehmen und VODs auf der Rückseite

**Files:** `renderer/video/home-raum-dom.js`, `renderer/video/home-raum.css`, `test/home-raum.test.js`, Bilder aus `tools/raum-quellen/` (große Hülle vorn/hinten aus PixelLab, Wahl durch Janis, 128×128)

- [ ] Klick auf „VODs“ (Handler `vods` wie bisher): die gewählte Platte wird „herausgenommen“ – die große Hülle (vorn: großes Profilbild im Fenster, kaum verpixelt) erscheint mittig über dem Regal in ganzzahliger Vergrößerung der 128er-Bilder, dreht sich um (CSS `rotateY` mit Vorder- und Rückseite, 400 ms, bei „Animationen aus“ sofort).
- [ ] Auf der Rückseite: senkrecht **scrollbare** Liste aller geladenen VODs (Vorschaubild klein, Titel, Datum, Länge in der neuen Schrift); Klick → `vod`, Mausrad/↑↓ scrollen, „Alle VODs“ (`mehr`) bleibt als Knopf ab 24. Die Seiten-Logik (4 je Seite, ‹ ›) entfällt in dieser Ansicht; nachladen wie heute über `mehr`.
- [ ] Esc, Klick daneben oder ✕ legt die Platte zurück (Handler `rueckseiteZu`).
- [ ] Die gekachelte alte Rückseite im Bücherfach entfällt samt CSS.
- [ ] Commit `feat: Platte rausnehmen, VODs auf der Rueckseite scrollen`.

### Task 3c: LIVE-Schild

**Files:** `renderer/video/index.html`, `renderer/themes/cozy/` (gewähltes PixelLab-Schild), Test

- [ ] `#onair-bar` zeigt das gewählte PixelLab-Schild (ganzzahlig vergrößert) statt Kasten + `lampe-rot.png`; kein Leuchten. Für VODs: Variante nach Janis' Wahl (eigenes Schild oder Text).
- [ ] Commit `feat: LIVE-Schild aus PixelLab`.

### Task 4: Neues Auflegen

**Files:** `renderer/video/home-raum-dom.js`, `renderer/video/home-raum.css`, `renderer/video/home.js` (nur `mindestMs`), `test/home-raum.test.js`

- [ ] Ablauf (Phasenlängen): Regal → Raum überblenden 500 ms (`ablauf-raum`); Kamera fährt auf `Raum.kameraZiel(Raum.PLATTENSPIELER_RECHTECK, …)` 1200 ms (`ablauf-spieler`); Platte dreht sich: `platte-dreht.png` als Sprite an (258, 82) in der skalierten Ebene, 8 Bilder mit ~10 Bildern/s, `steps(8)` in CSS, 1500 ms (`ablauf-dreht`), die Platte dreht weiter bis zum Ende; Schwenk + Zoom in den Fernseher `Raum.kameraZiel(Raum.TV_RECHTECK, …)` 2000 ms (`ablauf-zoom`). Summe 5200 ms → `mindestMs: 5200` in `home.js`.
- [ ] Die fliegende Platte (`platte-klein.png`) entfällt samt CSS.
- [ ] `versteckeAblauf` setzt alles zurück (Sprite aus, Klassen, Timer, Kamera). Überspringen per Klick/Taste bleibt.
- [ ] „Animationen aus“: kein Ablauf (wie heute).
- [ ] `docs/TODO.md`: Abschnitt Etappe 2 um „Runde 2“ ergänzen.
- [ ] Commit `feat: Auflegen mit Kamera zum Plattenspieler und drehender Platte`.

## Abnahme

- `npm test` grün; Tests vorher/nachher im Bericht.
- Janis schaut an: Raum ohne Rand bei verschiedenen Fenstergrößen, Hover, Schrift, Zettel, Fächer, Auflegen.
