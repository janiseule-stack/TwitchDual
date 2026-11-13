# Regal von nahe – Entwurf

Stand: 13.11.2026, Branch `feat/cozy-raum`. Ersetzt in Teilen `2026-11-11-regal-neu-design.md`
(Abschnitt „So soll es werden“, Punkte 3, 5, 9 und 11). Alles andere aus diesem Entwurf gilt weiter.
Vorschau-Bilder (Wegwerf, im echten Maßstab 2960×1390): `renderer/themes/cozy/entwuerfe/_ANSCHAUEN/80-regal-zoom/`,
`81-regal-nah-vorschau/`, `82-regal-nah-varianten/`, `83-rueckseite/`; Vorschau-Seite
`renderer/themes/cozy/entwuerfe/mockup-regal-nah/index.html` (gitignored, kein App-Code).

## Warum

Janis findet die Idee mit Regal und Platten gut, die Umsetzung aber „meh“:

- Die Namen auf den Plattenrücken sind kaum lesbar. Gemessen: Auf dem Ultrawide (2960×1390) füllt
  das Regal nur das mittlere Drittel der Breite, die Rücken sind schmal, die Namen klein und hochkant.
- Die Ansicht nach dem Klick auf eine Platte „macht keinen Sinn“. Vor allem ist die umgedrehte Hülle ein Kasten,
  der doppelt so breit ist wie eine Hülle („eine Hülle, die aus zwei normalen besteht“).

**Erfolg:** Man sieht das Regal von nahe, liest die Namen ohne Mühe, und eine angeklickte Platte wirkt wie ein
echtes Album in der Hand. Das Gute aus dem alten CD-Entwurf (`feat/home-cd`) kommt mit: Die Platte schaut aus
der Hülle, die großen Namen gleiten im Hintergrund, umdrehen zeigt die Trackliste.

## Ziele, Nicht-Ziele, Anti-Ziele

- **Ziele:** Kamera nah am Regal, Fach für Fach. Namen lesbar, beim Hover groß und waagrecht. Neue Klick-Ansicht
  (Hülle mit Platte, Tafel mit Vorschaubild, große Namen dahinter). Rückseite so groß wie die Vorderseite.
- **Nicht-Ziele:** Raum, Auflegen-Ablauf, Chat-Stadt und Datenquellen bleiben, wie sie sind. Es gibt keine
  neuen Funktionen (Sortieren, Kategorien).
- **Anti-Ziele (Fehlschlag, auch wenn es technisch läuft):**
  - Text ist zu klein oder schlecht lesbar, oder Zeichen sind verwechselbar (siehe Schrift).
  - Die Kamera gleitet seitlich, statt an Ort zu zoomen. Janis mag Zoom an Ort, seitliches Gleiten nicht.
  - Ein Fach wird auf einer Größe der Liste abgeschnitten.
  - Selbst gezeichnete Grafik.

## Von Janis entschieden (13.11.2026)

| Thema | Entscheidung |
|---|---|
| Grundweg | **A: nah ran, Fach für Fach.** (Abgelehnt: B, ein neues breites PixelLab-Regal; C, nur 1,25× näher, das löst das Lesen nicht.) |
| Fächer | Ein Fach füllt das Bild. Reihenfolge wie heute: 1 = Ausstellbrett (Live-Favoriten, Cover nach vorn), 2 = Live-Rücken, 3 = untere Rücken. |
| Hover über Rücken | Die Platte rutscht ein Stück nach oben heraus. Der Name steht darüber **groß, weiß, mit dunklem Rand, ohne Schild** (Variante „nur Schrift“, `82-…/hover-2-nur-schrift.png`). |
| Klick auf Platte | Das Regal wird dunkel. Darüber gleiten die **großen Namen**, der Name der gewählten Platte leuchtet. Vorn steht die **Hülle (Profilbild), aus der die Platte heraus schaut**. Rechts eine **Tafel mit dem Vorschaubild des Streams oben**, darunter Name, Titel, Spiel · Zuschauer, „↻ umdrehen: VODs“ (`82-…/klick-a-…-schrift2-pixelify.png`). Hülle und Tafel stehen als Gruppe mittig. |
| Rückseite | Die Hülle dreht sich um. Die Rückseite ist **genauso groß wie die Vorderseite** (quadratisch, Fläche `karte-rueck.png`) und zeigt die VODs als nummerierte, scrollbare **Trackliste** (Nr., Titel, Länge); oben das VOD des laufenden Streams mit ●. Die Tafel rechts zeigt das VOD unter der Maus: Vorschaubild, Titel, Spiel · wann · Länge, „▶ abspielen“, „↻ Vorderseite“ (`83-rueckseite/rueckseite-vods.png`). |
| Schrift | Tafel, Trackliste und große Namen in **Pixelify Sans**. **Zahlen in Raum Klar**, weil in Pixelify die 5 wie ein S aussieht und die 2 wie ein Z. |

## Rahmenbedingungen

- **Bilder nur aus PixelLab** (feste Regel). Code darf zuschneiden, skalieren, ausstanzen, einfärben, abdunkeln und
  Bildstreifen abspielen, nie selbst Grafik zeichnen. Für die Klick-Ansicht reichen die vorhandenen Bilder
  (`regal.png`, `regal-wand.png`, `ruecken-*.png`, `huelle.png`, `huelle-gross-vorn.png`, `platte.png`,
  `platte-dreht.png`, `karte.png`, `karte-rueck.png`). Wird ein neues Bild nötig, legt der Bauende 2–3
  PixelLab-Varianten vor, nennt vorher die Kosten, und Janis wählt.
- **Feste Größenliste** (`tools/home-groessen.js`): 2960×1390, 2040×952, 1920×1030, 1536×1030, 1280×670, 900×700.
  Bei jeder Größe ist ein ganzes Fach zu sehen. Vorher selbst Fotos im echten Maßstab machen und ansehen,
  dann erst Janis zeigen.
- Ganzzahliger Pixel-Faktor F = min(⌊Breite / 174⌋, ⌊Höhe / 82⌋). Ein Fach mit Rand ist 174 × 82 Bildpixel groß.
  Nachgerechnet:

  | Fenster | F | Rücken breit | Rücken-Name ca. |
  |---|---|---|---|
  | 2960×1390 | 16 | 96 px | 56 px |
  | 2040×952 / 1920×1030 | 11 | 66 px | 39 px |
  | 1536×1030 | 8 | 48 px | 28 px |
  | 1280×670 | 7 | 42 px | 25 px |
  | 900×700 | 5 | 30 px | 18 px |
- Das bleibt wie heute: Suchfeld oben (auch in der Nahansicht erreichbar), Suche mit Enter-Reihenfolge, Esc
  schrittweise zurück, Stern-Favoriten, Auflegen-Ablauf (Klick auf die große Hülle legt auf, Spec
  `2026-11-13-auflegen-neu`), Home schließt ohne Quelle nicht, Offline-Platte zeigt gleich die Rückseite,
  Rückseite lädt beim Scrollen nach, „Animationen aus“ hält alles an.
- Daten wie heute aus `HomeListe.abschnitte`, Vorschaubild über die bestehende Live-Vorschau
  (`karteVorschau` in `renderer/video/home-raum-dom.js`). `main.js`/`preload.js` bleiben unverändert.
- `npm test` grün vor jedem Commit.

## Wege (Approaches)

| Weg | Was | Abwägung | Wahl |
|---|---|---|---|
| A | Kamera nah, ein Fach füllt das Bild, Mausrad / ↑↓ wechselt das Fach (Zoom an Ort) | Kein neues Bild, die Rücken werden auf allen Größen groß; man sieht immer nur ein Fach | **gewählt** |
| B | Neues breites, niedriges Regal aus PixelLab, ganz sichtbar | Kein Blättern, aber ~20–40 Generationen, und das Regal im Raum sieht anders aus | abgelehnt |
| C | Nur 1,25× näher (mehr geht auf dem Ultrawide nicht, ohne zu beschneiden) | Kaum Aufwand, die Namen bleiben klein | abgelehnt |

## Festlegungen von Claude (nach der Prüfung durch einen frischen Bauenden; Janis prüft beim Anschauen)

- **Fachwechsel = Zoom an Ort** (kurz heraus aufs ganze Regal, dann ins nächste Fach), kein senkrechtes Gleiten.
  Begründung: Janis' bekannte Vorliebe („Zoom an Ort“, Gleiten/Schieben abgelehnt, 13.11.2026). Nur dieser eine
  Weg wird gebaut, keine Umschaltung.
- **Ein- und Ausgang:** Klick aufs Regal im Raum zoomt an Ort direkt in **Fach 1** (Ausstellbrett), so wie heute der
  Regal-Übergang (inkl. Einstellung „Pixel-Übergang“). Esc wirkt schrittweise: Rückseite → Vorderseite →
  Klick-Ansicht zu (zurück ins Fach) → Fach → Raum.
- **Eingabe:** Mausrad und ↑/↓ wechseln das Fach. Passen mehr Rücken in ein Fach als Platz ist, blättert man darin mit
  ←/→ oder Shift+Mausrad (wie heute über `fachFenster`). Normales Mausrad blättert nie waagrecht.
- **Hover im Fach 1 (Cover nach vorn):** Das Cover hebt sich ein Stück an, der Name steht darüber groß in derselben
  Schrift wie bei den Rücken (weiß, dunkler Rand, ohne Schild).
- Ein Hinweis „▲▼ Fach 2 / 3“ unten rechts (Zahlen in Raum Klar).
- **Rückseite:** `karte-rueck.png` ist 96×96, also quadratisch, und wird als 9-Slice wie heute verwendet. Kein neues Bild nötig.
- **Größe der Klick-Ansicht:** eigener ganzzahliger Faktor G = max(1, min(⌊0,9·Breite / 341⌋, ⌊0,8·Höhe / 160⌋)).
  Die Gruppe ist 341 × ~160 Bildpixel groß (Hülle 128, Platte ragt ~50 heraus, Abstand 13, Tafel 150). Gleiche
  Anordnung auf allen Größen, nachgerechnet:

  | Fenster | G | Gruppe | Titel auf der Tafel ca. |
  |---|---|---|---|
  | 2960×1390 | 6 | 2046×960 | 45 px |
  | 1920×1030 | 5 | 1705×800 | 38 px |
  | 2040×952 / 1536×1030 | 4 | 1364×640 | 30 px |
  | 1280×670 | 3 | 1023×480 | 23 px |
  | 900×700 | 2 | 682×320 | 15 px |

  Bei 900×700 ist der Text mit ~15 px knapp. Zeigen die Fotos, dass er dort zu klein ist, kommt die Anordnung als
  Optik-Frage zu Janis (z. B. Tafel unter der Hülle), statt dass der Bauende sie selbst ändert.
- Die großen Namen gleiten langsam waagrecht (wie im alten CD-Entwurf, `feat/home-cd:renderer/video/home-buehne-dom.js`,
  Abschnitt „Riesen-Namen“). Ihre Reihenfolge folgt den Kanälen im Regal.

## Dem Bauenden überlassen

- Wie die neue Ansicht in `renderer/video/home-raum-dom.js` (heute: `baueRegalNeu`, `zeichneFachNeu`, `fachBlaettern`,
  `baueKarte`/`zeichneKarteVorn`, Rückseite) und `renderer/lib/raum.js` (`skalierungRegal`, `fachFenster`,
  `zoomAmOrt`) eingepasst wird: was wiederverwendet, was ersetzt wird.
- Was im Fach passiert, wenn mehr Rücken da sind als hineinpassen (heute blättert `fachFenster`).
- Wie die großen Namen aus `feat/home-cd` übernommen werden (Code holen oder nachbauen).
- Tasten und Mausrad im Detail, solange ↑/↓, Mausrad und Esc wie oben wirken.
