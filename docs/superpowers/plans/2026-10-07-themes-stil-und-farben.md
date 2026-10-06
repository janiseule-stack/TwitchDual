# Themes Welle 1b: Stil, Deko, Farben, Video-Balken — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die vier neuen Themes werden durchgestylt (Schrift, Kaesten, Deko), die Video-Balken nehmen die Theme-Farbe an, und Akzent/Hintergrund/Partikel sind pro Theme anpassbar.

**Architecture:** Reine Logik (Farbableitung, Prefs-Saeuberung, Farbfilter) in den UMD-Libs `theme.js`/`themes.js`, getestet. Die Runtime setzt Anpassungen als Inline-Variablen und reicht die Partikelfarbe an die Welten. Stil und Deko leben ausschliesslich in `renderer/themes/<id>/theme.css` plus je einer statischen Deko-Ebene pro Fenster. Die Balkenfarbe geht per `postMessage` in das Twitch-iframe, wo der vorhandene Preload-Zweig ein Style-Element pflegt.

**Tech Stack:** Electron 33 (Chromium 130), Vanilla JS/CSS, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-07-themes-stil-und-farben-design.md` (baut auf `2026-10-07-lebendige-themes-design.md`)

## Global Constraints

- Neon Dual bleibt optisch und funktional unveraendert (keine Theme-CSS, Balken schwarz, Farbwaehler wie bisher).
- Nur Windows-Systemschriften: Candara, Segoe Script, Georgia, Palatino Linotype, Yu Gothic UI, Yu Gothic UI Light, Bahnschrift.
- Deko ist statisch (keine `@keyframes` in den Deko-Regeln).
- Alle Deko-/Effekt-Ebenen `pointer-events: none`.
- Prefs-Form: `themePrefs.anpassungen = { [themeId]: { akzent?, hintergrund?, partikel? } }`, nur fuer Nicht-Neon-Themes, nur gueltige Hex.
- Farbwerte fuer das iframe nur, wenn sie `/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i` erfuellen.
- Namensfarben-Abdunklung haengt an `<html data-hell="1">`, Mischung 45 %.
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Branch `feat/sammel-verbesserungen`; kein Push, kein Release.

## Review Focus

- Teil-Speicherung der Anpassungen eines Themes darf die Anpassungen anderer Themes nicht loeschen → Test in Task 2.
- Ein selbst gewaehlter dunkler Hintergrund in einem hellen Theme (z. B. Sakura) muss helle Schrift und KEINE Namens-Abdunklung bekommen → Test in Task 3 (`data-hell`), Live in Task 12.
- Bosartige/kaputte Farbwerte in der iframe-Nachricht duerfen kein CSS einschleusen → Test in Task 2 + Regex-Gleichlauf-Test in Task 5.
- Partikel-Farbwechsel waehrend laufender Welt darf keine zweite Welt hinterlassen → Test in Task 3.
- Wechsel zurueck auf Neon muss alle Anpassungs-Variablen und `data-hell` entfernen bzw. zuruecksetzen → Test in Task 3.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `renderer/lib/theme.js` | + `flaechenVars`, `istHell` |
| `renderer/lib/themes.js` | + `farben` je Theme, `anpassungen` saeubern/mischen, `effektiveFarben`, `balkenFarbe`, `SICHERE_FARBE`, `istSichereFarbe` |
| `renderer/lib/theme-runtime.js` | + Anpassungs-Variablen, `data-hell`, Partikel-Neustart, `farben` an Welten/Vorschau |
| `renderer/themes/{sakura,wald,koi,blasen}/welt.js` | Partikelfarbe aus `farben.partikel`; Sakura-Bluete als Form |
| `renderer/themes/{sakura,wald,koi,blasen}/theme.css` | voller Stil + Deko + Schrift |
| `renderer/chat/{index.html,chat.css,chat.js}` | Deko-Ebene, Schrift-Variablen, generische Namensregel, Theme-Farbwaehler |
| `renderer/video/{index.html,video.js}` | Deko-Ebene, Schrift-Variablen, Balken-Nachricht |
| `preload.js` | Balken-Style im Twitch-iframe |

---

### Task 1: Farbableitung in `theme.js`

**Files:** Modify `renderer/lib/theme.js` (vor `return {`), Test `test/theme.test.js` (anhaengen)

**Interfaces:**
- Produces: `ThemeLib.istHell(hex) → boolean` (rel. Leuchtdichte > 0.179, WCAG-Kreuzungspunkt), `ThemeLib.flaechenVars(hex, alphaPct) → { '--bg','--panel','--hover','--line','--text','--muted','--ts' }`

- [ ] **Step 1: Failing Tests anhaengen** an `test/theme.test.js`:

```js
// --- Welle 1b: Flaechen aus eigenem Hintergrund -----------------------------
test('istHell: hell/dunkel nach Leuchtdichte', () => {
  assert.equal(ThemeLib.istHell('#fff4f8'), true);
  assert.equal(ThemeLib.istHell('#f0f7ff'), true);
  assert.equal(ThemeLib.istHell('#0e1f14'), false);
  assert.equal(ThemeLib.istHell('#082625'), false);
  assert.equal(ThemeLib.istHell('kaputt'), false);
});

test('flaechenVars: heller Grund -> dunkle Schrift, dunkler Grund -> helle Schrift', () => {
  const hell = ThemeLib.flaechenVars('#fff4f8', 100);
  assert.equal(hell['--bg'], 'rgba(255, 244, 248, 1)');
  assert.equal(hell['--text'], '#2b2b38');
  const dunkel = ThemeLib.flaechenVars('#0e1f14', 100);
  assert.equal(dunkel['--text'], '#ededf4');
  for (const k of ['--bg', '--panel', '--hover', '--line', '--text', '--muted', '--ts']) {
    assert.ok(k in hell && k in dunkel, k);
  }
});

test('flaechenVars: Alpha nur auf Flaechen, Panel weicht vom Grund ab', () => {
  const v = ThemeLib.flaechenVars('#0e1f14', 50);
  assert.match(v['--bg'], /, 0\.5\)$/);
  assert.match(v['--panel'], /, 0\.5\)$/);
  assert.notEqual(v['--panel'], v['--bg']);
  assert.match(v['--line'], /^#[0-9a-f]{6}$/);
});
```

- [ ] **Step 2: RED pruefen** — Run: `node --test test/theme.test.js` — Expected: FAIL `ThemeLib.istHell is not a function`

- [ ] **Step 3: Implementieren** — in `renderer/lib/theme.js` vor `return {` einfuegen:

```js
  // --- Welle 1b: Flaechen aus einem frei gewaehlten Hintergrund -----------
  // Kreuzungspunkt, an dem Schwarz und Weiss gleich viel Kontrast haben.
  const HELL_GRENZE = 0.179;
  function istHell(hex) {
    const n = normalizeHex(hex, null);
    if (!n) return false;
    return relLuminance(hexToRgb(n)) > HELL_GRENZE;
  }
  function mische(a, b, t) {
    const m = (x, y) => Math.round(x + (y - x) * t);
    return { r: m(a.r, b.r), g: m(a.g, b.g), b: m(a.b, b.b) };
  }
  // Grund + Alpha -> Flaechen und passende Schrift. Panel/Hover/Linie
  // weichen 6/12/18 % Richtung Kontrast ab (hell -> dunkler, dunkel -> heller).
  function flaechenVars(hex, alphaPct) {
    const basis = hexToRgb(normalizeHex(hex, '#0b0b11'));
    const hell = relLuminance(basis) > HELL_GRENZE;
    const ziel = hell ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
    const a = clampAlpha(alphaPct) / 100;
    const f = (c) => `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
    return {
      '--bg': f(basis),
      '--panel': f(mische(basis, ziel, 0.06)),
      '--hover': f(mische(basis, ziel, 0.12)),
      '--line': rgbToHex(mische(basis, ziel, 0.18)),
      '--text': hell ? '#2b2b38' : '#ededf4',
      '--muted': hell ? '#6a6a7e' : '#a0a0b4',
      '--ts': hell ? '#8e8ea2' : '#6e6e82'
    };
  }
```

und die `return`-Zeile um `istHell, flaechenVars` ergaenzen.

- [ ] **Step 4: GREEN** — Run: `node --test test/theme.test.js` — Expected: PASS
- [ ] **Step 5: Commit** — `git add renderer/lib/theme.js test/theme.test.js && git commit -m "feat: Flaechen und Schrift aus eigenem Hintergrund ableiten" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 2: Katalog — Originalfarben, Anpassungen, Balkenfarbe, Farbfilter

**Files:** Modify `renderer/lib/themes.js`, Test `test/themes.test.js` (anhaengen)

**Interfaces:**
- Consumes: `ThemeLib.normalizeHex`
- Produces: `THEMES[i].farben = { akzent, hintergrund, partikel }`; `cleanAnpassungen(roh) → object`; `cleanThemePrefs` liefert zusaetzlich `anpassungen`; `mergeThemePrefs` mischt `anpassungen` pro Theme; `effektiveFarben(prefs) → { akzent, hintergrund, partikel }`; `anpassungFuer(prefs) → { akzent?, hintergrund?, partikel? }`; `balkenFarbe(prefs) → string|null`; `SICHERE_FARBE: RegExp`; `istSichereFarbe(s) → boolean`

- [ ] **Step 1: Failing Tests anhaengen** an `test/themes.test.js`:

```js
// --- Welle 1b ----------------------------------------------------------------
test('THEMES: jedes Theme hat gueltige Originalfarben', () => {
  for (const t of K.THEMES) {
    for (const k of ['akzent', 'hintergrund', 'partikel']) assert.match(t.farben[k], /^#[0-9a-f]{6}$/, t.id + '.' + k);
  }
});

test('cleanAnpassungen: nur Nicht-Neon-Themes, nur drei Schluessel, nur Hex', () => {
  const roh = {
    sakura: { akzent: '#ABC', hintergrund: 'rot', partikel: '#112233', fremd: '#000000' },
    'neon-dual': { akzent: '#123456' },
    gibtsnicht: { akzent: '#123456' },
    koi: 'kaputt'
  };
  assert.deepEqual(K.cleanAnpassungen(roh), { sakura: { akzent: '#aabbcc', partikel: '#112233' } });
  assert.deepEqual(K.cleanAnpassungen(null), {});
});

test('cleanThemePrefs liefert anpassungen, Standard leer', () => {
  assert.deepEqual(K.cleanThemePrefs(null).anpassungen, {});
});

test('mergeThemePrefs: Anpassung eines Themes laesst andere stehen', () => {
  const g = { theme: 'koi', anpassungen: { sakura: { akzent: '#111111' }, koi: { partikel: '#222222' } } };
  const neu = K.mergeThemePrefs(g, { anpassungen: { koi: { hintergrund: '#333333' } } });
  assert.deepEqual(neu.anpassungen.sakura, { akzent: '#111111' });
  assert.deepEqual(neu.anpassungen.koi, { hintergrund: '#333333' });
  // Zuruecksetzen = leeres Objekt -> Theme faellt aus den Anpassungen raus
  assert.equal(K.mergeThemePrefs(neu, { anpassungen: { koi: {} } }).anpassungen.koi, undefined);
});

test('effektiveFarben: Anpassung schlaegt Original', () => {
  const p = K.cleanThemePrefs({ theme: 'sakura', anpassungen: { sakura: { partikel: '#00ff00' } } });
  assert.deepEqual(K.effektiveFarben(p), { akzent: K.themeById('sakura').farben.akzent, hintergrund: K.themeById('sakura').farben.hintergrund, partikel: '#00ff00' });
});

test('balkenFarbe: Neon null, sonst effektiver Hintergrund', () => {
  assert.equal(K.balkenFarbe(K.cleanThemePrefs({ theme: 'neon-dual' })), null);
  assert.equal(K.balkenFarbe(K.cleanThemePrefs({ theme: 'blasen' })), K.themeById('blasen').farben.hintergrund);
  assert.equal(K.balkenFarbe(K.cleanThemePrefs({ theme: 'wald', anpassungen: { wald: { hintergrund: '#101010' } } })), '#101010');
});

test('istSichereFarbe: nur Hex und rgb/rgba', () => {
  for (const ok of ['#fff', '#fff4f8', '#fff4f8cc', 'rgb(1, 2, 3)', 'rgba(1,2,3,.5)']) assert.equal(K.istSichereFarbe(ok), true, ok);
  for (const boese of ['red; } body { display:none', '#fff;}', 'url(x)', 'rgb(1,2,3)) ; x', '', null, 42, 'expression(alert(1))']) {
    assert.equal(K.istSichereFarbe(boese), false, String(boese));
  }
});
```

- [ ] **Step 2: RED** — `node --test test/themes.test.js` — Expected: FAIL (`farben` undefined)

- [ ] **Step 3: Implementieren** in `renderer/lib/themes.js`:

In jedem `THEMES`-Eintrag ein Feld `farben` ergaenzen:

```js
// neon-dual
farben: { akzent: '#35e0ff', hintergrund: '#0b0b11', partikel: '#35e0ff' }
// sakura
farben: { akzent: '#e0659a', hintergrund: '#fff4f8', partikel: '#ffb3cc' }
// wald
farben: { akzent: '#9fe07a', hintergrund: '#0e1f14', partikel: '#e8ff7a' }
// koi
farben: { akzent: '#ff8a3d', hintergrund: '#082625', partikel: '#ff7a2a' }
// blasen
farben: { akzent: '#7b6cff', hintergrund: '#f0f7ff', partikel: '#aac8ff' }
```

Nach `KLICK_SPERRE` einfuegen:

```js
  const FARB_SCHLUESSEL = ['akzent', 'hintergrund', 'partikel'];
  // Fuer die Nachricht ans Twitch-iframe: nur Farbwerte, nie freies CSS.
  // preload.js traegt eine Kopie (Sandbox, kein require) - test/balken-farbe
  // prueft den Gleichlauf.
  const SICHERE_FARBE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
  function istSichereFarbe(s) { return typeof s === 'string' && SICHERE_FARBE.test(s); }

  function cleanAnpassungen(roh) {
    const aus = {};
    if (!roh || typeof roh !== 'object') return aus;
    for (const t of THEMES) {
      if (t.id === 'neon-dual') continue;
      const a = roh[t.id];
      if (!a || typeof a !== 'object') continue;
      const sauber = {};
      for (const k of FARB_SCHLUESSEL) {
        const hex = ThemeLib.normalizeHex(a[k], null);
        if (hex) sauber[k] = hex;
      }
      if (Object.keys(sauber).length) aus[t.id] = sauber;
    }
    return aus;
  }
```

`cleanThemePrefs` ergaenzen um `anpassungen: cleanAnpassungen(p.anpassungen)`.

`mergeThemePrefs` ersetzen durch:

```js
  function mergeThemePrefs(gespeichert, update) {
    const g = gespeichert && typeof gespeichert === 'object' ? gespeichert : {};
    const u = update && typeof update === 'object' ? update : {};
    const anpassungen = { ...(g.anpassungen || {}), ...((u.anpassungen && typeof u.anpassungen === 'object') ? u.anpassungen : {}) };
    return cleanThemePrefs({ ...g, ...u, anpassungen });
  }
```

Danach:

```js
  function anpassungFuer(prefs) {
    const p = prefs || {};
    return (p.anpassungen && p.anpassungen[p.theme]) || {};
  }
  function effektiveFarben(prefs) {
    const t = themeById(prefs && prefs.theme);
    return { ...t.farben, ...anpassungFuer(prefs) };
  }
  function balkenFarbe(prefs) {
    if (!prefs || cleanTheme(prefs.theme) === 'neon-dual') return null;
    return effektiveFarben(prefs).hintergrund;
  }
```

Rueckgabe-Objekt um `FARB_SCHLUESSEL, SICHERE_FARBE, istSichereFarbe, cleanAnpassungen, anpassungFuer, effektiveFarben, balkenFarbe` ergaenzen.

Hinweis: Der bestehende Test `cleanThemePrefs: Bestandsdaten ohne theme` vergleicht per `deepEqual` das ganze Objekt — dort jeweils `anpassungen: {}` in die Erwartung aufnehmen (gehoert zur gewollten Formaenderung).

- [ ] **Step 4: GREEN** — `node --test test/themes.test.js && npm test` — Expected: alles PASS
- [ ] **Step 5: Commit** — `feat: Originalfarben, Anpassungen pro Theme und sichere Balkenfarbe`

---

### Task 3: Runtime — Anpassungen, `data-hell`, Partikel-Neustart

**Files:** Modify `renderer/lib/theme-runtime.js`, Test `test/theme-runtime.test.js` (anhaengen)

**Interfaces:**
- Consumes: `ThemeLib.flaechenVars/istHell/accentVars`, `Katalog.effektiveFarben/anpassungFuer`
- Produces: Welt-Kontext `fabrik({ engine, fenster, FxEngine, farben: { partikel } })`; `<html data-hell>`; Inline-Variablen wie Spec 4

- [ ] **Step 1: Failing Tests anhaengen:**

```js
// --- Welle 1b ----------------------------------------------------------------
test('Anpassung Akzent/Hintergrund setzt Inline-Variablen, Entfernen raeumt auf', async () => {
  const a = aufbau({ welten: { sakura: protokollWelt([]) } });
  await a.rt.anwenden({ theme: 'sakura', anpassungen: { sakura: { akzent: '#112233', hintergrund: '#101010' } } });
  assert.equal(a.styleProps.get('--accent'), '#112233');
  assert.equal(a.styleProps.get('--text'), '#ededf4');
  assert.equal(a.doc.documentElement.dataset.hell, '0', 'dunkler eigener Grund -> keine Namens-Abdunklung');
  await a.rt.anwenden({ theme: 'sakura' });
  assert.equal(a.styleProps.has('--accent'), false);
  assert.equal(a.styleProps.has('--text'), false);
  assert.equal(a.doc.documentElement.dataset.hell, '1', 'Sakura-Original ist hell');
});

test('Neon: data-hell 0 und keine Flaechen-Inline-Reste', async () => {
  const a = aufbau({ welten: { koi: protokollWelt([]), 'neon-dual': protokollWelt([]) } });
  await a.rt.anwenden({ theme: 'koi', anpassungen: { koi: { hintergrund: '#ffffff' } } });
  assert.equal(a.doc.documentElement.dataset.hell, '1');
  await a.rt.anwenden({ theme: 'neon-dual' });
  assert.equal(a.doc.documentElement.dataset.hell, '0');
  assert.equal(a.styleProps.has('--text'), false);
  assert.equal(a.styleProps.has('--line'), false);
});

test('Welt bekommt die effektive Partikelfarbe', async () => {
  let farben = null;
  const a = aufbau({ welten: { wald: (ctx) => { farben = ctx.farben; return { start() {}, stop() {} }; } } });
  await a.rt.anwenden({ theme: 'wald', anpassungen: { wald: { partikel: '#ff00ff' } } });
  assert.deepEqual(farben, { partikel: '#ff00ff' });
});

test('Partikelfarbe aendern startet die Welt neu (genau eine), Akzent nicht', async () => {
  const log = [];
  const a = aufbau({ welten: { koi: protokollWelt(log) } });
  await a.rt.anwenden({ theme: 'koi' });
  await a.rt.anwenden({ theme: 'koi', anpassungen: { koi: { akzent: '#123456' } } });
  assert.deepEqual(log, ['start']);
  await a.rt.anwenden({ theme: 'koi', anpassungen: { koi: { akzent: '#123456', partikel: '#abcdef' } } });
  assert.deepEqual(log, ['start', 'stop', 'start']);
  assert.equal(a.engines.filter((e) => !e.gestoppt).length, 1);
});
```

- [ ] **Step 2: RED** — `node --test test/theme-runtime.test.js` — Expected: FAIL (u. a. `dataset.hell` undefined)

- [ ] **Step 3: Implementieren** in `renderer/lib/theme-runtime.js`:

Oben neben `NEON_VARS`:

```js
  const AKZENT_VARS = ['--accent', '--accent-title', '--accent-border', '--accent-glow', '--accent-dim', '--accent-contrast'];
  const FLAECHEN_VARS = ['--bg', '--panel', '--hover', '--line', '--text', '--muted', '--ts'];
```

Neue Zustandsvariable bei den anderen: `let weltPartikel = null;`

In `setzeFarben(prefs)` den `else`-Zweig ersetzen durch:

```js
      } else {
        for (const k of NEON_VARS.concat(FLAECHEN_VARS)) r.style.removeProperty(k);
        const anp = Katalog.anpassungFuer(prefs);
        if (anp.akzent) {
          const v = ThemeLib.accentVars(anp.akzent, 100);
          for (const k of AKZENT_VARS) r.style.setProperty(k, v[k]);
        }
        if (anp.hintergrund) {
          const alphaPct = fenster === 'chat' ? prefs.chatAlpha : 100;
          const v = ThemeLib.flaechenVars(anp.hintergrund, alphaPct);
          for (const k of FLAECHEN_VARS) r.style.setProperty(k, v[k]);
        }
      }
```

und direkt vor `r.dataset.theme = prefs.theme;`:

```js
      r.dataset.hell = prefs.theme !== 'neon-dual' && ThemeLib.istHell(Katalog.effektiveFarben(prefs).hintergrund) ? '1' : '0';
```

Wichtig: Der Neon-Zweig muss zusaetzlich die Flaechen-Reste einer vorherigen Anpassung entfernen — am Anfang des `if (prefs.theme === 'neon-dual')`-Zweigs: `for (const k of FLAECHEN_VARS) r.style.removeProperty(k);` (die Neon-`accentVars` setzen `--bg/--panel/--hover` danach neu).

In `starteWelt` die Signatur auf `starteWelt(id, faktor, meinLauf, partikel)` erweitern, `weltPartikel = partikel;` neben `weltId = id;` setzen und die Fabrik so aufrufen:

```js
        welt = fabrik({ engine, fenster, FxEngine, farben: { partikel } }) || null;
```

In `stoppeWelt` zusaetzlich `weltPartikel = null;`.

In `anwenden` die beiden Zeilen ab `if (weltId === prefs.theme && engine)` ersetzen durch:

```js
      const partikel = Katalog.effektiveFarben(prefs).partikel;
      if (weltId === prefs.theme && engine && weltPartikel === partikel) { engine.setFaktor(faktor); return; }
      lauf++;
      stoppeWelt();
      await starteWelt(prefs.theme, faktor, lauf, partikel);
```

In `starteVorschau` die Fabrik mit Farben aufrufen:

```js
        w = fabrik({ engine: eng, fenster: 'vorschau', FxEngine,
          farben: { partikel: Katalog.effektiveFarben({ ...(letztePrefs || {}), theme: id }).partikel } });
```

- [ ] **Step 4: GREEN** — `node --test test/theme-runtime.test.js && npm test` — Expected: PASS
- [ ] **Step 5: Commit** — `feat: Runtime wendet Theme-Anpassungen an und reicht Partikelfarbe weiter`

---

### Task 4: Welten nehmen die Partikelfarbe

**Files:** Modify `renderer/themes/{sakura,wald,koi,blasen}/welt.js`, Test `test/welten.test.js` (anhaengen)

**Interfaces:** Consumes Welt-Kontext `farben.partikel` (Task 3). Fallback, falls `farben` fehlt: jeweilige Originalfarbe.

- [ ] **Step 1: Failing Test anhaengen** an `test/welten.test.js`:

```js
// --- Welle 1b: Partikelfarbe ---------------------------------------------------
function sammelEngine() {
  const stile = [];
  const e = {
    element(p) { stile.push(JSON.stringify((p && p.stil) || {})); return { style: {}, appendChild() {} }; },
    spawn(p) { stile.push(JSON.stringify(p.stil || {})); return { style: {}, isConnected: true, getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) }; },
    schleife() {}, intervall(fn) { fn(); }, entferne() {},
    groesse: () => ({ w: 300, h: 200 }), rechteck: () => ({ left: 0, top: 0 }), faktor: 1
  };
  return { e, stile };
}
for (const id of ['sakura', 'wald', 'koi', 'blasen']) {
  test(id + ': Partikel nutzen farben.partikel', () => {
    const fabrik = ladeWelt(id);
    const { e, stile } = sammelEngine();
    const welt = fabrik({ engine: e, fenster: 'chat', FxEngine, farben: { partikel: '#12ab34' } });
    welt.start();
    welt.ereignis('kiste', { betrag: 50, ursprung: { x: 100, y: 100 } });
    assert.ok(stile.some((s) => s.includes('#12ab34')), 'Farbe taucht in Partikel-Stilen auf: ' + stile.slice(0, 3).join(' | '));
  });
}
```

(Hinweis: `ereignis` in Blasen/Koi nutzt `setTimeout` — die laufen nach dem Test ins Leere; `node --test` wartet, das ist ok.)

- [ ] **Step 2: RED** — `node --test test/welten.test.js` — Expected: 4 neue FAIL

- [ ] **Step 3: Implementieren**

**sakura/welt.js:** Fabrik-Signatur `function ({ engine, FxEngine, farben })`, oben `const FARBE = (farben && farben.partikel) || '#ffb3cc';`. In `bluete()` statt `inhalt: '🌸'` und `stil: { fontSize… }`:

```js
      return engine.spawn({
        ebene,
        stil: {
          width: groesse + 'px', height: Math.round(groesse * 0.8) + 'px',
          marginLeft: (-groesse / 2) + 'px', marginTop: (-groesse / 2) + 'px',
          borderRadius: '150% 0 150% 0',
          background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,.75), transparent 65%), ' + FARBE,
          boxShadow: '0 0 3px rgba(0,0,0,.08)'
        },
        keyframes: [ /* unveraendert */ ],
```

**wald/welt.js:** Signatur um `farben` erweitern, `const FARBE = (farben && farben.partikel) || '#e8ff7a';`, in `GLUEH`: `background: FARBE, boxShadow: '0 0 8px 3px ' + FARBE + 'b3'`.

**koi/welt.js:** Signatur um `farben`, `const FARBE = (farben && farben.partikel) || '#ff7a2a';`. In `FISCH`: `background: 'radial-gradient(circle at 25% 50%, #fff 0 2px, transparent 3px), ' + FARBE`, `boxShadow: '0 0 6px ' + FARBE + '99'`. In `schwanz()`: `s.style.borderLeft = '7px solid ' + FARBE;`.

**blasen/welt.js:** Signatur um `farben`, `const FARBE = (farben && farben.partikel) || '#aac8ff';`. `SCHILLER` wird:

```js
    const SCHILLER = 'radial-gradient(circle at 30% 30%, rgba(255,255,255,.95) 0 12%, transparent 13%), ' +
      'radial-gradient(circle, rgba(255,255,255,0) 55%, ' + FARBE + '8c 70%, rgba(255,170,230,.6) 85%, rgba(170,255,230,.5) 100%)';
```

- [ ] **Step 4: GREEN** — `node --test test/welten.test.js && npm test`
- [ ] **Step 5: Commit** — `feat: Welten uebernehmen die Partikelfarbe, Sakura-Blueten als Form`

---

### Task 5: Video-Balken in Theme-Farbe

**Files:** Modify `renderer/video/video.js`, `preload.js`; Create `test/balken-farbe.test.js`

**Interfaces:** Consumes `ThemeKatalog.balkenFarbe` (Task 2). Nachricht `{ source: 'twitchdual-theme', balken: string|null }`.

- [ ] **Step 1: Failing Test** — `test/balken-farbe.test.js`:

```js
// Der Preload ist sandboxed (kein require) und traegt eine Kopie des
// Farbfilters. Dieser Test haelt beide gleich und prueft den Einbau.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const K = require('../renderer/lib/themes');
const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

test('preload nutzt denselben Farbfilter wie themes.js', () => {
  assert.ok(preload.includes(K.SICHERE_FARBE.source), 'Regex-Kopie fehlt oder weicht ab');
});

test('preload pflegt das Balken-Style-Element', () => {
  assert.ok(preload.includes("'twitchdual-theme'"));
  assert.ok(preload.includes('twitchdual-balken'));
});
```

- [ ] **Step 2: RED** — `node --test test/balken-farbe.test.js` — Expected: FAIL

- [ ] **Step 3a: preload.js** — im `setupAdblock`-Zweig direkt nach `if (!isTwitchFrame) return;` einfuegen (vor dem bestehenden `window.addEventListener('message', …)`):

```js
    // Balken ueber/unter dem Video in Theme-Farbe (Spec Welle 1b, 3.). Das
    // <video> fuellt das iframe; sein Hintergrund ist genau die Balkenflaeche.
    // Farbfilter = Kopie von ThemeKatalog.SICHERE_FARBE (Sandbox: kein require;
    // test/balken-farbe.test.js haelt beide gleich).
    const SICHERE_FARBE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
    window.addEventListener('message', (e) => {
      const d = e && e.data;
      if (!d || d.source !== 'twitchdual-theme') return;
      try {
        let st = document.getElementById('twitchdual-balken');
        if (typeof d.balken !== 'string' || !SICHERE_FARBE.test(d.balken)) { if (st) st.remove(); return; }
        if (!st) {
          st = document.createElement('style');
          st.id = 'twitchdual-balken';
          (document.head || document.documentElement).appendChild(st);
        }
        st.textContent = 'video, .video-player, .video-player > div { background-color: ' + d.balken + ' !important; }';
      } catch (err) { /* Player nie stoeren */ }
    });
```

- [ ] **Step 3b: video.js** — nach `function applyTheme(prefs) {…}` (Task 5 von Welle 1) ersetzen durch:

```js
let balkenFarbe = null;
function sendeBalken() {
  const f = $player.querySelector('iframe');
  if (f && f.contentWindow) {
    try { f.contentWindow.postMessage({ source: 'twitchdual-theme', balken: balkenFarbe }, '*'); } catch (e) { /* egal */ }
  }
}
function applyTheme(prefs) {
  themeRuntime.anwenden(prefs);
  balkenFarbe = ThemeKatalog.balkenFarbe(ThemeKatalog.cleanThemePrefs(prefs));
  sendeBalken();
}
```

Und in `mountPlayer` im bestehenden `player.addEventListener(Twitch.Player.READY, () => {` als erste Zeile: `sendeBalken();`

- [ ] **Step 4: GREEN + Suite** — `node --test test/balken-farbe.test.js && npm test`

- [ ] **Step 5: Live messen** — App neu starten (Preload aendert sich nur beim Neustart): Fenster schliessen, `npx electron . --remote-debugging-port=9333`, Kanal laden, Theme `sakura` speichern, dann mit dem Browser-Session-Skript (Target.attachToTarget auf das `player.twitch.tv`-Ziel) `getComputedStyle(document.querySelector('video')).backgroundColor` lesen.
Expected: `rgb(255, 244, 248)`; nach Wechsel auf `neon-dual`: `rgba(0, 0, 0, 0)` (Style entfernt).

- [ ] **Step 6: Commit** — `feat: Balken ueber und unter dem Video in Theme-Farbe`

---

### Task 6: Deko-Ebenen, Schrift-Variablen, generische Namensregel

**Files:** Modify `renderer/chat/index.html`, `renderer/chat/chat.css`, `renderer/video/index.html`, `renderer/themes/sakura/theme.css`, `renderer/themes/blasen/theme.css`

- [ ] **Step 1: Chat-Markup** — direkt nach `<div id="fx-vorn" class="fx-ebene"></div>`:

```html
  <div id="theme-deko" class="theme-deko" aria-hidden="true"></div>
```

- [ ] **Step 2: chat.css** — Schriftzeile 26 `font-family: 'Inter', 'Segoe UI', Roboto, sans-serif;` ersetzen durch `font-family: var(--schrift, 'Inter', 'Segoe UI', Roboto, sans-serif);`. Am Ende anhaengen:

```css
/* --- Welle 1b: Deko + Titel-Schrift + Namens-Abdunklung ------------------- */
.theme-deko { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
#title, .galerie-kopf, .opt-group-title { font-family: var(--schrift-titel, inherit); }
/* Heller (auch selbst gewaehlter) Grund: helle Twitch-Namen abdunkeln. */
:root[data-hell="1"] .msg .user,
:root[data-hell="1"] #uc-name { color: color-mix(in srgb, var(--name, #bf94ff) 45%, #000); }
```

- [ ] **Step 3: Video-Markup/Stil** — in `renderer/video/index.html` direkt nach `<div id="fx-hinten" class="fx-ebene"></div>` (im `#home`):

```html
    <div class="theme-deko" aria-hidden="true"></div>
```

Im `<style>`: `font-family: 'Inter', 'Segoe UI', Roboto, sans-serif;` (Z. ~30) → `font-family: var(--schrift, 'Inter', 'Segoe UI', Roboto, sans-serif);`; die Regel `#home > :not(#fx-hinten):not(#home-version)` wird zu `#home > :not(#fx-hinten):not(.theme-deko):not(#home-version)`; ergaenzen:

```css
    #home > .theme-deko { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
    #home-title, .lc-name, .fav .name { font-family: var(--schrift-titel, inherit); }
```

- [ ] **Step 4: Alte Namensregeln entfernen** — in `sakura/theme.css` und `blasen/theme.css` die beiden Zeilen `…/* Helle Flaeche…*/` + `:root[data-theme=…] .msg .user, … color-mix(… 55% …)` loeschen (jetzt generisch ueber `data-hell`).

- [ ] **Step 5: Suite + Live** — `npm test`; Chat- und Video-Fenster neu laden (`location.reload()` per `tools/cdp-eval.js`), Theme `neon-dual`: Screenshot beider Fenster muss wie vorher aussehen (Schrift Inter/Segoe, keine Deko). Theme `sakura`: `getComputedStyle(document.querySelector('.msg .user')).color` mit `--name:#FFFF00` → etwa `rgb(115, 115, 0)` (45 %).
- [ ] **Step 6: Commit** — `feat: Deko-Ebenen, Theme-Schriften und Namens-Abdunklung nach Helligkeit`

---

### Task 7: Theme-Farbwaehler im ⚙-Popup

**Files:** Modify `renderer/chat/index.html`, `renderer/chat/chat.css`, `renderer/chat/chat.js`

**Interfaces:** Consumes `ThemeKatalog.effektiveFarben/themeById`, `saveThemePrefs/previewThemePrefs` (Mischung in main, Task 2); erweitert `spiegleThemeUi()` (Welle 1, Task 6).

- [ ] **Step 1: Markup** — direkt nach dem schliessenden `</div>` von `#opt-neon-farben`:

```html
      <div id="opt-theme-farben" class="hidden">
        <label class="opt-color-row opt-row">Akzent <input type="color" id="opt-tf-akzent" /></label>
        <label class="opt-color-row opt-row">Hintergrund <input type="color" id="opt-tf-hintergrund" /></label>
        <label class="opt-color-row opt-row">Partikel <input type="color" id="opt-tf-partikel" /></label>
        <button id="opt-tf-reset" type="button">Farben zurücksetzen</button>
      </div>
```

- [ ] **Step 2: CSS** anhaengen: `#opt-theme-farben { display: flex; flex-direction: column; gap: 8px; } #opt-theme-farben.hidden { display: none; }` und `#opt-tf-reset` bekommt dieselben Regeln wie `#opt-color-reset` (Selektor dort ergaenzen: `#opt-color-reset, #opt-tf-reset`).

- [ ] **Step 3: chat.js** — nach `const $neonFarben = …`:

```js
const $themeFarben = document.getElementById('opt-theme-farben');
const TF = {
  akzent: document.getElementById('opt-tf-akzent'),
  hintergrund: document.getElementById('opt-tf-hintergrund'),
  partikel: document.getElementById('opt-tf-partikel')
};
// Alle drei Werte gehen zusammen raus (main mischt pro Theme).
function themeFarbenAusWaehlern() {
  return { anpassungen: { [themePrefs.theme]: {
    akzent: TF.akzent.value, hintergrund: TF.hintergrund.value, partikel: TF.partikel.value
  } } };
}
for (const el of Object.values(TF)) {
  el.addEventListener('input', () => window.twitchDual.previewThemePrefs(themeFarbenAusWaehlern()));
  el.addEventListener('change', () => window.twitchDual.saveThemePrefs(themeFarbenAusWaehlern()));
}
document.getElementById('opt-tf-reset').addEventListener('click', () => {
  window.twitchDual.saveThemePrefs({ anpassungen: { [themePrefs.theme]: {} } });
});
```

In `spiegleThemeUi()` ergaenzen:

```js
  $themeFarben.classList.toggle('hidden', t.farbenFrei);
  if (!t.farbenFrei) {
    const f = ThemeKatalog.effektiveFarben(themePrefs);
    for (const k of Object.keys(TF)) TF[k].value = f[k];
  }
```

Hinweis Vorschau: `previewThemePrefs` mischt in main mit dem Gespeicherten — waehrend des Ziehens wird also schon „angepasst" gerendert; `change` speichert. Alle drei Werte werden mitgeschickt; unveraenderte Werte entsprechen dem Original und sind harmlos.

- [ ] **Step 4: Suite + Live** — `npm test`; Theme `sakura`, Popup oeffnen: drei Waehler sichtbar, Neon-Block versteckt; per CDP `TF.partikel.value = '#00ff00'; TF.partikel.dispatchEvent(new Event('change'))` → nach 1 s `themePrefs.anpassungen.sakura.partikel === '#00ff00'` und ein `#fx-hinten`-Kind mit `background` `rgb(0, 255, 0)`-Anteil; „Zurücksetzen" → `themePrefs.anpassungen.sakura === undefined`. Theme `neon-dual`: Neon-Block sichtbar, Theme-Block versteckt.
- [ ] **Step 5: Commit** — `feat: Akzent, Hintergrund und Partikel pro Theme waehlbar`

---

### Task 8: Stil Sakura · Bluetenzweig

**Files:** Modify `renderer/themes/sakura/theme.css` (anhaengen)

- [ ] **Step 1: CSS anhaengen** (Variablenblock `:root[data-theme="sakura"]` um zwei Zeilen ergaenzen):

```css
/* in den bestehenden :root[data-theme="sakura"]-Block: */
  --schrift: Candara, "Segoe UI", sans-serif;
  --schrift-titel: "Segoe Script", Candara, cursive;
```

```css
/* --- Welle 1b: Stil -------------------------------------------------------- */
:root[data-theme="sakura"] #home-title, :root[data-theme="sakura"] #title,
:root[data-theme="sakura"] .lc-name, :root[data-theme="sakura"] .fav .name { font-weight: 400; color: var(--accent-title); }
:root[data-theme="sakura"] #channel, :root[data-theme="sakura"] #filter-input,
:root[data-theme="sakura"] #add-input, :root[data-theme="sakura"] #chat-input {
  border-radius: 12px; border: 1.5px solid #ffd1e1;
}
:root[data-theme="sakura"] #load, :root[data-theme="sakura"] #home-btn,
:root[data-theme="sakura"] #home-head button, :root[data-theme="sakura"] #auth-bar button,
:root[data-theme="sakura"] .lc-actions button, :root[data-theme="sakura"] .fav .actions button,
:root[data-theme="sakura"] #chat-send, :root[data-theme="sakura"] #emote-btn,
:root[data-theme="sakura"] #rewards-btn { border-radius: 12px; }
:root[data-theme="sakura"] #home-head { margin-top: 34px; border-radius: 18px 18px 0 0; }
:root[data-theme="sakura"] .live-card, :root[data-theme="sakura"] .fav, :root[data-theme="sakura"] .vod {
  background: #fffafc; border: 1.5px solid #ffd1e1; border-radius: 18px;
  box-shadow: 0 6px 14px rgba(224, 101, 154, .15); position: relative; overflow: visible;
}
:root[data-theme="sakura"] .lc-thumbwrap { border-radius: 14px; margin: 6px; }
:root[data-theme="sakura"] .live-card::after {
  content: "🌸"; position: absolute; right: -6px; top: -10px; font-size: 20px;
  transform: rotate(18deg); pointer-events: none;
}
:root[data-theme="sakura"] .fav::after {
  content: "✿"; position: absolute; right: 12px; top: -11px; color: #ff9ec0; font-size: 16px; pointer-events: none;
}
:root[data-theme="sakura"] .lc-live { background: #ff7aa8; border-radius: 10px; }
:root[data-theme="sakura"] .lc-live::before {
  content: "🌸"; width: auto; height: auto; background: none; animation: none; font-size: 10px;
}
:root[data-theme="sakura"] .fav .badge { border-radius: 8px; }
:root[data-theme="sakura"] .fav .avatar { box-shadow: 0 0 0 2px #fff, 0 0 0 3px #ffb3cc; }
:root[data-theme="sakura"] #settings-pop, :root[data-theme="sakura"] #user-card,
:root[data-theme="sakura"] #points-chip { border-radius: 16px; }
/* Deko: bluehender Zweig ueber dem Home-Kopf, Bluetenbuendel im Chat */
:root[data-theme="sakura"] #home > .theme-deko::before {
  content: ""; position: absolute; left: -10px; top: 18px; width: 72%; height: 6px; border-radius: 4px;
  background: #6b4a3a; transform: rotate(2deg); box-shadow: 140px -10px 0 -1px #6b4a3a;
}
:root[data-theme="sakura"] #home > .theme-deko::after {
  content: "🌸   🌸  🌸     🌸   🌸 🌸    🌸   🌸"; white-space: pre; position: absolute;
  left: 24px; top: 4px; font-size: 18px; letter-spacing: 4px;
}
:root[data-theme="sakura"] #theme-deko::after {
  content: "🌸 🌸\A  🌸"; white-space: pre; position: absolute; right: 12px; top: 56px;
  font-size: 18px; line-height: 1.3; opacity: .45;
}
```

- [ ] **Step 2: Live** — Theme `sakura`, Home oeffnen, Screenshot Video-Home + Chat (+ ⚙-Popup). Pruefen: Zweig ueber dem Home-Kopf, Kaesten rund mit Bluete, Handschrift-Titel; Home-Knoepfe klickbar (`document.elementFromPoint` auf `#home-close` liefert den Knopf).
- [ ] **Step 3: Commit** — `feat: Sakura im Bluetenzweig-Stil`

---

### Task 9: Stil Wald · Waldhuette

**Files:** Modify `renderer/themes/wald/theme.css` (anhaengen)

- [ ] **Step 1: CSS** — Variablenblock ergaenzen:

```css
  --schrift: Georgia, "Palatino Linotype", serif;
  --schrift-titel: Georgia, serif;
  --holz: repeating-linear-gradient(90deg, rgba(0,0,0,.12) 0 2px, transparent 2px 9px),
          repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 1px, transparent 1px 23px),
          linear-gradient(180deg, #7a5233, #5d3d25);
  --holz-dunkel: repeating-linear-gradient(90deg, rgba(0,0,0,.18) 0 2px, transparent 2px 11px),
          linear-gradient(180deg, #4a3020, #362215);
  --moos: radial-gradient(circle at 8px 8px, #6fbf5a 0 6px, transparent 7px) 0 0/14px 10px,
          radial-gradient(circle at 4px 9px, #4f8a3c 0 5px, transparent 6px) 5px 0/12px 10px;
```

anhaengen:

```css
/* --- Welle 1b: Waldhuette ------------------------------------------------- */
:root[data-theme="wald"] #home-title, :root[data-theme="wald"] #title { font-style: italic; color: #ffe8a8; text-shadow: 0 1px 0 #2c1a0e; }
:root[data-theme="wald"] #bar, :root[data-theme="wald"] #head,
:root[data-theme="wald"] #home-head, :root[data-theme="wald"] #footer {
  background: var(--holz); border-bottom: 2px solid #2c1a0e; box-shadow: 0 3px 0 #1a0f07;
}
:root[data-theme="wald"] .live-card, :root[data-theme="wald"] .fav, :root[data-theme="wald"] .vod {
  background: var(--holz-dunkel); border: 2px solid #2c1a0e; border-radius: 4px;
  box-shadow: 0 4px 0 #1a0f07; position: relative; overflow: visible; color: #f3e6cf;
}
:root[data-theme="wald"] .live-card::before, :root[data-theme="wald"] .fav::before {
  content: ""; position: absolute; left: -2px; right: -2px; top: -6px; height: 10px;
  background: var(--moos); pointer-events: none; z-index: 1; filter: drop-shadow(0 1px 0 #2a5a26);
}
:root[data-theme="wald"] .lc-thumbwrap { margin: 8px 8px 0; border: 3px solid #2c1a0e; }
:root[data-theme="wald"] .lc-name, :root[data-theme="wald"] .fav .name { color: #ffe8a8; }
:root[data-theme="wald"] .lc-live { background: #c0392b; border-radius: 2px; box-shadow: 0 0 0 2px #2c1a0e; }
:root[data-theme="wald"] .lc-actions button, :root[data-theme="wald"] .fav .actions button,
:root[data-theme="wald"] #home-head button, :root[data-theme="wald"] #auth-bar button,
:root[data-theme="wald"] #home-btn, :root[data-theme="wald"] #emote-btn, :root[data-theme="wald"] #rewards-btn {
  background: #2c1a0e; color: #e8d3b0; border: 1px solid #8a5f3c; border-radius: 3px;
}
:root[data-theme="wald"] #load, :root[data-theme="wald"] #chat-send, :root[data-theme="wald"] .fav .watch {
  background: #6fbf5a; color: #10200f; border: 2px solid #2c1a0e; border-radius: 3px; font-weight: 700;
}
:root[data-theme="wald"] #channel, :root[data-theme="wald"] #chat-input,
:root[data-theme="wald"] #filter-input, :root[data-theme="wald"] #add-input {
  background: #f3e6cf; color: #2c1a0e; border: 2px solid #2c1a0e; border-radius: 3px;
}
:root[data-theme="wald"] .fav .avatar { box-shadow: 0 0 0 2px #2c1a0e; }
:root[data-theme="wald"] .fav .badge { border-radius: 2px; }
:root[data-theme="wald"] #settings-pop, :root[data-theme="wald"] #user-card { border: 2px solid #2c1a0e; border-radius: 4px; }
/* Deko: dunkle Baum-Silhouetten am unteren Rand (Home + hinter dem Chat) */
:root[data-theme="wald"] .theme-deko::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 120px;
  background:
    radial-gradient(ellipse 34px 70px at 6% 100%, #07120a 98%, transparent 100%),
    radial-gradient(ellipse 46px 95px at 22% 100%, #0a170d 98%, transparent 100%),
    radial-gradient(ellipse 30px 60px at 40% 100%, #07120a 98%, transparent 100%),
    radial-gradient(ellipse 52px 105px at 63% 100%, #0a170d 98%, transparent 100%),
    radial-gradient(ellipse 36px 75px at 84% 100%, #07120a 98%, transparent 100%),
    radial-gradient(ellipse 28px 55px at 97% 100%, #0a170d 98%, transparent 100%);
}
:root[data-theme="wald"] #theme-deko::after { bottom: 80px; opacity: .7; }
```

- [ ] **Step 2: Live** — wie Task 8 Step 2 mit `wald`. Zusaetzlich pruefen: Moos-Kante sichtbar, Text auf Holz lesbar (Screenshot).
- [ ] **Step 3: Commit** — `feat: Wald im Waldhuetten-Stil`

---

### Task 10: Stil Koi · Teich von oben

**Files:** Modify `renderer/themes/koi/theme.css` (anhaengen)

- [ ] **Step 1: CSS** — Variablenblock ergaenzen:

```css
  --schrift: "Yu Gothic UI", "Segoe UI", sans-serif;
  --schrift-titel: "Yu Gothic UI Light", "Yu Gothic UI", sans-serif;
```

anhaengen:

```css
/* --- Welle 1b: Teich von oben --------------------------------------------- */
:root[data-theme="koi"] #home { background: radial-gradient(ellipse at 40% 60%, #1f7a6a 0, #0f4a45 45%, #072b29 100%); }
:root[data-theme="koi"] #home-title, :root[data-theme="koi"] #title { letter-spacing: .2em; font-weight: 300; color: #fff2e0; }
:root[data-theme="koi"] #bar, :root[data-theme="koi"] #home-head {
  background: repeating-linear-gradient(90deg, #6b4a33 0 22px, #4a3324 22px 24px);
  box-shadow: 0 4px 0 #2a1a10; border-bottom: none;
}
:root[data-theme="koi"] .live-card, :root[data-theme="koi"] .vod {
  background: rgba(10, 50, 46, .55); border: 1px solid rgba(200, 255, 240, .3);
  border-radius: 16px; backdrop-filter: blur(3px);
}
:root[data-theme="koi"] .fav {
  background: rgba(10, 50, 46, .5); border: 1px solid rgba(200, 255, 240, .25);
  border-radius: 999px; backdrop-filter: blur(3px);
}
:root[data-theme="koi"] .lc-thumbwrap { margin: 8px 8px 0; border-radius: 12px; }
:root[data-theme="koi"] .lc-name, :root[data-theme="koi"] .fav .name { color: #ffc49a; letter-spacing: .06em; }
:root[data-theme="koi"] .lc-live {
  background: #ff3d2e; border-radius: 50%; width: 30px; height: 30px; padding: 0;
  justify-content: center; font-size: 7px; box-shadow: 0 0 0 3px rgba(255, 61, 46, .25);
}
:root[data-theme="koi"] .lc-live::before { display: none; }
:root[data-theme="koi"] .lc-actions button, :root[data-theme="koi"] .fav .actions button,
:root[data-theme="koi"] #home-head button, :root[data-theme="koi"] #auth-bar button,
:root[data-theme="koi"] #home-btn, :root[data-theme="koi"] #emote-btn, :root[data-theme="koi"] #rewards-btn {
  background: rgba(255, 138, 61, .15); color: #ffb27a; border: 1px solid #ff8a3d; border-radius: 10px;
}
:root[data-theme="koi"] #load, :root[data-theme="koi"] #chat-send, :root[data-theme="koi"] .fav .watch {
  background: #ff8a3d; color: #2a0e00; border-radius: 10px; font-weight: 700;
}
:root[data-theme="koi"] #channel, :root[data-theme="koi"] #chat-input,
:root[data-theme="koi"] #filter-input, :root[data-theme="koi"] #add-input {
  background: rgba(0, 0, 0, .25); border: 1px solid rgba(200, 255, 240, .3); border-radius: 10px;
}
:root[data-theme="koi"] .fav .avatar { box-shadow: 0 0 0 3px rgba(255, 138, 61, .3); }
:root[data-theme="koi"] #settings-pop, :root[data-theme="koi"] #user-card {
  border-radius: 14px; backdrop-filter: blur(6px);
}
/* Deko: Seerosenblaetter, Steine, statische Wasserringe */
:root[data-theme="koi"] .theme-deko::before {
  content: ""; position: absolute; inset: 0;
  background:
    radial-gradient(circle at 8% 70%, #2f8f4f 0 22px, #1f6b3a 23px 24px, transparent 25px),
    radial-gradient(circle at 78% 92%, #2f8f4f 0 17px, #1f6b3a 18px 19px, transparent 20px),
    radial-gradient(circle at 93% 38%, #2f8f4f 0 14px, #1f6b3a 15px 16px, transparent 17px),
    radial-gradient(ellipse 18px 11px at 52% 96%, #7d8884 0 95%, transparent 100%),
    radial-gradient(ellipse 12px 8px at 97% 55%, #6b7672 0 95%, transparent 100%),
    radial-gradient(circle at 85% 15%, transparent 0 14px, rgba(200,255,240,.22) 15px 16px, transparent 17px 26px, rgba(200,255,240,.14) 27px 28px, transparent 29px),
    radial-gradient(circle at 15% 30%, transparent 0 10px, rgba(200,255,240,.18) 11px 12px, transparent 13px);
}
:root[data-theme="koi"] .theme-deko::after {
  content: "🌸        🌸"; white-space: pre; position: absolute; left: calc(8% - 9px); top: calc(70% - 12px);
  font-size: 16px; filter: hue-rotate(-20deg) saturate(1.3);
}
```

- [ ] **Step 2: Live** — wie Task 8 Step 2 mit `koi`; zusaetzlich pruefen: Fische durch die Glas-Karten erkennbar (Screenshot Home).
- [ ] **Step 3: Commit** — `feat: Koi im Teich-Stil`

---

### Task 11: Stil Seifenblasen

**Files:** Modify `renderer/themes/blasen/theme.css` (anhaengen)

- [ ] **Step 1: CSS** — Variablenblock ergaenzen:

```css
  --schrift: Bahnschrift, "Segoe UI", sans-serif;
  --schrift-titel: Bahnschrift, "Segoe UI", sans-serif;
```

anhaengen:

```css
/* --- Welle 1b: Seifenblasen ------------------------------------------------ */
:root[data-theme="blasen"] #home-title, :root[data-theme="blasen"] #title { font-weight: 700; color: var(--accent-title); }
:root[data-theme="blasen"] #bar, :root[data-theme="blasen"] #head, :root[data-theme="blasen"] #home-head { background: rgba(255, 255, 255, .72); }
:root[data-theme="blasen"] .live-card, :root[data-theme="blasen"] .vod {
  border-radius: 22px; border: 2px solid transparent;
  background-image: linear-gradient(#fff, #fff), linear-gradient(120deg, #9ad0ff, #ffb0d9, #a8ffd8, #c8a8ff);
  background-origin: border-box; background-clip: padding-box, border-box;
}
:root[data-theme="blasen"] .fav { border-radius: 999px; background: rgba(255, 255, 255, .8); border: 1px solid #d6dcff; }
:root[data-theme="blasen"] .lc-thumbwrap { margin: 6px; border-radius: 18px; }
:root[data-theme="blasen"] .lc-live, :root[data-theme="blasen"] .fav .badge { border-radius: 999px; }
:root[data-theme="blasen"] .lc-live { background: #7b6cff; }
:root[data-theme="blasen"] .lc-actions button, :root[data-theme="blasen"] .fav .actions button,
:root[data-theme="blasen"] #home-head button, :root[data-theme="blasen"] #auth-bar button,
:root[data-theme="blasen"] #home-btn, :root[data-theme="blasen"] #emote-btn, :root[data-theme="blasen"] #rewards-btn {
  border-radius: 999px; background: #eef0ff; color: #7b6cff; border: 1px solid #d6dcff;
}
:root[data-theme="blasen"] #load, :root[data-theme="blasen"] #chat-send, :root[data-theme="blasen"] .fav .watch {
  border-radius: 999px; background: linear-gradient(90deg, #9ad0ff, #c8a8ff); color: #fff; border: none; font-weight: 700;
}
:root[data-theme="blasen"] #channel, :root[data-theme="blasen"] #chat-input,
:root[data-theme="blasen"] #filter-input, :root[data-theme="blasen"] #add-input {
  border-radius: 999px; background: #fff; border: 1px solid #d6dcff;
}
:root[data-theme="blasen"] .fav .avatar { box-shadow: 0 0 0 2px #fff, 0 0 0 3px #c8a8ff; }
:root[data-theme="blasen"] #points-chip { border-radius: 999px; }
:root[data-theme="blasen"] #user-card { border-radius: 18px; }
```

- [ ] **Step 2: Live** — wie Task 8 Step 2 mit `blasen`.
- [ ] **Step 3: Commit** — `feat: Seifenblasen-Stil mit Pillen und Regenbogen-Rand`

---

### Task 12: Abnahme + Doku

- [ ] **Step 1: Neon unveraendert** — Theme `neon-dual`, Screenshots Video-Home, Chat, Popup; Vergleich mit Welle-1-Stand (Schrift, Kaesten, keine Deko, Balken schwarz: `getComputedStyle(video).backgroundColor === 'rgba(0, 0, 0, 0)'` im iframe).
- [ ] **Step 2: Eigener dunkler Hintergrund in hellem Theme** — Sakura mit `anpassungen.sakura.hintergrund = '#202020'`: `--text` hell, `data-hell="0"`, Namen NICHT abgedunkelt; Balken im iframe `rgb(32, 32, 32)`.
- [ ] **Step 3: Aus bleibt aus** — je Theme `effekte: 'aus'`: 0 laufende Theme-Animationen (Deko hat keine), wie Welle-1-Abnahme.
- [ ] **Step 4: Klickbarkeit** — je Theme `document.elementFromPoint` auf `#home-close`, `.fav .vods`, `#chat-send`, `#settings-btn` liefert das Element selbst.
- [ ] **Step 5: Diagnose** — keine neuen `theme:`-Fehler im Protokoll.
- [ ] **Step 6: TODO** — in `docs/TODO.md` unter „Lebendige Themes, Welle 1" einen Unterpunkt „Welle 1b: Stil, Deko, Farben, Balken" mit Spec/Plan-Pfaden; Commit `docs: Welle 1b in TODO`.
- [ ] **Step 7: Einstellung zurueck** — `saveThemePrefs({ theme: 'neon-dual', effekte: 'normal', anpassungen: { sakura: {} } })`.
