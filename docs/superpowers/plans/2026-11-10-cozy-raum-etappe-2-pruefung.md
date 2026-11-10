# Goldfisch-Prüfung Plan Etappe 2 (11.11.2026)

## Prüfer 1: Umsetzbarkeit

Beispiel-Tests nachgerechnet: alle stimmen.

1. **kritisch** – Vordere Hülle „doppelte Größe“ = 80×80 passt nicht ins Bücherfach (52 hoch, Bild 192 hoch). Größe und Lage von Hülle, Platte, Zettel als Koordinaten festlegen.
2. **wichtig** – `kameraZiel` muss ganzzahlig enden: `faktor = ceil(max(W/b, H/h))`, x/y gerundet; Test auf genaue Werte (1400×800 → 52, −10714, −3292).
3. **wichtig** – Laufwerk-Tests nur Kommentare; ausschreiben: (a) überspringen → noch nicht fertig → geladen(true) → cb(true) einmal; (b) geladen → überspringen → fertig; (c) überspringen → geladen(false) → cb(false); (d) ohne Lauf/doppelt wirft nicht; (e) alter Timer ruft cb nicht doppelt.
4. **wichtig** – Task 3 prüft `kameraZiel`, das erst Task 5 braucht. Prüfung nach Task 5; Task 3: `zeigeAblauf` blendet nur ein + Überspringen-Klick, `setzeTv` zeigt nur Aus-Fläche.
5. **wichtig** – TV_ECKEN: Algorithmus offen; `setTransform` kann nur Parallelogramme. Festlegen: Extrempunkte von x+y / x−y, Pixelkanten, JSON-Ausgabe; affine Abbildung aus 3 Ecken, Maske beschneidet. Test: Ecken im grünen Rechteck.
6. **wichtig** – Zuschnitte für zettel/schild fehlen; `huelle.png` wird überschrieben (ausdrücklich nennen); Test soll auch Inhalt prüfen (kein Grün mehr, Hüllen-Fenster durchsichtig, Maske = Grün-Pixelzahl).
7. **wichtig** – „läuft etwas“: fest `window.laeuftEtwas = () => infoQuelle !== null` in video.js.
8. **wichtig** – Schließen-Wege-Test braucht ein zählbares Muster (`closeHome(`-Stellen).
9. **klein** – `treffer` halboffen [x, x+b), Randtest 164/165; `zuBild` mit floor.
10. **klein** – `fachFenster`: Klemmung `max(0, anzahl − sichtbar)`, Fälle anzahl 0 und Index ≥ anzahl.
11. **klein** – „nutzbare Fläche“ = `#home.clientWidth/clientHeight`.
12. **klein** – Mausrad: Darstellung blättert selbst (ohne Auswahl zu ändern), Start je Fach als interner Zustand von HomeRaumDom.

## Prüfer 2: Code-Fakten

Namen, IDs, Handler, `saveThemePrefs` (preload.js:77), `--schrift-pixel`, `data-animationen` bestätigt.

1. **kritisch** – `buildVodCard` ruft direkt `submitLoad(v.id); closeHome();` (home.js:501-504) = dritte direkte Schließ-Stelle; `closeHomeResume` hat frühen Ausstieg ohne Benachrichtigung (home.js:117).
2. **wichtig** – keine globale „läuft etwas“-Funktion; `body.onair` (video.js:373), `let infoQuelle` (video.js:388). Fest `window.laeuftEtwas` ergänzen.
3. **wichtig** – Fernseher-Vorschau braucht den Login des laufenden Kanals → Auskunft liefert `{ mode, login }`.
4. **klein** – `createLaufwerk` hat schon `abbrechen()` (home-buehne.js:238); Schnittstelle vollständig nennen.
5. **wichtig** – `huelle.png` existiert (≈64×64) und würde überschritten.
6. **klein** – `platte.png` als Quelle von `platte-klein.png` nennen; Maßtest auch für `raum.png`/`regal.png`.
7. **klein** – Zuschnitte für `zettel-schild.png` fehlen.
8. **klein** – Python+Pillow als Voraussetzung nennen; PNGs werden committet, `npm test` braucht kein Python.
9. **klein** – Testzahl 606 nicht bestätigt, vor Task 1 messen.
10. **klein** – Gradient-Test auch auf verkleinerte `home.css`.
11. **wichtig** – `index.html` hat weitere CD-IDs (`#home-namen`, `#home-buehne`, `#cd-huelle`, `#cd-info`, `#home-staender`); `#cd-info` im ResizeObserver (home.js:349); Rolle von `#home-kanaele` (Refresh hängt an Sichtbarkeit, home.js:97) klären; grep-Muster erweitern.
12. **wichtig** – `#home-head` entfällt, aber `#home-close`, `#home-back`, `#home-title` werden benutzt; IDs behalten, Titel in die Tafel.
13. **klein** – Ziel je Aufrufer: Start + Home-Knopf → Raum, Strg+L/Infos → Regal.
14. **klein** – VOD-Link per Enter ohne Kanal: kein Ablauf, `onLoad` schließt sofort (so festhalten).
15. **klein** – Esc-Kette und ↑/↓-Sperre über `tafelOffen()`.

## Entscheidungen (Claude, 11.11.2026)

Alle technischen Funde werden in den Plan übernommen (Abschnitt „Nach der Prüfung“). Optik-Fund P1-1: vordere Hülle bleibt 1× (40×40), weil das Bücherfach nur 52 hoch ist; Janis beurteilt das beim Anschauen.
