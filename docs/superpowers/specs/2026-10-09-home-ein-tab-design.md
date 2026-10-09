# Home: ein Tab mit Stern-Favoriten und Suche — Design

Branch `feat/kanal-suche` (baut auf `feat/kanal-ereignisse` auf).

## Ziel

Janis findet bei ~300 gefolgten Kanälen (die meisten offline) nicht schnell den
gesuchten Kanal. Die getrennten Tabs „Gefolgt“ und „Favoriten“ sind dabei eher
Ballast. Die Vorschlagsliste oben im Kanal-Feld verwirrt, weil das Feld beim
Laden ohnehin mit dem Kanalnamen gefüllt wird.

**Erfolg:** Home öffnen, lostippen, der Kanal steht da: aus den eigenen Kanälen
oder als Treffer von ganz Twitch (auch offline, verifizierte mit ✓). Favoriten
sind ein Stern an jeder Karte und stehen ganz oben.

## Entscheidungen (mit Janis abgestimmt)

| Thema | Entscheidung |
|---|---|
| Tabs | „Gefolgt“ und „Favoriten“ fallen weg, es gibt eine Ansicht, Titel **Home** |
| Favoriten | Stern ☆/★ an jeder Karte; ★-Kanäle in eigenem Abschnitt ganz oben |
| Suche | ein Feld oben in Home (Platz und Verhalten wie heute bei Gefolgt) |
| Twitch-Treffer | Abschnitt „Auf Twitch“ unter den eigenen Kanälen, nur beim Suchen |
| Kanal-Feld oben | Vorschlagsliste kommt wieder raus; zurück zur Verlaufs-Datalist |

## Aufbau von Home (von oben nach unten)

1. **Suchfeld** (`#home-suche`) mit ⟳ daneben. Fokus beim Öffnen von Home.
   Filtert über Name, Spiel und Titel (bestehendes `matchesFilter`).
2. **★ Favoriten**: Stern-Kanäle; live als Vorschau-Karten, offline kompakt.
3. **Live**: gefolgte Kanäle, die gerade live sind, ohne Stern-Kanäle.
4. **Offline**: übrige gefolgte Kanäle, alphabetisch.
5. **Auf Twitch**: nur bei mindestens 2 Zeichen Suchtext. Twitch-Vorschläge
   (`browse.sucheVorschlaege`) und ein exakter Login-Treffer (`browse.findChannel`),
   ohne Kanäle, die schon in 2–4 stehen. Kompakte Karten, ✓ bei verifizierten,
   Spiel bei live.

Jeder Abschnitt ist einklappbar, der Zustand wird gemerkt (wie
`HomeAbschnitte`). Ein aktiver Suchtext klappt alle Abschnitte auf. Leere
Abschnitte fallen weg. Passt in 2–4 nichts zur Suche, steht „Keine eigenen
Kanäle passen“ über „Auf Twitch“.

**Stern:** Jede Karte (auch unter „Auf Twitch“) hat ☆/★. Ein Klick schaltet um
(`add-favorite`/`remove-favorite`), ändert das Flag im lokalen Stand und
zeichnet neu, ohne Netzabfrage. Der Klick löst nicht „Stream laden“ der Live-Karte aus.

**Ohne Anmeldung:** Favoriten + Suche + „Auf Twitch“, dazu der Hinweis
„Mit Twitch anmelden, um deine gefolgten Kanäle zu sehen“ (die bestehende
`#auth-bar` bleibt).

**Was wegfällt:** `#tab-followed`, `#tab-favorites`, `#fav-tools-toggle`, `#add-row`
(Hinzufügen-Feld), `#filter-row`, `#followed-view`, `#home-fav-view` (beide
gehen in eine Ansicht `#home-kanaele` auf). Die VOD-Ansicht bleibt unverändert.

## Daten

- **IPC `home-kanaele`** (ersetzt `get-followed` + `live-status` für Home):
  Favoriten aus dem Store, bei Anmeldung gefolgte Logins (Helix, wie bisher),
  dann Live-Status für die Vereinigung. Antwort
  `{ ok, angemeldet, kanaele: [{ ...mapLiveUser, favorit, gefolgt }] }`.
- **`browse.getLiveStatus` gebündelt:** `users(logins:[…])` in Blöcken zu 100
  (gemessen 09.10.2026: 100 Logins pro Abfrage, gleiche Reihenfolge, `null` für
  unbekannte). Unbekannte/fehlerhafte bleiben Platzhalter wie heute. Aus ~300
  Einzelabfragen pro Minute werden 3.
- **Favoriten-Speicher:** bleibt `store.favorites`; die bisherigen 13 Favoriten
  sind ohne Umzug Stern-Kanäle.
- **IPC `kanal-suche`** bleibt (`{ channels, exakt }`, anonym per GQL).
- Entfällt: `vorschlag-quellen`, `gefolgtCache`, preload `vorschlagQuellen`.

## Logik-Modul

`renderer/lib/home-liste.js` (DOM-frei, UMD, unter Node getestet). Ersetzt
`kanal-vorschlaege.js`; `mitExaktTreffer` zieht dorthin um.

- `abschnitte({ kanaele, nadel, twitch, exakt, zu })` →
  `[{ art: 'favoriten'|'live'|'offline'|'twitch', titel, kanaele, offen }]`
  - favoriten = `favorit`; live/offline = `gefolgt && !favorit`, nach `live`
  - Filter per Nadel auf 1–3; „twitch“ nur bei Nadel ≥ 2 Zeichen, ohne Logins
    aus 1–3, exakter Treffer per `mitExaktTreffer` eingereiht
  - Reihenfolge innerhalb: wie geliefert (Main sortiert live nach Zuschauern,
    offline alphabetisch)
- `HomeAbschnitte` (Klapp-Zustand) wird um `favoriten` und `twitch` erweitert;
  alter gespeicherter Zustand `{live, offline}` bleibt lesbar.

## Kanal-Feld oben

Zurück zum Stand vor `caf86d7`: `<datalist id="history">` + `refreshHistory`.
Vorschlags-Dropdown, `.vs-*`-Styles und Tastatur-Navigation werden entfernt.

## Fehlerfälle

- Helix-Fehler bei Gefolgt: Favoriten trotzdem zeigen, Hinweis „Gefolgte Kanäle
  nicht abrufbar“.
- `kanal-suche` scheitert: Abschnitt „Auf Twitch“ fehlt, still.
- Veraltete Suchantwort (Nutzer tippt weiter): per laufender Nummer verwerfen.

## Tests

- `home-liste.test.js`: Abschnittsbildung, Stern-Kanäle nicht doppelt, Filter,
  Twitch ohne Duplikate, Mindestlänge, exakter Treffer, leere Abschnitte.
- `home-abschnitte.test.js`: neue Arten und Lesen des alten Zustands.
- `twitch-browse.test.js`: gebündelter Live-Status (Blöcke à 100, `null` →
  Platzhalter, Sortierung).
- `npm test` komplett grün; anschauen macht Janis.
