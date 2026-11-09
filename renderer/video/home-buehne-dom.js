// Darstellung der Home-Buehne (Runde 2): echte CD-Huelle mit Booklet-Cover,
// CD mit Profilbild-Label (Flip), VOD-Inlay auf der Rueckseite, CD-Staender
// unten, Laufwerk beim Abspielen. Nur DOM, keine Steuerung: Zustand und
// Klick-Folgen kommen von home.js (Handler-Objekt h).
// IIFE: setzt nur window.HomeBuehneDom (gemeinsamer globaler Bereich mit
// video.js/home.js). Spec: docs/superpowers/specs/2026-11-09-home-cd-v2-design.md

window.HomeBuehneDom = (function () {
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  // Handler nur rufen, wenn vorhanden (Pruefaufrufe geben {} mit).
  function ruf(h, name) {
    const args = Array.prototype.slice.call(arguments, 2);
    if (h && typeof h[name] === 'function') h[name].apply(null, args);
  }

  // Knopf, dessen Klick nicht zum Cover/Album darunter durchgeht.
  function knopf(cls, text, title, beiKlick) {
    const b = el('button', cls, text);
    b.type = 'button';
    if (title) b.title = title;
    b.addEventListener('click', (e) => { e.stopPropagation(); beiKlick(); });
    return b;
  }

  function name(k) { return k.displayName || k.login; }

  function nameMitHaken(k, cls) {
    const s = el('span', cls, name(k));
    if (k.verifiziert) {
      const h = el('span', 'haken', '✓');
      h.title = 'Verifiziert';
      s.appendChild(h);
    }
    return s;
  }

  // Bild mit Rueckfall-Kette; ohne ladbares Bild bleibt die Theme-Farbe.
  function bild(urls, cls) {
    const liste = urls.filter(Boolean);
    if (!liste.length) return null;
    const img = el('img', cls);
    img.alt = '';
    img.decoding = 'async';
    let i = 0;
    img.onerror = () => {
      i += 1;
      if (i < liste.length) img.src = liste[i];
      else img.remove();
    };
    img.src = liste[0];
    return img;
  }

  // Teil von #cd-info finden oder anlegen.
  function infoTeil(cls) {
    const info = document.getElementById('cd-info');
    let t = info.querySelector(':scope > .' + cls);
    if (!t) { t = el('div', cls); info.appendChild(t); }
    return t;
  }

  function punkteSymbol(symbol) {
    if (symbol && symbol.art === 'url' && symbol.url) {
      const img = el('img');
      img.alt = '';
      img.src = symbol.url;
      return img;
    }
    // Wie im Chat: zwei Kreise in currentColor, kein Netzbild.
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    const ring = document.createElementNS(ns, 'circle');
    ring.setAttribute('cx', '8'); ring.setAttribute('cy', '8'); ring.setAttribute('r', '6.6');
    ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', 'currentColor'); ring.setAttribute('stroke-width', '1.6');
    const kern = document.createElementNS(ns, 'circle');
    kern.setAttribute('cx', '8'); kern.setAttribute('cy', '8'); kern.setAttribute('r', '2.6');
    kern.setAttribute('fill', 'currentColor');
    svg.append(ring, kern);
    return svg;
  }

  // --- Vorderseite: Booklet hinter Plastik -----------------------------------
  // Einmal je CD (Modus + Login) aufbauen; Knoepfe lesen Kanal und Handler aus
  // cd, damit ein Neuzeichnen sie nur aktualisiert (kein Blinken, Fokus bleibt).
  function baueFront(front, k, modus) {
    const live = modus === 'live';
    const cd = { schluessel: modus + '|' + k.login, k, h: null, vorschau: null, vorschauImg: null, sticker: null };
    const cover = el('div', 'cd-cover');
    // Booklet: Profilbild als Foto, Spiel klein ueber dem Namen.
    const foto = bild([k.avatar], 'cd-foto');
    if (foto) cover.appendChild(foto);
    cover.appendChild(el('div', 'cd-cover-verlauf'));
    const schrift = el('div', 'cd-cover-schrift');
    cd.untertitel = el('div', 'cd-cover-u', '');
    cd.titel = el('div', 'cd-cover-t', name(k));
    schrift.append(cd.untertitel, cd.titel);
    cover.appendChild(schrift);
    // Hover: Stream-Vorschau 16:9 ganz (nicht zugeschnitten) ueber dem Booklet.
    if (modus !== 'offline') {
      cd.vorschauBox = el('div', 'cd-vorschau');
      cover.appendChild(cd.vorschauBox);
    }
    if (live) {
      cover.title = 'Klick: einlegen & abspielen';
      cover.addEventListener('click', () => ruf(cd.h, 'laden', cd.k.login));
    }
    front.appendChild(cover);
    cd.cover = cover;

    if (modus !== 'offline') {
      const play = knopf('cd-play', '▶', live ? 'Einlegen & abspielen' : 'Gerade offline', () => ruf(cd.h, 'laden', cd.k.login));
      play.disabled = !live;
      front.appendChild(play);
    }
    front.appendChild(knopf('cd-vods', 'VODs', 'VODs ansehen', () => ruf(cd.h, 'vods', cd.k)));
    cd.stern = knopf('cd-stern stern', '☆', '', () => ruf(cd.h, 'stern', cd.k));
    front.appendChild(cd.stern);
    return cd;
  }

  // Vorschau erst einsetzen, wenn sie geladen ist (kein leeres Bild beim Hover).
  function neueVorschau(cd, url) {
    if (!cd.vorschauBox || !url || url === cd.vorschau) return;
    cd.vorschau = url;
    const probe = new Image();
    probe.onload = () => {
      if (cd.vorschau !== url || !cd.cover.isConnected) return;
      if (!cd.vorschauImg) {
        cd.vorschauImg = el('img');
        cd.vorschauImg.alt = '';
        cd.vorschauBox.appendChild(cd.vorschauImg);
      }
      cd.vorschauImg.src = url;
    };
    probe.src = url;
  }

  // CD-Label: Profilbild der CD vorne; bei neuem Kanal flippt die CD einmal
  // von der Silberseite auf die Label-Seite.
  let labelLogin = null;
  function zeichneLabel(k, modus) {
    const huelle = document.getElementById('cd-huelle');
    const box = huelle.querySelector('.cd-label-bild');
    const login = k ? k.login : null;
    if (login === labelLogin) return;
    labelLogin = login;
    box.replaceChildren();
    if (k) {
      const img = bild([k.avatar]);
      if (img) box.appendChild(img);
    }
    const flip = huelle.querySelector('.cd-flip');
    flip.classList.remove('flippt');
    if (k && modus !== 'offline') {
      void flip.offsetWidth; // Animation neu starten
      flip.classList.add('flippt');
    }
  }

  function zeichneFront(front, stand, h) {
    const k = stand.kanal;
    const modus = stand.modus;
    if (!k) {
      front.replaceChildren();
      front._cd = null;
      if (stand.leerText) front.appendChild(el('div', 'cd-leer', stand.leerText));
      return;
    }
    let cd = front._cd;
    if (!cd || cd.schluessel !== modus + '|' + k.login) {
      front.replaceChildren();
      cd = front._cd = baueFront(front, k, modus);
    }
    cd.k = k;
    cd.h = h;
    cd.titel.textContent = name(k);
    cd.untertitel.textContent = modus === 'offline' ? 'offline' : (k.game || '');
    cd.stern.className = 'cd-stern stern' + (k.favorit ? ' an' : '');
    cd.stern.textContent = k.favorit ? '★' : '☆';
    cd.stern.title = k.favorit ? 'Aus Favoriten entfernen' : 'Zu Favoriten';
    if (modus !== 'offline') neueVorschau(cd, HomeBuehne.vorschauUrl(k.login, Date.now()));

    if (cd.sticker) { cd.sticker.remove(); cd.sticker = null; }
    if (stand.punkte && modus !== 'offline') {
      const st = el('div', 'cd-sticker');
      st.title = 'Kanalpunkte';
      st.appendChild(punkteSymbol(stand.punkte.symbol));
      st.appendChild(el('span', 'cd-sticker-zahl', Number(stand.punkte.balance || 0).toLocaleString('de-DE')));
      front.appendChild(st);
      cd.sticker = st;
    }
  }

  // --- Rueckseite: gedrucktes Inlay mit 2x2 VODs ------------------------------
  // Nur neu bauen, wenn sich Kanal, Status, Seite oder VODs aendern; danach
  // Fokus per data-id wiederherstellen.
  const JE_SEITE = 4;
  function zeichneRueck(rueck, stand, h) {
    const k = stand.kanal;
    const r = stand.rueckseite;
    rueck._h = h;
    rueck._k = k;
    const seite = r && r.seite ? r.seite : 0;
    const schluessel = k && r
      ? [k.login, name(k), r.status, seite, (r.vods || []).map((v) => v.id).join(',')].join('|')
      : null;
    if (rueck._schluessel === schluessel) return;
    rueck._schluessel = schluessel;
    const fokus = merkeFokus(rueck, 'id');
    rueck.replaceChildren();
    if (!k || !r) return;
    const kopf = el('div', 'inlay-kopf');
    const titelBox = el('div', 'inlay-titelbox');
    titelBox.append(el('div', 'inlay-u', name(k) + ' · VODs'), el('div', 'inlay-t', 'Die letzten Streams'));
    kopf.appendChild(titelBox);
    const zu = knopf('inlay-knopf', '↩', 'Zurueckdrehen', () => ruf(rueck._h, 'rueckseiteZu'));
    zu.dataset.id = 'zu';
    kopf.appendChild(zu);
    rueck.appendChild(kopf);

    const status = { laden: 'lade VODs …', leer: 'Keine VODs', fehler: 'VODs nicht abrufbar' }[r.status];
    if (status) {
      rueck.appendChild(el('div', 'inlay-status', status));
      stelleFokusHer(rueck, 'id', fokus);
      return;
    }
    const alle = r.vods || [];
    const seiten = Math.max(1, Math.ceil(alle.length / JE_SEITE));
    const s = Math.min(seite, seiten - 1);
    const raster = el('div', 'inlay-raster');
    alle.slice(s * JE_SEITE, s * JE_SEITE + JE_SEITE).forEach((v, i) => {
      const b = knopf('inlay-vod', null, v.title, () => ruf(rueck._h, 'vod', v.id));
      b.dataset.id = 'vod-' + v.id;
      const bildBox = el('div', 'inlay-bild');
      const img = bild([v.thumb]);
      if (img) bildBox.appendChild(img);
      if (v.lengthLabel) bildBox.appendChild(el('span', 'inlay-laenge', v.lengthLabel));
      const titel = el('div', 'inlay-vtitel');
      titel.append(el('span', 'inlay-nr', String(s * JE_SEITE + i + 1).padStart(2, '0')), document.createTextNode(' ' + (v.title || '')));
      const meta = [v.publishedLabel, v.viewsLabel ? v.viewsLabel + ' Aufrufe' : ''].filter(Boolean).join(' · ');
      b.append(bildBox, titel, el('div', 'inlay-meta', meta));
      raster.appendChild(b);
    });
    rueck.appendChild(raster);
    const fuss = el('div', 'inlay-fuss');
    if (seiten > 1) {
      const zurueck = knopf('inlay-knopf', '‹', 'Neuere', () => ruf(rueck._h, 'vodSeite', -1));
      zurueck.dataset.id = 'zurueck';
      zurueck.disabled = s === 0;
      const vor = knopf('inlay-knopf', '›', 'Aeltere', () => ruf(rueck._h, 'vodSeite', 1));
      vor.dataset.id = 'vor';
      vor.disabled = s >= seiten - 1;
      fuss.append(zurueck, el('span', 'inlay-seite', (s + 1) + ' / ' + seiten), vor);
    }
    if (r.mehr) {
      const mehr = knopf('inlay-knopf inlay-alle', 'Alle VODs', 'Alle VODs in der Liste', () => ruf(rueck._h, 'mehr', rueck._k));
      mehr.dataset.id = 'mehr';
      fuss.appendChild(mehr);
    }
    if (fuss.children.length) rueck.appendChild(fuss);
    stelleFokusHer(rueck, 'id', fokus);
  }

  // --- Info-Block rechts --------------------------------------------------------
  function zeichneInfo(stand, h) {
    const t = infoTeil('cd-text');
    t.replaceChildren();
    const k = stand.kanal;
    if (!k) return;
    const status = el('div', 'cd-status');
    if (stand.modus === 'live') {
      const teile = ['● LIVE', k.viewersLabel ? k.viewersLabel + ' Zuschauer' : '', StreamInfo.laufzeit(k.start, Date.now())].filter(Boolean);
      status.textContent = teile.join(' · ');
    } else if (stand.modus === 'markiert') {
      status.textContent = 'gerade offline gegangen';
    } else {
      status.textContent = k.error ? 'Status nicht abrufbar' : 'offline';
    }
    t.appendChild(status);
    t.appendChild(nameMitHaken(k, 'cd-name'));
    if (stand.modus !== 'offline' && k.title) t.appendChild(el('div', 'cd-titel', k.title));
    if (stand.modus !== 'offline' && k.game) t.appendChild(el('div', 'cd-meta', k.game));
    if (stand.modus === 'live') {
      t.appendChild(knopf('cd-einlegen', '▶ Einlegen & abspielen', 'Stream laden', () => ruf(h, 'laden', k.login)));
    }
  }

  function zeichneBuehne(stand, h) {
    const s = stand || {};
    const huelle = document.getElementById('cd-huelle');
    const front = huelle.querySelector('.cd-front');
    const rueck = huelle.querySelector('.cd-rueck');
    const k = s.kanal || null;
    huelle.classList.toggle('ladend', !!s.ladend);
    huelle.classList.toggle('leer', !k);
    huelle.classList.toggle('steht', !!k && s.modus === 'markiert');
    huelle.classList.toggle('offline', !!k && s.modus === 'offline');
    huelle.classList.toggle('gedreht', !!k && !!s.rueckseite);
    document.getElementById('home-buehne').classList.toggle('vods-offen', !!k && !!s.rueckseite);
    zeichneFront(front, s, h);
    zeichneRueck(rueck, s, h);
    zeichneLabel(k, s.modus);
    zeichneInfo(s, h);
  }

  // Fokus vor einem Neubau merken: Wert von data-<feld> am fokussierten
  // Element (oder seinem Vorfahren in box) und ob es der Knopf darin war.
  function merkeFokus(box, feld) {
    const a = document.activeElement;
    if (!a || !box.contains(a)) return null;
    const traeger = a.closest('[data-' + feld + ']');
    if (!traeger || !box.contains(traeger)) return null;
    return { wert: traeger.dataset[feld], selbst: traeger === a };
  }
  function stelleFokusHer(box, feld, f) {
    if (!f) return;
    const t = box.querySelector('[data-' + feld + '="' + CSS.escape(f.wert) + '"]');
    if (!t) return;
    const ziel = f.selbst ? t : (t.querySelector('button') || t);
    ziel.focus({ preventScroll: true });
  }

  // --- CD-Staender unten ------------------------------------------------------
  // Alle Alben schraeg nebeneinander; nur neu bauen, wenn sich der Inhalt
  // aendert. Die Auswahl wird per Klasse markiert und in Sicht gescrollt.
  function zeichneStaender(eintraege, gewaehlt, h) {
    const box = document.getElementById('home-staender');
    const liste = eintraege || [];
    box._h = h;
    box._kanal = new Map(liste.map((e) => [e.art + '|' + e.kanal.login, e.kanal]));
    const schluessel = liste.map((e) => [e.art, e.kanal.login, name(e.kanal), e.kanal.avatar || '',
      e.kanal.favorit ? 1 : 0, e.kanal.verifiziert ? 1 : 0, e.kanal.live ? 1 : 0].join('|')).join('\n');
    if (box._schluessel !== schluessel) {
      box._schluessel = schluessel;
      const fokus = merkeFokus(box, 'login');
      box.replaceChildren();
      let vorher = null;
      liste.forEach((e) => {
        const k = e.kanal;
        if (vorher === 'live' && e.art !== 'live') box.appendChild(el('div', 'staender-luecke'));
        vorher = e.art;
        const jetzt = () => box._kanal.get(e.art + '|' + k.login) || k;
        const a = el('div', 'album album-' + e.art + (k.live ? ' ist-live' : ''));
        a.tabIndex = 0;
        a.setAttribute('role', 'button');
        a.title = name(k) + (k.live ? (k.game ? ' · ' + k.game : '') : ' · offline');
        a.dataset.login = k.login;
        a.dataset.art = e.art;
        const waehle = () => ruf(box._h, 'waehle', jetzt(), e.art);
        a.addEventListener('click', waehle);
        a.addEventListener('keydown', (ev) => {
          if (ev.target !== a || (ev.key !== 'Enter' && ev.key !== ' ')) return;
          ev.preventDefault();
          ev.stopPropagation(); // Leertaste nicht als Play/Pause im Video-Fenster
          waehle();
        });
        const foto = bild([k.avatar], 'album-foto');
        if (foto) a.appendChild(foto);
        a.appendChild(el('div', 'album-verlauf'));
        a.appendChild(nameMitHaken(k, 'album-name'));
        if (k.live) a.appendChild(el('span', 'album-punkt'));
        const stern = knopf('album-stern stern' + (k.favorit ? ' an' : ''), k.favorit ? '★' : '☆',
          k.favorit ? 'Aus Favoriten entfernen' : 'Zu Favoriten', () => ruf(box._h, 'stern', jetzt()));
        a.appendChild(stern);
        box.appendChild(a);
      });
      stelleFokusHer(box, 'login', fokus);
    }
    let wahl = null;
    box.querySelectorAll('.album').forEach((a) => {
      const an = a.dataset.login === gewaehlt;
      a.classList.toggle('gewaehlt', an);
      if (an) wahl = a;
    });
    if (wahl && wahl !== box._wahl) {
      box._wahl = wahl;
      wahl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }

  // --- CD-Wechsel: Schlitten faehrt rein, Inhalt tauscht, faehrt raus ----------
  let reinTimer = null;
  let rausTimer = null;
  function cdWechsel(tausche) {
    // Alter Punkte-Sticker sofort weg; der neue kommt erst nach dem Tausch.
    const front = document.querySelector('#cd-huelle .cd-front');
    if (front && front._cd && front._cd.sticker) { front._cd.sticker.remove(); front._cd.sticker = null; }
    if (reinTimer !== null) return;
    const s = document.querySelector('#cd-huelle .cd-schlitten');
    clearTimeout(rausTimer);
    rausTimer = null;
    s.classList.remove('raus');
    s.classList.add('rein');
    reinTimer = setTimeout(() => {
      reinTimer = null;
      try { tausche(); } finally {
        s.classList.remove('rein');
        s.classList.add('raus');
        rausTimer = setTimeout(() => { rausTimer = null; s.classList.remove('raus'); }, 220);
      }
    }, 180);
  }
  function cdWechselLaeuft() { return reinTimer !== null; }

  // --- Laufwerk beim Abspielen (PC-Schublade + Terminal) ------------------------
  // Zeitplan in CSS (.laeuft, ~1,5 s); hier nur Inhalt setzen und ein-/ausblenden.
  function zeigeLaufwerk(k) {
    const lw = document.getElementById('cd-laufwerk');
    lw.replaceChildren();
    const geraet = el('div', 'lw-geraet');
    geraet.appendChild(el('span', 'lw-led'));
    const lade = el('div', 'lw-lade');
    const cd = el('div', 'lw-cd');
    const label = el('div', 'lw-cd-label');
    const img = k ? bild([k.avatar]) : null;
    if (img) label.appendChild(img);
    cd.appendChild(label);
    lade.appendChild(cd);
    const term = el('div', 'lw-terminal');
    const datei = String((k && k.login) || 'disc').toUpperCase() + '.ISO';
    term.append(el('div', 'lw-zeile', 'Lese Disc …'), el('div', 'lw-zeile lw-datei', datei));
    const balken = el('div', 'lw-balken');
    balken.appendChild(el('div', 'lw-fuellung'));
    term.appendChild(balken);
    lw.append(lade, geraet, term);
    lw.classList.remove('hidden', 'laeuft');
    void lw.offsetWidth; // Animation neu starten
    lw.classList.add('laeuft');
  }
  function versteckeLaufwerk() {
    const lw = document.getElementById('cd-laufwerk');
    lw.classList.add('hidden');
    lw.classList.remove('laeuft');
    lw.replaceChildren();
  }

  // --- Riesen-Namen hinter der Buehne --------------------------------------
  // #home-namen hat 6 Zeilen; Zeile 3 ist die Mittelzeile (Name der CD vorne),
  // per CSS direkt hinter die CD gesetzt (Hoehe aus --mitte-y, setzt home.js).
  const MITTE = 3;
  function namenZeilen() {
    const box = document.getElementById('home-namen');
    if (box.children.length !== 6) {
      box.replaceChildren();
      for (let z = 1; z <= 6; z++) {
        box.appendChild(el('div', 'namen-zeile' + (z === MITTE ? ' namen-mitte' : '')));
      }
    }
    return box.children;
  }

  // Laufzeilen 1,2,4,5,6: zwei gleiche Haelften, das Band laeuft um -50% und
  // setzt nahtlos an. Jede Haelfte wiederholt den Inhalt, bis sie mindestens
  // so breit ist wie der Bildschirm. Einmal messen beim Bauen, nie pro Bild.
  const MAX_WIEDERHOLUNG = 50;
  function haelfte(inhalt, mal) {
    const h = el('div', 'namen-haelfte');
    for (let i = 0; i < mal; i++) {
      inhalt.forEach((n) => h.appendChild(el('span', n.live ? 'live' : 'offline', n.name)));
    }
    return h;
  }
  function zeichneNamen(auswahl) {
    const zeilen = namenZeilen();
    const breite = Math.max(document.getElementById('home-namen').clientWidth, screen.availWidth || 0);
    for (let z = 1; z <= 6; z++) {
      if (z === MITTE) continue;
      const band = el('div', 'namen-band');
      const inhalt = HomeBuehne.zeilenInhalt(auswahl || [], z);
      zeilen[z - 1].replaceChildren(band);
      if (!inhalt.length) continue; // leere Auswahl -> leeres Band
      const probe = haelfte(inhalt, 1);
      band.appendChild(probe);
      const w = probe.offsetWidth;
      const zeichen = inhalt.reduce((s, n) => s + String(n.name).length + 1, 0);
      const mal = w > 0 && breite > 0 ? Math.ceil(breite / w) : Math.ceil(120 / Math.max(1, zeichen));
      const k = Math.min(MAX_WIEDERHOLUNG, Math.max(1, mal));
      band.replaceChildren(haelfte(inhalt, k), haelfte(inhalt, k));
    }
  }

  // Mittelzeile: gleicher Name -> nichts tun, sonst neuer Text blendet ein.
  let mitteName;
  function zeichneMitte(neu) {
    const n = neu || null;
    if (n === mitteName) return;
    mitteName = n;
    const zeile = namenZeilen()[MITTE - 1];
    zeile.replaceChildren();
    if (n) zeile.appendChild(el('span', 'namen-mitte-text', n));
  }

  return {
    zeichneBuehne, zeichneStaender, cdWechsel, cdWechselLaeuft,
    zeigeLaufwerk, versteckeLaufwerk, zeichneNamen, zeichneMitte,
  };
})();
