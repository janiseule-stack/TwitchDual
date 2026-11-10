# Design-Rebuild „Cozy-Raum“ – Design

Stand: 10.11.2026 · Branch `feat/cozy-raum` (auf `feat/home-cd`, Stand `00f182d`, der
`feat/eingabe-feld` enthält). Skizzen: `.superpowers/brainstorm/2017-1794266639/content/`
(`platten-wo.html`, `chat-video-rahmen.html`).

## Begriffe

- **TwitchDual:** Electron-App. Twitch-Stream im **Video-Fenster**, Chat in einem eigenen
  **Chat-Fenster**. **Home** ist eine Ebene im Video-Fenster über dem weiterlaufenden Player.
- **Janis** entscheidet Design, Optik und Gefühl. **Claude** baut und entscheidet Technik
  (markiert als „Claudes Wahl“).
- **Raum:** das Pixel-Art-Bild `renderer/themes/cozy/raum.png` (344×192, isometrisch, warm):
  Sofa, Regenfenster, Bücherregal, Stehlampe, Röhren-TV mit grünem Bildschirm, Plattenspieler,
  Katze auf einem Kissen, Teetasse, Bild an der Wand.
- **PixelLab:** Bild-Werkzeug (pixellab.ai), mit dem Janis alle Pixel-Bilder erzeugt. Claude
  liefert die Prompts. Laut Nutzungsbedingungen gehören die Bilder dem Ersteller, kommerzielle
  Nutzung erlaubt (geprüft 10.11.2026, https://www.pixellab.ai/termsofservice).

## Warum

Die bisherigen Themes (Sakura, Koi, Wald, Blasen, Neon Dual) und die CD-Bühne passten nicht
zusammen, und es gab zu viele Animationen. Janis will **ein** durchgängiges Design für die ganze
App: einen gemütlichen Pixel-Art-Raum. Es soll ästhetisch sein und **kein „AI-Slop“**.

**Erfolg:** Die App fühlt sich an wie ein Abend in diesem Zimmer. Man wählt im Regal eine Platte,
legt sie auf, der Fernseher zeigt den Stream. Chat und Leisten sehen aus, als gehörten sie zum
selben Raum.

## Ziele / Nicht-Ziele / Anti-Ziele

- **Ziele:** ein Raum-Design für Home, Player, Chat und Einstellungen; alle alten Themes
  entfernt; alle heutigen Funktionen bleiben erreichbar; die getestete Logik aus `feat/home-cd`
  und alles aus `feat/eingabe-feld` bleibt.
- **Nicht-Ziele:** weitere Raum-Themes (später, 2–3 geplant); neue Twitch-Funktionen;
  Release (erst auf Ansage).
- **Anti-Ziele (Fehlschlag, auch wenn es läuft):**
  - Glatte, moderne Überlagerungen auf der Pixel-Welt (Verläufe, Glas, runde Knöpfe,
    scharfe Fotos im Pixel-Bild).
  - CSS-Kästen, die Holz oder Möbel nur nachahmen, statt echter Pixel-Bilder.
  - Dauer-Unruhe: viele große Animationen gleichzeitig.
  - Der Stream wird beim Zuschauen von Deko gestört.
  - Der Chat-Text ist schlechter lesbar als heute.

## Von Janis entschieden

| Thema | Entscheidung |
|---|---|
| Grundlage | Cozy-Pixel-Raum für die ganze App; alle alten Themes raus |
| Aus CD wird Platte | Ein Kanal ist eine Schallplatte in ihrer Hülle; der Plattenspieler und der TV im Raum ersetzen CD und Laufwerk |
| Home, erster Moment | Man sieht zuerst den **ganzen Raum** (er ist das Hauptmenü) |
| Anklickbar im Raum | Regal → Platten wählen · Fernseher → zurück zum laufenden Stream · Plattenspieler → zeigt, was aufliegt · Bild an der Wand → Twitch-Konto · Stehlampe → Einstellungen. Katze, Tee, Regenfenster sind Deko |
| Platten finden | **Variante B:** Die Kamera fährt ans Regal, das Regal füllt das Fenster, die Platten stehen groß darin |
| Regal-Ansicht | oben Live-Platten (Profilbild als Cover, rotes Live-Lämpchen), unten Offline-Favoriten grau; gewählte Platte herausgezogen, Platte schaut heraus; Zettel mit Kanal, Spiel, Zuschauern, Laufzeit, Kanalpunkten; Hülle umdrehen zeigt VODs; Zettel oben am Regal ist das Suchfeld |
| Auflegen | Kamera fährt zurück in den Raum, Platte landet auf dem Plattenspieler, Kamera zoomt in den Fernseher, bis der Stream das Fenster füllt. **Darf sich Zeit lassen, nicht gehetzt** |
| Hover im Raum | heller Pixel-Rand um den Gegenstand und kleines Schild mit Namen |
| Stil | alles echte Pixel-Art; Schrift und Felder wirken wie Teile der Welt; Profilbilder grob verpixelt |
| Leben | kleine Animationen ausdrücklich erwünscht: Regen, Katze bewegt sich, Licht flackert, Dampf |
| Video-Fenster | Leiste oben als TV-Gehäuse (Platten-Knopf für Home, Lämpchen „Ads blocked“, rotes „LIVE“ mit Kanal/Spiel/Zuschauern/Laufzeit, Fensterknöpfe); neben dem Video ruhige Fläche statt Schwarz. **Optik noch offen:** die CSS-Skizze gefiel nicht, Janis sieht sie noch einmal mit echten Pixel-Bildern |
| Chat-Fenster | **Chat 1:** oben ein Szenen-Streifen aus dem Raum mit LIVE-Schild (dort spielen die Animationen), darunter ruhige dunkle Fläche, unten die Eingabe aus `feat/eingabe-feld` in neuen Farben. Alle Leisten (Kopf, Fuß) werden neu gestaltet |
| Chat-Deckkraft | Der Regler blendet künftig den **Raum hinter dem Chat** ein (statt Desktop): 100 % = ruhige Fläche, weniger = Raum scheint durch |
| Einstellungen | bleiben: Zeitstempel, Abzeichen, Schriftgröße, Diagnose, Animationen an/aus. Raus: Theme-Galerie, Farbwähler/Farbpaare, Welt-Würfel 🎲, Kisten-Stil, Tiere übers Video |
| Abo/Raid/Kiste | brauchen neue Effekte im Raum-Stil; **noch offen**, Ideen werden Janis als Liste vorgelegt (Etappe 3) |
| Reihenfolge | drei Etappen (unten), jede mit eigenem Plan |

Vorschläge von Claude, denen Janis zugestimmt hat („passt“): Belegung der Gegenstände,
Aufbau der Regal-Ansicht, Einstellungen-Liste, Etappen. Pixel-Schrift nur für Leisten, Schilder
und Überschriften, Nachrichtentext in normaler Schrift: von Claude vorgeschlagen und in den
Skizzen so gezeigt, Janis hat nicht widersprochen.

## Etappen

Jede Etappe bekommt einen eigenen Plan und endet benutzbar. Kein Release ohne Ansage.

### Etappe 1 – Grundlage
- Alte Themes und ihre Bedienung entfernen (Ordner `renderer/themes/{sakura,koi,wald,blasen,neon-dual}`,
  Theme-Galerie, Farbwähler, 🎲, Kisten-Stil, Video-Tiere). Welche Bausteine aus
  `renderer/lib/` (`themes.js`, `theme.js`, `theme-runtime.js`, `fx-engine.js`, `kiste.js`,
  `chat-ereignisse.js`) ganz entfallen und welche Etappe 3 weiter braucht, klärt der Plan
  Datei für Datei (ungeprüft).
- Eine feste Farbpalette aus dem Raum-Bild (Holz, Creme, Bernstein, gedecktes Grün,
  Dunkelbraun), harte Kanten, keine Verläufe, kein `backdrop-filter`.
- Chat-Fenster nach „Chat 1“: Szenen-Streifen (zunächst stehendes Bild), Kopf-, Fuß- und
  Eingabe-Bereich neu; Scroll-Pille, Ein-Feld-Eingabe und Fensterecken bleiben wie sie sind.
- Video-Fenster: Leiste als TV-Gehäuse und Seitenflächen, **nach** einer Optik-Runde mit
  echten Pixel-Bildern (Janis wählt aus 2–3 Varianten).
- Einstellungen auf die Liste oben gekürzt, im neuen Stil.
- Abo/Raid/Kiste: bis Etappe 3 schlicht (Text/Zahl ohne Welt-Effekt). Home bleibt in dieser
  Etappe die Bühne aus `feat/home-cd`, nur umgefärbt (Claudes Wahl, damit die App benutzbar bleibt).

### Etappe 2 – Raum als Home
- Home zeigt den ganzen Raum mit den fünf anklickbaren Gegenständen (Hover-Rand + Schild).
- Regal-Ansicht mit Platten wie in der Tabelle; Kamera-Fahrten Raum ↔ Regal.
- Auflegen-Ablauf Regal → Raum → Plattenspieler → Zoom in den TV. Gesamtdauer großzügig
  (Richtwert 4–6 s, Janis stimmt beim Anschauen ab); ein Klick überspringt (Claudes Wahl).
  Der Stream lädt währenddessen; Home schließt erst, wenn Ablauf **und** Laden fertig sind,
  bei Fehler Abbruch mit Hinweis (Verhalten wie beim Laufwerk in `feat/home-cd`).
- Wiederverwendete, getestete Logik: `renderer/lib/home-liste.js` (Suche, Enter-Reihenfolge),
  `renderer/lib/home-buehne.js` (Reihenfolge, Blättern, Ständer-Inhalt, Ablauf),
  `renderer/lib/home-punkte.js` + `src/home-punkte.js` (Kanalpunkte), Profilbild 300 px,
  VOD-Bilder 640×360. Die Regeln aus den Home-CD-Specs
  (`2026-11-09-home-cd-design.md`, `…-v2-design.md`) gelten weiter, soweit sie Verhalten
  und nicht CD-Optik beschreiben. Entfällt: CD-Hülle, CD, Laufwerk, Riesen-Namen, Ständer-Optik.
- Der Fernseher im Raum zeigt, wenn ein Stream läuft, dessen Vorschaubild verpixelt auf dem
  Bildschirm; sonst ein stehendes „aus“-Bild (Claudes Wahl; kein zweiter Player).
- Konto (Bild an der Wand) und Einstellungen (Lampe) öffnen als kleine Tafeln im Pixel-Stil
  über dem Raum; Anmelde-Logik `renderer/lib/anmeldung.js` unverändert.

### Etappe 3 – Leben
- Animationen: Regen am Fenster, Katze, Dampf über der Tasse, Lampenflackern, drehende Platte;
  im Raum (Home) und im Szenen-Streifen des Chats. Schalter „Animationen aus“ hält alles an.
- Effekte für Abo, Raid und Kanalpunkte-Kiste im Raum-Stil (Auswahl durch Janis aus der
  Ideenliste).
- Deckkraft-Regler blendet den Raum hinter dem Chat ein.

### Nachtrag 10.11.2026: Etappe 1 geteilt (Vorschlag von Claude, von Janis am 10.11.2026 bestätigt; 1a ist umgesetzt)

Die Prüfung am Code hat gezeigt, dass die sechs „Theme-Bausteine“ auch Farben, LIVE-Schild,
Deckkraft, Balkenfarbe und die gespeicherten Einstellungen tragen (`main.js` lädt zwei davon).
Deshalb:

- **Etappe 1a – Abriss und feste Farben** (kein neues Bild nötig, Plan:
  `docs/superpowers/plans/2026-11-10-cozy-raum-etappe-1a.md`): alte Themes und ihre Bedienung
  weg, feste Palette über die vorhandenen CSS-Variablen, Einstellungen gekürzt.
- **Etappe 1b – Chat- und Video-Optik** (braucht Bilder, Pixel-Schrift und Janis' Wahl):
  Szenen-Streifen, Leisten als Pixel-Bilder, TV-Gehäuse, harte Kanten, keine Verläufe.

| Datei | 1a |
|---|---|
| `renderer/themes/{sakura,koi,wald,blasen,neon-dual}`, `themes.js`, `theme-runtime.js`, `fx-engine.js` | weg |
| `theme.js` | schrumpft: LIVE-Schild, Deckkraft, neue Einstellungen `{ chatAlpha, animationen }`, Farbfilter |
| `chat-ereignisse.js` | bleibt (Abo/Raid als Zeile) |
| `kiste.js` | bleibt, fest im Stil „pixel“ (Claudes Wahl bis Etappe 3) |

Festlegungen für 1a (Claudes Wahl, damit nichts verloren geht): Der Deckkraft-Regler zieht ins
⚙ um und lässt wie heute den Desktop durchscheinen, bis Etappe 3 ihn umwidmet. Die Knöpfe
„Ausprobieren“ ziehen ins ⚙ unter „Mehr“ (ohne „Video“-Gast). Die Fläche neben dem Video ist
eine feste Farbe: die Balken liegen im Twitch-Rahmen und nehmen nur Farbwerte an, keine Kachel.
„Keine Verläufe“ und „harte Kanten“ gelten in Etappe 1 für Chat, Video-Leiste und
Einstellungen (1b), nicht für die CD-Bühne, die Etappe 2 ersetzt.

## Technik (Claudes Wahl)

- **Skalierung:** Pixel-Bilder nur ganzzahlig vergrößern (`image-rendering: pixelated`), größter
  Faktor, der ins Fenster passt; der Rest wird mit der dunklen Randfarbe des Bildes gefüllt.
- **Kamera-Fahrten:** nur `transform` (Verschieben/Vergrößern) auf einer Raum-Ebene; kein
  Neuzeichnen pro Bild. Regal-Nahaufnahme ist ein eigenes Bild, das am Ende der Fahrt überblendet.
- **Klickflächen:** Rechtecke in Bild-Koordinaten (344×192) als Daten, DOM-frei testbar
  (Treffer, Skalierung, Hover-Schild). Die genauen Koordinaten (auch des grünen Bildschirms)
  werden im Plan am Bild gemessen (ungeprüft).
- **Profilbilder verpixeln:** klein auf Canvas zeichnen und ohne Glättung vergrößern.
- **Animationen:** Sprite-Streifen (wenige Bilder, niedrige Bildrate) als eigene kleine Ebenen
  über dem Standbild; keine Dauer-Animation im Video-Fenster während ein Stream läuft, außer
  in Home.
- **Pixel-Schrift:** eine frei lizenzierte Pixel-Schrift lokal mitliefern (kein Nachladen aus
  dem Netz); Wahl und Lizenz im Plan prüfen (ungeprüft). Chat-Text bleibt in der heutigen Schrift.
- **Tests:** reine Logik unter `node --test` wie bisher; `npm test` bleibt grün; Tests
  entfernter Themes werden mit entfernt. **Anschauen macht Janis.**

## Bilder (PixelLab, Janis erzeugt, Claude liefert Prompts)

In jedem Prompt dieselbe Palette: „warm limited color palette (amber, brown, muted green,
soft cream)“ und der Raum als Referenzbild.

| Etappe | Bild | Zweck |
|---|---|---|
| vorhanden | `raum.png` 344×192 | Raum, Grundlage |
| 1 | Szenen-Streifen (breit, flach; Fenster mit Regen, Fensterbank, Lampe) | Kopf des Chats |
| 1 | Holz-/Gehäuse-Leiste, Knöpfe, Lämpchen (rot/grün), Tapeten-Kachel | Leisten in Video und Chat |
| 2 | Regal von nah, frontal, zwei leere Fächer | Regal-Ansicht |
| 2 | Plattenhülle (Rahmen fürs Profilbild), Platte, Zettel/Schild | Platten und Infos |
| 2 | Plattenspieler-Zustände (leer / Platte liegt auf) | Auflegen |
| 3 | Animations-Streifen: Regen, Katze, Dampf, Lampe, Platte dreht | Leben |

PixelLab bietet laut eigener Seite Animations-Werkzeuge, Inpainting und Referenzbilder
(https://www.pixellab.ai/, geprüft 10.11.2026). Ob die Katze im Raum-Stil sauber animierbar ist,
zeigt erst ein Versuch (ungeprüft). Preise und Bildgrößen-Grenzen je Tarif: ungeprüft.

## Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Bilder aus mehreren PixelLab-Läufen passen im Stil nicht zusammen | immer Raum als Referenz + gleiche Palette; Janis prüft jedes Bild, bevor es eingebaut wird |
| Mockups aus CSS täuschen über die echte Optik | Optik-Entscheidungen nur an echten Pixel-Bildern |
| Kleine Fenster: Raum bei Faktor 1–2 zu klein zum Treffen | Mindestfaktor festlegen, darunter Regal-Ansicht direkt; im Plan klären |
| Viele Kanäle im Regal | seitwärts blättern wie der Ständer; Suche filtert |
| Katzen-/Regen-Animation gelingt in PixelLab nicht | Etappe 3 ist unabhängig; notfalls einfache Sprite-Tricks (Regen als Code, Katze blinzelt nur) |
| Deckkraft: Raum hinter Text macht Chat unruhig | Regler, Standard 100 %; Raum dahinter abgedunkelt |

## Abnahme

Je Etappe: `npm test` grün; keine Reste der alten Themes in Bedienung und Code (Etappe 1);
Janis schaut an und gibt frei. Leistung in Home wie in `feat/home-cd` gemessen
(≤ 2 Frames über 33 ms in 10 s bei laufendem Stream).

## Offen

1. Optik der Video-Leiste (Runde mit echten Bildern, Etappe 1).
2. Effekte für Abo, Raid, Kiste (Ideenliste, Etappe 3).
3. Genaue Dauer und Schritte des Auflegen-Ablaufs (Janis beim Anschauen, Etappe 2).
