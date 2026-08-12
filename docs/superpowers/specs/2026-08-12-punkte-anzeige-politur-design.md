# Punkte-Anzeige: Politur und Zugewinn-Rueckmeldung

**Stand:** 2026-08-12
**Ausgangslage:** v1.9.0 zeigt Kanalpunkte als `🪙 12.350` im Footer. Der Stand
aendert sich stumm — man sieht nie, dass gerade Punkte dazugekommen sind oder
dass die automatische Kiste geklappt hat.

## Ziel

Die Punkte-Ecke unten soll erkennbar machen, *dass* und *wieviel* dazukommt,
und dabei besser aussehen. Drei Aenderungen:

1. Der Belohnungen-Knopf `🎁` wird ein 7TV-Emote (peepoMoney).
2. Jeder Zugewinn — passiv wie Kiste — zeigt kurz `+N` im Footer und laesst den
   Knopf wackeln. Die Kiste faellt dabei deutlicher aus als der passive Tropfen.
3. Das `🪙` vor der Zahl wird das kanaleigene Twitch-Punktesymbol.

## Nicht-Ziele

- **Kein Hermes-Abo fuer Punkte-Ereignisse.** Der Spike vom 2026-08-12 liegt
  ungenutzt herum, aber der bestehende 15-s-Takt liefert die Zahl bereits. Eine
  zweite Datenquelle fuer denselben Wert waere reine Doppelung.
- **Kein `prefers-reduced-motion`-Zweig.** Auf Janis' Windows sind
  Animationseffekte systemweit aus; ein solcher Zweig wuerde die neuen
  Animationen dauerhaft stumm schalten. Gleiche Entscheidung wie im Rest des
  Projekts.
- **Der Verbindungspunkt links im Footer bleibt unveraendert.**

---

## 1. Belohnungen-Knopf: 7TV-Emote

`renderer/chat/index.html:56` ersetzt das Text-Emoji durch ein Bild, exakt nach
dem Muster des catJAM-Knopfs daneben (`#emote-btn`, Zeile 55):

```html
<button id="rewards-btn" type="button" title="Belohnungen" aria-label="Belohnungen">
  <img src="https://cdn.7tv.app/emote/01FHPG3BCR00093JSPCMYFBG0E/1x.webp" alt="peepoMoney">
</button>
```

Emote-ID am 2026-08-12 ueber die 7TV-GQL-Suche aufgeloest, URL mit HEAD geprueft
(HTTP 200, `image/webp`, animiert).

CSS: Die bestehende Regel `#emote-btn img` (`chat.css:359`) wird auf
`#rewards-btn img` erweitert. Keine eigene Groessenlogik — beide Knoepfe sollen
gleich hoch bleiben. `#rewards-btn` bekommt dieselbe Flex-Ausrichtung wie
`#emote-btn` (`chat.css:358`), sonst sitzt das Bild nicht mittig.

## 2. Punkte-Symbol: kanaleigenes Bild

Twitch gibt Symbol und Namen der Kanalpunkte unauthentifiziert heraus. Am
2026-08-12 geprueft: Papaplatte -> „Papapoints" + Icon-URL, Trymacs ->
„TryCoins" + Icon-URL; shroud, xQc und Knossi liefern fuer beide Felder `null`.
**Ein Fallback ist also Pflicht, nicht optional.**

`Q_CONTEXT` in `src/twitch-points.js:11` wird erweitert — dieselbe Abfrage, die
den Stand holt, also kein zusaetzlicher Netzverkehr:

```graphql
query($channelLogin: String!) {
  community: user(login: $channelLogin) {
    id displayName
    channel {
      communityPointsSettings { name image { url } }
      self { communityPoints { balance availableClaim { id } } }
    }
  }
}
```

`context()` liefert zusaetzlich `{ punkteName, iconUrl }` (beide `null`, wenn der
Kanal nichts gesetzt hat). Beides wandert in die `points-update`-Nachricht.

**Anzeige — drei Ebenen:**

| Ebene | Bedingung | Symbol |
|---|---|---|
| 1 | `iconUrl` vorhanden und laedt | kanaleigenes Twitch-Icon |
| 2 | kein `iconUrl` | 7TV-Emote aus kuratierter Liste (siehe 2b) |
| 3 | Emote laedt auch nicht | Inline-SVG in `var(--accent)` |

Tooltip unabhaengig davon: `punkteName || 'Kanalpunkte'`. Symbol und Name
koennen einzeln fehlen — ein Kanal kann einen Namen ohne Bild gesetzt haben.

Ebene 3 ist bewusst **kein** Netzbild: eine Rueckfallebene, die selbst von einem
fremden CDN abhaengt, kann genau den Fehler haben, den sie abfangen soll. Das
SVG erbt ausserdem die Akzentfarbe exakt, statt sie nur zu treffen.

Der Chip waechst von 14 px auf **18 px** Symbolhoehe, der Footer entsprechend
mit. Bei 14 px ist von einem 7TV-Emote nichts mehr zu erkennen — am
2026-08-12 an echten Bildern geprueft.

## 2b. Emote-Auswahl nach Akzentfarbe

**Regel** (neues Modul `renderer/lib/points-icon.js`, DOM-frei und testbar wie
`points-state.js`):

```js
waehleEmote(accentHex, channelLogin, liste)  // -> { id, name } | null
```

1. Akzentfarbe nach HSL wandeln, Farbton `h` nehmen.
2. Kandidaten = alle Emotes mit Farbabstand `<= 60°` zu `h`.
3. Ist die Menge leer, die **drei** mit dem kleinsten Abstand nehmen. Damit
   fehlt nie ein Symbol, egal welche Farbe der Farbwaehler liefert.
4. Aus den Kandidaten per Quersumme von `channelLogin` waehlen: anderer Kanal ->
   anderes Emote, derselbe Kanal aber **immer dasselbe**. Ein bei jedem Takt
   wechselndes Symbol waere Flackern, kein Wiedererkennungswert.

**Kuratierte Liste (Stand 2026-08-12).** Handverlesen: 7TVs Katalog besteht
ueberwiegend aus Foto- und Meme-Emotes, die bei 18 px zu Matsch werden. Von 17
gesichteten Kandidaten waren 5 brauchbar — der Name eines Emotes sagt nichts
ueber sein Bild (`gem` ist ein Foto eines Mannes, `crystallis` ein Gesicht).

| Name | Farbton | ID | Anmerkung |
|---|---|---|---|
| CoinSpin | ~45° Gold | `01KTQBP5NBM4T6VN1X1VM234SR` | Muenze mit Stern, animiert, klarster Umriss |
| Diamond | ~215° Blau | `01KYZBYQEFNJMEMVXW9QKRM8EF` | Kristall, harte Kanten |
| CrystalBall | ~280° Lila | `01KYGN8CP0JV0JG5RACB4PHX7T` | Kugel mit Umriss |
| PixelHeart | ~320° Pink | `01KF76P304N9AY0HKV32MN5A8C` | Pixel-Herz, animiert |
| heart | ~0° Rot | `01KZ2PG8B9TNSPYCR5DM1JFG6F` | Haende als Herz, grenzwertig klein |

**Bekannte Luecke:** Gruen und echtes Cyan fehlen. Fuer ein Cyan-Fenster greift
damit Regel 3 und es bleibt praktisch bei `Diamond` — der Wechsel pro Kanal ist
auf dieser Seite noch duenn. Die Liste ist reine Daten; sie kann jederzeit
wachsen, ohne dass sich Code oder Tests aendern.

Die Farbtoene sind **geschaetzt, nicht gemessen** — sie stammen aus der
Sichtprüfung der Bilder, nicht aus einer Pixelanalyse. Fuer eine Auswahl in
60°-Schritten reicht das; wer es genauer will, misst sie spaeter nach.

Der `onerror`-Zweig ist bewusst da: eine tote CDN-URL wuerde sonst ein kaputtes
Bild-Symbol hinterlassen, und der Nutzer saehe nicht, was schiefging.

## 3. Zugewinn-Rueckmeldung

### Erscheinungsbild

| | Kiste | Passiv |
|---|---|---|
| Zahl im Footer | `+50`, Akzentfarbe, 13 px, fett | `+10`, gedaempft (`--muted`), 11 px |
| Bewegung | steigt 10 px auf, blendet ueber 1,6 s aus | dasselbe, 1,1 s |
| peepoMoney-Knopf | wackelt kraeftig, 600 ms | wackelt leicht, 400 ms |

### Layout

`$pointsChip.textContent = …` (`chat.js:1151`) reisst jedes Kind-Element heraus.
Mit Icon *und* `+N` braucht der Chip deshalb eine feste Struktur, die nie per
`textContent` ueberschrieben wird:

```html
<span id="points-wrap">
  <span id="points-chip" class="hidden" title="Kanalpunkte">
    <img id="points-icon" alt="" />
    <span id="points-value"></span>
  </span>
  <span id="points-gain" class="hidden" aria-hidden="true"></span>
</span>
```

Geschrieben wird nur noch `#points-value`. Fehler- und Anmelde-Zustaende setzen
denselben Knoten und blenden `#points-icon` aus.

`#points-gain` ist ein **Geschwister** des Chips, nicht sein Kind, und liegt
absolut rechts daneben (`#points-wrap { position: relative }`,
`#points-gain { position: absolute; left: 100%; }`). Damit schiebt die
auftauchende Zahl den Footer nicht auseinander. Der Footer behaelt seine drei
Flex-Kinder, `justify-content: space-between` bleibt unberuehrt.

### Woher die Zahl kommt

Kein neuer Netzverkehr — alles aus dem bestehenden 15-s-Takt.

**Vorgefundener Fehler, der hier mitbehoben wird:** `main.js:478-510` holt mit
`pointsApi.context()` den Stand *vor* dem Claim, loest dann die Kiste ein und
sendet anschliessend die alte Zahl. Der Chip hinkt dadurch bis zu 15 s
hinterher. Die Claim-Mutation fragt `currentPoints` bereits ab
(`src/twitch-points.js:19`), `claim()` wirft den Wert in Zeile 95 aber weg.
Genau daraus kommt der exakte Kistenbetrag — er wird also ohnehin gebraucht,
und der Chip stimmt nebenbei wieder.

```
punkteTick()
  ctx = context()                     -> Stand VOR dem Claim
  claim() -> currentPoints            -> Stand NACH dem Claim
     kistenBetrag = max(0, currentPoints - ctx.balance)
     stand        = currentPoints
  zuwaechse = pointsState.zuwaechse(stand, kistenBetrag)
  broadcast('points-update', { balance: stand, …, zuwaechse, punkteName, iconUrl })
```

`claim()` liefert kuenftig `{ ok, error, currentPoints }`. Liefert Twitch kein
`currentPoints`, bleibt es beim Stand aus `context()` und `kistenBetrag = 0` —
dann faellt der Zugewinn als „passiv" auf, statt dass die Anzeige ausfaellt.

### Rechenlogik

Neu in `renderer/lib/points-state.js` — DOM-frei, wird von `main.js` bereits
benutzt (`main.js:332`), hat bereits Tests. Zwei Methoden:

```js
zuwaechse(neuerStand, kistenBetrag)  // -> [{ betrag, quelle }]
standVergessen()                     // Basislinie loeschen
```

`zuwaechse` haelt intern `letzterStand`:

1. `letzterStand === null` -> Basislinie setzen, **leere Liste**. Ohne das
   knallt beim Kanalwechsel ein `+12.350` auf den Schirm.
2. `gesamt = neuerStand - letzterStand`, dann `letzterStand = neuerStand`.
3. `gesamt <= 0` -> leere Liste. Einloesungen senken den Stand und sind kein
   Gewinn.
4. `kiste = min(kistenBetrag, gesamt)`, `passiv = gesamt - kiste`. Das `min`
   faengt den Fall ab, dass zwischen zwei Takten zusaetzlich eingeloest wurde.
5. Liste in der Reihenfolge `passiv`, dann `kiste`; Eintraege mit `betrag <= 0`
   fallen raus.

`standVergessen()` wird an den beiden Stellen gerufen, die heute schon
`balance: null` senden (`main.js:199` und `main.js:234`, Kanalwechsel live und
VOD). Zusaetzlich loescht das bestehende `zuruecksetzen()` die Basislinie mit —
nach einem Neu-Anmelden ist der erste Stand eine frische Basislinie, kein
Gewinn. Kanalsperren und Kisten-Zaehler bleiben wie gehabt unangetastet.

### Abspielen im Renderer

`zeigePunkte(p)` (`chat.js:1135`) spielt `p.zuwaechse` ab. Bei zwei Eintraegen
im selben Takt um 450 ms versetzt, damit nicht zwei Zahlen uebereinander
liegen. Neustart der CSS-Animation ueber Klasse entfernen -> `offsetWidth`
lesen -> Klasse setzen; ohne das Erzwingen des Reflows laeuft die Animation
beim zweiten Mal nicht erneut.

## Tests

`test/points-state.test.js` (bestehend, erweitern):

- erster Stand nach `standVergessen()` loest nichts aus
- reiner passiver Zuwachs -> ein `passiv`-Eintrag
- Kistenbetrag plus Rest -> zwei Eintraege, korrekt aufgeteilt
- Kistenbetrag groesser als Gesamtzuwachs -> auf Gesamtzuwachs gedeckelt
- sinkender Stand -> leere Liste
- `zuruecksetzen()` loescht die Basislinie

`test/points-icon.test.js` (neu):

- Akzentfarbe trifft eine Farbfamilie -> Emote aus dieser Familie
- Akzentfarbe ohne Treffer (z.B. Gruen) -> eines der drei naechstliegenden
- derselbe Kanal liefert bei wiederholtem Aufruf dasselbe Emote
- verschiedene Kanaele liefern (bei genug Kandidaten) verschiedene Emotes
- leere Liste -> `null`, Aufrufer faellt auf das SVG zurueck
- unbrauchbare Akzentfarbe (kein gueltiges Hex) -> `null` statt Absturz

`test/twitch-points.test.js` (bestehend, erweitern):

- `claim()` reicht `currentPoints` durch
- `claim()` ohne `currentPoints` liefert `null` statt zu werfen
- `context()` liefert `punkteName` und `iconUrl`
- `context()` bei fehlendem `communityPointsSettings` liefert beide als `null`

## Randfaelle

| Fall | Verhalten |
|---|---|
| Kanalwechsel | `standVergessen()`, erster neuer Stand loest keine Animation aus |
| Kanal ohne Punkte / gesperrt | unveraendert, kein Zugewinn moeglich |
| Token abgelaufen | unveraendert: Fehlertext im Chip, `#points-icon` aus |
| Einloesung zwischen zwei Takten | Stand sinkt -> keine Animation |
| Kiste **und** passiver Tropfen im selben Takt | zwei Animationen, 450 ms versetzt |
| Kanal ohne eigenes Symbol | 7TV-Emote passend zur Akzentfarbe |
| Icon-URL antwortet nicht | `img.onerror` -> Ebene 2, dann Ebene 3 |
| 7TV-Emote laedt auch nicht | Inline-SVG in Akzentfarbe |
| Akzentfarbe per Farbwaehler geaendert | Symbol wird neu gewaehlt (Farbfamilie kann wechseln) |

## Betroffene Dateien

| Datei | Aenderung |
|---|---|
| `renderer/chat/index.html` | peepoMoney-Bild im Knopf, `#points-wrap`-Struktur |
| `renderer/chat/chat.css` | `#rewards-btn img`, `#points-gain`, Wackel- und Aufsteig-Animation, Symbolhoehe 18 px |
| `renderer/chat/chat.js` | `zeigePunkte()` auf neue Struktur, `spieleZuwaechse()`, Symbol-Ebenen 1-3 |
| `renderer/lib/points-state.js` | `zuwaechse()`, `standVergessen()` |
| `renderer/lib/points-icon.js` | **neu** — Emote-Liste + `waehleEmote()` |
| `test/points-icon.test.js` | **neu** |
| `src/twitch-points.js` | `Q_CONTEXT` erweitert, `claim()` reicht `currentPoints` durch |
| `main.js` | Stand nach Claim korrigieren, `zuwaechse`/`iconUrl`/`punkteName` senden, `standVergessen()` beim Kanalwechsel |
| `test/points-state.test.js` | neue Faelle |
| `test/twitch-points.test.js` | neue Faelle |

Nach der Umsetzung: Version bumpen und Release, siehe `docs/TODO.md`.
