# Diagnose-Schalter

**Stand:** 2026-08-13
**Ausgangslage:** Es gibt genau eine Protokollfunktion, `updaterLog` in
`main.js:715`. Sie schreibt Updater- und GPU-Ereignisse ungefiltert nach
`userData/updater.log` — immer an, ohne Schwaerzung, ohne Groessengrenze.
Alles andere war Wegwerf-Code: der Adblock-Vorfall 2026-08-09 brauchte ein
eigenes `adblock-diag.log`, der Punkte-Takt ein temporaeres
`updaterLog('punkte-zustand', …)`. Beide wurden nach der Fehlersuche wieder
entfernt — und beim naechsten Fehler faengt es von vorn an.

## Ziel

Ein Schalter, der die Diagnose fuer alle Bereiche der App einschaltet und in
eine Datei schreibt, die Janis weitergeben kann.

**Die entscheidende Eigenschaft:** Die App haelt die letzten Ereignisse immer
im Speicher. Wird der Schalter umgelegt, landet dieser Puffer als
**Vorgeschichte** in der Datei. Ohne das trifft der Schalter die Fehler nicht,
um die es geht: „Ton weg nach Werbung" trat alle paar Tage einmal auf: man
merkt es, schaltet ein — und dann passiert es zwei Tage lang nicht. Ein
Schalter, den man erst nach dem Symptom umlegt, haette bei keinem der letzten
drei Fehler geholfen.

## Nicht-Ziele

- **Kein Live-Fenster.** Bewusst abgewaehlt. Die Datei reicht.
- **Kein Versand irgendwohin.** Keine Telemetrie, kein Hochladen. Die Datei
  bleibt lokal, bis Janis sie selbst weitergibt.
- **Kein automatisches Einschalten.** Standard ist aus, und aus heisst: nichts
  auf der Platte.
- **Keine einzelnen Chat-Nachrichten.** Siehe Abschnitt 6.

---

## 1. Aufbau

Zwei Module ohne DOM und ohne Electron, beide unit-testbar wie
`points-state.js`:

| Modul | Aufgabe |
|---|---|
| `src/diag-redact.js` | `schwaerze(text)` — sonst nichts |
| `src/diag-log.js` | Ringpuffer, Format, Groessengrenze, Ein/Aus |

Die Schwaerzung bekommt eine **eigene Datei**, weil sie der Teil ist, der bei
einem Fehler wirklich schadet, und weil sie isoliert gegen echte Beispiele
geprueft gehoert.

**Datenfluss:**

```
Renderer (chat/video)  --IPC 'diag-melde'-->  main.js
                                                |
Main-Pfade (Punkte, Updater, Fenster) ----------+
                                                v
                                        diagLog.melde()
                                                |
                                    schwaerze() EINMAL, hier
                                                |
                                   +------------+------------+
                                   v                         v
                             Ringpuffer (RAM)          Datei (nur wenn an)
```

**Geschwaerzt wird beim Eintritt, nicht beim Schreiben.** Damit gilt die
Zusicherung „im Diagnose-System existiert nichts Ungeschwaerztes" auch fuer den
Ringpuffer im Speicher — und die Vorgeschichte kann beim Einschalten nicht
versehentlich roh in die Datei laufen.

**`updaterLog` behaelt sein eigenes `updater.log`** und ruft zusaetzlich
`diagLog.melde('app', …)`. Es waere sauberer, es ganz auf den neuen Weg zu
legen — aber `melde()` schreibt nur bei eingeschalteter Diagnose, und
Updater-Ereignisse sollen weiter **immer** in eine Datei gehen: sie sind selten,
kosten nichts und haben schon zweimal eine Fehlersuche getragen (der
Updater-Crash in v1.7.0, das Auto-Update-Protokoll von v1.10.0). Sie an den
Schalter zu haengen hiesse, genau die Spur zu verlieren, die bisher immer da
war. Die Dopplung ist der Preis dafuer und bleibt auf diese eine Funktion
begrenzt.

## 2. `src/diag-redact.js`

```js
schwaerze(text) -> string
```

**Muster.** Jedes stammt aus einem Rahmen, den diese App wirklich verschickt:

| Muster | Woher | Ersetzt durch |
|---|---|---|
| `auth_token=<wert>` | Web-Cookie | `auth_token=***` |
| `OAuth <wert>` | GQL-`Authorization` | `OAuth ***` |
| `"token":"<wert>"` | Hermes-Rahmen | `"token":"***"` |
| `PASS oauth:<wert>` | IRC-Anmeldung, **klein** | `PASS oauth:***` |
| `Client-Integrity: <wert>` | Kisten-Claim | `Client-Integrity: ***` |
| `Cookie:` / `Set-Cookie:` | HTTP-Kopfzeilen | ganze Zeile `***` |
| freistehend `[a-z0-9]{30}` | Auffangnetz | `***` |

**Warum das Auffangnetz.** Beim PubSub-Spike stand der Token im Klartext im
Protokoll, weil die Schwaerzung nur `auth_token` und `OAuth ` kannte — Hermes
nutzt `"token"`, IRC `PASS oauth:` klein. Die Lehre war nicht „mehr Muster
raten", sondern dass ein **strukturelles** Netz noetig ist: Twitchs OAuth-Token
ist durchgaengig 30 Zeichen `[a-z0-9]`. Das faengt ihn auch in einem Rahmen,
den wir heute nicht kennen.

**Gegenprobe ist Pflicht.** Ein zu gieriges Netz macht das Protokoll unlesbar
und ist damit genauso wertlos wie ein leckendes. Kanal-Logins sind bei Twitch
hoechstens 25 Zeichen, 7TV-IDs sind 26-stellige Grossbuchstaben-ULIDs, VOD-IDs
rein numerisch — alle drei bleiben unberuehrt. Der Test haelt das fest.

## 3. `src/diag-log.js`

```js
createDiagLog({ schreiben, groesse, umlegen, jetzt = Date.now,
                maxPuffer = 200, maxBytes = 5 * 1024 * 1024 })
  .melde(bereich, ereignis, detail)   // detail optional
  .setAktiv(an)                       // an -> Vorgeschichte, dann mitschreiben
  .istAktiv()
  .puffer()                           // nur fuer Tests
```

Dateizugriff kommt als `schreiben`/`groesse`/`umlegen` von aussen — das Modul
kennt kein `fs`.

**Zeilenformat**, wie das heutige `updater.log`, damit es durchsuchbar bleibt:

```
[2026-08-13T00:28:39.980Z] punkte:kiste-ok {"davor":436360,"danach":436410,"betrag":50}
```

`detail` wird per `JSON.stringify` serialisiert; wirft das (zirkulaer, `BigInt`),
faellt es auf `String(detail)` zurueck. **Protokollieren wirft nie** — ein
Diagnose-Werkzeug, das die App abschiesst, ist schlimmer als keins.

**Ringpuffer.** Feste Laenge `maxPuffer` (200), aelteste Zeile faellt raus.
Nur fertige Textzeilen, kein Objektgeflecht — der Speicherbedarf ist damit
gedeckelt und vorhersehbar.

**Einschalten.** `setAktiv(true)` schreibt den Puffer **genau einmal** als
Vorgeschichte, danach laeuft jede Meldung direkt mit. Ein zweiter Aufruf mit
`true` schreibt sie nicht erneut. `setAktiv(false)` stoppt das Schreiben; der
Puffer laeuft weiter, damit ein erneutes Einschalten wieder Vorgeschichte hat.

**Groessengrenze.** Vor dem Schreiben `groesse()`; ueber `maxBytes` (5 MB) ruft
das Modul `umlegen()`. Der Hauptprozess benennt dann `diagnose.log` nach
`diagnose.1.log` um (vorhandene wird ueberschrieben) und faengt neu an. Also
hoechstens zwei Dateien, hoechstens ~10 MB — es kann nie die Platte volllaufen.

## 4. Verdrahtung

**Main** (`main.js`): legt `diagLog` mit `fs`-Anbindung auf
`userData/diagnose.log` an, liest den gemerkten Zustand aus dem Store und ruft
`setAktiv()`. Neue IPC-Kanaele:

| Kanal | Richtung | Zweck |
|---|---|---|
| `diag-melde` | Renderer → Main (`send`) | Ereignis melden |
| `get-diag-enabled` | `invoke` | Schalterstand fuer die Oberflaeche |
| `set-diag-enabled` | `send` | Schalter umlegen, im Store merken |
| `open-diag-folder` | `send` | Ordner im Explorer zeigen |

**Preload** (`preload.js`): `diag(bereich, ereignis, detail)`,
`getDiagEnabled()`, `setDiagEnabled(an)`, `openDiagFolder()`. Der Preload ist
sandboxed — kein `fs`, alles ueber IPC.

**Renderer melden immer**, auch wenn der Schalter aus ist: nur so fuellt sich
der Ringpuffer, und der ist der ganze Punkt. Das ist vertretbar, weil der
Ereignis-Katalog bewusst duenn ist (Abschnitt 6) — es sind einzelne Meldungen
pro Minute, keine pro Nachricht.

**Store:** `diagEnabled`, Vorgabe `false`.

## 5. Bedienung

Neue Gruppe im ⚙-Popup des Chat-Fensters (`renderer/chat/index.html:23`), nach
„Darstellung", im Aufbau der bestehenden `opt-group`:

```html
<div class="opt-group">
  <div class="opt-group-title">Diagnose</div>
  <label class="opt-check"><input type="checkbox" id="opt-diag" /> Protokoll mitschreiben</label>
  <button id="opt-diag-open" type="button">Diagnose-Ordner öffnen</button>
</div>
```

Ein Schalter, kein zweiter Knopf zum Sichern: Einschalten **ist** das Sichern,
weil die Vorgeschichte mitgeht. Der Ordner-Knopf spart das Wuehlen im AppData.

## 6. Ereignis-Katalog

**`punkte`** — `takt-aus` (mit Grund: kein Token / nicht live / pausiert /
Home offen / Kanal gesperrt / Abstand), `kontext` (Stand, claimID, Punktename),
`kiste-versuch`, `kiste-ok` (davor/danach/Betrag), `kiste-fehler` (Code),
`integrity-ernte` (ok/fehlgeschlagen), `einloesen` (Belohnung, ok, Code),
`kanal-gesperrt`, `token-abgelaufen`, `kanalwechsel`.

**`video`** — `werbung-start`, `werbung-ende`, `watchdog`,
`volume-guard-verdacht`, `volume-guard-wiederhergestellt`, `player-zustand`,
`qualitaet`.

**`chat`** — `irc-verbunden`, `irc-getrennt` (Grund), `irc-reconnect`
(Versuch, Wartezeit), `senden-fehler` (msg-id), `emotes-fehler` (Quelle),
`badges-fehler` (Quelle), `vod-luecke` (von/bis).

**`app`** — `start`, `update:*` (bestehend), `gpu-status`,
`unhandled-rejection`, `fenster`.

**Ausdruecklich nicht: einzelne Chat-Nachrichten.** Bei einem Mega-Chat waeren
das Tausende Zeilen pro Minute; der gesuchte Fehler ginge darin unter und die
5-MB-Grenze waere in Minuten erreicht. Der Chat-Bereich protokolliert
Verbindungs- und Fehlerereignisse, keine Inhalte.

## 7. Tests

`test/diag-redact.test.js`:

- jedes der sieben Muster wird geschwaerzt, einzeln geprueft
- der Token in einem groesseren JSON-Rahmen wird erwischt, nicht nur allein
  stehend
- **Gegenprobe:** deutscher Fliesstext, Kanal-Logins, eine 7TV-ULID und eine
  VOD-ID bleiben unveraendert
- mehrere Treffer in einer Zeile werden alle ersetzt

`test/diag-log.test.js`:

- aus: nichts geschrieben, Puffer fuellt sich trotzdem
- Puffer deckelt bei `maxPuffer`, aeltestes faellt raus
- `setAktiv(true)` schreibt die Vorgeschichte genau einmal
- zweites `setAktiv(true)` schreibt sie nicht erneut
- `setAktiv(false)` stoppt das Schreiben, Puffer laeuft weiter
- Ueberschreiten von `maxBytes` ruft `umlegen()`
- zirkulaeres `detail` wirft nicht
- ein Token im `detail` steht **auch im Puffer** nur geschwaerzt

## 8. Randfaelle

| Fall | Verhalten |
|---|---|
| Schalter aus | nichts auf der Platte, Puffer laeuft |
| Einschalten ohne Vorgeschichte (frischer Start) | leere Vorgeschichte, kein Fehler |
| Datei nicht schreibbar (Rechte, Platte voll) | still ignoriert, App laeuft weiter |
| Renderer meldet vor Fertigstellung des Main | Meldung faellt weg, kein Absturz |
| `detail` ist `undefined` | Zeile ohne Detail, wie heute bei `updaterLog` |
| Umlegen schlaegt fehl | weiterschreiben, Datei waechst ueber die Grenze — besser als Protokollverlust |
| Diagnose an, App wird beendet | Datei bleibt, Schalter bleibt an (Store) |

## 9. Betroffene Dateien

| Datei | Aenderung |
|---|---|
| `src/diag-redact.js` | **neu** |
| `src/diag-log.js` | **neu** |
| `test/diag-redact.test.js` | **neu** |
| `test/diag-log.test.js` | **neu** |
| `main.js` | diagLog anlegen, `updaterLog` daraufsetzen, IPC, Punkte-Meldungen |
| `preload.js` | Bruecke `diag` + Schalter + Ordner |
| `renderer/chat/index.html` | Diagnose-Gruppe im ⚙-Popup |
| `renderer/chat/chat.js` | Schalter verdrahten, Chat-Meldungen |
| `renderer/video/video.js` | Video-/Werbe-Meldungen |
| `renderer/lib/volume-guard.js` | Meldungen des Waechters |
| `docs/TODO.md` | Abschnitt zur Diagnose |

Nach der Umsetzung: Version bumpen und Release, siehe `docs/TODO.md`.
