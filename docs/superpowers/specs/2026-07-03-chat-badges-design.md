# Design: Echte Badge-Bilder im Chat (v1.3.0)

Stand: 2026-07-03 · Status: vom Nutzer abgenommen

## Ziel

Die selbstgemachten B/M/V/S-Farbchips (`KNOWN_BADGES` in `renderer/chat/chat.js`)
werden durch echte Badge-Bilder ersetzt — vollständig:

1. **Twitch-Global-Katalog**: ALLE Badge-Sets (inkl. Wahl-Badges wie Turbo,
   Prime, Sub-Gifter, OG, Spiele-/Event-Badges). Keine hartkodierte Auswahl.
2. **Kanal-Badges**: Sub-Monatsstufen und Bits-Badges des Kanals;
   überschreiben beim Merge den globalen Katalog.
3. **Third-Party-Badges pro User**: 7TV (per-User-Lookup mit Cache),
   BTTV und FFZ (je eine gecachte Gesamtliste pro Load).
4. **Beide Modi**: Live-Chat (IRC-Tags `badges=` / `badge-info=`) und
   VOD-Replay (GQL `message.userBadges`).

## Entschiedene Design-Fragen

- **Fallback**: Katalog geladen, Set-ID unbekannt → Badge still weglassen.
  Katalog komplett fehlgeschlagen → alte B/M/V/S-Kürzelchips für die vier
  bekannten Typen. Nichts crasht je wegen Badges.
- **7TV**: Per-User-Lookup über die Twitch-User-ID (IRC-Tag `user-id`,
  VOD `commenter.id`), Ergebnis pro Session im Main-Prozess gecacht
  (negative Treffer inklusive). Badge erscheint ab der Nachricht, bei der
  der Lookup fertig ist; alte DOM-Knoten werden nicht nachgerüstet.
- **BTTV/FFZ**: mitnehmen — je ein GET pro Load
  (api.betterttv.net `cached/badges/twitch`, api.frankerfacez.com
  `v1/badges/ids`) → Map `login → [badge]`.
- **Architektur**: Ansatz A — Kataloge im Main-Prozess laden (Muster der
  7TV-Emotes), Badge-Map im `load`-Payload broadcasten. Renderer bleibt dumm.

## Komponenten

### 1. Datenquellen (`src/twitch-api.js`, Main-Prozess)

Beim `submit-load` parallel zu den Emotes, jeweils fail-soft (leeres Ergebnis):

- `fetchGlobalBadges(opts)` — GQL `{ badges { setID version title imageURL } }`.
- `fetchChannelBadges(channelId, opts)` — GQL
  `{ user(id:$id){ broadcastBadges { setID version title imageURL } } }`.
- `fetchThirdPartyBadgeList(opts)` — BTTV + FFZ Gesamtlisten → `login → [badge]`.
- `fetchUserBadges(twitchUserId, opts)` — 7TV-Badge eines Users.
  ⚠️ Exakter 7TV-Endpoint (v3 REST vs. v4 GQL) wird bei der Implementierung
  live verifiziert. Vertrag: User-ID rein, `[{url, title}]` raus,
  Fehler = leeres Array.

Alle Funktionen nehmen `opts` (fetchImpl, timeoutMs, retries, delayFn) wie
bestehende Fetches → ohne Netz testbar. GQL bleibt zentral in `src/twitch-gql.js`.

### 2. Kernlogik (`renderer/lib/badges.js`, UMD, DOM-frei)

- `buildCatalog(globalList, channelList)` → Map `"set/version" → {url, title}`;
  Kanal gewinnt über global; zusätzlich `"set/*"`-Eintrag als Versions-Fallback.
- `parseBadgeTag(tags)` → `[{set, version}]` aus `badges=`;
  `badge-info=` liefert die Sub-Monate für den Tooltip
  („Subscriber (14 Monate)“).
- `resolveBadges(pairs, catalog)` → Render-Liste
  `[{url, title} | {fallback: 'B', color}]`. Wirft nie.
  Unbekanntes Set bei vorhandenem Katalog → weglassen;
  leerer Katalog → Kürzel-Fallback für broadcaster/moderator/vip/subscriber.

### 3. Anbindung

- **Live** (`renderer/chat/chat.js`): statt `IrcParse.badgeTypes(tags)` →
  `Badges.parseBadgeTag(tags)`; `user-id`-Tag für den 7TV-Lookup mitgeben.
- **VOD** (`src/twitch-api.js` `fetchVodComments`): `userBadges` →
  `[{set, version}]` (Version nicht mehr wegwerfen), `commenter.id` extrahieren.
- **Rendering** (`appendMessage`): `<img class="badge">` (18 px, lazy,
  `title`-Tooltip); Fallback-Einträge weiterhin als Chip. Der ⚙-Schalter
  „Badges anzeigen“ (`hide-badges`-CSS-Klasse) wirkt unverändert.
- **IPC neu**: `user-badges` (invoke) → Main-Cache (Session-Lebensdauer);
  Preload-Bridge um `fetchUserBadges` erweitern.
- **Payload neu**: `badgeCatalog` (Map als plain object) +
  `thirdPartyBadges` (login → [badge]) im `load`-Broadcast.

### 4. Fehlerverhalten

Jede Quelle unabhängig fail-soft: Katalog fehlt → Kürzel-Fallback;
7TV/BTTV/FFZ fehlt → nur Twitch-Badges; alles fehlt → Chat wie bisher.
Keine Exception aus der Badge-Schiene darf eine Nachricht verhindern.

### 5. Tests (`test/badges.test.js` u. a., `node --test`, ohne Netz)

- Katalog-Bau: Merge, Kanal-Override, Versions-Fallback.
- Tag-Parsing: `badges=`/`badge-info=`, kaputte/leere Tags, Wahl-Badges.
- Resolve: bekannt/unbekannt/leerer Katalog, Kürzel-Fallback.
- VOD-Mapping: `userBadges` mit Versionen, fehlende Felder.
- Fetches: injizierter `fetchImpl` (Vorbild `test/twitch-gql.test.js`).
- Alle 67 Bestandstests bleiben grün; Tests datenstand-unabhängig.

### 6. Release

Version 1.3.0, Ablauf nach `docs/TODO.md` (package.json bumpen, committen,
pushen, `npm run dist`, GitHub-Release mit Bindestrich-Namen + latest.yml).
