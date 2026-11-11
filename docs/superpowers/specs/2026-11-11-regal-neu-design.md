# Regal neu – Entwurf

Stand: 11.11.2026, Branch `feat/cozy-raum`. Teil des Cozy-Raum-Rebuilds (`docs/superpowers/specs/2026-11-10-cozy-raum-design.md`).
Grundlage: Janis' Anmerkungen 7, 8a, 10, 11, 13 (`renderer/themes/cozy/entwuerfe/_ANSCHAUEN/ANMERKUNGEN.md`) und das Gespräch vom 11.11.2026.

## Wozu das Regal da ist

Das Regal ist die **Live-Auswahl**. Janis öffnet Home, um zu sehen, **wer gerade live ist**, und eine Platte aufzulegen. Wichtig ist die Reihenfolge: zuerst die eigenen Favoriten, die live sind, dann andere Live-Kanäle, denen Janis folgt. Offline-Favoriten sind nachrangig.

Zweiter wichtiger Weg: Janis schaut einen Live-Stream, der Streamer macht etwas Spannendes, Janis geht ins Home, nimmt dessen Platte und schaut **den laufenden Stream als VOD von Anfang an**.

VODs anderer Kanäle und fremde Kanäle findet Janis über das **Suchfeld oben**.

## Was heute stört (Janis)

- 7: Die verpixelten Cover sind schön, aber die Anordnung ergibt keinen Sinn. Platten stecken im Regal; nimmt man eine heraus, wird sie größer.
- 8a: Das Live-Zeichen auf den Covern (rotes Lämpchen) ist hässlich.
- 10: Die Notiz mit Kanalpunkten, Spiel usw. wirkt starr und klein; die CD soll größer werden, wie bei den VODs.
- 11: Der Rahmen beim Auswählen des Regals hat die richtige Form, ist aber zu klein.
- 13: Die VOD-Rückseite ist zu klein und hässlich, man erkennt nichts; man soll scrollen und sehen können, was gespielt wurde.
- Befund (Messung 11.11.): Auf Janis' Ultrawide (Video bildschirmfüllend 2960×1390) ist das Regal oben und unten abgeschnitten (Suchfeld, vordere CD, Notiz).

## So soll es werden (Janis' Entscheidungen)

1. **Ausstellbrett oben:** Live-Favoriten stehen **mit dem Cover nach vorne** (Profilbild verpixelt wie heute). Passen nicht alle, stehen dort die mit den **meisten Zuschauern**; die übrigen Live-Favoriten rutschen zu den Rücken.
2. **Rücken darunter:** andere Live-Kanäle (denen Janis folgt) und danach Offline-Favoriten als **schmale Plattenrücken**. Am Rücken erkennt man den Kanal (kleines Profilbild und Name längs) und ob er live ist (kleines Licht). Live-Favoriten, die nicht mehr aufs Brett passten, haben eine **eigene Rückenfarbe**.
3. **Herausnehmen:** Klick auf Cover oder Rücken holt die Platte nach vorne, sie wird **groß**. Daneben, groß lesbar: **Titel, Spiel, Zuschauer**. Alles andere (Laufzeit, Kanalpunkte) klein oder weg.
4. **Live-Platte vorne:** ein Knopf „von vorne schauen“, der den **laufenden Stream als VOD ab Anfang** lädt.
5. **Rückseite:** Umdrehen zeigt die **VOD-Liste groß, lesbar und scrollbar** (Titel, Spiel, wann, Länge, Vorschaubild).
6. **Neues Live-Zeichen** an Covern und Rücken statt des roten Lämpchens.
7. **Auswahlrahmen** im Raum um das Regal größer.
8. **Suchfeld** oben bleibt.
9. **Jede Fenstergröße:** Das Regal ist ganz sichtbar, auch auf dem Ultrawide (feste Größenliste: 2960×1390, 2040×952, 1920×1030, 1536×1030, 1280×670, 900×700).
10. **Suche (Janis, 11.11.):** Mit Suchtext zeigen Brett und Rücken nur die Treffer. Fremde Kanäle („Auf Twitch“) erscheinen als Rücken in eigener Farbe; Klick auf einen fremden Live-Treffer legt ihn sofort auf (wie heute).
11. **Beim Öffnen (Janis):** Home startet mit dem ganzen Regal, **keine** Platte ist herausgenommen. Die große Platte liegt beim Herausnehmen **über** dem Regal; Esc legt sie zurück.
12. **„Von vorne schauen“ ohne VOD (Janis):** Speichert ein Kanal keine VODs (oder nur für Abos), ist der Knopf **ausgegraut** mit Hinweis „kein VOD“.
13. **Offline-Platte herausnehmen (Janis):** zeigt gleich die **VOD-Rückseite** (wie heute).
14. **„Alle VODs“-Übersicht fällt weg (Janis):** Die Rückseite lädt beim Scrollen weitere VODs nach.

## Rahmenbedingungen

- **Bilder nur aus PixelLab.** Code darf zuschneiden, ausstanzen, skalieren, einfärben und Bildstreifen abspielen, nie selbst Grafik zeichnen. Für jedes neue sichtbare Teil (Brett, Rücken, Live-Zeichen, große Platte, Rückseite, ggf. Regal-Hintergrund) legt der Bauende Janis **2–3 PixelLab-Varianten** vor; Janis wählt. Kosten vorher nennen (Inpainting 10 Generationen, Bilder ab 1). Stand 11.11.: ~1220 Generationen bis 10.12.2026.
- **Bestehendes bleibt:** Suche mit Enter-Reihenfolge, Esc schrittweise zurück, Tastatur ↑/↓ blättern, Stern-Favoriten, Auflegen-Ablauf (wird separat neu entworfen, siehe unten), Home schließt ohne Quelle nicht.
- Daten kommen wie heute aus `HomeListe.abschnitte` (Favoriten live / Live / Offline / Auf Twitch). „Andere Live-Kanäle“ = Abschnitt Live (gefolgt, nicht Favorit).
- `preload.js`/`main.js` nur ändern, wenn für „von vorne schauen“ nötig (siehe offen).
- Tests mit `npm test` grün; Layout zusätzlich mit `tools/home-groessen.js ... regal` über die feste Größenliste prüfen und Bilder selbst ansehen, bevor Janis sie sieht.
- Animationen-aus (`data-animationen="aus"`) gilt auch hier.

## Nicht-Ziele

- Keine neuen Funktionen jenseits des oben Genannten (keine Sortier-Optionen, keine Kategorien).
- Die Auflege-Animation (Janis' Punkt 9) ist ein **eigenes Projekt danach**; hier nur dafür sorgen, dass „Auflegen“ weiter funktioniert.
- Die Chat-Wand (TODO „Ideen für später“) ist nicht Teil davon.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Man muss suchen, um zu sehen, welcher Favorit live ist.
- Text zu klein oder auf unruhigem Grund schlecht lesbar.
- Etwas wird auf einer der Fenstergrößen abgeschnitten.
- Selbst gezeichnete Grafik oder Nähte zwischen PixelLab-Teilen, die nicht zusammenpassen.

## Dem Bauenden überlassen

- Technischer Aufbau (Ebenen, Skalierung, wie das Regal auf breite Fenster kommt, z. B. ein breiteres PixelLab-Regalbild oder Teile, die sich anordnen).
- Wie viele Cover aufs Brett passen (aus der Fenstergröße), Blättern bei vielen Rücken.
- Zuordnung zur bestehenden Struktur (`home-raum-dom.js`: Fächer, vordere Hülle, große Hülle; `home.js`: Bühne/Ständer/Rückseite), was wiederverwendet und was ersetzt wird.

## Meine Entscheidungen (Claude, technisch)

- **„Von vorne schauen“:** Kandidat ist das neueste Archiv-VOD des Kanals (`getChannelVods` in `src/twitch-browse.js`, `ARCHIVE` nach Zeit), abgeglichen mit `stream.createdAt` aus `getLiveStatus`. **Ungeprüft:** ob das VOD wirklich der laufende Stream ist und ob der Player ein noch wachsendes VOD ab 0 abspielt. Der Plan misst das zuerst an einem echten Kanal, bevor gebaut wird.
- **Spiel in der VOD-Liste:** `getChannelVods` holt heute kein Spiel; wird in `src/twitch-browse.js`/`src/browse-map.js` ergänzt (ohne `main.js`/`preload.js`).
- Reihenfolge der Abschnitte bleibt die von `HomeListe.abschnitte`.
