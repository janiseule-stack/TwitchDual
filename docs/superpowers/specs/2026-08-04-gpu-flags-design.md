# GPU-Beschleunigung mit Auto-Rollback (v1.9.0)

**Datum:** 2026-08-04
**Status:** Entwurf, zur Umsetzung freigegeben

## Problem

TwitchDual laeuft auf Electron-Defaults — im gesamten Code steht kein einziger
GPU-Switch (`appendSwitch`, `disableHardwareAcceleration` kommen nirgends vor).
Das Video-Fenster laedt Twitchs offiziellen Embed
(`renderer/video/index.html:266` → `embed.twitch.tv/embed/v1.js`), der intern
einen `player.twitch.tv`-iframe aufmacht. Das Dekodieren des Streams passiert
damit komplett in Chromium.

Beobachtung des Nutzers: League of Legends faellt im Late Game von 144 auf
90 FPS, waehrend im Hintergrund Chrome, TwitchDual und Spotify laufen. Die GPU
ist dabei nur zu ~6 % ausgelastet — es ist also Kopf fuer Arbeit da, die
aktuell die CPU macht.

**Ziel:** So viel Rendering- und Dekodierarbeit wie moeglich von der CPU auf die
RX 6800 XT verlagern, ohne den Glas-Chat zu zerstoeren.

## Nicht-Ziele

- Kein Einstellungs-Schalter fuer GPU-Flags (der Auto-Rollback macht ihn
  ueberfluessig, und im Fehlerfall — schwarzes Fenster — waere er unerreichbar).
- Keine Aenderung am Chat-Rendering selbst (rAF-Buendelung aus v1.8.1 bleibt).
- Keine Aenderung an der Streamqualitaet oder am Player-Verhalten.

## Bekanntes Risiko: transparentes Chat-Fenster

`main.js:102-113` erzeugt das Chat-Fenster mit `transparent: true` und
`backgroundColor: '#00000000'` — die Glas-Transparenz aus v1.7.0.

Transparente Fenster sind unter Windows die klassische Kollisionsstelle mit
aggressiven GPU-Flags. `enable-hardware-overlays` und
`disable-gpu-driver-bug-workarounds` sind eine dokumentierte Ursache fuer
schwarze oder flackernde Flaechen bei transparenten Electron-Fenstern. Der
Glaseffekt ist damit das erste, was kaputtgehen kann, und er ist ein Kernfeature.

Zusaetzlicher Kontext: Auf diesem Rechner werden parallel zwei andere
Instabilitaetsursachen verfolgt (Netzteil CV650 mit Daisy-Chain-PCIe-Kabel,
RAM auf 3200 mit gemischten Kits). Ein Freeze nach dieser Aenderung ist deshalb
nicht eindeutig zuordenbar. Das Startprotokoll (Abschnitt "Nachweis") ist genau
deswegen Pflichtbestandteil und nicht optional.

## Architektur

Neues Modul **`src/gpu-flags.js`** — reine Logik, kein Electron-Import, damit es
mit `node --test` pruefbar ist (passend zu den 19 bestehenden Testdateien).

```
src/gpu-flags.js
  ├─ SWITCHES            Liste der Chromium-Switches (Daten, kein Code)
  ├─ decideMode(state)   → 'accel' | 'safe'      (rein, testbar)
  └─ nextState(state, ereignis) → neuer Zustand  (rein, testbar)
```

`main.js` erhaelt nur den duennen Aufruf.

**Harte Reihenfolge-Einschraenkung:** `app.commandLine.appendSwitch()` wirkt nur
vor `app.whenReady()`. Der Aufruf muss deshalb auf Modulebene ganz oben in
`main.js` stehen — nicht in `createWindows()` (`main.js:85`) und nicht im
`whenReady`-Block (`main.js:468`).

## Die Flags

| Switch | Wirkung | Risiko |
|---|---|---|
| `ignore-gpu-blocklist` | erzwingt Beschleunigung, auch wenn Chromium den AMD-Treiber gesperrt hat | mittel |
| `enable-gpu-rasterization` | GPU zeichnet Layer statt CPU | gering |
| `enable-zero-copy` | Texturen ohne Kopie ueber den RAM | gering |
| `enable-hardware-overlays` | DirectComposition-Overlays fuers Video | hoch |
| `disable-gpu-driver-bug-workarounds` | schaltet AMD-Bugfixes ab | hoch |

Alle fuenf werden im Modus `accel` gesetzt. Im Modus `safe` wird keiner gesetzt
(Electron-Defaults, Hardwarebeschleunigung bleibt dabei trotzdem an — `safe`
heisst nicht `disableHardwareAcceleration`).

## Auto-Rollback

Zustand in `electron-store` unter dem Schluessel `gpuState`:

```js
{ mode: 'accel' | 'safe', pending: boolean }
```

Ablauf:

1. **Start:** `gpuState` lesen. Ist `pending` noch gesetzt, hat der vorige Start
   das Rendern nicht ueberlebt → dieser Start laeuft mit `mode: 'safe'`, und
   `safe` wird dauerhaft gespeichert.
2. Andernfalls `pending = true` schreiben und die Flags anwenden.
3. **Video-Fenster rendert erfolgreich:** `did-frame-finish-load` auf
   `videoWin.webContents`, danach 20 s stabil → `pending = false`.
4. **Sofortiger Abbruch:** `app.on('child-process-gone')` mit `type === 'GPU'`
   sowie `render-process-gone` setzen `mode: 'safe'` unmittelbar.

**Offengelegte Grenze:** Das erkennt Abstuerze und Einfrieren zuverlaessig. Es
erkennt *nicht* den Fall "Fenster rendert, sieht aber falsch aus" — ein
flackernder oder milchiger Chat laeuft technisch sauber durch und loescht die
Marke. Dafuer gibt es den manuellen Not-Aus:

- **`TWITCHDUAL_NO_GPU=1`** als Umgebungsvariable erzwingt `safe`, unabhaengig
  vom gespeicherten Zustand.

## Nachweis, dass es wirkt

Beim Start wird `app.getGPUFeatureStatus()` ueber die bestehende Log-Funktion
protokolliert. Entscheidend ist das Feld `video_decode`:

- `enabled_on` → die GPU dekodiert den Twitch-Stream.
- `software_only` / `disabled_software` → weiterhin CPU, die Flags haben das
  eigentliche Ziel verfehlt.

Ohne dieses Protokoll ist jede Aussage ueber den Effekt geraten.

## Messphase (nach der Umsetzung)

Der Nutzer will zuerst alles aktivieren und danach auf das reduzieren, was
wirklich etwas bringt. Vorgehen:

1. **Basiswert:** TwitchDual mit `TWITCHDUAL_NO_GPU=1` starten, zwei Streams
   laden, CPU-Last aller TwitchDual-Prozesse ueber 5 Minuten im Task-Manager
   ablesen und notieren.
2. **Vollausbau:** normal starten (alle Flags), gleiche Messung, plus
   `video_decode` aus dem Log.
3. **Vergleich:** Bringt Schritt 2 keine messbare CPU-Senkung, sind die Flags
   wirkungslos und die riskanten beiden fliegen wieder raus.
4. **Zurueckschneiden:** Bei messbarem Gewinn `enable-hardware-overlays` und
   `disable-gpu-driver-bug-workarounds` einzeln entfernen und nachmessen. Was
   keinen Unterschied macht, bleibt draussen — sie tragen das hoechste Risiko.
5. **Eigentliches Ziel pruefen:** League-Match ab Minute 25 spielen und die FPS
   beobachten. Das ist das Kriterium, das zaehlt; die CPU-Messung ist nur der
   Zwischenschritt.

## Tests

Neu: `test/gpu-flags.test.js`, reine Funktionen, kein Electron noetig.

- `SWITCHES` enthaelt genau die fuenf dokumentierten Switches.
- `decideMode`: `{mode:'accel', pending:false}` → `accel`;
  `{mode:'accel', pending:true}` → `safe`; `{mode:'safe', …}` → `safe`;
  leerer/fehlender Zustand → `accel` (Erststart).
- `nextState` ist idempotent: zweimal dasselbe Ereignis ergibt denselben Zustand.
- `TWITCHDUAL_NO_GPU=1` ueberschreibt jeden gespeicherten Zustand.

Die bestehende Suite muss vor und nach der Aenderung gruen sein.

## Release

1. `version` in `package.json` auf **1.9.0**.
2. `docs/TODO.md` um den Abschnitt ergaenzen.
3. Release nach dem in `docs/TODO.md` dokumentierten 4-Schritte-Weg.
