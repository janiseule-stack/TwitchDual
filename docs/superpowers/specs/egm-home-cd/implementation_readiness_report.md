# EGM Stufe 9 – Implementation Readiness – Plan Home als CD-Bühne

Geprüft: `docs/superpowers/plans/2026-11-09-home-cd.md` (erste Fassung).
Prüfer: egm-implementation-readiness, egm-codebase-details, egm-style (frisch).
Urteil aller drei: Tasks 1–5 umsetzungsreif, Tasks 6–9 nicht.

| # | Schwere | Kern | Umgang (Plan-Fassung 2) |
|---|---|---|---|
| 1 | Blocker | `neon-dual/theme.css` gibt es nicht, wird nie geladen (`theme-runtime.js:104`) | Neon-Motiv als Grundregel in `home.css` |
| 2 | Blocker | Sticker der alten CD wird beim Wechsel nicht entfernt | Task 7: Sticker bei jedem Wechsel sofort leeren |
| 3 | Blocker | Review-Focus 5 nicht echt geprüft; `window.onerror`-Zähler existiert nicht | Log über `--enable-logging` + Probe-Fehler zum Nachweis |
| 4 | Major | `aktualisieren` mit gefilterter Liste würfe Nicht-Treffer raus | Reihe immer `nadel: ''`; Suche nur über `filter()` |
| 5 | Major | „nach erster Ladung“ unklar (`geladen` bleibt true) | Merker `oeffnenAusstehend` |
| 6 | Major | Offline-Ansicht (Rücken-Klick) nicht modelliert | `offlineAnsicht` in `home.js`, `modus` live/markiert/offline |
| 7 | Major | `filter`/`blaettern`-Randfälle offen | genau festgelegt + Tests |
| 8 | Major | „Suche läuft“ undefiniert (Entprellung, Promise) | `laufendeSuche` sofort gesetzt, Erfüllungsfälle, `Promise.race` 1500 ms |
| 9 | Major | `enterZiel`-Schritt 3 Reihenfolge, Normalisierung, VOD-Erkennung | fertiges `exakt` vor „warten“; eigene `normalisiere`; eigene VOD-Regex; roh vs. Login festgelegt |
| 10 | Major | `besterTreffer` Felder/Ränge | Login + displayName für Rang 0–2, klein |
| 11 | Major | Kanalpunkte: „gesperrt“, „ohne Anmeldung“, `balance null` | `gesperrt`-Flag, `darf()`, kein Sticker bei null |
| 12 | Major | `PointsIcon` nicht im Video-Fenster; Akzent + SVG offen | Script ergänzt; Akzent aus `--accent`; SVG wie Chat |
| 13 | Major | Script-Reihenfolge unvollständig | volle Zielliste |
| 14 | Major | Globale Namen kollidieren bei normalen Scripts | IIFE/UMD-Pflicht |
| 15 | Major | Stapel-Regel `index.html:185` überstimmt `#home-namen` | Regel angepasst |
| 16 | Major | Markup/`#home-kanaele`/Suchzeile offen | vollständiges Ziel-Markup |
| 17 | Major | Esc in alter VOD-Ansicht fiele weg; doppelter Handler | Esc-Reihenfolge inkl. VOD-Ansicht, Handler ersetzt |
| 18 | Major | Laufzeit doppelt gebaut | `StreamInfo.laufzeit` wiederverwendet |
| 19 | Major | Handler-/Stand-Typen der DOM-Datei offen | Typen festgelegt |
| 20 | Major | Mess-Werkzeug/Kriterium Task 9 offen; Spion auf `contextBridge`-Objekt geht nicht | rAF-Messung per `cdp-eval`, Kriterium ≤ 2; Prüfung über `player.getChannel()` |
| 21 | Major | `mapLiveUser`-Tests in falscher Datei | `test/browse-map.test.js` |
| 22 | Nit | Version/Release unklar, Aufräumen Theme-CSS, `previewUrl`, `zu:`, Richtungen, Rad-Testzahlen, `createRad` ohne `= {}`, Motiv-Formulierung, Kanal-Objekt | alle festgelegt |
