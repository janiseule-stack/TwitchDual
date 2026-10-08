# Zuschauer-Fenster: Kanalpunkte und Kisten verdienen

Stand: 2026-10-08 · Branch `feat/zuschauer-fenster`

## Ziel

Wer in TwitchDual einen Live-Kanal schaut, verdient dort dieselben Kanalpunkte
und Kisten wie im Browser - ohne dass nebenher ein Browser laufen muss.

Erfolg: Beim normalen Schauen steigt der Punktestand im Chip (passiver Tropfen,
~10 je 5 min) und es fallen Kisten, die der vorhandene Auto-Claim abholt.

## Ausgangslage (gemessen, nicht vermutet)

- Der eingebettete Player (`Twitch.Player` auf `player.twitch.tv`) zaehlt NICHT
  als Zuschauen (Messung 13.08.2026: 20 min Wiedergabe = 0 Punkte, keine Kiste).
  Ursache: der Embed erzeugt den Ereignisstrom `sendSpadeEvents` nicht.
- Feld-Protokoll 07.10.2026: papaplatte 18:35-21:24 Stand fest auf 1.343.739,
  `claimID` durchgehend `null`.
- Das Abholen funktioniert: 5 von 5 angebotenen Kisten am 06./07.10. sofort
  geholt (`kiste-ok`, je +50). Es fehlt nur das Angebot.
- Spike 13.08.2026: unsichtbares `BrowserWindow` (`show:false`,
  `backgroundThrottling:false`) auf `twitch.tv/<kanal>`, stumm, 160p ->
  `visibilityState` bleibt `visible`, Video laeuft 1:1 zur Wanduhr,
  **+80 Punkte inkl. Kiste in 12,5 min**.
- Der Web-Login (`auth-token`-Cookie) liegt in `session.defaultSession`; ein
  Fenster auf dieser Sitzung ist also automatisch angemeldet.

Bewusst verworfen: `sendSpadeEvents` ohne Video nachbauen (vorgetaeuschte
Zuschauerzeit, Sperrrisiko). Wir schauen wirklich zu - nur unsichtbar.

## Verhalten

Das Zuschauer-Fenster laeuft genau dann, wenn ALLES gilt:

- ein Live-Kanal ist geladen (`currentLiveChannel`, kein VOD),
- der Player spielt (`player-state === 'playing'`),
- das Home-Overlay ist zu,
- der Web-Token ist nutzbar (`webTokenNutzbar()`).

Es schaut immer den aktuell geladenen Kanal und wechselt bei Kanalwechsel mit.
Hintergrund-Sammeln bei Favoriten ist ausdruecklich NICHT Teil dieses Baus.

Gegen Flattern: Faellt die Bedingung weg, weil der Player pausiert oder Home
offen ist, schliesst das Fenster erst nach **60 s** Karenz. Kommt die Bedingung
in der Zeit zurueck, laeuft es ungestoert weiter. Kanalwechsel, VOD, Abmeldung
und abgelaufener Token wirken sofort.

Das Fenster ist nie sichtbar (kein `show()`, kein Taskleisten-Eintrag).

## Bausteine

### 1. `src/zuschauer-fenster.js` - reine Logik (unit-getestet)

DOM- und Electron-frei. Zwei Teile:

`zielKanal(zustand)` -> `string | null`
Eingabe `{ kanal, spielt, homeOffen, webAngemeldet }`; liefert den Kanal-Login,
wenn alle Bedingungen gelten, sonst `null`.

`createZuschauerSteuerung({ karenzMs = 60000 })` - Zustandsautomat mit
`aktualisiere(zustand, nowMs)` -> Aktion `{ art: 'start', kanal }` |
`{ art: 'stopp', grund }` | `null`. Haelt fest, welcher Kanal laeuft, und
wendet die Karenz an:
- Ziel = laufender Kanal -> nichts, Karenz-Zeitpunkt loeschen.
- Ziel = anderer Kanal -> sofort `stopp` + `start` (als `start` mit neuem
  Kanal; der Treiber schliesst vorher das alte Fenster).
- Ziel = `null`, Grund pausiert/Home -> erst nach Ablauf der Karenz `stopp`.
- Ziel = `null`, Grund kein Kanal/VOD/Token -> sofort `stopp`.
- Nach `aufgegeben` (siehe Waechter) startet derselbe Kanal nicht erneut,
  erst ein anderer Kanal (oder derselbe nach einem Kanalwechsel dazwischen).

`waechterEntscheidung(verlauf)` - aus den letzten Messungen
`{ hatVideo, paused, currentTime }` entscheiden: `ok` | `neu-laden` |
`aufgeben`. Regeln: Fortschritt = `currentTime` gestiegen und nicht pausiert.
Zwei Messungen in Folge ohne Fortschritt -> `neu-laden`. Drei Neu-Ladungen
ohne zwischenzeitlichen Fortschritt -> `aufgeben`.

### 2. Treiber in `main.js` (nicht unit-getestet, echtes Fenster)

- `starteZuschauer(kanal)`: `new BrowserWindow({ show:false, skipTaskbar:true,
  webPreferences:{ session: session.defaultSession, backgroundThrottling:false,
  contextIsolation:true, nodeIntegration:false } })`, kein Preload.
  `webContents.setAudioMuted(true)`. Laedt `https://www.twitch.tv/<kanal>`;
  beim ersten `did-finish-load` per `executeJavaScript`
  `localStorage.setItem('video-quality','{"default":"160p30"}')` und einmal
  `reload()`.
- `stoppeZuschauer(grund)`: immer `destroy()` (nie `close()` - `beforeunload`
  koennte das unsichtbare Fenster am Leben halten), Waechter-Timer weg.
- Auch beim App-Ende (`before-quit`) und wenn das Video-Fenster schliesst:
  `stoppeZuschauer`.
- Ausgeloest wird `aktualisiere()` an allen Stellen, die heute den Punkte-Takt
  betreffen: `submit-load` (live/VOD), `player-state`, `home-open`,
  `home-close`, Web-Login/-Logout, Token abgelaufen - plus ein 5-s-Intervall,
  damit die Karenz auch ohne neues Ereignis ablaeuft.
- Kurzer `kanal`-Abgleich: der Fenstername ist der Login aus
  `currentLiveChannel` (bereits geprueft), nie freier Text.

### 3. Waechter

Alle 30 s (erste Messung 45 s nach Start, damit Seite + Reload durch sind):
`executeJavaScript` liest am ersten `<video>` `{ hatVideo, paused,
currentTime }`. `waechterEntscheidung` entscheidet:
- `neu-laden` -> `webContents.reload()`.
- `aufgeben` -> `stoppeZuschauer('aufgegeben')`, Steuerung merkt sich den Kanal.
Die Seite wird nie angeklickt, kein Play wird erzwungen.

### 4. Anzeige: 👁 am Punkte-Chip

Neues Ereignis `zuschauer-status { zaehlt: boolean }` an beide Fenster
(broadcast). `zaehlt` ist `true`, sobald das Fenster laeuft UND der Waechter
mindestens einmal Fortschritt gemessen hat; `false` bei Stopp, Neu-Laden und
Aufgeben. Preload bekommt `onZuschauerStatus`. Ueberall, wo der Punkte-Chip
gezeigt wird (`renderer/chat/chat.js`, `renderer/video/video.js`), erscheint
dann ein kleines 👁 vor dem Stand, mit Tooltip "Twitch zaehlt dich als
Zuschauer". Eigenes Ereignis statt Feld in `points-update`, damit sich
Punkte-Takt und Waechter nicht gegenseitig ueberschreiben.

### 5. Diagnose-Protokoll

Bereich `zuschauer`: `start {kanal}`, `stopp {kanal, grund}`,
`neu-laden {kanal, versuch}`, `aufgegeben {kanal}`, `zaehlt {kanal}` (erste
Fortschritts-Messung). Nur Flanken, keine Zeile je Waechter-Messung.

## Fehlerfaelle

- Seite laedt nicht (Netz): `did-fail-load` im Hauptrahmen (ausser -3) ->
  zaehlt wie eine Messung ohne Fortschritt; der Waechter regelt den Rest.
- Twitch zeigt Werbung vor dem Stream: `currentTime` des Werbe-Videos steigt
  ebenfalls -> unkritisch.
- "Schaust du noch?"-Dialog oder Mature-Gate: Video steht -> Neu-Laden ->
  ggf. Aufgeben. Bewusst KEIN Wegklicken; tritt es auf, steht es im Protokoll
  und wird eigens behandelt.
- Abmeldung waehrend es laeuft: sofort Stopp.
- Integrity-Ernte fuer Kisten (`ernteIntegrity`, eigenes Fenster auf
  `/directory`) bleibt unveraendert. Beide Fenster koennen gleichzeitig
  existieren; das Zuschauer-Fenster haengt keinen `onBeforeSendHeaders`-
  Lauscher ein.

## Tests

- `test/zuschauer-fenster.test.js`: `zielKanal` (jede Bedingung einzeln),
  Steuerung (Start, Kanalwechsel, Karenz laeuft ab / wird abgebrochen,
  sofortiger Stopp bei VOD/Token, kein Neustart nach Aufgeben, Neustart nach
  Kanalwechsel), `waechterEntscheidung` (ok, neu-laden nach 2, aufgeben nach 3).
- Bestehende Suite bleibt gruen (`npm test`).
- Live-Beweis (macht Janis): App mit Web-Login, Live-Kanal ~15 min laufen
  lassen, ohne Browser. Erwartet im Protokoll `zuschauer:zaehlt`, steigender
  `punkte:kontext`-Stand und mindestens ein `kiste-ok`.

## Nicht Teil dieses Baus

- Hintergrund-Sammeln bei Favoriten / mehreren Kanaelen.
- Integrity-Kopfzeilen aus dem Zuschauer-Fenster mitlesen (statt `/directory`).
- Punkte-Takt durch Hermes `points-earned` ersetzen.
