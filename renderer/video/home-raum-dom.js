// Darstellung von Home als Cozy-Raum (Etappe 2): isometrischer Pixel-Raum als
// Hauptmenue und Regal-Ansicht mit Schallplatten. Nur DOM, keine Steuerung:
// Zustand und Klick-Folgen kommen von home.js (Handler-Objekte, init-Optionen).
// Geometrie (Bildpixel, Faktor, Treffer, Fach-Fenster) steht in lib/raum.js.
// Bild- und Textschicht: Bilder, Huellen und Zettel liegen in einer Ebene mit
// translate+scale (Bildkoordinaten), Text darueber unskaliert, damit er lesbar
// bleibt (Lage = Bildkoordinaten x Faktor ueber CSS-Variablen).
// IIFE: setzt nur window.HomeRaumDom. Plan: docs/superpowers/plans/2026-11-10-cozy-raum-etappe-2.md
// und 2026-11-11-cozy-raum-etappe-2-runde-2.md.
// Es werden keine Grafiken gezeichnet, nur vorhandene PixelLab-Bilder platziert,
// ausgestanzt, skaliert oder aufgehellt (Ausnahme: Text).

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
  const ZETTEL_RAND = 6; // 9-Slice-Rand von zettel.png in Bildpixeln
  // zettel.png ist oben 9 Bildpixel durchsichtig, die Kante liegt bei 9-10, das
  // Papier beginnt bei 12: der vordere Zettel schneidet oben 12 (home-raum.css).
  const ZETTEL_RAND_OBEN = 12;
  // Grosse Huelle (VODs, 128x128 Bildpixel, huelle-gross-vorn/-rueck.png):
  // Fenster fuers Profilbild (in tools/raum-bilder.py ausgestanzt, per Farbe
  // gemessen) und Platz der VOD-Liste innerhalb des Rahmens der Rueckseite.
  const GROSS_KANTE = 128;
  const GROSS_FENSTER = { x: 32, y: 32, b: 65, h: 65 };
  const GROSS_LISTE = { x: 21, y: 31, b: 86, h: 68 };
  const SCHILD_MS = 2000;
  const TAFEL_TITEL = { konto: 'Konto', licht: 'Licht', vods: 'Alle VODs' };
  // Auflegen: Dauer je Abschnitt (gleich den Uebergaengen in home-raum.css).
  // Summe 5200 ms = mindestMs in home.js.
  const ABLAUF_MS = { raum: 500, spieler: 1200, dreht: 1500, zoom: 2000 };
  // Drehende Platte: platte-dreht.png, 8 Bilder je 54x50 nebeneinander (432x50),
  // Ursprung wie Raum.HOVER.plattenspieler.
  const DREHT = { x: 258, y: 82, b: 54, h: 50, bilder: 8 };

  let wirt = null;
  let opt = {};
  let skal = { faktor: 1, links: 0, oben: 0 }; // Regal-Ansicht (Zettel, Schrift)
  let skalRaum = skal; // Raum-Ansicht samt Holzwand (Raum.RAUM_RAHMEN)
  let skalRegal = skal; // Regal neu samt Leinwand (Raum.skalierungRegal)
  let spielt = false; // Stream oder VOD spielt gerade (plattenspielerLaeuft)
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
  // Regal neu (Task 9a, bis 9b unverdrahtet): Ruecken-Faecher unter dem Ausstellbrett.
  const faecherNeu = {
    live: { start: 0, anzahl: 0, gewaehlt: null },
    unten: { start: 0, anzahl: 0, gewaehlt: null },
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
  // Textschicht: Lage aus Bildpixeln, CSS rechnet mal --f (in der grossen
  // Huelle mal --n, ganzzahlig).
  function textLage(e, r) {
    e.style.setProperty('--x', r.x);
    e.style.setProperty('--y', r.y);
    if (r.b !== undefined) e.style.setProperty('--b', r.b);
    if (r.h !== undefined) e.style.setProperty('--h', r.h);
    return e;
  }
  function innen(r, oben) {
    const o = oben || ZETTEL_RAND;
    return { x: r.x + ZETTEL_RAND, y: r.y + o, b: r.b - 2 * ZETTEL_RAND, h: r.h - o - ZETTEL_RAND };
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
  // Canvas in voller Fenstergroesse (Bildpixel), scharfkantig hochskaliert (CSS).
  // Kein Bild oder Ladefehler: leeres Fenster mit dem Anfangsbuchstaben.
  function profilbild(k, fenster, masse) {
    const m = masse || HUELLE_FENSTER;
    const c = document.createElement('canvas');
    c.width = m.b;
    c.height = m.h;
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
    // Holzwand hinter dem Raum (PixelLab, 504x192 ab x=-80): deckt den schwarzen
    // Aussenbereich des Raum-Bildes, damit breite Fenster nicht abschneiden muessen.
    r.bild.appendChild(bildEl('../themes/cozy/raum-wand.png', 'raum-wand'));
    // Leben (Etappe 3): Regen, Katze, Dampf, Lampe als Bildstreifen direkt ueber dem
    // Raum-Bild; unter dem Fernseher, weil die Lampen-Flaeche 12 Bildschirm-Pixel
    // ueberdeckt (Bild 0 = Fernseher aus), und unter den Hover-Bildern.
    t.leben = RaumLebenDom.baue(document, r.bild, RaumLeben.HOME, '../themes/cozy/leben-home-');
    // TV-Canvas in Bildgroesse ueber dem Raum-Bild (setzeTv zeichnet hinein).
    t.tv = el('canvas', 'raum-tv');
    t.tv.width = Raum.BILD.breite;
    t.tv.height = Raum.BILD.hoehe;
    r.bild.appendChild(t.tv);
    // Hover: PixelLab-Ausschnitt des Gegenstands in Form, aufgehellt (home-raum.css).
    t.hover = {};
    for (const f of Raum.FLAECHEN) {
      const h = Raum.HOVER[f.id];
      if (!h) continue;
      t.hover[f.id] = lage(bildEl('../themes/cozy/hover-' + f.id + '.png', 'raum-hover'), h);
      r.bild.appendChild(t.hover[f.id]);
    }
    tvMaske = new Image();
    tvMaske.src = '../themes/cozy/raum-tv-maske.png';
    // Drehende Platte (Ablauf): Sprite in Bildpixeln in der skalierten Ebene,
    // die Ebene vergroessert es mit (kein Bild-Bluten bei krummem Faktor).
    t.dreht = lage(el('div', 'ablauf-dreht-platte raum-aus'), DREHT);
    r.bild.appendChild(t.dreht);
    // Name des Gegenstands bzw. Hinweis (zeigeSchild): klein unten mittig, unskaliert.
    t.name = el('div', 'raum-name raum-aus');
    r.e.appendChild(t.name);

    const bildPunkt = (e) => {
      const box = wirt.getBoundingClientRect();
      const p = Raum.zuBild(e.clientX - box.left, e.clientY - box.top, skalRaum);
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

  // Hover: Ausschnitt des Gegenstands hell einblenden, Name unten mittig.
  let hoverId = null;
  let hoverName = '';
  let hinweisText = '';
  function zeigeHover(id) {
    if (id === hoverId) return;
    hoverId = id;
    const f = id ? Raum.FLAECHEN.find((x) => x.id === id) : null;
    t.raum.e.style.cursor = f ? 'pointer' : '';
    for (const k of Object.keys(t.hover)) t.hover[k].classList.toggle('an', !!f && k === f.id);
    hoverName = f ? f.name : '';
    zeigeUnten();
  }
  // Ein Platz unten mittig: ein Hinweis (zeigeSchild) geht dem Hover-Namen vor.
  function zeigeUnten() {
    const text = hinweisText || hoverName;
    t.name.textContent = text;
    aus(t.name, !text);
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
    t.vorn.append(t.vornPlatte, t.vornHuelle, t.vornZettel);
    r.bild.appendChild(t.vorn);
    r.bild.appendChild(lage(el('div', 'zettel such-zettel'), SUCH_ZETTEL));
    // Doppelklick auf die vordere Huelle legt auf (wie der Knopf "Auflegen").
    t.vornHuelle.addEventListener('dblclick', () => {
      const s = t.vornStand;
      if (s && s.kanal && s.modus === 'live') ruf(t.buehneH, 'laden', s.kanal.login);
    });
    t.zettelText = textLage(el('div', 'text-teil zettel-text'), innen(VORN_ZETTEL, ZETTEL_RAND_OBEN));
    t.suchPlatz = textLage(el('div', 'text-teil such-platz'), innen(SUCH_ZETTEL));
    r.text.append(t.zettelText, t.suchPlatz);
    const such = document.getElementById('home-such-zeile');
    if (such) t.suchPlatz.appendChild(such);
    r.e.appendChild(baueGross());
    return r.e;
  }

  // VODs: die gewaehlte Platte wird herausgenommen - grosse Huelle mittig ueber
  // dem Regal (ganzzahlig vergroessert, --n), dreht sich um (CSS rotateY,
  // 400 ms); auf der Rueckseite eine scrollbare Liste aller geladenen VODs.
  // Klick daneben oder ✕ legt sie zurueck (Esc: home.js).
  function baueGross() {
    t.gross = el('div', 'gross-platz raum-aus');
    t.gross.addEventListener('click', (e) => {
      if (e.detail > 1) return; // Doppelklick: der zweite Klick trifft die eben geoeffnete Huelle
      if (e.target === t.gross) ruf(t.grossH, 'rueckseiteZu');
    });
    t.grossHuelle = el('div', 'gross');
    t.grossKarte = el('div', 'gross-karte');
    const vorn = el('div', 'gross-seite gross-vorn');
    t.grossFenster = textLage(el('div', 'gross-teil gross-fenster'), GROSS_FENSTER);
    vorn.append(t.grossFenster, bildEl('../themes/cozy/huelle-gross-vorn.png', 'gross-bild'));
    const rueck = el('div', 'gross-seite gross-rueck');
    t.grossListe = textLage(el('div', 'gross-teil gross-liste'), GROSS_LISTE);
    t.grossListe.tabIndex = -1;
    rueck.append(bildEl('../themes/cozy/huelle-gross-rueck.png', 'gross-bild'), t.grossListe);
    t.grossKarte.append(vorn, rueck);
    const zu = knopf('pixel-knopf k-zu gross-zu', '✕', 'Zurücklegen', () => ruf(t.grossH, 'rueckseiteZu'));
    zu.dataset.id = 'zu';
    t.grossHuelle.append(t.grossKarte, zu);
    t.gross.appendChild(t.grossHuelle);
    return t.gross;
  }
  function grossOffen() { return !!wirt && !t.gross.classList.contains('raum-aus'); }

  // Karte (Regal neu): grosse Platte, doppelt so breit wie hoch. Vorn links die
  // Huelle mit Profilbild, rechts die Infotafel (9-Slice karte.png); hinten
  // (karte-rueck.png) die scrollbare VOD-Liste, die am Ende nachlaedt. Eigener
  // Baustein neben baueGross; die Handler kommen mit zeichneKarte (t.karteH usw.).
  // Das Aussehen liegt in home-raum.css (Abschnitt Karte).
  function baueKarte() {
    t.karteWurzel = el('div', 'karte-platz raum-aus');
    t.karteWurzel.addEventListener('click', (e) => {
      if (e.detail > 1) return; // Doppelklick: der zweite Klick trifft die eben geoeffnete Karte
      if (e.target === t.karteWurzel && t.karteZu) t.karteZu();
    });
    t.karte = el('div', 'karte');
    t.karteKarte = el('div', 'karte-karte');
    // Vorderseite: Huelle links, Infotafel rechts
    const vorn = el('div', 'karte-seite karte-vorn');
    t.karteHuelle = el('div', 'karte-huelle');
    t.karteFenster = textLage(el('div', 'karte-teil karte-fenster'), GROSS_FENSTER);
    t.karteHuelle.append(t.karteFenster, bildEl('../themes/cozy/huelle-gross-vorn.png', 'karte-bild'));
    // Doppelklick auf die Huelle legt auf (wie der Knopf "Auflegen")
    t.karteHuelle.addEventListener('dblclick', () => {
      const s = t.karteStand;
      if (s && s.kanal && s.modus === 'live' && t.karteLaden) t.karteLaden(s.kanal.login);
    });
    t.karteInfo = el('div', 'karte-info');
    vorn.append(t.karteHuelle, t.karteInfo);
    // Rueckseite: Kopf und Liste auf karte-rueck.png (9-Slice in CSS)
    const rueck = el('div', 'karte-seite karte-rueck');
    t.karteKopf = el('div', 'karte-kopf');
    t.karteVods = el('div', 'karte-vods');
    t.karteVods.tabIndex = -1;
    t.karteVods.addEventListener('scroll', karteNachladen);
    t.karteFuss = el('div', 'karte-vods-fuss');
    rueck.append(t.karteKopf, t.karteVods);
    t.karteRueck = rueck;
    t.karteKarte.append(vorn, rueck);
    const zu = knopf('pixel-knopf k-zu karte-zu', '✕', 'Zurücklegen', () => { if (t.karteZu) t.karteZu(); });
    zu.dataset.id = 'zu';
    t.karte.append(t.karteKarte, zu);
    t.karteWurzel.appendChild(t.karte);
    t.karteKv = null;
    return t.karteWurzel;
  }
  function karteOffen() {
    // Karte herausgenommen (vorn oder hinten), wie grossOffen
    return !!wirt && !!t.karteWurzel && !t.karteWurzel.classList.contains('raum-aus');
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
      if (e.detail > 1) return; // Doppelklick: der zweite Klick gehoert noch dem Klick, der den Ablauf startete
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
    t.regal.e.appendChild(baueKarte());
    aus(t.dreht, !spielt);
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
    skalRaum = Raum.skalierung(wirt.clientWidth, wirt.clientHeight, Raum.RAUM_RAHMEN);
    const f = skal.faktor;
    wirt.style.setProperty('--f', f);
    // Pixel-Schrift in Vielfachen von 12 px, Rahmen in ganzen Bildschirm-Pixeln.
    wirt.style.setProperty('--raum-schrift', Raum.schriftPx(f) + 'px');
    wirt.style.setProperty('--raum-schrift-gross', Raum.schriftPx(f, 5) + 'px');
    wirt.style.setProperty('--rand', Raum.randPx(f, ZETTEL_RAND) + 'px');
    // Grosse Huelle: ganzzahlig vergroessert (--n), mittig auf ganzen Pixeln;
    // VOD-Vorschau 64x18 ebenfalls ganzzahlig (--vod-k).
    const kante = Raum.grossKante(wirt.clientHeight, wirt.clientWidth);
    const n = kante / GROSS_KANTE;
    wirt.style.setProperty('--n', n);
    wirt.style.setProperty('--vod-k', Math.max(1, Math.floor(n / 2)));
    t.grossHuelle.style.left = Math.round((wirt.clientWidth - kante) / 2) + 'px';
    t.grossHuelle.style.top = Math.round((wirt.clientHeight - kante) / 2) + 'px';
    // Karte: doppelt so breit wie hoch, ganzzahlig (--karte-n), eigene Schriftgroessen
    // und Vorschau-Faktor; mittig auf ganzen Pixeln.
    const km = Raum.kartenMasse(wirt.clientWidth, wirt.clientHeight);
    wirt.style.setProperty('--karte-b', km.breite + 'px');
    wirt.style.setProperty('--karte-h', km.hoehe + 'px');
    wirt.style.setProperty('--karte-n', km.n);
    wirt.style.setProperty('--karte-schrift', km.schrift.gross + 'px');
    wirt.style.setProperty('--karte-schrift-klein', km.schrift.klein + 'px');
    wirt.style.setProperty('--karte-vod-k', km.vodK);
    t.karte.style.left = km.links + 'px';
    t.karte.style.top = km.oben + 'px';
    // Der Zettel zeigt je nach Hoehe mehr oder weniger Zeilen.
    if (t.vornStand && zettelPlatz().platz !== t.zettelPlatz) zeichneZettel(t.vornStand, t.buehneH);
    // Im Ablauf bleibt die Raum-Ebene auf dem Kamera-Ziel (auch bei Groessenaenderung).
    const kamera = kameraZiel();
    for (const r of [t.raum, t.regal]) {
      const s = r === t.raum ? skalRaum : skal;
      const z = r === t.raum && kamera ? kamera : { x: s.links, y: s.oben, faktor: s.faktor };
      r.bild.style.transform = 'translate(' + z.x + 'px, ' + z.y + 'px) scale(' + z.faktor + ')';
      r.text.style.left = Math.round(s.links) + 'px'; // ganze Bildschirm-Pixel
      r.text.style.top = Math.round(s.oben) + 'px';
      r.text.style.width = Raum.BILD.breite * s.faktor + 'px';
      r.text.style.height = Raum.BILD.hoehe * s.faktor + 'px';
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
    // Doppelklick: waehlen und sofort auflegen, derselbe Weg wie der Knopf
    // "Auflegen" (Handler laden). Nur Live-Platten im Live-Fach; ein Twitch-
    // Treffer laedt schon beim Waehlen, eine Offline-Platte hat kein Auflegen.
    p.addEventListener('dblclick', (ev) => {
      if (ev.target.closest('.huelle-stern')) return;
      const kj = jetzt();
      if (e.art !== 'live' || !kj.live) return;
      waehle();
      ruf(t.buehneH, 'laden', kj.login);
    });
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

  // --- Regal neu (Task 9a): Leinwand, Ausstellbrett, Plattenruecken ---------------------
  // Baustein neben dem alten Regal: init ruft baueRegalNeu erst ab Task 9b auf (dann
  // ersetzt es baueRegal, richteRegalNeuAus die Regal-Zeilen in neuAusrichten und
  // fachBlaetternNeu das alte fachBlaettern). Alle Masse in Bildpixeln von regal.png
  // (Raum.REGAL). Bildebene: Leinwand (regal-oben/-unten, regal-wand), regal.png, Cover
  // auf dem Brett, Such-Zettel. Textschicht: Brett-Text, Suchfeld und die Ruecken-Faecher
  // (unskaliert, damit Name und Mini-Profilbild scharf bleiben; Lage = Bildpixel x --f
  // der Regal-Ebene, gerundet wie .text-teil).
  function baueRegalNeu() {
    const r = ebene('regal-ebene');
    r.e.classList.add('regal-neu');
    t.regalNeu = r;
    const L = Raum.REGAL_LEINWAND;
    const hoehe = Raum.BILD.hoehe;
    // Leinwand unter dem Regal: Streifen oben (y -64) und unten (y 192), Wand seitlich
    r.bild.append(
      lage(bildEl('../themes/cozy/regal-oben.png', 'regal-leinwand'), { x: L.x, y: L.y, b: L.b, h: -L.y }),
      lage(bildEl('../themes/cozy/regal-unten.png', 'regal-leinwand'), { x: L.x, y: hoehe, b: L.b, h: L.y + L.h - hoehe }),
      lage(bildEl('../themes/cozy/regal-wand.png', 'regal-leinwand'), { x: L.x, y: 0, b: L.b, h: hoehe }),
      bildEl('../themes/cozy/regal.png', 'raum-bild'));
    t.brett = lage(el('div', 'brett-neu'), Raum.REGAL.brett);
    r.bild.append(t.brett, lage(el('div', 'zettel such-zettel'), Raum.REGAL.such));
    t.brettText = textLage(el('div', 'text-teil brett-text raum-aus'), Raum.REGAL.brett);
    t.suchPlatzNeu = textLage(el('div', 'text-teil such-platz'), innen(Raum.REGAL.such));
    r.text.append(t.brettText, t.suchPlatzNeu);
    t.plattenRuecken = {};
    for (const art of ['live', 'unten']) {
      const fach = Raum.REGAL.faecher[art];
      const box = textLage(el('div', 'text-teil ruecken-fach ruecken-fach-' + art), fach);
      box.addEventListener('wheel', (e) => {
        if (tafelOffen() || karteOffen()) return;
        e.preventDefault();
        e.stopPropagation();
        fachBlaetternNeu(art, (e.deltaY || e.deltaX) > 0 ? 1 : -1);
      }, { passive: false });
      // Tab auf einen Ruecken ausserhalb des Fensters: der Browser wuerde das Fach per
      // scrollLeft verschieben; stattdessen per fachFenster in Sicht holen.
      box.addEventListener('focusin', (e) => {
        box.scrollLeft = 0;
        const p = e.target.closest('.ruecken');
        const i = p ? Array.prototype.indexOf.call(box.children, p) : -1;
        if (i < 0) return;
        const f = faecherNeu[art];
        f.start = Raum.fachFenster(f.anzahl, i, fach.b, f.start,
          { kante: Raum.REGAL.ruecken.b, abstand: Raum.REGAL.ruecken.abstand }).start;
        zeigeFachNeu(art);
      });
      faecherNeu[art].box = box;
      t.plattenRuecken[art] = box;
      r.text.appendChild(box);
    }
    const such = document.getElementById('home-such-zeile');
    if (such) t.suchPlatzNeu.appendChild(such);
    return r.e;
  }

  // Skalierung der Regal-Ebene (Leinwand fuellt das Fenster, Regal immer ganz). Eigener
  // Faktor --f und eigene Schrift an der Ebene, damit die Textschicht zur Bildebene passt.
  function richteRegalNeuAus(w, h) {
    if (!t.regalNeu) return;
    skalRegal = Raum.skalierungRegal(w, h);
    const f = skalRegal.faktor;
    const r = t.regalNeu;
    r.e.style.setProperty('--f', f);
    r.e.style.setProperty('--raum-schrift', Raum.schriftPx(f) + 'px');
    r.bild.style.transform = 'translate(' + skalRegal.links + 'px, ' + skalRegal.oben + 'px) scale(' + f + ')';
    r.text.style.left = Math.round(skalRegal.links) + 'px';
    r.text.style.top = Math.round(skalRegal.oben) + 'px';
    r.text.style.width = Raum.BILD.breite * f + 'px';
    r.text.style.height = Raum.BILD.hoehe * f + 'px';
  }

  // gewaehlt (herausgenommen) und vorschlag (bester Treffer fuer Enter) heben die Platte an.
  function markiere(box, s) {
    for (const p of box.children) {
      const login = p.dataset.login;
      p.classList.toggle('gewaehlt', !!login && login === s.gewaehlt);
      p.classList.toggle('vorschlag', !!login && login === s.vorschlag && login !== s.gewaehlt);
    }
  }

  // Ausstellbrett: Live-Favoriten als Cover nebeneinander, auf der Unterkante stehend.
  // Das Brett blaettert nicht (regalBelegung gibt hoechstens so viele, wie Platz haben).
  function zeichneBrett(liste, s) {
    const B = Raum.REGAL.brett;
    t.brettKanal = new Map(liste.map((k) => [k.login, k]));
    const schluessel = liste.map((k) => [k.login, name(k), k.avatar || '', k.favorit ? 1 : 0, k.live ? 1 : 0].join('|')).join('\n');
    if (t.brettSchluessel !== schluessel) {
      t.brettSchluessel = schluessel;
      const fokus = merkeFokus(t.brett, 'login');
      t.brett.replaceChildren();
      liste.forEach((k, i) => {
        const jetzt = () => t.brettKanal.get(k.login) || k;
        const p = huelle(k, 'brett-platte' + (k.live ? ' ist-live' : ' offline'));
        lage(p, { x: i * (Raum.HUELLE.kante + Raum.HUELLE.abstand), y: B.h - Raum.HUELLE.kante });
        p.tabIndex = 0;
        p.setAttribute('role', 'button');
        p.title = name(k) + (k.live ? (k.game ? ' · ' + k.game : '') : ' · offline');
        p.dataset.login = k.login;
        p.dataset.art = 'brett';
        const waehle = () => ruf(t.regalH, 'waehle', jetzt(), 'brett');
        p.addEventListener('click', waehle);
        // Doppelklick: waehlen und sofort auflegen (nur live)
        p.addEventListener('dblclick', (ev) => {
          if (ev.target.closest('.huelle-stern')) return;
          const kj = jetzt();
          if (!kj.live) return;
          waehle();
          ruf(t.regalH, 'laden', kj.login);
        });
        p.addEventListener('keydown', (ev) => {
          if (ev.target !== p || (ev.key !== 'Enter' && ev.key !== ' ')) return;
          ev.preventDefault();
          ev.stopPropagation();
          waehle();
        });
        if (k.live) {
          const P = Raum.REGAL.livePunkt.cover;
          p.appendChild(lage(el('div', 'live-punkt'), { x: P.x, y: P.y, b: P.d, h: P.d }));
        }
        p.appendChild(knopf('huelle-stern stern' + (k.favorit ? ' an' : ''), k.favorit ? '★' : '☆',
          k.favorit ? 'Aus Favoriten entfernen' : 'Zu Favoriten', () => ruf(t.regalH, 'stern', jetzt())));
        t.brett.appendChild(p);
      });
      stelleFokusHer(t.brett, 'login', fokus);
    }
    // Leeres Brett: Hinweis als Text ueber dem Brett
    const text = liste.length ? '' : String(s.brettText || '');
    t.brettText.textContent = text;
    aus(t.brettText, !text);
    markiere(t.brett, s);
  }

  // Ein Plattenruecken: ruecken-<art>.png (CSS), Mini-Profilbild, Name laengs, Live-Punkt.
  // Lage im Fach setzt zeigeFachNeu (--x/--y in Bildpixeln).
  function baueRuecken(fach, e) {
    const k = e.kanal;
    const jetzt = () => fach.kanal.get(e.art + '|' + k.login) || k;
    const p = textLage(el('div', 'ruecken r-' + e.art), { x: 0, y: 0, b: Raum.REGAL.ruecken.b, h: Raum.REGAL.ruecken.h });
    p.tabIndex = 0;
    p.setAttribute('role', 'button');
    p.title = name(k) + (k.live ? (k.game ? ' · ' + k.game : '') : ' · offline');
    p.dataset.login = k.login;
    p.dataset.art = e.art;
    const fenster = textLage(el('div', 'ruecken-stueck ruecken-fenster'), Raum.REGAL.ruecken.fenster);
    profilbild(k, fenster, Raum.REGAL.ruecken.fenster);
    const schrift = textLage(el('div', 'ruecken-stueck ruecken-name', name(k)), Raum.REGAL.ruecken.name);
    p.append(fenster, schrift);
    if (k.live) {
      // ueber punkte: der ausgeschriebene Pfad enthielte einen verbotenen Teilstring (Plan)
      const punkte = Raum.REGAL.livePunkt;
      const P = punkte.ruecken;
      p.appendChild(textLage(el('div', 'ruecken-stueck live-punkt'), { x: P.x, y: P.y, b: P.d, h: P.d }));
    }
    const waehle = () => ruf(t.regalH, 'waehle', jetzt(), e.art);
    p.addEventListener('click', waehle);
    // Doppelklick legt auf: nur Live-Ruecken (live, favorit); ein fremder Twitch-Treffer
    // laedt schon beim Waehlen (home.js, Task 9b), offline hat kein Auflegen.
    p.addEventListener('dblclick', () => {
      const kj = jetzt();
      if (e.art === 'twitch' || !kj.live) return;
      waehle();
      ruf(t.regalH, 'laden', kj.login);
    });
    p.addEventListener('keydown', (ev) => {
      if (ev.target !== p || (ev.key !== 'Enter' && ev.key !== ' ')) return;
      ev.preventDefault();
      ev.stopPropagation();
      waehle();
    });
    return p;
  }

  // Lage der Ruecken: sichtbar sind die ab start (ueberstehende schneidet das Fach ab).
  function zeigeFachNeu(art) {
    const f = faecherNeu[art];
    if (!f.box) return;
    const r = Raum.REGAL.ruecken;
    const y = Raum.REGAL.faecher[art].h - r.h; // auf dem Fachboden stehend
    Array.prototype.forEach.call(f.box.children, (p, i) => {
      p.style.setProperty('--x', (i - f.start) * (r.b + r.abstand));
      p.style.setProperty('--y', y);
    });
  }
  function fachBlaetternNeu(art, richtung) {
    const f = faecherNeu[art];
    if (!f || !f.box) return;
    f.start = Raum.fachFenster(f.anzahl, -1, Raum.REGAL.faecher[art].b, f.start + (richtung > 0 ? 1 : -1),
      { kante: Raum.REGAL.ruecken.b, abstand: Raum.REGAL.ruecken.abstand }).start;
    zeigeFachNeu(art);
  }

  function zeichneFachNeu(art, liste, s) {
    const fach = faecherNeu[art];
    fach.kanal = new Map(liste.map((e) => [e.art + '|' + e.kanal.login, e.kanal]));
    const schluessel = liste.map((e) => [e.art, e.kanal.login, name(e.kanal), e.kanal.avatar || '',
      e.kanal.live ? 1 : 0, e.kanal.game || ''].join('|')).join('\n');
    const umgebaut = fach.schluessel !== schluessel;
    if (umgebaut) {
      fach.schluessel = schluessel;
      const fokus = merkeFokus(fach.box, 'login');
      fach.box.replaceChildren();
      for (const e of liste) fach.box.appendChild(baueRuecken(fach, e));
      stelleFokusHer(fach.box, 'login', fokus);
    }
    fach.anzahl = liste.length;
    markiere(fach.box, s);
    // Die gewaehlte Platte (sonst der Vorschlag) kommt bei neuer Auswahl oder neuem
    // Fach-Inhalt in Sicht; sonst bleibt der Stand vom Mausrad (nur geklemmt).
    let ziel = liste.findIndex((e) => e.kanal.login === s.gewaehlt);
    if (ziel < 0) ziel = liste.findIndex((e) => e.kanal.login === s.vorschlag);
    const zielLogin = ziel >= 0 ? liste[ziel].kanal.login : null;
    const neu = ziel >= 0 && (zielLogin !== fach.gewaehlt || umgebaut);
    fach.gewaehlt = zielLogin;
    fach.start = Raum.fachFenster(fach.anzahl, neu ? ziel : -1, Raum.REGAL.faecher[art].b, fach.start,
      { kante: Raum.REGAL.ruecken.b, abstand: Raum.REGAL.ruecken.abstand }).start;
    zeigeFachNeu(art);
  }

  // belegung = HomeBuehne.regalBelegung(...) { brett, live, unten }; stand = { gewaehlt,
  // vorschlag, brettText, ladend }; Handler h.waehle(kanal, art), h.laden(login), h.stern(kanal).
  function zeichneRegal(belegung, stand, h) {
    if (!wirt || !t.regalNeu) return;
    const b = belegung || {};
    const s = stand || {};
    t.regalH = h;
    t.regalNeu.e.classList.toggle('ladend', !!s.ladend);
    zeichneBrett(b.brett || [], s);
    zeichneFachNeu('live', b.live || [], s);
    zeichneFachNeu('unten', b.unten || [], s);
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

  // Zeilen, die in den vorderen Zettel passen (Raum.zettelZeilen, Bildschirm-Pixel).
  function zettelPlatz() {
    return Raum.zettelZeilen((VORN_ZETTEL.h - ZETTEL_RAND_OBEN - ZETTEL_RAND) * skal.faktor,
      Raum.schriftPx(skal.faktor));
  }

  // Zeilen: Status · Zuschauer, Name, Titel, Spiel, Laufzeit, Kanalpunkte, Knoepfe
  // (je eine Zeile, einzeilig mit "…"); fehlt Hoehe, entfallen zuerst Laufzeit,
  // dann Kanalpunkte (zettelPlatz).
  function zeichneZettel(s, h) {
    const z = t.zettelText;
    const k = s.kanal;
    const fokus = merkeFokus(z, 'id');
    const platz = zettelPlatz();
    t.zettelPlatz = platz.platz;
    z.replaceChildren();
    if (!k) {
      if (s.leerText) z.appendChild(el('div', 'zettel-leer', s.leerText));
      return;
    }
    const status = el('div', 'zettel-status');
    let lauf = '';
    if (s.modus === 'live') {
      lauf = typeof StreamInfo !== 'undefined' ? StreamInfo.laufzeit(k.start, Date.now()) : '';
      status.textContent = ['● LIVE', k.viewersLabel ? k.viewersLabel + ' Zuschauer' : ''].filter(Boolean).join(' · ');
    } else if (s.modus === 'markiert') status.textContent = 'gerade offline gegangen';
    else status.textContent = k.error ? 'Status nicht abrufbar' : 'offline';
    const kanal = el('div', 'zettel-name', name(k));
    if (k.verifiziert) kanal.appendChild(el('span', 'haken', '✓'));
    z.append(status, kanal);
    const an = s.modus !== 'offline';
    if (an && k.title && platz.titel) z.appendChild(el('div', 'zettel-titel', k.title));
    if (an && k.game && platz.spiel) z.appendChild(el('div', 'zettel-spiel', k.game));
    if (lauf && platz.laufzeit) z.appendChild(el('div', 'zettel-laufzeit', lauf));
    if (an && s.punkte && platz.punkte) z.appendChild(punkteZeile(s.punkte));
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

  // --- Regal: grosse Huelle mit VODs auf der Rueckseite -------------------------
  function vodBild(url, c) {
    if (!url) return;
    const img = new Image();
    img.decoding = 'async';
    img.addEventListener('load', () => {
      // mittig auf 32:9 zuschneiden, in Canvas-Groesse zeichnen (CSS vergroessert scharfkantig)
      const w = img.naturalWidth;
      const hoch = Math.min(img.naturalHeight, w * c.height / c.width); // Form der Canvas (64x18 oder 64x36)
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.drawImage(img, 0, (img.naturalHeight - hoch) / 2, w, hoch, 0, 0, c.width, c.height);
    });
    img.src = url;
  }

  // Grosse Huelle: herausnehmen und umdrehen (neuer Kanal), sonst nur die Liste
  // neu, wenn sich ihr Inhalt aendert (Scrollstand bleibt sonst stehen).
  function zeichneGross(s, h) {
    const k = s.kanal;
    const r = k ? s.rueckseite : null;
    t.grossH = h;
    t.grossK = k;
    if (!r) {
      aus(t.gross, true);
      t.grossKarte.classList.remove('gedreht');
      t.grossLogin = null;
      t.grossSchluessel = null;
      t.grossListe.replaceChildren();
      return;
    }
    if (t.grossLogin !== k.login) {
      t.grossLogin = k.login;
      t.grossFenster.replaceChildren();
      profilbild(k, t.grossFenster, GROSS_FENSTER);
      t.grossKarte.classList.remove('gedreht');
      aus(t.gross, false);
      void t.grossKarte.offsetWidth; // Vorderseite festschreiben, sonst kein Umdrehen
      t.grossKarte.classList.add('gedreht');
    }
    zeichneVodListe(r);
  }

  // Rueckseite: alle geladenen VODs untereinander, senkrecht scrollbar
  // (Mausrad nativ, ↑/↓ ueber vodsScrollen); "Alle VODs" (mehr) am Ende ab 24.
  function zeichneVodListe(r) {
    const k = t.grossK;
    const schluessel = [k.login, r.status, (r.vods || []).map((v) => v.id).join(','), r.mehr ? 1 : 0].join('|');
    if (t.grossSchluessel === schluessel) return;
    t.grossSchluessel = schluessel;
    const fokus = merkeFokus(t.gross, 'id');
    const liste = t.grossListe;
    liste.replaceChildren();
    liste.scrollTop = 0;
    const status = { laden: 'lade VODs …', leer: 'Keine VODs', fehler: 'VODs nicht abrufbar' }[r.status];
    if (status) {
      liste.appendChild(el('div', 'gross-status', status));
      stelleFokusHer(t.gross, 'id', fokus);
      return;
    }
    for (const v of r.vods || []) {
      const b = knopf('gross-vod', null, null, () => ruf(t.grossH, 'vod', v.id));
      b.title = [v.title, v.lengthLabel, v.publishedLabel, v.viewsLabel ? v.viewsLabel + ' Aufrufe' : ''].filter(Boolean).join(' · ');
      b.dataset.id = 'vod-' + v.id;
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 18;
      vodBild(v.thumb, c);
      const text = el('span', 'gross-vod-text');
      text.append(el('span', 'gross-vod-titel', v.title || 'VOD'),
        el('span', 'gross-vod-info', [v.publishedLabel, v.lengthLabel].filter(Boolean).join(' · ')));
      b.append(c, text);
      liste.appendChild(b);
    }
    if (r.mehr) {
      const mehr = knopf('gross-mehr', 'Alle VODs', 'Alle VODs in der Liste', () => ruf(t.grossH, 'mehr', t.grossK));
      mehr.dataset.id = 'mehr';
      liste.appendChild(mehr);
    }
    stelleFokusHer(t.gross, 'id', fokus);
  }

  // ↑/↓ bei herausgenommener Platte: Liste scrollen statt zuruecklegen (home.js).
  function vodsScrollen(richtung) {
    if (!grossOffen()) return false;
    const eine = t.grossListe.querySelector('.gross-vod');
    t.grossListe.scrollBy({ top: (richtung > 0 ? 1 : -1) * (eine ? eine.offsetHeight : 24) });
    return true;
  }

  // --- Regal: Karte zeichnen ----------------------------------------------------
  // stand = { kanal, modus, seite: 'vorn'|'rueck', vods: { status, liste, weitere,
  // laedtNach, laufend }|null, punkte }|null; null legt die Karte weg.
  function zeichneKarte(stand, h) {
    if (!wirt) return;
    const k = stand && stand.kanal ? stand.kanal : null;
    t.karteStand = k ? stand : null;
    if (!k) {
      aus(t.karteWurzel, true);
      t.karteKarte.classList.remove('gedreht');
      t.karteLogin = null;
      t.karteKv = null;
      t.karteInfo.replaceChildren();
      t.karteKopf.replaceChildren();
      t.karteVods.replaceChildren();
      return;
    }
    t.karteH = h;
    t.karteZu = () => ruf(h, 'zuruecklegen');
    t.karteLaden = (login) => ruf(h, 'laden', login);
    t.karteVodKlick = (id) => ruf(h, 'vod', id);
    t.karteMehr = () => ruf(h, 'mehrVods');
    const rueck = stand.seite === 'rueck';
    if (t.karteLogin !== k.login) {
      // neu herausgenommen; steht sie schon auf der Rueckseite, ohne Drehen einblenden
      t.karteLogin = k.login;
      t.karteKv = null;
      t.karteFenster.replaceChildren();
      profilbild(k, t.karteFenster, GROSS_FENSTER);
      t.karteKarte.classList.add('ohne-drehen');
      t.karteKarte.classList.toggle('gedreht', rueck);
      aus(t.karteWurzel, false);
      void t.karteKarte.offsetWidth; // Stand festschreiben, sonst dreht sie doch
      t.karteKarte.classList.remove('ohne-drehen');
    } else {
      t.karteKarte.classList.toggle('gedreht', rueck);
    }
    zeichneKarteVorn(stand, k, h);
    // Rueckseite: Kopf (Titel, Stern, bei Live-Platten "Vorderseite") und Liste
    const fokus = merkeFokus(t.karteRueck, 'id');
    t.karteKopf.replaceChildren();
    t.karteKopf.appendChild(el('div', 'karte-kopf-titel', 'VODs · ' + name(k)));
    const stern = knopf('karte-knopf stern' + (k.favorit ? ' an' : ''), k.favorit ? '★' : '☆',
      k.favorit ? 'Aus Favoriten entfernen' : 'Zu Favoriten', () => ruf(h, 'stern', k));
    stern.dataset.id = 'stern-rueck';
    t.karteKopf.appendChild(stern);
    if (stand.modus === 'live') {
      const vorn = knopf('karte-knopf', 'Vorderseite', 'Karte umdrehen', () => ruf(h, 'umdrehen'));
      vorn.dataset.id = 'vorderseite';
      t.karteKopf.appendChild(vorn);
    }
    stelleFokusHer(t.karteRueck, 'id', fokus);
    zeichneKarteVods(stand.vods, k.login);
  }

  // Vorderseite: Status, Name, Titel, Spiel, Zuschauer, Laufzeit und Kanalpunkte, Knoepfe.
  function zeichneKarteVorn(s, k, h) {
    const z = t.karteInfo;
    const fokus = merkeFokus(z, 'id');
    z.replaceChildren();
    const an = s.modus !== 'offline';
    let lauf = '';
    let status;
    if (s.modus === 'live') {
      status = '● LIVE';
      lauf = typeof StreamInfo !== 'undefined' ? StreamInfo.laufzeit(k.start, Date.now()) : '';
    } else if (s.modus === 'markiert') status = 'gerade offline gegangen';
    else status = k.error ? 'Status nicht abrufbar' : 'offline';
    z.appendChild(el('div', 'karte-status', status));
    const kanal = el('div', 'karte-name', name(k));
    if (k.verifiziert) kanal.appendChild(el('span', 'haken', '✓'));
    z.appendChild(kanal);
    if (an && k.title) z.appendChild(el('div', 'karte-titel', k.title));
    if (an && k.game) z.appendChild(el('div', 'karte-spiel', k.game));
    if (s.modus === 'live' && k.viewersLabel) z.appendChild(el('div', 'karte-zuschauer', k.viewersLabel + ' Zuschauer'));
    const punkte = an && s.punkte ? Number(s.punkte.balance || 0).toLocaleString('de-DE') + ' Punkte' : '';
    const klein = [lauf, punkte].filter(Boolean).join(' · ');
    if (klein) z.appendChild(el('div', 'karte-klein', klein));
    const knoepfe = el('div', 'karte-knoepfe');
    const stern = knopf('karte-knopf stern' + (k.favorit ? ' an' : ''), k.favorit ? '★' : '☆',
      k.favorit ? 'Aus Favoriten entfernen' : 'Zu Favoriten', () => ruf(h, 'stern', k));
    stern.dataset.id = 'stern';
    knoepfe.appendChild(stern);
    if (s.modus === 'live') {
      const auf = knopf('karte-knopf', 'Auflegen', 'Stream laden', () => ruf(h, 'laden', k.login));
      auf.dataset.id = 'laden';
      knoepfe.appendChild(auf);
    }
    const vods = knopf('karte-knopf', 'VODs ↻', 'VODs ansehen', () => ruf(h, 'umdrehen'));
    vods.dataset.id = 'umdrehen';
    knoepfe.appendChild(vods);
    z.appendChild(knoepfe);
    stelleFokusHer(z, 'id', fokus);
  }

  function karteVodInfo(rest, laufend) {
    return [laufend ? '● läuft' : '', rest].filter(Boolean).join(' · ');
  }
  // Das laufende VOD wechselt, die Liste bleibt: Markierung an den vorhandenen Zeilen nachziehen.
  function karteSetzeLaufend(laufend) {
    for (const b of t.karteVods.querySelectorAll('.karte-vod')) {
      const an = b.dataset.id === 'vod-' + laufend;
      b.classList.toggle('laeuft', an);
      const info = b.querySelector('.karte-vod-info');
      if (info) info.textContent = karteVodInfo(b.dataset.info, an);
    }
  }

  // Eine VOD-Zeile: Vorschau links (Canvas 64x36, 16:9), Titel, darunter Spiel · wann · Laenge.
  // Einziger Weg, Zeilen zu bauen: neu bauen und Anhaengen haben dieselbe Vorschau.
  // Fehlt thumb, bleibt die Canvas eine ruhige Flaeche (CSS) und haelt den Platz.
  function karteVodZeile(v, laufend) {
    const b = el('button', 'karte-vod' + (laufend ? ' laeuft' : ''));
    b.type = 'button';
    b.addEventListener('click', (e) => { e.stopPropagation(); if (t.karteVodKlick) t.karteVodKlick(v.id); });
    b.title = [v.title, v.game, v.lengthLabel, v.publishedLabel, v.viewsLabel ? v.viewsLabel + ' Aufrufe' : ''].filter(Boolean).join(' · ');
    b.dataset.id = 'vod-' + v.id;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 36;
    vodBild(v.thumb, c);
    const text = el('span', 'karte-vod-text');
    b.dataset.info = [v.game, v.publishedLabel, v.lengthLabel].filter(Boolean).join(' · ');
    text.append(el('span', 'karte-vod-titel', v.title || 'VOD'),
      el('span', 'karte-vod-info', karteVodInfo(b.dataset.info, laufend)));
    b.append(c, text);
    return b;
  }

  // Liste: gleicher Kanal und dieselben Zeilen vorn -> nur neue Zeilen anhaengen
  // (Scrollstand bleibt), sonst neu bauen und nach oben.
  function zeichneKarteVods(vods, login) {
    const liste = t.karteVods;
    const alle = vods && vods.liste ? vods.liste : [];
    const laufend = vods ? vods.laufend : null;
    const kv = t.karteKv || { login: null, ids: [] };
    const anhaengen = kv.login === login && kv.ids.length > 0 && kv.ids.every((id, i) => alle[i] && alle[i].id === id);
    if (anhaengen) {
      for (let i = kv.ids.length; i < alle.length; i++) {
        liste.insertBefore(karteVodZeile(alle[i], alle[i].id === laufend), t.karteFuss);
      }
      if (kv.laufend !== laufend) karteSetzeLaufend(laufend);
    } else {
      const fokus = merkeFokus(t.karteRueck, 'id');
      liste.replaceChildren();
      liste.scrollTop = 0;
      if (!alle.length) {
        const status = { laden: 'lade VODs …', leer: 'Keine VODs', fehler: 'VODs nicht abrufbar' }[vods ? vods.status : 'laden'];
        liste.appendChild(el('div', 'karte-status-leer', status || 'lade VODs …'));
      }
      for (const v of alle) liste.appendChild(karteVodZeile(v, v.id === laufend));
      liste.appendChild(t.karteFuss);
      stelleFokusHer(t.karteRueck, 'id', fokus);
    }
    t.karteKv = { login, ids: alle.map((v) => v.id), laufend };
    t.karteFuss.textContent = vods && vods.laedtNach ? 'lade weitere …' : '';
    aus(t.karteFuss, !(vods && vods.laedtNach));
    // Ohne Scrollleiste (kurze Liste) kommt nie ein scroll-Ereignis: nach dem Zeichnen pruefen
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(karteNachladen);
  }

  // Am Ende der Liste (2 Zeilenhoehen davor) weitere VODs anfordern.
  function karteNachladen() {
    const v = t.karteStand ? t.karteStand.vods : null;
    const liste = t.karteVods;
    if (!v || !v.weitere || v.laedtNach || !t.karteMehr || !liste || !liste.clientHeight) return;
    const eine = liste.querySelector('.karte-vod');
    const zeile = eine ? eine.offsetHeight : 36;
    if (liste.scrollTop + liste.clientHeight >= liste.scrollHeight - 2 * zeile) t.karteMehr();
  }

  // ↑/↓ bei offener Rueckseite: Liste scrollen statt zuruecklegen (home.js).
  function kartenScrollen(richtung) {
    // nur die Rueckseite scrollt (gedreht); vorn tut kartenScrollen nichts
    if (!karteOffen() || !t.karteKarte.classList.contains('gedreht')) return false;
    const eine = t.karteVods.querySelector('.karte-vod');
    t.karteVods.scrollBy({ top: (richtung > 0 ? 1 : -1) * (eine ? eine.offsetHeight : 36) });
    return true;
  }

  function zeichneBuehne(stand, h) {
    if (!wirt) return;
    const s = stand || {};
    const k = s.kanal || null;
    t.vornStand = s;
    t.buehneH = h;
    const gedreht = !!k && !!s.rueckseite;
    t.vorn.classList.toggle('ladend', !!s.ladend);
    t.vorn.classList.toggle('offline', !!k && s.modus === 'offline');
    // herausgenommen: Huelle und Platte fehlen im Fach, der Zettel bleibt
    aus(t.vornHuelle, !k || gedreht);
    aus(t.vornPlatte, !k || gedreht);
    zeichneVornHuelle(k);
    zeichneZettel(s, h);
    zeichneGross(s, h);
  }

  // --- Ablauf, Tafel, Schild, Fernseher --------------------------------------------------
  // Kamera je Abschnitt: auf den Plattenspieler (ablauf-spieler), dann der
  // gruene Bildschirm fuellt das Fenster (ablauf-zoom); sonst keine (null).
  function kameraZiel() {
    const k = wirt.classList;
    const ziel = k.contains('ablauf-zoom') ? Raum.TV_RECHTECK
      : k.contains('ablauf-spieler') ? Raum.PLATTENSPIELER_RECHTECK : null;
    return ziel ? Raum.kameraZiel(ziel, wirt.clientWidth, wirt.clientHeight) : null;
  }
  // Naechster Abschnitt nach ms (seit Beginn des Ablaufs).
  function abschnitt(ms, f) { ablaufTimer.push(setTimeout(f, ms)); }

  // Auflegen: Regal blendet zum Raum (ablauf-raum, 500 ms), Kamera faehrt zum
  // Plattenspieler (ablauf-spieler, 1200 ms), die Platte dreht sich
  // (ablauf-dreht, 1500 ms, dreht weiter bis zum Ende), Schwenk und Zoom in den
  // Fernseher (ablauf-zoom, 2000 ms). Die Uebergaenge stehen in
  // home-raum.css; home.js steuert die Mindestdauer (5200 ms).
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
    const m = ABLAUF_MS;
    abschnitt(m.raum, () => {
      wirt.classList.add('ablauf-spieler');
      neuAusrichten();
    });
    abschnitt(m.raum + m.spieler, () => {
      aus(t.dreht, false);
      wirt.classList.add('ablauf-dreht');
    });
    abschnitt(m.raum + m.spieler + m.dreht, () => {
      wirt.classList.add('ablauf-zoom');
      neuAusrichten();
    });
  }
  // Setzt alles zurueck (auch nach Fehler): Timer, Klassen, Platte, Kamera, Ansicht.
  function versteckeAblauf() {
    if (!wirt) return;
    ablaufRuf = null;
    ablaufTimer.forEach((x) => clearTimeout(x));
    ablaufTimer = [];
    // Mit den Klassen faellt auch der Uebergang weg: Ruecksprung ohne Animation.
    wirt.classList.remove('im-ablauf', 'ablauf-raum', 'ablauf-spieler', 'ablauf-dreht', 'ablauf-zoom');
    aus(t.dreht, !spielt);
    aus(t.ablauf, true);
    zeigeAnsicht(aktuell); // Raum/Regal wie vorher, ruft neuAusrichten()
  }

  // Platte dreht im Raum, solange ein Stream oder VOD spielt (video.js meldet jeden
  // On-Air-Wechsel, auch vor dem Aufbau). Im Ablauf steuert der Ablauf die Platte.
  function plattenspielerLaeuft(an) {
    spielt = !!an;
    if (!wirt || wirt.classList.contains('im-ablauf')) return;
    aus(t.dreht, !spielt);
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
    hinweisText = String(text || '');
    zeigeUnten();
    clearTimeout(schildTimer);
    schildTimer = setTimeout(() => { hinweisText = ''; zeigeUnten(); }, SCHILD_MS);
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

  // Raum-Animationen an/aus (home.js: Home offen und Animationen an). In der
  // Regal-Ansicht ist #raum-ebene verborgen; die Timer duerfen weiterlaufen.
  function leben(an) {
    if (!t.leben) return;
    if (an) t.leben.an();
    else t.leben.aus();
  }

  return {
    init, zeigeAnsicht, ansicht, zeichneBuehne, zeichneStaender, fachBlaettern,
    zeigeAblauf, versteckeAblauf, zeigeTafel, versteckeTafel, tafelOffen,
    zeigeSchild, setzeTv, neuAusrichten, vodsScrollen, zeichneKarte, kartenScrollen, karteOffen, leben, plattenspielerLaeuft,
    zeichneRegal,
  };
})();
