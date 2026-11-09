# Home als CD-Bühne – Design

Stand: 09.11.2026, nach drei Prüfrunden überarbeitet · Branch: `feat/home-cd`
(auf `feat/eingabe-feld`). Prüfberichte: [egm-home-cd/](egm-home-cd/).

## Begriffe

- **TwitchDual:** Electron-App, Twitch-Stream im Video-Fenster, Chat in eigenem Fenster.
  **Home** ist eine Ebene im Video-Fenster, die *über* dem weiterlaufenden Player liegt
  (darum die Leistungsregeln). Öffnen über ☰ in der Video-Leiste.
- **Janis** ist der Auftraggeber und entscheidet Design/Optik; **Claude** baut und
  entscheidet Technik (markiert als „Claudes Wahl“).
- **Anmeldung:** Für Janis *ein* Knopf „Mit Twitch anmelden“, technisch zwei Teile:
  Chat/gefolgte Kanäle (Device-Flow) und Kanalpunkte (Web-Login), zusammengefasst in
  `renderer/lib/anmeldung.js`. Die Anmeldung ist *unvollständig*, wenn nur ein Teil da ist.
- **Effekte-Regler:** Stufe der Theme-Animationen im 🎨-Fenster des Chats. Bei „Aus“
  startet `ThemeRuntime` keine Welt, keinen Timer.
- **Prüfrunden (EGM):** Durchsichten durch frische Helfer ohne Vorwissen.
- **IPC-Aufrufe** (Renderer → Main, Name im Preload in Klammern): `home-kanaele`
  (`homeKanaele`), `kanal-suche` (`kanalSuche`), `channel-vods` (`channelVods`);
  neu: `home-punkte` (`homePunkte`).

## Warum

Janis findet den Homescreen langweilig: „alles nebeneinander“, kein Seitwärts-
Scrollen, zu klein, sieht aus wie eine 0815-Website. Er soll größer, ästhetischer,
moderner und **kreativ im Aufbau** sein, ausdrücklich nicht „KI-Slop“ (Verläufe +
Glaskarten + Kartenraster). Die gezeichneten, animierten Theme-Welten (Sakura, Koi,
Wald, Blasen, Neon Dual) sind ein Markenzeichen der App und gehören sichtbar zu Home.

**Erfolg:** Home öffnen fühlt sich an wie ein Album in die Hand nehmen: ein großer
Live-Kanal steht als CD im Mittelpunkt, mit dem Mausrad blättert man durch die
Live-Kanäle, die eigene Welt lebt dahinter. Einen Kanal findet man mit denselben
Tasten wie heute (Login tippen → Enter lädt ihn).

## Ziele / Nicht-Ziele / Anti-Ziele

- **Ziele:** CD-Bühne für Live-Kanäle; drei Bild-Ebenen (Welt · Riesen-Namen · CD);
  alle heutigen Funktionen bleiben erreichbar (siehe „Bleibt / geändert / entfällt“).
- **Nicht-Ziele:** Chat-Fenster; neue Datenquellen (Ausnahme: Feld `createdAt` in
  bestehenden Abfragen); Wischgesten.
- **Anti-Ziele (Fehlschlag, selbst wenn es technisch läuft):**
  - Es sieht doch wieder aus wie ein Kartenraster mit Farbverläufen.
  - Einen bestimmten Kanal zu finden braucht mehr Tasten/Klicks als heute.
  - Die Welt im Hintergrund wird zugedeckt oder ruckelt (messbar, siehe Abnahme).

## Von Janis entschieden

| Thema | Entscheidung |
|---|---|
| Grundidee | Kombination aus „Riesen-Namen“ und „Plattenspieler“, modern als **CD** |
| Ebenen | hinten die gezeichnete, animierte Theme-Welt; darüber Riesen-Namen als langsam gleitender Hintergrund; vorne die CD |
| CD | Glas-Hülle, Cover = Vorschaubild des Streams; CD schaut halb heraus und dreht sich |
| CD-Aufdruck | Motiv der aktiven Welt statt Regenbogen (Sakura: Kirschblüten, Koi: Koi, Wald: Blätter, Blasen: Blasen, Neon Dual: Neon-Linien) |
| Rechts daneben | Stream-Titel groß, Laufzeit + Zuschauer, darunter die nächsten Live-Kanäle als kleine Cover |
| Blättern | Mausrad wechselt die CD: sie gleitet zurück in die Hülle, die nächste kommt heraus |
| Suche | Bühne bleibt; Tippen fährt sofort die passende Live-CD heraus, Enter lädt; Offline- und „Auf Twitch“-Treffer erscheinen unten im Regal |
| Regal | nur ★-Favoriten, die offline sind; alle übrigen Offline-Kanäle nur über die Suche |
| VODs | Klick auf „VODs“ dreht die Hülle um; auf der Rückseite stehen die VODs als nummerierte Tracklist |
| Namen antworten | der Name der gerade gezeigten CD leuchtet in der Riesen-Schrift auf und gleitet langsamer |
| Kanalpunkte | runder Sticker auf der Hülle mit deinem Punktestand in diesem Kanal (nur angemeldet) |
| Animationen | immer an, `prefers-reduced-motion` bewusst ignoriert (App-weite Entscheidung) |

## Erwogene Alternativen

**Gesamtkonzepte** (als Skizzen gezeigt, Janis hat gewählt):
- *Regale* (großer Kanal oben, Kartenreihen darunter) und *Bento-Kacheln*: verworfen,
  sehen nach dem Kartenraster aus, das ein Anti-Ziel ist.
- *Bühne/Karussell* und *Kreise + große Karten*: Karussell-Idee lebt im CD-Blättern
  weiter; als eigenes Konzept zu nah an üblichen Streaming-Apps.
- *Zapping-Wand* (Röhrenfernseher), *Leine in der Welt* (Polaroids), *Plattenkiste*:
  Janis fand die Verkleidung zu wenig neu im Aufbau; nur die Platte blieb und wurde CD.
- *Zeitstrahl*: verworfen, zeigt Daten statt Gefühl; zu verkopft für einen Startbildschirm.
- *Album mit Tracklist*: CD gewählt, weil sich Hülle + drehende CD lebendiger anfühlt.

**Darin enthaltene Wahlen** (aus der Prüfung):
- *Suche schaltet auf die heutige Liste um*: schnellster Weg, aber Bruch in der Bühne;
  Janis wollte, dass die Bühne bleibt. Folge: feste Enter-Reihenfolge (unten), damit
  Finden nicht langsamer wird.
- *Regal mit allen ~300 Offline-Kanälen*: Janis wollte nur Favoriten. Folge: übrige
  Offline-Kanäle nur per Suche.
- *Home ohne Scrollen vs. Rad-Zonen*: Home scrollt nicht mehr senkrecht; das Rad
  blättert über der Bühne und scrollt waagerecht über dem Regal (Claudes Wahl, weil
  es keine konkurrierenden Scroll-Richtungen gibt).

**Technik** (Claudes Wahl):
- *Namen-Ebene als Canvas*: verworfen; DOM-Zeilen mit CSS-Animation sind einfacher,
  per GPU verschoben und reichen für 6 Zeilen.
- *Echtes Glas mit `backdrop-filter`, Schimmer mit `mix-blend-mode`*: verworfen,
  beides wird jedes Bild neu berechnet, solange dahinter Welt und Namen laufen.
- *Kanalpunkte aus dem Chat-Fenster übernehmen*: der Chat kennt nur den Kanal, der
  läuft; Home braucht beliebige Kanäle → eigener IPC-Aufruf.
- *Aktuelle CD per Position*: verworfen, springt beim Aktualisieren; per Login.
- *Offline gegangene vordere CD automatisch austauschen*: verworfen (Timer, Hover-
  Abfrage, Ersatzwahl); sie bleibt markiert stehen, bis man weiterblättert.
- *Vorschaubild über die GQL-Abfrage vergrößern*: verworfen; die vorhandene
  `previewUrl` (static-cdn, Größe im Dateinamen) braucht nur eine andere Größe.

## Aufbau

**Drei Bild-Ebenen** (von hinten nach vorne):
1. **Welt:** ist schon da (`#home > #fx-hinten`, `.theme-deko`, gesteuert von
   `ThemeRuntime` in `video.js`). Keine neue Arbeit, wird nur nicht mehr zugedeckt.
2. **Riesen-Namen:** 6 Zeilen, Großbuchstaben, ~12–15 % der Home-Höhe. Die
   **Mittelzeile** (Zeile 3) zeigt nur den Namen der aktuellen CD, voll leuchtend, und
   driftet sehr langsam; beim CD-Wechsel blendet sie auf den neuen Namen über (keine
   Schleife, darum kein Sprung). Die übrigen 5 Zeilen laufen als Endlos-Schleife
   seitwärts (abwechselnd links/rechts, eine Runde 60–90 s) mit den Namen aus der
   Namen-Auswahl: gefüllt und sehr durchscheinend für live, nur Umriss für offline.
   Rein dekorativ, nicht klickbar. (Mittelzeile = Claudes Umsetzung von „Namen
   antworten“; sie vermeidet Sprünge in laufenden Schleifen.)
3. **CD-Bühne:** links/mittig die CD (Glas-Hülle + halb herausgefahrene, drehende CD),
   rechts der Info-Block mit Titel, Laufzeit, Zuschauern und den kleinen Nachbar-Covern.

**Bedienbereiche:**
- **Kopfzeile:** Suchfeld, ⟳, ✕ (wie heute). Darunter, wie heute getrennt, die
  Anmelde-Leiste `#auth-bar` und die Hinweiszeile `#home-hinweis` (siehe Zustände).
- **Regal (unten):** Offline-Favoriten als schmale CD-Rücken (Name senkrecht) in einer
  waagerechten Reihe; während der Suche stattdessen Offline- und Twitch-Treffer.
- **Versionsanzeige** unten rechts, klein, wie heute.

**Kleine Fenster:** Home schmaler als ~900 px → Info-Block rutscht unter die CD;
niedriger als ~520 px → nur 3 Namenszeilen (Mittelzeile bleibt), Regal schmaler.
(Claudes Wahl, Schwellen beim Bau feinjustieren.)

## Verhalten

### Reihenfolge und Aktualisierung

- **Reihenfolge der CDs:** erst Abschnitt `favoriten`, dann `live` aus
  `HomeListe.abschnitte`. `favoriten` enthält nur *live* Stern-Kanäle, `live` nur
  Kanäle ohne Stern – keine Doppelten, keine Offline-CDs. `live` kommt aus Main nach
  Zuschauern sortiert. Keine eigene Sortierung.
- **Die Reihenfolge wird beim Öffnen von Home festgelegt.** Danach gilt bis zum
  nächsten Öffnen: Aktualisieren (alle 60 s und per ⟳, beide gleich) frischt nur Werte
  auf (Zuschauer, Titel, Laufzeit, Vorschaubild); neu live gegangene Kanäle werden
  hinten angehängt, auch Favoriten; Stern-Klicks ändern die Reihenfolge nicht.
- **Aktuelle CD = Login, nicht Position.**
- **Kanal geht offline:** Nicht-vordere CDs fallen beim Aktualisieren still aus der
  Reihe (offline Favoriten erscheinen dann im Regal). Die vordere CD wird nur als
  „offline“ markiert (▶ aus, CD steht) und bleibt stehen; sie fällt aus der Reihe,
  sobald man weiterblättert oder Home neu öffnet.
- **Namen-Auswahl** (Zeilen 1,2,4,5,6): beim Öffnen festgelegt, höchstens 20 Namen:
  erst Live-Kanäle in CD-Reihenfolge, dann Offline-Favoriten alphabetisch; Zeilen
  werden mit Wiederholungen gefüllt. Keine Änderung beim Aktualisieren.

### Bedienung

- **Mausrad über der Bühne:** blättert eine CD pro Schwelle (Ausschläge werden
  gesammelt, kurze Sperre nach jedem Wechsel gegen Touchpad-Nachlauf). Am Ende ein
  sanfter Anschlag, kein Endlos-Kreis. Weite Sprünge gehen über die kleinen Cover.
- **Mausrad über dem Regal:** scrollt das Regal waagerecht.
- **↑/↓:** blättern, auch wenn das Suchfeld den Fokus hat; ist die Rückseite offen,
  dreht der erste Druck sie zurück. **←/→** gehören dem Suchfeld.
- **Esc**, in dieser Reihenfolge: Offline-CD angezeigt → zurück zur aktuellen
  Live-CD der Reihe (die Reihe merkt sich ihre CD ohnehin per Login); Rückseite einer
  Live-CD offen → zurückdrehen; sonst Home schließen.
- **Klick auf Cover oder ▶:** Stream laden, Home schließt. Das ▶ ist ein runder Knopf
  unten rechts auf dem Cover.
- **Auf der Hülle** bei Hover *oder Tastatur-Fokus*: ☆/★ und „VODs“. Auch Regal-Rücken
  zeigen bei Hover/Fokus ☆/★.
- **Kleine Cover rechts:** Klick springt direkt zu dieser CD.
- **VOD-Rückseite:** Hülle dreht sich um (3D per `transform`). Tracklist der letzten
  **8** VODs (Nummer, Titel, Länge, Datum) aus `channelVods` (es werden 9 geladen; gibt
  es einen 9., erscheint „Mehr“ → bisherige VOD-Ansicht). Klick auf einen Track lädt das
  VOD. Passt ohne Scrollen in die Hülle.

### Suche

- Tippen filtert wie heute (`HomeListe.abschnitte`, Name/Spiel/Titel). Die Bühne
  springt auf den **besten Live-Treffer**: Login/Name beginnt mit dem Suchtext →
  enthält ihn → Treffer in Spiel/Titel.
- Man blättert nur durch die Live-Treffer; die kleinen Cover zeigen die nächsten
  Treffer; die Namen-Ebene bleibt (bis auf die Mittelzeile, die der vorderen CD folgt).
  Suchfeld geleert → die CD von vor der Suche kommt zurück.
- **Enter**, feste Reihenfolge:
  1. VOD-Link oder VOD-ID → VOD laden (heutiges `enterLaden`).
  2. Suchtext ist genau Login oder Name eines eigenen Kanals → diesen laden (ohne Netz,
     sofort).
  3. Läuft die `kanal-suche` zum aktuellen Text noch, wird sie abgewartet (höchstens
     ~1,5 s). Ist ihr `exakt` ein Treffer → diesen Kanal laden.
  4. Vordere CD ist ein Präfix-Treffer auf Login/Name → sie laden.
  5. Sonst heutiges `enterLaden` (getippten Text als Login laden).
  So lädt schnelles Tippen eines fremden Logins nie einen eigenen Kanal mit längerem Namen.
- **Regal während der Suche:** Offline-Treffer (Favoriten vorne), dahinter
  „Auf Twitch“-Treffer (Rücken mit ✓ bei verifizierten). `kanal-suche` läuft mit
  Laufnummer wie heute; veraltete Antworten werden verworfen; scheitert sie, fehlt der
  Twitch-Teil still.
- **Klick auf einen Rücken (offline, auch offline Twitch-Treffer):** Die Bühne zeigt
  diesen Kanal als *Offline-CD*: Cover = Profilbild groß, entsättigt, CD steht, kein ▶,
  kein Kanalpunkte-Sticker; Hülle sofort umgedreht mit VOD-Tracklist. Mausrad/↑↓ oder
  Esc führen zur aktuellen Live-CD der Reihe. Ein live Twitch-Treffer im Regal lädt
  direkt. (Claudes Wahl.)

### Kanalpunkte-Sticker

- Nur wenn der Kanalpunkte-Teil der Anmeldung da ist. Zeigt Punkte-Symbol und Zahl,
  auch bei 0. Symbol mit derselben Rückfallkette wie im Chat (Kanal-Symbol `iconUrl` →
  `renderer/lib/points-icon.js` → eingebautes SVG); `iconUrl` fehlt bei etwa der Hälfte
  der Kanäle.
- Abgefragt nur für die vordere Live-CD, erst nach ~400 ms Stillstand, Ergebnis 5 min
  gemerkt. Eine Antwort wird nur übernommen, wenn ihr Login noch vorne steht.
- Antwort `{ ok, balance, iconUrl, error }`. Bei Fehler kein Sticker; bei abgelaufener
  Anmeldung (401) oder „gesperrt“ bis zum nächsten Öffnen keine weiteren Abfragen.

## Zustände (wo was steht)

- **Anmelde-Leiste** `#auth-bar` (wie heute): Anmeldestand, „Anmeldung unvollständig
  – …“, Anmelde-Knopf.
- **Hinweiszeile** `#home-hinweis` (wie heute, `renderHinweis` unverändert):
  „Gefolgte Kanäle nicht abrufbar: …“, „Mit Twitch anmelden, um deine gefolgten
  Kanäle zu sehen.“
- **In der Hülle** statt Cover:
  - „Gerade spielt niemand“ – keine Live-Kanäle (ohne Suche).
  - „Kein Live-Treffer – unten im Regal“ – Suche mit eigenen Offline-Treffern, aber
    keinem Live-Treffer.
  - „Keine eigenen Kanäle passen“ – Suche ohne eigene Treffer (Twitch-Treffer ggf. im Regal).
  - „Noch keine Kanäle – oben suchen und mit ☆ merken“ – gar keine Kanäle.
  - Beim ersten Laden: schimmernde leere Hülle.
- **Vorschaubild lädt nicht:** Cover = Profilbild des Kanals groß, sonst Theme-Farbe.
- **VOD-Liste leer/Fehler:** Rückseite zeigt „Keine VODs“ bzw. „VODs nicht abrufbar“.
- **Effekte „Aus“:** keine Welt (wie heute bei „Aus“), Namen stehen still, CD dreht
  nicht. CD-Wechsel und Hülle-Drehen bleiben animiert (Bedienung). Jede andere Stufe:
  volle Bühnen-Animation.

## Bleibt / geändert / entfällt

**Bleibt:** Suchfeld mit Fokus beim Öffnen; ⟳ und automatisches Aktualisieren (60 s);
✕; Esc schließt (nach den Regeln oben); Stern-Favoriten; „Auf Twitch“-Treffer ab 2
Zeichen; Anmeldung; alle Hinweise (jetzt in Hinweiszeile bzw. Hülle); Platzhalter beim
ersten Laden; Versionsanzeige; bisherige VOD-Ansicht (über „Mehr“).

**Geändert:** Enter folgt der festen Reihenfolge oben (VOD → exakter eigener Kanal →
exakter Twitch-Treffer → Präfix-Treffer vorne → `enterLaden`); VODs öffnen zuerst auf
der Hüllen-Rückseite; Sterne auf Hülle und Regal-Rücken.

**Entfällt:** Kartenraster; einklappbare Abschnitte samt `HomeAbschnitte` (Script-Tag
in `renderer/video/index.html`, `renderer/lib/home-abschnitte.js`,
`test/home-abschnitte.test.js`, localStorage-Schlüssel `homeAbschnitteZu`); der
Offline-Abschnitt mit allen gefolgten Kanälen (nur noch per Suche); senkrechtes
Scrollen von Home.

## Daten

- `createdAt` am Stream in beiden Abfragen, die `mapLiveUser` füttern (users-Abfrage
  und `findChannel`-Abfrage in `src/twitch-browse.js`; das Feld wird dort in der
  Stream-Info-Abfrage schon genutzt) → `mapLiveUser` liefert `start` (oder `null`).
  Laufzeit wird im Renderer berechnet; ohne `start` keine Laufzeit.
- Vorschaubild: die vorhandene `previewUrl(login)` in `home.js` (static-cdn, Größe im
  Dateinamen, Cache-Buster pro Minute) mit `-640x360` statt `-440x248`. Die GQL-Felder
  `thumb`/`previewImageURL` bleiben unberührt. Vorschaubilder der beiden Nachbar-CDs
  werden vorab geladen.
- Kanalpunkte: bestehende Abfrage `Q_CONTEXT` aus `src/twitch-points.js` über den
  neuen IPC-Aufruf `home-punkte(login)`. Main prüft das Login-Format
  (`^[a-z0-9_]{2,25}$`); der Token bleibt im Main.

## Technik (Claudes Wahl)

- Bestehende Logik bleibt: `HomeListe.abschnitte`, `home-kanaele`, Stern-Umschalten,
  `openVods`/`channel-vods`, `kanal-suche`, `enterLaden`.
- `renderer/lib/home-liste.js` (vorhanden, getestet) bekommt die Suchlogik dazu:
  bester Live-Treffer und Enter-Reihenfolge (neben `passt` und `enterLaden`).
- Neues DOM-freies Modul `renderer/lib/home-buehne.js` (UMD, unter Node getestet),
  nur Bühnenzustand: Reihenfolge festhalten + Anhängen, aktuelle CD per Login,
  Offline-Markierung, Blättern (Rad-Schwelle, Sperre, Anschlag), Namen-Auswahl.
- Kanalpunkte-Zwischenspeicher + Stillstand-Verzögerung als kleiner eigener Baustein
  (Uhr wird übergeben, testbar).
- Darstellung in `renderer/video/home-buehne-dom.js`; `home.js` bleibt für Laden,
  Suche, Anmeldung und VODs zuständig. Script-Reihenfolge in `index.html`:
  `home-liste.js` → `home-buehne.js` → `home-buehne-dom.js` → `home.js`.
- **Leistungsregeln:** Dauer-Animationen nur über `transform`/`opacity`; auf Home
  **kein `backdrop-filter` und kein `mix-blend-mode`**. Glas = halbtransparenter
  Verlauf + helle Kante; Aufdruck = feste Ebene, die per `transform: rotate` mitdreht.
  Namenszeilen mit `will-change: transform`.
- CD-Aufdruck je Welt: SVG-Motiv als Datei in `renderer/themes/<name>/` (neben
  `welt.js`, `stile.js`, `theme.css`), Rückfall Neon-Linien.

## Risiken und Fehlerfälle

| Risiko | Gegenmaßnahme |
|---|---|
| Ruckeln: zwei animierte Ebenen + drehende CD + laufender Player | Leistungsregeln; Abnahme-Messung; bei Überschreitung zuerst Namenszeilen reduzieren |
| Kanalpunkte-Abfrage mit Web-Token für viele Kanäle (inoffizielle API, Drosselung/Sperre möglich) | nur vordere CD, Stillstand-Verzögerung, 5-min-Speicher, Stopp nach 401/Sperre |
| Veraltete Antworten (Punkte, Suche) landen beim falschen Kanal | Punkte: Übernahme nur, wenn Login noch vorne; Suche: Laufnummer wie heute |
| Vorschaubild veraltet/lädt nicht | Cache-Buster; Rückfall Profilbild |
| VODs/Suche scheitern | Hinweis auf der Rückseite; Twitch-Teil fällt still weg |
| Finden langsamer durch Bühne / Enter lädt falschen Kanal bei schnellem Tippen | feste Enter-Reihenfolge mit Abwarten der Suche; Abnahme-Vergleich |
| `prefers-reduced-motion` ignoriert (Barrierefreiheit) | bewusste App-Entscheidung von Janis; Effekte „Aus“ stoppt alle Dauerbewegungen |

## Tests und Abnahme

Unter Node:
- `home-buehne.js` – Blättern: Anschlag, Rad-Schwelle, Sperre. Aktualisierung:
  Reihenfolge bleibt; Neue hinten; aktuelle CD bleibt per Login; vordere CD offline →
  markiert und bleibt, fällt beim Weiterblättern raus; Liste leer → kein Absturz.
  Namen-Auswahl: 0, 1 und viele Kanäle; höchstens 20; live → offline Favoriten.
- `home-liste.js` – Enter-Reihenfolge: VOD-Link; exakter eigener Kanal; exakter
  Twitch-Treffer schlägt Präfix-CD (auch wenn die Suche erst nach Enter ankommt);
  Präfix; Rückfall. Bester Suchtreffer: Präfix vor Enthält vor Spiel/Titel; kein
  Live-Treffer → null.
- Kanalpunkte-Baustein: Speicher 5 min, Stillstand, Antwort für nicht mehr vorderen
  Login verworfen, Stopp nach 401, ohne Anmeldung keine Abfrage.
- `mapLiveUser` liefert `start` bzw. `null`; `home-punkte` prüft Login-Format (Main-Test).

**Abnahme:**
- `npm test` komplett grün.
- Leistung: 10 s Home offen bei laufendem Stream im aufwendigsten Theme, Leistungs-
  mitschnitt über die Entwicklerwerkzeuge – keine Frames über ~33 ms.
- Finden: Login tippen + Enter lädt den Kanal (gleiche Tasten wie heute), auch wenn ein
  anderer Live-Kanal den Login im Titel oder als längeren Namen hat, und auch bei
  schnellem Tippen, während die Suche noch unterwegs ist.
- Janis bestätigt beim Anschauen die Mittelzeile als Umsetzung von „Namen antworten“.
- Anschauen macht Janis.

## Offen für später (nicht Teil dieses Baus)

Ideen aus der Prüfung, die nicht gewählt wurden, stehen im
[Prüfbericht](egm-home-cd/zoom_out_report.md) unter „Ideen“.
