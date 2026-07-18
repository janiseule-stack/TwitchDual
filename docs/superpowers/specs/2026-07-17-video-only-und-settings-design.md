# Nur-Video-Modus + Einstellungen aufräumen (v1.6.0) — Design

Datum: 2026-07-17 · Status: von Janis abgenommen (Chat-Dialog)

Ergänzt die Glass-Transparenz-Arbeit im selben v1.6.0-Branch.

## A) Nur-Video-Modus (Video-Fenster)

**Problem:** Im hohen Hochkant-Fenster lässt Twitchs 16:9-Player oben/unten
schwarze Balken. Gewünscht: eine Ansicht, in der das Video exakt so groß wie
das Fenster ist — ohne Beschnitt.

**Lösung:** Ein Umschalt-Button ⛶ in der Video-Leiste schaltet den
Nur-Video-Modus ein:
- Leiste (`#bar`), On-Air-Leiste (`#onair-bar`), Fensterrahmen/Glow werden
  ausgeblendet → der Player (`#player`, `flex:1`) bekommt die volle
  Fensterfläche.
- Das Fenster rastet auf **16:9** ein: aktuelle Breite behalten, Höhe =
  `round(breite * 9/16)` (via `setContentSize`). Damit füllt das 16:9-Video
  das Fenster vollständig, **keine schwarzen Balken, kein Beschnitt**.
- War das Fenster maximiert, wird es vorher `unmaximize`-t.

**Kein Tastenkürzel** (stört beim Zocken). Da im Modus die Leiste weg ist:
- Ein **schwebender Schließen-Button** (`#video-exit`) oben rechts erscheint
  bei Mausbewegung und blendet sich nach ~2,5 s Ruhe aus. Klick verlässt den
  Modus.
- Zusätzlich verlässt **Doppelklick auf die Videofläche** den Modus.

**Verlassen:** Leiste/Rahmen/On-Air kommen zurück, die vor dem Einschalten
gemerkte Fenstergröße wird wiederhergestellt.

**Zustand:** reine Ansicht, nicht persistent (Neustart = Normalansicht).

**IPC:** Der bestehende `window-control`-Kanal bekommt zwei Aktionen:
`'video-only-on'` (Bounds merken + auf 16:9 setzen) und `'video-only-off'`
(gemerkte Bounds wiederherstellen). Main hält die vorherigen Bounds pro Fenster
in einer `Map<number, Rectangle>` (Key = `win.id`). Kein neuer Kanal, keine
Preload-Änderung nötig (`windowControl` existiert).

**Fehlerfälle:** `video-only-off` ohne gemerkte Bounds → no-op. Fenster
zerstört → no-op (wie bei den anderen window-control-Aktionen).

## B) Einstellungen aufräumen (Chat-⚙-Popup)

**Problem:** `#settings-pop` ist eine lange flache Liste (Zeitstempel, Badges,
Schrift, Farb-Head, 2 Color-Picker, 2 Deckkraft-Slider, Reset) — unübersichtlich.

**Lösung:** In zwei klar getrennte Abschnitte gruppieren, ohne IDs/Verhalten zu
ändern (JS-Wiring bleibt 1:1):

- **Chat**: Zeitstempel, Badges, Schrift.
- **Fenster**: Video-Farbe, Chat-Farbe, Deckkraft Video, Deckkraft Chat.
- Darunter abgetrennt der **Zurücksetzen**-Button.

Jeder Abschnitt bekommt eine dezente Überschrift (`.opt-group-title`, Stil wie
das bisherige `#opt-color-head`). Alle Zeilen einheitlich: Label links, Regler/
Feld rechtsbündig, gleichmäßige Abstände, dünne Trennlinie zwischen den Gruppen.
Der Reset-Text wird zu „Zurücksetzen" (setzt weiterhin Farben + Deckkraft).

## Tests

- Kein neuer DOM-freier Logikteil → keine neuen Unit-Tests nötig; die 116
  bestehenden bleiben grün.
- Manueller Smoke-Test: ⛶ schaltet Nur-Video (Fenster wird 16:9, Balken weg,
  Leiste weg); Maus bewegen zeigt Schließen-Button, Ruhe blendet ihn aus;
  Klick/Doppelklick verlässt und stellt die alte Größe wieder her; ⚙-Popup
  zeigt die zwei aufgeräumten Abschnitte, alle Regler wirken wie zuvor.

## Release

Teil von v1.6.0 (Version bereits gebumpt). TODO.md-Eintrag ergänzen.
