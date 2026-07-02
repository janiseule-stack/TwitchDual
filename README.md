# TwitchDual

Zwei-Fenster Twitch-Viewer für **Hochkant-/Portrait-Monitore**. Ein Fenster zeigt
das **Video** (Twitch-Player), ein zweites Fenster zeigt den **Chat** mit
**7TV-Emotes** – für LIVE-Streams *und* für VOD-Replays.

Beide Fenster werden über **ein gemeinsames Eingabefeld** (oben im Video-Fenster)
gesteuert: Gibst du einen Channel-Namen (LIVE) oder einen VOD-Link/-ID ein und
drückst „Laden", verbinden sich **beide** Fenster mit derselben Quelle.

---

## Installation & Start

Voraussetzung: **Node.js ≥ 18** (getestet mit Node 26).

```bash
npm install
npm start
```

### Als eigenständige EXE (ohne npm) starten

```bash
npm run pack
```

erzeugt `dist/TwitchDual-win32-x64/TwitchDual.exe` (portabel, per Doppelklick
startbar — z. B. Desktop-Verknüpfung darauf legen). Nach Code-Änderungen
`npm run pack` erneut ausführen, damit die EXE den neuen Stand enthält.

Tests der reinen Logik (Eingabe-Parser, Emote-Ersetzung):

```bash
npm test
```

---

## Bedienung

Im Feld oben im Video-Fenster eingeben:

| Eingabe                                      | Ergebnis            |
| -------------------------------------------- | ------------------- |
| `papaplatte`                                 | LIVE-Stream         |
| `https://twitch.tv/papaplatte`               | LIVE-Stream         |
| `https://www.twitch.tv/videos/123456789`     | VOD-Replay          |
| `123456789` oder `v123456789`                | VOD-Replay          |

- **LIVE:** Chat verbindet sich **anonym lesend** mit dem Twitch-IRC
  (`irc-ws.chat.twitch.tv`) und zeigt Nachrichten in Echtzeit (Name in Farbe).
- **VOD:** Chat lädt getimte Kommentare und blendet sie **synchron zur
  Abspielposition** ein. Beim Vor-/Zurückspringen im Video wird der Chat neu
  positioniert (Erkennung über Sprünge in `getCurrentTime()`). Nachgeladen wird
  **fenster­weise per Offset** (siehe „VOD-Kommentar-Paginierung" unten).
- **7TV-Emotes** funktionieren in **beiden** Modi (inkl. animierter WEBP).

Fenstergrößen und -positionen werden über `electron-store` **persistent
gemerkt**.

### Home-Overlay (Favoriten & VOD-Browser)

Der **☰-Button** oben im Video-Fenster öffnet eine Home-Ansicht über dem Player
(öffnet sich auch beim Start):

- **Favoriten / wer ist live:** Channels als Favoriten hinzufügen (`+`-Feld). Die
  App zeigt ohne Login, wer davon **gerade live** ist – mit Vorschaubild, Titel,
  Spiel und Zuschauerzahl. Live-Kanäle stehen oben, Auto-Refresh alle 60 s. Klick
  auf **▶ Live** lädt den Stream in beide Fenster.
- **VOD-Browser:** Der **VODs**-Button eines Channels listet dessen letzte 20
  Aufzeichnungen (Thumbnail, Titel, Datum, Länge, Aufrufe). Ein Klick lädt den
  VOD-Replay – der Player hat die volle Zeitleiste zum Durchscrubben, der Chat
  läuft synchron mit. „← Zurück" führt zur Favoritenliste.

Favoriten werden über `electron-store` (`favorites`) persistent gespeichert.
Live-Status und VOD-Listen kommen über dieselbe inoffizielle Twitch-GraphQL-API
(Client-ID-Header, siehe unten).

---

## Wie es funktioniert (Architektur)

```
┌──────────────┐  submit-load   ┌──────────────┐  load (broadcast)  ┌──────────────┐
│ Video-Fenster│ ─────────────▶ │  Main-Prozess │ ─────────────────▶ │ Chat-Fenster │
│  (Player)    │                │  (IPC + APIs) │                    │ (IRC / VOD)  │
│  player-time │ ─────────────▶ │   Relay       │ ─────player-time─▶ │  Replay-Sync │
└──────────────┘                └──────────────┘                    └──────────────┘
```

- **Video-Fenster** nutzt die **Twitch-Player-JS-API**
  (`embed.twitch.tv/embed/v1.js`), nicht nur ein iframe – dadurch ist
  `getCurrentTime()` auslesbar. Diese Zeit wird alle 500 ms an den Main-Prozess
  gemeldet und ans Chat-Fenster weitergereicht (für den VOD-Sync).
- **Chat-Fenster** ist ein **eigener Renderer** (kein offizieller Twitch-Chat-Embed),
  damit 7TV-Emotes eingebaut werden können.
- **7TV:** Der Main-Prozess löst zuerst die **Twitch-User-ID** zum Channel-Namen
  auf und lädt darüber das **7TV-Emote-Set** (`7tv.io/v3`) plus die globalen
  7TV-Emotes. Die Wort→Bild-Ersetzung passiert XSS-sicher über `textContent`
  (kein `innerHTML`).

### Warum ein lokaler HTTP-Server?

Der Twitch-Embed verlangt einen `parent`-Parameter, der zum Hostname des
einbettenden Fensters passt. Unter `file://` gibt es keinen brauchbaren
Hostname → der Player lädt nicht. Deshalb startet der Main-Prozess einen kleinen
statischen Server auf `127.0.0.1:<zufälliger Port>` und lädt die Renderer von
`http://localhost`. Dann passt `parent: ["localhost"]`.

### VOD-Kommentar-Paginierung (wichtig!)

Twitch liefert VOD-Kommentare über die Operation `VideoCommentsByOffsetOrCursor`.
Diese kann **entweder** per `contentOffsetSeconds` (Startpunkt in Sekunden)
**oder** per `cursor` (nächste Seite) abgefragt werden.

**Fallstrick:** Die **cursor-basierte** Variante verlangt inzwischen einen
gültigen **`Client-Integrity`-Token** (Twitchs Anti-Bot). Ohne ihn antwortet der
Server mit `{"errors":[{"code":"IntegrityCheckFailed"}], "data":{...comments:null}}`.
Die **offset-basierte** Variante funktioniert dagegen weiterhin **ohne** Token.

Deshalb blättert die App **ausschließlich per Offset** vorwärts:

- Jede Anfrage liefert ein **Fenster** von ~50 Kommentaren, das ca. 2 s **vor**
  dem angefragten Offset beginnt und einige Sekunden dahinter endet.
- Die nächste Seite wird mit einem **größeren Offset** (Ende des letzten
  Fensters) angefragt. Aufeinanderfolgende Fenster **überlappen** sich.
- Überlappungen werden über die **Kommentar-`id`** dedupliziert
  (`VodReplay.seen` in `renderer/chat/chat.js`).
- `VodReplay` hält immer ~`VOD_LOOKAHEAD` (30 s) Puffer vor der Abspielzeit vor
  und **überspringt stille Lücken** um `VOD_GAP_STEP` (30 s), damit die
  Wiedergabe nie hängen bleibt.

> Historie: Früher wurde per `cursor` weitergeblättert. Dadurch brach der
> VOD-Chat nach genau einer Seite (~50 Nachrichten) ab, weil jede Folgeseite am
> Integrity-Check scheiterte. Der Umbau auf Offset-Paginierung behebt das.

---

## ⚠️ Hinweise zu (teils inoffiziellen) API-Zugriffen

Manche Funktionen nutzen **nicht offiziell dokumentierte** Twitch-Endpunkte.
Sie können sich jederzeit ändern:

1. **Twitch-GraphQL (`gql.twitch.tv`)** – für **User-ID-Auflösung** und
   **VOD-Kommentare**. Benötigt einen **`Client-ID`-Header**. Verwendet wird die
   öffentliche Web-Client-ID des Twitch-Players
   (`kimne78kx3ncx6brgo4mv6wki5h1ko`) in `src/twitch-api.js`.
   Diese Aufrufe laufen im **Main-Prozess** (Node), damit keine Browser-CORS-Regeln greifen.
2. **VOD-Kommentare** nutzen eine **persisted query** (`sha256Hash` in
   `src/twitch-api.js`). Wenn Twitch den Hash rotiert, kommen keine Kommentare
   mehr → Hash aktualisieren. **Nur die Offset-Variante** dieser Query wird
   genutzt; die Cursor-Variante ist serverseitig hinter einem
   `Client-Integrity`-Token gesperrt (`IntegrityCheckFailed`) – Details unter
   „VOD-Kommentar-Paginierung". Sollte Twitch künftig auch Offset-Anfragen hinter
   Integrity stellen, bräuchte es einen echten Integrity-Token (aus einem
   Browser-Kontext) oder eine offizielle Alternative.
3. **7TV-API (`7tv.io/v3`)** – öffentlich und dokumentiert, aber ein Drittanbieter.
   Hat ein Channel kein 7TV, bleibt die Emote-Liste einfach leer.
4. **Twitch-IRC (`irc-ws.chat.twitch.tv`)** – anonymer Lesezugriff über einen
   `justinfan…`-Nick (kein Login/Token nötig).

**Falls etwas davon nicht klappt** (z. B. VOD-Kommentare bleiben leer oder die
User-ID-Auflösung schlägt fehl), liegt das mit hoher Wahrscheinlichkeit an einer
geänderten inoffiziellen API. Melde dich – dann suchen wir eine Alternative
(z. B. offizielle Helix-API mit eigenem App-Token für die ID-Auflösung, oder
ein anderer Kommentar-Provider).

---

## Projektstruktur

```
main.js                 Electron-Main: Fenster, IPC, Relay, Server-Start
preload.js              Sichere IPC-Bridge (contextIsolation)
src/server.js           Statischer localhost-Server (für den Embed-parent)
src/parse-input.js      Eingabe → live/vod  (getestet)
src/twitch-api.js       GraphQL (User-ID, VOD-Owner, VOD-Kommentare) + 7TV-Emotes
src/twitch-browse.js    GraphQL für Home-Overlay: Live-Status + VOD-Listen
src/browse-map.js       Rohdaten der Browse-Queries → UI-Modelle (getestet-fähig)
renderer/video/         Video-Fenster (Twitch-Player, Zeit-Broadcast, Home-Overlay)
renderer/chat/          Chat-Fenster (DOM/IPC-Adapter: IRC live + VOD-Replay + Emote-Render)
renderer/lib/emote-text.js  Wort→Emote-Tokenizer (getestet)
renderer/lib/vod-replay.js  VOD-Replay-Kernlogik, DOM-frei (getestet)
renderer/lib/backoff.js     Exponentieller Backoff für IRC-Reconnect (getestet)
test/                   node:test Unit-Tests
docs/TODO.md            Priorisierte Verbesserungs-Roadmap
```

Datenfluss VOD-Replay (Kurzform):

```
video.js  --player-time (500ms)-->  main.js  --player-time-->  chat.js
                                                                  │
chat.js VodReplay.onTime(t):  advance(t) rendert Puffer bis t     │
   └─ ensureCoverage(t): fetchVodComments(offset) via IPC  ──────┘
        └─ main.js 'vod-comments'  ──>  twitch-api.fetchVodComments (Offset)
```

## Lizenz

MIT
