# TwitchDual v1.5.0 — Neon Dual: On Air

Stand: 2026-07-16. Validiertes Design aus Brainstorming-Session
(Mockup-Vergleich dreier Richtungen; gewählt: Neon Dual als Basis
plus On-Air-Leiste und Monospace-Details aus der Senderaum-Richtung).

## Ziel

TwitchDual bekommt eine eigene visuelle Identität, die sich klar von der
Twitch-App abhebt: **Neon-Dual-Look** (Video-Fenster Cyan, Chat-Fenster
Magenta, Glow, fast schwarzer Grund), **On-Air-Leiste** als Live-Signal
über beiden Fenstern und **frei wählbare Fensterfarben** in den
Einstellungen. Twitch-Lila (`#9147ff`) verschwindet vollständig.

Keine Änderungen an VOD-Paginierung, Autoscroll-Logik, Adblock oder
Badge-Auflösung — reine Präsentations- und Prefs-Schicht.

## Paket 1: Design-System „Neon Dual“

### 1.1 Farbrollen und Tokens

Drei Farbrollen, jede mit genau einer Aufgabe:

- **Fensterfarbe Video** (Default Cyan `#35E0FF`): Identität des
  Video-/Home-Fensters.
- **Fensterfarbe Chat** (Default Magenta `#FF4FA3`): Identität des
  Chat-Fensters.
- **On-Air-Verlauf**: linearer Verlauf Video-Farbe → Chat-Farbe,
  ausschließlich für das Live-Signal (Leiste + „ON AIR“-Schriftzug).

Grundflächen (beide Fenster identisch, fest):

- Grund `#0B0B11`, Panel/Leisten je Fenster leicht zur Fensterfarbe
  getönt (Video `#0E1319`, Chat `#170E14`), Text `#EDEDF4`,
  gedämpft `#8B8B9C`, Zeitstempel `#565666`.

Alle Akzent-Verwendungen laufen über CSS-Variablen auf `:root`
(`--accent`, `--accent-strong`, `--accent-border`, `--accent-glow`,
`--onair-from`, `--onair-to`), gesetzt per JS beim Start und bei
Farbwechsel. In den Stylesheets steht **kein Akzent-Hex mehr hart**.

### 1.2 Neue DOM-freie Lib `renderer/lib/theme.js`

Unit-getestet (node:test), wie die anderen Libs:

- `normalizeHex(input, fallback)`: akzeptiert `#RGB`/`#RRGGBB`
  (case-insensitiv, mit/ohne `#`), sonst Fallback. Kaputte Werte aus
  dem Store können das UI nie zerlegen.
- `accentVars(hex)`: leitet aus einer Farbe die Transparenz-Varianten ab
  (Rahmen ~40 %, Glow ~20 %, Titeltext aufgehellt, Statuspunkt voll) und
  liefert sie als Objekt `{ name: cssValue }` — jede Nutzerfarbe bekommt
  automatisch stimmige Abstufungen.
- `DEFAULTS`: `{ videoAccent: '#35E0FF', chatAccent: '#FF4FA3' }`.

### 1.3 Anwendung der Fensterfarbe

Pro Fenster (Akzent = eigene Fensterfarbe):

- Titelleiste: Schriftzug in aufgehellter Akzentfarbe, untere Kante
  als Akzent-Border.
- Fensterrahmen: 1px Akzent-Border + dezenter Außen-Glow
  (`box-shadow`), passend zu den randlosen Fenstern aus v1.4.0.
- Statuspunkt (Chat-Footer bzw. Video-Leiste): Akzentfarbe mit
  kleinem Glow.
- Buttons/Fokus: Primär-Buttons und `:focus`-Rahmen (z. B.
  `#add-input`) in Akzentfarbe statt `#9147ff`; „Neue Nachrichten“-
  Button im Chat ebenso.
- LIVE-Pill auf Home-Karten: Magenta-Verlauf mit Glow (wie Mockup).

### 1.4 Monospace-Details (aus „Senderaum“)

`"Cascadia Code", Consolas, monospace` für: Zeitstempel im Chat,
msg/min-Zähler, Status-Footer-Texte, „ON AIR“-Schriftzug,
Zuschauerzahlen auf Home-Karten. Fließtext bleibt Inter/Segoe UI.

## Paket 2: Anpassbare Fensterfarben

- **Speicherung**: `themePrefs` in electron-store
  (`{ videoAccent, chatAccent }`), Defaults aus `theme.js`.
- **IPC** (Muster wie `chatPrefs`): `get-ui-prefs` liefert zusätzlich
  `themePrefs`; neu `save-theme-prefs` (send). Main persistiert
  (Werte vorher via `normalizeHex` säubern) und broadcastet
  `theme-changed` mit den vollen Prefs an **beide** Fenster; die
  Renderer setzen nur ihre CSS-Variablen neu — Wirkung sofort,
  kein Reload.
- **UI**: im bestehenden ⚙-Popup des Chats eine Sektion „Farben“ mit
  zwei nativen `<input type="color">` („Video“, „Chat“) und einem
  „Zurücksetzen“-Button (setzt beide auf Default). `input`-Event =
  Live-Vorschau in beiden Fenstern, `change` = speichern
  (wie beim Schriftgrößen-Slider).
- Die On-Air-Leiste und alle abgeleiteten Glow-Varianten folgen
  automatisch, weil alles aus `accentVars()` berechnet wird.

## Paket 3: On-Air-Leiste

- 2px-Leiste am oberen Rand **beider** Fenster (über der Titelzeile),
  Verlauf `--onair-from` → `--onair-to`.
- **Zustände**:
  - *On Air* (Live-Kanal geladen und Player spielt): volle
    Leuchtkraft + langsamer Puls (~1,6 s), daneben im Titel der
    „● ON AIR“-Schriftzug (Verlaufs-Text, Monospace).
  - *Gedimmt* (VOD, Pause, offline, nichts geladen): Leiste bleibt als
    stark gedimmte Linie sichtbar (~25 % Opazität, kein Puls), kein
    „ON AIR“-Schriftzug. Kein Layout-Sprung beim Umschalten.
- **Anbindung ohne neues Protokoll**: Beide Fenster kennen den Modus
  aus dem `load`-Broadcast (`mode: 'live' | 'vod'`). Play/Pause/Ende
  kommt aus dem vorhandenen `player-state`-Relay; das Video-Fenster
  wertet denselben Zustand lokal aus, das Chat-Fenster empfängt ihn
  wie bisher für die Statuszeile. On Air = `mode === 'live'` und
  letzter `player-state` ist „spielt“.
- Die Zustandslogik (Modus + Player-State → `onair | dimmed`) als
  kleine DOM-freie Funktion in `theme.js`, unit-getestet.

## Nicht-Ziele

- Kein Hell-Thema, kein Theme-Umschalter — nur der dunkle Neon-Look.
- Grundflächen (Schwarz-Töne) sind **nicht** einstellbar, nur die
  beiden Fensterfarben. (Verhindert unlesbare Kombinationen und hält
  das ⚙-Popup schlank.)
- Keine Änderungen an VOD-Paginierung, Autoscroll, IPC-Lade-Logik,
  Adblock, Badges, Emotes.
- Animationen bleiben — wie in v1.4.0 bewusst entschieden — **immer
  an** (prefers-reduced-motion wird weiterhin ignoriert).

## Fehlerfälle

- Kaputte/fehlende `themePrefs` im Store → `normalizeHex`-Fallback auf
  Defaults; die App startet nie ohne gültige Akzentfarben.
- Sehr dunkle Nutzerfarben: Titeltext wird aus der Akzentfarbe
  **aufgehellt** berechnet (nicht roh übernommen), damit er auf den
  dunklen Leisten lesbar bleibt.
- `theme-changed` erreicht ein noch ladendes Fenster nicht → beim
  Start holt jedes Fenster die Prefs sowieso über `get-ui-prefs`
  (Broadcast ist nur der Live-Update-Pfad).
- Fehlt ein `player-state` nach dem Laden (Player noch nicht bereit),
  gilt *gedimmt*, bis das erste „spielt“ eintrifft — nie fälschlich
  „On Air“.

## Tests

Neue Unit-Tests (node:test, DOM-frei):

1. `normalizeHex` — `#RGB`, `#RRGGBB`, ohne `#`, Großschreibung,
   Müll-Strings, `undefined` → Fallback.
2. `accentVars` — liefert alle erwarteten Variablen; Transparenz- und
   Aufhellungs-Ableitung für helle wie dunkle Eingangsfarben.
3. On-Air-Zustandslogik — live+spielt → `onair`; live+pause, vod,
   nichts geladen, Player-Ende → `dimmed`; Reihenfolge von `load` und
   `player-state` egal.

Bestehende Tests müssen unverändert grün bleiben (Datenstand-
unabhängig, siehe `test/`).

## Release

- Version auf **1.5.0**, Release-Ablauf wie in `docs/TODO.md`
  (dist, Bindestrich-Namen, `gh release create`).
- Manueller Smoke-Test: Live-Chat großer Kanal (Glow/Puls, msg/min),
  VOD inkl. Seek (Leiste gedimmt), Farbwechsel im ⚙-Popup wirkt sofort
  in beiden Fenstern, Reset auf Defaults, App-Neustart behält Farben.

## Umsetzungsreihenfolge (Vorschlag)

1. `theme.js` + Tests (normalizeHex, accentVars, On-Air-Logik).
2. Token-Umbau: CSS-Variablen in `chat.css`/`home.css`/Video-Leiste,
   Neon-Grundlook mit Default-Farben (noch ohne Einstellungen).
3. On-Air-Leiste in beiden Fenstern (nutzt vorhandene Signale).
4. `themePrefs` + IPC + Farbwähler im ⚙-Popup (Live-Vorschau, Reset).
5. Smoke-Test, Version 1.5.0, Release.
