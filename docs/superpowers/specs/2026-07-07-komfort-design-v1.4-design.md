# TwitchDual v1.4.0 — Komfort & Design

Stand: 2026-07-07. Validiertes Design aus Brainstorming-Session.

## Ziel

Ein Release mit zwei Paketen: **Chat-Komfort** (Schriftgröße, Emote-Tooltips,
User-Karte) und **visueller Feinschliff** (Home-Facelift, Chat-Feinschliff,
Micro-Animationen). Keine Änderungen an VOD-Paginierung, Autoscroll-Logik
oder IPC-Protokoll — die bleiben unangetastet.

## Paket 1: Chat-Komfort

### 1.1 Schriftgröße (Slider)

- Im bestehenden ⚙-Menü (`#settings-pop`) unter den Checkboxen ein
  `<input type="range">`: **11–22 px, Default 14**, mit px-Anzeige daneben.
- Persistenz als `chatPrefs.fontSize` über den vorhandenen Weg
  (`getUiPrefs`/`saveChatPrefs`, electron-store).
- Wirkung als CSS-Variable `--chat-font-size` auf `#messages`; Änderung
  greift live beim Ziehen.
- `chat.css`: Emote-Höhe, Badge-Größe und Zeitstempel von festen px auf
  `em` relativ zur Variable umstellen, damit alles proportional skaliert.
- **Clamping**: Werte außerhalb 11–22 oder Nicht-Zahlen aus dem Store →
  Fallback 14. Clamp-Funktion DOM-frei, unit-getestet.

### 1.2 Emote-Tooltips

- **Ein** wiederverwendetes Tooltip-Element (`position: fixed`, außerhalb
  des Scroll-Containers), gesteuert per Event-Delegation auf `#messages`
  (`mouseover`/`mouseout` auf `.emote`) — kein Listener pro Emote.
- Inhalt: vergrößerte Vorschau (~3× Emote-Höhe), Emote-Name, Quelle.
- Quelle abgeleitet aus der Bild-URL durch neue DOM-freie Funktion
  `emoteProvider(url)` in `renderer/lib/` (unit-getestet):
  - `static-cdn.jtvnw.net` → „Twitch“
  - `7tv.io` / `7tv.app` → „7TV“
  - `betterttv` → „BTTV“
  - `frankerfacez` → „FFZ“
  - sonst → leer (Tooltip zeigt dann nur Name + Vorschau)
- Natives `title=`-Attribut auf Emotes entfällt (kein Doppel-Tooltip).
- Positionierung über dem Emote; an Fensterrändern wird eingeklappt
  (links/rechts/oben clampen).

### 1.3 User-Karte (mit Verlauf)

- Klick auf einen Namen öffnet eine kleine Karte nahe der Nachricht
  (`position: fixed`), ersetzt das bisherige Sofort-Kopieren.
- Inhalt: Name in User-Farbe, Badges der Nachricht, 📋-Kopieren-Button,
  darunter die **letzten bis zu 5 Nachrichten** des Users.
- Verlauf wird beim Öffnen aus den vorhandenen `.msg`-DOM-Elementen
  gesammelt (Match über Name; Text inkl. Emote-`alt`-Namen als Text).
  Kein zusätzlicher Speicher, kein neues Datenmodell.
- Die Sammellogik als DOM-freie Hilfsfunktion (Liste von
  {name, text}-Einträgen + Name → letzte 5), unit-getestet.
- Schließen: Klick außerhalb oder `Esc`. Nur eine Karte gleichzeitig
  (öffnen schließt eine offene). Identisch in Live und VOD-Replay.

## Paket 2: Visueller Feinschliff

### 2.1 Home-Facelift

- **Live-Favoriten als Karten-Grid**: CSS Grid
  `repeat(auto-fill, minmax(220px, 1fr))`. Karte: 16:9-Stream-Thumbnail,
  Overlay-Chips (Zuschauerzahl, LIVE-Badge mit pulsierendem Punkt),
  darunter Avatar + Name + Spiel + Titel. Klick auf Karte = ▶ Live
  (bisherige Buttons VODs/Entfernen bleiben erreichbar, z. B. in der
  Fußzeile der Karte).
- **Thumbnails ohne API-Änderung** über die vorhersagbare CDN-URL
  `https://static-cdn.jtvnw.net/previews-ttv/live_user_<login>-440x248.jpg`
  plus Cache-Buster-Query (Zeitstempel, gerundet auf den 60-s-Refresh).
  `onerror` → Platzhalterfläche (wie bei Avataren heute).
- **Offline-Kanäle**: bleiben kompakte Zeilen unter dem Grid (heutige
  `.fav`-Optik).
- **Skeleton-Loader**: Beim ersten Laden schimmernde Platzhalterkarten
  (CSS-Animation). Spätere 60-s-Refreshes ersetzen Daten in place — keine
  Skeletons, kein Flackern.
- **Hover**: Karte `translateY(-2px)` + Schatten, Thumbnail `scale(1.03)`
  (mit `overflow: hidden`).

### 2.2 Chat-Feinschliff

- **Emote-Zeilenmetrik**: `.emote` bekommt negative vertikale Margins
  (Twitch-Ansatz), sodass Emotes die Zeilenhöhe nicht mehr aufreißen.
  Werte relativ (`em`), damit sie mit `--chat-font-size` skalieren.
- **Status-Punkt im Footer**: farbiger Punkt + Kurztext ersetzt reinen
  Text. Grün = verbunden, Gelb pulsierend = verbinde/reconnect,
  Rot = Fehler. Bestehende Klassen `#conn.ok/.err` erweitern um
  `.connecting`.
- **Sanftes Einblenden**: Neue `.msg` faden 150 ms ein (CSS-Animation) —
  nur wenn die Chat-Rate unter ~5 Nachrichten/s liegt. Ein DOM-freier
  Raten-Zähler (gleitendes Fenster, unit-getestet) schaltet per
  Container-Klasse (`#messages.no-anim`) ab; nach VOD-Seeks wird ebenfalls
  abgeschaltet, bis der Puffer aufgeholt hat.

### 2.3 Micro-Animationen

- Home-Overlay: Einblenden mit Fade + leichtem Translate (CSS-Transition
  auf `#home`, Klasse statt `display`-Toggle bzw. `@starting-style`).
- ⚙-Popup: Fade/Scale beim Öffnen.
- Buttons: dezentes `:active`-Scale-Feedback (global für die App-Buttons).
- `@media (prefers-reduced-motion: reduce)`: alle Animationen aus
  (inkl. 2.2-Einblenden und LIVE-Puls).

## Nicht-Ziele

- Keine Änderungen an VOD-Paginierung, Autoscroll, IPC-Nachrichten,
  Adblock oder Badge-Auflösung.
- Kein Login, keine neuen API-Aufrufe (Thumbnail-CDN-URL ist statisch
  konstruiert, kein GQL).
- Keine rahmenlosen Fenster / eigene Titelleiste (bewusst verschoben).
- Kein Stummschalten/Filtern von Usern (bewusst abgewählt).

## Fehlerfälle

- Tooltip/User-Karte sind `position: fixed`-Overlays außerhalb des
  Scroll-Containers → Autoscroll-Verhalten unverändert.
- Thumbnail-/Avatar-Ladefehler → Platzhalter, nie kaputtes Bild-Icon.
- Kaputte `chatPrefs`-Werte im Store → Defaults (Clamping).
- `emoteProvider` bei unbekannter URL → leere Quelle, Tooltip degradiert
  sauber.

## Tests

Neue Unit-Tests (node:test, DOM-frei wie gehabt):

1. `emoteProvider(url)` — alle vier Anbieter + unbekannte URL + kaputte URL.
2. Verlaufssammlung — letzte 5 Nachrichten eines Users, Reihenfolge,
   weniger als 5 vorhanden, Name nicht vorhanden.
3. `fontSize`-Clamping — 11–22, Strings, `undefined`, `NaN`.
4. Chat-Raten-Zähler — unter/über Schwelle, gleitendes Fenster,
   Reset nach Seek.

Bestehende Tests müssen unverändert grün bleiben.

## Release

- Version auf **1.4.0**, Release-Ablauf wie in `docs/TODO.md` beschrieben
  (dist, Bindestrich-Namen, `gh release create`).
- Manueller Smoke-Test vor Release: Live-Chat (großer Kanal),
  VOD-Replay inkl. Seek, Home-Overlay mit ≥1 Live-Favorit,
  Schriftgrößen-Slider, Tooltip, User-Karte.

## Umsetzungsreihenfolge (Vorschlag)

1. Chat-Komfort 1.1 → 1.2 → 1.3 (je mit Tests)
2. Chat-Feinschliff 2.2 (baut auf 1.1-Variablen auf)
3. Home-Facelift 2.1
4. Micro-Animationen 2.3 (Abrundung)
