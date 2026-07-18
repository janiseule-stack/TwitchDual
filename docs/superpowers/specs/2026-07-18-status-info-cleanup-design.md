# Status-/Info-Elemente aufräumen (v1.7.0)

**Datum:** 2026-07-18
**Branch:** `status-info-cleanup`
**Ausgangsversion:** 1.6.0 → Ziel **1.7.0**

## Problem

Die kleinen Status-/Info-Elemente in TwitchDual wirken willkürlich platziert und
zwischen Video- und Chat-Fenster inkonsistent:

- **`● ON AIR`** sitzt im Video rechts vor `⛶` gequetscht, im Chat dagegen
  **mittig schwebend** (weil `#head` `justify-content: space-between` ist und das
  Tag zwischen andere Elemente fällt) — zwei völlig verschiedene Positionen.
- Es ist zudem **redundant** zur ohnehin glühenden `#onair-bar` (2px-Verlaufslinie).
- **Live-/Verbindungsstatus** folgt keiner gemeinsamen Logik: Video zeigt
  `live: <kanal>` **oben**, Chat zeigt `verbunden` **unten** im Footer — andere
  Ecke, anderes Muster.
- Die **Rate** (`msg/min`) klebt unten-links neben `#conn`, rechts daneben viel
  Leere; kein Aktivitäts-/Puls-Gefühl.
- **⚙** im Chat-Kopf schwebt mittig (gleiche `space-between`-Ursache wie ON AIR).
- Das **Settings-Popup** wirkt flach/muddy, Überschriften kaum lesbar, Checkboxen
  Standard-Blau, Namen unpräzise (`Video-Farbe`/`Chat-Farbe` unter Gruppe `Fenster`).
- Der **`🛡 Ads`-Button** im Aktiv-Zustand ist grün (`#1f3d1f`/`#3fa34d`) — eine
  themenfremde Farbe neben dem Cyan/Magenta-Neon.

Belegt durch Ist-Screenshots in `design-screens/current/`.

## Ziel & Leitprinzip

**Kopf = Identität + On-Air, Fuß = technischer Status + Aktivität.** Da das
Video-Fenster keinen Fuß hat (der Player füllt den Body), bleibt der Video-Status
im Kopf, folgt aber demselben `[● Punkt] Label`-Muster wie der Chat-Footer.

Ein zweites Leitprinzip, das der Nutzer bestätigt hat: **alle diese Elemente
hängen an den Akzent-Variablen** (`--accent`, `--accent-title`, `--accent-glow`,
`--accent-border`, `--accent-dim`), die `ThemeLib.accentVars()` aus der vom
Nutzer gewählten Fensterfarbe ableitet. Keine fest verdrahteten Farben mehr →
Farbwähler beeinflusst Status-Punkte, Puls, Popup **und** Ads-Button live.

Proposed-Zielbild in `design-screens/proposed/`.

## Umfang (6 Änderungen)

### 1. On-Air als ein Objekt auf der Leiste

`#onair-bar` wird vom reinen 2px-Strich zu einem **Container fester Höhe (16px)**
mit einer flexiblen Verlaufslinie **und** einem Label `● ON AIR` am rechten Ende:

```
[──────────────────────────────────]  ● ON AIR
```

- **Feste Höhe (16px) in jedem Zustand** → kein Layout-Sprung, wenn der Stream
  live geht (bestehende Regel im Code: „Kein display-Wechsel → kein Layout-Sprung").
- **Dimmed** (nicht live): dünne Linie `opacity: .22`, Label unsichtbar (`opacity: 0`).
- **Live** (`body.onair`): Linie volle Leuchtkraft + Glow + Puls, Label sichtbar
  (Verlaufs-Text, wie bisher das Tag).
- **Identisch** in Video (`renderer/video/index.html` inline `<style>`) und Chat
  (`renderer/chat/chat.css`).
- Das alte `#onair-tag` wird aus **beiden** Köpfen entfernt (HTML) — die Funktion
  wandert vollständig auf die Leiste.

DOM (beide `index.html`):
```html
<div id="onair-bar">
  <span class="oa-line"></span>
  <span id="oa-label">● ON AIR</span>
</div>
```

Kern-CSS (in beiden Fenstern gleich):
```css
#onair-bar{ display:flex; align-items:center; gap:10px; height:16px; padding:0 12px; }
#onair-bar .oa-line{ flex:1; height:2px; border-radius:2px;
  background:linear-gradient(90deg,var(--onair-from),var(--onair-to)); opacity:.22; }
body.onair #onair-bar .oa-line{ opacity:1; box-shadow:0 0 8px var(--accent-glow);
  animation:onair-pulse 1.6s ease-in-out infinite; }
#oa-label{ font-family:var(--mono); font-size:10px; font-weight:700; letter-spacing:.14em;
  white-space:nowrap; background:linear-gradient(90deg,var(--onair-from),var(--onair-to));
  -webkit-background-clip:text; background-clip:text; color:transparent;
  opacity:0; transition:opacity .25s; }
body.onair #oa-label{ opacity:1; }
```

Im **Nur-Video-Modus** bleibt `#onair-bar` versteckt wie bisher
(`body.video-only #onair-bar { display:none; }`).

### 2. Einheitliches Status-Punkt-Muster `[● Punkt] Label`

Beide Fenster zeigen Status als farbigen Punkt + Label. Der **Chat** hat das schon
(`#conn::before`); der **Video-Status** (`#status`) bekommt denselben Punkt:

```css
#status{ display:inline-flex; align-items:center; gap:6px; }
#status::before{ content:''; width:8px; height:8px; border-radius:50%;
  background:var(--ts); flex-shrink:0; }
body.onair #status::before{ background:var(--accent); box-shadow:0 0 6px var(--accent-dim); }
#status.err::before{ background:#eb0400; box-shadow:none; }
```

- **Grau** = bereit / geladen aber nicht live (`--ts`).
- **Akzent + Glow** = on air (nutzt das bereits von `updateOnAir()` gesetzte
  `body.onair` — **keine neue JS-Logik nötig**).
- **Rot** = Fehler (`#status.err`, bereits von `setStatus(text, true)` gesetzt).

`setStatus()` in `video.js` bleibt unverändert; nur CSS kommt hinzu.

### 3. Chat-Footer: conn links, Aktivität rechts, mit Puls-Punkt

```css
#footer{ display:flex; align-items:center; justify-content:space-between; }
#rate{ display:inline-flex; align-items:center; gap:6px; margin-left:0; }
#rate::before{ content:''; width:8px; height:8px; border-radius:50%;
  background:var(--accent); box-shadow:0 0 var(--rate-glow,6px) var(--accent-dim);
  flex-shrink:0; transform:scale(var(--rate-scale,1)); }
```

`#conn` bleibt links, `#rate` rutscht mit `space-between` nach rechts (füllt breite
Fenster). Vor der Zahl ein **Puls-Punkt** in Akzentfarbe.

**Puls-Verhalten** (`renderer/chat/chat.js` + reine Logik in `renderer/lib/chat-ui.js`):

- Neue **reine, testbare Funktion** in `chat-ui.js`:
  ```js
  // 0..1: wie „heiß" der Chat gerade ist (msg/min gegen eine Obergrenze).
  function rateHeat(n, max = 120) { return Math.max(0, Math.min(1, n / max)); }
  ```
  Wird zum `ChatUi`-Export hinzugefügt (neben `createRateMeter`).
- In `tickRateDisplay(now)`: aus `minuteRate` die Zahl `n` holen (wie bisher), dann
  `--rate-glow` (z.B. `6px + heat*10px`) am `#rate` setzen → **glüht stärker bei
  höherer Rate**.
- **Blitz pro Nachricht:** beim Eintreffen einer Nachricht kurz `--rate-scale`
  anheben / eine Ping-Klasse retriggern. **Gedrosselt** über den bereits
  vorhandenen `msgRate`-Zähler + `ANIM_MAX_RATE`: oberhalb der Schwelle kein
  diskreter Blitz mehr (nur stetiges Glühen), analog zur bestehenden
  `#messages.no-anim`-Logik — kein Dauerflackern bei Mega-Chats.

### 4. ⚙ fest zur rechten Gruppe

Ursache des mittigen Schwebens: `#head` ist `space-between` und verteilt alle
Kinder. Fix ohne HTML-Umbau:
```css
#settings-btn{ margin-left:auto; }
```
Dadurch packen `⚙` + `#win-controls` rechts zusammen, `#title` (+ `#mode`) bleiben
links — spiegelt die rechte Gruppe des Video-Fensters.

### 5. Settings-Popup: Theme-Styling + präzisere Namen

**Styling** (`renderer/chat/chat.css`):
```css
#settings-pop{ background:var(--panel); border:1px solid var(--accent-border);
  box-shadow:0 10px 28px rgba(0,0,0,.6), inset 0 0 30px -16px var(--accent-glow); }
.opt-group-title{ color:var(--accent-title); opacity:.9; }
#settings-pop input[type=checkbox]{ accent-color:var(--accent); width:14px; height:14px; }
#settings-pop input[type=range]{ accent-color:var(--accent); }
#opt-color-reset{ color:var(--accent-title); border-color:var(--accent-border); }
```

**Umbenennungen** (`renderer/chat/index.html`):

| alt | neu |
|---|---|
| Gruppe „Fenster" | **Darstellung** |
| Zeitstempel anzeigen | **Zeitstempel** |
| Badges anzeigen | **Badges** |
| Schrift | **Schriftgröße** |
| Video-Farbe | **Video-Akzent** |
| Chat-Farbe | **Chat-Akzent** |
| Deckkraft | **Deckkraft (Chat)** |
| Zurücksetzen | **Farben zurücksetzen** |

(Gruppe „Chat" bleibt.)

### 6. `🛡 Ads`-Button akzentgebunden statt grün

`renderer/video/index.html` inline `<style>`, `#adblock-toggle.on`:
```css
#adblock-toggle.on{ background:var(--accent-glow); border-color:var(--accent-border);
  color:var(--accent-title); box-shadow:0 0 10px -3px var(--accent); }
```
Grün (`#1f3d1f`/`#3fa34d`) entfällt. Aktiv-Zustand folgt jetzt dem Video-Akzent
(Farbwähler „Video-Akzent"), genau wie Status-Punkt und ON-AIR-Leiste.

## Betroffene Dateien

- `renderer/video/index.html` — inline `<style>` (onair-bar, status-dot, adblock.on)
  + HTML (onair-bar Struktur, `#onair-tag` entfernen)
- `renderer/chat/index.html` — HTML (onair-bar Struktur, `#onair-tag` entfernen,
  Popup-Umbenennungen)
- `renderer/chat/chat.css` — onair-bar, footer/rate, `#settings-btn` margin,
  Popup-Theme
- `renderer/chat/chat.js` — Puls-Punkt (`--rate-glow`/`--rate-scale`), Nutzung von
  `rateHeat`
- `renderer/lib/chat-ui.js` — neue reine Funktion `rateHeat`, Export
- **`renderer/lib/theme.js` — UNVERÄNDERT.** `onAirState()` bleibt wie es ist; die
  On-Air-Darstellung ist rein CSS-getrieben über das bestehende `body.onair`. Die
  Unit-Tests (`test/theme.test.js`) bleiben grün.

## Nicht im Umfang (YAGNI)

- Keine `emotes/min`-Anzeige (bewusst verworfen — Rauschen im schmalen Footer).
- Kein Chat-Rate-Broadcast ins Video-Fenster (Aktivität lebt im Chat).
- Kein neuer Footer im Video-Fenster (Player füllt den Body; Status bleibt oben).

## Tests & Verifikation

- **`test/chat-ui.test.js`**: Tests für `rateHeat` ergänzen (0 → 0, `max` → 1,
  darüber geclampt 1, negativ → 0, Mittelwert dazwischen).
- **`test/theme.test.js`**: unverändert grün (kein `theme.js`-Change).
- `npm test` komplett grün vor Commit.
- **Visuelle Verifikation**: `scratchpad/shot.js`-Ansatz erneut auf die *echten*
  (dann geänderten) Dateien anwenden bzw. App breit starten → Screenshots, finale
  Bestätigung durch den Nutzer **vor** Release.

## Danach: Version + Release

Nach bestätigtem Look: Version **1.6.0 → 1.7.0** bumpen, `docs/TODO.md`-Release-Flow
wie bei v1.6.0, Release anlegen. Memory-Eintrag `twitchdual-project` aktualisieren.
