// Kanalpunkte-Effekte in der unteren Leiste, fuer ALLE Themes gleich:
// Kiste = kleine Kiste springt neben dem Punkte-Chip hoch und geht auf,
// Teilchen fliegen raus; Punkte = Chip pulsiert, Funken steigen.
// Zwei Kisten-Stile (Wahl im ⚙, chatPrefs.kisteStil): Geschenk in
// Akzentfarbe mit Konfetti, Pixel-Kiste mit goldenen Pixeln.
// Farben ueber Theme-Variablen (chat.css), Animation nur per CSS.
// UMD wie die anderen Libs; DOM kommt von aussen (doc + Wirt-Element).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KistenFx = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const KISTE_MS = 2600;
  const PUNKTE_MS = 1300;
  const STILE = ['geschenk', 'pixel'];
  const STANDARD_STIL = 'geschenk';
  // Teilchen starten, wenn der Deckel aufgeht (Keyframes in chat.css).
  const AUF_MS = 900;

  const GESCHENK_SVG =
    '<svg class="kfx-svg" viewBox="0 0 24 22" aria-hidden="true">' +
      '<ellipse cx="12" cy="21" rx="9" ry="1.3" class="kfx-schatten"/>' +
      '<rect x="3.5" y="9" width="17" height="11.5" rx="1.5" class="kfx-paket"/>' +
      '<rect x="10.5" y="9" width="3" height="11.5" class="kfx-schleife"/>' +
      '<rect x="3.5" y="9" width="17" height="3" class="kfx-falz"/>' +
      '<g class="kfx-deckel">' +
        '<rect x="2.5" y="6" width="19" height="3.6" rx="1.2" class="kfx-paket"/>' +
        '<rect x="10.5" y="6" width="3" height="3.6" class="kfx-schleife"/>' +
        '<path d="M12 6 C9 2 6 2.5 7 4.5 C7.6 5.6 10 6 12 6 Z" class="kfx-masche"/>' +
        '<path d="M12 6 C15 2 18 2.5 17 4.5 C16.4 5.6 14 6 12 6 Z" class="kfx-masche"/>' +
        '<circle cx="12" cy="5.8" r="1.2" class="kfx-knoten"/>' +
      '</g>' +
    '</svg>';

  // Pixel-Kiste 12x10, je Zeichen eine Farbe; zu/auf als zwei Bilder.
  const PIXEL_FARBE = { k: '#3a2010', h: '#9a5b2e', l: '#c27a3e', g: '#ffd23a', d: '#6a3a18', i: '#2a1408', y: '#fff2a0' };
  const PIXEL_ZU = [
    '..kkkkkkkk..', '.kllllllllk.', 'kllllllllllk', 'kggggggggggk', 'khhhhgghhhhk',
    'khhhgkkghhhk', 'khhhhgghhhhk', 'kddddddddddk', 'khhhhhhhhhhk', 'kkkkkkkkkkkk'];
  const PIXEL_AUF = [
    '.kkkkkkkkkk.', 'kllllllllllk', 'kggggggggggk', 'kiyyyyyyyyik', 'kggggggggggk',
    'khhhhgghhhhk', 'khhhgkkghhhk', 'kddddddddddk', 'khhhhhhhhhhk', 'kkkkkkkkkkkk'];
  function pixelBild(karte, klasse) {
    let s = '<g class="' + klasse + '">';
    for (let y = 0; y < karte.length; y++) {
      for (let x = 0; x < 12; x++) {
        const f = PIXEL_FARBE[karte[y][x]];
        if (f) s += '<rect x="' + (x * 2) + '" y="' + (y * 2 + 1) + '" width="2" height="2" fill="' + f + '"/>';
      }
    }
    return s + '</g>';
  }
  const PIXEL_SVG = '<svg class="kfx-svg kfx-pixel" viewBox="0 0 24 22" aria-hidden="true">' +
    pixelBild(PIXEL_ZU, 'kfx-zu') + pixelBild(PIXEL_AUF, 'kfx-auf') + '</svg>';

  function cleanStil(s) { return STILE.includes(s) ? s : STANDARD_STIL; }

  // n Teilchen mit zufaelliger Flugbahn (CSS-Variablen --dx/--dy/--verz).
  function teilchen(doc, klasse, n, breite, hoehe, verzMs) {
    const aus = [];
    for (let i = 0; i < n; i++) {
      const t = doc.createElement('span');
      t.className = klasse;
      t.style.setProperty('--dx', Math.round((Math.random() - 0.5) * breite) + 'px');
      t.style.setProperty('--dy', -Math.round(hoehe * (0.6 + Math.random() * 0.4)) + 'px');
      t.style.setProperty('--verz', Math.round(verzMs + Math.random() * 150) + 'ms');
      aus.push(t);
    }
    return aus;
  }

  function spieleKiste({ doc, wirt, stil, setTimeout: st }) {
    const warte = st || setTimeout;
    const s = cleanStil(stil);
    const el = doc.createElement('span');
    el.className = 'kfx-kiste kfx-' + s;
    el.innerHTML = s === 'pixel' ? PIXEL_SVG : GESCHENK_SVG;   // statisches Markup
    const art = s === 'pixel' ? 'kfx-pix' : 'kfx-konfetti';
    for (const t of teilchen(doc, art, s === 'pixel' ? 6 : 8, 44, 40, AUF_MS)) el.appendChild(t);
    wirt.appendChild(el);
    warte(() => el.remove(), KISTE_MS);
    return el;
  }

  function spielePunkte({ doc, wirt, chip, setTimeout: st }) {
    const warte = st || setTimeout;
    if (chip) {
      chip.classList.remove('kfx-puls');
      void chip.offsetWidth;   // Reflow, sonst startet die Animation nicht neu
      chip.classList.add('kfx-puls');
    }
    const box = doc.createElement('span');
    box.className = 'kfx-punkte';
    for (const t of teilchen(doc, 'kfx-funke', 4, 30, 30, 0)) box.appendChild(t);
    wirt.appendChild(box);
    warte(() => box.remove(), PUNKTE_MS);
    return box;
  }

  return { spieleKiste, spielePunkte, cleanStil, STILE, STANDARD_STIL, KISTE_MS, PUNKTE_MS };
});
