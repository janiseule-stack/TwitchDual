# Chat-Ereignisse über Twitchs Ereignis-Strom — Spike-Entwurf

**Datum:** 2026-08-12
**Status:** freigegeben, Spike als nächster Schritt
**Vorläufer:** `2026-08-11-web-login-kanalpunkte-design.md` (Web-Token, Integrity-Ernte)

## Problem

TwitchDuals Chat zeigt nur, was über IRC kommt. Es fehlen:

- **Angeheftete Nachrichten** — der Streamer pinnt etwas, im Chat steht nichts.
- **Kanalpunkt-Einlösungen anderer Zuschauer** — bei Twitch steht „X hat Y
  eingelöst", bei uns nichts. Live beobachtet am 2026-08-12: die eigene
  Einlösung war erfolgreich (`ok:true`), tauchte im Chat aber nirgends auf.

Beides verteilt Twitch nicht über IRC, sondern über einen eigenen
Ereignis-Strom, den nur die Webseite liest.

## Was schon feststeht (nicht Teil des Spikes)

Beim Nachsehen im Code gefunden, bereits belegt:

- `renderer/chat/chat.js:427` fordert `twitch.tv/commands` an. **Abo-,
  Geschenk- und Raid-Meldungen (`USERNOTICE`) kommen also längst an** und
  werden in der Nachrichtenschleife (`chat.js:441`) still verworfen — dort
  gibt es nur Zweige für `PRIVMSG`, `366`, `RECONNECT` und `NOTICE`.
  Twitch liefert im `system-msg`-Tag den fertigen Anzeigetext mit.
- Bits sind ein `PRIVMSG` mit `bits`-Tag; die Nachricht wird bereits
  angezeigt, nur nicht hervorgehoben.

Diese Hälfte braucht **keine** neue Verbindung und ist vom Spike unabhängig.
Sie ist bewusst zurückgestellt (Entscheidung 2026-08-12: erst Gewissheit über
den Ereignis-Strom, dann gemeinsame Gestaltung der Ereignis-Zeilen).

## Risiko, das den Spike nötig macht

**Twitch hat PubSub öffentlich abgekündigt** und verweist Dritte auf EventSub.
EventSub hilft hier aber nicht: Einlösungen *fremder* Kanäle zu empfangen
verlangt dort die Zustimmung des jeweiligen Streamers. Der einzige gangbare
Weg ist der, den Twitchs eigene Seite geht — und ob das noch
`wss://pubsub-edge.twitch.tv` ist, ist unbekannt.

Deshalb beginnt der Spike mit **Beobachten statt Raten**.

## Ziel des Spikes

Eine einzige Frage beantworten:

> Können wir mit dem Web-Token denselben Ereignis-Strom abonnieren wie die
> Twitch-Webseite, und liefert er angeheftete Nachrichten und fremde
> Einlösungen?

## Stufe 0 — der echten Seite zusehen

Die App öffnet für die Integrity-Ernte bereits ein `twitch.tv/directory`-Fenster
(`src/twitch-integrity.js`). Dort zusätzlich protokollieren:

- jede WebSocket-Verbindung, die die Seite aufmacht (Adresse),
- die ersten gesendeten und empfangenen Rahmen je Verbindung (gekürzt).

**Ergebnis:** die tatsächliche Adresse und das Nachrichtenformat, das die
Webseite heute benutzt.

**Wichtig:** Zugangsdaten (Token in `LISTEN`-Rahmen) werden vor dem
Protokollieren durch `***` ersetzt. Das Protokoll landet in
`%APPDATA%\twitchdual\updater.log` und wird nach dem Spike gelöscht.

## Stufe 1 — selbst abonnieren

Mit der Erkenntnis aus Stufe 0 eine eigene Verbindung aufbauen (Web-Token,
Main-Prozess) und drei Themen abonnieren:

| Thema | Wofür |
|---|---|
| eigener Punktestand | Ersatz für den 15-s-Takt, Kisten sofort statt verzögert |
| Einlösungen im Kanal | „X hat Y eingelöst" als Chat-Zeile |
| angeheftete Nachrichten | oben festgeklebte Nachricht |

Die genauen Themen-Namen kommen aus Stufe 0; die aus der öffentlichen
Dokumentation bekannten Kandidaten (`community-points-user-v1.<user_id>`,
`community-points-channel-v1.<channel_id>`, `pinned-chat-updates-v1.<channel_id>`)
gelten als Vermutung, nicht als gesetzt.

Die eigene Benutzerkennung liefert `currentUser { id }` über die bestehende
GQL-Anbindung (mit dem Web-Token bereits als funktionierend gemessen).

Protokolliert wird je Thema:

- die Antwort auf das Abo (angenommen / abgelehnt samt Fehlercode),
- jedes eintreffende Ereignis (Typ und gekürzter Inhalt).

## Abbruchkriterien

- **Erfolg:** mindestens ein Thema wird angenommen **und** liefert ein echtes
  Ereignis. → Entwurf für den Ausbau.

  Das Ereignis wird **erzwungen statt abgewartet**: eine eigene Einlösung muss
  auf dem Kanal-Thema auftauchen. Damit hängt der Beweis nicht am Zufall, ob
  gerade jemand anders etwas einlöst oder der Streamer etwas anpinnt. Der
  Vergleich ist derselbe wie beim `PROPERTIES_MISMATCH`-Fund: eine Handlung,
  zwei Protokollzeilen, eindeutig.
- **Teilerfolg:** Abos werden angenommen, aber es kommt nichts an → offene
  Frage, ob die Themen-Namen falsch sind. Höchstens ein zweiter Versuch mit
  korrigierten Namen, danach Abbruch.
- **Abbruch:** alle Abos abgelehnt (z. B. Integrity-Sperre wie bei der
  Gefolgt-Liste) → der Weg ist tot. Dann Variante A: nur `USERNOTICE`
  rendern, was ohne neue Verbindung auskommt. Das Ergebnis wird in
  `docs/TODO.md` festgehalten, damit niemand denselben Weg nochmal geht.

## Regeln für den Spike-Code

- **Wegwerf-Code.** Alles hinter einer Umgebungsvariable
  (`TWITCHDUAL_PUBSUB_SPIKE=1`), nichts davon geht in einen Release. Nach
  Auswertung restlos entfernt — wie die Punkte-Diagnose vom 2026-08-12.
- **Der Token bleibt im Main-Prozess.** Keine neue IPC-Brücke, kein Token im
  Renderer, keine Zugangsdaten im Protokoll.
- **Die laufende App darf nicht leiden.** Fehler im Spike werden gefangen; ein
  fehlgeschlagener Verbindungsaufbau darf Chat, Player und Punkte-Takt nicht
  beeinträchtigen.
- **Keine Tests für Wegwerf-Code.** Erst was bleibt, bekommt Tests.

## Nicht Teil dieses Spikes

- Gestaltung der Ereignis-Zeilen im Chat (kommt in den Ausbau-Entwurf).
- `USERNOTICE`-Rendering (unabhängig, jederzeit machbar).
- Vorhersagen mitspielen (eigene Spec, eigener Integrity-Nachweis).
- Ablösung des 15-s-Takts (erst wenn der Strom als verlässlich gilt).

## Offene Fragen (nach dem Spike zu beantworten)

- Braucht das Abo Integrity-Kopfzeilen? Wenn ja, hält der Satz lange genug?
- Was passiert bei Kanalwechsel — ein Abo pro Kanal ab- und neu bestellen?
- Wie oft muss die Verbindung am Leben gehalten werden, und was tun, wenn sie
  abreißt (der Chat hat mit `renderer/lib/backoff.js` bereits ein Muster)?
