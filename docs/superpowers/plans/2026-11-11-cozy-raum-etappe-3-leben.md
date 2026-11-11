# Cozy-Raum Etappe 3 – Leben Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home-Raum und Chat-Streifen bekommen ruhige PixelLab-Animationen (Regen, Katze, Dampf, Lampe); im Chat-Streifen spielen Raid (Leute mit Schirm gehen draußen vorbei) und Kanalpunkte-Kiste (Katze bringt Münze) kurze Effekte.

**Architecture:** `renderer/lib/raum-leben.js` (DOM-frei, UMD) hält die Animations-Tabellen, Takt-Regeln, Warteschlange und einen Abspieler für Ereignisse. `renderer/lib/raum-leben-dom.js` setzt Bildstreifen als Elemente in eine skalierte Bild-Ebene und spielt „Schleife“/„selten“ ab – genutzt von Home (`home-raum-dom.js`) und Chat (`chat.js`). Alle Bilder entstehen in PixelLab, Janis wählt, `tools/raum-bilder.py` bereitet sie auf; Maße und Orte stehen einmal in `tools/raum-quellen/leben.json`.

**Tech Stack:** Electron-Renderer (Vanilla JS, UMD-Libs), CSS `steps()` mit CSS-Variablen, Node-Testrunner (`npm test`), Python/PIL `tools/raum-bilder.py`, PixelLab-MCP.

**Spec:** `docs/superpowers/specs/2026-11-11-cozy-raum-etappe-3-leben-design.md` (Teil von `docs/superpowers/specs/2026-11-10-cozy-raum-design.md`).

## Global Constraints

- Branch `feat/cozy-raum`, kein Merge, kein Release, kein Versions-Bump. `npm test` nach jedem Task grün.
- **Keine selbst gezeichnete Grafik.** Jedes sichtbare Bild und jedes Animationsbild kommt aus PixelLab. Code darf zuschneiden, ausstanzen, skalieren, einfärben/Helligkeit ändern, Bildstreifen abspielen und Bilder an ganze Bildpixel-Positionen setzen. Steht in jedem Helfer-Auftrag.
- **Optik wählt Janis:** je Animation höchstens 3 PixelLab-Varianten pro Runde, Etappe 3 insgesamt höchstens ~400 Generationen (Zähler unter „Janis' Wahl“ fortschreiben). Entwürfe in `renderer/themes/cozy/entwuerfe/leben/` (gitignored), gewählte Quellen in `tools/raum-quellen/`.
- Anti-Ziele: keine Hektik (Takt 100–250 ms je Bild = 4–10 Bilder/s), keine gleitenden CSS-Verschiebungen ganzer Gegenstände (einzige Ausnahme, von Janis freigegeben: Raid-Figuren rücken im Takt ihres Gehzyklus vor), keine weichen Überblendungen auf Pixel-Bildern, nichts überdeckt Chat-Text.
- Kein Abo-Effekt; keine Animationen im Video-Fenster außer Home; Ereignis-Effekte nur im Chat-Streifen; die Regal-Ansicht in Home bleibt still (Janis 11.11.: 2A).
- „Animationen aus“ = `data-animationen="aus"` an `document.documentElement` (gesetzt in `renderer/video/video.js:324` und in `applyTheme` `renderer/chat/chat.js:780-788`) hält alles an, verwirft neue Ereignisse und leert die Warteschlange.
- `preload.js`/`main.js` unverändert. Home-Regeln bleiben (Enter-Reihenfolge, Esc schrittweise, Auflegen-Ablauf).
- Dateien nur mit Write/Edit, Binärdateien per `cp`; nie Heredocs/Here-Strings. Commit-Fußzeile per zweitem `-m`: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nicht stagen: `.claude/settings.json`, `docs/superpowers/plans/2026-08-12-pubsub-spike.md`.
- App nicht selbst anschauen, keine Screenshots per CDP: Anschauen macht Janis.
- Tests: ausführbare Libs per `require('../renderer/lib/…')`, DOM-Code (`home-raum-dom.js`, `chat.js`, CSS, HTML) statisch per `fs.readFileSync` wie `test/home-raum.test.js:8`. PNG-Prüfungen mit dem Dekoder und der Tabelle `MASSE` in `test/raum-bilder.test.js` (Z. 10-32, 50ff); Quellen, die erst nach Janis' Wahl existieren, per `fs.existsSync` absichern.

## Review Focus

1. Breiter, niedriger Chat (z. B. 1400×600, 2500×700) und sehr schmaler Chat (300 px): Fenster samt Glas bleibt im Streifen ganz sichtbar, kein Rand → Test in Task 1.
2. „Animationen aus“ während eines laufenden Raid-Effekts (auch über das Licht-Panel in Home, `home.js:615`): Effekt endet sofort, Warteschlange leer, neue Ereignisse werden verworfen → Abspieler-Test in Task 2, Verdrahtung in Task 6.
3. Raid mit `anzahl` 0, fehlend oder 100 000: 1 bzw. 4 Figuren, kein Fehler → Test in Task 2.
4. Schwall (10 Raids in einer Sekunde): höchstens 3 warten, ältere fallen weg, nie zwei Effekte gleichzeitig → Test in Task 2.
5. Chat lange verdeckt (Timer gedrosselt): Ereignisse, die beim Drankommen älter als 30 s sind, entfallen → Test in Task 2.

## Feststellungen am Code (geprüft 11.11.2026, Goldfisch-Prüfung eingearbeitet)

- Streifen: `renderer/lib/szene.js` (`BILD` 344×72, `HOECHSTENS` 8, `ANTEIL_HOEHE` 0,2, `MINDEST_HOEHE` 48, `faktor` = aufgerundet, `masse`), CSS `#szene` in `renderer/chat/chat.css:296-300`, `setzeSzene` in `renderer/chat/chat.js:822-828`; Tests `test/szene.test.js:9-27` und `test/cozy-raum.test.js:46, 57-60, 143-148` schreiben das heutige Verhalten fest.
- Raid: `zeigeChatEreignis(ev)` `chat.js:159-163` (`ev = { art: 'raid', name, anzahl }` aus `chat-ereignisse.js:48`; Diagnose schreibt `effekt: false`). Kiste: `zeigeZuwachs(z)` `chat.js:1358`, Zeile 1359 bricht ohne `$pointsGain` ab; echte Kisten über `spieleZuwaechse` (1336), Tipp-Gewinne `chat.js:1529`; Test-Knöpfe `chat.js:1348-1356`.
- Home: `openHome`/`closeHome` in `renderer/video/home.js:121-151` (`closeHome` ruft `HomeRaumDom.versteckeAblauf()`), `effekteAus()` `home.js:224`. `HomeRaumDom`-Exporte `home-raum-dom.js:819-823`; `baueRaum` 168-191 mit `lage(el, rect)` (Z. 90) in `.raum-bildebene`, Vorbild `DREHT` (Z. 40) + `home-raum.css:232-242` inkl. Aus-Regel `html[data-animationen="aus"] #home.raum-home *`.
- Im Chat gibt es **keine** Aus-Regel für Animationen.
- Werkzeug `tools/raum-bilder.py`: `main()` (Z. 223-235) ruft alle Bild-Funktionen nacheinander; `raum-tv-aus.png` entsteht in `tv_bilder` (Z. 50).
- Script-Reihenfolge: Chat `renderer/chat/index.html:135-152` (`szene.js` Z. 146, `chat.js` Z. 152); Video `renderer/video/index.html:242-245` (`home-raum-dom.js` Z. 244).
- **Ungeprüft:** Grenzen der PixelLab-Werkzeuge (`animate_image`, `create_character`/`animate_character`) – Task 3 Step 1 prüft sie.

---

### Task 1: Streifen zeigt immer die ganze Breite und das ganze Fenster

Janis 11.11. (1A): Der Streifen wird so hoch, dass das Fenster ganz sichtbar ist, höchstens 30 % der Chat-Höhe. Breite: nicht ganzzahlig, Faktor = Breite/344 (auch unter 1 bei sehr schmalen Chats – Claudes Wahl, Pixel werden dann ungleichmäßig).

**Files:**
- Modify: `renderer/lib/szene.js`, `renderer/chat/chat.css:291-300`, `renderer/chat/chat.js:819-828`, `renderer/chat/index.html:22`
- Test: `test/szene.test.js`, `test/cozy-raum.test.js:46, 143-148`

**Interfaces:**
- Produces:
  - `Szene.KERN_OBEN` = oberste Bildzeile des Fensterrahmens in `streifen.png` (mit PIL messen, im Bericht nennen; Test prüft den Wert am Bild: Zeile `KERN_OBEN` enthält Rahmenpixel, darüber keine).
  - `Szene.faktor(W) -> number` = `W/344`; Müll → 1. `HOECHSTENS` entfällt.
  - `Szene.masse(W, H) -> { faktor, breite, hoehe, oben }`: `voll = Math.round(72·f)`, `kern = Math.round((72 − KERN_OBEN)·f)`, `hoehe = Math.min(voll, Math.max(MINDEST_HOEHE, Math.round(0,2·H), Math.min(kern, Math.round(0,3·H))))`, `oben = hoehe − voll` (ganzzahlig, ≤ 0), `breite = W`. Ohne H: `hoehe = voll`. Müll-Breite → `{ faktor: 1, breite: 344, hoehe: 72, oben: 0 }`.
  - `#szene` enthält `<div class="szene-bildebene">` (344×72 px, Hintergrund `streifen.png` `0 0 / 344px 72px`, `image-rendering: pixelated`, `transform: scale(var(--szene-f))`, `transform-origin: 0 0`, `top: var(--szene-oben)`, `position: absolute; left: 0`); `#szene` behält Farbe `#2e1612`, Höhe `--szene-h`, `overflow: hidden`, `position: relative`. `setzeSzene` setzt `--szene-f`, `--szene-h`, `--szene-oben`.

- [ ] **Step 1: Failing tests** in `test/szene.test.js` (alte ganzzahlige Erwartungen Z. 9-27 ersetzen): `faktor(688) === 2`, `faktor(1397) ≈ 4,061`; Müll (0, NaN, -5, 'x') → `masse` = `{faktor:1, breite:344, hoehe:72, oben:0}`; Raster W ∈ {300, 400, 700, 1397, 1400, 2500}, H ∈ {600, 700, 1000, 1332}: `breite === W`, `Number.isInteger(hoehe)`, `Number.isInteger(oben)`, `oben ≤ 0`, und Fenster sichtbar `−oben ≤ Math.ceil(KERN_OBEN·faktor)` **wenn** `kern ≤ 0,3·H` (sonst `hoehe === Math.round(0,3·H)`). In `test/cozy-raum.test.js:143-148` die Prüfung auf die Regel `.szene-bildebene {` mit `streifen.png` umstellen; Z. 46 (`Szene.masse`, `--szene-f`) bleibt; Z. 57-60 bleibt.
- [ ] **Step 2:** `npm test -- test/szene.test.js test/cozy-raum.test.js` → FAIL.
- [ ] **Step 3:** Umsetzen (Kopfkommentar `szene.js`: nicht mehr ganzzahlig, Fenster immer sichtbar, Janis 11.11.).
- [ ] **Step 4:** `npm test` grün.
- [ ] **Step 5:** Commit `feat: Chat-Streifen zeigt immer die ganze Breite und das Fenster`.

### Task 2: `raum-leben.js` – Takt, Warteschlange, Abspieler

**Files:**
- Create: `renderer/lib/raum-leben.js` (UMD wie `szene.js`, DOM-frei), `test/raum-leben.test.js`
- Modify: `renderer/chat/index.html` (Script nach `szene.js` Z. 146, vor `chat.js`), `renderer/video/index.html` (Script vor `home-raum-dom.js` Z. 244)

**Interfaces:**
- Produces:
  - `RaumLeben.schirmAnzahl(anzahl) -> 1|2|3|4`: 0/fehlend/Müll/1–9 → 1, ab 10 → 2, ab 50 → 3, ab 200 → 4.
  - `RaumLeben.DAUER_KISTE = 4000`, `MAX_WARTEND = 3`, `MAX_ALTER = 30000`.
  - `RaumLeben.TAKT = { regen: { msProBild: 150, modus: 'schleife' }, dampf: { msProBild: 200, modus: 'schleife' }, katze: { msProBild: 200, modus: 'selten', pause: { min: 8000, max: 20000 } }, lampe: { msProBild: 125, modus: 'selten', pause: { min: 10000, max: 30000 } } }` (Janis kann beim Anschauen ändern).
  - `RaumLeben.naechstePause(zufall, { min, max }) -> Math.round(min + zufall()·(max − min))`.
  - `RaumLeben.warteschlange({ jetzt }) -> { rein(art, daten), naechstes() -> {art, daten, zeit}|null, leeren(), laenge }` – `rein` stempelt `zeit = jetzt()`, verwirft über `MAX_WARTEND` die ältesten; `naechstes` entfernt und überspringt Einträge mit `jetzt() − zeit > MAX_ALTER` (genau 30 000 bleibt).
  - `RaumLeben.abspieler({ schlange, aktiv: () => bool, starte(ev), stoppe(), dauer: (ev) => ms, setTimeout, clearTimeout }) -> { melde(art, daten), aus(), laeuft }` – `melde`: bei `!aktiv()` verwerfen; sonst `rein`, und wenn nichts läuft, nächstes starten. Ende nach `dauer(ev)` per Timer → nächstes. `aus()`: Timer löschen, `stoppe()` wenn etwas lief, `leeren()`.
- [ ] **Step 1: Failing tests** (`require`, falsche Uhr/Timer im Test): `schirmAnzahl` für 0, undefined, 'x', 1, 9, 10, 49, 50, 199, 200, 100000 → 1,1,1,1,1,2,2,3,3,4,4. Warteschlange: 10× `rein` → `laenge 3`, `naechstes()` gibt die drei neuesten der Reihe nach; Alter 30 001 → übersprungen, 30 000 → geliefert; `leeren` → 0. `naechstePause`: zufall 0 → min, 1 → max, 0,5 → Mitte. Abspieler: zwei `melde` hintereinander → `starte` einmal, nach `dauer` das zweite; `aus()` während Lauf → `stoppe` einmal, Schlange leer, nach Ablauf der alten Zeit kein `starte`; `aktiv() === false` → `melde` startet nichts. Jeder `TAKT.*.msProBild` liegt in 100–250.
- [ ] **Step 2:** `npm test -- test/raum-leben.test.js` → FAIL.
- [ ] **Step 3:** Implementieren, Scripts einbinden (statischer Test: beide `index.html` laden `raum-leben.js` vor `chat.js` bzw. `home-raum-dom.js`).
- [ ] **Step 4:** `npm test` grün.
- [ ] **Step 5:** Commit `feat: raum-leben – Takt, Warteschlange und Abspieler`.

### Task 3: PixelLab-Grenzen prüfen und Home-Bilder erzeugen (Hauptchat + Janis, kein Code)

Läuft im Hauptchat mit dem PixelLab-MCP, nicht als Helfer.

- [x] **Step 1:** Grenzen geprüft (11.11.): `animate_image` – Bild höchstens 256×256, `b·h·bilder ≤ 524 288`, `frame_count` gerade 4–16, Ergebnis hat `frame_count + 1` Bilder, **Bild 0 = Eingabe unverändert**, optional `last_frame` (für nahtlose Schleifen: letztes Bild = erstes), Kosten nach Pixeln (64×64×8 = 1 Generation). `animate_character` braucht eine mit `create_character` erzeugte Figur (Gehen per Vorlage `walking`, 1 Gen./Richtung bis ~92 px). Für die Raid-Figur reicht deshalb: Figur per `create_image_pro` (Stilbild `streifen.png`), dann `animate_image` „walking to the right, side view“, 8 Bilder. Stand Konto: 1538 Generationen frei bis 10.12.2026.
- [ ] **Step 2:** Je Animation (regen, katze, dampf, lampe) in `raum-tv-aus.png` zwei Rechtecke messen und in `tools/raum-quellen/leben.json` eintragen: `quelle` (Ursprung + PixelLab-Größe des Eingabe-Ausschnitts) und `ziel` (`{x, y, b, h}` = Fläche, die sich bewegt, innerhalb der Quelle).
- [ ] **Step 3:** Je Animation 2–3 Varianten mit `animate_image` (Beschreibungen: „rain drops running down the window glass, slow loop“, „sleeping cat breathing slowly, small tail flick“, „thin steam rising from the cup, slow loop“, „warm lamp light flickering slightly“). Übersichten 8-fach in `entwuerfe/leben/_uebersicht-home-<id>.png`, vor dem Zeigen groß prüfen (Nahtstellen, Abweichungen außerhalb der bewegten Fläche → Variante verwerfen).
- [ ] **Step 4:** Janis wählt. Bilder der gewählten Variante per `cp` nach `tools/raum-quellen/leben-home-<id>-<k>.png` (`<k>` = Bildnummer ab 0); Wahl, Bildzahl und Generationen-Zähler unten unter „Janis' Wahl“ eintragen; `leben.json` ergänzen (`bilder`).

### Task 4: Streifen-Bilder erzeugen (Hauptchat + Janis, kein Code)

Läuft im Hauptchat, nicht als Helfer. Das heutige `streifen.png` bleibt (Janis 1A).

- [ ] **Step 1:** In `streifen.png` messen und in `leben.json` eintragen: `quelle`/`ziel` für regen (Glas), katze (Fensterbrett), lampe (Tischlampe); `glas` = Rechteck des Fensterglases + Saatpunkt `(sx, sy)` + Liste der Glasfarben (für die Maske); `kiste` (`quelle`/`ziel` um die Katze, Platz für die Münze).
- [ ] **Step 2:** Je 2–3 Varianten: regen, katze (ruhig: Schwanz/Ohr/Atmen), lampe (selten flackern) mit `animate_image`; **Kiste** mit `animate_image` auf dem Katzen-Ausschnitt: „cat wakes up and places a small gold coin in front of it, coin sparkles, cat lies down again“ (Ende = Ruhelage); **Raid** (Janis 3A): kleine Figur mit Schirm, Seitenansicht, Gehzyklus nach rechts, Höhe ≈ 60 % der Glashöhe, Stilbild `streifen.png` – Figur per `create_image_pro`, Gehzyklus per `animate_image` (siehe Task 3 Step 1).
- [ ] **Step 3:** Übersichten zeigen, Janis wählt. Quellen per `cp` nach `tools/raum-quellen/leben-streifen-<id>-<k>.png`, Wahl/Zähler unten eintragen, `leben.json` ergänzen: `raid = { bilder, b, h, msProBild, y, pxProBild, versatzMs }` mit `pxProBild` = Vorrücken je Gehbild (am Gehzyklus gemessen, damit die Füße nicht rutschen), `versatzMs` = 1500.

### Task 5: Home-Raum lebt

**Files:**
- Create: `renderer/lib/raum-leben-dom.js`, `renderer/themes/cozy/leben-home-<id>.png`
- Modify: `tools/raum-bilder.py` (neue Funktion `leben_bilder(ordner)`, in `main()` **nach** `tv_bilder`), `renderer/lib/raum-leben.js` (`HOME` aus `leben.json` übernommen), `renderer/video/home-raum-dom.js` (`baueRaum`, Export `leben`), `renderer/video/home-raum.css`, `renderer/video/home.js` (`openHome`, `closeHome`, Beobachter), `renderer/video/index.html` (Script `raum-leben-dom.js`)
- Test: `test/raum-bilder.test.js`, `test/raum-leben.test.js`, `test/home-raum.test.js`

**Interfaces:**
- Consumes: `RaumLeben.TAKT`, `naechstePause` (Task 2); `leben.json` + Quellen (Task 3).
- Produces:
  - `RaumLeben.HOME = [{ id, x, y, b, h, bilder }]` (Ziel-Rechtecke aus `leben.json`, Takt aus `TAKT[id]`); Test: identisch mit `leben.json`.
  - `RaumLebenDom.baue(doc, ebene, liste, pfad) -> { an(), aus() }` – je Eintrag ein `div.raum-leben` per absoluter Lage in Bildpixeln, CSS-Variablen `--bilder`, `--dauer` (`bilder·msProBild` ms), `--sb` (`bilder·b` px), Hintergrund `pfad + id + '.png'`; `selten`: Klasse `spielt` an, bei `animationend` ab und nach `naechstePause(Math.random, pause)` wieder an; `aus()` löscht alle Timer und Klassen.
  - CSS (in `home-raum.css`, in Task 6 auch im Chat): `.raum-leben { position:absolute; pointer-events:none; image-rendering:pixelated; animation: raum-leben var(--dauer) steps(var(--bilder)) infinite; }`, `.raum-leben.selten:not(.spielt) { animation: none; }`, `.raum-leben.selten.spielt { animation-iteration-count: 1; }`, `@keyframes raum-leben { to { background-position: calc(-1 * var(--sb)) 0; } }`.
  - `HomeRaumDom.leben(an: boolean)`.
- [ ] **Step 1: Werkzeug** `leben_bilder`: je Animation Bildstreifen `bilder·b × h` aus den Quellbildern, auf `ziel` zugeschnitten; **Bild 0 = Ausschnitt von `raum-tv-aus.png`** (ersetzt PixelLabs Bild 0); in Bild 1…n nur Pixel behalten, die sich vom Standbild-Ausschnitt unterscheiden, Rest Alpha 0. Tests (Dekoder/`MASSE` aus `raum-bilder.test.js`, Quellen per `existsSync`): Maße; Bild 0 pixelgleich mit `raum-tv-aus.png` (`assert.strictEqual(abweichungen, 0)`); mindestens ein Bild hat deckende Pixel.
- [ ] **Step 2: Failing tests (statisch):** `baueRaum` ruft `RaumLebenDom.baue` mit `RaumLeben.HOME` und `r.bild` **vor** den Hover-Bildern; Export `leben` in der Exportliste (`home-raum-dom.js:819-823`); `openHome` ruft `HomeRaumDom.leben(!effekteAus())`, `closeHome` ruft `HomeRaumDom.leben(false)`; `versteckeAblauf` ruft `leben` nicht; ein `MutationObserver` in `home.js` auf `data-animationen` ruft bei offenem Home `leben(!effekteAus())`; CSS-Regeln wie oben.
- [ ] **Step 3:** Umsetzen. In der Regal-Ansicht ist `#raum-ebene` verborgen; die Animationen bleiben unsichtbar, Timer dürfen weiterlaufen.
- [ ] **Step 4:** `npm test` grün.
- [ ] **Step 5:** Commit `feat: Home-Raum lebt (Regen, Katze, Dampf, Lampe)`.

### Task 6: Chat-Streifen lebt, Raid und Kiste

**Files:**
- Create: `renderer/themes/cozy/leben-streifen-<id>.png`, `renderer/themes/cozy/leben-raid.png`, `renderer/themes/cozy/leben-kiste.png`, `renderer/themes/cozy/streifen-glas-maske.png`, `test/chat-leben.test.js`
- Modify: `tools/raum-bilder.py` (`leben_bilder` erweitern), `renderer/lib/raum-leben.js` (`STREIFEN`, `GLAS`, `KISTE`, `RAID`, `raidDauer`), `renderer/chat/chat.js` (`applyTheme` 780-788, `zeigeChatEreignis` 158-163, `zeigeZuwachs` 1358-1359), `renderer/chat/chat.css`, `renderer/chat/index.html` (Script `raum-leben-dom.js`), `docs/TODO.md`
- Test: `test/raum-bilder.test.js`, `test/raum-leben.test.js`, `test/chat-leben.test.js`

**Interfaces:**
- Consumes: `.szene-bildebene` (Task 1), `abspieler`, `warteschlange`, `schirmAnzahl`, `DAUER_KISTE`, `TAKT` (Task 2), `RaumLebenDom.baue` + CSS (Task 5), `leben.json` + Quellen (Task 4).
- Produces: `RaumLeben.STREIFEN` (wie `HOME`), `GLAS = {x, y, b, h}`, `KISTE = {x, y, b, h, bilder, msProBild}`, `RAID = {bilder, b, h, msProBild, y, pxProBild, versatzMs}`, `RaumLeben.raidDauer(n) -> ms` = `ceil((GLAS.b + RAID.b) / pxProBild) · msProBild + (n − 1) · versatzMs`.
- [ ] **Step 1: Werkzeug:** Streifen-Animationen wie Task 5 gegen `streifen.png`; Raid-Gehzyklus und Kiste als Bildstreifen; Glasmaske per Flutfüllung ab `(sx, sy)` über die gemessenen Glasfarben (weiß/transparent, Rahmen und Sprossen ausgenommen). Tests: Maße, Bild 0 pixelgleich, Maske nur in `GLAS` und deckt mindestens 50 % der `GLAS`-Fläche, Stichpunkte auf Rahmen/Sprossen sind transparent.
- [ ] **Step 2: Failing tests:** `raidDauer(1)`/`raidDauer(4)` aus den Konstanten (`require`); statisch in `chat-leben.test.js`: `chat.css` enthält `html[data-animationen="aus"] #szene * { animation: none !important` und kein `gradient`; `applyTheme` ruft bei `aus` `leben.aus()` und `abspieler.aus()`, bei `an` `leben.an()`; `zeigeChatEreignis` ruft bei `art === 'raid'` `abspieler.melde('raid', …)`, Abo nicht; `melde('kiste', …)` steht in `zeigeZuwachs` **vor** `if (!$pointsGain) return;`; Diagnose schreibt `effekt` nur `true`, wenn gemeldet wurde.
- [ ] **Step 3:** Umsetzen: Dauer-Animationen per `RaumLebenDom.baue(document, .szene-bildebene, RaumLeben.STREIFEN, …)`. Abspieler mit `aktiv = () => documentElement.dataset.animationen !== 'aus'`, `dauer = ev => ev.art === 'raid' ? raidDauer(schirmAnzahl(ev.daten.anzahl)) : DAUER_KISTE`. **Raid:** Ebene über `GLAS` mit `mask-image: url(streifen-glas-maske.png)`; je Figur ein äußeres Element (`translateX` von `−RAID.b` bis `GLAS.b` in `steps(ceil((GLAS.b + RAID.b)/pxProBild))`, Dauer = Schritte·`msProBild`, Start versetzt um `versatzMs`) mit innerem Gehzyklus-Sprite im selben Takt. **Kiste:** Sprite an `KISTE`, einmal abspielen; die Katzen-Dauer-Animation ist währenddessen verborgen und beginnt danach wieder. Kommentar Z. 158 („bis Etappe 3 nur als Zeile“) anpassen.
- [ ] **Step 4:** `npm test` grün.
- [ ] **Step 5:** `docs/TODO.md`: neuer Abschnitt „Etappe 3“ (Stand, offene Optik-Fragen); veraltete Zeilen 16-20 („bis Etappe 3 …“) nachziehen.
- [ ] **Step 6:** Commit `feat: Chat-Streifen lebt, Raid-Leute mit Schirm und Kisten-Katze`.

## Abnahme

- `npm test` grün, Tests vorher/nachher im Bericht.
- Janis schaut an: Home (läuft alles ruhig?), Chat-Streifen bei schmalem und breitem Chat, ⚙ „Ausprobieren“ → Raid und Kiste, „Animationen aus“.
- Danach: gesammelte Verbesserungsrunde aus `docs/TODO.md` (Janis' Urteil zu Runde 2 und Etappe 3).

## Janis' Wahl

- 11.11.: 1A (Streifen wird höher, bis 30 %), 2A (Regal still), 3A (Leute mit Schirm, Vorrücken im Gehtakt).
- 11.11. Home: **Dampf 2, Katze 1 und 2** (beide; abwechselnd zufällig, je Ruhepause eine), **Lampe 1**, Regen 3 war „zu gelblich, nicht wie Regen“ → neu erzeugt, gewählt **Regen 4** (kühl, 13 Bilder). Quellen in `tools/raum-quellen/leben-home-*.png`, Orte in `tools/raum-quellen/leben.json` (Katze hat zwei Dateien `katze1`/`katze2`: bei jedem seltenen Auftritt zufällig eine). Ausschnitte (Quelle in `raum-tv-aus.png`, x y b h): regen 32 8 64 96, katze 136 104 64 64, dampf 180 140 48 48, lampe 148 0 64 64. Entwürfe `entwuerfe/leben/<id>-<n>-<k>.png`.
- Generationen Etappe 3: 14 (Home) + 10 (Streifen, laufen) / ~400.
