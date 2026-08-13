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

## GPU-Diagnose (v1.8.5)

- `main.js` protokolliert beim Start `gpu-status` mit
  `app.getGPUFeatureStatus()`. Das Feld `video_decode` zeigt, ob die GPU den
  Twitch-Stream dekodiert.
- **Messfalle, unbedingt beachten:** `getGPUFeatureStatus()` meldet direkt in
  `app.whenReady()` durchgehend `disabled_software`, auch wenn die
  Beschleunigung voll laeuft. Erst nach `await app.getGPUInfo('complete')`
  stimmen die Werte. Mit nacktem Electron ohne Flags nachgewiesen:
  frueh `video_decode=disabled_software`, spaet `video_decode=enabled`.
- **Ergebnis der Messung:** Die GPU dekodiert bereits. Ein Versuch mit fuenf
  Chromium-Switches (`ignore-gpu-blocklist`, `enable-gpu-rasterization`,
  `enable-zero-copy`, `enable-hardware-overlays`,
  `disable-gpu-driver-bug-workarounds`) brachte messbar nichts und wurde
  wieder entfernt — die letzten beiden gefaehrden den transparenten Chat fuer
  Nullgewinn. Entwurf und Plan liegen unter `docs/superpowers/`, falls das
  jemand erneut versuchen will.
- Last mit aktiver Beschleunigung: ~1,18 Kerne = 9,8 % Gesamt-CPU
  bei 12 logischen Kernen. Normalpreis, kein Defekt.

## Ton weg nach Werbung (v1.8.6)

- **Symptom:** Nach einem Werbeblock kam kein Ton mehr, obwohl die Oberflaeche
  Ton anzeigte. Am Regler ziehen half sofort — bis zum naechsten Mal.
- **Ursache (belegt per Diagnose-Log, 2026-08-09 17:31):** vaft macht nach der
  Werbung einen Hard-Reload und ersetzt dabei das `<video>`-Element. Fuer
  `muted` raeumt es gruendlich auf (Listener auf canplay/playing/loadeddata,
  4000-ms-Timeout, 5500-ms-Backstop). Fuer `volume` schreibt es nur den
  localStorage-Wert zurueck und hofft, dass Twitchs Player ihn liest — ein
  Rennen. Verliert es das Rennen, bleibt das neue Element auf `volume=0`:

      17:31:16.013  muted:true   volume:0    <- vaft stummt bewusst
      17:31:16.328  muted:false  volume:0    <- Mute weg, Lautstaerke bleibt 0
      18:24:10.627  muted:false  volume:0    <- 53 Minuten spaeter unveraendert

  Das Rennen ist unzuverlaessig, nicht immer verloren: 54 Minuten spaeter war
  derselbe Reload nach 279 ms wieder korrekt bei 0.11. Daher trat der Fehler
  nur manchmal auf.
- **Warum es niemand bemerkte:** Die Embed-API meldet weiter den alten Wert,
  weil nur das Element auf 0 steht. `video.js` prueft ueber `player.getVolume()`
  und sieht die Abweichung deshalb prinzipiell nicht — und der `PLAYING`-Handler
  setzt die Lautstaerke nur bei `volumeReady === false`, also nie nach dem Start.
- **Fix:** `renderer/lib/volume-guard.js` — DOM-freier Waechter (UMD, testbar),
  per `main.js` an den Preload geliefert und VOR vaft ins iframe injiziert.
  Er beobachtet das echte `<video>`-Element alle 300 ms und stellt die zuletzt
  gueltige Lautstaerke wieder her.
- **Erkennungsregel:** nur `muted === false && volume === 0`. Ueber die
  Twitch-Oberflaeche ist das nicht erreichbar — wer den Regler auf 0 zieht,
  bekommt zusaetzlich `muted=true`. Unmuted-auf-Null ist damit immer der kaputte
  Zustand, nie eine Nutzerabsicht. Ein Nutzer-Mute bleibt unangetastet.
- **Gegen Fehlalarm:** Beim gesunden Reload tritt `volume=0` ebenfalls kurz auf
  (im Log 279 ms). Erst wenn der Zustand 1500 ms ueberdauert, wird eingegriffen.
- **Nachweis:** 10 Unit-Tests (`test/volume-guard.test.js`, Zeitstempel aus dem
  echten Vorfall) plus Ende-zu-Ende-Beleg in der laufenden App — kuenstlich
  erzeugter Fehlzustand wurde nach 1,59 s repariert, Element danach stabil.

## Kanalpunkte mit Web-Login (v1.9.0)

- **Warum ein zweiter Login:** Der Device-Flow-Token (v1.8.0) darf keine
  Kanalpunkte lesen — dieselbe Anfrage liefert damit HTTP 401, mit einem
  Web-Cookie-Token HTTP 200 samt `balance`. Gegenprobe ohne
  `Authorization`-Header: `communityPoints: null`. Es haengt eindeutig am
  Token-Typ, nicht an der API. Der frueher notierte Schluss „Kanalpunkte nicht
  machbar" (2026-07-19) war damit falsch.
- **Zwei Token nebeneinander, klar getrennt:** Device-Flow bleibt fuer Chat und
  Gefolgt-Liste zustaendig, der Web-Token nur fuer Punkte. Ein Vollersatz geht
  nicht: die Gefolgt-Liste ist fuer den Web-Token gesperrt (GQL „service error",
  Helix „Client ID and OAuth token do not match").
- **Rohe GraphQL-Queries statt Persisted-Hashes.** Twitch akzeptiert sie; der
  kursierende Hash `9988086b…` ist tot (`PersistedQueryNotFound`). Uebliche
  Auto-Claim-Tools schleppen solche Hashes mit und brechen bei jedem
  Twitch-Deploy — davon ist die App unabhaengig. `community` ist dabei nur ein
  Alias fuer `user(login:)`, ein Wurzelfeld `community` gibt es nicht.
- **Kisten-Claim braucht `Client-Integrity`-Kopfzeilen** aus einer echten
  Seitensitzung (selbst anfordern reicht nicht, mitlesen von `twitch.tv/directory`
  genuegt). `redeem` verlangt zusaetzlich `cost`/`title`/`prompt`/`transactionID` —
  eine blosse Belohnungs-ID wird abgewiesen.
- **`prompt` ist beim Einloesen Pflicht (live belegt 2026-08-12).** Twitch
  vergleicht die sichtbaren Eigenschaften der Belohnung mit denen auf dem
  Server, damit niemand eine veraltete Fassung einloest. Fehlt der `prompt`,
  antwortet die Mutation `PROPERTIES_MISMATCH`. Gleiche Belohnung, einziger
  Unterschied: `ohne prompt -> ok:false PROPERTIES_MISMATCH`,
  `mit prompt -> ok:true`. `null` muss dabei als `''` gehen.
- **Feld `defaultCost` gibt es auf `CommunityPointsCustomReward` nicht** — eine
  Abfrage, die es anfordert, wird komplett abgewiesen („Cannot query field").
- **Einloesungen erscheinen NICHT im Chat.** Twitch verteilt sie ueber PubSub
  (`community-points-channel-v1`), nicht ueber IRC; TwitchDuals Chat haengt am
  IRC. Nur Belohnungen mit `isUserInputRequired: true` kommen als normale
  Nachricht mit `custom-reward-id`-Tag durch. Beleg der Einloesung sind also
  die „✓ eingeloest"-Meldung im Panel und der fallende Punktestand.
- **Token verlaesst nie den Main-Prozess** (safeStorage-verschluesselt); ueber
  IPC gehen nur abgeleitete Werte: Bilanz, Belohnungsliste, Fehlertext.
- **Takt:** alle 15 s, nur bei Live-Kanal + spielendem Player + Token. Fehler
  fahren den Abstand hoch (max. 5 min), ein Kanal ohne Punkte wird gesperrt
  statt endlos angefragt, dieselbe Kiste hoechstens dreimal versucht.
- **Stolperstein (v1.9.0 gefixt):** `punkteHomeOffen` wurde nur vom
  `home-close`-Signal zurueckgesetzt, das aber ausschliesslich
  `closeHomeResume()` schickt. Der Normalweg — aus dem Home-Overlay heraus einen
  Kanal starten — laeuft ueber `closeHome()` und blendet nur aus. Der Takt
  schlief dadurch bis zum Programmende. Jetzt setzt ein erfolgreicher
  Ladevorgang in `submit-load` das Flag selbst zurueck: das ist der Beleg fuers
  geschlossene Overlay, unabhaengig vom Renderer-Pfad.
- **Bekannt und bewusst so:** Der Anmelde-Chip ist nur sichtbar, solange kein
  Kanal laeuft — beim Kanalwechsel leert `main.js` den Chip absichtlich
  (`balance: null`), damit nicht 15 s lang der Stand des vorigen Kanals
  stehenbleibt. Nach dem Anmelden steht dort ohnehin der Punktestand.

## Ereignis-Strom (Spike 2026-08-12)

**Ergebnis in einem Satz:** Der Weg funktioniert. Mit dem Web-Token kann die
App denselben Ereignis-Strom abonnieren wie die Twitch-Webseite und empfaengt
darueber fremde Kanalpunkt-Einloesungen.

- **Adresse:** `wss://hermes.twitch.tv/v1?clientId=kimne78kx3ncx6brgo4mv6wki5h1ko`.
  `pubsub-edge.twitch.tv` ist tot — die Seite spricht heute mit „Hermes". Wer
  das alte PubSub-Protokoll nachbaut, laeuft ins Leere. Daneben oeffnet die
  Seite nur noch `wss://irc-ws.chat.twitch.tv/` (der Chat, kennen wir bereits).
- **Ablauf:**
  1. Verbinden. Der Server schickt sofort
     `{"welcome":{"keepaliveSec":15,"recoveryUrl":"wss://hermes.twitch.tv/a/v1?…"}}`.
     Dieser Rahmen traegt kein `type`-Feld — Erkennung am Feld `welcome`.
  2. **Einmal** anmelden, fuer die ganze Verbindung:
     `{"id":"<nonce>","type":"authenticate","authenticate":{"token":"<Web-Token>"},"timestamp":"<ISO>"}`
     → `{"authenticateResponse":{"result":"ok"},"parentId":"<nonce>",…}`.
     Das Token gehoert **nicht** in die einzelnen Abo-Rahmen (anders als im
     alten PubSub).
  3. Je Thema ein Abo:
     `{"type":"subscribe","id":"<umschlag>","subscribe":{"id":"<abo>","type":"pubsub","pubsub":{"topic":"<thema>"}},"timestamp":"<ISO>"}`
     → `{"subscribeResponse":{"subscription":{"id":"<abo>"},"result":"ok"},"parentId":"<umschlag>",…}`.
     Die Zuordnung Antwort→Thema laeuft ueber `parentId` bzw. `subscription.id`.
  4. Am Leben halten muss man nichts: der Server schickt von sich aus alle
     ~10 s `{"type":"keepalive"}`. Ein eigener PING-Takt ist ueberfluessig.
     Fuer Abrisse liefert `welcome` eine `recoveryUrl` mit.
- **Themen — alle drei angenommen** (Namen wie im alten PubSub, nur im
  Hermes-Umschlag). Keine Integrity-Sperre: das blanke Web-Token genuegt,
  anders als beim Kisten-Claim.
  - `community-points-user-v1.<user_id>` — Antwort ok, Nutzlast gemessen.
  - `community-points-channel-v1.<channel_id>` — Antwort ok, Nutzlast gemessen.
  - `pinned-chat-updates-v1.<channel_id>` — Antwort ok, **Nutzlast nicht
    gemessen** (in der Messzeit hat niemand etwas angepinnt).
- **Ereignisse — Umschlag:**
  ```json
  {"notification":{"subscription":{"id":"<abo>"},"type":"pubsub","pubsub":"<JSON als STRING>"},
   "id":"…","type":"notification","timestamp":"<ISO>"}
  ```
  `notification.pubsub` ist ein String mit verschachteltem JSON — es muss
  zweimal geparst werden. Wer das uebersieht, bekommt nur Zeichensalat.
  Gemessene Nutzlast-Typen:
  - `reward-redeemed` — kommt auf dem **Kanal**- und dem **Nutzer**-Thema.
    Enthaelt alles, was eine Chat-Zeile braucht: `data.redemption.user.display_name`
    und `data.redemption.reward.title` (dazu `cost`, `channel_id`,
    `redeemed_at`, `reward.prompt`). Das ist die Grundlage fuer „X hat Y
    eingeloest" — auch fuer fremde Zuschauer.
  - `points-spent` — `data.balance.balance` liefert den neuen Punktestand
    sofort. Damit ist der 15-Sekunden-Takt (siehe v1.9.0 oben) abloesbar.
  - `channel-last-viewed-content-updated`, `global-last-viewed-content-updated`
    — fuer uns uninteressant (merkt sich, welche Belohnungen der Nutzer
    schon gesehen hat).
- **Beweisfuehrung:** nicht abgewartet, sondern erzwungen: eine eigene
  Einloesung im 🎁-Panel tauchte 0,1 Sekunden spaeter als `reward-redeemed`
  auf dem Kanal-Thema auf, waehrend im Chat weiterhin nichts stand. Eine
  Handlung, zwei Protokollzeilen, eindeutig.
- **Wichtig fuer den Betrieb:** `WebSocket` gibt es im Electron-33-Hauptprozess
  (Node 20.18) **nicht**. Fuer den Spike genuegte
  `NODE_OPTIONS=--experimental-websocket`; fuer einen echten Ausbau ist das
  keine tragfaehige Loesung (die Umgebungsvariable ist beim gepackten Start
  nicht gesetzt). Ein Ausbau braucht also entweder das Paket `ws` oder einen
  anderen Weg — **offener Punkt**.
- **Offene Fragen fuer den Ausbau:**
  - Nutzlast von `pinned-chat-updates-v1` ist ungemessen.
  - Was bei Kanalwechsel passiert (abbestellen? neu abonnieren?) ist
    ungemessen — der Umschlag legt nahe, dass `subscription.id` dafuer
    gedacht ist.
  - Wie sich die Verbindung bei einem Abriss verhaelt und ob die
    `recoveryUrl` wirklich noetig ist, ist ungemessen.
  - Wie lange das Web-Token traegt und was bei Ablauf passiert, ist
    ungemessen.
- Spike-Code (`src/spike-pubsub-*.js`, `main.js`-Verdrahtung hinter
  `TWITCHDUAL_PUBSUB_SPIKE=1`) wieder entfernt, dieser Abschnitt ist der
  einzige verbleibende Niederschlag (Branch `spike/pubsub`).

## Punkte-Anzeige: Symbol und Zugewinn (v1.10.0)

- **Warum:** v1.9.0 zeigte `🪙 12.350` und aenderte sich stumm. Man sah nie,
  *dass* gerade Punkte dazukamen oder dass die Kiste geklappt hat.
- **Mitbehobener Fehler:** `punkteTick` holte den Stand mit `context()` *vor*
  dem Claim und sendete nach dem Einloesen genau diese alte Zahl weiter — der
  Chip hinkte bis zu 15 s hinterher. Die Claim-Mutation fragt `currentPoints`
  laengst ab, `claim()` warf den Wert nur weg. Aus der Differenz beider Staende
  kommt jetzt der exakte Kistenbetrag, und der Stand stimmt nebenbei sofort.
- **Symbol in drei Ebenen**, weil die oberste oft fehlt: Twitch gibt Name und
  Icon der Kanalpunkte unauthentifiziert heraus, aber laengst nicht jeder Kanal
  setzt sie (am 2026-08-12 geprueft: Papaplatte und Trymacs liefern beides,
  shroud, xQc und Knossi fuer beide Felder `null`). Ebene 1 kanaleigenes Icon,
  Ebene 2 ein 7TV-Emote passend zur Akzentfarbe, Ebene 3 ein Inline-SVG in
  `var(--accent)`. **Ebene 3 ist bewusst kein Netzbild** — eine Rueckfallebene
  von einem fremden CDN kann genau den Fehler haben, den sie abfangen soll.
  Name und Bild koennen einzeln fehlen; der Tooltip faellt getrennt auf
  „Kanalpunkte" zurueck.
- **Emote-Wahl** (`renderer/lib/points-icon.js`, DOM-frei): Farbton der
  Akzentfarbe, Kandidaten im 60°-Umkreis, sonst die drei naechstliegenden —
  damit fehlt nie ein Symbol, egal welche Farbe der Farbwaehler liefert.
  Ausgewaehlt wird ueber einen Hash des Kanalnamens: anderer Kanal, anderes
  Emote — derselbe Kanal aber **immer dasselbe**, sonst flackert es im
  15-s-Takt.
- **Die Emote-Liste ist handverlesen und darf wachsen.** Von 17 gesichteten
  7TV-Kandidaten waren 5 brauchbar: der Katalog ist ueberwiegend Foto-Material,
  das bei 18 px zu Matsch wird, und **der Name sagt nichts ueber das Bild**
  (`gem` ist das Foto eines Mannes, `crystallis` ein Gesicht). Neue Kandidaten
  also erst in Originalgroesse ansehen. `EMOTES` ist reine Daten — Zuwachs
  aendert weder Code noch Tests. Offen: Gruen und echtes Cyan fehlen, dort
  greift die Ausweichregel und es bleibt praktisch bei `Diamond`. Die Farbtoene
  sind geschaetzt, nicht per Pixelanalyse gemessen.
- **Symbolhoehe 14 px → 18 px:** bei 14 px ist von einem 7TV-Emote nichts mehr
  zu erkennen (an echten Bildern geprueft).
- **Zugewinn-Anzeige:** Kiste und passiver Tropfen sind unterschiedlich laut
  (`+50` in Akzentfarbe/fett/1,6 s gegen `+10` gedaempft/1,1 s), der
  peepoMoney-Knopf wackelt entsprechend kraeftig oder leicht. Fallen beide im
  selben Takt an, laufen sie 450 ms versetzt.
- **`#points-gain` ist Geschwister des Chips, nicht sein Kind**, und liegt
  absolut daneben (`left: 100%`) — sonst schoebe die auftauchende Zahl den
  Footer auseinander. Aus demselben Grund hat der Chip jetzt eine feste
  Struktur mit eigenem `#points-value`: das alte
  `$pointsChip.textContent = …` haette Icon und Zugewinn bei jedem Takt
  herausgerissen.
- **Basislinie beim Kanalwechsel vergessen** (`standVergessen()`): ohne das
  knallt beim Wechsel ein `+12.350` auf den Schirm. Der erste Stand eines
  Kanals setzt nur die Basislinie und loest nie eine Animation aus; ein
  sinkender Stand (Einloesung) ebenfalls nicht.
- **Kein Hermes-Abo dafuer.** Der Spike liegt ungenutzt herum, aber der
  bestehende 15-s-Takt liefert die Zahl bereits — eine zweite Datenquelle fuer
  denselben Wert waere reine Doppelung.
- **Animationen ohne `prefers-reduced-motion`-Zweig**, wie im Rest des
  Projekts: auf Janis' Windows sind Animationseffekte systemweit aus, ein
  solcher Zweig wuerde sie dauerhaft stumm schalten.
- **Screenshot-Falle:** `tools/ui-shots.js` blockt alle http(s)-Requests. Im
  Screenshot erscheint deshalb nie ein Kanal-Icon und nie ein 7TV-Emote — nur
  Alt-Text. `npm run shots` deckt hier ausschliesslich das Layout ab, die
  Bildpfade muessen am laufenden Programm geprueft werden.
- Entwurf und Plan: `docs/superpowers/{specs,plans}/2026-08-12-punkte-anzeige-politur*`.

## Diagnose-Schalter (v1.11.0)

Ein Schalter im ⚙-Popup des Chat-Fensters schreibt ein Protokoll nach
`%APPDATA%\twitchdual\diagnose.log`. Standard ist **aus**, und aus heisst:
nichts auf der Platte.

- **Ringpuffer:** Die letzten 10000 Ereignisse liegen immer im Speicher (~1,5 MB),
  unabhaengig vom Schalter. Einschalten schreibt sie als **Vorgeschichte** in
  einem einzigen Schreibvorgang in die Datei. Das ist der ganze Punkt: ein
  Schalter, den man erst nach dem Symptom umlegt, haette bei keinem der letzten
  drei Fehler geholfen.
- **Bereiche:** `punkte`, `video`, `chat`, `app`. Einzelne Chat-Nachrichten
  werden bewusst NICHT protokolliert.
- **Schwaerzung:** `src/diag-redact.js`, geprueft gegen echt geformte Rahmen
  (`test/diag-redact.test.js`) — Web-Cookie `auth-token`, GQL-`OAuth`,
  Hermes-`"token"`, IRC-`PASS oauth:` (klein), `Client-Integrity`,
  Cookie-Kopfzeilen, plus struktureller 30-Zeichen-Auffang. Die Gegenprobe
  haelt fest, dass Fliesstext, Kanal-Logins, 7TV-ULIDs und VOD-IDs unberuehrt
  bleiben.
- **Groessengrenze:** ueber 10 MB wird nach `diagnose.1.log` umgelegt. Hoechstens
  zwei Dateien, hoechstens ~20 MB; einzelne Zeilen sind zusaetzlich auf 4000
  Zeichen gekappt und gegen eingebettete Zeilenumbrueche abgesichert, da
  `bereich`/`ereignis` letztlich aus dem Twitch-Player-iframe stammen.
- **`updater.log` bleibt daneben bestehen**: Updater-Ereignisse gehen weiter
  IMMER in eine Datei, auch bei ausgeschaltetem Schalter. Sie sind selten,
  kosten nichts und haben schon zweimal eine Fehlersuche getragen.
- **Zwei Befunde aus dem ersten Beweislauf behoben:** `video:player-zustand`
  meldete jeden Wechsel doppelt, weil `Twitch.Player.PLAYING` und
  `Twitch.Player.PLAY` beide auf denselben Zustand abbilden und praktisch
  gleichzeitig feuern — `renderer/video/video.js` meldet Zustandswechsel jetzt
  nur noch beim tatsaechlichen Wechsel. `punkte:takt-aus {"grund":"Abstand"}`
  lief 14 von 15 Takten mit (~720 Zeilen/Stunde) und verkuerzte die
  Vorgeschichte im Ringpuffer auf ~14h — der Abstand-Fall wird jetzt gar nicht
  mehr gemeldet, ohne die Flanke fuer echte Ruhegruende anzutasten.
- **Erster Beweislauf (13.08.2026):** Der Schalter hat auf Anhieb die Frage
  beantwortet, ob die Kanalpunkte live funktionieren — mit einem unerwarteten
  Ergebnis. Rund 20 Minuten durchgehende Wiedergabe brachten **null**
  Zuwachs, `claimID` war in 45 Abfragen durchgehend `null` (es fiel also nie
  eine Kiste), bei null Fehlern. Die Gegenprobe im Browser mit demselben
  Konto, demselben Kanal und in derselben Minute brachte +10 Punkte — die App
  sah den Sprung `22600 → 22610` binnen 15 Sekunden. Daraus folgt: der
  Lesepfad ist exakt, aber **im eingebetteten Player (`Twitch.Player` auf
  `player.twitch.tv`) werden keine Kanalpunkte verdient**. Das ist kein Fehler
  in `src/twitch-points.js` und dort auch nicht behebbar; Punkte haengen an
  einer Zuschauer-Sitzung auf `twitch.tv` selbst.
- Entwurf und Plan: `docs/superpowers/{specs,plans}/2026-08-13-diagnose-schalter*`.

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
