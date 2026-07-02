# Design: Native Twitch-Emotes + Chat-Einstellungen (v1.1.0)

**Datum:** 2026-07-02 · **Status:** vom Nutzer freigegeben

## Ziel

Das Chat-Erlebnis in beiden Modi (Live + VOD-Replay) verbessern:

1. Offizielle Twitch-Emotes (Sub-Emotes, globale wie Kappa) als Bild rendern —
   heute erscheinen sie nur als Text; nur 7TV-Emotes werden ersetzt.
2. Zeitstempel und Badges abschaltbar machen (⚙-Menü im Chat-Kopf),
   Einstellungen überleben den Neustart.

Kein neuer API-Aufruf nötig: Die Emote-Informationen liegen in den bereits
empfangenen Daten (IRC-Tag bzw. Kommentar-Fragmente).

## 1. Native Twitch-Emotes

### Live (IRC)

- Die Tags-Capability wird bereits angefordert (`CAP REQ :twitch.tv/tags …`).
  Der `emotes=`-Tag hat das Format `<id>:<start>-<end>,<start>-<end>/<id>:…`
  (Codepoint-Indizes in den Nachrichtentext).
- **Neue Funktion** `emoteTokens(text, emotesTag)` in `renderer/lib/irc.js`
  (UMD wie bisher, unit-getestet): zerlegt den Text anhand der Ranges in
  Tokens `{ type: 'text', value }` | `{ type: 'emote', name, url }`.
- Bild-URL statisch ableitbar:
  `https://static-cdn.jtvnw.net/emoticons/v2/<ID>/default/dark/1.0`.
- Wichtig: Die Ranges zählen **Codepoints**, nicht UTF-16-Einheiten
  (Emoji im Text verschieben sonst die Indizes) — mit `Array.from(text)`
  arbeiten.

### VOD (GraphQL-Kommentare)

- `src/twitch-api.js` reicht das `emote`-Feld der Fragmente schon durch
  (`{ text, emote }`, emote enthält `emoteID`).
- **Neue Funktion** `fragmentsToTokens(fragments)` in
  `renderer/lib/vod-replay.js` neben dem bestehenden `fragmentsToText`:
  Emote-Fragment → Emote-Token (gleiche CDN-URL-Ableitung),
  Text-Fragment → Text-Token.

### Rendering (`renderer/chat/chat.js`)

- `appendMessage` nimmt statt `text` künftig eine Token-Liste an; die
  Aufrufer erzeugen sie (`emoteTokens` im Live-Pfad, `fragmentsToTokens`
  im VOD-Pfad). Text-Tokens laufen weiterhin durch die 7TV-Ersetzung
  (`EmoteText.tokenize`), Emote-Tokens werden direkt als `<img>` gebaut.
  Beide Emote-Welten koexistieren; XSS-Sicherheit bleibt (kein `innerHTML`).
- Die CDN-URL-Ableitung liegt an genau einer Stelle (gemeinsamer Helfer),
  damit Live und VOD nicht divergieren.

## 2. ⚙ Chat-Einstellungen

- Zahnrad-Knopf im Chat-Kopf, öffnet kleines Popover mit zwei Checkboxen:
  **Zeitstempel anzeigen** (Standard: an), **Badges anzeigen** (Standard: an).
- Wirkung über CSS-Klassen am `#messages`-Container (`hide-ts`,
  `hide-badges` mit `display: none` auf `.ts` / `.chip`) — wirkt sofort auf
  alle sichtbaren Nachrichten, kein Re-Rendering.
- Persistenz: neuer Store-Schlüssel `chatPrefs` (`{ showTimestamps,
  showBadges }`) analog `playerPrefs`; Auslieferung über das bestehende
  `get-ui-prefs`-IPC plus neues `save-chat-prefs` (bzw. Erweiterung des
  vorhandenen Save-Kanals — dem bestehenden Muster in `main.js`/`preload.js`
  folgen).

## 3. Fehlerfälle

- Gelöschtes/unbekanntes Emote-Bild → Browser zeigt Alt-Text (wie 7TV heute).
- Fehlender/leerer `emotes`-Tag oder `emote: null`-Fragmente → reiner Text,
  Verhalten wie bisher.
- Kaputter Tag (unplausible Ranges) → Parser fällt auf Text zurück,
  darf nie werfen.

## 4. Tests

- `test/irc.test.js`: `emoteTokens` mit echten Beispielzeilen — ein Emote,
  mehrere Emotes, mehrfaches Vorkommen, Emoji vor dem Emote (Codepoint-Falle),
  leerer/kaputter Tag.
- `test/vod-replay.test.js`: `fragmentsToTokens` mit Text-, Emote- und
  Misch-Fragmenten.
- Bestehende 48 Tests bleiben grün; `npm test` vor und nach jeder Änderung.

## 5. Release

Version auf **1.1.0**, Ablauf wie in `docs/TODO.md` („Releases /
Auto-Update") — installierte Apps (Janis + Bruder) aktualisieren sich selbst.

## Nicht in diesem Umfang

Schriftgröße-Einstellung, animierte Emote-Varianten, Emote-Tooltips mit
Set-Info, zweiter Kanal, E2E-Test, App-Icon.
