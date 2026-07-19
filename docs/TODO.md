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

**Chat-Badges als Bilder (v1.3.0)**
- Twitch-Global-Katalog (ALLE Sets inkl. Wahl-Badges) + Kanal-Sub/Bits-Badges
  per GQL (`src/badge-sources.js`), Merge/Aufloesung DOM-frei in
  `renderer/lib/badges.js` (unit-getestet). Kuerzel B/M/V/S nur noch als
  Fallback bei Katalog-Ausfall.
- 7TV-Badge pro User (Session-Cache, `user-badges`-IPC; Endpoint v4-GQL
  `userByConnection`, verifiziert 2026-07-03) + BTTV/FFZ-Gesamtlisten.
- Live (IRC `badges=`/`badge-info=`, Tooltip mit Abo-Monaten) UND VOD-Replay
  (`userBadges` mit Versionen).

**VOD-Replay-Fix (v1.3.1)**
- "Chat stuck" in Mega-Chats (z.B. Caedrel): Offset-Paginierung wertete
  Seitengrenzen-Kollisionen (Twitch liefert die Seite, die den Offset
  enthaelt — auch wenn sie ganz dahinter liegt) als stille Luecke und
  uebersprang 30s echte Kommentare. Jetzt: Kollision -> +1s weitertasten,
  nur komplett leere Antwort -> GAP_STEP. Live am Caedrel-VOD verifiziert
  (26s-Loecher weg, groesste Luecke 3s).

**Autoscroll-Fix (v1.3.2)**
- Kleben am unteren Rand haengt an der Nutzer-Absicht (autoScroll), nicht
  mehr an nearBottom() pro Nachricht: nachladende Emote-Bilder verschoben
  das Layout und liessen den Chat dauerhaft stehen. Programmatische Scrolls
  markieren sich selbst und zaehlen im scroll-Handler nicht als Nutzer-Scroll.

**Autoscroll-Nachschlag (v1.3.3)**
- Restfaelle: Chromium-eigene Scroll-Events (Scroll-Anchoring/Clamping bei
  Bild-Nachladen und DOM-Trim) schalteten das Kleben weiter vereinzelt aus.
  Jetzt schalten NUR echte Eingaben aus (Wheel hoch, PageUp/ArrowUp/Home,
  Scrollbar-Drag); Scroll-Events schalten hoechstens wieder ein.

**Komfort & Design (v1.4.0)**
- Chat: Schriftgroessen-Slider (11-22px, chatPrefs.fontSize, em-Skalierung
  fuer Emotes/Badges/Zeitstempel + negative Emote-Margins = ruhige Zeilen).
- Emote-Tooltip (Delegation, ein fixed-Overlay): Vorschau, Name, Quelle
  (Twitch/7TV/BTTV/FFZ aus URL, ChatUi.emoteProvider).
- User-Karte bei Namensklick: Badges, Kopieren, letzte 5 Nachrichten aus
  dem DOM-Puffer (ChatUi.lastMessagesOf). Kopieren-Klick entfaellt direkt.
- Status-Punkt im Footer (ok/err/connecting), Einblende-Animation neuer
  Nachrichten mit Raten-Drossel (ChatUi.createRateMeter, >5/s aus).
- Home: Live-Favoriten als Karten-Grid mit CDN-Thumbnails
  (previews-ttv, 60s-Cache-Buster), LIVE-Puls, Skeleton-Loader, Hover.
- Micro-Animationen (Overlay/Popup/Buttons). Bewusst: App animiert IMMER,
  auch wenn Windows "Animationseffekte" aus hat (prefers-reduced-motion
  wird ignoriert - Nutzer-Entscheidung).
- Randlose Fenster (frame:false): App-Leisten sind Titelleisten mit
  eigenen Buttons (window-control-IPC), Doppelklick maximiert, Snap bleibt.
- Satisfying-Details: Emote-Hover-Zoom, Pop-in fuer Tooltip/User-Karte,
  Bounce fuer Neue-Nachrichten-Button, LIVE-Punkt-Glow, Thumbnail-Gradient,
  weiche Button-Farbwechsel.
- Neue DOM-freie Lib renderer/lib/chat-ui.js (unit-getestet).

**Neon Dual - On Air (v1.5.0)**
- Eigene visuelle Identitaet statt Twitch-Look: fast schwarzer Grund,
  Video-Fenster Cyan, Chat-Fenster Magenta (Glow an Rahmen/Titel/Status),
  Twitch-Lila komplett entfernt. Alle Akzente als CSS-Variablen.
- Fensterfarben im ⚙-Popup einstellbar (zwei Color-Picker + Reset,
  Live-Vorschau in beiden Fenstern; themePrefs in electron-store,
  save/preview-theme-prefs-IPC + theme-changed-Broadcast).
- On-Air-Leiste (2px-Verlauf Video->Chat-Farbe) ueber beiden Fenstern:
  leuchtet + pulsiert nur bei Live-Kanal der spielt (load-mode +
  player-state-Relay; PLAYING sendet jetzt auch 'playing'), sonst gedimmt.
- Monospace-Details (Zeitstempel, msg/min-Anzeige im Chat-Footer, Status).
- Neue DOM-freie Lib renderer/lib/theme.js (normalizeHex, accentVars,
  onAirState; unit-getestet).

**Glass-Transparenz + Nur-Video + Kontrast-Fix (v1.6.0)**
- Deckkraft-Slider fuers Chat-Fenster im ⚙-Popup: Hintergrund 0-100 %
  durchsichtig, Text/Emotes/Glow/On-Air-Leiste bleiben voll. Chat-Fenster mit
  `transparent:true`; Flaechen ueber `--bg/--panel/--hover` als rgba mit einem
  Alpha (`themePrefs.chatAlpha`, Default 100 %, ueber `clampAlpha` gesaeubert).
  (Video-Transparenz bewusst weggelassen - der Player deckt das Fenster eh
  komplett; Video-Fenster bleibt opak.)
- Nur-Video-Modus (⛶ in der Video-Leiste): Leiste/Rahmen/On-Air weg, Player
  fuellt das Fenster, das per `setAspectRatio(16/9)` dauerhaft auf 16:9 rastet
  -> keine schwarzen Balken, auch beim Resize. Kein Tastenkuerzel (stoert beim
  Zocken); schwebender Verlassen-Button (blendet bei Mausruhe aus) +
  Doppelklick aufs Video. Reine Ansicht, nicht persistent.
- Einstellungs-Popup aufgeraeumt: Abschnitte "Chat" und "Fenster" mit
  Ueberschriften/Trennlinie, einheitliche Zeilen, klarer Zuruecksetzen-Button.
- Bug-Fix: Akzent-Buttons ("Laden", "+ Hinzufuegen") waehlen ihren Textton
  per `ThemeLib.accentContrast` (hoeheres WCAG-Kontrastverhaeltnis) + duenner
  neutraler Rand -> auch Schwarz als Akzentfarbe bleibt lesbar.

**Build**
- `npm run pack` erzeugt portable `dist/TwitchDual-win32-x64/TwitchDual.exe`
  (@electron/packager, nutzt lokalen Electron-Cache).

**Twitch-Login + Chatten (v1.8.0)**
- Twitch-Login per Device Code Flow (Public Client, kein Secret); Token verschluesselt via safeStorage, verlaesst nie den Main-Prozess.
- Gefolgte Channels im Home-Overlay (Tab „Gefolgt", live zuerst als Karten).
- Nachrichten senden (authentifizierter IRC-Sende-Socket, Rate-Limit 20/30s, nur im Live-Modus).
- Emote-Picker: Channel-Emotes (7TV/BTTV/FFZ) + eigene Twitch-Sub-Emotes.
- Inline-Emotes im Eingabefeld (contenteditable statt <input>): getippter Emote-Name
  wird bei Leertaste/Senden/Blur zum Bild, beim Senden wieder zu Text serialisiert.
- Tab-Autocomplete mit Vorschlags-Leiste: Teilname + Tab vervollstaendigt/cyclet
  (Shift+Tab rueckwaerts), die Leiste zeigt die Treffer als Bild (aktueller markiert),
  Klick setzt direkt ein.
- Slow-Mode-Countdown: nach dem Senden zaehlt der Raum-Status-Chip runter
  („🐌 noch X s"), Senden-Button bis dahin gesperrt.
- Sende-Fehler sichtbar (NOTICE-Uebersetzung) + Raum-Status-Chip (Slow/Follower/Subs/Emote-only aus ROOMSTATE).
- Home merkt sich den zuletzt aktiven Tab (Gefolgt/Favoriten) beim erneuten Oeffnen.
- Scopes exakt: chat:read chat:edit user:read:follows user:read:emotes.

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
- **Mehrere Chat-Fenster / zweiter Kanal** für Squad-Streams.
- **E2E-Smoke-Test** (Playwright + Electron), der App-Start, Laden eines
  VODs und ersten Chat-Render prüft.
- **Sende-Socket-Token nach Refresh aktualisieren**: AuthManager.getAccess()
  erneuert das Token, aber ChatSender behält das alte; bei Socket-Neuaufbau
  nach >4h schlägt die IRC-Auth still fehl. AuthManager soll ChatSender bei
  Refresh neu einloggen.
