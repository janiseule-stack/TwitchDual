# Farb-Presets im ⚙-Popup (v1.7.0, #5)

## Problem
Video-/Chat-Akzent lassen sich einzeln per Color-Picker setzen, aber allein eine
stimmige Kombination zu finden ist schwer. Es fehlen kuratierte, gut aussehende
Farbkombis zum schnellen Auswählen.

## Palette (6 Presets)
Jedes Preset = Paar `videoAccent` / `chatAccent` auf Grundton `#0b0b11`.

| id         | Name        | videoAccent | chatAccent |
|------------|-------------|-------------|------------|
| neon-dual  | Neon Dual   | `#35e0ff`   | `#ff4fa3`  |
| sunset     | Sunset      | `#ff9e3d`   | `#ff4f7e`  |
| cyber      | Cyber       | `#8dff5c`   | `#a06bff`  |
| ice-fire   | Ice & Fire  | `#4fb8ff`   | `#ff5a4f`  |
| aurora     | Aurora      | `#46f0a0`   | `#5aa0ff`  |
| pearl      | Pearl       | `#f4f1ff`   | `#c9a3ff`  |

`neon-dual` entspricht exakt `ThemeLib.DEFAULTS` (Video/Chat) — also dem, was
„Farben zurücksetzen" liefert.

## UI (Layout A — kompakte Chip-Reihe)
- Reihe von 6 runden Zwei-Ton-Chips (Video-Farbe ↖ diagonal / Chat-Farbe ↘),
  oben in der Gruppe „Darstellung", über Video-/Chat-Akzent.
- Name je Chip per `title`-Attribut (Hover).
- Aktiver Chip umrandet, wenn die aktuellen Akzente exakt einem Preset
  entsprechen; nach manueller Farbänderung ist keiner aktiv.
- „Farben zurücksetzen" bleibt unverändert darunter.

## Verhalten
- Chip-Klick → `saveThemePrefs({ videoAccent, chatAccent, chatAlpha: <aktuell> })`.
  Gleiches Muster wie der bestehende Reset-Button (Store-Write + Broadcast →
  beide Fenster live). `chatAlpha` (Deckkraft) bleibt unberührt — eigene Achse.
- Aktualisierung des Aktiv-Zustands passiert in `applyTheme(...)`, das ohnehin
  bei jedem Theme-Wechsel läuft.

## Architektur / Dateien
- `renderer/lib/theme.js`: `PRESETS` (Datenliste) + reine Funktion
  `activePreset(prefs)` → passendes Preset-Objekt oder `null` (normalisiert per
  `normalizeHex`, DOM-frei, testbar wie der Rest der Lib).
- `renderer/chat/index.html`: Chip-Reihe (`#opt-presets`) in „Darstellung".
- `renderer/chat/chat.js`: Chips aus `ThemeLib.PRESETS` rendern, Klick-Handler,
  Aktiv-Markierung in `applyTheme`.
- `renderer/chat/chat.css`: Chip-Styles (rund, Zwei-Ton, Glow, aktiv-Rahmen).

## Nebenänderung (Nutzerwunsch)
- On-Air-Puls `onair-pulse` **2.6s → 3.6s** in `renderer/video/index.html` und
  `renderer/chat/chat.css` (langsamer, ruhiger).

## Tests (`test/theme.test.js`)
- `PRESETS`: nicht leer; jeder Eintrag hat `id`, `name`, gültige 6-stellige
  `videoAccent`/`chatAccent` (== ihre eigene Normalisierung).
- `neon-dual` == DEFAULTS (Video/Chat).
- `activePreset`: Treffer bei exakter/anders geschriebener Hex; `null` bei
  Zwischenfarbe; robust gegen kaputte/teilweise prefs.

## Nicht im Scope
- Eigene Presets speichern/benennen. Presets ändern `chatAlpha` nicht.
