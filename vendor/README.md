# vendor/vaft.js

Fremdcode: Twitch-Adblock-Skript **vaft** aus dem gepflegten Fork
https://github.com/ryanbr/TwitchAdSolutions (Ordner `vaft/`).

- **Bezogen am:** 2026-07-02
- **Version/Tag:** v68.4.0 (Commit-SHA `6f7f110eb1a8134ae200fcaceeaad999be03d5d8`, 2026-06-06)
- **Quelle:** https://raw.githubusercontent.com/ryanbr/TwitchAdSolutions/master/vaft/vaft.user.js
- **Lizenz:** siehe Kopf der Datei / Upstream-Repo.

## Warum gepinnt?
Kein Laufzeit-Download (Remote-Code-Risiko). Die Datei wird unverändert
per Preload in den `player.twitch.tv`-iframe injiziert (siehe `preload.js`).

## Aktualisieren
1. Neue `vaft.user.js` aus dem Fork holen, hier als `vaft.js` ersetzen.
2. Datum/Version oben aktualisieren.
3. Smoke-Test: Live-Channel mit Werbung laden, prüfen dass Werbung
   übersprungen/überbrückt wird und der Chat-Sync weiter läuft.
4. Als normales App-Release (Version bump) ausliefern.
