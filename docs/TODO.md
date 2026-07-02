# TwitchDual — Roadmap / offene TODOs

Priorisiert nach Nutzen/Aufwand. ✅ = bereits umgesetzt (siehe Git-Historie).

## Erledigt (Robustheit + Testbarkeit)

- ✅ **VodReplay-Kern DOM-frei** in `renderer/lib/vod-replay.js` extrahiert,
  unit-getestet in `test/vod-replay.test.js` (merge/dedupe, Coverage, Gap-Skip,
  Seek-Erkennung, Fehlerpfad).
- ✅ **Async-Guarding per Epoche**: Seeks invalidieren laufende Fetches; alte
  Fenster können den frisch geleerten Puffer nicht mehr verschmutzen.
- ✅ **Speicher-Trim**: abgespielte Kommentare älter als `KEEP_BEHIND` (120 s)
  verlassen `buffer` **und** `seen` → kein unbegrenztes Wachstum bei langen VODs.
- ✅ **Endebedingung**: `ensureCoverage` stoppt, sobald `lengthSeconds`
  (aus `resolveVideoOwner`, via `load`-Payload) abgedeckt ist — kein
  500-ms-Polling am VOD-Ende mehr. Seek zurück hebt das Ende wieder auf.
- ✅ **IRC-Auto-Reconnect** mit exponentiellem Backoff + Jitter
  (`renderer/lib/backoff.js`, getestet), inkl. Twitch-`RECONNECT`-Kommando.
- ✅ `test/browse-map.test.js` existiert bereits (Mapper des Home-Overlays).

## Hoch (Robustheit / Resilienz)

1. **fetch-Timeouts + begrenzte Retries** für Twitch-GQL und 7TV.
   `src/twitch-api.js:19` (`gql()`) und `src/twitch-browse.js:9` haben keinerlei
   Timeout — ein hängender Request blockiert `submit-load` unbegrenzt.
   Umsetzung: gemeinsame Helper-Funktion `fetchWithTimeout(url, opts, ms=10000)`
   über `AbortSignal.timeout(ms)`, dazu 1–2 Retries mit `Backoff.delay()` nur
   bei Netzwerkfehlern/5xx (nicht bei 4xx). Beide `gql()`-Duplikate dabei in ein
   Modul zusammenziehen (siehe Punkt 2).
2. **API-Konstanten zentralisieren** (`CLIENT_ID`, `GQL_URL`, Persisted-Query-
   Hashes): `src/twitch-api.js:12` und `src/twitch-browse.js:6` duplizieren
   Client-ID + `gql()`. Neues `src/twitch-gql.js` mit `gql(body)` +
   Konstanten-Export; wenn Twitch Hash/Client-ID rotiert, gibt es genau eine
   Stelle zum Anpassen. Fallback-Skizze dokumentieren: User-ID-Auflösung und
   VOD-Listen gehen auch über offizielle **Helix-API** (braucht eigenes
   App-Token via Client-Credentials); nur VOD-Kommentare haben keine offizielle
   Alternative.
3. **IntegrityCheckFailed sichtbar machen**: `fetchVodComments`
   (`src/twitch-api.js:147`) liefert bei `comments:null` still `[]` — falls
   Twitch auch Offset-Anfragen hinter Integrity stellt, sieht der Nutzer nur
   einen leeren Chat. GQL-`errors[].message` prüfen und als `{ok:false,
   error:'IntegrityCheckFailed …'}` hochreichen, damit `onError` es anzeigt.

## Mittel (UX)

4. **VOD-Pause erkennen**: Bei Pause bleibt `getCurrentTime()` konstant —
   `ensureCoverage` lädt trotzdem Lookahead nach (harmlos, aber unnötig).
   Optional `Twitch.Player.PAUSE`/`PLAY`-Events (`renderer/video/video.js:41`)
   an den Chat weiterreichen und den Status („Replay pausiert") anzeigen.
5. **„Neue Nachrichten"-Button**: Wenn `autoScroll` aus ist
   (`renderer/chat/chat.js:19`), unten schwebenden Button einblenden
   („↓ N neue Nachrichten"), Klick = `scrollToBottom()` (Funktion existiert
   schon, ist aktuell ungenutzt).
6. **Zeitstempel im VOD-Chat**: `comment.offset` ist vorhanden; in
   `appendMessage` optional ein `<span class="ts">` mit `formatTime(offset)`
   vor den Namen setzen (nur im Replay-Modus).
7. **Ladeindikator + klare Fehler im Video-Fenster**: `doLoad()`
   (`renderer/video/video.js:67`) zeigt nur Text im Status; Spinner am Button
   und Fehlertext mit Ursache (Channel existiert nicht / offline / Netzwerk).
8. **Verlauf zuletzt geladener Quellen**: `electron-store`-Key `history`
   (max. 10 Einträge), Dropdown/Datalist am Eingabefeld; beim `submit-load`-
   Erfolg in `main.js:85` pflegen.
9. **Home-Overlay**: Suche/Filter über den Favoriten, Sortierung wählbar
   (`sortByLive` existiert in `src/browse-map.js:70`, wird in `home.js:74`
   dupliziert — dort wiederverwenden), besserer Leerzustand mit Anleitung.
10. **Player**: Lautstärke/Qualität merken (`player.setVolume`,
    `getQuality/setQuality` der Embed-API) in `electron-store`;
    letzte Quelle beim Start wieder anbieten.

## Niedrig (Qualität / Aufräumen)

11. **Tastenkürzel**: `Ctrl+L` fokussiert Eingabefeld, `Esc` schließt
    Home-Overlay, `Space` Play/Pause (Player-API `pause()/play()`).
12. **`trimMessages`-Interaktion mit Trim testen**: DOM-Trim (`chat.js:35`)
    und Puffer-Trim (`vod-replay.js`) sind unabhängig; Grenzfall dokumentieren.
13. **Badges/Klick auf Namen** (Live-Chat): `badges`-Tag aus IRC parsen
    (`parseIrc` liefert Tags schon), Klick auf Namen = Name ins Eingabefeld.
14. **`scrollToBottom` verwenden oder entfernen** (aktuell toter Code,
    siehe Punkt 5).
