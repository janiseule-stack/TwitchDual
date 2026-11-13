# EGM Stufe 7 – Critic Review – Home als CD-Bühne

Prüfer: egm-design (15 Funde), egm-structural (8), egm-style (15), alle ohne Gesprächswissen.
Zusammengefasst und entdoppelt. Umgang: alles vom Autor (Claude) in der Spec umgesetzt
(Stand nach Stufe 7), Janis-Entscheidungen unverändert.

| # | Schwere | Kern | Quelle | Umgang |
|---|---|---|---|---|
| 1 | Blocker | Abschnitt „Alternativen“ fehlt (Konzepte + technische Wahl, je mit Grund) | Design 1, Struktur 1 | ergänzt |
| 2 | Major | Abschnitt „Risiken und Fehlerfälle“ fehlt (Punkte-IPC, VODs leer, Bild lädt nicht, Suche scheitert/veraltet, Leistung, reduced-motion) | Design 2, Struktur 2 | ergänzt |
| 3 | Major | Enter lädt „besten Live-Treffer“ auch bei Titel-/Spiel-Treffer → falscher Kanal bei exakt getipptem Login | Design 3, Stil 8 | feste Enter-Reihenfolge |
| 4 | Major | Refresh tauscht CD unter der Maus / bei offener Rückseite | Design 4 | Tausch erst beim Verlassen |
| 5 | Major | Namen-Ebene: Tempo ändern/Namen einfügen lässt Zeile springen; Auswahl beim Refresh unklar; „~20“ nicht prüfbar | Design 5, Stil 4 | eigene Mittelzeile für aktuellen Namen, Auswahl nur beim Öffnen, fest 20 |
| 6 | Major | `thumb` ohne Cache-Buster → veraltete Bilder; 640×360 unbelegt | Design 6 | Buster bleibt; Größe im 1. Planschritt messen |
| 7 | Major | Kanalpunkte: veraltete Antworten, Fehlerfälle (401/Sperre), neues Abfragemuster mit Web-Token | Design 7 | Laufnummer, ok/error, Stopp nach Fehler, Drossel, Login-Prüfung |
| 8 | Major | Rad/Esc auf der Rückseite; Esc-Widerspruch Offline-CD | Design 8, Struktur 3, Stil 3 | Tracklist fest 8 Titel, Esc-Regel eindeutig |
| 9 | Major | Suche: „eigene Offline-Treffer, kein Live-Treffer“; Stern-Klicks vs. feste Reihenfolge; Offline-CD fällt aus Liste | Design 9, Stil 5 | Zustände ergänzt |
| 10 | Major | Anti-Ziele nicht messbar | Design 10 | Abnahme mit Leistungsmessung + Tastenvergleich |
| 11 | Major | ⟳ unklar; offline gegangene Nicht-vordere CDs; neu live Favorit hinten | Stil 6 | geregelt |
| 12 | Major | „drei Ebenen“ vs. fünf Schichten | Stil 1 | „drei Bild-Ebenen“ + Bedienbereiche |
| 13 | Major | „Live-Vorschau“ klingt nach Video | Stil 2 | „Vorschaubild (Standbild)“ |
| 14 | Major | Effekte-Stufen nur „Aus“ beschrieben; „Welt steht still“ falsch (ThemeRuntime startet bei Aus keine Welt) | Stil 7, Design 15 | korrigiert |
| 15 | Nit | Verhalten als 17er-Liste → H3-Gliederung | Struktur 4 | gegliedert |
| 16 | Nit | Uneinheitliche Namen (IPC vs. Preload, Hinweiszeile/Anmelde-Leiste, Kontext-Abfrage) | Struktur 5, Stil 13 | vereinheitlicht |
| 17 | Nit | Tests: IPC, Fehlerfälle, Abschluss „npm test grün, anschauen macht Janis“ | Struktur 8 | ergänzt |
| 18 | Nit | Touchpad `deltaMode`, Nachlauf | Design 11 | Sperre nach Wechsel |
| 19 | Nit | `createdAt` auch in `findChannel`-Abfrage | Design 12 | beide |
| 20 | Nit | Hover-Knöpfe nicht per Tastatur | Design 13 | auch bei Fokus |
| 21 | Nit | Aufräumen `HomeAbschnitte` (Script, Test, localStorage), Script-Reihenfolge | Design 14 | aufgeführt |
| 22 | Nit | „Bleibt“ vs. geändert (Enter, VOD-Ansicht), Sterne auf Rücken, `iconUrl`, Tracklist-Länge, Nachbar-Vorladen, Begriffe „Stufe“/„unvollständig“, Verweise | Stil 9–15, Struktur 6–7 | Abschnitt „Geändert“, Präzisierungen |
