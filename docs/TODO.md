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
- Native Twitch-Emotes als Bild in Live-Chat UND VOD-Replay (v1.1.0,
  Token-Rendering; IRC-emotes-Tag + Fragment-emote-Feld, CDN-URL zentral).
- ⚙-Chat-Einstellungen: Zeitstempel/Badges an/aus, persistent (chatPrefs, v1.1.0).

**Werbe-Blocker (v1.2.0)**
- vaft (gepinnt in `vendor/vaft.js`, Fork ryanbr/TwitchAdSolutions) wird per
  Preload in den `player.twitch.tv`-iframe injiziert und überspringt Werbung
  (Playlist-/Player-Typ-Tausch). Nur wenn `adblockEnabled` (Default an).
- Fallback bei durchgekommener Werbung: Overlay „Werbung wird überbrückt …"
  + Mute, gesteuert von DOM-freier Zustandsmaschine
  (`renderer/lib/ad-overlay-state.js`, unit-getestet) mit 120-s-Watchdog.
- Adblock-Schalter (🛡 Ads) in der Video-Leiste, persistent.
- **vaft aktualisieren:** siehe `vendor/README.md` (Datei ersetzen, Smoke-Test,
  als App-Release ausliefern).

**Build**
- `npm run pack` erzeugt portable `dist/TwitchDual-win32-x64/TwitchDual.exe`
  (@electron/packager, nutzt lokalen Electron-Cache).

## Releases / Auto-Update (seit v1.0.0)

- Repo: https://github.com/janiseule-stack/TwitchDual (öffentlich, nötig
  für tokenlosen Auto-Update-Zugriff).
- Installer: `npm run dist` → `dist/installer/TwitchDual Setup <version>.exe`.
- Auto-Update: electron-updater in `main.js` (Check beim Start + alle 4 h,
  Download im Hintergrund, Installation beim nächsten Beenden). Nur in der
  gepackten App aktiv.
- **Neue Version veröffentlichen:**
  1. `version` in `package.json` erhöhen, committen, pushen.
  2. `npm run dist`
  3. Im Ordner `dist/installer`: EXE + Blockmap auf Bindestrich-Namen
     kopieren (GitHub ersetzt Leerzeichen, `latest.yml` erwartet
     `TwitchDual-Setup-<version>.exe`), dann
     `gh release create v<version> TwitchDual-Setup-<version>.exe
     TwitchDual-Setup-<version>.exe.blockmap latest.yml`.
     (Alternativ `npm run release` mit gesetztem `GH_TOKEN`.)
  4. Installierte Apps holen sich das Update von selbst.

## Ideen für später

- **Native Twitch-Emotes im VOD**: das `emote`-Feld der Kommentar-`fragments`
  zusätzlich rendern, nicht nur als Text.
- **Chat-Einstellungen**: Schriftgröße, Zeitstempel an/aus, Badge-Anzeige
  an/aus (kleines ⚙-Menü im Chat-Kopf).
- **Mehrere Chat-Fenster / zweiter Kanal** für Squad-Streams.
- **E2E-Smoke-Test** (Playwright + Electron), der App-Start, Laden eines
  VODs und ersten Chat-Render prüft.
