# EGM Stufe 5 (Zoom Out + Inventive Catalyst) + Bau-Prüfer – Home als CD-Bühne

Geprüft: `docs/superpowers/specs/2026-11-09-home-cd-design.md` (Stand 09.11.2026).
Prüfer: egm-zoom-out, egm-inventive-catalyst (beide ohne Gesprächswissen), dazu ein
unabhängiger Bau-Prüfer (Builder Check). Zusammengefasst, nach Thema sortiert.

## Funde

| # | Schwere | Thema | Kern | Quelle |
|---|---|---|---|---|
| 1 | Major | Suche | Erfolgskriterium „finden so schnell wie heute“ hängt am offenen Punkt Suche. Varianten: (a) bei Suchtext auf heutige Liste umschalten; (b) Tippen springt auf besten Treffer, Enter lädt ihn, Offline/Twitch-Treffer in der Regal-Zone. Fokus im Suchfeld vs. ←/→ zum Blättern kollidiert; Enter lädt heute den getippten Text (`enterLaden`). | Zoom Out 2, Catalyst 1, Bau 2+6 |
| 2 | Major | ~300 Offline-Kanäle | Regal nur mit Favoriten = Rückschritt (heute Abschnitt „Offline“). Vorschlag: Regal waagerecht scrollbar mit allen Offline-Kanälen (Favoriten vorne), Klick = VODs, Bilder lazy. | Catalyst 2, Bau 1+5 |
| 3 | Major | Mausrad vs. Scrollen | Rad blättert CDs – Home scrollt heute senkrecht. Zonen festlegen (Bühne blättert, Regal scrollt waagerecht) oder Home passt ohne Scrollen. | Zoom Out 6, Bau 1 |
| 4 | Major | Index vs. Login | Aktuelle CD über Login merken, nicht über Position; bei Refresh nur Werte aktualisieren, neu sortieren erst beim Öffnen; fehlt der Kanal, rückt der Nachbar nach. | Zoom Out 4, Catalyst 3 |
| 5 | Major | Leistung | `backdrop-filter`/`mix-blend-mode` aus dem Mockup über zwei animierten Ebenen + laufendem Player → Ruckel-Gefahr. Regel: keins von beiden auf Home; Glas = Verlauf + Kante, Schimmer = feste Ebene, die mitdreht. | Catalyst 4 |
| 6 | Major | Blättern bei vielen Live-Kanälen | Rad-Ausschläge sammeln, Schwelle; schnelles Drehen überspringt mehrere CDs mit kurzer Animation. | Catalyst 5 |
| 7 | Major | Fehlende Funktionen | Liste „bleibt/entfällt“ fehlt: Enter lädt Kanal/VOD-Link, Esc, „Gefolgte nicht abrufbar“, Platzhalter beim ersten Laden, „Keine eigenen Kanäle passen“, einklappbare Abschnitte. | Zoom Out 5 |
| 8 | Major | Laufzeit | „seit 5:42“ braucht Startzeit – `mapLiveUser` liefert sie nicht (neues GQL-Feld) – widerspricht Nicht-Ziel „keine neuen Datenquellen“. | Zoom Out 1 |
| 9 | Major | Reihenfolge doppelt | Reihenfolge = `favoriten` + `live` aus `HomeListe.abschnitte` (live nach Zuschauern). Neues Modul nur für Neues (aktuelle CD, Blättern, Namen). | Zoom Out 3 |
| 10 | Frage | Effekte „aus“ | ThemeRuntime startet bei „aus“ keine Welt. Was zeigt Home dann? Neon Dual? | Bau 4 |
| 11 | Frage | Namen-Ebene | Welche Namen bei 300 Kanälen, wie viele, wechseln sie beim 60-s-Refresh (Sprung)? | Bau 5 |
| 12 | Nit | Cover | 16:9-Vorschau in quadratischer Hülle: größere Variante laden, `object-fit: cover`; Nachbar-Cover vorladen; `thumb` vs. `previewUrl` – eins wählen. Standbild oder echtes Video? | Zoom Out 10, Catalyst 6, Bau 3 |
| 13 | Nit | Kleine Fenster | Regel für schmale/niedrige Home-Fläche fehlt. | Catalyst 7, Bau 7 |
| 14 | Nit | Dateien | Bühnen-DOM in eigene Datei, `home.js` bleibt für Laden/Suche/Login/VODs. | Catalyst 8 |
| 15 | Nit | Welt schon da | `#fx-hinten`/`.theme-deko` stecken schon in `#home` – keine Arbeit, nur nicht mehr zudecken. | Zoom Out 7 |
| 16 | Nit | Wischen | Bei Maus-App unnötig – streichen. | Zoom Out 8 |
| 17 | Nit | Tests | Abschnitt fehlt (Anschlag, Login bleibt nach Refresh, Namen-Auswahl 0/1/viele). | Zoom Out 11 |
| 18 | Nit | VOD-Ansicht | Bleibt alte Kartenliste – Stilbruch; als Zwischenstand vermerken oder Idee 1. | Catalyst 9 |
| 19 | Nit | Ideen-Speicher | Nicht in der Spec führen, bis entschieden. | Zoom Out 9 |

## Ideen (Inventive Catalyst)

1. Rückseite der Hülle = VOD-Tracklist (3D-Flip, Klick lädt VOD; `channelVods` existiert).
2. „Im Laufwerk“: laufender Kanal als CD in einer Ecke, Klick = zurück (`closeHomeResume`).
3. Folie mit „NEU“-Sticker für Kanäle, die seit dem letzten Öffnen live gingen; reißt beim ersten Herausfahren auf.
4. Einlege-Übergang: ▶ lässt die CD zum Player fliegen und einrasten; Chat zeigt kurz „Jetzt läuft“.
5. Namen-Ebene antwortet: Name der aktuellen CD leuchtet in der Riesen-Schrift auf.
6. Drehzahl = Zuschauer (logarithmisch, gedeckelt).
7. CD-Aufdruck pro Theme-Welt (Kirschblüten, Koi, Blätter, Blasen, Neon-Linien) statt generischem Regenbogen.
8. Kanalpunkte als Sticker auf der Hülle (Abrufbarkeit pro Kanal ungeprüft → evtl. neue Datenquelle).
9. Shuffle-Knopf ⤮: wirbelt die CDs, hält bei zufälligem Live-Kanal.
10. „Best of“-CD, wenn niemand live ist: neueste VODs der Favoriten als Compilation.
11. Regal-Rücken mit Gebrauchsspuren: oft geladene Kanäle stehen leicht herausgezogen (History).
12. Kurze stumme Live-Vorschau beim Verweilen auf dem Cover (zweiter Videostrom – Leistung, nur Experiment).
