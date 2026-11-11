// Darstellung von Home als Cozy-Raum (Etappe 2): isometrischer Pixel-Raum als
// Hauptmenue und Regal-Ansicht mit Schallplatten. Nur DOM, keine Steuerung:
// Zustand und Klick-Folgen kommen von home.js (Handler-Objekte, init-Optionen).
// Geometrie (Bildpixel, Faktor, Treffer, Fach-Fenster) steht in lib/raum.js.
// Bild- und Textschicht: Bilder, Huellen und Zettel liegen in einer Ebene mit
// translate+scale (Bildkoordinaten), Text darueber unskaliert, damit er lesbar
// bleibt (Lage = Bildkoordinaten x Faktor ueber CSS-Variablen).
// IIFE: setzt nur window.HomeRaumDom. Plan: docs/superpowers/plans/2026-11-10-cozy-raum-etappe-2.md
// Es werden keine Grafiken gezeichnet, nur vorhandene Bilder platziert
// (Ausnahme: Hover-Winkel und Text).

window.HomeRaumDom = (function () {
  // Lage des Profilbild-Fensters in huelle.png (einzige Stelle; das Bild kann
  // noch getauscht werden).
  const HUELLE_FENSTER = { x: 2, y: 2, b: 36, h: 36 };
  // Vordere Platte im Buecherfach (Raum.FACH.vorn), Bildpixel.
  const VORN_HUELLE = { x: 118, y: 144, b: 40, h: 40 };
  const VORN_PLATTE = { x: 118 + 18, y: 146, b: 36, h: 36 };
  const VORN_ZETTEL = { x: 178, y: 140, b: 111, h: 48 };
  // Such-Zettel oben am Regal, ueber dem obersten Brett.
  const SUCH_ZETTEL = { x: 140, y: 0, b: 120, h: 18 };
  const ZETTEL_RAND = 6; // 9-Slice-Rand von zettel.png/schild.png in Bildpixeln
  // VOD-Rueckseite: 2x2 Bilder je 64x18 im Buecherfach.
  const JE_SEITE = 4;
  const VOD_PLAETZE = [{ x: 20, y: 6 }, { x: 90, y: 6 }, { x: 20, y: 28 }, { x: 90, y: 28 }];
  const SCHILD_MS = 2000;
  const TAFEL_TITEL = { konto: 'Konto', licht: 'Licht', vods: 'Alle VODs' };
  // Auflegen: Dauer je Abschnitt (gleich den Uebergaengen in home-raum.css).
  const ABLAUF_MS = { raum: 500, platte: 1500, zoom: 2500 };
  const FLUG_KANTE = 12; // platte-klein.png

  let wirt = null;
  let opt = {};
  let skal = { faktor: 1, links: 0, oben: 0 };
  let aktuell = 'raum';
  let tvVorschau = null;
  let tvLogin = null; // Kanal des Bildes auf dem Fernseher
  let schildTimer = null;
  let ablaufRuf = null;
  let ablaufTimer = [];
  let tvNr = 0; // verwirft verspaetete Vorschau-Bilder
  let tvMaske = null;
  let tafelLeihe = []; // umgehaengte Elemente: { el, eltern, danach }
  const t = {}; // DOM-Teile
  const faecher = {
    live: { start: 0, anzahl: 0, gewaehlt: null },
    offline: { start: 0, anzahl: 0, gewaehlt: null },
  };

  // --- Helfer -------------------------------------------------------------------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function bildEl(datei, cls) {
    const i = el('img', cls);
    i.alt = '';
    i.draggable = false;
    i.src = datei;
    return i;
  }
  // Handler nur rufen, wenn vorhanden (Pruefaufrufe geben {} mit).
  function ruf(h, name) {
    const args = Array.prototype.slice.call(arguments, 2);
    if (h && typeof h[name] === 'function') h[name].apply(null, args);
  }
  function knopf(cls, text, title, beiKlick) {
    const b = el('button', cls, text);
    b.type = 'button';
    if (title) b.title = title;
    b.addEventListener('click', (e) => { e.stopPropagation(); beiKlick(); });
    return b;
  }
  function name(k) { return k.displayName || k.login; }
  function aus(e, an) { e.classList.toggle('raum-aus', !!an); }

  // Bildebene: Lage in Bildpixeln (skaliert mit der Ebene).
  function lage(e, r) {
    e.style.left = r.x + 'px';
    e.style.top = r.y + 'px';
    if (r.b !== undefined) e.style.width = r.b + 'px';
    if (r.h !== undefined) e.style.height = r.h + 'px';
    return e;
  }
  // Textschicht: Lage aus Bildpixeln, CSS rechnet mal --f.
  function textLage(e, r) {
    e.style.setProperty('--x', r.x);
    e.style.setProperty('--y', r.y);
    if (r.b !== undefined) e.style.setProperty('--b', r.b);
    if (r.h !== undefined) e.style.setProperty('--h', r.h);
    return e;
  }
  function innen(r) {
    return { x: r.x + ZETTEL_RAND, y: r.y + ZETTEL_RAND, b: r.b - 2 * ZETTEL_RAND, h: r.h - 2 * ZETTEL_RAND };
  }

  // Fokus ueber einen Neubau retten (wie in der alten Buehne).
  function merkeFokus(box, feld) {
    const a = document.activeElement;
    if (!a || !box.contains(a)) return null;
    const traeger = a.closest('[data-' + feld + ']');
    if (!traeger || !box.contains(traeger)) return null;
    return { wert: traeger.dataset[feld], selbst: traeger === a };
  }
  function stelleFokusHer(box, feld, f) {
    if (!f) return;
    const z = box.querySelector('[data-' + feld + '="' + CSS.escape(f.wert) + '"]');
    if (!z) return;
    (f.selbst ? z : (z.querySelector('button') || z)).focus({ preventScroll: true });
  }

  // --- Huelle mit verpixeltem Profilbild ------------------------------------------
  // Canvas in halber Fenstergroesse, scharfkantig hochskaliert (CSS). Kein Bild
  // oder Ladefehler: leeres Fenster mit dem Anfangsbuchstaben.
  function profilbild(k, fenster) {
    const c = document.createElement('canvas');
    c.width = HUELLE_FENSTER.b / 2;
    c.height = HUELLE_FENSTER.h / 2;
    fenster.appendChild(c);
    const anfangsbuchstabe = () => {
      c.remove();
      fenster.appendChild(el('span', 'huelle-buchstabe', String(name(k) || '?').charAt(0).toUpperCase()));
    };
    if (!k.avatar) { anfangsbuchstabe(); return; }
    const img = new Image();
    img.decoding = 'async';
    img.addEventListener('load', () => {
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.drawImage(img, 0, 0, c.width, c.height);
    });
    img.addEventListener('error', anfangsbuchstabe);
    img.src = k.avatar;
  }
  function huelle(k, cls) {
    const h = el('div', 'huelle' + (cls ? ' ' + cls : ''));
    const fenster = lage(el('div', 'huelle-fenster'), HUELLE_FENSTER);
    profilbild(k, fenster);
    h.append(fenster, bildEl('../themes/cozy/huelle.png', 'huelle-rahmen'));
    return h;
  }

  // --- Aufbau -----------------------------------------------------------------
  function ebene(id) {
    const e = el('div', 'raum-ansicht');
    e.id = id;
    const bild = el('div', 'raum-bildebene');
    const text = el('div', 'raum-textschicht');
    e.append(bild, text);
    return { e, bild, text };
  }

  function baueRaum() {
    const r = ebene('raum-ebene');
    t.raum = r;
    t.raumBild = bildEl('../themes/cozy/raum-tv-aus.png', 'raum-bild');
    r.bild.appendChild(t.raumBild);
    // TV-Canvas in Bildgroesse ueber dem Raum-Bild (setzeTv zeichnet hinein).
    t.tv = el('canvas', 'raum-tv');
    t.tv.width = Raum.BILD.breite;
    t.tv.height = Raum.BILD.hoehe;
    r.bild.appendChild(t.tv);
    tvMaske = new Image();
    tvMaske.src = '../themes/cozy/raum-tv-maske.png';
    // Fliegende Platte: von der Mitte des Regals zum Plattenteller (CSS-Uebergang).
    const regal = Raum.FLAECHEN.find((f) => f.id === 'regal');
    const von = { x: Math.round(regal.x + regal.b / 2), y: Math.round(regal.y + regal.h / 2) };
    t.flug = lage(bildEl('../themes/cozy/platte-klein.png', 'ablauf-flug raum-aus'),
      { x: von.x - FLUG_KANTE / 2, y: von.y - FLUG_KANTE / 2, b: FLUG_KANTE, h: FLUG_KANTE });
    t.flug.style.setProperty('--dx', (Raum.TELLER.x - von.x) + 'px');
    t.flug.style.setProperty('--dy', (Raum.TELLER.y - von.y) + 'px');
    r.bild.appendChild(t.flug);
    t.winkel = ['ol', 'or', 'ul', 'ur'].map((ecke) => {
      const w = el('div', 'raum-winkel raum-aus ' + ecke);
      r.bild.appendChild(w);
      return w;
    });
    t.schild = el('div', 'raum-schild raum-aus');
    t.hinweis = el('div', 'raum-schild raum-hinweis raum-aus');
    textLage(t.hinweis, { x: Raum.BILD.breite / 2, y: 2 });
    r.text.append(t.schild, t.hinweis);

    const bildPunkt = (e) => {
      const box = wirt.getBoundingClientRect();
      const p = Raum.zuBild(e.clientX - box.left, e.clientY - box.top, skal);
      return Raum.treffer(p.x, p.y);
    };
    r.e.addEventListener('mousemove', (e) => zeigeHover(bildPunkt(e)));
    r.e.addEventListener('mouseleave', () => zeigeHover(null));
    r.e.addEventListener('click', (e) => {
      const id = bildPunkt(e);
      if (id) ruf(opt, 'beiFlaeche', id);
    });
    return r.e;
  }

  // Hover: vier helle Winkel an den Ecken der Flaeche, Holzschild mit Namen.
  let hoverId = null;
  function zeigeHover(id) {
    if (id === hoverId) return;
    hoverId = id;
    const f = id ? Raum.FLAECHEN.find((x) => x.id === id) : null;
    t.raum.e.style.cursor = f ? 'pointer' : '';
    t.winkel.forEach((w) => aus(w, !f));
    aus(t.schild, !f);
    if (!f) return;
    const ecken = [[f.x - 1, f.y - 1], [f.x + f.b - 1, f.y - 1], [f.x - 1, f.y + f.h - 1], [f.x + f.b - 1, f.y + f.h - 1]];
    t.winkel.forEach((w, i) => lage(w, { x: ecken[i][0], y: ecken[i][1] }));
    t.schild.textContent = f.name;
    const oben = f.y >= 16; // sonst unter die Flaeche
    t.schild.classList.toggle('unten', !oben);
    textLage(t.schild, { x: f.x + f.b / 2, y: oben ? f.y - 2 : f.y + f.h + 2 });
  }

  function baueRegal() {
    const r = ebene('regal-ebene');
    t.regal = r;
    r.bild.appendChild(bildEl('../themes/cozy/regal.png', 'raum-bild'));
    for (const art of ['live', 'offline']) {
      const box = lage(el('div', 'fach fach-' + art), Raum.FACH[art]);
      const reihe = el('div', 'fach-reihe');
      box.appendChild(reihe);
      box.addEventListener('wheel', (e) => {
        if (tafelOffen()) return;
        e.preventDefault();
        e.stopPropagation();
        fachBlaettern(art, (e.deltaY || e.deltaX) > 0 ? 1 : -1);
      }, { passive: false });
      // Tab auf eine Platte ausserhalb des Fensters: der Browser wuerde das Fach
      // per scrollLeft verschieben, zusaetzlich zum eigenen translateX.
      box.addEventListener('focusin', (e) => {
        box.scrollLeft = 0;
        const p = e.target.closest('.huelle');
        const i = p ? Array.prototype.indexOf.call(reihe.children, p) : -1;
        if (i < 0) return;
        const f = faecher[art];
        f.start = Raum.fachFenster(f.anzahl, i, Raum.FACH[art].b, f.start).start;
        zeigeFach(art);
      });
      faecher[art].box = box;
      faecher[art].reihe = reihe;
      r.bild.appendChild(box);
    }
    // Vordere Platte: Schallplatte hinter der Huelle, Zettel daneben.
    t.vorn = el('div', 'vorn');
    t.vornPlatte = lage(bildEl('../themes/cozy/platte-vorn.png', 'vorn-platte'), VORN_PLATTE);
    t.vornHuelle = lage(el('div', 'vorn-huelle'), VORN_HUELLE);
    t.vornZettel = lage(el('div', 'zettel vorn-zettel'), VORN_ZETTEL);
    t.rueck = lage(el('div', 'vorn-rueck'), Raum.FACH.vorn);
    t.vorn.append(t.vornPlatte, t.vornHuelle, t.vornZettel, t.rueck);
    r.bild.appendChild(t.vorn);
    r.bild.appendChild(lage(el('div', 'zettel such-zettel'), SUCH_ZETTEL));
    t.zettelText = textLage(el('div', 'text-teil zettel-text'), innen(VORN_ZETTEL));
    t.rueckText = textLage(el('div', 'text-teil rueck-text'), Raum.FACH.vorn);
    t.suchPlatz = textLage(el('div', 'text-teil such-platz'), innen(SUCH_ZETTEL));
    r.text.append(t.zettelText, t.rueckText, t.suchPlatz);
    const such = document.getElementById('home-such-zeile');
    if (such) t.suchPlatz.appendChild(such);
    return r.e;
  }

  function baueTafel() {
    t.tafel = el('div', 'raum-aus');
    t.tafel.id = 'home-tafel';
    const rahmen = el('div', 'zettel tafel-rahmen');
    const kopf = el('div', 'tafel-kopf');
    t.tafelTitel = el('div', 'tafel-titel');
    const zu = knopf('pixel-knopf k-zu', '✕', 'Schließen', () => { versteckeTafel(); ruf(opt, 'beiTafelZu'); });
    kopf.append(t.tafelTitel, zu);
    t.tafelInhalt = el('div', 'tafel-inhalt');
    rahmen.append(kopf, t.tafelInhalt);
    t.tafel.appendChild(rahmen);
    return t.tafel;
  }

  function baueAblauf() {
    t.ablauf = el('div', 'raum-aus');
    t.ablauf.id = 'home-ablauf';
    t.ablauf.tabIndex = -1;
    t.ablaufText = el('div', 'ablauf-text');
    t.ablauf.append(t.ablaufText,
      el('div', 'ablauf-tipp', 'Klick oder Taste: überspringen'));
    const weiter = (e) => {
      if (!ablaufRuf) return;
      e.preventDefault();
      e.stopPropagation(); // Leertaste nicht als Play/Pause im Video-Fenster
      ablaufRuf();
    };
    t.ablauf.addEventListener('click', weiter);
    t.ablauf.addEventListener('keydown', weiter);
    return t.ablauf;
  }

  // Kopf: vorhandene Knoepfe ✕ und ← als Pixel-Knoepfe oben rechts.
  function baueKnoepfe() {
    const box = el('div');
    box.id = 'home-knoepfe';
    const belegung = [['home-back', 'k-home', 'beiZurueck'], ['home-close', 'k-zu', 'beiSchliessen']];
    for (const [id, bildKlasse, rufName] of belegung) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.classList.add('pixel-knopf', bildKlasse);
      if (typeof opt[rufName] === 'function') b.addEventListener('click', () => ruf(opt, rufName));
      box.appendChild(b);
    }
    return box;
  }

  function init(o) {
    if (wirt) return;
    opt = o || {};
    wirt = opt.wirt || document.getElementById('home');
    wirt.classList.add('raum-home');
    wirt.prepend(baueRaum(), baueRegal(), baueKnoepfe(), baueTafel(), baueAblauf());
    zeigeAnsicht('raum');
  }

  // --- Ansicht und Ausrichtung ------------------------------------------------------
  function zeigeAnsicht(a) {
    aktuell = a === 'regal' ? 'regal' : 'raum';
    if (!wirt) return;
    aus(t.raum.e, aktuell !== 'raum');
    aus(t.regal.e, aktuell !== 'regal');
    zeigeHover(null);
    neuAusrichten();
  }
  function ansicht() { return aktuell; }

  function neuAusrichten() {
    if (!wirt) return;
    skal = Raum.skalierung(wirt.clientWidth, wirt.clientHeight);
    const f = skal.faktor;
    wirt.style.setProperty('--f', f);
    // Waehrend des Zooms bleibt die Raum-Ebene auf dem Kamera-Ziel.
    const kamera = wirt.classList.contains('ablauf-zoom') ? kameraZiel() : null;
    for (const r of [t.raum, t.regal]) {
      const z = r === t.raum && kamera ? kamera : { x: skal.links, y: skal.oben, faktor: f };
      r.bild.style.transform = 'translate(' + z.x + 'px, ' + z.y + 'px) scale(' + z.faktor + ')';
      r.text.style.left = skal.links + 'px';
      r.text.style.top = skal.oben + 'px';
      r.text.style.width = Raum.BILD.breite * f + 'px';
      r.text.style.height = Raum.BILD.hoehe * f + 'px';
    }
  }

  // --- Regal: Faecher ---------------------------------------------------------------
  function zeigeFach(art) {
    const f = faecher[art];
    f.reihe.style.transform = 'translateX(' + (-f.start * (Raum.HUELLE.kante + Raum.HUELLE.abstand)) + 'px)';
  }
  function fachBlaettern(art, richtung) {
    const f = faecher[art];
    if (!f || !f.reihe) return;
    f.start = Raum.fachFenster(f.anzahl, -1, Raum.FACH[art].b, f.start + (richtung > 0 ? 1 : -1)).start;
    zeigeFach(art);
  }

  function baueFachPlatte(fach, e) {
    const k = e.kanal;
    const jetzt = () => fach.kanal.get(e.art + '|' + k.login) || k;
    const p = huelle(k, 'platte-' + e.art + (k.live ? ' ist-live' : ' offline'));
    p.tabIndex = 0;
    p.setAttribute('role', 'button');
    p.title = name(k) + (k.live ? (k.game ? ' · ' + k.game : '') : ' · offline');
    p.dataset.login = k.login;
    p.dataset.art = e.art;
    const waehle = () => ruf(fach.h, 'waehle', jetzt(), e.art);
    p.addEventListener('click', waehle);
    p.addEventListener('keydown', (ev) => {
      if (ev.target !== p || (ev.key !== 'Enter' && ev.key !== ' ')) return;
      ev.preventDefault();
      ev.stopPropagation();
      waehle();
    });
    if (k.live) p.appendChild(bildEl('../themes/cozy/lampe-klein.png', 'huelle-lampe'));
    p.appendChild(knopf('huelle-stern stern' + (k.favorit ? ' an' : ''), k.favorit ? '★' : '☆',
      k.favorit ? 'Aus Favoriten entfernen' : 'Zu Favoriten', () => ruf(fach.h, 'stern', jetzt())));
    return p;
  }

  function zeichneFach(art, liste, gewaehlt, h) {
    const fach = faecher[art];
    fach.h = h;
    fach.kanal = new Map(liste.map((e) => [e.art + '|' + e.kanal.login, e.kanal]));
    const schluessel = liste.map((e) => [e.art, e.kanal.login, name(e.kanal), e.kanal.avatar || '',
      e.kanal.favorit ? 1 : 0, e.kanal.live ? 1 : 0].join('|')).join('\n');
    const umgebaut = fach.schluessel !== schluessel;
    if (umgebaut) {
      fach.schluessel = schluessel;
      const fokus = merkeFokus(fach.reihe, 'login');
      fach.reihe.replaceChildren();
      liste.forEach((e, i) => {
        const p = baueFachPlatte(fach, e);
        lage(p, { x: i * (Raum.HUELLE.kante + Raum.HUELLE.abstand), y: Raum.FACH[art].h - Raum.HUELLE.kante });
        fach.reihe.appendChild(p);
      });
      stelleFokusHer(fach.reihe, 'login', fokus);
    }
    fach.anzahl = liste.length;
    const index = liste.findIndex((e) => e.kanal.login === gewaehlt);
    Array.prototype.forEach.call(fach.reihe.children, (p, i) => p.classList.toggle('gewaehlt', i === index));
    // Neue Auswahl oder neuer Fach-Inhalt (Suche, Refresh schiebt Platten
    // davor) holt die Platte in Sicht; sonst bleibt der Stand vom Mausrad
    // (nur in die Grenzen geklemmt).
    const neu = index >= 0 && (gewaehlt !== fach.gewaehlt || umgebaut);
    fach.gewaehlt = index >= 0 ? gewaehlt : null;
    fach.start = Raum.fachFenster(fach.anzahl, neu ? index : -1, Raum.FACH[art].b, fach.start).start;
    zeigeFach(art);
  }

  function zeichneStaender(eintraege, gewaehlt, h) {
    if (!wirt) return;
    const liste = eintraege || [];
    zeichneFach('live', liste.filter((e) => e.art === 'live'), gewaehlt, h);
    zeichneFach('offline', liste.filter((e) => e.art !== 'live'), gewaehlt, h);
  }

  // --- Regal: vordere Platte und Zettel ---------------------------------------------------
  let vornLogin = null;
  function zeichneVornHuelle(k) {
    const login = k ? k.login + '|' + (k.avatar || '') : null;
    if (login === vornLogin) return;
    vornLogin = login;
    t.vornHuelle.replaceChildren();
    if (k) t.vornHuelle.appendChild(huelle(k));
  }

  function punkteZeile(punkte) {
    const z = el('div', 'zettel-punkte');
    z.title = 'Kanalpunkte';
    const s = punkte.symbol;
    z.appendChild(bildEl(s && s.url ? s.url : '../themes/cozy/symbol-muenze.png', 'zettel-punkte-symbol'));
    z.appendChild(el('span', null, Number(punkte.balance || 0).toLocaleString('de-DE')));
    return z;
  }

  function zeichneZettel(s, h) {
    const z = t.zettelText;
    const k = s.kanal;
    const fokus = merkeFokus(z, 'id');
    z.replaceChildren();
    if (!k) {
      if (s.leerText) z.appendChild(el('div', 'zettel-leer', s.leerText));
      return;
    }
    const status = el('div', 'zettel-status');
    if (s.modus === 'live') {
      const lauf = typeof StreamInfo !== 'undefined' ? StreamInfo.laufzeit(k.start, Date.now()) : '';
      status.textContent = ['● LIVE', k.viewersLabel ? k.viewersLabel + ' Zuschauer' : '', lauf].filter(Boolean).join(' · ');
    } else if (s.modus === 'markiert') status.textContent = 'gerade offline gegangen';
    else status.textContent = k.error ? 'Status nicht abrufbar' : 'offline';
    const kanal = el('div', 'zettel-name', name(k));
    if (k.verifiziert) kanal.appendChild(el('span', 'haken', '✓'));
    z.append(status, kanal);
    if (s.modus !== 'offline' && k.title) z.appendChild(el('div', 'zettel-titel', k.title));
    const zeile = el('div', 'zettel-zeile');
    if (s.modus !== 'offline' && k.game) zeile.appendChild(el('span', 'zettel-spiel', k.game));
    if (s.punkte && s.modus !== 'offline') zeile.appendChild(punkteZeile(s.punkte));
    if (zeile.children.length) z.appendChild(zeile);
    const knoepfe = el('div', 'zettel-knoepfe');
    const stern = knopf('zettel-knopf stern' + (k.favorit ? ' an' : ''), k.favorit ? '★' : '☆',
      k.favorit ? 'Aus Favoriten entfernen' : 'Zu Favoriten', () => ruf(h, 'stern', k));
    stern.dataset.id = 'stern';
    knoepfe.appendChild(stern);
    if (s.modus === 'live') {
      const auf = knopf('zettel-knopf', 'Auflegen', 'Stream laden', () => ruf(h, 'laden', k.login));
      auf.dataset.id = 'laden';
      knoepfe.appendChild(auf);
    }
    const vods = knopf('zettel-knopf', 'VODs', 'VODs ansehen', () => ruf(h, 'vods', k));
    vods.dataset.id = 'vods';
    knoepfe.appendChild(vods);
    z.appendChild(knoepfe);
    stelleFokusHer(z, 'id', fokus);
  }

  // --- Regal: VOD-Rueckseite (2x2 je Seite) -------------------------------------
  function vodBild(url, c) {
    if (!url) return;
    const img = new Image();
    img.decoding = 'async';
    img.addEventListener('load', () => {
      // mittig auf 32:9 zuschneiden, verkleinert zeichnen (CSS vergroessert scharfkantig)
      const w = img.naturalWidth;
      const hoch = Math.min(img.naturalHeight, w * 9 / 32);
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.drawImage(img, 0, (img.naturalHeight - hoch) / 2, w, hoch, 0, 0, c.width, c.height);
    });
    img.src = url;
  }

  function zeichneRueck(s, h) {
    const k = s.kanal;
    const r = k ? s.rueckseite : null;
    t.rueck._h = h;
    t.rueck._k = k;
    const seite = r && r.seite ? r.seite : 0;
    const schluessel = k && r ? [k.login, r.status, seite, (r.vods || []).map((v) => v.id).join(','), r.mehr ? 1 : 0].join('|') : null;
    if (t.rueck._schluessel === schluessel) return;
    t.rueck._schluessel = schluessel;
    const fokus = merkeFokus(t.regal.e, 'id');
    t.rueck.replaceChildren();
    t.rueckText.replaceChildren();
    if (!r) return;
    const zu = knopf('rueck-knopf rueck-zu', '↩', 'Zurückdrehen', () => ruf(t.rueck._h, 'rueckseiteZu'));
    zu.dataset.id = 'zu';
    t.rueckText.appendChild(zu);
    const status = { laden: 'lade VODs …', leer: 'Keine VODs', fehler: 'VODs nicht abrufbar' }[r.status];
    if (status) {
      t.rueckText.appendChild(el('div', 'rueck-status', status));
      stelleFokusHer(t.regal.e, 'id', fokus);
      return;
    }
    const alle = r.vods || [];
    const seiten = Math.max(1, Math.ceil(alle.length / JE_SEITE));
    const sNr = Math.min(seite, seiten - 1);
    alle.slice(sNr * JE_SEITE, sNr * JE_SEITE + JE_SEITE).forEach((v, i) => {
      const b = knopf('rueck-vod', null, null, () => ruf(t.rueck._h, 'vod', v.id));
      b.title = [v.title, v.lengthLabel, v.publishedLabel, v.viewsLabel ? v.viewsLabel + ' Aufrufe' : ''].filter(Boolean).join(' · ');
      b.dataset.id = 'vod-' + v.id;
      lage(b, { x: VOD_PLAETZE[i].x, y: VOD_PLAETZE[i].y, b: 64, h: 18 });
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 9;
      b.appendChild(c);
      vodBild(v.thumb, c);
      t.rueck.appendChild(b);
    });
    if (seiten > 1) {
      const links = knopf('rueck-knopf rueck-links', '‹', 'Neuere', () => ruf(t.rueck._h, 'vodSeite', -1));
      links.dataset.id = 'zurueck';
      links.disabled = sNr === 0;
      const rechts = knopf('rueck-knopf rueck-rechts', '›', 'Ältere', () => ruf(t.rueck._h, 'vodSeite', 1));
      rechts.dataset.id = 'vor';
      rechts.disabled = sNr >= seiten - 1;
      t.rueckText.append(links, rechts);
    }
    const fuss = el('div', 'rueck-fuss');
    if (seiten > 1) fuss.appendChild(el('span', 'rueck-seite', (sNr + 1) + ' / ' + seiten));
    if (r.mehr) {
      const mehr = knopf('rueck-knopf', 'Alle VODs', 'Alle VODs in der Liste', () => ruf(t.rueck._h, 'mehr', t.rueck._k));
      mehr.dataset.id = 'mehr';
      fuss.appendChild(mehr);
    }
    if (fuss.children.length) t.rueckText.appendChild(fuss);
    stelleFokusHer(t.regal.e, 'id', fokus);
  }

  function zeichneBuehne(stand, h) {
    if (!wirt) return;
    const s = stand || {};
    const k = s.kanal || null;
    const gedreht = !!k && !!s.rueckseite;
    t.vorn.classList.toggle('ladend', !!s.ladend);
    t.vorn.classList.toggle('offline', !!k && s.modus === 'offline');
    aus(t.vornHuelle, !k || gedreht);
    aus(t.vornPlatte, !k || gedreht);
    aus(t.vornZettel, gedreht);
    aus(t.zettelText, gedreht);
    aus(t.rueck, !gedreht);
    aus(t.rueckText, !gedreht);
    zeichneVornHuelle(k);
    zeichneZettel(s, h);
    zeichneRueck(s, h);
  }

  // --- Ablauf, Tafel, Schild, Fernseher --------------------------------------------------
  // Kamera: der gruene Bildschirm fuellt das Fenster.
  function kameraZiel() {
    return Raum.kameraZiel(Raum.TV_RECHTECK,wirt.clientWidth, wirt.clientHeight);
  }

  // Auflegen: Regal blendet zum Raum (ablauf-raum), Platte fliegt zum Teller
  // (ablauf-platte), Kamera zoomt in den Fernseher (ablauf-zoom). Die
  // Uebergaenge stehen in home-raum.css; home.js steuert die Mindestdauer.
  function zeigeAblauf(kanal, beiUeberspringen) {
    if (!wirt) return;
    versteckeAblauf();
    ablaufRuf = typeof beiUeberspringen === 'function' ? beiUeberspringen : null;
    t.ablaufText.textContent = 'Lege auf: ' + (kanal ? name(kanal) : '…');
    zeigeHover(null);
    aus(t.ablauf, false);
    t.ablauf.focus({ preventScroll: true });
    wirt.classList.add('im-ablauf');
    aus(t.raum.e, false); // liegt ueber dem Regal, startet unsichtbar
    void t.raum.e.offsetWidth; // Startzustand festschreiben, sonst kein Uebergang
    wirt.classList.add('ablauf-raum');
    ablaufTimer.push(setTimeout(() => {
      aus(t.flug, false);
      void t.flug.offsetWidth;
      wirt.classList.add('ablauf-platte');
    }, ABLAUF_MS.raum));
    ablaufTimer.push(setTimeout(() => {
      wirt.classList.add('ablauf-zoom');
      neuAusrichten();
    }, ABLAUF_MS.raum + ABLAUF_MS.platte));
  }
  // Setzt alles zurueck (auch nach Fehler): Timer, Klassen, Platte, Kamera, Ansicht.
  function versteckeAblauf() {
    if (!wirt) return;
    ablaufRuf = null;
    ablaufTimer.forEach((x) => clearTimeout(x));
    ablaufTimer = [];
    // Mit den Klassen faellt auch der Uebergang weg: Ruecksprung ohne Animation.
    wirt.classList.remove('im-ablauf', 'ablauf-raum', 'ablauf-platte', 'ablauf-zoom');
    aus(t.flug, true);
    aus(t.ablauf, true);
    zeigeAnsicht(aktuell); // Raum/Regal wie vorher, ruft neuAusrichten()
  }

  // Element in die Tafel leihen; versteckeTafel gibt es an seinen Platz zurueck.
  function leihe(e, ziel) {
    tafelLeihe.push({ el: e, eltern: e.parentNode, danach: e.nextSibling });
    ziel.appendChild(e);
  }
  function zeigeTafel(art, inhalt) {
    if (!wirt) return;
    versteckeTafel();
    t.tafel.dataset.art = art;
    const titel = art === 'vods' ? document.getElementById('home-title') : null;
    if (titel) leihe(titel, t.tafelTitel);
    else t.tafelTitel.textContent = TAFEL_TITEL[art] || String(art || '');
    if (inhalt) leihe(inhalt, t.tafelInhalt);
    aus(t.tafel, false);
  }
  function versteckeTafel() {
    if (!wirt) return;
    while (tafelLeihe.length) {
      const l = tafelLeihe.pop();
      if (l.eltern) l.eltern.insertBefore(l.el, l.danach && l.danach.parentNode === l.eltern ? l.danach : null);
      else l.el.remove();
    }
    t.tafelTitel.replaceChildren();
    t.tafelInhalt.replaceChildren();
    delete t.tafel.dataset.art;
    aus(t.tafel, true);
  }
  function tafelOffen() { return !!wirt && !t.tafel.classList.contains('raum-aus'); }

  function zeigeSchild(text) {
    if (!wirt) return;
    t.hinweis.textContent = text;
    aus(t.hinweis, false);
    clearTimeout(schildTimer);
    schildTimer = setTimeout(() => aus(t.hinweis, true), SCHILD_MS);
  }

  // Fernseher: Vorschau des Live-Streams verpixelt in die schraege
  // Bildschirmflaeche; ohne Vorschau (oder bei Ladefehler) bleibt die Canvas
  // leer und raum-tv-aus.png sichtbar. Pixel werden nie ausgelesen (fremdes
  // Bild), die Maske beschneidet per Zeichen-Modus.
  function leereTv() {
    const g = t.tv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, t.tv.width, t.tv.height);
  }
  function zeichneTvBild(img) {
    const p0 = Raum.TV_ECKEN[0], p1 = Raum.TV_ECKEN[1], p3 = Raum.TV_ECKEN[3];
    const klein = document.createElement('canvas');
    klein.width = 27;
    klein.height = 38;
    // mittig auf das Seitenverhaeltnis der schraegen Flaeche zuschneiden
    const ziel = Math.hypot(p1.x - p0.x, p1.y - p0.y) / Math.hypot(p3.x - p0.x, p3.y - p0.y);
    const w = img.naturalWidth, h = img.naturalHeight;
    const qb = Math.min(w, h * ziel), qh = Math.min(h, w / ziel);
    const k = klein.getContext('2d');
    k.imageSmoothingEnabled = false;
    k.drawImage(img, (w - qb) / 2, (h - qh) / 2, qb, qh, 0, 0, klein.width, klein.height);
    leereTv();
    const g = t.tv.getContext('2d');
    g.imageSmoothingEnabled = false;
    // affin: (0,0) -> oben links, (27,0) -> oben rechts, (0,38) -> unten links
    g.setTransform((p1.x - p0.x) / klein.width, (p1.y - p0.y) / klein.width,
      (p3.x - p0.x) / klein.height, (p3.y - p0.y) / klein.height, p0.x, p0.y);
    g.drawImage(klein, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(tvMaske, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }
  function setzeTv(o) {
    const url = (o && o.vorschauUrl) || null;
    if (!wirt || url === tvVorschau) return; // gleiche Adresse: Bild steht schon
    tvVorschau = url;
    const nr = ++tvNr;
    // Kanal aus der Adresse: bei bloessem Adresswechsel (?t= jede Minute) bleibt
    // das alte Bild stehen, bis das neue geladen ist; sonst flackert der Fernseher.
    const login = url ? ((/live_user_([^-]+)-/.exec(url) || [])[1] || url) : null;
    if (!url || login !== tvLogin) leereTv();
    tvLogin = login;
    if (!url) return;
    const img = new Image();
    img.decoding = 'async';
    // Ladefehler: Aus-Bildschirm bleibt; der naechste Aufruf versucht es neu.
    const fehler = () => { if (nr === tvNr) { leereTv(); tvVorschau = null; tvLogin = null; } };
    img.addEventListener('error', fehler);
    img.addEventListener('load', () => {
      if (nr !== tvNr) return;
      if (tvMaske.complete && tvMaske.naturalWidth) { zeichneTvBild(img); return; }
      tvMaske.addEventListener('load', () => { if (nr === tvNr) zeichneTvBild(img); }, { once: true });
      tvMaske.addEventListener('error', fehler, { once: true });
    });
    img.src = url;
  }

  return {
    init, zeigeAnsicht, ansicht, zeichneBuehne, zeichneStaender, fachBlaettern,
    zeigeAblauf, versteckeAblauf, zeigeTafel, versteckeTafel, tafelOffen,
    zeigeSchild, setzeTv, neuAusrichten,
  };
})();
