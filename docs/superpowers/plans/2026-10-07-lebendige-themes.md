# Lebendige Themes (Welle 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Umschaltbare Gesamt-Themes mit lebendigen, interaktiven Partikel-Welten (Sakura, Wald, Koi-Teich, Seifenblasen) plus Theme-Galerie und Effekte-Regler; Neon Dual bleibt Standard.

**Architecture:** Drei DOM-freie bzw. attrappen-testbare Bausteine in `renderer/lib/` (Katalog `themes.js`, Partikel-Engine `fx-engine.js`, Fenster-Kleber `theme-runtime.js`) im UMD-Stil der vorhandenen Libs. Jedes Theme ist ein Ordner `renderer/themes/<id>/` mit `theme.css` (nur Farben/Formen) und `welt.js` (Partikel, alle Stile inline). Datenfluss ueber die vorhandenen `themePrefs` + `theme-changed`-Signale; main.js mischt Teil-Speicherungen mit dem Gespeicherten.

**Tech Stack:** Electron 33 (Chromium 130), Vanilla JS, Web Animations API, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-07-lebendige-themes-design.md`

## Global Constraints

- Standard-Theme `'neon-dual'`, Standard-Stufe `'normal'`; Stufen exakt `'aus'`, `'wenig'`, `'normal'`, `'viel'` mit Faktoren `0`, `0.4`, `1`, `1.8`.
- Theme-IDs exakt: `'neon-dual'`, `'sakura'`, `'wald'`, `'koi'`, `'blasen'`.
- **Stufe `aus` = nichts laeuft:** keine Welt geladen/gestartet, keine rAF-Schleife, kein Intervall, kein Timer, kein Maus-/Klick-Listener, keine Effekte.
- Effekt-Ebenen haben immer `pointer-events: none`; die App bekommt jeden Klick unveraendert.
- Keine Partikel ueber dem laufenden Player ausser Gastauftritten; im Nur-Video-Modus (`body.video-only`) gar keine Effekte.
- Kein `prefers-reduced-motion`-Zweig (Projekt-Entscheidung).
- Bestandsnutzer ohne `theme` im Store sehen Neon Dual unveraendert.
- Kommentare/Bezeichner deutsch, Umlaute in Code-Kommentaren als ae/oe/ue (Repo-Stil); sichtbare UI-Texte mit echten Umlauten.
- Jeder Commit endet mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch: `feat/sammel-verbesserungen` (kein Release, kein Push — Janis buendelt Releases).

## Review Focus

- Teil-Speicherungen (Preset-Klick, Farbwaehler, Deckkraft, „Farben zuruecksetzen") duerfen `theme`/`effekte` nicht zuruecksetzen → Test in Task 1 (`mergeThemePrefs`).
- Schnelles Durchklicken der Galerie, waehrend eine `welt.js` noch laedt, darf keine zwei Welten gleichzeitig starten → Test in Task 3 (ueberholter Ladevorgang).
- Helle Themes + helle Twitch-Namensfarben (z. B. `#FFFF00`) muessen lesbar bleiben → `--name` + `color-mix` in Task 4/8/11, Live-Pruefung in Task 12.
- Umschalten auf `aus` muss eine laufende Welt samt Listenern und Timern restlos beenden → Test in Task 3, Live-Pruefung `document.getAnimations().length === 0` in Task 12.
- Klicks auf Knoepfe/Eingabe/Nachrichten duerfen nie als „Klick ins Leere" zaehlen → Test in Task 1 (`istKlickInsLeere`).

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `renderer/lib/themes.js` (neu) | Theme-Liste, Stufen, Saeuberung/Mischung der `themePrefs`, Klick-Filter |
| `renderer/lib/fx-engine.js` (neu) | Partikel erzeugen/animieren/zaehlen, Intervalle/Schleifen mit Pause, Aufraeumen |
| `renderer/lib/theme-runtime.js` (neu) | Pro Fenster: Farben/CSS/`data-theme` setzen, Welt laden/stoppen, Listener, Ereignisse, Gaeste, Vorschauen |
| `renderer/themes/neon-dual/welt.js` (neu) | nur Ereignis-Funkenregen |
| `renderer/themes/{sakura,wald,koi,blasen}/theme.css` (neu) | Farbvariablen + Namensfarben-Lesbarkeit |
| `renderer/themes/{sakura,wald,koi,blasen}/welt.js` (neu) | die jeweilige Welt |
| `tools/cdp-eval.js` (neu) | Dev-Werkzeug: JS im laufenden App-Fenster auswerten (nicht gepackt) |
| `main.js` | Store-Default, Saeuberung/Mischung ueber `themes.js` |
| `renderer/chat/{index.html,chat.css,chat.js}` | Ebenen, Runtime, ⚙-Popup, Galerie, Ereignisse, `--name` |
| `renderer/video/{index.html,video.js}` | Ebenen, Runtime, Pause, Gastauftritte |

---

### Task 1: Theme-Katalog und Prefs-Mischung

**Files:**
- Create: `renderer/lib/themes.js`
- Create: `test/themes.test.js`
- Modify: `main.js` (Store-Default Zeile ~31, `cleanThemePrefs` ~Z. 291, Handler `save-theme-prefs`/`preview-theme-prefs` ~Z. 336–343)

**Interfaces:**
- Consumes: `ThemeLib` aus `renderer/lib/theme.js` (`DEFAULTS`, `normalizeHex`, `clampAlpha`)
- Produces (Browser: `window.ThemeKatalog`, Node: `require('./renderer/lib/themes')`):
  - `THEMES: Array<{ id, name, hell: boolean, farbenFrei: boolean, info: string, vorschau: string }>`
  - `STANDARD_THEME = 'neon-dual'`, `EFFEKT_STUFEN`, `STANDARD_EFFEKTE = 'normal'`, `EFFEKT_FAKTOR`, `KLICK_SPERRE: string`
  - `themeById(id) → Eintrag` (unbekannt → Neon Dual), `cleanTheme(id) → string`, `cleanEffekte(s) → string`
  - `cleanThemePrefs(prefs) → { videoAccent, chatAccent, chatAlpha, theme, effekte }`
  - `mergeThemePrefs(gespeichert, update) → wie cleanThemePrefs`
  - `istKlickInsLeere(ziel) → boolean` (ziel braucht `closest(selector)`)

- [ ] **Step 1: Failing Tests schreiben** — `test/themes.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const K = require('../renderer/lib/themes');

test('THEMES: Welle 1 komplett, Neon Dual zuerst', () => {
  assert.deepEqual(K.THEMES.map((t) => t.id), ['neon-dual', 'sakura', 'wald', 'koi', 'blasen']);
  for (const t of K.THEMES) {
    assert.equal(typeof t.name, 'string');
    assert.equal(typeof t.hell, 'boolean');
    assert.equal(typeof t.vorschau, 'string');
  }
  assert.equal(K.THEMES.filter((t) => t.farbenFrei).length, 1);
  assert.equal(K.themeById('neon-dual').farbenFrei, true);
});

test('themeById/cleanTheme: Muell faellt auf Neon Dual', () => {
  for (const muell of [undefined, null, '', 'gibtsnicht', 42, {}, 'constructor', '__proto__']) {
    assert.equal(K.cleanTheme(muell), 'neon-dual', String(muell));
  }
  assert.equal(K.cleanTheme('koi'), 'koi');
});

test('cleanEffekte: nur die vier Stufen', () => {
  assert.equal(K.cleanEffekte('aus'), 'aus');
  assert.equal(K.cleanEffekte('viel'), 'viel');
  for (const muell of [undefined, 'AUS', 'max', 0, null]) assert.equal(K.cleanEffekte(muell), 'normal');
});

test('EFFEKT_FAKTOR: aus=0, steigt monoton', () => {
  const f = K.EFFEKT_STUFEN.map((s) => K.EFFEKT_FAKTOR[s]);
  assert.deepEqual(f, [0, 0.4, 1, 1.8]);
});

test('cleanThemePrefs: Bestandsdaten ohne theme -> Neon Dual, Farben bleiben', () => {
  const p = K.cleanThemePrefs({ videoAccent: '#ABC', chatAccent: '#ff4fa3', chatAlpha: 60 });
  assert.deepEqual(p, { videoAccent: '#aabbcc', chatAccent: '#ff4fa3', chatAlpha: 60, theme: 'neon-dual', effekte: 'normal' });
  assert.deepEqual(K.cleanThemePrefs(null), { videoAccent: '#35e0ff', chatAccent: '#ff4fa3', chatAlpha: 100, theme: 'neon-dual', effekte: 'normal' });
});

test('mergeThemePrefs: Teil-Speicherung behaelt theme und effekte', () => {
  const gespeichert = { videoAccent: '#111111', chatAccent: '#222222', chatAlpha: 80, theme: 'sakura', effekte: 'wenig' };
  // Preset-Klick / Farbwaehler schicken nur Farben + Alpha:
  const nachPreset = K.mergeThemePrefs(gespeichert, { videoAccent: '#35e0ff', chatAccent: '#ff4fa3', chatAlpha: 80 });
  assert.equal(nachPreset.theme, 'sakura');
  assert.equal(nachPreset.effekte, 'wenig');
  // Galerie schickt nur das Theme:
  const nachGalerie = K.mergeThemePrefs(gespeichert, { theme: 'koi' });
  assert.equal(nachGalerie.videoAccent, '#111111');
  assert.equal(nachGalerie.chatAlpha, 80);
  assert.equal(nachGalerie.effekte, 'wenig');
  // Kaputter Speicher + Update:
  assert.equal(K.mergeThemePrefs(undefined, { effekte: 'aus' }).effekte, 'aus');
});

test('istKlickInsLeere: App-Elemente nie, Hintergrund ja', () => {
  const ziel = (treffer) => ({ closest: (sel) => { assert.equal(sel, K.KLICK_SPERRE); return treffer; } });
  assert.equal(K.istKlickInsLeere(ziel(null)), true);
  assert.equal(K.istKlickInsLeere(ziel({ tagName: 'BUTTON' })), false);
  assert.equal(K.istKlickInsLeere(null), false);
  assert.equal(K.istKlickInsLeere({}), false);
  for (const sel of ['button', 'a', 'input', 'textarea', '[contenteditable]', '.msg', '#composer', '#settings-pop', '#theme-galerie', 'iframe']) {
    assert.ok(K.KLICK_SPERRE.split(',').map((s) => s.trim()).includes(sel), sel);
  }
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag pruefen**

Run: `node --test test/themes.test.js`
Expected: FAIL mit `Cannot find module '../renderer/lib/themes'`

- [ ] **Step 3: `renderer/lib/themes.js` schreiben**

```js
// Theme-Katalog fuer "Lebendige Themes" (Spec 2026-10-07). DOM-frei, UMD wie
// theme.js: im Browser -> window.ThemeKatalog (theme.js MUSS vorher geladen
// sein), unter Node -> require -> testbar.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./theme'));
  } else {
    root.ThemeKatalog = factory(root.ThemeLib);
  }
})(typeof self !== 'undefined' ? self : this, function (ThemeLib) {
  // vorschau: Hintergrund der Galerie-Karte (die Partikel kommen aus der Welt).
  const THEMES = [
    { id: 'neon-dual', name: 'Neon Dual', hell: false, farbenFrei: true, info: 'Farben frei wählbar',
      vorschau: 'linear-gradient(90deg, #35e0ff, #ff4fa3)' },
    { id: 'sakura', name: 'Sakura', hell: true, farbenFrei: false, info: 'Kirschblüten',
      vorschau: 'linear-gradient(160deg, #fff0f5, #ffe4ec 50%, #f3e8ff)' },
    { id: 'wald', name: 'Wald', hell: false, farbenFrei: false, info: 'Glühwürmchen',
      vorschau: 'linear-gradient(180deg, #16301e, #0a150d)' },
    { id: 'koi', name: 'Koi-Teich', hell: false, farbenFrei: false, info: 'Koi-Fische',
      vorschau: 'radial-gradient(ellipse at 40% 60%, #1b6b5f, #0d3b3a 55%, #062221)' },
    { id: 'blasen', name: 'Seifenblasen', hell: true, farbenFrei: false, info: 'Seifenblasen',
      vorschau: 'linear-gradient(180deg, #dff3ff, #f4eaff)' }
  ];
  const STANDARD_THEME = 'neon-dual';
  const EFFEKT_STUFEN = ['aus', 'wenig', 'normal', 'viel'];
  const STANDARD_EFFEKTE = 'normal';
  const EFFEKT_FAKTOR = { aus: 0, wenig: 0.4, normal: 1, viel: 1.8 };
  // Klick-Ziele, die der App gehoeren. Nur Klicks AUSSERHALB davon sieht die
  // Welt als "Klick ins Leere" (die App bekommt jeden Klick trotzdem).
  const KLICK_SPERRE = 'button, a, input, textarea, select, label, [contenteditable], .msg, #composer, #settings-pop, #theme-galerie, iframe';

  function themeById(id) {
    return THEMES.find((t) => t.id === id) || THEMES[0];
  }
  function cleanTheme(id) { return themeById(id).id; }
  function cleanEffekte(stufe) {
    return EFFEKT_STUFEN.includes(stufe) ? stufe : STANDARD_EFFEKTE;
  }

  // Ersetzt das alte cleanThemePrefs aus main.js. Store-Inhalte koennen Muell
  // sein (Handedit, alte Version) - App startet nie ohne gueltige Werte.
  function cleanThemePrefs(prefs) {
    const p = prefs && typeof prefs === 'object' ? prefs : {};
    const d = ThemeLib.DEFAULTS;
    return {
      videoAccent: ThemeLib.normalizeHex(p.videoAccent, d.videoAccent),
      chatAccent: ThemeLib.normalizeHex(p.chatAccent, d.chatAccent),
      chatAlpha: ThemeLib.clampAlpha(p.chatAlpha),
      theme: cleanTheme(p.theme),
      effekte: cleanEffekte(p.effekte)
    };
  }

  // Teil-Speicherungen (Preset-Klick schickt nur Farben, Galerie nur das
  // Theme) duerfen die uebrigen Felder nicht auf Standard zuruecksetzen.
  function mergeThemePrefs(gespeichert, update) {
    const g = gespeichert && typeof gespeichert === 'object' ? gespeichert : {};
    const u = update && typeof update === 'object' ? update : {};
    return cleanThemePrefs({ ...g, ...u });
  }

  function istKlickInsLeere(ziel) {
    if (!ziel || typeof ziel.closest !== 'function') return false;
    return ziel.closest(KLICK_SPERRE) === null;
  }

  return {
    THEMES, STANDARD_THEME, EFFEKT_STUFEN, STANDARD_EFFEKTE, EFFEKT_FAKTOR, KLICK_SPERRE,
    themeById, cleanTheme, cleanEffekte, cleanThemePrefs, mergeThemePrefs, istKlickInsLeere
  };
});
```

- [ ] **Step 4: Tests laufen lassen**

Run: `node --test test/themes.test.js`
Expected: PASS (7 Tests)

- [ ] **Step 5: main.js auf den Katalog umstellen**

Oben bei den anderen `require`s (nach `const ThemeLib = require('./renderer/lib/theme');`):

```js
const ThemeKatalog = require('./renderer/lib/themes');
```

Store-Default (~Z. 31) ersetzen durch:

```js
    themePrefs: { videoAccent: '#35e0ff', chatAccent: '#ff4fa3', chatAlpha: 100, theme: 'neon-dual', effekte: 'normal' },
```

Die Funktion `cleanThemePrefs` (~Z. 291–298) komplett ersetzen durch:

```js
// Saeuberung lebt in renderer/lib/themes.js (getestet, auch fuer theme/effekte).
function cleanThemePrefs(prefs) {
  return ThemeKatalog.cleanThemePrefs(prefs);
}
```

Die beiden Handler `save-theme-prefs` und `preview-theme-prefs` (~Z. 336–343) ersetzen durch:

```js
// Teil-Updates (nur Farben, nur Theme, nur Stufe) mit dem Gespeicherten
// mischen - sonst setzt z.B. ein Preset-Klick Theme und Effekte zurueck.
ipcMain.on('save-theme-prefs', (_evt, prefs) => {
  const clean = ThemeKatalog.mergeThemePrefs(store.get('themePrefs'), prefs);
  store.set('themePrefs', clean);
  broadcast('theme-changed', clean);
});
ipcMain.on('preview-theme-prefs', (_evt, prefs) => {
  broadcast('theme-changed', ThemeKatalog.mergeThemePrefs(store.get('themePrefs'), prefs));
});
```

(Vorher die echten Zeilen lesen: `sed -n 330,345p main.js`. Falls der Handler weitere Zeilen hat, diese erhalten.)

- [ ] **Step 6: Gesamte Suite + Syntax**

Run: `node --check main.js && npm test`
Expected: alle Tests PASS (vorher 290, jetzt 297)

- [ ] **Step 7: Commit**

```bash
git add renderer/lib/themes.js test/themes.test.js main.js
git commit -m "feat: Theme-Katalog und Mischung von Teil-Speicherungen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Partikel-Engine

**Files:**
- Create: `renderer/lib/fx-engine.js`
- Create: `test/fx-engine.test.js`

**Interfaces:**
- Consumes: nichts
- Produces (Browser: `window.FxEngine`):
  - `createEngine({ ebenen: { hinten?, vorn?, gast? }, doc, max = 40, faktor = 1, sichtbar?, setInterval?, clearInterval?, raf?, caf? }) → engine`
  - `engine.spawn({ ebene = 'hinten', inhalt?, stil?, keyframes, dauerMs, easing? }) → Element | null` (entfernt sich nach Ablauf selbst)
  - `engine.element({ ebene = 'hinten', inhalt?, stil? }) → Element | null` (dauerhaft, z. B. Fisch)
  - `engine.entferne(el)`, `engine.intervall(fn, ms) → id`, `engine.schleife(fn(dtMs))`
  - `engine.setFaktor(f)`, `engine.faktor`, `engine.pausieren(bool)`, `engine.weiter()`, `engine.laeuft() → boolean`
  - `engine.anzahl() → number`, `engine.groesse(ebene) → {w,h}`, `engine.rechteck(ebene) → DOMRect-artig`, `engine.stop()`
  - Helfer: `FxEngine.tr(x, y, extra?) → 'translate(xpx,ypx)extra'`, `FxEngine.rnd(a, b)`

- [ ] **Step 1: Failing Tests schreiben** — `test/fx-engine.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { createEngine, tr } = require('../renderer/lib/fx-engine');

// --- Attrappen: genug DOM fuer die Engine, ohne Browser ----------------------
function fakeEl() {
  const el = {
    style: {}, className: '', textContent: '', parent: null,
    remove() { if (el.parent) el.parent.kinder.delete(el); el.parent = null; },
    animate(keyframes, opts) {
      const a = { keyframes, opts, onfinish: null, abgebrochen: false, cancel() { a.abgebrochen = true; } };
      el.anim = a;
      return a;
    }
  };
  return el;
}
function fakeEbene() {
  const e = {
    kinder: new Set(), clientWidth: 300, clientHeight: 200,
    appendChild(el) { el.parent = e; e.kinder.add(el); },
    getBoundingClientRect() { return { left: 10, top: 20, width: 300, height: 200 }; }
  };
  return e;
}
function aufbau(extra = {}) {
  const doc = { visibilityState: 'visible', createElement: () => fakeEl() };
  const hinten = fakeEbene(), vorn = fakeEbene();
  const intervalle = new Map(); let iid = 0;
  const frames = new Map(); let fid = 0;
  const engine = createEngine({
    ebenen: { hinten, vorn }, doc, max: 5,
    setInterval: (fn, ms) => { intervalle.set(++iid, fn); return iid; },
    clearInterval: (id) => intervalle.delete(id),
    raf: (fn) => { frames.set(++fid, fn); return fid; },
    caf: (id) => frames.delete(id),
    ...extra
  });
  const tickIntervalle = () => [...intervalle.values()].forEach((f) => f());
  const tickFrame = (t) => { const alle = [...frames.entries()]; frames.clear(); alle.forEach(([, f]) => f(t)); };
  return { engine, doc, hinten, vorn, intervalle, frames, tickIntervalle, tickFrame };
}
const kf = [{ transform: tr(0, 0) }, { transform: tr(10, 10) }];

test('spawn haengt an, setzt Grundstil und raeumt nach Ablauf auf', () => {
  const { engine, hinten } = aufbau();
  const el = engine.spawn({ inhalt: '🌸', keyframes: kf, dauerMs: 500 });
  assert.ok(el);
  assert.equal(hinten.kinder.size, 1);
  assert.equal(el.style.position, 'absolute');
  assert.equal(el.style.pointerEvents, 'none');
  assert.equal(el.textContent, '🌸');
  assert.equal(engine.anzahl(), 1);
  el.anim.onfinish();
  assert.equal(hinten.kinder.size, 0);
  assert.equal(engine.anzahl(), 0);
});

test('spawn waehlt die Ebene, fehlende Ebene -> null', () => {
  const { engine, vorn } = aufbau();
  assert.ok(engine.spawn({ ebene: 'vorn', keyframes: kf, dauerMs: 100 }));
  assert.equal(vorn.kinder.size, 1);
  assert.equal(engine.spawn({ ebene: 'gast', keyframes: kf, dauerMs: 100 }), null);
});

test('Obergrenze skaliert mit dem Faktor, Faktor 0 erzeugt nichts', () => {
  const { engine } = aufbau();
  for (let i = 0; i < 5; i++) assert.ok(engine.spawn({ keyframes: kf, dauerMs: 100 }));
  assert.equal(engine.spawn({ keyframes: kf, dauerMs: 100 }), null);
  const b = aufbau({ faktor: 0.4 });           // round(5 * 0.4) = 2
  assert.ok(b.engine.spawn({ keyframes: kf, dauerMs: 100 }));
  assert.ok(b.engine.spawn({ keyframes: kf, dauerMs: 100 }));
  assert.equal(b.engine.spawn({ keyframes: kf, dauerMs: 100 }), null);
  const c = aufbau({ faktor: 0 });
  assert.equal(c.engine.spawn({ keyframes: kf, dauerMs: 100 }), null);
  assert.equal(c.engine.element({}), null);
});

test('element ist dauerhaft und zaehlt zur Obergrenze', () => {
  const { engine, hinten } = aufbau();
  const fisch = engine.element({ stil: { width: '10px' } });
  assert.equal(fisch.style.width, '10px');
  assert.equal(engine.anzahl(), 1);
  engine.entferne(fisch);
  assert.equal(hinten.kinder.size, 0);
  assert.equal(engine.anzahl(), 0);
});

test('entferne bricht die Animation eines Partikels ab', () => {
  const { engine } = aufbau();
  const el = engine.spawn({ keyframes: kf, dauerMs: 100 });
  engine.entferne(el);
  assert.equal(el.anim.abgebrochen, true);
  assert.equal(engine.anzahl(), 0);
});

test('intervall laeuft nur sichtbar und unpausiert', () => {
  const { engine, doc, tickIntervalle } = aufbau();
  let n = 0;
  engine.intervall(() => n++, 100);
  tickIntervalle(); assert.equal(n, 1);
  doc.visibilityState = 'hidden'; tickIntervalle(); assert.equal(n, 1);
  doc.visibilityState = 'visible'; engine.pausieren(true); tickIntervalle(); assert.equal(n, 1);
  engine.pausieren(false); tickIntervalle(); assert.equal(n, 2);
});

test('schleife: laeuft, haelt bei Pause an (kein neuer Frame), weiter() startet neu', () => {
  const { engine, frames, tickFrame } = aufbau();
  const dts = [];
  engine.schleife((dt) => dts.push(dt));
  tickFrame(1000); tickFrame(1016);
  assert.deepEqual(dts, [16, 16]);
  engine.pausieren(true);
  tickFrame(1032);
  assert.equal(frames.size, 0, 'pausiert: kein Frame mehr angefordert');
  engine.pausieren(false);
  engine.weiter();
  assert.equal(frames.size, 1);
  tickFrame(5000);
  assert.equal(dts.length, 3);
  assert.equal(dts[2], 16, 'nach Pause kein Riesen-dt');
});

test('stop raeumt alles und blockiert weitere Partikel', () => {
  const { engine, hinten, intervalle, frames } = aufbau();
  const p = engine.spawn({ keyframes: kf, dauerMs: 100 });
  engine.element({});
  engine.intervall(() => {}, 100);
  engine.schleife(() => {});
  engine.stop();
  assert.equal(hinten.kinder.size, 0);
  assert.equal(p.anim.abgebrochen, true);
  assert.equal(intervalle.size, 0);
  assert.equal(frames.size, 0);
  assert.equal(engine.anzahl(), 0);
  assert.equal(engine.spawn({ keyframes: kf, dauerMs: 100 }), null);
  assert.equal(engine.laeuft(), false);
});

test('groesse und rechteck lesen die Ebene', () => {
  const { engine } = aufbau();
  assert.deepEqual(engine.groesse('hinten'), { w: 300, h: 200 });
  assert.deepEqual(engine.groesse('gast'), { w: 0, h: 0 });
  assert.equal(engine.rechteck('hinten').left, 10);
});
```

- [ ] **Step 2: Fehlschlag pruefen**

Run: `node --test test/fx-engine.test.js`
Expected: FAIL mit `Cannot find module`

- [ ] **Step 3: `renderer/lib/fx-engine.js` schreiben**

```js
// Partikel-Engine fuer die Theme-Welten (Spec 2026-10-07, Abschnitt 6).
// Animation NUR ueber transform/opacity per Web Animations API (Compositor,
// kein Layout). Alle Abhaengigkeiten (DOM, Zeitgeber, Sichtbarkeit) sind
// injizierbar -> unter Node mit Attrappen testbar. UMD wie die anderen Libs.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FxEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function tr(x, y, extra) {
    return 'translate(' + x + 'px,' + y + 'px)' + (extra || '');
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function createEngine(opts) {
    const o = opts || {};
    const ebenen = o.ebenen || {};
    const doc = o.doc || (typeof document !== 'undefined' ? document : null);
    const max = o.max || 40;
    const sichtbar = o.sichtbar || (() => !doc || doc.visibilityState !== 'hidden');
    const setI = o.setInterval || ((fn, ms) => setInterval(fn, ms));
    const clearI = o.clearInterval || ((id) => clearInterval(id));
    const raf = o.raf || ((fn) => requestAnimationFrame(fn));
    const caf = o.caf || ((id) => cancelAnimationFrame(id));

    let faktor = typeof o.faktor === 'number' ? o.faktor : 1;
    let pausiert = false;
    let gestoppt = false;
    const partikel = new Map();   // el -> Animation
    const elemente = new Set();   // dauerhafte Elemente
    const intervalle = new Set();
    const schleifen = new Set();  // { id, letzte, tick }

    function grenze() { return Math.round(max * faktor); }
    function laeuft() { return !gestoppt && !pausiert && faktor > 0 && sichtbar(); }
    function platzFrei() {
      return !gestoppt && faktor > 0 && partikel.size + elemente.size < grenze();
    }

    function neuesElement(ebeneName, inhalt, stil) {
      const ebene = ebenen[ebeneName || 'hinten'];
      if (!ebene || !doc) return null;
      const el = doc.createElement('div');
      el.style.position = 'absolute';
      el.style.left = '0';
      el.style.top = '0';
      el.style.pointerEvents = 'none';
      el.style.willChange = 'transform, opacity';
      if (stil) for (const k in stil) el.style[k] = stil[k];
      if (inhalt) el.textContent = inhalt;
      ebene.appendChild(el);
      return el;
    }

    function starteSchleife(s) {
      if (s.id === null && laeuft()) { s.letzte = null; s.id = raf(s.tick); }
    }

    return {
      spawn(p) {
        if (!platzFrei()) return null;
        const el = neuesElement(p.ebene, p.inhalt, p.stil);
        if (!el) return null;
        if (p.keyframes && p.keyframes[0] && p.keyframes[0].transform) {
          el.style.transform = p.keyframes[0].transform;
        }
        const anim = el.animate(p.keyframes, {
          duration: p.dauerMs, easing: p.easing || 'linear', fill: 'forwards'
        });
        partikel.set(el, anim);
        anim.onfinish = () => { partikel.delete(el); el.remove(); };
        return el;
      },
      element(p) {
        if (!platzFrei()) return null;
        const el = neuesElement(p && p.ebene, p && p.inhalt, p && p.stil);
        if (el) elemente.add(el);
        return el;
      },
      entferne(el) {
        if (!el) return;
        const anim = partikel.get(el);
        if (anim) { try { anim.cancel(); } catch (e) { /* schon fertig */ } partikel.delete(el); }
        elemente.delete(el);
        el.remove();
      },
      intervall(fn, ms) {
        const id = setI(() => { if (laeuft()) fn(); }, ms);
        intervalle.add(id);
        return id;
      },
      // fn(dtMs) pro Frame, nur solange laeuft(). Pausiert/unsichtbar wird KEIN
      // neuer Frame angefordert (null Last); weiter() nimmt sie wieder auf.
      schleife(fn) {
        const s = { id: null, letzte: null, tick: null };
        s.tick = (t) => {
          s.id = null;
          if (!laeuft()) return;
          const dt = s.letzte === null ? 16 : Math.min(100, t - s.letzte);
          s.letzte = t;
          fn(dt);
          if (laeuft()) s.id = raf(s.tick);
        };
        schleifen.add(s);
        starteSchleife(s);
        return s;
      },
      setFaktor(f) { faktor = Math.max(0, Number(f) || 0); },
      get faktor() { return faktor; },
      pausieren(an) { pausiert = !!an; },
      get pausiert() { return pausiert; },
      weiter() { for (const s of schleifen) starteSchleife(s); },
      laeuft,
      anzahl() { return partikel.size + elemente.size; },
      groesse(name) {
        const e = ebenen[name || 'hinten'];
        return e ? { w: e.clientWidth, h: e.clientHeight } : { w: 0, h: 0 };
      },
      rechteck(name) {
        const e = ebenen[name || 'hinten'];
        return e ? e.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
      },
      stop() {
        gestoppt = true;
        for (const id of intervalle) clearI(id);
        intervalle.clear();
        for (const s of schleifen) { if (s.id !== null) caf(s.id); s.id = null; }
        schleifen.clear();
        for (const [el, anim] of partikel) { try { anim.cancel(); } catch (e) { /* egal */ } el.remove(); }
        partikel.clear();
        for (const el of elemente) el.remove();
        elemente.clear();
      }
    };
  }

  return { createEngine, tr, rnd };
});
```

- [ ] **Step 4: Tests laufen lassen**

Run: `node --test test/fx-engine.test.js`
Expected: PASS (9 Tests)

- [ ] **Step 5: Commit**

```bash
git add renderer/lib/fx-engine.js test/fx-engine.test.js
git commit -m "feat: Partikel-Engine fuer Theme-Welten

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Theme-Runtime (Kleber pro Fenster)

**Files:**
- Create: `renderer/lib/theme-runtime.js`
- Create: `test/theme-runtime.test.js`

**Interfaces:**
- Consumes: `ThemeKatalog` (Task 1), `FxEngine` (Task 2), `ThemeLib` (`accentVars`, `normalizeHex`, `clampAlpha`, `DEFAULTS`)
- Produces (Browser: `window.ThemeRuntime`):
  - `createRuntime({ fenster: 'chat'|'video', doc, win, ebenen: { hinten, vorn?, gast? }, basis = '../themes/', melde(bereich, ereignis, detail)?, ladeSkript(url)?: Promise, erzeugeEngine(opts)? }) → runtime`
  - `runtime.anwenden(prefs) → Promise<void>` — Farben, `<html data-theme>`, Theme-CSS, Welt
  - `runtime.ereignis(art: 'kiste'|'punkte', { betrag, ursprung: {x, y} })` — ursprung in Viewport-Koordinaten
  - `runtime.pausieren(bool)`, `runtime.setzeGastBedingung(fn → boolean)`, `runtime.gastJetzt()`
  - `runtime.starteVorschau(container, id) → Promise<stoppFn>`, `runtime.stop()`, `runtime.weltAktiv → boolean`
- Welt-Vertrag (fuer Tasks 7–11): `window.TwitchDualWelten[id] = function ({ engine, fenster, FxEngine }) → { start(), stop(), maus?(x,y), klickInsLeere?(x,y), ereignis?(art, daten), gast?() }`. `maus`/`klickInsLeere` bekommen Koordinaten relativ zur Ebene `hinten`; `ereignis().ursprung` ist Viewport = Ebene `vorn` (die ist `position: fixed; inset: 0`).

- [ ] **Step 1: Failing Tests schreiben** — `test/theme-runtime.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { createRuntime } = require('../renderer/lib/theme-runtime');

function aufbau({ fenster = 'chat', welten = {}, ladeFehler = false } = {}) {
  const styleProps = new Map();
  const listener = new Map();          // typ -> Set(fn)
  const kopf = [];
  const elemente = new Map();          // id -> el
  const doc = {
    documentElement: {
      dataset: {},
      style: { setProperty: (k, v) => styleProps.set(k, v), removeProperty: (k) => styleProps.delete(k) }
    },
    head: { appendChild: (el) => { kopf.push(el); if (el.id) elemente.set(el.id, el); } },
    getElementById: (id) => elemente.get(id) || null,
    createElement: () => {
      const attr = {};
      const el = {
        id: '', rel: '', onerror: null,
        setAttribute: (k, v) => { attr[k] = v; }, getAttribute: (k) => attr[k],
        remove: () => { elemente.delete(el.id); }
      };
      return el;
    },
    addEventListener: (t, fn) => { if (!listener.has(t)) listener.set(t, new Set()); listener.get(t).add(fn); },
    removeEventListener: (t, fn) => { if (listener.has(t)) listener.get(t).delete(fn); }
  };
  const timer = new Map(); let tid = 0;
  const win = {
    TwitchDualWelten: {},
    requestAnimationFrame: (fn) => { fn(0); return 1; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms) => { timer.set(++tid, { fn, ms }); return tid; },
    clearTimeout: (id) => timer.delete(id)
  };
  const geladen = [];
  const ladeSkript = (url) => {
    geladen.push(url);
    if (ladeFehler) return Promise.reject(new Error('404'));
    const id = url.split('/').slice(-2)[0];
    if (welten[id]) win.TwitchDualWelten[id] = welten[id];
    return Promise.resolve();
  };
  const engines = [];
  const erzeugeEngine = (opts) => {
    const e = { opts, gestoppt: false, faktor: opts.faktor, pausiert: false, weiterAufrufe: 0,
      stop() { e.gestoppt = true; }, setFaktor(f) { e.faktor = f; }, pausieren(p) { e.pausiert = p; }, weiter() { e.weiterAufrufe++; } };
    engines.push(e);
    return e;
  };
  const meldungen = [];
  const ebenen = { hinten: { getBoundingClientRect: () => ({ left: 0, top: 0 }) }, vorn: {}, gast: {} };
  const rt = createRuntime({ fenster, doc, win, ebenen, ladeSkript, erzeugeEngine,
    melde: (b, e, d) => meldungen.push({ b, e, d }) });
  const anzahlListener = () => [...listener.values()].reduce((n, s) => n + s.size, 0);
  return { rt, doc, win, styleProps, listener, anzahlListener, geladen, engines, meldungen, timer, elemente };
}

// Eine Welt-Attrappe, die ihre Aufrufe protokolliert.
function protokollWelt(log, extra = {}) {
  return () => ({
    start: () => log.push('start'), stop: () => log.push('stop'),
    ereignis: (art) => log.push('ereignis:' + art), gast: () => log.push('gast'),
    ...extra
  });
}

test('Stufe aus: Farben + CSS ja, aber keine Welt, kein Listener, kein Timer', async () => {
  const log = [];
  const a = aufbau({ welten: { sakura: protokollWelt(log) } });
  await a.rt.anwenden({ theme: 'sakura', effekte: 'aus' });
  assert.equal(a.doc.documentElement.dataset.theme, 'sakura');
  assert.equal(a.elemente.get('theme-css').getAttribute('href'), '../themes/sakura/theme.css');
  assert.deepEqual(a.geladen, []);
  assert.deepEqual(log, []);
  assert.equal(a.anzahlListener(), 0);
  assert.equal(a.timer.size, 0);
  assert.equal(a.rt.weltAktiv, false);
});

test('Wechsel normal -> aus beendet Welt, Engine und Listener restlos', async () => {
  const log = [];
  const a = aufbau({ fenster: 'video', welten: { sakura: protokollWelt(log) } });
  a.rt.setzeGastBedingung(() => true);
  await a.rt.anwenden({ theme: 'sakura', effekte: 'normal' });
  assert.deepEqual(log, ['start']);
  assert.ok(a.anzahlListener() > 0);
  assert.equal(a.timer.size, 1, 'Gast-Timer laeuft');
  await a.rt.anwenden({ theme: 'sakura', effekte: 'aus' });
  assert.deepEqual(log, ['start', 'stop']);
  assert.equal(a.engines[0].gestoppt, true);
  assert.equal(a.anzahlListener(), 0);
  assert.equal(a.timer.size, 0);
  a.rt.gastJetzt();
  a.rt.ereignis('kiste', {});
  assert.deepEqual(log, ['start', 'stop']);
});

test('Neon Dual setzt Akzent-Variablen, andere Themes entfernen sie wieder', async () => {
  const a = aufbau({ welten: { 'neon-dual': protokollWelt([]), sakura: protokollWelt([]) } });
  await a.rt.anwenden({ theme: 'neon-dual', chatAccent: '#ff4fa3', chatAlpha: 50 });
  assert.equal(a.styleProps.get('--accent'), '#ff4fa3');
  assert.equal(a.styleProps.get('--chat-alpha'), '0.5');
  assert.equal(a.elemente.get('theme-css'), undefined);
  await a.rt.anwenden({ theme: 'sakura', chatAlpha: 50 });
  assert.equal(a.styleProps.has('--accent'), false);
  assert.equal(a.styleProps.has('--onair-from'), false);
  assert.equal(a.styleProps.get('--chat-alpha'), '0.5');
  await a.rt.anwenden({ theme: 'neon-dual' });
  assert.equal(a.elemente.get('theme-css'), undefined, 'Theme-CSS wieder entfernt');
});

test('Video-Fenster: --chat-alpha immer 1, Neon nutzt videoAccent', async () => {
  const a = aufbau({ fenster: 'video', welten: { 'neon-dual': protokollWelt([]) } });
  await a.rt.anwenden({ theme: 'neon-dual', videoAccent: '#112233', chatAlpha: 30 });
  assert.equal(a.styleProps.get('--chat-alpha'), '1');
  assert.equal(a.styleProps.get('--accent'), '#112233');
});

test('Gleiches Theme, andere Stufe: nur Faktor, kein Neuladen', async () => {
  const log = [];
  const a = aufbau({ welten: { koi: protokollWelt(log) } });
  await a.rt.anwenden({ theme: 'koi', effekte: 'normal' });
  await a.rt.anwenden({ theme: 'koi', effekte: 'viel' });
  assert.deepEqual(log, ['start']);
  assert.equal(a.engines.length, 1);
  assert.equal(a.engines[0].faktor, 1.8);
});

test('Ueberholter Ladevorgang: nur das zuletzt gewaehlte Theme startet', async () => {
  const log = [];
  const a = aufbau({ welten: { sakura: protokollWelt(log, { start: () => log.push('sakura') }), wald: protokollWelt(log, { start: () => log.push('wald') }) } });
  const p1 = a.rt.anwenden({ theme: 'sakura' });
  const p2 = a.rt.anwenden({ theme: 'wald' });
  await Promise.all([p1, p2]);
  assert.deepEqual(log, ['wald']);
  assert.equal(a.engines.length, 1);
});

test('Welt wirft beim Start: Diagnose, keine Listener, App laeuft weiter', async () => {
  const a = aufbau({ welten: { blasen: () => ({ start() { throw new Error('kaputt'); }, stop() {} }) } });
  await a.rt.anwenden({ theme: 'blasen' });
  assert.equal(a.rt.weltAktiv, false);
  assert.equal(a.anzahlListener(), 0);
  assert.deepEqual(a.meldungen[0], { b: 'theme', e: 'welt-fehler', d: { theme: 'blasen', phase: 'start', fehler: 'kaputt' } });
  assert.equal(a.doc.documentElement.dataset.theme, 'blasen', 'Farben bleiben');
});

test('Welt-Skript laedt nicht: Diagnose phase laden', async () => {
  const a = aufbau({ ladeFehler: true });
  await a.rt.anwenden({ theme: 'wald' });
  assert.equal(a.meldungen[0].e, 'welt-fehler');
  assert.equal(a.meldungen[0].d.phase, 'laden');
  assert.equal(a.rt.weltAktiv, false);
});

test('Ereignis: fehlender Anschluss ist ok, werfender stoppt die Welt', async () => {
  const log = [];
  const a = aufbau({ welten: { sakura: () => ({ start() {}, stop() { log.push('stop'); } }), wald: () => ({ start() {}, stop() {}, ereignis() { throw new Error('bumm'); } }) } });
  await a.rt.anwenden({ theme: 'sakura' });
  a.rt.ereignis('kiste', { betrag: 50, ursprung: { x: 1, y: 2 } });
  assert.equal(a.rt.weltAktiv, true);
  await a.rt.anwenden({ theme: 'wald' });
  a.rt.ereignis('kiste', {});
  assert.equal(a.rt.weltAktiv, false);
  assert.equal(a.meldungen.at(-1).d.phase, 'ereignis');
});

test('Gast: nur im Video-Fenster, nur wenn die Bedingung stimmt', async () => {
  const log = [];
  const a = aufbau({ fenster: 'video', welten: { koi: protokollWelt(log) } });
  let darf = false;
  a.rt.setzeGastBedingung(() => darf);
  await a.rt.anwenden({ theme: 'koi' });
  a.rt.gastJetzt();
  assert.deepEqual(log, ['start']);
  darf = true;
  a.rt.gastJetzt();
  assert.deepEqual(log, ['start', 'gast']);
  const c = aufbau({ fenster: 'chat', welten: { koi: protokollWelt([]) } });
  c.rt.setzeGastBedingung(() => true);
  await c.rt.anwenden({ theme: 'koi' });
  assert.equal(c.timer.size, 0, 'Chat plant keine Gaeste');
});

test('Klick: nur ins Leere, Koordinaten relativ zur hinteren Ebene', async () => {
  const klicks = [];
  const a = aufbau({ welten: { blasen: () => ({ start() {}, stop() {}, klickInsLeere: (x, y) => klicks.push([x, y]) }) } });
  await a.rt.anwenden({ theme: 'blasen' });
  const klick = [...a.listener.get('click')][0];
  klick({ target: { closest: () => ({}) }, clientX: 5, clientY: 5 });       // Knopf
  klick({ target: { closest: () => null }, clientX: 40, clientY: 60 });     // Hintergrund
  assert.deepEqual(klicks, [[40, 60]]);
});

test('pausieren reicht an die Engine weiter, Aufheben weckt Schleifen', async () => {
  const a = aufbau({ welten: { wald: protokollWelt([]) } });
  await a.rt.anwenden({ theme: 'wald' });
  a.rt.pausieren(true);
  assert.equal(a.engines[0].pausiert, true);
  a.rt.pausieren(false);
  assert.equal(a.engines[0].pausiert, false);
  assert.equal(a.engines[0].weiterAufrufe, 1);
});
```

- [ ] **Step 2: Fehlschlag pruefen**

Run: `node --test test/theme-runtime.test.js`
Expected: FAIL mit `Cannot find module`

- [ ] **Step 3: `renderer/lib/theme-runtime.js` schreiben**

```js
// Theme-Runtime: der Kleber in jedem Fenster (Spec 2026-10-07, Abschnitt 2).
// Setzt Farben + <html data-theme>, tauscht die Theme-CSS, laedt/startet/
// stoppt die Welt, verteilt Maus/Klick/Ereignisse/Gaeste. DOM + Zeitgeber
// kommen von aussen -> unter Node mit Attrappen testbar.
//
// Stufe 'aus' (Spec 8): KEINE Welt, KEIN Listener, KEIN Timer.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./themes'), require('./fx-engine'), require('./theme'));
  } else {
    root.ThemeRuntime = factory(root.ThemeKatalog, root.FxEngine, root.ThemeLib);
  }
})(typeof self !== 'undefined' ? self : this, function (Katalog, FxEngine, ThemeLib) {
  // Alle Inline-Variablen, die Neon Dual setzt - bei anderen Themes muessen
  // sie weg, sonst schlagen sie die Werte aus der Theme-CSS.
  const NEON_VARS = Object.keys(ThemeLib.accentVars(ThemeLib.DEFAULTS.videoAccent, 100))
    .concat(['--onair-from', '--onair-to']);
  const GAST_MIN_MS = 120000;
  const GAST_SPANNE_MS = 120000;

  function createRuntime(o) {
    const fenster = o.fenster;
    const doc = o.doc;
    const win = o.win;
    const ebenen = o.ebenen || {};
    const basis = o.basis || '../themes/';
    const melde = o.melde || (() => {});
    const ladeSkript = o.ladeSkript || ((url) => new Promise((resolve, reject) => {
      const s = doc.createElement('script');
      s.src = url;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Skript laedt nicht: ' + url));
      doc.head.appendChild(s);
    }));
    const erzeugeEngine = o.erzeugeEngine || ((opts) => FxEngine.createEngine(opts));

    const geladen = new Set();
    let letztePrefs = null;
    let welt = null;
    let engine = null;
    let weltId = null;
    let lauf = 0;                 // Generation gegen ueberholte Ladevorgaenge
    let pausiert = false;
    let gastBedingung = null;
    let gastTimer = null;
    let mausFrame = null;
    let mausPos = null;

    // --- Farben + CSS ------------------------------------------------------
    function setzeFarben(prefs) {
      const r = doc.documentElement;
      if (prefs.theme === 'neon-dual') {
        const vars = fenster === 'chat'
          ? ThemeLib.accentVars(prefs.chatAccent, prefs.chatAlpha)
          : ThemeLib.accentVars(prefs.videoAccent); // Video-Fenster ist opak
        for (const k in vars) r.style.setProperty(k, vars[k]);
        r.style.setProperty('--onair-from', ThemeLib.normalizeHex(prefs.videoAccent, ThemeLib.DEFAULTS.videoAccent));
        r.style.setProperty('--onair-to', ThemeLib.normalizeHex(prefs.chatAccent, ThemeLib.DEFAULTS.chatAccent));
      } else {
        for (const k of NEON_VARS) r.style.removeProperty(k);
      }
      const alpha = fenster === 'chat' ? ThemeLib.clampAlpha(prefs.chatAlpha) / 100 : 1;
      r.style.setProperty('--chat-alpha', String(alpha));
      r.dataset.theme = prefs.theme;
    }

    function setzeCss(id) {
      let link = doc.getElementById('theme-css');
      if (id === 'neon-dual') { if (link) link.remove(); return; }
      const href = basis + id + '/theme.css';
      if (link && link.getAttribute('href') === href) return;
      if (!link) {
        link = doc.createElement('link');
        link.id = 'theme-css';
        link.rel = 'stylesheet';
        doc.head.appendChild(link);
      }
      link.onerror = () => {
        melde('theme', 'css-fehler', { theme: id });
        // Rueckfall: Neon-Dual-Optik, ohne den Store anzufassen.
        if (letztePrefs && letztePrefs.theme === id) anwenden({ ...letztePrefs, theme: 'neon-dual' });
      };
      link.setAttribute('href', href);
    }

    // --- Listener (nur solange eine Welt laeuft) ---------------------------
    function relativ(x, y) {
      const r = ebenen.hinten && ebenen.hinten.getBoundingClientRect
        ? ebenen.hinten.getBoundingClientRect() : { left: 0, top: 0 };
      return { x: x - r.left, y: y - r.top };
    }
    function onMaus(e) {
      mausPos = { x: e.clientX, y: e.clientY };
      if (mausFrame !== null) return;
      mausFrame = win.requestAnimationFrame(() => {
        mausFrame = null;
        const p = relativ(mausPos.x, mausPos.y);
        rufe('maus', (w) => w.maus && w.maus(p.x, p.y));
      });
    }
    function onKlick(e) {
      if (!Katalog.istKlickInsLeere(e.target)) return;
      const p = relativ(e.clientX, e.clientY);
      rufe('klick', (w) => w.klickInsLeere && w.klickInsLeere(p.x, p.y));
    }
    function onSicht() { if (engine) engine.weiter(); }
    function anmelden() {
      doc.addEventListener('mousemove', onMaus);
      doc.addEventListener('click', onKlick);
      doc.addEventListener('visibilitychange', onSicht);
    }
    function abmelden() {
      doc.removeEventListener('mousemove', onMaus);
      doc.removeEventListener('click', onKlick);
      doc.removeEventListener('visibilitychange', onSicht);
      if (mausFrame !== null) { win.cancelAnimationFrame(mausFrame); mausFrame = null; }
    }

    // --- Gaeste (nur Video-Fenster) -----------------------------------------
    function planeGast() {
      if (fenster !== 'video' || !gastBedingung || !engine) return;
      const ms = (GAST_MIN_MS + Math.random() * GAST_SPANNE_MS) / Math.max(engine.faktor, 0.4);
      gastTimer = win.setTimeout(() => { gastTimer = null; gastJetzt(); planeGast(); }, ms);
    }
    function stoppeGaeste() {
      if (gastTimer !== null) { win.clearTimeout(gastTimer); gastTimer = null; }
    }
    function gastJetzt() {
      if (fenster !== 'video' || !gastBedingung || !gastBedingung()) return;
      rufe('gast', (w) => w.gast && w.gast());
    }

    // --- Welt ----------------------------------------------------------------
    function stoppeWelt() {
      stoppeGaeste();
      abmelden();
      if (welt && welt.stop) { try { welt.stop(); } catch (e) { /* egal, Engine raeumt */ } }
      if (engine) engine.stop();
      welt = null;
      engine = null;
      weltId = null;
    }
    function weltFehler(phase, e) {
      melde('theme', 'welt-fehler', { theme: weltId, phase, fehler: String((e && e.message) || e) });
      stoppeWelt();
    }
    function rufe(phase, fn) {
      if (!welt) return;
      try { fn(welt); } catch (e) { weltFehler(phase, e); }
    }

    async function starteWelt(id, faktor, meinLauf) {
      weltId = id;
      try {
        if (!geladen.has(id)) { await ladeSkript(basis + id + '/welt.js'); geladen.add(id); }
      } catch (e) {
        if (meinLauf === lauf) weltFehler('laden', e);
        return;
      }
      if (meinLauf !== lauf) return;   // inzwischen anderes Theme/aus gewaehlt
      const fabrik = win.TwitchDualWelten && win.TwitchDualWelten[id];
      if (typeof fabrik !== 'function') { weltFehler('laden', new Error('Welt fehlt: ' + id)); return; }
      engine = erzeugeEngine({ ebenen, doc, faktor });
      engine.pausieren(pausiert);
      try {
        welt = fabrik({ engine, fenster, FxEngine }) || null;
        if (welt && welt.start) welt.start();
      } catch (e) {
        if (!welt) welt = {};
        weltFehler('start', e);
        return;
      }
      if (!welt) { weltFehler('start', new Error('Welt liefert nichts')); return; }
      anmelden();
      planeGast();
    }

    async function anwenden(roh) {
      const prefs = Katalog.cleanThemePrefs(roh);
      letztePrefs = prefs;
      setzeFarben(prefs);
      setzeCss(prefs.theme);
      const faktor = Katalog.EFFEKT_FAKTOR[prefs.effekte];
      if (faktor === 0) { lauf++; stoppeWelt(); return; }
      if (weltId === prefs.theme && engine) { engine.setFaktor(faktor); return; }
      lauf++;
      stoppeWelt();
      await starteWelt(prefs.theme, faktor, lauf);
    }

    // --- Galerie-Vorschau (eigene Engine, unabhaengig von der Stufe) --------
    async function starteVorschau(container, id) {
      const nichts = () => {};
      if (!Katalog.THEMES.some((t) => t.id === id)) return nichts;
      try {
        if (!geladen.has(id)) { await ladeSkript(basis + id + '/welt.js'); geladen.add(id); }
      } catch (e) { return nichts; }
      const fabrik = win.TwitchDualWelten && win.TwitchDualWelten[id];
      if (typeof fabrik !== 'function') return nichts;
      const eng = erzeugeEngine({ ebenen: { hinten: container, vorn: container, gast: container }, doc,
        faktor: Katalog.EFFEKT_FAKTOR.wenig });
      let w = null;
      try {
        w = fabrik({ engine: eng, fenster: 'vorschau', FxEngine });
        if (w && w.start) w.start();
      } catch (e) { eng.stop(); return nichts; }
      return () => { try { if (w && w.stop) w.stop(); } catch (e) { /* egal */ } eng.stop(); };
    }

    return {
      anwenden,
      ereignis(art, daten) { rufe('ereignis', (w) => w.ereignis && w.ereignis(art, daten || {})); },
      pausieren(an) {
        pausiert = !!an;
        if (engine) { engine.pausieren(pausiert); if (!pausiert) engine.weiter(); }
      },
      setzeGastBedingung(fn) { gastBedingung = typeof fn === 'function' ? fn : null; },
      gastJetzt,
      starteVorschau,
      stop() { lauf++; stoppeWelt(); },
      get weltAktiv() { return !!welt; }
    };
  }

  return { createRuntime };
});
```

- [ ] **Step 4: Tests laufen lassen**

Run: `node --test test/theme-runtime.test.js`
Expected: PASS (12 Tests). Falls „Neon Dual setzt Akzent-Variablen" an `'0.5'` scheitert: `clampAlpha(50)` liefert 50 → 50/100 = 0.5 → `String(0.5) === '0.5'`, also Rechenweg pruefen statt Test aufweichen.

- [ ] **Step 5: Gesamte Suite**

Run: `npm test`
Expected: alle PASS

- [ ] **Step 6: Commit**

```bash
git add renderer/lib/theme-runtime.js test/theme-runtime.test.js
git commit -m "feat: Theme-Runtime verbindet Katalog, Engine und Welten

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Chat-Fenster verdrahten (Neon Dual sieht unveraendert aus)

**Files:**
- Create: `tools/cdp-eval.js`
- Modify: `renderer/chat/index.html` (Ebenen am Body-Anfang, Script-Tags ~Z. 117)
- Modify: `renderer/chat/chat.css` (Stapelung, `--name`)
- Modify: `renderer/chat/chat.js` (`applyTheme` ~Z. 736–764, `themePrefs`-Init ~Z. 710, Namensfarbe Z. 215 und 357)

**Interfaces:**
- Consumes: `ThemeKatalog`, `FxEngine`, `ThemeRuntime` (Tasks 1–3)
- Produces: globale Konstante `themeRuntime` in chat.js (von Task 6/7 genutzt); Elemente `#fx-hinten`, `#fx-vorn`; CSS-Variable `--name` auf `.msg .user` und `#uc-name`

- [ ] **Step 1: Dev-Werkzeug `tools/cdp-eval.js` anlegen**

```js
// Dev-Werkzeug (nicht gepackt): wertet JS im laufenden TwitchDual-Fenster aus.
// App vorher starten mit: npx electron . --remote-debugging-port=9333
// Aufruf: node tools/cdp-eval.js chat "document.documentElement.dataset.theme"
//         node tools/cdp-eval.js video "..."  [--png datei.png]
const fs = require('fs');
const [,, welches, ausdruck, flag, pngDatei] = process.argv;
(async () => {
  const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
  const t = list.find((x) => x.type === 'page' && x.url.includes('/' + welches + '/index.html'));
  if (!t) throw new Error('Fenster nicht gefunden: ' + welches);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const offen = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); } });
  const cdp = (method, params) => new Promise((r) => { const i = ++id; offen.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const m = await cdp('Runtime.evaluate', { expression: ausdruck, awaitPromise: true, returnByValue: true });
  if (m.result.exceptionDetails) { console.error('FEHLER:', JSON.stringify(m.result.exceptionDetails)); process.exit(1); }
  console.log(JSON.stringify(m.result.result.value, null, 2));
  if (flag === '--png') {
    const s = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(pngDatei, Buffer.from(s.result.data, 'base64'));
    console.log('Screenshot:', pngDatei);
  }
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 2: Ebenen + Skripte in `renderer/chat/index.html`**

Direkt nach `<body>` (vor `<div id="head">`) einfuegen:

```html
  <!-- Theme-Effekte (Spec Lebendige Themes): nie klickbar, hinten gedaempft. -->
  <div id="fx-hinten" class="fx-ebene"></div>
  <div id="fx-vorn" class="fx-ebene"></div>
```

Bei den Skripten direkt nach `<script src="../lib/theme.js"></script>` einfuegen (Reihenfolge wichtig: theme → themes → fx-engine → theme-runtime):

```html
  <script src="../lib/themes.js"></script>
  <script src="../lib/fx-engine.js"></script>
  <script src="../lib/theme-runtime.js"></script>
```

- [ ] **Step 3: Stapelung + Namensfarbe in `renderer/chat/chat.css`**

Am Dateiende anhaengen:

```css
/* --- Lebendige Themes: Effekt-Ebenen --------------------------------------
   fx-hinten liegt UNTER Kopf/Nachrichten/Composer/Footer (die bekommen eine
   eigene Ebene 1), fx-vorn ueber allem fuer kurze Ereignis-Effekte. Beide
   fangen nie einen Klick ab. */
.fx-ebene { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
#fx-hinten { z-index: 0; opacity: .55; }
#fx-vorn { z-index: 40; }
#head, #messages, #composer, #footer { position: relative; z-index: 1; }

/* Namensfarbe als Variable: helle Themes koennen sie per color-mix
   abdunkeln, ohne dass alte Nachrichten neu gerendert werden muessen. */
.msg .user, #uc-name { color: var(--name, #bf94ff); }
```

Hinweis: `#composer` hat bereits `position: relative` (Z. 382) — die neue Regel ergaenzt nur `z-index`. `#settings-pop` (z-index 10, absolut) bleibt darueber.

- [ ] **Step 4: Namensfarbe in `renderer/chat/chat.js` auf `--name` umstellen**

Z. 215 `user.style.color = color || '#bf94ff';` ersetzen durch:

```js
  user.style.setProperty('--name', color || '#bf94ff');
```

Z. 357 `$ucName.style.color = color;` ersetzen durch:

```js
  $ucName.style.setProperty('--name', color || '#bf94ff');
```

- [ ] **Step 5: `applyTheme` in chat.js auf die Runtime umstellen**

`let themePrefs = { ...ThemeLib.DEFAULTS };` (~Z. 710) ersetzen durch:

```js
let themePrefs = ThemeKatalog.cleanThemePrefs(null);

// Effekte + Farben dieses Fensters (Spec Lebendige Themes).
const themeRuntime = ThemeRuntime.createRuntime({
  fenster: 'chat',
  doc: document,
  win: window,
  ebenen: { hinten: document.getElementById('fx-hinten'), vorn: document.getElementById('fx-vorn') },
  melde: (bereich, ereignis, detail) => window.twitchDual.diag(bereich, ereignis, detail)
});
```

In `function applyTheme(prefs)` die ersten Zeilen bis einschliesslich der beiden `--onair-*`-`setProperty`-Aufrufe ersetzen durch:

```js
function applyTheme(prefs) {
  themePrefs = ThemeKatalog.cleanThemePrefs(prefs);
  // Farben, data-theme, Theme-CSS und Welt setzt die Runtime.
  themeRuntime.anwenden(themePrefs);
```

Der Rest von `applyTheme` (Farbwaehler/Deckkraft/Preset-Markierung/Punkte-Symbol spiegeln) bleibt unveraendert.

- [ ] **Step 6: Gesamte Suite**

Run: `npm test`
Expected: alle PASS (`preload-sandbox.test.js` ist nicht betroffen — Preload unveraendert)

- [ ] **Step 7: App starten und pruefen, dass Neon Dual unveraendert ist**

Run (Hintergrund): `npx electron . --remote-debugging-port=9333`
Dann:

```bash
node tools/cdp-eval.js chat "({ theme: document.documentElement.dataset.theme, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), alpha: getComputedStyle(document.documentElement).getPropertyValue('--chat-alpha').trim(), kinder: document.getElementById('fx-hinten').childElementCount, welt: themeRuntime.weltAktiv })" --png neon-chat.png
```

Expected: `theme: "neon-dual"`, `accent` = gespeicherte Chat-Akzentfarbe, `kinder: 0`, `welt: false` (die Neon-Welt-Datei gibt es erst ab Task 7; `welt-fehler`/`laden` im Diagnose-Protokoll ist bis dahin erwartet). Screenshot ansehen: Chat sieht aus wie vorher, Nachrichten klickbar, Namensfarben wie vorher. App danach selbst schliessen (Fenster-✕).

- [ ] **Step 8: Commit**

```bash
git add tools/cdp-eval.js renderer/chat/index.html renderer/chat/chat.css renderer/chat/chat.js
git commit -m "feat: Chat-Fenster nutzt die Theme-Runtime

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Video-Fenster verdrahten (Home-Ebene, Pause, Gastauftritte)

**Files:**
- Modify: `renderer/video/index.html` (Ebenen, Skripte ~Z. 268, `<style>`)
- Modify: `renderer/video/video.js` (`applyTheme` ~Z. 318–337)

**Interfaces:**
- Consumes: `ThemeRuntime.createRuntime` (Task 3); `letzterGesendeterPlayerZustand` (video.js ~Z. 71); `window.twitchDual.onPointsUpdate` (preload, existiert); `points-update`-Payload `{ zuwaechse: [{ betrag, quelle: 'kiste'|'passiv' }] }`
- Produces: globale Konstante `themeRuntime` in video.js; `#fx-hinten` im `#home`, `#fx-gast` am Body

- [ ] **Step 1: Ebenen in `renderer/video/index.html`**

Direkt nach `<body>` einfuegen:

```html
  <!-- Gastauftritte: einzelne Partikel quer uebers Video, nie klickbar. -->
  <div id="fx-gast" class="fx-ebene"></div>
```

Als ERSTES Kind von `<div id="home" class="hidden">` einfuegen:

```html
    <div id="fx-hinten" class="fx-ebene"></div>
```

Im `<style>`-Block am Ende einfuegen:

```css
    /* Lebendige Themes: Home-Ebene liegt unter dem Home-Inhalt, Gast-Ebene
       ueber dem Player. Beide fangen nie einen Klick ab. */
    .fx-ebene { pointer-events: none; overflow: hidden; }
    #fx-gast { position: fixed; inset: 0; z-index: 30; }
    #home > #fx-hinten { position: absolute; inset: 0; z-index: 0; }
    #home > :not(#fx-hinten):not(#home-version) { position: relative; z-index: 1; }
    body.video-only #fx-gast { display: none; }
```

Skripte direkt nach `<script src="../lib/theme.js"></script>`:

```html
  <script src="../lib/themes.js"></script>
  <script src="../lib/fx-engine.js"></script>
  <script src="../lib/theme-runtime.js"></script>
```

- [ ] **Step 2: `applyTheme` in `renderer/video/video.js` ersetzen**

Die komplette Funktion `applyTheme(prefs)` (~Z. 318–327) ersetzen durch:

```js
// Farben, data-theme, Theme-CSS und Welt setzt die Runtime (Spec Lebendige
// Themes). Im Video-Fenster lebt die Welt nur im Home-Overlay; uebers Video
// fliegen nur Gastauftritte.
const themeRuntime = ThemeRuntime.createRuntime({
  fenster: 'video',
  doc: document,
  win: window,
  ebenen: { hinten: document.getElementById('fx-hinten'), gast: document.getElementById('fx-gast') },
  melde: (bereich, ereignis, detail) => window.twitchDual.diag(bereich, ereignis, detail)
});
function applyTheme(prefs) {
  themeRuntime.anwenden(prefs);
}

// Ambient nur bei offenem Home und nie im Nur-Video-Modus.
const $homeFx = document.getElementById('home');
function aktualisiereFxPause() {
  themeRuntime.pausieren($homeFx.classList.contains('hidden') || document.body.classList.contains('video-only'));
}
new MutationObserver(aktualisiereFxPause).observe($homeFx, { attributes: true, attributeFilter: ['class'] });
new MutationObserver(aktualisiereFxPause).observe(document.body, { attributes: true, attributeFilter: ['class'] });
aktualisiereFxPause();

// Gastauftritte nur bei laufendem Player und nicht im Nur-Video-Modus.
themeRuntime.setzeGastBedingung(() =>
  letzterGesendeterPlayerZustand === 'playing' && !document.body.classList.contains('video-only'));
// Kiste eingesammelt -> sofort ein Gast (die Punkte-Anzeige selbst lebt im Chat).
window.twitchDual.onPointsUpdate((p) => {
  if (p && Array.isArray(p.zuwaechse) && p.zuwaechse.some((z) => z && z.quelle === 'kiste')) {
    themeRuntime.gastJetzt();
  }
});
```

Achtung: `letzterGesendeterPlayerZustand` ist mit `let` weiter oben deklariert (Z. ~71) — der Verweis in der Bedingung wird erst beim Aufruf ausgewertet, also kein TDZ-Problem. Die bestehenden Zeilen `window.twitchDual.getUiPrefs().then(...)` und `window.twitchDual.onThemeChanged(applyTheme);` bleiben unveraendert.

- [ ] **Step 3: Suite + App-Pruefung**

Run: `npm test` → alle PASS. App mit `npx electron . --remote-debugging-port=9333` starten, dann:

```bash
node tools/cdp-eval.js video "({ theme: document.documentElement.dataset.theme, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), gastEbene: !!document.getElementById('fx-gast'), homeEbene: document.querySelector('#home > #fx-hinten') !== null })" --png neon-video.png
```

Expected: `theme: "neon-dual"`, Video-Akzent, beide Ebenen `true`. Screenshot: Video-Fenster wie vorher. Home (☰) oeffnen: alle Knoepfe klickbar. App schliessen.

- [ ] **Step 4: Commit**

```bash
git add renderer/video/index.html renderer/video/video.js
git commit -m "feat: Video-Fenster nutzt die Theme-Runtime, Gaeste bei Kiste

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ⚙-Popup — Theme-Zeile, Effekte-Regler, Galerie

**Files:**
- Modify: `renderer/chat/index.html` (Abschnitt „Darstellung" Z. ~33–48, Galerie nach `#settings-pop`)
- Modify: `renderer/chat/chat.css` (Ende)
- Modify: `renderer/chat/chat.js` (nach `applyTheme`; `applyTheme`-Ende ergaenzen)

**Interfaces:**
- Consumes: `ThemeKatalog.THEMES/EFFEKT_STUFEN/themeById`, `themeRuntime.starteVorschau`, `window.twitchDual.saveThemePrefs(teil)` (main mischt, Task 1), `$settingsPop`
- Produces: `#opt-theme`, `#opt-effekte`, `#opt-neon-farben`, `#theme-galerie`, Funktionen `oeffneGalerie()`, `schliesseGalerie()`, `spiegleThemeUi()`

- [ ] **Step 1: Markup „Darstellung" ersetzen**

Den kompletten Block von `<div class="opt-group">` mit Titel `Darstellung` bis einschliesslich `<button id="opt-color-reset" ...>Farben zurücksetzen</button>` ersetzen durch:

```html
    <div class="opt-group">
      <div class="opt-group-title">Darstellung</div>
      <button id="opt-theme" type="button" class="opt-theme-row">🎨 Theme: <b id="opt-theme-name">Neon Dual</b><span class="opt-theme-pfeil">›</span></button>
      <div class="opt-row">Effekte
        <div id="opt-effekte" class="opt-segment" role="group" aria-label="Effekte"></div>
      </div>
      <div id="opt-neon-farben">
        <div class="opt-presets-label">Presets</div>
        <div id="opt-presets" class="opt-presets"></div>
        <label class="opt-color-row opt-row">Video-Akzent
          <input type="color" id="opt-color-video" value="#35e0ff" />
        </label>
        <label class="opt-color-row opt-row">Chat-Akzent
          <input type="color" id="opt-color-chat" value="#ff4fa3" />
        </label>
        <button id="opt-color-reset" type="button">Farben zurücksetzen</button>
      </div>
      <label class="opt-alpha-row opt-row">Deckkraft (Chat)
        <input type="range" id="opt-alpha-chat" min="0" max="100" step="5" value="100" />
        <span id="opt-alpha-chat-val" class="opt-alpha-val">100%</span>
      </label>
    </div>
```

Direkt nach dem schliessenden `</div>` von `#settings-pop` einfuegen:

```html
  <div id="theme-galerie" class="hidden">
    <div class="galerie-kopf"><span>🎨 Themes</span><button id="galerie-zu" type="button" title="Schließen">✕</button></div>
    <div id="galerie-liste"></div>
  </div>
```

- [ ] **Step 2: CSS am Ende von `chat.css`**

```css
/* --- ⚙: Theme-Zeile + Effekte-Regler ---------------------------------------- */
.opt-theme-row {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 7px 8px; border-radius: 6px; border: 1px solid var(--accent-border);
  background: var(--accent-glow); color: var(--text); font: inherit; cursor: pointer; text-align: left;
}
.opt-theme-row:hover { filter: brightness(1.15); }
.opt-theme-row b { color: var(--accent-title); }
.opt-theme-pfeil { margin-left: auto; color: var(--muted); }
.opt-segment { display: inline-flex; margin-left: auto; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.opt-segment button {
  padding: 3px 7px; border: none; background: transparent; color: var(--muted);
  font: inherit; font-size: 11px; cursor: pointer;
}
.opt-segment button + button { border-left: 1px solid var(--line); }
.opt-segment button.aktiv { background: var(--accent); color: var(--accent-contrast); }
#opt-neon-farben { display: flex; flex-direction: column; gap: 8px; }
#opt-neon-farben.hidden { display: none; }

/* --- Theme-Galerie ------------------------------------------------------------ */
#theme-galerie {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
  background: var(--panel); backdrop-filter: blur(8px);
  display: flex; flex-direction: column; animation: pop-in 120ms ease-out;
}
#theme-galerie.hidden { display: none; }
.galerie-kopf {
  display: flex; align-items: center; padding: 8px 12px; font-weight: 700; color: var(--accent-title);
  border-bottom: 1px solid var(--line);
}
.galerie-kopf button {
  margin-left: auto; border: none; background: none; color: var(--muted); cursor: pointer; font-size: 14px;
}
#galerie-liste { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
.galerie-karte {
  display: block; width: 100%; padding: 0; border: 1px solid var(--line); border-radius: 8px;
  overflow: hidden; background: var(--hover); color: var(--text); cursor: pointer; text-align: left;
  font: inherit; transition: transform 120ms ease, border-color 120ms ease;
}
.galerie-karte:hover { transform: translateY(-1px); border-color: var(--accent-border); }
.galerie-karte.aktiv { border: 2px solid var(--accent); box-shadow: 0 0 10px var(--accent-glow); }
.galerie-bild { height: 70px; position: relative; overflow: hidden; }
.galerie-name { padding: 6px 10px; font-size: 12px; font-weight: 600; display: flex; gap: 6px; align-items: baseline; }
.galerie-info { margin-left: auto; font-size: 10px; font-weight: 400; color: var(--muted); }
.galerie-check { display: none; color: var(--accent); }
.galerie-karte.aktiv .galerie-check { display: inline; }
```

- [ ] **Step 3: Logik in `chat.js`** — direkt nach den `getUiPrefs`/`onThemeChanged`-Zeilen des Themes (~Z. 770) einfuegen:

```js
// ---------------------------------------------------------------------------
// Lebendige Themes: Theme-Zeile, Effekte-Regler, Galerie (Spec Abschnitt 3).
// Gespeichert wird immer nur das geaenderte Feld - main.js mischt.
// ---------------------------------------------------------------------------
const $themeBtn = document.getElementById('opt-theme');
const $themeName = document.getElementById('opt-theme-name');
const $effekte = document.getElementById('opt-effekte');
const $neonFarben = document.getElementById('opt-neon-farben');
const $galerie = document.getElementById('theme-galerie');
const $galerieListe = document.getElementById('galerie-liste');
const $head = document.getElementById('head');
const STUFEN_TEXT = { aus: 'Aus', wenig: 'Wenig', normal: 'Normal', viel: 'Viel' };
let vorschauStopps = [];

for (const stufe of ThemeKatalog.EFFEKT_STUFEN) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.stufe = stufe;
  b.textContent = STUFEN_TEXT[stufe];
  b.addEventListener('click', () => window.twitchDual.saveThemePrefs({ effekte: stufe }));
  $effekte.appendChild(b);
}

// Spiegelt themePrefs in Popup + offene Galerie (aus applyTheme aufgerufen).
function spiegleThemeUi() {
  const t = ThemeKatalog.themeById(themePrefs.theme);
  $themeName.textContent = t.name;
  for (const b of $effekte.children) b.classList.toggle('aktiv', b.dataset.stufe === themePrefs.effekte);
  $neonFarben.classList.toggle('hidden', !t.farbenFrei);
  for (const k of $galerieListe.children) k.classList.toggle('aktiv', k.dataset.id === themePrefs.theme);
}

function baueGalerie() {
  $galerieListe.innerHTML = '';
  for (const t of ThemeKatalog.THEMES) {
    const karte = document.createElement('button');
    karte.type = 'button';
    karte.className = 'galerie-karte' + (t.id === themePrefs.theme ? ' aktiv' : '');
    karte.dataset.id = t.id;
    const bild = document.createElement('div');
    bild.className = 'galerie-bild';
    bild.style.background = t.vorschau;
    const name = document.createElement('div');
    name.className = 'galerie-name';
    const n = document.createElement('span'); n.textContent = t.name;
    const check = document.createElement('span'); check.className = 'galerie-check'; check.textContent = '✓';
    const info = document.createElement('span'); info.className = 'galerie-info';
    info.textContent = (t.hell ? 'hell' : 'dunkel') + ' · ' + t.info;
    name.append(n, check, info);
    karte.append(bild, name);
    karte.addEventListener('click', () => window.twitchDual.saveThemePrefs({ theme: t.id }));
    $galerieListe.appendChild(karte);
    themeRuntime.starteVorschau(bild, t.id).then((stopp) => {
      if ($galerie.classList.contains('hidden')) stopp(); else vorschauStopps.push(stopp);
    }).catch(() => {});
  }
}

function oeffneGalerie() {
  $settingsPop.classList.add('hidden');
  $galerie.style.top = $head.getBoundingClientRect().bottom + 'px';
  $galerie.classList.remove('hidden');
  baueGalerie();
}
function schliesseGalerie() {
  $galerie.classList.add('hidden');
  for (const stopp of vorschauStopps) stopp();
  vorschauStopps = [];
  $galerieListe.innerHTML = '';
}
$themeBtn.addEventListener('click', oeffneGalerie);
document.getElementById('galerie-zu').addEventListener('click', schliesseGalerie);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$galerie.classList.contains('hidden')) schliesseGalerie();
});
spiegleThemeUi();
```

Am Ende von `function applyTheme(prefs)` (vor der schliessenden `}`) ergaenzen:

```js
  if (typeof spiegleThemeUi === 'function') spiegleThemeUi();
```

(`spiegleThemeUi` ist eine Funktionsdeklaration weiter unten im selben Skript → gehoistet; die Konstanten `$themeName` usw. sind aber erst nach ihrer Zeile initialisiert. Der erste `applyTheme`-Aufruf kommt asynchron aus `getUiPrefs().then(...)`, also nach dem kompletten Skriptdurchlauf — kein TDZ-Fehler. Der `typeof`-Schutz bleibt als Absicherung.)

- [ ] **Step 4: Suite + App-Pruefung**

Run: `npm test` → alle PASS. App starten, dann:

```bash
node tools/cdp-eval.js chat "(document.getElementById('settings-btn').click(), document.getElementById('opt-theme').click(), new Promise(r => setTimeout(() => r({ offen: !document.getElementById('theme-galerie').classList.contains('hidden'), karten: document.querySelectorAll('.galerie-karte').length, aktiv: document.querySelector('.galerie-karte.aktiv').dataset.id }), 800)))" --png galerie.png
```

Expected: `offen: true`, `karten: 5`, `aktiv: "neon-dual"`. Dann Esc pruefen und Effekte-Regler:

```bash
node tools/cdp-eval.js chat "(document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })), document.querySelector('#opt-effekte [data-stufe=wenig]').click(), new Promise(r => setTimeout(() => r({ zu: document.getElementById('theme-galerie').classList.contains('hidden'), stufe: themePrefs.effekte, theme: themePrefs.theme }), 500)))"
```

Expected: `zu: true`, `stufe: "wenig"`, `theme: "neon-dual"`. Danach `normal` zurueckklicken (gleicher Befehl mit `data-stufe=normal`).

- [ ] **Step 5: Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.css renderer/chat/chat.js
git commit -m "feat: Theme-Galerie und Effekte-Regler im Einstellungs-Popup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Punkte-/Kisten-Ereignisse + Neon-Dual-Funkenregen

**Files:**
- Modify: `renderer/chat/chat.js` (`zeigeZuwachs` ~Z. 1303)
- Create: `renderer/themes/neon-dual/welt.js`

**Interfaces:**
- Consumes: `themeRuntime.ereignis(art, { betrag, ursprung })` (Task 3/4), `$pointsChip`
- Produces: `window.TwitchDualWelten['neon-dual']`

- [ ] **Step 1: `zeigeZuwachs` meldet das Ereignis** — in `function zeigeZuwachs(z)` direkt nach `const kiste = z.quelle === 'kiste';` einfuegen:

```js
  // Lebendige Themes: Effekt am Punkte-Chip (Kiste gross, passiv klein).
  if ($pointsChip) {
    const r = $pointsChip.getBoundingClientRect();
    themeRuntime.ereignis(kiste ? 'kiste' : 'punkte', {
      betrag: z.betrag,
      ursprung: { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    });
  }
```

- [ ] **Step 2: `renderer/themes/neon-dual/welt.js` anlegen**

```js
// Neon Dual: keine Dauer-Animation (Bestandsnutzer sollen nichts Neues
// aufgedraengt bekommen), nur ein Cyan/Magenta-Funkenregen am Punkte-Chip.
(function () {
  window.TwitchDualWelten = window.TwitchDualWelten || {};
  window.TwitchDualWelten['neon-dual'] = function ({ engine, FxEngine }) {
    const { tr, rnd } = FxEngine;
    function funke(x, y, i, weit) {
      const farbe = i % 2 ? 'var(--onair-to, #ff4fa3)' : 'var(--onair-from, #35e0ff)';
      const winkel = rnd(Math.PI * 1.05, Math.PI * 1.95);   // nach oben gefaechert
      const d = weit ? rnd(60, 160) : rnd(20, 50);
      engine.spawn({
        ebene: 'vorn',
        stil: { width: '4px', height: '4px', marginLeft: '-2px', marginTop: '-2px', borderRadius: '50%', background: farbe, boxShadow: '0 0 8px ' + farbe },
        keyframes: [
          { transform: tr(x, y), opacity: 1 },
          { transform: tr(x + Math.cos(winkel) * d, y + Math.sin(winkel) * d), opacity: 0.9, offset: 0.6 },
          { transform: tr(x + Math.cos(winkel) * d * 1.1, y + Math.sin(winkel) * d + 30), opacity: 0 }
        ],
        dauerMs: weit ? rnd(1100, 1700) : rnd(600, 900),
        easing: 'cubic-bezier(.2,.8,.3,1)'
      });
    }
    return {
      start() {},
      stop() {},
      ereignis(art, daten) {
        const u = daten.ursprung || { x: 0, y: 0 };
        const kiste = art === 'kiste';
        const n = kiste ? 26 : 8;
        for (let i = 0; i < n; i++) funke(u.x, u.y, i, kiste);
      }
    };
  };
})();
```

- [ ] **Step 3: App-Pruefung mit kuenstlichem Ereignis**

App starten (`npx electron . --remote-debugging-port=9333`), dann:

```bash
node tools/cdp-eval.js chat "new Promise(r => setTimeout(() => { themeRuntime.ereignis('kiste', { betrag: 50, ursprung: { x: innerWidth - 80, y: innerHeight - 30 } }); setTimeout(() => r({ welt: themeRuntime.weltAktiv, funken: document.getElementById('fx-vorn').childElementCount }), 200); }, 1500))" --png neon-kiste.png
```

Expected: `welt: true`, `funken` zwischen 1 und 26. Screenshot zeigt Funken ueber dem Chat-Fuss. Diagnose-Protokoll (`%APPDATA%\twitchdual\diagnose.log`) enthaelt fuer diesen Start KEIN `theme:welt-fehler`.

- [ ] **Step 4: Commit**

```bash
git add renderer/chat/chat.js renderer/themes/neon-dual/welt.js
git commit -m "feat: Punkte- und Kisten-Effekt, Neon-Dual-Funkenregen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Theme Sakura

**Files:**
- Create: `renderer/themes/sakura/theme.css`
- Create: `renderer/themes/sakura/welt.js`

**Interfaces:**
- Consumes: Welt-Vertrag aus Task 3; Ebenen `hinten`/`vorn`/`gast`
- Produces: `window.TwitchDualWelten.sakura`

- [ ] **Step 1: `theme.css`**

```css
/* Sakura (hell): Pastell-Rosa/Lila, runde Formen. Flaechen tragen
   --chat-alpha (Glass-Transparenz), Akzente bleiben voll. */
:root[data-theme="sakura"] {
  --bg: rgb(255 244 248 / var(--chat-alpha, 1));
  --panel: rgb(255 232 241 / var(--chat-alpha, 1));
  --hover: rgb(255 222 235 / var(--chat-alpha, 1));
  --line: #f6cfdd;
  --text: #5a3446;
  --muted: #9a6f82;
  --ts: #c09aab;
  --accent: #e0659a;
  --accent-title: #c2507a;
  --accent-border: rgba(224, 101, 154, .45);
  --accent-glow: rgba(224, 101, 154, .18);
  --accent-dim: rgba(224, 101, 154, .3);
  --accent-contrast: #ffffff;
  --onair-from: #ffb3cc;
  --onair-to: #d7b8ff;
}
/* Helle Flaeche: helle Twitch-Namensfarben (z.B. #FFFF00) abdunkeln. */
:root[data-theme="sakura"] .msg .user,
:root[data-theme="sakura"] #uc-name { color: color-mix(in srgb, var(--name, #bf94ff) 55%, #000); }
:root[data-theme="sakura"] #messages::-webkit-scrollbar-thumb { background: #f2b8cc; }
:root[data-theme="sakura"] #emote-panel,
:root[data-theme="sakura"] #ac-bar { background: #fff5f9; }
:root[data-theme="sakura"] #settings-pop,
:root[data-theme="sakura"] .galerie-karte,
:root[data-theme="sakura"] #composer { border-radius: 12px; }
```

- [ ] **Step 2: `welt.js`**

```js
// Sakura: Kirschblueten segeln; Maus streut ab und zu eine Bluete, Klick ins
// Leere = Bluetenwirbel, Kiste = Bluetenexplosion aus dem Punkte-Chip.
(function () {
  window.TwitchDualWelten = window.TwitchDualWelten || {};
  window.TwitchDualWelten.sakura = function ({ engine, FxEngine }) {
    const { tr, rnd } = FxEngine;
    let letzteSpur = 0;

    function bluete(ebene, x0, y0, x1, y1, ms, groesse, deckkraft) {
      const dreh = rnd(-360, 360);
      return engine.spawn({
        ebene, inhalt: '🌸',
        stil: { fontSize: groesse + 'px', lineHeight: '1' },
        keyframes: [
          { transform: tr(x0, y0, ' rotate(0deg)'), opacity: 0 },
          { opacity: deckkraft, offset: 0.1 },
          { transform: tr((x0 + x1) / 2 + rnd(-30, 30), (y0 + y1) / 2, ' rotate(' + (dreh / 2) + 'deg)'), opacity: deckkraft, offset: 0.5 },
          { transform: tr(x1, y1, ' rotate(' + dreh + 'deg)'), opacity: 0 }
        ],
        dauerMs: ms, easing: 'ease-in-out'
      });
    }

    return {
      start() {
        engine.intervall(() => {
          const { w, h } = engine.groesse('hinten');
          const x = rnd(-20, w);
          bluete('hinten', x, -24, x + rnd(-40, 90), h + 24, rnd(6000, 10000), rnd(11, 17), 1);
        }, 900);
      },
      stop() {},
      maus(x, y) {
        const jetzt = Date.now();
        if (jetzt - letzteSpur < 350) return;
        letzteSpur = jetzt;
        bluete('hinten', x, y, x + rnd(-30, 30), y + rnd(60, 110), rnd(1400, 2000), rnd(9, 12), 0.9);
      },
      klickInsLeere(x, y) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          bluete('hinten', x, y, x + Math.cos(a) * rnd(35, 60), y + Math.sin(a) * rnd(35, 60) + 25, rnd(900, 1300), rnd(10, 14), 1);
        }
      },
      ereignis(art, daten) {
        const u = daten.ursprung || { x: 0, y: 0 };
        if (art === 'kiste') {
          for (let i = 0; i < 26; i++) {
            const zielX = u.x + rnd(-260, 60);
            bluete('vorn', u.x, u.y, zielX, u.y - rnd(120, 420), rnd(2200, 3200), rnd(14, 24), 1);
          }
        } else {
          for (let i = 0; i < 5; i++) bluete('vorn', u.x, u.y, u.x + rnd(-50, 30), u.y - rnd(30, 80), rnd(900, 1300), rnd(10, 13), 1);
        }
      },
      gast() {
        const { w, h } = engine.groesse('gast');
        const y0 = rnd(0, h * 0.4);
        bluete('gast', -30, y0, w + 30, y0 + rnd(h * 0.3, h * 0.6), rnd(5000, 6500), 22, 0.85);
      }
    };
  };
})();
```

- [ ] **Step 3: App-Pruefung**

App starten, dann in der Galerie Sakura waehlen und pruefen:

```bash
node tools/cdp-eval.js chat "(window.twitchDual.saveThemePrefs({ theme: 'sakura', effekte: 'normal' }), new Promise(r => setTimeout(() => { themeRuntime.ereignis('kiste', { betrag: 50, ursprung: { x: innerWidth - 80, y: innerHeight - 30 } }); setTimeout(() => r({ theme: document.documentElement.dataset.theme, welt: themeRuntime.weltAktiv, hinten: document.getElementById('fx-hinten').childElementCount, vorn: document.getElementById('fx-vorn').childElementCount, bg: getComputedStyle(document.body).backgroundColor }), 300); }, 4000)))" --png sakura-chat.png
node tools/cdp-eval.js video "({ theme: document.documentElement.dataset.theme, gast: (themeRuntime.setzeGastBedingung(() => true), themeRuntime.gastJetzt(), document.getElementById('fx-gast').childElementCount) })" --png sakura-video.png
```

Expected: `theme: "sakura"`, `welt: true`, `hinten` ≥ 1, `vorn` ≥ 1, helles `bg`; Video: `gast: 1`. Screenshots ansehen: Text lesbar, Blueten hinter den Nachrichten gedaempft. Gast-Bedingung danach wieder herstellen ist nicht noetig (App wird geschlossen).

- [ ] **Step 4: Commit**

```bash
git add renderer/themes/sakura
git commit -m "feat: Theme Sakura mit Kirschblueten

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Theme Wald

**Files:**
- Create: `renderer/themes/wald/theme.css`
- Create: `renderer/themes/wald/welt.js`

**Interfaces:**
- Consumes: Welt-Vertrag (Task 3), `engine.element`, `engine.schleife`
- Produces: `window.TwitchDualWelten.wald`

- [ ] **Step 1: `theme.css`**

```css
/* Wald (dunkel): Moosgruen, warmes Gluehwuermchen-Gelbgruen als Akzent. */
:root[data-theme="wald"] {
  --bg: rgb(14 31 20 / var(--chat-alpha, 1));
  --panel: rgb(20 40 26 / var(--chat-alpha, 1));
  --hover: rgb(26 52 34 / var(--chat-alpha, 1));
  --line: #24432d;
  --text: #e3f0d6;
  --muted: #9fb894;
  --ts: #6d8a66;
  --accent: #9fe07a;
  --accent-title: #cfe8b0;
  --accent-border: rgba(159, 224, 122, .4);
  --accent-glow: rgba(159, 224, 122, .2);
  --accent-dim: rgba(159, 224, 122, .3);
  --accent-contrast: #10200f;
  --onair-from: #6fbf5a;
  --onair-to: #e8ff7a;
}
:root[data-theme="wald"] #messages::-webkit-scrollbar-thumb { background: #2f5a3a; }
:root[data-theme="wald"] #emote-panel,
:root[data-theme="wald"] #ac-bar { background: #102116; }
```

- [ ] **Step 2: `welt.js`**

```js
// Wald: Gluehwuermchen schwirren und pulsieren, folgen der Maus locker.
// Klick = Funke, Kiste = Schwarm fliegt zum Punkte-Chip und leuchtet auf.
(function () {
  window.TwitchDualWelten = window.TwitchDualWelten || {};
  window.TwitchDualWelten.wald = function ({ engine, FxEngine }) {
    const { tr, rnd } = FxEngine;
    const GLUEH = {
      width: '5px', height: '5px', marginLeft: '-2px', marginTop: '-2px', borderRadius: '50%',
      background: '#e8ff7a', boxShadow: '0 0 8px 3px rgba(232, 255, 122, .7)'
    };
    let fliegen = [];
    let maus = null;

    function funke(ebene, x0, y0, x1, y1, ms) {
      engine.spawn({
        ebene, stil: GLUEH,
        keyframes: [
          { transform: tr(x0, y0), opacity: 0 },
          { opacity: 1, offset: 0.2 },
          { transform: tr(x1, y1), opacity: 1, offset: 0.85 },
          { transform: tr(x1, y1, ' scale(2.2)'), opacity: 0 }
        ],
        dauerMs: ms, easing: 'ease-in-out'
      });
    }

    return {
      start() {
        const { w, h } = engine.groesse('hinten');
        const n = Math.max(2, Math.round(6 * engine.faktor));
        for (let i = 0; i < n; i++) {
          const el = engine.element({ ebene: 'hinten', stil: GLUEH });
          if (!el) break;
          fliegen.push({ el, x: rnd(0, w), y: rnd(0, h), vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), phase: rnd(0, 6.28) });
        }
        engine.schleife((dt) => {
          const { w: W, h: H } = engine.groesse('hinten');
          const k = dt / 16;
          for (const f of fliegen) {
            f.phase += dt * 0.004;
            if (maus && Math.hypot(maus.x - f.x, maus.y - f.y) < 160) {
              f.vx += (maus.x - f.x) * 0.0006 * k;
              f.vy += (maus.y - f.y) * 0.0006 * k;
            }
            f.vx = (f.vx + rnd(-0.05, 0.05)) * 0.98;
            f.vy = (f.vy + rnd(-0.05, 0.05)) * 0.98;
            const v = Math.hypot(f.vx, f.vy);
            if (v > 1.2) { f.vx *= 1.2 / v; f.vy *= 1.2 / v; }
            f.x += f.vx * k; f.y += f.vy * k;
            if (f.x < -10) f.x = W + 10; if (f.x > W + 10) f.x = -10;
            if (f.y < -10) f.y = H + 10; if (f.y > H + 10) f.y = -10;
            f.el.style.transform = tr(f.x, f.y);
            f.el.style.opacity = String(0.35 + 0.65 * (0.5 + 0.5 * Math.sin(f.phase)));
          }
        });
      },
      stop() { fliegen = []; },
      maus(x, y) { maus = { x, y }; },
      klickInsLeere(x, y) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          funke('hinten', x, y, x + Math.cos(a) * rnd(20, 40), y + Math.sin(a) * rnd(20, 40), rnd(700, 1000));
        }
      },
      ereignis(art, daten) {
        const u = daten.ursprung || { x: 0, y: 0 };
        const { w, h } = engine.groesse('vorn');
        const n = art === 'kiste' ? 18 : 3;
        for (let i = 0; i < n; i++) {
          const vonRand = Math.random() < 0.5;
          const x0 = vonRand ? (Math.random() < 0.5 ? -10 : w + 10) : rnd(0, w);
          const y0 = vonRand ? rnd(0, h) : -10;
          funke('vorn', x0, y0, u.x + rnd(-12, 12), u.y + rnd(-8, 8), art === 'kiste' ? rnd(1400, 2400) : rnd(900, 1300));
        }
      },
      gast() {
        const { w, h } = engine.groesse('gast');
        const y = rnd(h * 0.2, h * 0.8);
        engine.spawn({
          ebene: 'gast', stil: GLUEH,
          keyframes: [
            { transform: tr(-20, y), opacity: 0 },
            { transform: tr(w * 0.3, y - 40), opacity: 1, offset: 0.3 },
            { transform: tr(w * 0.6, y + 30), opacity: 0.6, offset: 0.6 },
            { transform: tr(w + 20, y - 20), opacity: 0 }
          ],
          dauerMs: 6000, easing: 'ease-in-out'
        });
      }
    };
  };
})();
```

- [ ] **Step 3: App-Pruefung** — wie Task 8 Step 3, mit `theme: 'wald'` und Dateinamen `wald-chat.png`/`wald-video.png`. Zusaetzlich die Schleife pruefen:

```bash
node tools/cdp-eval.js chat "(window.twitchDual.saveThemePrefs({ theme: 'wald' }), new Promise(r => setTimeout(() => { const a = [...document.querySelectorAll('#fx-hinten > div')].map(e => e.style.transform); setTimeout(() => { const b = [...document.querySelectorAll('#fx-hinten > div')].map(e => e.style.transform); r({ anzahl: a.length, bewegt: a.some((t, i) => t !== b[i]) }); }, 500); }, 1500)))"
```

Expected: `anzahl` ≥ 2, `bewegt: true`.

- [ ] **Step 4: Commit**

```bash
git add renderer/themes/wald
git commit -m "feat: Theme Wald mit Gluehwuermchen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Theme Koi-Teich

**Files:**
- Create: `renderer/themes/koi/theme.css`
- Create: `renderer/themes/koi/welt.js`

**Interfaces:**
- Consumes: Welt-Vertrag (Task 3), `engine.element`, `engine.schleife`, `engine.spawn`
- Produces: `window.TwitchDualWelten.koi`

- [ ] **Step 1: `theme.css`**

```css
/* Koi-Teich (dunkel): Petrol-Wasser, Koi-Orange als Akzent. */
:root[data-theme="koi"] {
  --bg: rgb(8 38 37 / var(--chat-alpha, 1));
  --panel: rgb(12 52 49 / var(--chat-alpha, 1));
  --hover: rgb(16 64 60 / var(--chat-alpha, 1));
  --line: #1d5a52;
  --text: #e0fff6;
  --muted: #8fc4b6;
  --ts: #5f9a8c;
  --accent: #ff8a3d;
  --accent-title: #ffc49a;
  --accent-border: rgba(255, 138, 61, .4);
  --accent-glow: rgba(255, 138, 61, .2);
  --accent-dim: rgba(255, 138, 61, .3);
  --accent-contrast: #2a0e00;
  --onair-from: #ff8a3d;
  --onair-to: #ffd6a8;
}
:root[data-theme="koi"] #messages::-webkit-scrollbar-thumb { background: #1d5a52; }
:root[data-theme="koi"] #emote-panel,
:root[data-theme="koi"] #ac-bar { background: #0a2e2c; }
```

- [ ] **Step 2: `welt.js`**

```js
// Koi-Teich: Kois ziehen Kreise, Maus macht leise Wellen, Klick = Welle und
// die Fische fluechten. Kiste = goldene Lotusbluete am Punkte-Chip.
(function () {
  window.TwitchDualWelten = window.TwitchDualWelten || {};
  window.TwitchDualWelten.koi = function ({ engine, FxEngine }) {
    const { tr, rnd } = FxEngine;
    const FISCH = {
      width: '18px', height: '8px', marginLeft: '-9px', marginTop: '-4px',
      borderRadius: '50% 60% 60% 50%',
      background: 'radial-gradient(circle at 25% 50%, #fff 0 2px, transparent 3px), #ff7a2a',
      boxShadow: '0 0 6px rgba(255, 140, 60, .6)'
    };
    let fische = [];
    let letzteWelle = 0;
    let lockUntil = 0;
    let lockZiel = null;

    function schwanz(el) {
      const s = document.createElement('div');
      s.style.position = 'absolute'; s.style.right = '-7px'; s.style.top = '0';
      s.style.borderTop = '4px solid transparent'; s.style.borderBottom = '4px solid transparent';
      s.style.borderLeft = '7px solid #ff7a2a';
      el.appendChild(s);
    }
    function welle(ebene, x, y, gross) {
      engine.spawn({
        ebene,
        stil: { width: '12px', height: '12px', marginLeft: '-6px', marginTop: '-6px', borderRadius: '50%', border: '1.5px solid rgba(200, 255, 240, .8)' },
        keyframes: [
          { transform: tr(x, y, ' scale(1)'), opacity: 1 },
          { transform: tr(x, y, ' scale(' + (gross ? 12 : 6) + ')'), opacity: 0 }
        ],
        dauerMs: gross ? 1600 : 1000, easing: 'ease-out'
      });
    }

    return {
      start() {
        const { w, h } = engine.groesse('hinten');
        const n = Math.max(2, Math.round(4 * engine.faktor));
        for (let i = 0; i < n; i++) {
          const el = engine.element({ ebene: 'hinten', stil: FISCH });
          if (!el) break;
          schwanz(el);
          fische.push({ el, x: rnd(20, w - 20), y: rnd(20, h - 20), a: rnd(0, 6.28), v: 0.5 });
        }
        engine.schleife((dt) => {
          const { w: W, h: H } = engine.groesse('hinten');
          const k = dt / 16;
          const locken = lockZiel && Date.now() < lockUntil;
          for (const f of fische) {
            if (locken) {
              const ziel = Math.atan2(lockZiel.y - f.y, lockZiel.x - f.x);
              f.a += Math.atan2(Math.sin(ziel - f.a), Math.cos(ziel - f.a)) * 0.08;
            } else {
              f.a += rnd(-0.07, 0.07);
            }
            f.x += Math.cos(f.a) * f.v * k;
            f.y += Math.sin(f.a) * f.v * k;
            if (f.x < 8 || f.x > W - 8 || f.y < 8 || f.y > H - 8) {
              f.a += Math.PI * 0.9;
              f.x = Math.max(8, Math.min(W - 8, f.x));
              f.y = Math.max(8, Math.min(H - 8, f.y));
            }
            f.v += (0.5 - f.v) * 0.02;
            // Kopf ist links (Glanzpunkt bei 25 %) -> um 180 Grad drehen.
            f.el.style.transform = tr(f.x, f.y, ' rotate(' + (f.a + Math.PI) + 'rad)');
          }
        });
      },
      stop() { fische = []; },
      maus(x, y) {
        const jetzt = Date.now();
        if (jetzt - letzteWelle < 300) return;
        letzteWelle = jetzt;
        welle('hinten', x, y, false);
      },
      klickInsLeere(x, y) {
        welle('hinten', x, y, false);
        setTimeout(() => welle('hinten', x, y, false), 180);
        for (const f of fische) {
          if (Math.hypot(f.x - x, f.y - y) < 90) { f.a = Math.atan2(f.y - y, f.x - x); f.v = 3.5; }
        }
      },
      ereignis(art, daten) {
        const u = daten.ursprung || { x: 0, y: 0 };
        if (art === 'kiste') {
          engine.spawn({
            ebene: 'vorn', inhalt: '🪷', stil: { fontSize: '30px', lineHeight: '1', marginLeft: '-15px', marginTop: '-15px' },
            keyframes: [
              { transform: tr(u.x, u.y, ' scale(0)'), opacity: 0 },
              { transform: tr(u.x, u.y - 10, ' scale(1.3)'), opacity: 1, offset: 0.3 },
              { transform: tr(u.x, u.y - 40, ' scale(1)'), opacity: 0 }
            ],
            dauerMs: 2600, easing: 'ease-out'
          });
          welle('vorn', u.x, u.y, true);
          setTimeout(() => welle('vorn', u.x, u.y, true), 250);
          // hinten liegt im Chat ebenfalls fixed inset 0 -> gleiche Koordinaten.
          lockZiel = { x: u.x, y: u.y };
          lockUntil = Date.now() + 3000;
          for (const f of fische) f.v = 2.5;
        } else {
          engine.spawn({
            ebene: 'vorn', stil: FISCH,
            keyframes: [
              { transform: tr(u.x - 25, u.y, ' rotate(200deg)'), opacity: 0 },
              { transform: tr(u.x, u.y - 34, ' rotate(180deg)'), opacity: 1, offset: 0.5 },
              { transform: tr(u.x + 25, u.y, ' rotate(160deg)'), opacity: 0 }
            ],
            dauerMs: 900, easing: 'ease-in-out'
          });
          welle('vorn', u.x + 25, u.y, false);
        }
      },
      gast() {
        const { w, h } = engine.groesse('gast');
        const y = rnd(h * 0.3, h * 0.7);
        engine.spawn({
          ebene: 'gast', stil: { ...FISCH, width: '28px', height: '12px' },
          keyframes: [
            { transform: tr(-40, y, ' rotate(180deg)'), opacity: 0 },
            { opacity: 0.8, offset: 0.15 },
            { transform: tr(w * 0.5, y + rnd(-30, 30), ' rotate(175deg)'), opacity: 0.8, offset: 0.5 },
            { transform: tr(w + 40, y, ' rotate(185deg)'), opacity: 0 }
          ],
          dauerMs: 6000, easing: 'ease-in-out'
        });
      }
    };
  };
})();
```

- [ ] **Step 3: App-Pruefung** — wie Task 8 Step 3 mit `theme: 'koi'` (`koi-chat.png`, `koi-video.png`), dazu die Bewegungspruefung aus Task 9 Step 3 mit `theme: 'koi'`. Expected: `anzahl` ≥ 2, `bewegt: true`, Lotusbluete im Screenshot.

- [ ] **Step 4: Commit**

```bash
git add renderer/themes/koi
git commit -m "feat: Theme Koi-Teich

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Theme Seifenblasen

**Files:**
- Create: `renderer/themes/blasen/theme.css`
- Create: `renderer/themes/blasen/welt.js`

**Interfaces:**
- Consumes: Welt-Vertrag (Task 3), `engine.spawn`, `engine.entferne`, `engine.rechteck`
- Produces: `window.TwitchDualWelten.blasen`

- [ ] **Step 1: `theme.css`**

```css
/* Seifenblasen (hell): Himmelblau/Flieder, weiche Rundungen. */
:root[data-theme="blasen"] {
  --bg: rgb(240 247 255 / var(--chat-alpha, 1));
  --panel: rgb(232 236 255 / var(--chat-alpha, 1));
  --hover: rgb(222 228 255 / var(--chat-alpha, 1));
  --line: #d6dcff;
  --text: #3d3d6b;
  --muted: #7a7aa8;
  --ts: #a0a0c8;
  --accent: #7b6cff;
  --accent-title: #5a4adf;
  --accent-border: rgba(123, 108, 255, .4);
  --accent-glow: rgba(123, 108, 255, .18);
  --accent-dim: rgba(123, 108, 255, .3);
  --accent-contrast: #ffffff;
  --onair-from: #9ad0ff;
  --onair-to: #e0b0ff;
}
:root[data-theme="blasen"] .msg .user,
:root[data-theme="blasen"] #uc-name { color: color-mix(in srgb, var(--name, #bf94ff) 55%, #000); }
:root[data-theme="blasen"] #messages::-webkit-scrollbar-thumb { background: #c3cbff; }
:root[data-theme="blasen"] #emote-panel,
:root[data-theme="blasen"] #ac-bar { background: #f5f7ff; }
:root[data-theme="blasen"] #settings-pop,
:root[data-theme="blasen"] .galerie-karte,
:root[data-theme="blasen"] #composer { border-radius: 14px; }
```

- [ ] **Step 2: `welt.js`**

```js
// Seifenblasen: Blasen steigen schillernd auf. Klick auf eine Blase = sie
// platzt in Funken, Klick daneben = neue Blase. Punkte/Kiste = Blase mit "+N".
(function () {
  window.TwitchDualWelten = window.TwitchDualWelten || {};
  window.TwitchDualWelten.blasen = function ({ engine, FxEngine }) {
    const { tr, rnd } = FxEngine;
    const SCHILLER = 'radial-gradient(circle at 30% 30%, rgba(255,255,255,.95) 0 12%, transparent 13%), ' +
      'radial-gradient(circle, rgba(255,255,255,0) 55%, rgba(170,200,255,.55) 70%, rgba(255,170,230,.6) 85%, rgba(170,255,230,.5) 100%)';
    const FUNKEN = ['#b48bff', '#7ec8ff', '#ff9ad5', '#8affc8'];
    const blasen = new Set();

    function blase(ebene, x, yStart, yEnde, s, ms, text) {
      const sw = rnd(10, 25);
      const stil = { width: s + 'px', height: s + 'px', marginLeft: (-s / 2) + 'px', marginTop: (-s / 2) + 'px', borderRadius: '50%', background: SCHILLER };
      if (text) {
        stil.display = 'flex'; stil.alignItems = 'center'; stil.justifyContent = 'center';
        stil.font = '700 11px "Segoe UI", sans-serif'; stil.color = '#5a4adf';
      }
      const el = engine.spawn({
        ebene, inhalt: text || '', stil,
        keyframes: [
          { transform: tr(x, yStart) },
          { transform: tr(x + sw, yStart + (yEnde - yStart) * 0.33) },
          { transform: tr(x - sw, yStart + (yEnde - yStart) * 0.66) },
          { transform: tr(x + sw / 2, yEnde) }
        ],
        dauerMs: ms, easing: 'ease-in-out'
      });
      if (el && ebene === 'hinten') blasen.add(el);
      return el;
    }
    function platzen(el) {
      const ebene = engine.rechteck('hinten');
      const r = el.getBoundingClientRect();
      const cx = r.left - ebene.left + r.width / 2;
      const cy = r.top - ebene.top + r.height / 2;
      blasen.delete(el);
      engine.entferne(el);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const d = rnd(12, 22);
        engine.spawn({
          ebene: 'hinten',
          stil: { width: '4px', height: '4px', marginLeft: '-2px', marginTop: '-2px', borderRadius: '50%', background: FUNKEN[i % 4] },
          keyframes: [{ transform: tr(cx, cy), opacity: 1 }, { transform: tr(cx + Math.cos(a) * d, cy + Math.sin(a) * d), opacity: 0 }],
          dauerMs: 500, easing: 'ease-out'
        });
      }
    }

    return {
      start() {
        engine.intervall(() => {
          const { w, h } = engine.groesse('hinten');
          const s = rnd(10, 26);
          blase('hinten', rnd(0, w), h + s, -s - 5, s, rnd(5000, 8000));
          for (const el of blasen) if (!el.isConnected) blasen.delete(el);
        }, 700);
      },
      stop() { blasen.clear(); },
      klickInsLeere(x, y) {
        const ebene = engine.rechteck('hinten');
        let getroffen = false;
        for (const el of [...blasen]) {
          if (!el.isConnected) { blasen.delete(el); continue; }
          const r = el.getBoundingClientRect();
          const cx = r.left - ebene.left + r.width / 2;
          const cy = r.top - ebene.top + r.height / 2;
          if (Math.hypot(cx - x, cy - y) < r.width / 2 + 8) { platzen(el); getroffen = true; }
        }
        if (!getroffen) blase('hinten', x, y, -30, rnd(14, 22), rnd(1800, 2600));
      },
      ereignis(art, daten) {
        const u = daten.ursprung || { x: 0, y: 0 };
        const text = '+' + Number(daten.betrag || 0).toLocaleString('de-DE');
        if (art === 'kiste') {
          blase('vorn', u.x, u.y, u.y - rnd(260, 420), 44, 2800, text);
          for (let i = 0; i < 20; i++) {
            setTimeout(() => blase('vorn', u.x + rnd(-120, 40), u.y, u.y - rnd(150, 400), rnd(10, 22), rnd(1500, 2500)), i * 40);
          }
        } else {
          blase('vorn', u.x, u.y, u.y - rnd(80, 140), 34, 1600, text);
        }
      },
      gast() {
        const { w, h } = engine.groesse('gast');
        const y = rnd(h * 0.4, h * 0.9);
        engine.spawn({
          ebene: 'gast',
          stil: { width: '30px', height: '30px', marginLeft: '-15px', marginTop: '-15px', borderRadius: '50%', background: SCHILLER },
          keyframes: [
            { transform: tr(-30, y), opacity: 0 },
            { opacity: 0.85, offset: 0.15 },
            { transform: tr(w * 0.5, y - h * 0.3), opacity: 0.85, offset: 0.55 },
            { transform: tr(w + 30, y - h * 0.5), opacity: 0 }
          ],
          dauerMs: 6000, easing: 'ease-in-out'
        });
      }
    };
  };
})();
```

- [ ] **Step 3: App-Pruefung** — wie Task 8 Step 3 mit `theme: 'blasen'` (`blasen-chat.png`, `blasen-video.png`). Zusaetzlich Platzen pruefen:

```bash
node tools/cdp-eval.js chat "(window.twitchDual.saveThemePrefs({ theme: 'blasen' }), new Promise(r => setTimeout(() => { const b = [...document.querySelectorAll('#fx-hinten > div')].find(e => e.style.borderRadius === '50%'); const rr = b.getBoundingClientRect(); const vorher = document.querySelectorAll('#fx-hinten > div').length; document.getElementById('messages').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rr.left + rr.width / 2, clientY: rr.top + rr.height / 2 })); r({ vorher, gefunden: !!b }); }, 3000)))"
```

Expected: `gefunden: true`. (Der Klick zielt auf `#messages`, das ist kein Sperr-Element — `.msg` waere eines. Platzen sieht man im Screenshot nur kurz; massgeblich ist, dass kein Fehler im Diagnose-Protokoll steht.)

- [ ] **Step 4: Commit**

```bash
git add renderer/themes/blasen
git commit -m "feat: Theme Seifenblasen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Live-Abnahme, Doku, Aufraeumen

**Files:**
- Modify: `docs/TODO.md` (Abschnitt „Erledigt" + offene Wellen)

- [ ] **Step 1: Stufe `aus` — es laeuft nichts**

App starten, dann fuer jedes Theme:

```bash
for t in neon-dual sakura wald koi blasen; do node tools/cdp-eval.js chat "(window.twitchDual.saveThemePrefs({ theme: '$t', effekte: 'aus' }), new Promise(r => setTimeout(() => r({ theme: '$t', anim: document.getAnimations().filter(a => a.playState === 'running').length, hinten: document.getElementById('fx-hinten').childElementCount, vorn: document.getElementById('fx-vorn').childElementCount, welt: themeRuntime.weltAktiv }), 1500)))"; done
```

Expected je Theme: `anim: 0`, `hinten: 0`, `vorn: 0`, `welt: false`. Falls `anim > 0`: pruefen, ob es eine bestehende UI-Animation ist (z. B. On-Air-Puls, `rateHeat`) — die sind nicht Teil der Themes; dokumentieren, welche es ist (`document.getAnimations().map(a => a.animationName || a.id)`), und nur Theme-Animationen muessen 0 sein. Dasselbe im Video-Fenster mit `fx-hinten`/`fx-gast`.

Danach zurueck: `window.twitchDual.saveThemePrefs({ theme: 'neon-dual', effekte: 'normal' })`.

- [ ] **Step 2: Lesbarkeit helle Themes mit hellem Namen**

```bash
node tools/cdp-eval.js chat "(window.twitchDual.saveThemePrefs({ theme: 'sakura' }), new Promise(r => setTimeout(() => { const d = document.createElement('div'); d.className = 'msg'; const u = document.createElement('span'); u.className = 'user'; u.textContent = 'GelberName'; u.style.setProperty('--name', '#FFFF00'); d.appendChild(u); document.getElementById('messages').appendChild(d); r(getComputedStyle(u).color); }, 800)))" --png sakura-gelb.png
```

Expected: eine deutlich dunklere Farbe als `rgb(255, 255, 0)` (etwa `rgb(140, 140, 0)`); Screenshot: Name gut lesbar. Gleiches fuer `blasen`.

- [ ] **Step 3: Nur-Video-Modus ohne Effekte**

Mit laufendem Live-Kanal (z. B. einem, der laut `node -e` GQL-Check live ist):

```bash
node tools/cdp-eval.js video "(document.getElementById('video-only-btn').click(), themeRuntime.setzeGastBedingung(() => letzterGesendeterPlayerZustand === 'playing' && !document.body.classList.contains('video-only')), themeRuntime.gastJetzt(), { gast: document.getElementById('fx-gast').childElementCount, versteckt: getComputedStyle(document.getElementById('fx-gast')).display })"
```

Expected: `gast: 0`, `versteckt: "none"`. Danach `document.getElementById('video-exit').click()`.

- [ ] **Step 4: Klicks gehen nie verloren**

Im Theme `blasen`, Effekte `viel`: per CDP auf `#chat-send`, `#settings-btn`, ein `.msg .user` und `#home-btn` (Video) klicken und pruefen, dass jeweils die normale Reaktion kommt (Popup oeffnet, User-Karte oeffnet, Home oeffnet):

```bash
node tools/cdp-eval.js chat "(window.twitchDual.saveThemePrefs({ theme: 'blasen', effekte: 'viel' }), new Promise(r => setTimeout(() => { document.getElementById('settings-btn').click(); const pop = !document.getElementById('settings-pop').classList.contains('hidden'); document.getElementById('settings-btn').click(); r({ popupOeffnet: pop, ebeneKlickbar: getComputedStyle(document.getElementById('fx-vorn')).pointerEvents }); }, 1500)))"
```

Expected: `popupOeffnet: true`, `ebeneKlickbar: "none"`.

- [ ] **Step 5: Diagnose-Protokoll pruefen**

Run: `grep "theme:" "$APPDATA/twitchdual/diagnose.log" | tail -20`
Expected: keine `welt-fehler`/`css-fehler`-Zeilen aus den Abnahme-Laeufen (aeltere aus Task 4 vor Task 7 sind erwartbar).

- [ ] **Step 6: `docs/TODO.md` ergaenzen**

Im Abschnitt „Erledigt" anhaengen:

```markdown
**Lebendige Themes, Welle 1 (unveroeffentlicht, Branch feat/sammel-verbesserungen)**
- Theme-System: `renderer/lib/{themes,fx-engine,theme-runtime}.js`, je Theme ein
  Ordner `renderer/themes/<id>/` (theme.css + welt.js). Galerie aus dem ⚙-Popup,
  Effekte-Regler Aus/Wenig/Normal/Viel (Aus = es laeuft nichts).
- Welle 1: Sakura, Wald, Koi-Teich, Seifenblasen + Neon-Dual-Funkenregen.
  Kiste/Punkte loesen Effekte am Punkte-Chip aus, Gastauftritte uebers Video.
- Spec/Plan: `docs/superpowers/{specs,plans}/2026-10-07-lebendige-themes*.md`.
```

Und einen neuen offenen Punkt:

```markdown
## Offen: Themes Welle 2/3
Frost, Terminal, Paper, Tiefsee, Game Boy, Windows 98, Holo, Matrix,
Regenfenster (Abstimmung 2026-10-07). Je Theme: Ordner + Eintrag in
`renderer/lib/themes.js` (THEMES) + Test-Liste in `test/themes.test.js`.
Raid-/Abo-Ereignisse folgen mit dem Feature "Abos/Raids im Chat".
```

- [ ] **Step 7: Suite + Commit**

Run: `npm test` → alle PASS.

```bash
git add docs/TODO.md
git commit -m "docs: Lebendige Themes Welle 1 in TODO eingetragen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Kein Versions-Bump, kein Release (Janis buendelt Releases).
