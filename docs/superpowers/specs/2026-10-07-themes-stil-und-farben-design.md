# Themes Welle 1b: Stil, Deko, Farben, Video-Balken

**Stand:** 2026-10-07
**Baut auf:** `2026-10-07-lebendige-themes-design.md` (Welle 1, umgesetzt auf
`feat/sammel-verbesserungen`).
**Ausgangslage:** Die vier neuen Themes faerben nur um. Janis: „koi sieht auch
null nach teich aus und sakura auch zu kahl", „das theme [soll] auch passen mit
schrift und so und boxen usw", „wenn man ein weisses theme nimmt kann dann die
balken über und unter dem video auch weiss sein", „die farbe anpassen wäre schon
gut … oft gefallen mir die farben nicht so ganz", „man soll blüten ändern also
die partikel".

## Ziel

1. Jedes neue Theme ist **durchgestylt**: Schrift, Kaesten, Knoepfe, Abzeichen
   und eine feste **Deko** im Stil des Themes — in Home, Leisten, Chat,
   ⚙-Popup und Galerie. Abgestimmt am 2026-10-07 per Vorschau:
   **Sakura · Bluetenzweig**, **Wald · Waldhuette**, **Koi · Teich von oben**,
   **Seifenblasen** (wie gezeigt).
2. Die **Balken ueber/unter dem Video** haben die Hintergrundfarbe des Themes.
3. Pro Theme sind **Akzent, Hintergrund und Partikel** frei waehlbar, pro Theme
   gemerkt, mit „Zuruecksetzen".

## Nicht-Ziele

- **Neon Dual** aendert sich nicht (kein neuer Stil, Balken bleiben schwarz,
  Farbwaehler wie bisher).
- Keine Web-Fonts: nur Windows-11-Systemschriften (Candara, Segoe Script,
  Georgia, Yu Gothic UI, Bahnschrift) — offline, keine Lizenzfragen.
- Deko ist **statisch** (CSS, keine Dauer-Animation). Bewegung kommt weiter nur
  aus den Welten; bei Effekte „Aus" bleibt die Deko stehen, bewegt sich aber
  nicht. Ausnahme: die schon vorhandenen kurzen UI-Animationen der App.
- Wellen 2/3 (weitere Themes) bleiben offen.

---

## 1. Stil pro Theme

Alles in `renderer/themes/<id>/theme.css`, gilt in beiden Fenstern
(Selektoren, die im jeweils anderen Fenster nicht existieren, greifen dort
einfach nicht). Jede Theme-CSS setzt zusaetzlich:

```css
:root[data-theme="<id>"] {
  --schrift: <Fliesstext>;
  --schrift-titel: <Titel>;
}
```

`chat.css` und das Video-`<style>` nutzen `font-family: var(--schrift, <bisher>)`
fuer `body` und `var(--schrift-titel, inherit)` fuer Titel (`#title`,
`#home-title`, `.lc-name`, `.fav .name`, `.galerie-kopf`, `.opt-group-title`).

| Theme | Schrift / Titel | Kaesten | Knoepfe/Tabs | Abzeichen | Deko |
|---|---|---|---|---|---|
| Sakura | Candara / Segoe Script | 18–20 px Rundung, `#fffafc`, rosa Rand + weicher Schatten | 12 px rund, rosa | LIVE mit 🌸 | Kirschzweig mit Blueten ueber dem Home-Kopf; Bluete an der Live-Karte; ✿ an Offline-Zeilen |
| Wald | Georgia / Georgia kursiv | Holzmaserung (dunkel), 2 px Rinde-Rand, harter Schlagschatten, Moos-Kante oben | Holz, 3 px Rundung | LIVE rot auf Holz | Baum-Silhouetten am unteren Rand (Home + Chat) |
| Koi | Yu Gothic UI / Yu Gothic UI Light, gesperrt | Glas auf Wasser: halbtransparent + `backdrop-filter: blur(3px)`, feiner heller Rand; Offline-Zeilen als Pille | Orange-Rand transparent | LIVE als rote Sonne (Kreis) | Seerosenblaetter mit Bluete, Steine, statische Wasserringe; Kopfleiste als Holzsteg |
| Seifenblasen | Bahnschrift / Bahnschrift | 22 px Rundung, schillernder Regenbogen-Rand (border-image-Technik) | Pillen, Verlauf auf Primaerknoepfen | Pille | keine feste Deko (die Welt ist die Deko) |

**Betroffene Elemente** (Klassen aus dem Bestand):
Home `#home-head`, `#auth-bar`, `.live-card` (`.lc-*`), `.fav` (`.avatar`,
`.badge`, `.actions`), `.vod`, `#home-head button`; Video-Leiste `#bar`,
`#load`, `#channel`, `#home-btn`; Chat `#head`, `.msg`, `#composer`,
`#chat-input`, `#chat-send`, `#footer`, `#points-chip`, `#settings-pop`,
`.galerie-karte`, `#theme-galerie`.

**Koi braucht Durchsicht:** damit die Fische zwischen den Karten sichtbar
schwimmen, sind `.live-card`, `.fav`, `.vod` und die Chat-Flaechen bei Koi
halbtransparent; `#fx-hinten` liegt darunter (Welle 1).

## 2. Deko-Ebene

Neues Element je Fenster, rein dekorativ, nie klickbar:

- Video: `<div class="theme-deko" aria-hidden="true">` als zweites Kind von
  `#home` (nach `#fx-hinten`), `position:absolute; inset:0; z-index:0`.
- Chat: `<div id="theme-deko" class="theme-deko" aria-hidden="true">` direkt
  nach `#fx-vorn`, `position:fixed; inset:0; z-index:0`.
- Beide: `pointer-events:none; overflow:hidden`. Inhalt kommt nur aus der
  Theme-CSS (`::before`/`::after`, Hintergruende). Ohne Theme-CSS (Neon) leer.

## 3. Video-Balken in Theme-Farbe

- `video.js` schickt bei jedem `applyTheme` und nach jedem Player-Mount an das
  Player-iframe: `iframe.contentWindow.postMessage({ source: 'twitchdual-theme', balken: <css-farbe|null> }, '*')`.
  `balken` = effektive Hintergrundfarbe des Themes (deckend), bei Neon `null`.
- `preload.js` (Twitch-iframe-Zweig) lauscht darauf und pflegt ein
  `<style id="twitchdual-balken">`: bei Farbe
  `video, .video-player, .video-player > div { background-color: <farbe> !important; }`,
  bei `null` wird das Style-Element entfernt. Nur Farbwerte, die
  `/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i` erfuellen, werden uebernommen
  (keine CSS-Injektion ueber die Nachricht).
- Gemessen 2026-10-07: das `<video>` fuellt das iframe, die Balken sind der
  schwarze Hintergrund der Player-Container — ein Hintergrund am `<video>`
  faerbt genau diese Flaechen.

## 4. Farben pro Theme

**Prefs:** `themePrefs.anpassungen = { [themeId]: { akzent?, hintergrund?, partikel? } }`
(Hex-Strings, fehlend = Original). Saeuberung in `themes.js`:
nur bekannte Theme-IDs ausser `neon-dual`, nur die drei Schluessel, nur gueltige
Hex (`normalizeHex`), sonst weglassen. `mergeThemePrefs` mischt `anpassungen`
**pro Theme** (Update `{ anpassungen: { koi: {...} } }` laesst Sakuras
Anpassungen stehen).

**Originalfarben** je Theme stehen in `THEMES` (`farben: { akzent, hintergrund, partikel }`),
damit Farbwaehler und „Zuruecksetzen" sie kennen.

**Ableitung** (neu in `theme.js`, DOM-frei, getestet):
`flaechenVars(hintergrundHex, alphaPct) → { --bg, --panel, --hover, --line, --text, --muted, --ts }`
— `--panel`/`--hover` 6 %/12 % Richtung Kontrast verschoben, Textfarben nach
Leuchtdichte des Hintergrunds (hell → dunkle Schrift, dunkel → helle Schrift).
`istHell(hex) → boolean` (relative Leuchtdichte > 0,5).

**Anwenden (Runtime):** nach der Theme-CSS setzt die Runtime fuer jedes
vorhandene Feld Inline-Variablen (Inline schlaegt die CSS):
- `akzent` → `--accent`, `--accent-title`, `--accent-border`, `--accent-glow`,
  `--accent-dim`, `--accent-contrast` (Teilmenge von `accentVars`).
- `hintergrund` → `flaechenVars(...)`.
- Fehlt ein Feld, wird die zugehoerige Inline-Variable entfernt (Theme-CSS gilt).
- `<html data-hell="1|0">` nach effektivem Hintergrund (Anpassung oder
  `THEMES[id].hell`); die Namensfarben-Abdunklung haengt kuenftig daran statt am
  Theme: `:root[data-hell="1"] .msg .user, :root[data-hell="1"] #uc-name { color: color-mix(in srgb, var(--name) 45%, #000); }`
  (45 % statt 55 %: Review-Minor M4, ~4,5:1). Die Regeln in
  `sakura/theme.css` und `blasen/theme.css` entfallen.

**Partikel:** Welten bekommen `farben.partikel` (effektiv: Anpassung oder
Original) im Kontext: `fabrik({ engine, fenster, FxEngine, farben })`. Aendert
sich nur die Partikelfarbe, startet die Runtime die Welt neu (kurz, unsichtbar).
- Sakura zeichnet Blueten als Form statt Emoji:
  `{ width, height, borderRadius: '150% 0 150% 0', background: farbe }` mit
  hellerem Verlauf zur Mitte.
- Wald: Gluehwuermchen-Farbe + Schein; Koi: Koerper- und Schwanzfarbe;
  Seifenblasen: Tönung des Schillerrings; Neon: unveraendert (nutzt On-Air-Farben).

**UI (⚙-Popup):** Bei Neon bleibt `#opt-neon-farben`. Bei jedem anderen Theme
erscheint stattdessen `#opt-theme-farben` mit drei Farbwaehlern **Akzent /
Hintergrund / Partikel** und „Farben zurücksetzen". `input` → Vorschau
(`previewThemePrefs`), `change` → Speichern
(`saveThemePrefs({ anpassungen: { [id]: {...} } })`); Zuruecksetzen speichert
`{ anpassungen: { [id]: {} } }`.

## 5. Fehlerverhalten

- Ungueltige Anpassungen im Store fallen still weg (Original).
- postMessage ans iframe vor dessen Laden: wird nach jedem Mount wiederholt; geht
  sie verloren, bleibt der Balken schwarz — kein Fehler.
- Unbekannte Farbwerte in der iframe-Nachricht werden ignoriert.

## 6. Tests

- `test/theme.test.js`: `flaechenVars` (hell/dunkel → Textfarbe, Alpha auf
  Flaechen), `istHell`.
- `test/themes.test.js`: Saeuberung `anpassungen` (Muell, neon-dual, fremde
  Schluessel), `mergeThemePrefs` pro Theme, `THEMES[*].farben` vollstaendig.
- `test/theme-runtime.test.js`: Anpassungen setzen/entfernen Inline-Variablen,
  `data-hell` folgt dem Hintergrund, Partikel-Aenderung startet Welt neu, Akzent-
  Aenderung nicht.
- `test/balken-farbe.test.js`: Farbwert-Filter fuer die iframe-Nachricht
  (reine Funktion `istSichereFarbe`, in `renderer/lib/themes.js`).
- `test/welten.test.js`: Welten uebernehmen `farben.partikel`.
- Live (CDP): je Theme Screenshots Video-Home, Video-Leiste, Chat, ⚙-Popup;
  Balkenfarbe im iframe per Browser-Session gemessen; Farbwaehler aendern →
  Variablen + Partikel; Neon unveraendert (Vergleichsscreenshot).

## 7. Betroffene Dateien

| Datei | Aenderung |
|---|---|
| `renderer/lib/theme.js` | `flaechenVars`, `istHell` |
| `renderer/lib/themes.js` | `farben` je Theme, `anpassungen` saeubern/mischen, `istSichereFarbe` |
| `renderer/lib/theme-runtime.js` | Anpassungen, `data-hell`, Partikel-Neustart, `farben` an Welt |
| `renderer/themes/*/theme.css` | voller Stil + Deko + Schrift |
| `renderer/themes/*/welt.js` | Partikelfarbe; Sakura als Bluetenform |
| `renderer/chat/{index.html,chat.css,chat.js}` | Deko-Ebene, Schrift-Variablen, Theme-Farbwaehler, generische Namensregel |
| `renderer/video/{index.html,video.js}` | Deko-Ebene, Schrift-Variablen, Balken-Nachricht |
| `preload.js` | Balken-Style im Twitch-iframe |
| `test/*` | siehe 6. |
