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

  function zeichneRueck(rueck, stand, h) {
    const k = stand.kanal;
    const r = stand.rueckseite;
    if (!k || !r) return;
    const kopf = el('div', 'cd-rueck-kopf');
    kopf.appendChild(el('span', 'cd-rueck-name', name(k)));
    kopf.appendChild(knopf('cd-zu', '↩', 'Zurueckdrehen', () => ruf(h, 'rueckseiteZu')));
    rueck.appendChild(kopf);

    const status = { laden: 'lade VODs …', leer: 'Keine VODs', fehler: 'VODs nicht abrufbar' }[r.status];
    if (status) {
      rueck.appendChild(el('div', 'cd-rueck-status', status));
      return;
    }
    const liste = el('ol', 'cd-tracks');
    (r.vods || []).forEach((v, i) => {
      const li = el('li');
      const b = knopf('cd-track', null, v.title, () => ruf(h, 'vod', v.id));
      b.append(
        el('span', 'nr', String(i + 1)),
        el('span', 'titel', v.title || ''),
        el('span', 'laenge', v.lengthLabel || ''),
        el('span', 'datum', v.publishedLabel || ''));
      li.appendChild(b);
      liste.appendChild(li);
    });
    rueck.appendChild(liste);
    if (r.mehr) rueck.appendChild(knopf('cd-mehr', 'Mehr', 'Alle VODs', () => ruf(h, 'mehr', k)));
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
    rueck.replaceChildren();
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

  function zeichneRegal(eintraege, h) {
    const regal = document.getElementById('home-regal');
    regal.replaceChildren();
    (eintraege || []).forEach((e) => {
      const k = e.kanal;
      const r = el('div', 'ruecken');
      r.tabIndex = 0;
      r.setAttribute('role', 'button');
      r.title = name(k);
      r.dataset.art = e.art;
      const oeffnen = () => {
        if (e.art === 'twitch' && k.live) ruf(h, 'laden', k.login);
        else ruf(h, 'oeffne', k);
      };
      r.addEventListener('click', oeffnen);
      r.addEventListener('keydown', (ev) => {
        if (ev.target !== r || (ev.key !== 'Enter' && ev.key !== ' ')) return;
        ev.preventDefault();
        oeffnen();
      });
      r.appendChild(sternKnopf(k, 'ruecken-stern', h));
      r.appendChild(nameMitHaken(k, 'ruecken-name'));
      regal.appendChild(r);
    });
  }

  return { zeichneBuehne, zeichneNachbarn, zeichneRegal };
})();
