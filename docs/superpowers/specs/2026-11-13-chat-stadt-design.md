# Chat-Hintergrund „Regennacht-Stadt“ – Entwurf

Stand: 13.11.2026, Branch `feat/cozy-raum`. Betrifft das Chat-Fenster
(`renderer/chat/`), die Leben-Bausteine (`renderer/lib/raum-leben.js`,
`renderer/lib/raum-leben-dom.js`) und neue PixelLab-Bilder unter `renderer/themes/cozy/`.

## Warum

Janis (11.11. und 13.11.2026): Das flache Braun hinter den Chat-Nachrichten wirkt neben
dem Pixel-Streifen oben langweilig, Chat- und Video-Fenster verschwimmen. Der Chat soll
„zum Streifen oben und zum Raum passen – ist ja alles ein Vibe, Style, Atmosphäre,
Feeling“. Gewählt (Richtung 3 von 4): **Blick durchs Fenster nach draußen**. „Ich liebe
halt Regen und Gewitter, wenn's drinnen cozy ist – das haben wir bis jetzt auch überall.“

## Was Janis will (13.11.2026, so gesagt bzw. bestätigt)

1. Hinter den Chat-Nachrichten liegt der **Blick aus dem Fenster auf eine Stadt bei
   Nacht**: Regen (auch am Glas), ab und zu **Gewitter** (Blitz erhellt kurz die Szene).
2. Der **Streifen oben bleibt** (Fenster, Katze, Lampe; „drinnen“).
3. **Leben draußen wie in einer echten Stadt: „immer bisschen was“**, z. B. Leute mit
   Schirmen, die vorbeilaufen, „mehr solche Dinge sind auch cool“ (Ideenliste folgt aus
   der EGM-Ideen-Prüfung, Janis wählt).
4. **Raids** spielen **unten in der Stadt** (Leute mit Schirmen, mehr je größer der Raid).
   Die **Kanalpunkte-Kiste (Katze bringt Münze) bleibt oben im Streifen**.
5. Bilder aus **PixelLab**, Janis wählt Varianten (feste Regel: Code zeichnet keine
   Grafik, nur zuschneiden/skalieren/ausstanzen/einfärben/bewegen).

## Ziele

- Ruhige, dunkle Nacht-Stadt hinter dem Chat, die zum Raum passt (gleiche Palette:
  „warm limited color palette (amber, brown, muted green, soft cream)“, draußen kühler
  Nachtton mit warmen Fensterlichtern).
- Ständiges, unaufdringliches Leben (Regen, Lichter, Passanten, kleine Szenen).
- Gewitter: seltene, kurze Blitze.
- Raid als Stadt-Szene.

## Nicht-Ziele

- Kein Ton (kein Donner).
- Keine Änderung an Chat-Funktionen (Nachrichten, Eingabe, Emotes, Umfragen …).
- Video-Fenster und Home bleiben, wie sie sind.

## Anti-Ziele (Fehlschlag, auch wenn es technisch läuft)

- Chat schlechter lesbar als heute (helle Flächen hinter Text, grelle Blitze, Unruhe
  direkt hinter den Zeilen).
- Hektik: ständige große Bewegung, die vom Chat ablenkt.
- Code-gezeichnete Grafik statt PixelLab-Bildern.
- Sieht in anderen Fenstergrößen kaputt aus (gestreckt, Lücken, abgeschnittene Szenen).

## Wie (entschieden bzw. Vorschlag des Hauptchats)

- **Aufbau (Vorschlag):** Hintergrund des Nachrichtenbereichs = Stadtbild (PixelLab,
  Pixel-Art, `image-rendering: pixelated`), skaliert wie Streifen und Raum (deckend, nicht
  ganzzahlig erlaubt). Ebenen von hinten nach vorn: Himmel/Skyline, Häuser mit Fenstern,
  Straße unten (dort laufen Leute), Regen davor, Glas mit Tropfen ganz vorn, ggf. ein
  dezenter dunkler Schleier für Lesbarkeit (nur Abdunkeln = Einfärben, erlaubt).
- **Lesbarkeit:** Text bleibt wie heute (helle Schrift). Der Bereich hinter den Zeilen
  bleibt dunkel; viel Bewegung eher unten (Straße) und oben (Himmel/Blitz). Blitz =
  kurzes Aufhellen der Szene (Helligkeit/Deckkraft, ggf. PixelLab-„Blitz“-Variante des
  Bildes), selten (Größenordnung alle 30–90 s), höchstens ca. 300 ms.
- **Leben:** wie die bestehenden Leben-Bausteine (Bildstreifen per `steps()`, zufällige
  Pausen; `raum-leben.js`/`raum-leben-dom.js`). Passanten als PixelLab-Figuren, die über
  die Straße gehen (wie die Raid-Figuren heute). Mehrere Dinge gleichzeitig erlaubt, aber
  ruhig.
- **Raid:** heutiger Raid-Effekt (`RaumLeben.RAID`, `schirmAnzahl`, Figuren laufen von
  links nach rechts) wandert vom Streifen auf die Straße der Stadt. Größe der Gruppe nach
  Raid-Größe wie heute (1–9 / ab 10 / ab 50 / ab 200). Warteschlange/Abspieler
  (`RaumLeben.abspieler`) bleiben.
- **Kiste:** bleibt oben im Streifen wie heute.
- **Animationen aus:** alles steht still, Warteschlange wie heute.
- **Deckkraft-Einstellung (`chatAlpha`):** entfällt (Janis 13.11., siehe unten).

## Festlegungen des Hauptchats (nach der Bauenden-Prüfung, Janis prüft beim Lesen)

- **Hohes Bild aus PixelLab-Stücken:** Das Chat-Fenster ist fast quadratisch oder hoch
  (z. B. 1397×1332), PixelLab liefert höchstens 344×192 (≈ 1,8:1). Die Stadt wird deshalb
  aus PixelLab-Stücken nach oben (Himmel) und unten (Straße) erweitert (`inpaint`, je
  ≤ 256 px, wie Regal-Wand und Holzwand); Code setzt die Stücke nur pixelgleich zusammen
  (wie `regal-basis.png`). Varianten werden Janis gleich im hohen Format gezeigt.
- **Steht fest, scrollt nicht mit:** Die Stadt liegt fest hinter der Nachrichtenliste
  (vom Streifen oben bis zur Eingabeleiste unten); die Straße liegt direkt über der
  Eingabeleiste, damit Passanten und Raids sichtbar sind.
- **Figuren neu im Maßstab der Straße:** Passanten und Raid-Gruppen sind neue
  PixelLab-Figuren (dieselben für beide), Janis wählt Varianten. Schritte und Dauer des
  Raids werden aus der Straßenbreite neu gerechnet; Gruppengrößen bleiben (1–9 / ab 10 /
  ab 50 / ab 200).

## Janis' Wahl aus der Ideen-Prüfung (13.11.2026)

EGM-Ideen-Prüfung (Ideen-Katalysator) hat 23 Ideen geliefert; Janis nimmt die Empfehlung:

1. **Fensterlichter** gehen einzeln langsam an und aus (alle paar Minuten eins); Quelle:
   Fassade + beleuchtete Variante aus PixelLab, Fenster daraus ausgestanzt.
2. **Echte Uhrzeit:** abends viele Fenster hell, nachts (z. B. 3 Uhr) nur wenige.
3. **Passanten mit Schirm**, einzeln (dieselben Figuren wie beim Raid).
4. **Auto oder Lieferrad** mit Scheinwerfern, Spiegelung auf der nassen Straße
   (gespiegelt + abgedunkelt).
5. **Abo/Geschenk:** ein Fenster geht warm an und bleibt den Abend über an (Geschenk mit
   n Abos: n Fenster nacheinander).
6. **Raid gestaffelt:** 1 Schirm → Gruppe → Bus hält und lässt Schirme aussteigen
   (große Raids) → ab 200 Bus plus Menge.
7. **Blitz nur im Himmel** über der Skyline, Häuser bleiben dunkle Silhouetten.
8. **Helligkeit hinter dem Text bleibt gleich:** während eines Blitzes dunkelt die
   Fläche hinter dem Text entsprechend stärker ab (per Abdunkeln der PixelLab-Ebenen,
   kein Code-Verlauf).
9. **Gewitter in Phasen:** lange nur Regen, dann ein paar Minuten Gewitter, dann zieht
   es ab (statt Zufallsblitz alle 30–90 s).

Weitere Festlegungen von Janis:

- **Straßenband: ja.** Ein schmales, festes Band zwischen Nachrichten und Eingabefeld,
  auf dem kein Text liegt; dort laufen Passanten, Autos und Raids.
- **Durchsichtiger Chat entfällt** („see-through Chat kann auch weg“): Die Einstellung
  Deckkraft (`chatAlpha`, ⚙ im Chat) wird entfernt; die Stadt ist immer deckend.

Hinweise aus der Prüfung, die gelten: Pixel-Maßstab wie im Streifen oben; ein zentraler
„Stadt-Regisseur“ verteilt Bewegung (im mittleren Bereich höchstens 1 bewegtes Ding,
insgesamt wenige, mit Pausen); Raid-Dauer aus der Straßenbreite rechnen (heute an
`GLAS.b` gebunden); bei „Animationen aus“ schalten bleibende Zustände (Abo-Fenster,
Uhrzeit-Lichter) hart um statt einzublenden; Blitze nie über die ganze Fläche, höchstens
einer alle paar Sekunden, bei „Animationen aus“ keiner.

## Offen (Janis entscheidet beim Anschauen der Varianten)

- Welche Stadt-Variante (PixelLab, 2–3 Entwürfe): Perspektive (Blick hinunter auf eine
  Straße vs. Skyline in der Ferne), Dichte, Farbe der Lichter.
- Welche kleinen Szenen (Liste aus der Ideen-Prüfung).
- Häufigkeit/Stärke der Blitze.

## Dem Bauenden überlassen

- Technik der Ebenen, Skalierung je Fenstergröße (Feste Größenliste, siehe Gedächtnis
  „Mehrere Größen testen“; Chat-Fenster z. B. 1397×1332), Zufallssteuerung, Aufteilung in
  Dateien, Tests.

## PixelLab

Tier 1, Kontingent erneuert sich am 10.12.2026; vor dem Erzeugen Kosten nennen.
`create_image_pro` max 344×192; `inpaint_image` max 256 px je Seite (gemessen).
