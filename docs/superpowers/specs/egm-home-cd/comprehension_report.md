# EGM Stufe 6 – Comprehension Test – Home als CD-Bühne

Prüfer: egm-comprehension (las nur das Dokument, ohne Kontext).

## Was das Dokument vorschlägt (Paraphrase des Prüfers)

Home wird neu gestaltet: statt Kartenraster eine Bühne mit drei Ebenen – hinten die
vorhandene animierte Theme-Welt, darüber riesige seitwärts gleitende Kanalnamen, vorne
ein Live-Kanal als CD in einer Glas-Hülle (Cover = Live-Vorschau, CD halb heraus, dreht,
Aufdruck = Motiv der Welt). Rechts Titel, Laufzeit, Zuschauer, nächste Live-Kanäle als
kleine Cover. Mausrad oder ↑/↓ blättert. Suche springt zum besten Live-Treffer, Enter
lädt ihn. Unten ein Regal mit Offline-Favoriten (bei Suche: Offline- und Twitch-Treffer).
„VODs“ dreht die Hülle um (Tracklist). Sticker mit Kanalpunkten. Neue Logik in einem
DOM-freien, getesteten Modul, Darstellung in eigener Datei; Live-Abfrage bekommt
Startzeit und größeres Vorschaubild.

## Wie das bestehende System laut Dokument funktioniert (Paraphrase des Prüfers)

Twitch-Viewer mit Main-Prozess und Renderer (IPC). Home heute: einklappbare Abschnitte
als Kartenraster (Favoriten, Live, Offline) aus `HomeListe.abschnitte`, Zustand in
`HomeAbschnitte`; Suchfeld mit Fokus, Filter Name/Spiel/Titel, „Auf Twitch“ ab 2 Zeichen;
⟳, ✕, Enter (`enterLaden`), Esc, Sterne, VOD-Ansicht, Anmelde-Leiste, Hinweise;
Aktualisierung alle 60 s; Theme-Welt läuft schon hinter Home; Home liegt über einem
laufenden Player; Kanalpunkte kommen im Chat aus `src/twitch-points.js`.

## Befunde

| # | Schwere | Bereich | Kern |
|---|---|---|---|
| 1 | Major | Reihenfolge der CDs | Enthält `favoriten` auch Offline-Kanäle? Reihenfolge Favoriten vor Live? Doppelte? |
| 2 | Major | Aktuelle CD = Login | Was passiert mit neu live gegangenen Kanälen beim Aktualisieren? Welcher „Nachbar“, was am Listenende? |
| 3 | Major | Suche + Blättern | Blättert man nur durch Treffer? Was zeigen kleine Cover und Namen-Ebene? Welche CD nach dem Leeren der Suche? |
| 4 | Major | Klick auf Offline-Rücken | Rückseite gehört zur Bühnen-Hülle – wechselt die Bühne auf einen Offline-Kanal (welches Cover)? Klick auf offline Twitch-Treffer fehlt. |
| 5 | Major | Anmeldung | Eine Twitch-Anmeldung oder zwei (gefolgte Kanäle / Kanalpunkte)? |
| 6 | Major | Kanalpunkte-Technik | Wo leben Zwischenspeicher und Verzögerung? Gibt es den IPC-Aufruf schon? |
| 7 | Major | Hinweistexte | „Bleibt“-Liste nennt Hinweise und Versionsanzeige, der Aufbau gibt ihnen keinen Platz. |
| 8 | Nit | Nicht-Ziele vs. Daten | „zwei zusätzliche Felder“ – erkennbar ist nur `createdAt`. |
| 9 | Nit | Begriffe | „EGM Stufe 5“, „Bau-Prüfer“, Rollen Janis/Claude, Home über laufendem Player nicht erklärt. |
| 10 | Nit | Einzelbegriffe | Ort von ▶; was `kanal-suche` ist; wo VOD-Ansicht/„Effekte Aus“ sind; Zeilenverweis veraltet. |

## Umgang

Alle Punkte vom Autor (Claude) im Dokument geklärt, siehe Abschnitte „Begriffe“,
„Verhalten“, „Hinweise und Zustände“, „Daten“, „Technik“ (Stand nach Stufe 6).
