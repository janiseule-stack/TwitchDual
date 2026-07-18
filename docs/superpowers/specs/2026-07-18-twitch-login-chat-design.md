# TwitchDual v1.8.0 — Login + Chatten (+ Gefolgte Channels, Emote-Picker)

Stand: 2026-07-18. Validiertes Design aus Brainstorming-Session.

Gewählter Ansatz: **A — Login + Chatten zuerst, sauber und offiziell.**
Behält die bestehende Glass-/7TV-Chat-Identität und den Player-Embed
vollständig. Kein Konto-Risiko. Channel Points sind **bewusst nicht**
Teil dieses Specs (siehe „Ausdrücklich außerhalb des Scopes").

## Ziel

TwitchDual wird vom anonymen Viewer zum **eingeloggten Viewer**:

- **Login** per Twitch **Device Code Flow** (Code auf `twitch.tv/activate`
  eintippen). Öffentlicher Client, **kein Client-Secret**, Token-Erneuerung
  ohne Secret.
- **Gefolgte Channels** erscheinen im Home-Overlay (Live-Channels zuerst,
  mit Zuschauerzahl/Spiel), Klick lädt den Channel.
- **Chatten senden** aus dem Chat-Fenster (Eingabefeld + Senden, Enter
  sendet), inkl. **Emote-Picker** und **sichtbaren Sende-Fehlern**.
- **Raum-Status-Hinweis** (Slow-Mode / Nur-Follower / Nur-Subs).

Der Lese-Pfad des Chats (anonyme IRC-Verbindung im Renderer, 7TV/BTTV/FFZ-
Rendering, Badges, VOD-Replay) bleibt **unverändert**. Der Player-Embed und
die Adblock-Injektion bleiben **unverändert**.

## Voraussetzung (einmalig, durch Janis)

Eine Twitch-Application registrieren auf `dev.twitch.tv/console/apps`:

- **Client-Typ: Public** (Pflicht — nur so ist Refresh ohne Secret möglich).
- **OAuth Redirect URL**: `http://localhost` (von der Konsole verlangt,
  wird beim Device Flow nicht benutzt).
- Ergebnis: eine **Client-ID** (nicht geheim). Sie wird als Konstante in
  `src/twitch-auth.js` eingetragen (bzw. via Build-Konstante gepflegt).

Scopes, die die App anfordert:
`chat:read chat:edit user:read:follows user:read:emotes`

## Architektur-Überblick

```
Renderer (Video/Home)          Main-Prozess                 Twitch
  Home-Overlay                   src/twitch-auth.js
   ├─ "Login" ───auth-start────▶  Device Flow ─────────────▶ id.twitch.tv
   │                              (Poll bis autorisiert)
   │◀── auth-changed (Event) ──   safeStorage (Token)
   └─ "Gefolgt"-Liste ──get-followed──▶ Helix /channels/followed
                                                             api.twitch.tv

Renderer (Chat)                  Main-Prozess                 Twitch
   Eingabefeld ──chat-send────▶  Auth-IRC-Socket ──PRIVMSG─▶ irc-ws.chat
   NOTICE/ROOMSTATE ◀─chat-notice/room─ (aus Auth-Socket)
   Emote-Picker ──get-user-emotes──▶ Helix /chat/emotes/user
   Lese-Pfad (unverändert): anonymer IRC-WS direkt im Renderer
```

**Grundregel Sicherheit:** Der Access-Token verlässt **nie** den
Main-Prozess. Der Renderer bekommt nur Status (`loggedIn`, `login`,
`displayName`) und Ergebnisse. Senden läuft über IPC, nicht über einen
Token im Renderer.

## Paket 1: Auth-Modul `src/twitch-auth.js` (Main)

Eigenständig testbar; Netz über injizierbares `fetch` (Default global).

Funktionen:

- `startDeviceAuth()` → `POST https://id.twitch.tv/oauth2/device`
  (`client_id`, `scopes`) → `{ user_code, verification_uri, device_code,
  interval, expires_in }`.
- `pollToken(device_code, interval)` → wiederholtes
  `POST https://id.twitch.tv/oauth2/token`
  (`grant_type=urn:ietf:params:oauth:grant-type:device_code`, `client_id`,
  `device_code`). Behandelt Antworten:
  - `authorization_pending` → weiter pollen im `interval`.
  - `slow_down` → `interval` erhöhen.
  - `expired_token` / `access_denied` → Abbruch mit klarer Fehlermeldung.
  - Erfolg → `{ access_token, refresh_token, expires_in, scope }`.
- `refresh(refresh_token)` → `POST /oauth2/token`
  (`grant_type=refresh_token`, `client_id`, `refresh_token`). **Ohne
  Secret** (Public Client). Refresh-Token ist Einmal-Nutzung → neuen
  Refresh-Token sofort persistieren.
- `validate(access_token)` → `GET https://id.twitch.tv/oauth2/validate`
  (Header `Authorization: OAuth <token>`) → `{ login, user_id, expires_in,
  scopes }`. Beim Start zur Gültigkeitsprüfung.

Token-Lebenszyklus:

- **Speicherung:** Token-Bündel (`access`, `refresh`, `user_id`, `login`,
  `expires_at`) als JSON, verschlüsselt mit **Electron `safeStorage`**
  (`encryptString`), abgelegt in `userData/twitch-auth.enc`. Ist
  `safeStorage.isEncryptionAvailable()` false → Feature meldet „Login auf
  diesem System nicht verfügbar" statt Klartext zu schreiben.
- **Auto-Refresh:** Vor Ablauf (oder bei `401` von Helix) einmal `refresh`.
  Scheitert der Refresh (30 Tage Inaktivität → Refresh-Token tot) →
  Token löschen, `auth-changed { loggedIn: false, reason: 'expired' }`,
  Nutzer wird zum Neu-Aktivieren aufgefordert.

## Paket 2: Helix-Hilfen (Main)

Kleine Helper (in `twitch-auth.js` oder `src/twitch-api.js`), alle mit
`Client-Id`-Header + `Authorization: Bearer <token>`:

- `getFollowedChannels(userId)` → `GET /helix/channels/followed`
  (paginiert, `first=100`, alle Seiten) → `[{ login, displayName, id }]`.
- `getUserEmotes(userId)` → `GET /helix/chat/emotes/user` → Emote-Codes +
  Bild-URLs (Template) für den Picker. Paginiert.

Live-Status/Spiel für die Gefolgt-Liste kommt aus dem **vorhandenen**
`src/twitch-browse.js` (`getLiveStatus`) — keine Doppel-Implementierung.

## Paket 3: Auth-IRC-Sende-Socket (Main)

Neuer Modul-Teil (z. B. `src/chat-send.js`), Node-`WebSocket` zu
`wss://irc-ws.chat.twitch.tv:443`:

- Verbindet mit `PASS oauth:<access_token>` / `NICK <login>`, fordert
  Capabilities `twitch.tv/commands twitch.tv/tags` an.
- `JOIN #<channel>` beim aktuell geladenen Channel; folgt dem `load`-
  Broadcast (Main kennt den Channel bereits). Nur im **Live-Modus** aktiv;
  im VOD-Modus getrennt (kein Live-Chat).
- `sendMessage(channel, text)` → `PRIVMSG #channel :text`.
- **Rate-Limit-Guard:** Client-seitig max. 20 Nachrichten / 30 s
  (gleitendes Fenster); Überschuss wird abgelehnt mit klarer Rückmeldung,
  bevor Twitch trennt.
- **NOTICE-Auswertung:** eingehende `NOTICE` mit `msg-id`
  (`msg_ratelimit`, `msg_banned`, `msg_timedout`, `msg_followersonly`,
  `msg_subsonly`, `msg_slowmode`, `msg_duplicate`, `msg_channel_suspended`
  …) → in verständlichen deutschen Text übersetzt → `chat-notice`-Event an
  das Chat-Fenster.
- **ROOMSTATE-Auswertung:** `followers-only`, `subs-only`, `slow`,
  `emote-only` → `chat-room`-Event ans Chat-Fenster (für den Hinweis).

Deine gesendete Nachricht erscheint **automatisch** über den bestehenden
anonymen Lese-Socket im Renderer (der empfängt alle Kanal-`PRIVMSG` inkl.
deiner) — kein optimistisches Doppel-Rendering nötig.

## Paket 4: IPC-Vertrag (main.js ⇄ preload.js)

Neue Kanäle (preload whitelisted sie wie die bestehenden):

- `auth-start` (invoke) → startet Device Flow, liefert
  `{ user_code, verification_uri }` sofort; Main pollt im Hintergrund.
- `auth-status` (invoke) → `{ loggedIn, login, displayName }`.
- `auth-logout` (invoke) → Token löschen, Socket trennen, `auth-changed`.
- `auth-changed` (Event → beide Fenster) → Status-Broadcast.
- `get-followed` (invoke) → `{ ok, channels }` (mit Live-Status, live-first
  sortiert).
- `get-user-emotes` (invoke) → `{ ok, emotes }` für den Picker.
- `chat-send` (invoke, `{ channel, text }`) → `{ ok }` oder
  `{ ok:false, error }` (z. B. Rate-Limit lokal).
- `chat-notice` (Event → Chat) → `{ text, kind }`.
- `chat-room` (Event → Chat) → `{ followersOnly, subsOnly, slowSeconds,
  emoteOnly }`.

## Paket 5: UI — Home-Overlay (Video-Fenster)

- **Login-Zeile** im Einstellungsbereich: Button „Mit Twitch anmelden".
  Klick → kleines Panel zeigt **`user_code`** groß + Buttons
  „Code kopieren" und „`twitch.tv/activate` öffnen" (externer Browser via
  `shell.openExternal`) + Spinner „Warte auf Bestätigung…". Nach Erfolg:
  „Angemeldet als <name>" + „Abmelden".
- **Sektion „Gefolgt"** (nur eingeloggt): nutzt die vorhandene Live-Karten-
  Anzeige; **Live-Channels zuerst** (mit Zuschauerzahl/Spiel), darunter
  offline. Klick lädt den Channel (`submit-load`-Pfad). Aktualisierung beim
  Öffnen des Overlays + manueller Refresh-Button.

## Paket 6: UI — Chat-Fenster

- **Kopf:** eingeloggter Name (oder „Nicht angemeldet").
- **Fuß (neu):** Eingabefeld + Senden-Button (Enter sendet), Emote-Picker-
  Button daneben.
  - **Ausgeloggt:** Feld deaktiviert, Hinweis „Zum Chatten anmelden"
    (Link/Hinweis Richtung Home-Overlay).
  - **VOD-Modus:** Feld deaktiviert, „Chatten nur im Live-Modus".
- **Emote-Picker-Panel:** Tabs/Abschnitte —
  1. Channel-Emotes (7TV/BTTV/FFZ + global) aus der **bereits geladenen**
     `emotes`-Payload;
  2. Deine Twitch-(Sub-)Emotes aus `get-user-emotes`.
  Klick fügt den **Text-Code** an der Cursorposition ins Feld ein. Gesendet
  wird ausschließlich der Code (z. B. `Kappa`, `catJAM`); das Rendering als
  Bild macht der Lese-Pfad bzw. Twitch.
- **Sende-Fehler:** `chat-notice` erscheint als kurze, verständliche
  Meldung direkt über dem Eingabefeld (auto-ausblenden).
- **Raum-Status:** kleiner Indikator aus `chat-room`
  („🐌 Slow 30 s" / „Nur Follower" / „Nur Subs" / „Nur Emotes").

## Fehlerbehandlung (durchgängig)

- Netzfehler beim Device Flow / Helix → nutzerlesbare Meldung, kein Crash.
- `safeStorage` nicht verfügbar → Feature deaktiviert mit Hinweis, restliche
  App unberührt.
- Token abgelaufen/ungültig → automatischer Refresh, sonst sanftes Ausloggen
  mit Re-Aktivierungs-Hinweis.
- Senden ohne Login / im VOD → gar nicht erst möglich (Feld deaktiviert),
  zusätzlich Guard im Main.
- Preload bleibt **sandboxed** (kein `fs`): alle Datei-/Netzzugriffe im Main,
  Renderer nur über die IPC-Whitelist.

## Tests (bestehende `node --test`-Konvention, netz-/datenstand-unabhängig)

- **Auth-Modul:** gemocktes `fetch` für Device-Start, Poll-Zustände
  (`authorization_pending`, `slow_down`, `expired_token`, Erfolg), Refresh
  (inkl. Rotation des Refresh-Tokens), `validate`-Parsing.
- **Sende-Pfad:** `PRIVMSG`-Formatierung, Rate-Limit-Guard (20/30 s),
  `NOTICE`-`msg-id`→Text-Mapping, `ROOMSTATE`-Parsing.
- **Helix-Helfer:** Paginierungs-Zusammenführung (mehrere Seiten), live-first
  Sortierung der Gefolgt-Liste.
- Keine echten Twitch-Aufrufe in Tests; bestehende Suite bleibt grün.

## Version & Release

- Bump auf **v1.8.0** (`package.json`).
- `docs/TODO.md` pflegen (Feature notieren, Changelog-Zeile).
- Release über den bestehenden `electron-builder`-Flow (GitHub Releases,
  Auto-Update greift bei Nutzern).

## Ausdrücklich außerhalb des Scopes (YAGNI)

- **Channel Points** (passiv oder Claim) — eigener späterer Schritt mit
  vorgeschaltetem Machbarkeits-Spike; mit dem Player-Embed nicht sauber
  „wie die Website" lösbar.
- Reply-Threads, @-Namen-/Emote-Autocomplete (Tab), `/`-Befehle (außer
  `/me`, das als normales `PRIVMSG` ohnehin durchläuft), Whispers,
  Mod-Aktionen (Ban/Timeout/Delete), mehrere Konten gleichzeitig,
  Web-Login-Fenster (Implicit/Auth-Code) — Device Flow ist der gewählte Weg.
