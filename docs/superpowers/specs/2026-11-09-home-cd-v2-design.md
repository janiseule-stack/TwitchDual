# Home als CD-Bühne, Runde 2 – Design

Stand: 09.11.2026 · Branch `feat/home-cd` (auf `8e52d65`). Vorgänger:
[2026-11-09-home-cd-design.md](2026-11-09-home-cd-design.md) gilt weiter, soweit hier nichts anderes
steht. Entwürfe: `.superpowers/brainstorm/1320-1794263770/content/`.

## Warum
Janis' Feedback zur ersten Fassung: (1) Namen zu schnell, gewählter Name nicht erkennbar;
(2) **keine Übersicht**, wer live ist – nur eine Person sichtbar; (3) Alben sehen nicht wie Alben
aus, zugeschnittene Stream-Bilder ergeben keinen Sinn; (4) VODs ohne Vorschaubilder, unschön;
(5) Theme-Motiv auf der CD ergibt keinen Sinn; (6) Profilbild gehört auf die CD, die CD wird dafür
geflippt; (7) beim Abspielen soll die CD in ein Laufwerk mit kurzem gespieltem Ladebildschirm.

**Erfolg:** Wer live ist, sieht man ohne Blättern; die gewählte CD wirkt wie ein echtes Album;
Abspielen fühlt sich wie „Disc einlegen“ an.

## Von Janis entschieden

| Punkt | Entscheidung |
|---|---|
| Aufbau | **CD-Ständer**: unten alle Live-Alben schräg nebeneinander (roter Live-Punkt), am Ende ausgegraut die Offline-Favoriten; die gewählte ist oben herausgezogen und groß; Mausrad blättert. |
| Album | **Echte CD-Hülle**: klare Plastikhülle, dunkles Scharnier links, Glanzstreifen, Booklet als Cover. |
| Cover | Profilbild als Foto, Kanalname als Album-Titel, Spiel klein darüber; beim Drüberfahren blendet das Stream-Vorschaubild (16:9, nicht zugeschnitten) ein. |
| CD | realistisch silbern, feine Rillen, Regenbogen nur auf dem spiegelnden Ring; **Profilbild als rundes Label**; Theme-Motiv entfällt; CD flippt, um das Label zu zeigen. |
| Laufwerk | **PC-Laufwerk**: Schublade fährt aus, CD legt sich rein, Schublade zu, LED orange; dann Terminal-Ladebildschirm „Lese Disc … KANALNAME.ISO“ mit Balken. |
| VODs | **Rückseite der Hülle**: Hülle dreht sich um und wird größer; gedrucktes Inlay mit großem Titel und 2×2 großen Vorschaubildern (Länge, nummerierter Titel, Datum, Aufrufe); Seiten blättern. |
| Namen | ~3× langsamer (Runde ~3–4,5 min); gewählter Name als eigene Zeile direkt hinter der CD, Akzentfarbe, Leuchten, ~doppelt so deckend. |

## Verhalten
- **Ständer:** Live-Kanäle in CD-Reihenfolge, Lücke, Offline-Favoriten grau. Ersetzt Regal-Rücken
  und Nachbar-Cover. Seitlich scrollbar bei Überlauf, gewähltes Album scrollt in Sicht. Klick
  wählt; Offline-Album → Offline-Ansicht (graue stehende CD, Rückseite mit VODs) wie bisher.
- **Suche:** Ständer zeigt nur Treffer (Live, dann Offline, dann „Auf Twitch“); Enter-Reihenfolge
  unverändert.
- **Mausrad/↑↓** über Bühne und Ständer blättert (gleiche Regeln wie bisher).
- **CD-Flip:** Beim Herausfahren zeigt die CD die silberne Seite, flippt einmal (`rotateY`) auf die
  Label-Seite, dreht sich dann weiter.
- **Abspielen:** ▶/Cover/Enter → Laufwerk-Sequenz (~1,5 s) über der Bühne; `submitLoad` startet
  gleichzeitig; Home schließt, wenn Sequenz *und* Laden fertig sind; Fehler → Abbruch + Hinweis.
  Effekte „Aus“ → keine Sequenz.
- **VODs:** Hülle dreht sich um und wächst; 4 VODs je Seite (‹ ›), große Bilder.
- **Restpunkte:** Namensbänder nur bei echtem Theme-Wechsel neu bauen (nicht bei Vorschau);
  Kanalpunkte-Generationszähler gegen Antworten des alten Kontos.

## Technik (Claudes Wahl)
- Ständer-Inhalt und Lade-Sequenz als reine, getestete Logik; DOM in `home-buehne-dom.js`.
- Profilbilder größer anfordern (`profileImageURL(width:300)` statt 70) – im ersten Schritt prüfen.
- Masken-SVGs `cd-motiv.svg` und ihre CSS-Regeln entfernen.

## Abnahme
`npm test` grün; Leistung wie zuvor (≤ 2 Frames über 33 ms in 10 s, Sakura/viel, Stream läuft);
Janis schaut an.
