# Auflegen neu (Janis' Punkt 9) – Entwurf

Stand: 13.11.2026, Branch `feat/cozy-raum`. Betrifft nur Home im Video-Fenster
(`renderer/video/home-raum-dom.js`, `home-raum.css`, `home.js`, `renderer/lib/raum.js`).

## Warum

Janis über die heutige Auflege-Animation: „schrecklich“, „er zoomt so hart rein und
bleibt dann im Zoom, einfach nicht satisfying“. Heute (Code-Stand `c8adc4f`):

| Abschnitt | Klasse an `#home` | Dauer | Was passiert |
|---|---|---|---|
| Raum | `ablauf-raum` | 500 ms | Raum-Ebene blendet über das Regal (opacity 0 → 1) |
| Spieler | `ablauf-spieler` | 1200 ms | Kamera (`.raum-bildebene` transform) auf `Raum.PLATTENSPIELER_RECHTECK`, ganzzahliger Faktor (`Raum.kameraZiel`, `Math.ceil`), füllt das Fenster |
| Dreht | `ablauf-dreht` | 1500 ms | Platte dreht (`platte-dreht.png`, 8 Bilder), Kamera bleibt im engen Zoom |
| Zoom | `ablauf-zoom` | 2000 ms | Schwenk + Zoom direkt vom Plattenspieler in den Fernseher (`Raum.TV_RECHTECK`) |

Mindestdauer 5200 ms (`home.js`, `HomeBuehne.createLaufwerk({ mindestMs })`), Klick/Taste
überspringt (`#home-ablauf`), Laden läuft parallel.

Was daran stört: zu enger, zu schneller Zoom; die Kamera bleibt eng und gleitet dann
seitlich zum TV. Den Raum sieht man nie wieder, den Fernseher nie angehen.

## Was Janis will (13.11.2026, so gesagt)

1. **Sanft auf den Plattenspieler zoomen**, nicht bis er das Fenster füllt – eher
   „hingehen“, die Umgebung bleibt sichtbar. Die Platte wird aufgelegt (dreht sich).
2. **Wieder rauszoomen auf den ganzen Raum.** Der Fernseher **geht an**: er **flackert
   kurz** und zeigt dann das Bild (live: Live-Vorschau; VOD: Vorschaubild des VODs).
3. **In den Fernseher hineinzoomen**, bis der Bildschirm das Fenster füllt; dann
   übernimmt das echte Video (wie heute: Home schließt nach dem Laden).
4. Stimmig auf **jeder Fenstergröße** (Video-Fenster beliebig groß, Janis' Ultrawide
   3440×1440 bildschirmfüllend = Video 2960×1390).
5. **Dauer:** „kann auch länger sein, einfach die Zeit, die es braucht“ – Überspringen
   per Klick/Taste bleibt.

Aus der Regal-Runde (12./13.11.) gilt auch hier: **nichts darf seitlich wandern**
(„jetzt wird wieder das Bild verschoben, bitte nicht“). Gefallen hat der **Zoom an Ort
und Stelle**: ein Punkt bleibt stehen, alles andere wird darum größer.

## Ziele

- Drei ruhige Kamera-Bewegungen (rein zum Spieler, raus zum Raum, rein in den TV), jede
  ein reiner Zoom um einen festen Bildschirmpunkt, mit sanftem Anfahren/Abbremsen.
- Sichtbarer Moment „Fernseher geht an“ mit kurzem Flackern.
- Am Ende füllt der TV-Bildschirm das Fenster (Übergang ins echte Video ohne Sprung).

## Nicht-Ziele

- Keine neuen Bilder (kein PixelLab): Flackern und Zoom nur mit vorhandenen Bildern
  (`raum-tv-aus.png`, TV-Canvas mit Vorschau, `platte-dreht.png`).
- Keine Änderung am Laden selbst (`submitLoad`, Fehlerweg, Chat).
- Kein Umbau des Regal-Übergangs (Zoom an Ort / Pixel-Blende bleiben wie gebaut).

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Das Bild gleitet seitlich (Verschieben statt Zoomen).
- Harte, schnelle Zooms oder ein Stillstand im engen Zoom.
- Auf einer Fenstergröße ist der Plattenspieler oder der TV angeschnitten/außerhalb.

## Wie (entschieden)

### Kamera: Zoom um einen festen Punkt (technische Entscheidung des Hauptchats)

Jede Abbildung „Rechteck A im Bild soll auf Rechteck Z am Bildschirm“ mit gleichmäßiger
Skalierung `k ≠ 1` hat genau einen **Fixpunkt** F (der Punkt, der dabei stehen bleibt).
(Korrektur nach der Abschlussprüfung: CSS interpoliert `translate` und `scale` mit
derselben Kurve, der Fixpunkt bleibt dabei stehen. Das Schieben kam daher, dass er heute
weit weg vom Gegenstand liegt, z. B. Spieler → TV bei fast gleichem Faktor.) Neu:

- Für jede Kamerafahrt von Lage L1 nach L2 (je `{ faktor, x, y }` der `.raum-bildebene`)
  den Fixpunkt F am Bildschirm ausrechnen und die Fahrt so animieren, dass F während der
  ganzen Fahrt auf demselben Bildschirmpunkt bleibt (z. B. `transform-origin` auf F
  setzen und nur `scale` animieren, oder per JS/Web-Animations-Keyframes, die F
  festhalten). Wie, entscheidet der Bauende; Bedingung ist der Unit-Test unten.
- Reine Rechenfunktionen in `renderer/lib/raum.js` (DOM-frei, testbar).

### Ablauf (Vorschlag des Hauptchats, Zahlen zum Anpassen beim Anschauen)

| # | Abschnitt | Dauer | Was |
|---|---|---|---|
| 0 | Raum zeigen | wie heute (500 ms Blende) | Raum über dem Regal, Ruhelage |
| 1 | Hin zum Spieler | 1500 ms, ease-in-out | Zoom um F1 bis der Plattenspieler ca. **50 % der Fensterhöhe** einnimmt (Konstante, z. B. `ABLAUF.spielerAnteil`) |
| 2 | Platte auflegen | 1200 ms | Platte erscheint und dreht (`platte-dreht.png`), Kamera steht |
| 3 | Zurück zum Raum | 1500 ms, ease-in-out | Zoom um F2 zurück auf die Ruhelage (ganzer Raum) |
| 4 | Fernseher geht an | ca. 700 ms | Flackern: TV-Bild an/aus in harten Schritten (z. B. an 80 / aus 60 / an 60 / aus 120 / an), dann bleibt es an |
| 5 | Kurz zeigen | 500 ms | Raum mit laufendem TV |
| 6 | In den TV | 2000 ms, ease-in | Zoom um F3, bis der TV-Bildschirm das Fenster deckend füllt (wie heute `TV_RECHTECK`) |

Summe ca. 7900 ms; `mindestMs` in `home.js` entsprechend (Summe der Abschnitte, eine
Quelle für die Zahlen). Die Platte dreht ab Abschnitt 2 bis zum Ende weiter.

### Fernseher

- Während 0–3 zeigt der TV **aus** (`raum-tv-aus.png`), auch wenn vorher etwas lief
  (der TV „geht an“ erst in 4). Heute setzt `ladeWert` das Bild schon zu Beginn
  (`HomeRaumDom.setzeTv`); neu wird es erst in 4 sichtbar.
- Bild in 4: live = `HomeBuehne.vorschauUrl(login, jetzt)`; **VOD = Vorschaubild des
  VODs** (Janis 12.11.; heute bleibt der TV beim VOD aus). Das Vorschaubild steht in der
  VOD-Liste (`vods.liste[i].thumb` in `home.js`; geladen wird ein VOD über
  `vod: (id) => ladeWert(id, herausgenommen && herausgenommen.kanal)`, das Bild also per
  `id` aus `vods.liste` holen).
- Lädt das Bild nicht (Fehler/zu spät), flackert der TV trotzdem und bleibt dann dunkel
  (aus-Bild); der Ablauf läuft weiter.

### Festlegungen des Hauptchats (nach der Bauenden-Prüfung, Janis prüft beim Lesen)

- **Freie Faktoren statt ganzzahliger:** Kamera-Lagen und Zwischenstufen dürfen krumm
  skaliert sein (`image-rendering: pixelated` bleibt). Das ist schon heute so: der Raum
  füllt das Fenster mit nicht ganzzahligem Faktor (Runde 2), der Regal-Zoom an Ort nutzt
  2,5. `Raum.kameraZiel` (Math.ceil) wird für den Ablauf nicht mehr gebraucht.
- **Laden dauert länger als der Ablauf:** Die Kamera bleibt am Ziel (TV-Bildschirm füllt
  das Fenster, Vorschau läuft), bis das Laden fertig ist – das ist das Ziel der Fahrt,
  kein Stillstand im Zoom auf den Plattenspieler. Kein eigener Wartezustand.
- **TV außerhalb des Ablaufs:** wie heute über `zeichneTv()` (zeigt, was gerade läuft).
  Überspringen: Home schließt nach dem Laden wie heute. Fehler: `versteckeAblauf` +
  nächstes `renderHome` setzen den TV auf den laufenden Stand zurück. Neu ist nur, dass
  `ladeWert` das neue Bild nicht mehr sofort setzt, sondern es dem Ablauf für Abschnitt 4
  übergibt.
- **VOD ohne Eintrag in `vods.liste`:** kein Nachladen; der TV flackert und bleibt dunkel.

### Unverändert

- Überspringen per Klick/Taste (Doppelklick nicht), Fehler setzt alles zurück + Hinweis.
- Nur mit Animationen an; „Animationen aus“: kein Ablauf (wie heute).
- Am Ende schließt Home, das echte Video übernimmt (heutiger Weg über `laufwerk`).

## Tests (Pflicht)

- Unit (`test/raum.test.js`): für alle `GROESSEN` plus 700×900:
  - Fixpunkt-Rechnung: Bei jeder Zwischenstufe t ∈ {0, .25, .5, .75, 1} bleibt F am
    selben Bildschirmpunkt (±1 px).
  - Abschnitt 1: Plattenspieler ganz im Fenster, Höhe ≈ `spielerAnteil` × Fensterhöhe.
  - Abschnitt 6: TV-Bildschirm deckt das Fenster am Ende.
- Statisch (`test/home-raum.test.js`): Reihenfolge der Abschnitte, TV erst in 4 an,
  Flacker-Schritte, Dauer-Summe = `mindestMs`, VOD-Vorschau beim VOD.
- `npm test` grün vor jedem Commit.

## Dem Bauenden überlassen

- Technik der Fixpunkt-Animation (CSS-Transition mit `transform-origin`, Web Animations
  API o. ä.), solange der Fixpunkt-Test gilt und „Animationen aus“ greift.
- Genaue Flacker-Schritte (hart, ohne Überblendung, ca. 700 ms gesamt).
- Aufteilung in Funktionen.

## Abnahme

Janis schaut in der App an (installierte App vorher schließen, Dev-Stand per
`npm start`), mehrere Fenstergrößen inkl. Ultrawide bildschirmfüllend, live und VOD,
Überspringen. Zahlen (Dauern, `spielerAnteil`) werden danach nach Janis' Urteil angepasst.
