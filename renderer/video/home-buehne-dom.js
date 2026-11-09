// Darstellung der Home-Buehne: CD-Huelle (Vorder- und Rueckseite),
// Info-Block mit Nachbarn, Regal mit Ruecken. Nur DOM, keine Steuerung:
// Zustand und Klick-Folgen kommen von home.js (Handler-Objekt h).
// IIFE: setzt nur window.HomeBuehneDom (gemeinsamer globaler Bereich mit
// video.js/home.js, siehe Plan 2026-11-09-home-cd).

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

  // Knopf, dessen Klick nicht zum Cover/Ruecken darunter durchgeht.
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

  function sternKnopf(k, cls, h) {
    const b = knopf(cls + ' stern' + (k.favorit ? ' an' : ''), k.favorit ? '★' : '☆',
      k.favorit ? 'Aus Favoriten entfernen' : 'Zu Favoriten', () => ruf(h, 'stern', k));
    return b;
  }

  // Bild mit Rueckfall: erst die Vorschau, dann das Profilbild, sonst
  // bleibt nur die Theme-Farbe des Rahmens sichtbar.
  function bild(urls) {
    const liste = urls.filter(Boolean);
    if (!liste.length) return null;
    const img = el('img');
    img.alt = '';
    let i = 0;
    img.onerror = () => {
      i += 1;
      if (i < liste.length) img.src = liste[i];
      else img.remove();
    };
    img.src = liste[0];
    return img;
  }

  // Teil von #cd-info finden oder anlegen (Text und Nachbarn getrennt,
  // damit zeichneBuehne die Nachbarn nicht loescht und umgekehrt).
  function infoTeil(cls) {
    const info = document.getElementById('cd-info');
    let t = info.querySelector(':scope > .' + cls);
    if (!t) {
      t = el('div', cls);
      if (cls === 'cd-text') info.prepend(t); else info.appendChild(t);
    }
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

  // Vorderseite einmal je CD (Modus + Login) aufbauen. Die Knoepfe lesen
  // Kanal und Handler aus cd, damit ein Neuzeichnen sie nur aktualisiert
  // (kein Blinken des Covers, Tastatur-Fokus bleibt).
  function baueFront(front, k, modus) {
    const live = modus === 'live';
    const cd = { schluessel: modus + '|' + k.login, k, h: null, vorschau: null, img: null, sticker: null };
    const cover = el('div', 'cd-cover');
    if (modus !== 'offline') cd.vorschau = HomeBuehne.vorschauUrl(k.login, Date.now());
    cd.img = bild([cd.vorschau, k.avatar]);
    if (cd.img) cover.appendChild(cd.img);
    if (live) {
      cover.title = 'Klick: Stream laden';
      cover.addEventListener('click', () => ruf(cd.h, 'laden', cd.k.login));
    }
    front.appendChild(cover);
    cd.cover = cover;

    if (modus !== 'offline') {
      const play = knopf('cd-play', '▶', live ? 'Stream laden' : 'Gerade offline', () => ruf(cd.h, 'laden', cd.k.login));
      play.disabled = !live;
      front.appendChild(play);
    }
    front.appendChild(knopf('cd-vods', 'VODs', 'VODs ansehen', () => ruf(cd.h, 'vods', cd.k)));
    cd.stern = knopf('cd-stern stern', '☆', '', () => ruf(cd.h, 'stern', cd.k));
    front.appendChild(cd.stern);
    return cd;
  }

  // Neue Vorschau erst tauschen, wenn sie geladen ist; bis dahin bleibt das alte Bild.
  function neueVorschau(cd, url) {
    if (!url || url === cd.vorschau) return;
    cd.vorschau = url;
    const probe = new Image();
    probe.onload = () => {
      if (cd.vorschau !== url || !cd.cover.isConnected) return;
      if (cd.img && cd.img.isConnected) {
        cd.img.src = url;
      } else {
        cd.img = bild([url, cd.k.avatar]);
        if (cd.img) cd.cover.prepend(cd.img);
      }
    };
    probe.src = url;
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

  // Rueckseite nur neu bauen, wenn sich Kanal, Status oder VOD-Liste
  // aendern; Knoepfe lesen Handler und Kanal aus rueck (bleiben frisch).
  // Nach einem Neubau Fokus per data-id wiederherstellen.
  function zeichneRueck(rueck, stand, h) {
    const k = stand.kanal;
    const r = stand.rueckseite;
    rueck._h = h;
    rueck._k = k;
    const schluessel = k && r
      ? [k.login, name(k), r.status, r.mehr ? 1 : 0, (r.vods || []).map((v) => v.id).join(',')].join('|')
      : null;
    if (rueck._schluessel === schluessel) return;
    rueck._schluessel = schluessel;
    const fokus = merkeFokus(rueck, 'id');
    rueck.replaceChildren();
    if (!k || !r) return;
    const kopf = el('div', 'cd-rueck-kopf');
    kopf.appendChild(el('span', 'cd-rueck-name', name(k)));
    const zu = knopf('cd-zu', '↩', 'Zurueckdrehen', () => ruf(rueck._h, 'rueckseiteZu'));
    zu.dataset.id = 'zu';
    kopf.appendChild(zu);
    rueck.appendChild(kopf);

    const status = { laden: 'lade VODs …', leer: 'Keine VODs', fehler: 'VODs nicht abrufbar' }[r.status];
    if (status) {
      rueck.appendChild(el('div', 'cd-rueck-status', status));
      stelleFokusHer(rueck, 'id', fokus);
      return;
    }
    const liste = el('ol', 'cd-tracks');
    (r.vods || []).forEach((v, i) => {
      const li = el('li');
      const b = knopf('cd-track', null, v.title, () => ruf(rueck._h, 'vod', v.id));
      b.dataset.id = 'vod-' + v.id;
      b.append(
        el('span', 'nr', String(i + 1)),
        el('span', 'titel', v.title || ''),
        el('span', 'laenge', v.lengthLabel || ''),
        el('span', 'datum', v.publishedLabel || ''));
      li.appendChild(b);
      liste.appendChild(li);
    });
    rueck.appendChild(liste);
    if (r.mehr) {
      const mehr = knopf('cd-mehr', 'Mehr', 'Alle VODs', () => ruf(rueck._h, 'mehr', rueck._k));
      mehr.dataset.id = 'mehr';
      rueck.appendChild(mehr);
    }
    stelleFokusHer(rueck, 'id', fokus);
  }

  function zeichneInfo(stand) {
    const t = infoTeil('cd-text');
    t.replaceChildren();
    const k = stand.kanal;
    if (!k) return;
    t.appendChild(nameMitHaken(k, 'cd-name'));
    if (stand.modus === 'markiert') t.appendChild(el('div', 'cd-hinweis', 'gerade offline gegangen'));
    if (stand.modus === 'offline') {
      t.appendChild(el('div', 'cd-meta', k.error ? 'Status nicht abrufbar' : 'offline'));
      return;
    }
    if (k.title) t.appendChild(el('div', 'cd-titel', k.title));
    const teile = [
      StreamInfo.laufzeit(k.start, Date.now()),
      k.viewersLabel ? k.viewersLabel + ' Zuschauer' : '',
      k.game || '',
    ].filter(Boolean);
    if (teile.length) t.appendChild(el('div', 'cd-meta', teile.join(' · ')));
  }

  function zeichneBuehne(stand, h) {
    const s = stand || {};
    const huelle = document.getElementById('cd-huelle');
    const front = huelle.querySelector('.cd-front');
    const rueck = huelle.querySelector('.cd-rueck');
    const k = s.kanal || null;
    huelle.classList.toggle('ladend', !!s.ladend);
    huelle.classList.toggle('steht', !!k && s.modus === 'markiert');
    huelle.classList.toggle('offline', !!k && s.modus === 'offline');
    huelle.classList.toggle('gedreht', !!k && !!s.rueckseite);
    zeichneFront(front, s, h);
    zeichneRueck(rueck, s, h);
    zeichneInfo(s);
  }

  function zeichneNachbarn(kanaele, beiKlick) {
    const box = infoTeil('cd-nachbarn');
    box.replaceChildren();
    (kanaele || []).slice(0, 3).forEach((k) => {
      const b = knopf('cd-nachbar', null, name(k), () => { if (beiKlick) beiKlick(k.login); });
      const img = bild([HomeBuehne.vorschauUrl(k.login, Date.now()), k.avatar]);
      if (img) b.appendChild(img);
      box.appendChild(b);
    });
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

  // Nur neu bauen, wenn sich der Inhalt aendert (sonst geht der
  // Tastatur-Fokus bei jedem renderHome verloren).
  function zeichneRegal(eintraege, h) {
    const regal = document.getElementById('home-regal');
    const liste = eintraege || [];
    // Klicks lesen Handler und Kanal-Stand von hier (bleiben bei behaltenen Knoten frisch).
    regal._h = h;
    regal._kanal = new Map(liste.map((e) => [e.art + '|' + e.kanal.login, e.kanal]));
    const schluessel = liste.map((e) => [e.art, e.kanal.login, name(e.kanal),
      e.kanal.favorit ? 1 : 0, e.kanal.verifiziert ? 1 : 0, e.kanal.live ? 1 : 0].join('|')).join('\n');
    if (regal._schluessel === schluessel) return;
    regal._schluessel = schluessel;
    const fokus = merkeFokus(regal, 'login');
    regal.replaceChildren();
    liste.forEach((e) => {
      const k = e.kanal;
      const jetzt = () => regal._kanal.get(e.art + '|' + k.login) || k;
      const hJetzt = { stern: () => ruf(regal._h, 'stern', jetzt()) };
      const r = el('div', 'ruecken');
      r.tabIndex = 0;
      r.setAttribute('role', 'button');
      r.title = name(k);
      r.dataset.art = e.art;
      r.dataset.login = k.login;
      const oeffnen = () => {
        if (e.art === 'twitch' && k.live) ruf(regal._h, 'laden', k.login);
        else ruf(regal._h, 'oeffne', jetzt());
      };
      r.addEventListener('click', oeffnen);
      r.addEventListener('keydown', (ev) => {
        if (ev.target !== r || (ev.key !== 'Enter' && ev.key !== ' ')) return;
        ev.preventDefault();
        ev.stopPropagation(); // Leertaste nicht als Play/Pause im Video-Fenster
        oeffnen();
      });
      r.appendChild(sternKnopf(k, 'ruecken-stern', hJetzt));
      r.appendChild(nameMitHaken(k, 'ruecken-name'));
      regal.appendChild(r);
    });
    stelleFokusHer(regal, 'login', fokus);
  }

  // CD-Wechsel: Schlitten faehrt in 180 ms in die Huelle (.rein), dann
  // tauscht tausche() den Inhalt, und er faehrt in 220 ms wieder heraus
  // (.raus). Die Scheibe dreht dabei unabhaengig weiter. Kommt waehrend
  // .rein ein weiterer Wechsel, zeichnet das eine tausche() den letzten Stand.
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

  // --- Riesen-Namen hinter der Buehne --------------------------------------
  // #home-namen hat 6 Zeilen; Zeile 3 ist die Mittelzeile (Name der CD vorne).
  // Die Zeilen entstehen beim ersten Zugriff, damit zeichneMitte auch vor dem
  // ersten zeichneNamen funktioniert.
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

  // Laufzeilen 1,2,4,5,6 neu bauen: zwei gleiche Haelften, das Band laeuft
  // um -50% und setzt so nahtlos wieder an. Jede Haelfte wiederholt den
  // Zeileninhalt so oft, bis sie mindestens so breit ist wie #home-namen
  // bzw. wie der Bildschirm (sonst liefe bei wenigen Namen eine Luecke mit). Einmal messen beim
  // Bauen, nie pro Bild. Neubau startet die Baender neu, daher nur einmal
  // je Oeffnen und nach einem Theme-Wechsel aufrufen.
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
    // Bildschirmbreite deckt jedes Fenster auf diesem Bildschirm (auch nach
    // dem Vergroessern ohne Neubau).
    const breite = Math.max(document.getElementById('home-namen').clientWidth, screen.availWidth || 0);
    for (let z = 1; z <= 6; z++) {
      if (z === MITTE) continue;
      const band = el('div', 'namen-band');
      const inhalt = HomeBuehne.zeilenInhalt(auswahl || [], z);
      zeilen[z - 1].replaceChildren(band);
      if (!inhalt.length) continue; // leere Auswahl -> leeres Band
      // Einmal messen; ist nichts messbar (Home zu, Zeile ausgeblendet),
      // grob ueber die Zeichenzahl schaetzen (Zeile ~ 120 Zeichen breit).
      const probe = haelfte(inhalt, 1);
      band.appendChild(probe);
      const w = probe.offsetWidth;
      const zeichen = inhalt.reduce((s, n) => s + String(n.name).length + 1, 0);
      const mal = w > 0 && breite > 0 ? Math.ceil(breite / w) : Math.ceil(120 / Math.max(1, zeichen));
      const k = Math.min(MAX_WIEDERHOLUNG, Math.max(1, mal));
      band.replaceChildren(haelfte(inhalt, k), haelfte(inhalt, k));
    }
  }

  // Mittelzeile: gleicher Name -> nichts tun (Drift und Schein laufen weiter),
  // sonst neuer Text, der einblendet. null -> leer.
  let mitteName;
  function zeichneMitte(neu) {
    const n = neu || null;
    if (n === mitteName) return;
    mitteName = n;
    const zeile = namenZeilen()[MITTE - 1];
    zeile.replaceChildren();
    if (n) zeile.appendChild(el('span', 'namen-mitte-text', n));
  }

  return { zeichneBuehne, zeichneNachbarn, zeichneRegal, cdWechsel, cdWechselLaeuft, zeichneNamen, zeichneMitte };
})();
