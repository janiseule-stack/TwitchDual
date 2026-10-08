# Wald gezeichnet: 8 Varianten

Stand: 2026-10-08 · Branch `feat/wald-gezeichnet` · Ablauf wie Koi/Sakura
("zuerst in TwitchDual einbauen, dann anschauen und nachschaerfen").

## Auswahl (Brainstorm-Browser, Janis)

- Grundstile: **Aquarell-Daemmerung, Lofi-Nacht, Tusche, Bleiglas, Pixel**
  (Holzschnitt abgewaehlt).
- Wald-eigene: **Leuchtpilze, Lichtstrahlen (Komorebi), Waldhuette**
  (Waldsee abgewaehlt).
- Vorlage der Optik: `.superpowers/brainstorm/29-1791458690/content/wald-{varianten,eigene}.html`.

## Welt (`renderer/themes/wald/welt.js`)

- Gluehwuermchen schwirren und pulsieren (Farbe = `farben.partikel`).
  Maus lockt sie an, sie kreisen um den Zeiger (Radius ~140 px * Skala).
  Klick ins Leere: alle im Umkreis blitzen auf und stieben auseinander,
  dazu ein Funkenkranz.
- Variante bringt Extras ueber `stile.js` (`unter`/`ueber`/`klick`/`ereignis`):
  Leuchtpilze (heller bei Mausnaehe, Sporen steigen auf statt zu schwirren),
  Lichtstrahlen (Strahlen + segelnde Blaetter, Klick = Windstoss; Partikel
  sind Staub statt Gluehwuermchen), Waldhuette (Fenster flackert, Rauch).
- Hoechstens 30 Bilder/s, Hintergrund nur bei Groessenwechsel (200 ms Ruhe).
  Pixel: Hintergrund klein bauen, ohne Glaettung hochskalieren.

## Ereignisse

- **Kiste:** Schwarm stroemt aus dem Punkte-Chip, leuchtender Wirbel darueber
  (+ Pilze flammen auf / Huette pafft).
- **Punkte:** ein paar Gluehwuermchen steigen vom Chip auf.
- **Abo:** Lichtkranz aus Gluehwuermchen kreist um das Namenskaertchen (4,5 s).
- **Raid:** grosser Schwarm zieht als Band durchs Bild, Kaertchen gleitet mit,
  haelt rechts, blendet aus (wie Sakura-Hanafubuki).
- **Gast:** Schwarm schwebt einmal von links oder rechts uebers Video
  (eigene Leinwand auf der Gast-Ebene, endet von selbst).
- Im Chat laufen Ereignisse auf der `vorn`-Leinwand (ueber den Leisten).

## Katalog / CSS

- `themes.js`: Wald nicht mehr `ausgeblendet`, `varianten` in der Reihenfolge
  aquarell, lofi, tusche, bleiglas, pixel, pilze, licht, huette; Theme-Farben
  = erste Variante. Hell: aquarell, tusche, licht.
- `theme.css`: Variablen je Variante (wie Sakura), gemeinsame Regeln; die alte
  Waldhuetten-DOM-Deko und Holz-Kaesten entfallen.

## Tests

- `test/themes.test.js`: Wald-Varianten (ids, Farbformat, Theme-Farben =
  erste Variante), Galerie zeigt neon-dual, sakura, wald, koi.
- `test/welten.test.js`: je Variante start bei 0x0, zeichnet bei Groesse,
  Maus/Klick/alle Ereignisse ohne Fehler, Partikelfarbe benutzt, Anzahl
  bleibt begrenzt; Gast endet von selbst in allen Varianten.
- Optik prueft Janis in der App.
