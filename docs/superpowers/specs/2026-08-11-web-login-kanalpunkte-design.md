# Web-Login + Kanalpunkte — Entwurf

**Datum:** 2026-08-11
**Status:** freigegeben, bereit für den Umsetzungsplan
**Nachfolgeprojekt (getrennt):** Home-Screen-Redesign — eigene Spec, nicht Teil hiervon

## Problem

Kanalpunkte sind in TwitchDual nicht verfügbar. Ein früherer Versuch (2026-07-19)
scheiterte und wurde als „nicht machbar" abgelegt. Das war ein Fehlschluss: Nicht
die API war das Problem, sondern der **Token-Typ**.

## Was gemessen wurde (2026-08-11, echte Läufe)

Alle Aussagen unten sind belegt, nicht angenommen:

| Fähigkeit | Device-Flow-Token | Web-Cookie-Token |
|---|---|---|
| Kanalpunkte lesen | ❌ HTTP 401 | ✅ HTTP 200, `balance: 34724` |
| Identität (`currentUser`) | ✅ | ✅ HTTP 200 |
| Chat senden (IRC) | ✅ | ✅ IRC-Login akzeptiert |
| Gefolgt-Liste | ✅ über Helix | ❌ GQL „service error", Helix 401 |

Entscheidende Gegenprobe für die Punkte: identische Anfrage **ohne**
`Authorization`-Header liefert `communityPoints: null`, **mit** Token
`balance: 34724`. Es hängt eindeutig am Token.

Weitere belegte Erkenntnisse:

- **Rohe GraphQL-Queries werden akzeptiert.** Kein Persisted-Query-Hash nötig.
  Der kursierende Hash `9988086b…` ist veraltet (`PersistedQueryNotFound`).
  Übliche Auto-Claim-Tools schleppen solche Hashes mit und brechen bei
  Twitch-Deploys — davon sind wir unabhängig.
- **`community` ist nur ein Alias für `user(login:)`.** Ein Wurzelfeld
  `community` existiert nicht.
- **Twitch blockt eingebettete Logins nicht.** Der Login-Screen lädt in einem
  Electron-`BrowserWindow` vollständig, sogar mit der Standard-Kennung, in der
  `Electron/33.4.11` offen im User-Agent steht. Kein UA-Spoofing nötig.
- **Die Gefolgt-Liste ist für den Web-Token gesperrt.** `follows` und
  `followedLiveUsers` existieren im Schema (`followedUsers` nicht), werden aber
  mit „service error" abgewiesen — dasselbe Client-Integrity-Muster, an dem in
  diesem Projekt schon die Cursor-Paginierung scheiterte. Helix antwortet
  unmissverständlich: „Client ID and OAuth token do not match".

Funktionierende Punkte-Query:

```graphql
query($channelLogin: String!) {
  community: user(login: $channelLogin) {
    id displayName
    channel { self { communityPoints { balance availableClaim { id } } } }
  }
}
```
Header: `Client-ID: kimne78kx3ncx6brgo4mv6wki5h1ko` + `Authorization: OAuth <auth-token>`

## Entscheidungen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Umfang | Punktestand + Auto-Claim + Belohnungen einlösen | Janis' Wahl |
| Reichweite | Nur der aktuell geschaute Kanal | Kein Hintergrund-Miner; schlank, unauffällig |
| Anmeldung | **Beide Token, klar getrennt** | Vollersatz scheitert an der Gefolgt-Liste |
| Takt | Abfrage alle **15 s** | Bewiesener Weg; Live-Socket wäre ungetestetes zweites Protokoll für ~15 s Zeitgewinn |
| Auto-Claim | **Fest an, kein Schalter** | Wie der Werbeblocker seit v1.8.4 |

**Token-Zuständigkeit, verbindlich:**
- **Device Flow** → Gefolgt-Liste (Helix) **und Chat-Senden — beides unverändert**
- **Web-Cookie-Token** → **ausschließlich** Kanalpunkte und Belohnungen

Der Web-Token *könnte* das Chat-Senden übernehmen (der IRC-Login wurde erfolgreich
getestet), aber es gibt keinen Grund dafür: Chat-Senden funktioniert heute. Ein
Umbau brächte keinen Gewinn und würde ein laufendes Feature gefährden. Der neue
Token bekommt deshalb die kleinstmögliche Zuständigkeit.

Der Vollersatz wurde geprüft und verworfen: Er hätte den Gefolgt-Tab gekostet,
ein seit v1.8.0 funktionierendes Feature.

## Architektur

Reine Logik in DOM-freie, testbare Module; Nebenwirkungen außen herum — das
Muster von `volume-guard.js`, `ad-overlay-state.js` und `src/twitch-gql.js`.

**`src/twitch-web-auth.js`** — Login-Fenster öffnen, `auth-token`-Cookie von
`.twitch.tv` abholen, per `safeStorage` verschlüsselt ablegen. Analog zu
`src/twitch-auth.js`, nur Cookie statt Device Flow.

**`src/twitch-points.js`** — vier GraphQL-Aufrufe: Kontext lesen, Kiste
einlösen, Belohnungen auflisten, Belohnung einlösen. Bekommt Token und `fetch`
übergeben, kennt weder Electron noch Fenster → mit gefälschtem `fetch` testbar.

**`renderer/lib/points-state.js`** — Entscheidungslogik ohne DOM: wann abfragen,
wann eine Kiste als einlösbar gilt, wie bei Fehlern zurückgefahren wird, wann der
Zustand veraltet ist. Reine Funktionen über Zeitstempel.

**Der Takt läuft im Main-Prozess.** Er besitzt den Token und kennt den aktiven
Kanal ohnehin; das Chat-Fenster bekommt nur fertige Zahlen. Der Token erreicht
den Renderer nie.

**Abfrage nur wenn:** Live-Kanal (VODs haben keine Punkte) **und** Player spielt.
Bei Pause oder offenem Home-Overlay ruht der Takt.

**Oberfläche:** Punktestand als Chip in der Chat-Fußzeile neben dem Raum-Status.
Belohnungen als Panel, geöffnet wie der Emote-Picker.

## Datenfluss

1. **Anmelden** — Klick → Main öffnet Login-Fenster → wartet auf Cookie →
   schließt Fenster → Token verschlüsselt ablegen → Renderer erfährt nur
   „angemeldet als \<name\>".
2. **Takt** — alle 15 s eine Abfrage; liefert Punktestand und offene Kiste
   zusammen. Stand → Chip. Kiste → sofort einlösen.
3. **Belohnungen** — Panel öffnen → Liste holen → Klick → **Rückfrage** →
   einlösen. Die Rückfrage ist verbindlich: Punkte ausgeben ist nicht umkehrbar.

## Fehlerbehandlung

Leitsatz: **nichts scheitert still.**

| Fall | Verhalten |
|---|---|
| Token abgelaufen | Chip „Anmeldung abgelaufen" + Knopf zum Neuanmelden; Takt stoppt |
| Netzwerk weg | Rückfahren 15 s → 30 s → 60 s, Deckel 5 Min; Chip wird grau, verschwindet nicht |
| Kanal hat Punkte aus | Einmal melden, dann für diesen Kanal ruhen |
| Kiste einlösen scheitert | Höchstens 3 Versuche pro Kisten-ID; ist sie noch da, kommt sie im nächsten Takt wieder |
| Belohnung einlösen scheitert | Sichtbare Fehlermeldung mit Twitchs Begründung |

Hintergrund zur letzten Zeile: In diesem Projekt erschien ein verschluckter
Integrity-Fehler früher als leerer Chat ohne Erklärung. Diese Falle wird hier
nicht wiederholt.

## Tests

Die bestehenden 169 Tests bleiben grün. Neu:

- **`points-state.js`** — ruht der Takt bei VOD und bei Pause? Fährt er nach
  Fehlern korrekt zurück und wieder hoch? Bricht er nach 3 Fehlversuchen pro
  Kiste ab? Richtiger Zustand bei abgelaufenem Token?
- **`twitch-points.js`** — mit gefälschtem `fetch`: Query-Form korrekt?
  „service error" anders behandelt als 401? Antwort ohne `communityPoints`
  ergibt sauber „keine Punkte" statt Absturz?
- **`twitch-web-auth.js`** — Token aus Cookie-Liste ziehen, Verschlüsseln und
  Zurücklesen gegen einen `safeStorage`-Ersatz. Das Login-Fenster selbst wird
  nicht unit-getestet.

**Grenze dieser Tests, ausdrücklich:** Sie beweisen die Logik, nicht dass Twitch
mitspielt.

## Risiken und offene Punkte

**Nicht bewiesen: Kiste einlösen und Belohnungen.** Nur das *Lesen* der Punkte
ist belegt. **Erster Umsetzungsschritt ist deshalb ein Spike**, der beide
Mutationen einmal echt durchspielt — bevor Oberfläche daran hängt. Scheitert das
Einlösen, schrumpft der Zuschnitt auf Anzeige plus Auto-Claim, Belohnungen
fallen raus.

**Graubereich.** Auto-Claim ist kein von Twitch vorgesehener Weg. Bei zwei
privaten Nutzern realistisch folgenlos, aber es ist eine bewusste Entscheidung.

**Pflegeaufwand.** Die inoffizielle API kann sich jederzeit ändern. Anders als
der Rest der App wird dieses Feature Nachpflege brauchen. Der Verzicht auf
Persisted-Query-Hashes verringert das Risiko, beseitigt es aber nicht.

**Zwei Anmeldungen.** Bleibt unschön, ist aber die Folge einer geprüften
Sperre, nicht der Bequemlichkeit.
