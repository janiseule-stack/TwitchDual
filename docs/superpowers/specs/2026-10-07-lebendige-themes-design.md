# Lebendige Themes (Welle 1)

**Stand:** 2026-10-07
**Ausgangslage:** v1.11.0 kennt genau einen Look, Neon Dual, mit zwei
frei waehlbaren Akzentfarben, sechs Farb-Presets und einem Deckkraft-Regler
fuer den Chat. Alles laeuft ueber `themePrefs` und das `theme-changed`-Signal.

## Ziel

Zusaetzlich zu Neon Dual umschaltbare **Gesamt-Themes**: jedes stellt Video-
und Chat-Fenster komplett um und bringt eine kleine, lebendige Welt mit
(Partikel, Maus-Reaktion, Effekte bei echten App-Momenten). Auswahl ueber eine
Theme-Galerie aus dem ⚙-Popup.

Herkunft: fuenf Abstimmungsrunden am 2026-10-07. Janis: „mir gefallen so
kreative interaktive oder animierte sachen wie das gluehwuermchen … oder bei
sakura die blueten". Ausgewaehlt wurden 13 Themes; sie kommen in Wellen.

**Welle 1 (diese Spec):** Theme-System, Galerie, Effekte-Regler und vier
Themes: **Sakura, Wald, Koi-Teich, Seifenblasen**. Dazu ein Ereignis-Effekt
fuer Neon Dual.

## Nicht-Ziele

- **Wellen 2 und 3** (Frost, Terminal, Paper, Tiefsee, Game Boy, Windows 98,
  Holo, Matrix, Regenfenster). Das System ist so gebaut, dass jedes davon nur
  ein neuer Ordner plus ein Listeneintrag ist.
- **Raid-/Abo-Ereignisse.** Die App wirft `USERNOTICE` heute noch weg
  (`chat.js`). Sobald das eigene Feature „Abos/Raids im Chat" steht, haengt es
  sich an denselben `ereignis()`-Anschluss. Hier nur vorgesehen, nicht gebaut.
- **Eigene Akzentfarben fuer neue Themes.** Ein Theme bestimmt alle Farben;
  Farbwaehler und Presets gibt es nur bei Neon Dual.
- **Kein `prefers-reduced-motion`-Zweig** (Projekt-Entscheidung, Janis' Windows
  hat Animationseffekte systemweit aus). Zum Daempfen gibt es den
  Effekte-Regler.

---

## 1. Einstellungen und Datenfluss

`themePrefs` bekommt zwei Felder:

| Feld | Werte | Standard |
|---|---|---|
| `theme` | `'neon-dual'`, `'sakura'`, `'wald'`, `'koi'`, `'blasen'` | `'neon-dual'` |
| `effekte` | `'aus'`, `'wenig'`, `'normal'`, `'viel'` | `'normal'` |

- `cleanThemePrefs` (main.js) saeubert beide: unbekanntes Theme → `'neon-dual'`,
  unbekannte Stufe → `'normal'`. Bestehende Felder (`videoAccent`, `chatAccent`,
  `chatAlpha`) bleiben unveraendert erhalten, auch wenn gerade ein anderes Theme
  aktiv ist — zurueck auf Neon Dual heisst: die eigenen Farben sind wieder da.
- Speichern und Vorschau laufen ueber die vorhandenen Wege `save-theme-prefs`,
  `preview-theme-prefs` und `theme-changed`. Keine neuen IPC-Kanaele.
- **Bestandsnutzer** (auch der Bruder per Auto-Update) sehen nach dem Update
  nichts Neues ausser der Galerie-Zeile: ohne `theme` im Store gilt Neon Dual.

## 2. Aufbau

```
renderer/lib/themes.js            DOM-frei (UMD wie theme.js), unit-getestet
renderer/lib/fx-engine.js         Partikel-Engine, mit Attrappen unit-getestet
renderer/lib/theme-runtime.js     Kleber im Fenster: data-theme setzen, CSS laden,
                                  Welt starten/stoppen, Fehler abfangen
renderer/themes/<id>/theme.css    Farben, Formen, Hintergrund (unter body[data-theme])
renderer/themes/<id>/welt.js      Die Welt des Themes (siehe 4.)
```

**`themes.js`** – Theme-Liste und reine Helfer:

```js
THEMES = [
  { id: 'neon-dual', name: 'Neon Dual', hell: false, farbenFrei: true,  info: 'Farben frei waehlbar' },
  { id: 'sakura',    name: 'Sakura',    hell: true,  farbenFrei: false, info: 'Kirschblueten' },
  { id: 'wald',      name: 'Wald',      hell: false, farbenFrei: false, info: 'Gluehwuermchen' },
  { id: 'koi',       name: 'Koi-Teich', hell: false, farbenFrei: false, info: 'Koi-Fische' },
  { id: 'blasen',    name: 'Seifenblasen', hell: true, farbenFrei: false, info: 'Seifenblasen' }
]
themeById(id)        → Eintrag, unbekannt → Neon Dual
cleanTheme(id)       → gueltige id
cleanEffekte(stufe)  → gueltige Stufe
EFFEKT_FAKTOR        = { aus: 0, wenig: 0.4, normal: 1, viel: 1.8 }
```

**`theme-runtime.js`** – in beiden Fenstern eingebunden. Bei jedem
`applyTheme(prefs)`:

1. `document.documentElement.dataset.theme = id` (also `<html data-theme>`, damit die
   Theme-CSS mit `:root[data-theme="…"]` arbeiten kann).
2. Theme-CSS als `<link id="theme-css">` setzen bzw. tauschen (Neon Dual hat
   keine Datei — seine Farben kommen wie bisher aus `accentVars`).
3. Laufende Welt stoppen (`welt.stop()`, Engine raeumt alle Partikel weg),
   neue Welt per `<script>` nachladen und starten. Gleiches Theme + nur andere
   Stufe → Welt bleibt, nur `engine.setFaktor()`; Stufe `aus` → Welt stoppen
   und nicht neu starten (siehe 8.).
4. Bei Neon Dual bleibt `applyTheme` wie heute (accentVars); bei anderen Themes
   setzt die Theme-CSS die Variablen (`--bg`, `--panel`, `--accent`, ...), und
   `accentVars` wird uebersprungen. Nur `chatAlpha` wirkt weiter, ueber eine
   eigene Variable `--chat-alpha`, die jede Theme-CSS fuer ihre Flaechen nutzt.

Die Welten laden lazy: Wer Neon Dual nutzt, laedt keinen Partikel-Code ausser
dem kleinen Neon-Ereigniseffekt.

## 3. Galerie (Auswahl)

- Im ⚙-Popup ersetzt die Zeile **„🎨 Theme: Sakura ›"** den bisherigen
  Abschnittsanfang von „Darstellung". Darunter:
  - **Effekte-Regler** mit vier Stufen (Segment-Knopfreihe *Aus · Wenig ·
    Normal · Viel*), wirkt sofort in beiden Fenstern, gespeichert in `effekte`.
  - Presets + Farbwaehler + „Farben zuruecksetzen": **nur sichtbar bei Neon
    Dual**.
  - Deckkraft-Regler (Chat): **immer sichtbar**.
- Klick auf die Theme-Zeile oeffnet die **Galerie** als Overlay ueber dem
  Chat-Fenster (unterhalb der Titelleiste): Ueberschrift „🎨 Themes", ✕ rechts,
  darunter eine scrollbare Liste grosser Karten. Jede Karte: lebendige
  Vorschau (ca. 70 px hoch, die echte Welt im Kleinformat mit Faktor `wenig`),
  Name, Kurzinfo („hell · Kirschblueten"), aktives Theme mit ✓ und
  Akzent-Rahmen.
- Klick auf eine Karte: `saveThemePrefs({ ...themePrefs, theme: id })` → beide
  Fenster wechseln sofort. Galerie bleibt offen, damit man durchprobieren kann.
- Schliessen: ✕ oder Esc (die Titelleiste bleibt fuer Fenster-Ziehen und
  ─▢✕ zustaendig). Vorschauen laufen nur bei
  offener Galerie und werden beim Schliessen gestoppt.

## 4. Welten

Jede `welt.js` registriert sich als `window.TwitchDualWelten[id] = erzeugeWelt`
und bekommt beim Start:

```js
erzeugeWelt({ engine, fenster: 'chat'|'video'|'vorschau', FxEngine })
→ { start(), stop(), maus(x, y), klickInsLeere(x, y),
    ereignis(art, { betrag, ursprung: {x, y} }), gast() }
// Ebenen + Faktor stecken in der Engine; Partikel-Stile sind inline, damit
// Galerie-Vorschauen ohne die jeweilige theme.css funktionieren.
```

**Ebenen** (beide `position: fixed`, `pointer-events: none`):

- **Chat-Fenster:** `ebeneHinten` hinter `#messages` (Ambient, gedaempft auf
  ~55 % Deckkraft, damit Text lesbar bleibt), `ebeneVorn` ueber allem (nur
  kurze Ereignis-Effekte). Gilt fuer Live **und VOD**.
- **Video-Fenster:** `ebeneHinten` im Home-Overlay und hinter den Leisten,
  **nie ueber dem Player** — ausser bei Gastauftritten (unten). Im
  **Nur-Video-Modus** (`body.video-only`) laeuft gar nichts.

**Die vier Themes:**

| Theme | Ambient | Maus | Klick ins Leere | Kiste (gross) | Punkte (klein) | Gast uebers Video |
|---|---|---|---|---|---|---|
| Sakura (hell, Rosa/Lila-Pastell, runde Formen) | 6–10 Blueten segeln, drehen sich | streut ab und zu eine Bluete vom Zeiger | kleiner Bluetenwirbel | Bluetenexplosion aus dem Punkte-Chip, Blueten segeln 3 s ueber den Chat | 4–6 Blueten am Chip | eine Bluete segelt diagonal durchs Bild |
| Wald (dunkel, Moosgruen) | 5–8 Gluehwuermchen schwirren, pulsieren | folgen der Maus locker | Gluehwuermchen-Funke | Schwarm fliegt zum Chip, leuchtet hell auf | 2–3 kommen zum Chip | ein Gluehwuermchen kreuzt das Bild |
| Koi-Teich (dunkel, Petrol + Orange) | 3–4 Kois ziehen Kreise | Wellenringe unter der Maus (gedrosselt) | Welle, Kois fluechten | goldene Lotusbluete oeffnet sich am Chip, Kois schwimmen hin, grosse Welle | Koi springt am Chip | ein Koi gleitet durchs Bild |
| Seifenblasen (hell, Himmelblau/Flieder) | Blasen steigen auf, schillern | — | Treffer: Blase platzt in Funken; daneben: neue Blase | Blasen-Schwall, eine grosse Blase traegt „+N" | 1 Blase mit „+N" steigt auf | eine Blase schwebt durchs Bild |

**Neon Dual** bekommt nur einen Ereignis-Effekt (kurzer Cyan/Magenta-
Funkenregen am Chip, bei der Kiste groesser) — kein Ambient, damit sich fuer
Bestandsnutzer nichts aufdraengt.

**Gastauftritte:** alle 2–4 Minuten (Zufall, skaliert mit dem Faktor;
bei `aus` nie) fliegt *ein* Partikel 3–6 s quer ueber den laufenden Player,
halbtransparent, `pointer-events: none`. Bei einer Kiste zusaetzlich sofort
einer. Nicht im Nur-Video-Modus, nicht bei pausiertem Player.

## 5. Ereignisse

- `zeigeZuwachs(z)` in `chat.js` ruft zusaetzlich
  `ThemeRuntime.ereignis(z.quelle === 'kiste' ? 'kiste' : 'punkte', { betrag: z.betrag, ursprung: mitteVon($pointsChip) })`.
  Die bestehende „+N"-Anzeige und das Wackeln des Belohnungen-Knopfs bleiben.
- Gastauftritt bei der Kiste: chat.js meldet nichts extra; main.js broadcastet
  bereits `points-update` an beide Fenster — das Video-Fenster wertet dort
  `zuwaechse` mit `quelle: 'kiste'` aus und loest `gast()` aus.
- VOD: keine Punkte-Ereignisse (Twitch vergibt dort keine), Ambient/Maus/Klick
  laufen trotzdem.
- **Klick ins Leere:** ein Listener am Dokument; zaehlt nur, wenn
  `e.target.closest('button, a, input, textarea, [contenteditable], .msg, #composer, #settings-pop, iframe')`
  leer ist. Die App bekommt jeden Klick wie bisher; die Welt sieht ihn nur
  zusaetzlich.

## 6. Partikel-Engine (`fx-engine.js`)

```js
createEngine({ ebenen: { hinten, vorn, gast }, doc, max = 40, faktor, sichtbar, raf, ... })
engine.spawn({ ebene, inhalt, stil, keyframes, dauerMs, easing }) → Element|null
engine.element({ ebene, inhalt, stil })   // dauerhaft (Fisch, Gluehwuermchen)
engine.setFaktor(f)   // 0..1.8, skaliert max und Spawn-Raten der Welt
engine.stop()         // alle Partikel + Timer weg
engine.intervall(fn, ms)  // Ambient-Takt, haelt bei unsichtbarem Fenster an
engine.schleife(fn)       // Bewegung pro Frame, fordert pausiert KEINEN Frame an
```

- Animation nur ueber `transform` und `opacity` per Web Animations API
  (Compositor, kein Layout). Partikel entfernen sich bei `onfinish` selbst.
- **Obergrenze:** `spawn` liefert `null`, wenn `max * faktor` erreicht ist.
- **Sichtbarkeit:** bei `document.visibilityState === 'hidden'` (minimiert,
  verdeckt) erzeugen Intervalle nichts; laufende Partikel fliegen zu Ende.
- **Maus** wird pro Animation Frame hoechstens einmal an die Welt gereicht.
- Zeit, `requestAnimationFrame` und Sichtbarkeit sind injizierbar → Tests
  ohne Browser.

## 7. Fehlerverhalten

- Wirft eine Welt (beim Laden, Start oder in einem Anschluss), stoppt die
  Runtime sie, das Fenster bleibt mit der Theme-CSS (ohne Effekte) bedienbar,
  und ins Diagnose-Protokoll geht `theme:welt-fehler { theme, phase, fehler }`.
- Theme-CSS laedt nicht → Fallback auf Neon Dual, Protokoll `theme:css-fehler`.
- Unbekanntes Theme im Store → `cleanThemePrefs` macht Neon Dual daraus.

## 8. Leistung: „Aus" kostet nichts

Vorgabe von Janis: Wenn die Effekte beim Zocken stoeren, werden sie auf
**Aus** gestellt — dann darf keine Leistung verloren gehen. Deshalb:

- **Stufe `aus` = nichts laeuft.** Keine Welt wird geladen oder gestartet,
  keine rAF-Schleife, kein Intervall, kein Maus-/Klick-Listener, keine
  Gastauftritte, keine Ereignis-Effekte. Die Effekt-Ebenen bleiben leer. Es
  wirken nur die Farben und Formen der Theme-CSS. Umschalten auf `aus` stoppt
  eine laufende Welt sofort (wie ein Theme-Wechsel).
- Ueber `aus` hinaus keine Leistungs-Abnahme. Als Schutz bleiben eine
  Partikel-Obergrenze je Fenster (40 bei `normal`, skaliert mit dem Faktor) und
  die Pause bei unsichtbarem Fenster.

## 9. Tests

- `test/themes.test.js`: Liste vollstaendig, `themeById`/`cleanTheme`/
  `cleanEffekte` mit Muell-Eingaben, `EFFEKT_FAKTOR` monoton.
- `test/theme-runtime.test.js` (Attrappen): Stufe `aus` startet keine Welt,
  registriert keine Listener/Intervalle; Wechsel auf `aus` stoppt die laufende Welt.
- `test/fx-engine.test.js` (DOM-Attrappe, Fake-Zeit): Obergrenze greift,
  Faktor 0 erzeugt nichts, `stop()` raeumt alles, unsichtbares Fenster pausiert
  Intervalle, Partikel entfernen sich nach Ablauf.
- `cleanThemePrefs` ist heute in `main.js` und ungetestet. Die Saeuberung
  wandert als reine Funktion `cleanThemePrefs(prefs)` nach `themes.js`
  (main.js ruft sie nur noch auf) und wird dort getestet: neue Felder,
  Bestandsdaten ohne `theme` → Neon Dual, Akzentfarben und `chatAlpha` bleiben
  bei Theme-Wechsel erhalten.
- `test/klick-ins-leere.test.js`: die Ziel-Filterregel als reine Funktion
  (Knopf/Link/Eingabe/Nachricht → nein, Hintergrund → ja).
- **Live-Abnahme** per CDP in der laufenden App: jedes Theme durchschalten
  (Screenshot beider Fenster), Kiste/Punkte-Ereignis kuenstlich ausloesen,
  Gastauftritt erzwingen, Nur-Video-Modus pruefen (keine Effekte), Stufe `aus`
  pruefen: keine Partikel-Elemente, keine laufenden Animationen
  (`document.getAnimations().length === 0`) und keine Welt geladen.

## 10. Betroffene Dateien

| Datei | Aenderung |
|---|---|
| `renderer/lib/themes.js` | neu |
| `renderer/lib/fx-engine.js` | neu |
| `renderer/lib/theme-runtime.js` | neu |
| `renderer/themes/{sakura,wald,koi,blasen}/{theme.css,welt.js}` | neu |
| `renderer/themes/neon-dual/welt.js` | neu (nur Ereigniseffekt) |
| `main.js` | Store-Default um `theme`/`effekte`, `cleanThemePrefs` kommt aus `themes.js` |
| `renderer/chat/index.html`, `chat.css`, `chat.js` | ⚙-Popup umgebaut, Galerie, Ebenen, `zeigeZuwachs` meldet Ereignis, `applyTheme` ueber Runtime |
| `renderer/video/index.html`, `video.js`, `home.css` | Ebenen, `applyTheme` ueber Runtime, Gast bei Kisten-`points-update` |
| `test/*` | siehe 9. |

## Randfaelle

- **Theme-Wechsel waehrend eines Ereignis-Effekts:** `stop()` raeumt sofort
  alles, kein Partikel der alten Welt bleibt haengen.
- **Galerie offen + Theme-Wechsel von aussen** (zweites Fenster): Galerie
  markiert das neue Theme beim naechsten `theme-changed`.
- **Helle Themes + Glass-Transparenz:** `--chat-alpha` gilt auch hier; bei sehr
  niedriger Deckkraft ist die Lesbarkeit Sache des Nutzers (wie heute).
- **Sehr schneller Chat:** Ambient haengt nicht an der Nachrichtenrate; die
  Engine-Obergrenze schuetzt vor Haeufung.
- **Zwei Zuwaechse im selben Takt** (Kiste + passiv): wie heute um 450 ms
  versetzt, die Effekte folgen derselben Reihenfolge.
