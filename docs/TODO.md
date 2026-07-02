# TwitchDual — Roadmap / offene TODOs

Stand 2026-07-02: **Alle Punkte der ursprünglichen Roadmap sind umgesetzt** —
Details in der Git-Historie. Diese Datei sammelt ab jetzt neue Ideen.

## Erledigt

**Robustheit / Testbarkeit**
- VodReplay-Kern DOM-frei (`renderer/lib/vod-replay.js`, unit-getestet):
  merge/dedupe, Coverage, Gap-Skip, Seek-Erkennung.
- Epoch-Guarding gegen überlappende Fetches/Seeks.
- Speicher-Trim (`KEEP_BEHIND` 120 s) für `buffer` + `seen`; Endebedingung
  über `lengthSeconds` (Seek zurück hebt sie auf).
- IRC-Auto-Reconnect mit Backoff + Jitter (`renderer/lib/backoff.js`),
  inkl. Twitch-`RECONNECT`.
- fetch-Timeouts (10 s) + Retries (nur Netzwerk/5xx) zentral in
  `src/twitch-gql.js`; `CLIENT_ID`/Hash an einer Stelle, Helix-Fallback
  im Kopfkommentar skizziert.
- `IntegrityCheckFailed`/veralteter Hash werden als Fehler angezeigt
  statt still als leerer Chat maskiert.

**UX**
- „Neue Nachrichten“-Button beim Hochscrollen; Zeitstempel im VOD-Replay.
- Pause/Play/Ende des Players in der Chat-Statuszeile (player-state-Relay).
- Verlauf (max. 10) als Datalist, Prefill der letzten Quelle, Ladeindikator,
  rote Fehlermeldungen.
- Lautstärke/Qualität werden gemerkt und wieder angewendet.
- Home-Overlay: Favoriten-Suche (Name/Spiel/Titel), Sortierung zentral im
  Main (`sortByLive`), erklärende Leerzustände.
- Tastenkürzel: `Ctrl+L` Eingabefeld, `Space` Play/Pause, `Esc` Overlay.
- Live-Chat-Badges (B/M/V/S), Klick auf Namen kopiert ihn.

**Build**
- `npm run pack` erzeugt portable `dist/TwitchDual-win32-x64/TwitchDual.exe`
  (@electron/packager, nutzt lokalen Electron-Cache).

## Ideen für später

- **Installer** (NSIS via electron-builder) statt portablem Ordner, mit
  Startmenü-Eintrag und Auto-Update-Option.
- **Native Twitch-Emotes im VOD**: das `emote`-Feld der Kommentar-`fragments`
  zusätzlich rendern, nicht nur als Text.
- **Chat-Einstellungen**: Schriftgröße, Zeitstempel an/aus, Badge-Anzeige
  an/aus (kleines ⚙-Menü im Chat-Kopf).
- **Mehrere Chat-Fenster / zweiter Kanal** für Squad-Streams.
- **E2E-Smoke-Test** (Playwright + Electron), der App-Start, Laden eines
  VODs und ersten Chat-Render prüft.
