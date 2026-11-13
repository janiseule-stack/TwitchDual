# Cozy-Raum Etappe 3 – Leben (Animationen) – Entwurf

Stand: 11.11.2026. Gehört zum Gesamtentwurf `docs/superpowers/specs/2026-11-10-cozy-raum-design.md`
(Abschnitt „Etappe 3 – Leben“). Branch `feat/cozy-raum` (ungemergt, kein Release).

## Warum

Janis: Der Raum soll **cozy wie die bekannten Lofi-Videos** sein. Heute wirkt er **starr**: Home und der
Raum-Streifen oben im Chat sind Standbilder. Home soll ein **lebendiges Home** sein, solange man dort ist und
etwas auswählt; der Streifen oben im Chat soll beim Zuschauen leben (Regen, Katze bewegt sich).

**Erfolg:** Man schaut hin und der Raum atmet – ein paar kleine Dinge in ruhiger Schleife, die man eher nebenbei
bemerkt. Ein Raid fühlt sich an wie „draußen kommen Leute vorbei“, eine Kanalpunkte-Kiste wie „die Katze bringt
was“.

## Von Janis entschieden (11.11.2026)

| Punkt | Entscheidung |
|---|---|
| Stimmung | cozy wie Lofi-Videos: ruhige Schleifen, nichts hektisch |
| Home | **immer** lebendig, solange Home offen ist (auch beim Auswählen im Regal-/Raum-Blick) |
| Chat-Streifen | lebt ebenfalls dauernd: **Regen** und **Katze bewegt sich** ausdrücklich gewünscht |
| Abschalten | über den bestehenden Schalter „Animationen aus“ |
| Raid | im Chat-Streifen: draußen im Regen ziehen **Leute mit Schirmen** am Fenster vorbei – **oder nur Schirme**; Wahl an PixelLab-Probebildern. Mehr Raider → mehr Schirme |
| Abo | **kein Effekt** (bleibt Chat-Zeile, „juckt nicht“) |
| Kanalpunkte-Kiste | im Chat-Streifen: **die Katze bringt eine Münze** |
| Ereignis-Effekte | **nur im Chat-Streifen**, nicht in Home (Home sieht man während eines Streams nicht) |
| Streifen-Bild | „im Streifen ist nicht alles drin, vielleicht muss man den neu zeichnen“ – gemeint: **je nach Chat-Größe sieht man nicht alles** (Teile werden abgeschnitten). Der Streifen muss Fenster, Katze und Lampe bei jeder Chat-Größe zeigen; dafür darf er neu aus PixelLab entstehen (Wahl durch Janis) |

**Nachtrag 11.11. (Janis nach der Plan-Prüfung):** 1A – der Streifen wird so hoch, dass das Fenster ganz
sichtbar ist (höchstens 30 % der Chat-Höhe), das heutige `streifen.png` bleibt; 2A – die Regal-Ansicht in Home
bleibt still; 3A – beim Raid gehen Leute mit Schirm (PixelLab-Gehzyklus), ihr Vorrücken im Code passt zum
Gehtakt.

## Ziele

1. **Home-Raum lebt:** Regen am Fenster, Katze (schläft auf dem Kissen, bewegt ab und zu Schwanz/Ohr/atmet),
   Dampf über der Tasse, Lampe flackert selten und leicht. Die drehende Platte beim Auflegen bleibt wie gebaut.
2. **Chat-Streifen lebt:** Regen am Fenster, Katze auf dem Fensterbrett bewegt sich, Lampe flackert selten;
   Dampf nur, falls das (neue) Streifen-Bild eine Tasse enthält.
3. **Raid-Effekt** im Streifen (Schirme im Regen vor dem Fenster, Anzahl nach Raid-Größe).
4. **Kisten-Effekt** im Streifen (Katze bringt eine Münze).
5. Alles stoppt bei „Animationen aus“.

## Nicht-Ziele

- Kein Abo-Effekt.
- Keine Animationen im Video-Fenster.
- Keine Ereignis-Effekte in Home.
- Deckkraft-Regler „Raum hinter dem Chat“ (stand im Gesamtentwurf unter Etappe 3): **nicht Teil dieser Etappe**,
  kam im Gespräch nicht vor (Claudes Vorschlag; Janis kann ihn zurückholen).
- Die gesammelten Korrekturen aus Janis' erstem Urteil zu Runde 2 (Raum füllt rechts nicht, LIVE-Schild
  leuchtet nicht, kleinere Dinge in `docs/TODO.md`) – kommen **nach** Etappe 3 in einer eigenen Runde.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Hektik: viele auffällige Bewegungen gleichzeitig, schnelle Bildraten, Dauer-Blinken.
- Bewegungen, die nach Code statt nach gezeichneter Pixel-Art aussehen (gleitende CSS-Verschiebungen
  ganzer Gegenstände, weiche Überblendungen auf Pixel-Bildern, Partikel aus Kreisen/Kästen).
- Effekte stören das Lesen des Chats oder überdecken Chat-Text.
- Spürbare Last: Lüfter/CPU wegen der Animationen, ruckelnder Stream.

## Feste Rahmenbedingungen

- **Nur PixelLab-Bilder.** Jedes sichtbare Bild und jedes Animationsbild kommt aus PixelLab (MCP-Werkzeuge,
  Tier 1). Code darf zuschneiden, ausstanzen, skalieren, einfärben/Helligkeit ändern, Bildstreifen abspielen
  und Bilder an Pixel-Positionen setzen. **Code zeichnet nichts selbst.** Steht in jedem Helfer-Auftrag.
- **Optik wählt Janis:** zu jeder Animation 2–3 PixelLab-Varianten erzeugen und vorlegen, erst nach der Wahl
  einbauen (wie bei Etappe 2: Entwürfe in `renderer/themes/cozy/entwuerfe/` (gitignored), Quellen in
  `tools/raum-quellen/`, Aufbereitung über `tools/raum-bilder.py`).
- Anschauen macht Janis (keine eigenen Screenshots per CDP). Dateien nur mit Write/Edit, keine Heredocs.
- `preload.js`/`main.js` unverändert, sofern nicht zwingend nötig (dann im Plan begründen).
- Bestehende Home-Regeln bleiben (Enter-Reihenfolge, Esc schrittweise, Auflegen-Ablauf).

## Wie es aussieht (bereits entschieden bzw. vorhanden)

- **Home-Raum** = `renderer/themes/cozy/raum.png` (344×192, nicht ganzzahlig deckend skaliert, siehe
  `renderer/lib/raum.js` `skalierung`). Enthält: Fenster mit Regen links oben, Katze auf rundem Kissen in der
  Mitte, Tasse mit Dampf vorn rechts auf dem Tischchen, Stehlampe oben Mitte, Plattenspieler rechts.
- **Chat-Streifen** = `renderer/themes/cozy/streifen.png` (344×72, `renderer/chat/chat.css` Hintergrund,
  Faktor aus `renderer/lib/szene.js`, oben beschnitten). Enthält: Fenster mit Regen, Katze auf dem Fensterbrett,
  Tischlampe rechts, Pflanze links. **Keine Tasse, kein Plattenspieler.**
- Vorbild für die Technik: `platte-dreht.png` aus Runde 2 (PixelLab-Animation eines Raum-Ausschnitts, als
  Bildstreifen in der skalierten Bild-Ebene an Raum-Koordinaten, CSS `steps()`).

## Raid und Kiste im Detail (was Janis gesagt hat + was offen ist)

- **Raid:** Auslöser ist das bestehende Raid-Ereignis im Chat (`renderer/lib/chat-ereignisse.js`). Schirme
  (mit oder ohne Leute) ziehen draußen hinter dem Fensterglas von einer Seite zur anderen, im Regen. Mehr
  Raider → mehr Schirme; feste Obergrenze, damit es ruhig bleibt.
- **Kiste:** Auslöser ist das bestehende Kisten-Ereignis (`renderer/lib/kiste.js`). Die Katze im Streifen
  bringt eine Münze (Münzbild: vorhandenes `symbol-muenze.png` aus PixelLab oder neu).
- Effekte laufen einzeln nacheinander, nie gleichzeitig übereinander.

## Claudes Festlegungen (nach Prüfung durch einen frischen Bauenden; Janis kann jede kippen)

1. **Reihenfolge:** Zuerst wird über das Streifen-Bild entschieden (neu aus PixelLab oder das heutige behalten),
   **dann** entstehen die Streifen-Animationen auf dem gewählten Bild – sonst müssten alle Ausschnitte neu.
   Home-Animationen hängen davon nicht ab und können parallel vorbereitet werden.
2. **Sichtbarkeit im Streifen:** Heute rechnet `renderer/lib/szene.js` den Faktor aus der Breite (aufgerundet),
   begrenzt die Höhe auf 20 % des Fensters und schneidet oben ab – dadurch fallen je nach Größe Teile weg.
   Neu: Fenster, Katze und Lampe (der „Kern“) sind bei jeder Chat-Größe vollständig sichtbar; der Plan misst
   den Kern am gewählten Bild und passt die Skalierung so an, dass nur Rand außerhalb des Kerns abgeschnitten
   wird. Reicht das heutige Bild dafür nicht (Kern zu breit für schmale Chats), wird ein neues Streifen-Bild
   in PixelLab erzeugt, z. B. mit dem Kern enger beieinander und ruhigen Rändern (Varianten für Janis).
3. **Animation ersetzt eine Bildstelle:** Jede Animation ist ein PixelLab-Bildstreifen eines Ausschnitts, der
   genau über der gleichen Stelle des Standbilds liegt; Bild 0 ist pixelgleich mit dem Standbild (geprüft wie in
   Runde 2). Der gemalte Regen im Standbild wird dadurch überdeckt, nicht verdoppelt; ein regenfreies Standbild
   ist nicht nötig.
4. **Schirme „hinter dem Glas“:** Die Glasfläche wird als Maske aus dem PixelLab-Bild ausgestanzt (Farbe/
   Fläche des Glases); Fensterrahmen und Sprossen liegen davor. Das ist Ausstanzen, kein Zeichnen.
5. **Ablauf der Ereignisse:** eine Warteschlange, höchstens 3 wartende Effekte, ältere fallen weg. Raid etwa
   8 s, Kiste etwa 4 s. Schirme: 1 bis 9 Raider → 1, ab 10 → 2, ab 50 → 3, ab 200 → 4 (Obergrenze 4).
6. **Katze bringt Münze:** ob die Katze dafür läuft oder sitzen bleibt und die Münze bei ihr auftaucht,
   entscheidet Janis an den PixelLab-Varianten; die Ruhe-Schleife der Katze beginnt danach wieder in ihrer
   Ruhelage.
7. **Home:** Die Animationen liegen in derselben skalierten Bild-Ebene wie `platte-dreht.png` und die
   Hover-Bilder (unter den Klickflächen) und laufen in allen Home-Ansichten mit, auch während der Kamera-Fahrt.
8. **„Animationen aus“:** Beide Fenster lesen den Schalter schon heute (`data-animationen` an `:root`,
   im Chat `renderer/chat/chat.js` Zeile ~784); keine Änderung an `preload.js`/`main.js` nötig.
9. **PixelLab-Budget:** je Animation höchstens 3 Varianten pro Runde; Etappe 3 insgesamt höchstens etwa
   400 Generationen (Tier 1: 2000/Monat).

## Dem Bauenden überlassen

- Technik der Wiedergabe (CSS-Bildstreifen vs. Canvas), Bildraten im ruhigen Bereich (Richtwert 4–10 Bilder/s),
  Pausieren bei unsichtbarem Fenster.
- Wie Ausschnitte für PixelLab gewählt werden (Größen innerhalb der Tier-1-Grenzen) und wie Animationen
  nahtlos an das Standbild anschließen (Pixelgleichheit von Bild 0 prüfen wie in Runde 2).
- Zufällige Abstände bei seltenen Bewegungen (Lampe, Katze).
- Reihenfolge: zuerst Bilder erzeugen und Janis wählen lassen, dann einbauen.
