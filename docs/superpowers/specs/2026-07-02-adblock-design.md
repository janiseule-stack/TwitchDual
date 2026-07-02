# Design: Werbe-Blocker (vaft + Overlay-Fallback) — v1.2.0

**Datum:** 2026-07-02
**Status:** vom Nutzer freigegeben (Ansatz A + C kombiniert)

## Problem

Twitch fügt Werbung serverseitig (SSAI) direkt in den HLS-Videostream ein.
TwitchDual zeigt den offiziellen Embed-Player (iframe zu `player.twitch.tv`),
daher greift klassisches Domain-Blocking nicht: Die Werbe-Segmente kommen aus
derselben Quelle wie der Stream.

## Lösung (Überblick)

Zweistufig:

1. **vaft-Injektion (primär):** Das aktiv gepflegte vaft-Skript
   (Fork https://github.com/ryanbr/TwitchAdSolutions, gepinnte Kopie im Repo)
   wird per Electron-Preload in den Player-iframe injiziert, bevor der
   Twitch-Player startet. vaft hookt den Player-Worker, erkennt Werbe-Segmente
   in der M3U8-Playlist und wechselt auf eine werbefreie Playlist eines
   anderen Player-Typs (popout/embed/autoplay); als Fallback strippt es
   Werbe-Segmente (kurze Pause statt Werbung).
2. **Overlay + Mute (Fallback):** Kommt trotzdem Werbung durch (vaft-Strip-
   Pause oder Twitch-Änderung), blendet das Video-Fenster ein Overlay
   „Werbung wird überbrückt …" ein und schaltet den Player stumm. Bei
   Werbe-Ende: Overlay weg, vorheriger Mute-Zustand wiederhergestellt.

Rechtliche Einordnung: Adblocking ist für Privatnutzer in Deutschland legal
(BGH 2018, Adblock Plus). Es berührt Twitchs Nutzungsbedingungen (Grauzone);
die App nutzt keinen Twitch-Login, es besteht kein Account-Risiko. Private
Nutzung (Janis + Bruder), keine öffentliche Bewerbung des Features.

## Komponenten

| Komponente | Änderung |
|---|---|
| `vendor/vaft.js` | **Neu.** Gepinnte Kopie des vaft-Skripts aus dem ryanbr-Fork. Kein Nachladen aus dem Netz zur Laufzeit. Update-Prozedur in `docs/TODO.md`: neue Version holen → Smoke-Test → App-Release. |
| `preload.js` | **Erweitert.** Läuft künftig auch in Subframes des Video-Fensters. Erkennt per `location.host`, ob es im `player.twitch.tv`-iframe läuft: dort `vendor/vaft.js` per `webFrame.executeJavaScript` in die Main World injizieren (vor Player-Start) und Werbe-Status-Meldungen (`window.postMessage` aus der Seite) per IPC an Main weiterleiten. Im Hauptframe unverändert die `twitchDual`-Bridge. |
| `main.js` | **Erweitert.** `nodeIntegrationInSubFrames: true` für das Video-Fenster (nur dort). IPC-Relay `adblock-state` → Video-Fenster. Neue Einstellung `adblockEnabled` (Default `true`) in electron-store, IPC get/set. Bei `adblockEnabled: false` keine Injektion — Verhalten exakt wie v1.1.0. |
| `renderer/lib/ad-overlay-state.js` | **Neu.** DOM-freie Zustandsmaschine für den Fallback: Eingaben `adStart`/`adEnd`/`tick`, Ausgaben `overlayVisible`/`shouldMute`/`restoreMuted`. Watchdog: ohne `adEnd` wird nach max. 120 s automatisch aufgeräumt. Unit-getestet. |
| `renderer/video/video.js` + `index.html` | **Erweitert.** Overlay-Element über dem Player („Werbung wird überbrückt …"), Anbindung der Zustandsmaschine an `player.setMuted()`/`getMuted()`. Adblock-Schalter in der UI (an/aus, persistent), damit der Blocker ohne App-Update deaktivierbar ist. |

## Datenfluss

```
vaft (iframe, Main World)
  └─ window.postMessage({source:'twitchdual-adblock', phase:'start'|'end'})
       └─ preload.js (iframe, Isolated World): ipcRenderer.send('adblock-state', …)
            └─ main.js: Relay an videoWin.webContents
                 └─ video.js: Zustandsmaschine → Overlay + setMuted()
```

vaft meldet Werbe-Start/-Ende über einen kleinen, von uns ergänzten Hook
(Wrapper um vafts Ad-Erkennung bzw. Beobachtung der von vaft gesetzten
Signale). Der Wrapper lebt in unserem Injektionscode, nicht im Vendor-File —
Vendor-File bleibt unverändert austauschbar.

## Fehlerbehandlung

- **Injektion schlägt fehl** (Twitch-Umbau, Skriptfehler): try/catch um die
  gesamte Injektion; App läuft normal weiter (mit Werbung), Fehler wird nur
  in die Konsole geloggt. Niemals ein kaputter Player.
- **`adEnd` bleibt aus:** Watchdog in der Zustandsmaschine entfernt Overlay
  und Mute nach spätestens 120 s. Kein dauerhaft schwarzer/stummer Player.
- **Mute-Wiederherstellung:** Vor dem Auto-Mute wird der aktuelle
  Mute-Zustand gemerkt und bei `adEnd`/Watchdog wiederhergestellt.
- **Schalter aus:** keinerlei Injektion, kein Overlay — Verhalten wie v1.1.0.

## Tests

- `npm test` (aktuell 59 Tests, `node --test`) bleibt vor und nach jeder
  Änderung grün; Tests bleiben datenstand-unabhängig.
- **Neu:** Unit-Tests für `renderer/lib/ad-overlay-state.js` (Start/Ende,
  Watchdog-Timeout, Mute-Restore, doppelte Events) und für den
  Settings-Default (`adblockEnabled: true`).
- vaft selbst (Fremdcode) wird nicht unit-getestet, sondern per manuellem
  Smoke-Test verifiziert: Live-Channel mit Werbung laden, prüfen dass
  (a) Werbung übersprungen oder überbrückt wird, (b) Chat-Sync
  (`getCurrentTime`) weiter funktioniert, (c) Schalter aus = Originalverhalten.

## Release

v1.2.0 über den bestehenden Ablauf (`docs/TODO.md`): Version bumpen,
`npm run dist`, GitHub-Release mit `TwitchDual-Setup-1.2.0.exe` + Blockmap +
`latest.yml`. Auto-Update verteilt es an den Bruder.

## Bewusst nicht enthalten (YAGNI)

- Kein eigener HLS-Player (würde Chat-Sync und Player-Features kosten).
- Kein Proxy-Ansatz (fremde Server: Privacy, Ausfälle, Latenz).
- Kein automatisches Nachladen/Aktualisieren von vaft aus dem Netz
  (Remote-Code-Risiko); Updates kommen als normale App-Releases.
