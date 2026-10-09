# Angepinnte Nachrichten, Umfragen, Vorhersagen im Chat — Design

Stand: 2026-10-09 · Grundlage: Mess-Versuch vom 09.10. (docs/TODO.md,
Abschnitt „Angepinnte Nachrichten, Umfragen, Vorhersagen"), Branch
`spike/pins-polls`.

## Ziel

Janis sieht Pins, Umfragen und Vorhersagen des laufenden Kanals direkt im
Chat-Fenster, ohne twitch.tv zu oeffnen, und kann auf Vorhersagen aus der App
heraus setzen. Umfrage-Abstimmen folgt als Nachzug, sobald gemessen.

**Erfolg:** Pin-Leiste erscheint bei Kanaelen mit Pin; Umfrage-/Vorhersage-
Karte mit laufendem Countdown und live mitlaufenden Balken; Setzen senkt das
Guthaben und die Karte zeigt „X gesetzt"; Aufloesung loest Gewinn-/Verlust-
Effekt aus.

## Rahmen

- Nur Live-Kanaele. VOD und Home: alles aus, Verbindung getrennt.
- **Anzeigen ohne Login** (GQL anonym gemessen, nur Client-ID).
- **Setzen nur mit Web-Login** (wie Einloesen); ohne Login steht statt der
  Chips „Zum Setzen anmelden" (gleicher Weg wie 🎁).
- TwitchDual-Look (Theme-Variablen, Akzentfarbe), Animationen immer an.
- Kein Release ohne Janis' Ansage; Arbeit auf Sammel-Branch.

## Entscheidungen (mit Janis abgestimmt)

| Frage | Wahl |
|---|---|
| Platzierung | **C:** Pin als schmale Leiste oben im Chat; Umfrage/Vorhersage als aufklappende Karte mit Countdown darunter, gestapelt wenn beide laufen |
| Ende/Start | **C:** Start = kleiner Theme-Effekt; Vorhersage aufgeloest + mitgesetzt = Gewinn (gross + „+X" am Chip) bzw. Verlust (klein); Umfrage-Ende ohne Effekt; Karte zeigt Ergebnis und klappt nach 30 s zu |
| Einsatz | **B:** Schnell-Chips `100 · 1.000 · 10 % · 25 % · Alles` + eigenes Feld; erster Klick waehlt, zweiter Klick „N auf X setzen" bestaetigt |
| Datenweg | **1:** GQL-Startzustand + Hermes-Live-Updates, Rueckfall auf 10-s-Nachfragen fuer Pin/Umfrage |

## Bausteine

### Hauptprozess

**`src/hermes.js`** — Hermes-Client, Electron-frei, WebSocket-Klasse wird
uebergeben (Default `ws`, wie `chat-send.js`).
- `wss://hermes.twitch.tv/v1?clientId=kimne78kx3ncx6brgo4mv6wki5h1ko`
- Ablauf: `welcome` abwarten (Erkennung am Feld `welcome`, kein `type`) →
  mit Web-Token einmal `authenticate` (nur falls angemeldet) → je Thema
  `subscribe`. Kein eigener PING; Server-`keepalive` ~10 s, bleibt er > 30 s
  aus → Verbindung als tot behandeln.
- `notification.pubsub` ist ein **String** → zweimal parsen.
- API: `abonniere(thema)`, `kuendige(thema)`, `onEreignis(thema, daten)`,
  `onStatus`, `schliesse()`. Neuverbindung mit `renderer/lib/backoff.js`,
  danach alle aktiven Themen neu abonnieren und `onStatus('wieder-da')`.
- Token nie ins Diagnose-Protokoll (Schwaerzung gegen den echten Rahmen
  `"token"` pruefen, siehe Hermes-Spike-Lehre).

**`src/twitch-kanal-ereignisse.js`** — GQL, Electron-frei, `fetch` wird
uebergeben (wie `twitch-points.js`).
- `startzustand(channelID, login)` → ein Batch mit den drei persisted Queries
  (Hashes aus docs/TODO.md): `GetPinnedChat {channelID, count:1}`,
  `ChannelPollContext_GetViewablePoll {login}`,
  `ChannelPointsPredictionContext {count:1, channelLogin}`. Mit Web-Token,
  falls vorhanden (dann ist `viewablePoll.self` / eigener Tipp gefuellt),
  sonst anonym. Jeder der drei Teile scheitert einzeln: fehlerhafter Teil →
  `null` + Diagnose, die anderen bleiben.
- `setze({eventID, outcomeID, points}, kopf)` → erst
  `UserPredictionEventRestriction {eventID}`, dann `MakePrediction
  {input:{eventID, outcomeID, points, transactionID}}` (transactionID wie
  `neueTransaktionsId()` in `twitch-points.js`). Erfolg = `error: null`.
- Fehlercodes → deutscher Text (bekannte Codes als Tabelle, unbekannte roh +
  Diagnose). Integrity-Erkennung wie `twitch-points.js` (`fehler.integrity`).

**`main.js`** — Verdrahtung, schlank:
- Live-Kanal geladen (gleicher Ausloeser wie Punkte/`load-extras`, mit
  Lade-ID gegen veraltete Antworten) → `startzustand` → Hermes-Themen
  `pinned-chat-updates-v1.<cid>`, `polls.<cid>`, `predictions-channel-v1.<cid>`,
  mit Login zusaetzlich `predictions-user-v1.<uid>` und
  `community-points-user-v1.<uid>`.
- Kanalwechsel: alte Themen kuendigen, neue abonnieren. Home/VOD: Hermes zu.
- Rueckfall: kam fuer Pin bzw. Umfrage seit dem Start keine verwertbare
  Hermes-Meldung, fragt main deren Teil alle 10 s neu ab (Vorhersage hat
  gemessene Live-Meldungen, kein Rueckfall noetig). Nach `wieder-da` einmal
  kompletter Startzustand.
- Setzen per IPC `vorhersage-setzen` → `setze(...)` mit Integrity-Kopfzeilen
  ueber den bestehenden Weg (`integrity.holen` / `ernteIntegrity`, bei
  Ablehnung genau ein neuer Versuch — Logik aus `kisteEinloesen` in eine
  gemeinsame Hilfsfunktion ziehen statt kopieren).
- Jede Aenderung als IPC `kanal-ereignisse` an das Chat-Fenster (Rohdaten +
  Art; der Renderer haelt den Zustand).
- Diagnose: `kanal-ereignisse:start`, `:hermes-rahmen` (Typ + gekuerzte
  Nutzlast fuer ungemessene Typen: Sperren, Aufloesen, Pin-Wechsel, Umfrage),
  `:setzen`, `:fehler`.

### Gemeinsame Logik

**`renderer/lib/kanal-ereignisse.js`** — DOM-frei, UMD (wie `chat-ereignisse.js`),
unter Node mit den echten Mitschnitten getestet.
- `createZustand()` mit `ausStart(daten)` und `ausHermes(thema, nutzlast)` →
  einheitlich `{ pin, umfrage, vorhersage, meinTipp }`.
  - `pin`: `{id, text, fragmente, absender{name, farbe}, angeheftetVon, endetUm}`
  - `umfrage`: `{id, titel, status, endetUm, optionen[{id, titel, stimmen,
    anteil}], gesamt, mehrfach}`
  - `vorhersage`: `{id, titel, status ACTIVE|LOCKED|RESOLVED|CANCELED,
    einreichungBis, optionen[{id, titel, farbe, punkte, nutzer, anteil,
    quote, topEinsatz}], gewinnerId}`
  - `meinTipp`: `{eventId, optionId, punkte}` aus `prediction-made` bzw.
    Startzustand.
- Snake-case (Hermes) und camelCase (GQL) auf dasselbe Format abbilden.
- Hilfen: `quote(opt, alle)` (Format „1:1,94"), `restMs(jetzt)`,
  `setzbareOption(zustand)` (nach eigenem Tipp nur dieselbe Option),
  `chipBetrag(art, guthaben)` (10 % / 25 % / Alles, gekappt auf
  10 … min(250.000, Guthaben)), `ergebnisFuerMich(zustand)` →
  `{art:'gewonnen', betrag}` / `{art:'verloren'}` / `null`.
- Status-Uebergaenge erzeugen Effekt-Signale: neue Umfrage/Vorhersage →
  `ereignis-start`; RESOLVED mit `meinTipp` → `tipp-gewonnen`/`tipp-verloren`.
  Jedes Signal pro Ereignis-ID nur einmal.

### Chat-Fenster (`renderer/chat/`)

- **Pin-Leiste** unter Umfrage/Vorhersage (Janis 09.10.2026): eine Zeile (gekuerzt), Klick klappt den vollen
  Text auf; Links klickbar (oeffnen extern wie Chat-Links); „angeheftet von X";
  ✕ verkleinert zu einem 📌-Knopf (Klick holt die Leiste zurueck); eine andere Pin-ID erscheint wieder als Leiste.
- **Ereignis-Karte** darunter (Umfrage und/oder Vorhersage, gestapelt):
  Titel, Countdown, je Option Balken mit Anteil (animierte Breite). Neues
  Ereignis klappt automatisch auf; Einklappen auf eine Zeile Titel+Countdown.
  - Vorhersage zusaetzlich: Punkte, Quote, Teilnehmer, Top-Einsatz; Chips je
    setzbarer Option + eigenes Feld; Bestaetigungsknopf „N auf X setzen";
    nach Setzen „N gesetzt", Gegen-Option ausgegraut. Gesperrt → „Warte auf
    Ergebnis". Aufgeloest → Gewinner hervorgehoben, nach 30 s zu.
  - Umfrage: Optionen + Balken, Hinweis „Abstimmen auf twitch.tv" bis zum
    Nachzug. Beendet → Ergebnis, nach 30 s zu.
  - Fehler beim Setzen als kurze Zeile in der Karte (kein Toast).
- **Effekte** ueber `themeRuntime.ereignis(art, {ursprung})`. Neue Arten
  `ereignis-start`, `tipp-gewonnen`, `tipp-verloren`. Damit alle fuenf Welten
  ohne Einzelarbeit reagieren, bildet `theme-runtime.js` unbekannte Arten auf
  vorhandene ab: `tipp-gewonnen` → `kiste`, `ereignis-start` und
  `tipp-verloren` → `punkte`. Eine Welt kann die neuen Arten spaeter selbst
  behandeln. Gewinn zusaetzlich „+X" am Punkte-Chip (`zeigeZuwachs`).

## Fehlerfaelle

| Fall | Verhalten |
|---|---|
| Hermes bricht ab | Karte bleibt stehen, Neuverbindung mit Backoff, danach kompletter Startzustand |
| Startabfrage-Teil scheitert (z. B. Hash rotiert) | nur dieser Teil ausgeblendet, Diagnose; nichts Falsches anzeigen |
| Integrity beim Setzen abgelehnt | Satz verwerfen, einmal neu ernten, einmal wiederholen |
| Twitch-Fehlercode beim Setzen | deutscher Text in der Karte; unbekannt → roh + Diagnose |
| Kein Web-Login | anzeigen ja, statt Chips „Zum Setzen anmelden" |
| Kanalwechsel waehrend Abfrage | Antwort per Lade-ID verworfen |

## Tests

- `kanal-ereignisse.js` mit Fixtures aus den echten Mitschnitten (Pin
  eliasn97, Umfrage ludwig ACTIVE→COMPLETED, Vorhersage jynxzi
  `event-updated`/`prediction-made`/`points-spent`): Abbildung, Quote,
  Anteile, Restzeit, gesperrte Gegen-Option, Chip-Betraege inkl. Grenzen,
  Gewinn/Verlust, Effekt-Signal nur einmal.
- `hermes.js` mit Fake-WebSocket: welcome→authenticate→subscribe,
  Doppel-Parse, keepalive-Ausfall, Neuverbindung mit Neu-Abo, Kuendigen,
  Token-Schwaerzung im Diagnose-Rahmen.
- `twitch-kanal-ereignisse.js` mit Fake-fetch: Batch-Aufbau, Teilausfall,
  Integrity-Kopfzeilen, Integrity-Fehler → genau ein Retry, Fehlercode-Texte.
- Bestehende Tests bleiben gruen.
- **Live (Janis schaut):** Pin-Kanal, laufende Umfrage, Vorhersage mit
  kleinem Einsatz, Aufloesung. Danach Diagnose-Protokoll auf die bisher
  ungemessenen Hermes-Typen auswerten und Abbildung nachschaerfen.

## Nicht in diesem Umfang

- Umfrage-Abstimmen (Nachzug nach Messung: eine laufende Umfrage, Dev-App,
  `tools/cdp-mitschnitt.js`).
- Ersetzen des 15-s-Punkte-Takts durch `points-spent` (spaeter moeglich,
  Hermes-Verbindung ist dann vorhanden).
- Fremde Einloesungen im Chat (`reward-redeemed`) — eigenes Thema.
- Eigene Effekte je Welt fuer die neuen Arten.
