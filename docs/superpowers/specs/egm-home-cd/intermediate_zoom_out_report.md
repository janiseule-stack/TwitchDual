# EGM Stufe 8 – Intermediate Zoom Out – Home als CD-Bühne

Prüfer: egm-zoom-out (frisch). Ergebnis: kein Blocker; Nachträge aus Stufe 5–7 meist
schlank, aber drei Gegenmaßnahmen zu aufwendig, eine vorhandene Lösung nicht genutzt.

| # | Schwere | Kern | Umgang (Claude) |
|---|---|---|---|
| 1 | Major | Austausch der offline gegangenen vorderen CD (Hover/Timer/Ersatzwahl) zu aufwendig | vereinfacht: bleibt markiert stehen, fällt erst beim Weiterblättern/Neuöffnen raus |
| 2 | Major | Offline-CD = zweiter Bühnen-Modus mit gemerktem Rücksprung | Variante b: kein gemerkter Rücksprung (Esc/Rad → aktuelle Live-CD der Reihe); Sterne zusätzlich auf Rücken |
| 3 | Major | Enter-Schritt 2 hängt an verzögerter `kanal-suche` (Wettlauf bei schnellem Tippen) | exakter eigener Login/Name zuerst (ohne Netz); Präfix-CD nur, wenn laufende Suche abgewartet ist und kein exakter Twitch-Treffer kam |
| 4 | Major | Vorschaubild per GQL-Änderung + ungeprüfte Messung statt vorhandener `previewUrl` | `previewUrl` mit `-640x360`, GQL-Vorschau unberührt |
| 5 | Major | Kanalpunkte-Absicherung doppelt; `iconUrl`-Rückfall aus Chat nicht genutzt | Laufnummer + 2-s-Drossel gestrichen; Symbol-Rückfall `PointsIcon`/SVG wiederverwendet |
| 6 | Nit | Mehrere CDs überspringen = YAGNI | gestrichen |
| 7 | Nit | `home-buehne.js` Sammelkiste | Suchlogik (bester Treffer, Enter) nach `home-liste.js` |
| 8 | Nit | Hinweiszeile verschmilzt `#auth-bar` + `#home-hinweis` ohne Not | beide bleiben getrennt untereinander |
| 9 | Nit | „genau bis zu 20“; Mittelzeile weicht sichtbar von Janis' Formulierung ab | „höchstens 20“; Mittelzeile Janis zur Bestätigung vorlegen |
