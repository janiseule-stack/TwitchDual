// Vorhersage-Karte mit drei Ansichten (Duell · Verlauf · Stats), Effekten
// (Funken, Hochzaehlen, Konfetti) und Ergebnis-Anzeige. Rechnet nichts selbst:
// Zahlen kommen aus renderer/lib/vorhersage-statistik.js. ereignis-karten.js
// ruft VorhersageKarte.baue() bei jedem Neuaufbau.
(function (root) {
  const SVG = 'http://www.w3.org/2000/svg';
  const TABS = [['duell', 'Duell'], ['verlauf', 'Verlauf'], ['stats', 'Stats']];
  const FARBE = { BLUE: '#6db6ff', PINK: '#ff6fb6' };
  const PALETTE = ['#6db6ff', '#ff6fb6', '#ffd34d', '#7dffb0', '#c08bff', '#ff9f5a', '#5ff0ff', '#ff6b6b', '#b5e86b', '#f0f0f0'];
  const KONFETTI_MS = 6000;
  const de = (n) => Math.round(n).toLocaleString('de-DE');
  const kurz = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',').replace(',0', '') + ' Mio.'
    : n >= 1e4 ? Math.round(n / 1000) + 'k' : de(n);
  const quoteText = (q) => q ? q.toFixed(2).replace('.', ',') + '×' : '–';

  // Bei 2 Antworten Twitchs Blau/Pink, bei mehr eine Palette je Platz.
  function farben(v) {
    const n = v.optionen.length;
    return Object.fromEntries(v.optionen.map((o, i) => [o.id, n <= 2 ? (FARBE[o.farbe] || PALETTE[i]) : PALETTE[i % PALETTE.length]]));
  }

  function svg(doc, tag, attrs) {
    const e = doc.createElementNS(SVG, tag);
    for (const [k, w] of Object.entries(attrs || {})) e.setAttribute(k, String(w));
    return e;
  }

  // ctx: { doc, el, v, stand, KE, VS, verlauf, tab, setzeTab, jetzt, zaehle, funken, endeSeit, bedieneSetzen }
  function baue(ctx) {
    const { el, v, stand, VS } = ctx;
    const karte = ctx.karte;
    const fb = farben(v);
    const tipp = stand.meinTipp && stand.meinTipp.eventId === v.id ? stand.meinTipp : null;
    const fertig = v.status === 'RESOLVED';

    // Tabs
    const tabs = el('div', 'vk-tabs');
    for (const [id, name] of TABS) {
      const b = el('button', 'vk-tab' + (ctx.tab === id ? ' an' : ''), name);
      b.type = 'button';
      b.addEventListener('click', (ev) => { ev.stopPropagation(); ctx.setzeTab(id); });
      tabs.appendChild(b);
    }
    karte.appendChild(tabs);

    if (ctx.tab === 'verlauf') karte.appendChild(verlaufAnsicht(ctx, fb));
    else if (ctx.tab === 'stats') karte.appendChild(statsAnsicht(ctx, fb));
    else karte.appendChild(duellAnsicht(ctx, fb, tipp));

    // Eigener Einsatz / Ergebnis
    if (fertig) {
      const sieger = v.optionen.find((o) => o.id === v.gewinnerId);
      let text = (sieger ? sieger.titel : '?') + ' gewinnt';
      let art = 'neutral';
      if (tipp) {
        if (tipp.optionId === v.gewinnerId) { text += ' · +' + de(VS.moeglicherGewinn(tipp, v) || 0) + ' für dich!'; art = 'sieg'; }
        else { text += ' · −' + de(tipp.punkte); art = 'niederlage'; }
      }
      karte.appendChild(el('div', 'vk-banner ' + art, text));
      if (art === 'sieg') {
        karte.classList.add('vk-sieg');
        const ende = ctx.endeSeit(v.id);
        if (ende !== null && ctx.jetzt() - ende < KONFETTI_MS) konfetti(ctx, karte, fb[v.gewinnerId]);
      }
      if (art === 'niederlage') karte.classList.add('vk-niederlage');
    } else if (v.status === 'CANCELED') {
      karte.appendChild(el('div', 'vk-banner neutral', 'Abgebrochen – Punkte zurück'));
    } else if (tipp) {
      const o = v.optionen.find((x) => x.id === tipp.optionId);
      const m = el('div', 'vk-meins');
      m.style.setProperty('--vk-farbe', fb[tipp.optionId]);
      m.textContent = de(tipp.punkte) + ' auf ' + (o ? o.titel : '?') + ' · bei Sieg +' + de(VS.moeglicherGewinn(tipp, v) || 0);
      karte.appendChild(m);
    }
    ctx.bedieneSetzen();

    // Funken auf Optionen, die gerade Punkte bekamen (einmalig je Zuwachs).
    for (const id of ctx.funken) {
      const ziel = karte.querySelector('[data-vk-option="' + id + '"]');
      if (ziel) funkenAuf(ctx, ziel, fb[id]);
    }
  }

  function duellAnsicht(ctx, fb, tipp) {
    const { el, v, VS } = ctx;
    const box = el('div', 'vk-duell-box');
    const fertig = v.status === 'RESOLVED';
    const seite = (o) => {
      const s = el('div', 'vk-seite');
      s.dataset.vkOption = o.id;
      s.style.setProperty('--vk-farbe', fb[o.id]);
      if (fertig) s.classList.add(o.id === v.gewinnerId ? 'sieger' : 'verlierer');
      if (tipp && tipp.optionId === o.id) s.classList.add('meins');
      s.appendChild(el('div', 'vk-name', o.titel + (tipp && tipp.optionId === o.id ? ' · dein Tipp' : '')));
      const q = el('div', 'vk-quote');
      ctx.zaehle(q, 'quote:' + o.id, o.quote || 0, (x) => quoteText(x));
      s.appendChild(q);
      s.appendChild(el('div', 'vk-lbl', 'Quote'));
      const leute = el('div', 'vk-klein');
      ctx.zaehle(leute, 'leute:' + o.id, o.nutzer, (x) => de(x) + (Math.round(x) === 1 ? ' Person' : ' Leute'));
      s.appendChild(leute);
      return s;
    };
    const mitte = () => fertig ? el('div', 'vk-pokal', '🏆') : ring(ctx, fb);
    if (v.optionen.length === 2) {
      const reihe = el('div', 'vk-duell');
      reihe.append(seite(v.optionen[0]), mitte(), seite(v.optionen[1]));
      box.appendChild(reihe);
    } else {
      const reihe = el('div', 'vk-duell vk-viele');
      reihe.appendChild(mitte());
      const liste = el('div', 'vk-liste');
      for (const o of v.optionen) liste.appendChild(seite(o));
      reihe.appendChild(liste);
      box.appendChild(reihe);
    }
    if (!fertig) box.appendChild(tauziehen(ctx, fb));
    return box;
  }

  function ring(ctx, fb) {
    const { doc, v, VS } = ctx;
    const s = svg(doc, 'svg', { class: 'vk-ring', viewBox: '0 0 42 42' });
    s.appendChild(svg(doc, 'circle', { cx: 21, cy: 21, r: 15.9, fill: 'none', stroke: 'rgba(255,255,255,.08)', 'stroke-width': 5 }));
    for (const seg of VS.ringSegmente(v.optionen)) {
      if (!seg.laenge) continue;
      s.appendChild(svg(doc, 'circle', {
        cx: 21, cy: 21, r: 15.9, fill: 'none', stroke: fb[seg.id], 'stroke-width': 5, pathLength: 100,
        'stroke-dasharray': seg.laenge + ' ' + (100 - seg.laenge), 'stroke-dashoffset': 25 - seg.versatz,
        class: 'vk-ring-seg'
      }));
    }
    const [a, b] = v.optionen;
    const t1 = svg(doc, 'text', { x: 21, y: b && v.optionen.length === 2 ? 20 : 23.5, 'text-anchor': 'middle', 'font-size': 7, 'font-weight': 900, fill: fb[a.id] });
    t1.textContent = Math.round(a.anteil * 100) + ' %';
    s.appendChild(t1);
    if (v.optionen.length === 2) {
      const t2 = svg(doc, 'text', { x: 21, y: 28, 'text-anchor': 'middle', 'font-size': 5, fill: fb[b.id] });
      t2.textContent = Math.round(b.anteil * 100) + ' %';
      s.appendChild(t2);
    }
    return s;
  }

  function tauziehen(ctx, fb) {
    const { el, v } = ctx;
    const tau = el('div', 'vk-tau');
    const zwei = v.optionen.length === 2;
    v.optionen.forEach((o, i) => {
      const seg = el('div', 'vk-tau-seg');
      seg.style.width = Math.max(0, o.anteil * 100) + '%';
      seg.style.setProperty('--vk-farbe', fb[o.id]);
      if (zwei) {
        seg.classList.add(i === 0 ? 'links' : 'rechts');
        ctx.zaehle(seg, 'punkte:' + o.id, o.punkte, (x) => kurz(x) + ' Pkt');
      }
      tau.appendChild(seg);
    });
    tau.appendChild(el('div', 'vk-glanz'));
    return tau;
  }

  function verlaufAnsicht(ctx, fb) {
    const { doc, el, v, VS } = ctx;
    const box = el('div', 'vk-verlauf');
    const punkte = ctx.verlauf.punkte();
    const B = 300; const H = 120;
    // Kurve streckt in der Breite (preserveAspectRatio none, feste Hoehe),
    // Beschriftung als HTML daneben -> Schrift bleibt bei jeder Chatbreite gleich.
    const flaeche = el('div', 'vk-kurve-box');
    for (const [pos, t] of [['oben', '100 %'], ['mitte', '50 %'], ['unten', '0 %']]) flaeche.appendChild(el('span', 'vk-y vk-y-' + pos, t));
    const s = svg(doc, 'svg', { class: 'vk-kurve', viewBox: '0 0 ' + B + ' ' + H, preserveAspectRatio: 'none' });
    for (const y of [0, H / 2, H]) {
      s.appendChild(svg(doc, 'line', { x1: 0, x2: B, y1: y, y2: y, class: y === H / 2 ? 'vk-mitte' : 'vk-gitter', 'vector-effect': 'non-scaling-stroke' }));
    }
    // Erst ab 2 Messpunkten eine Kurve (ein Punkt ergaebe eine schraege Flaeche).
    const pfade = punkte.length >= 2 ? VS.kurven(punkte, v.optionen.map((o) => o.id), B, H) : {};
    v.optionen.forEach((o, i) => {
      const d = pfade[o.id];
      if (!d) return;
      if (i === 0 && v.optionen.length === 2) {
        s.appendChild(svg(doc, 'path', { d: d + ' L' + B + ',' + H + ' L0,' + H + ' Z', fill: fb[o.id], 'fill-opacity': .14 }));
      }
      s.appendChild(svg(doc, 'path', { d, fill: 'none', stroke: fb[o.id], 'stroke-width': 2.2, 'vector-effect': 'non-scaling-stroke' }));
    });
    flaeche.appendChild(s);
    if (punkte.length < 2) {
      flaeche.appendChild(el('div', 'vk-leer', v.status === 'ACTIVE' ? 'Verlauf entsteht, sobald gesetzt wird …' : 'Kein Verlauf – lief beim Setzen nicht mit'));
    }
    const x = el('div', 'vk-x');
    x.append(el('span', '', 'Start'), el('span', '', 'jetzt'));
    box.append(flaeche, x);
    const trend = el('div', 'vk-trend');
    for (const o of v.optionen.slice(0, 4)) {
      const d = VS.trend(punkte, o.id, ctx.jetzt());
      const t = el('span', 'vk-trend-teil');
      t.style.color = fb[o.id];
      t.textContent = o.titel + ' ' + Math.round(o.anteil * 100) + ' %' + (d > 0 ? ' ↗ +' + d : d < 0 ? ' ↘ ' + d : '');
      trend.appendChild(t);
    }
    box.appendChild(trend);
    box.appendChild(el('div', 'vk-lbl vk-rechts', 'Trend = Änderung in der letzten Minute'));
    return box;
  }

  function statsAnsicht(ctx, fb) {
    const { el, v, VS } = ctx;
    const box = el('div', 'vk-stats');
    const st = VS.stats(v);
    const tab = el('table', 'vk-tabelle');
    const kopfzeile = el('tr');
    kopfzeile.appendChild(el('td'));
    for (const o of v.optionen) {
      const td = el('td', 'vk-z', o.titel);
      td.style.color = fb[o.id];
      kopfzeile.appendChild(td);
    }
    tab.appendChild(kopfzeile);
    const zeile = (name, wert) => {
      const tr = el('tr');
      tr.appendChild(el('td', '', name));
      st.forEach((s) => tr.appendChild(el('td', 'vk-z', wert(s))));
      tab.appendChild(tr);
    };
    zeile('Punkte', (s) => de(s.punkte));
    zeile('Leute', (s) => de(s.nutzer));
    zeile('Ø Einsatz', (s) => de(s.schnitt));
    zeile('Größter Einsatz', (s) => de(s.groesster));
    zeile('Gewinn pro 1.000', (s) => s.gewinnPro1000 ? de(s.gewinnPro1000) : '–');
    box.appendChild(tab);
    const top = VS.topSetzer(v, 3);
    if (top.length) {
      const t = el('div', 'vk-top');
      t.appendChild(el('div', 'vk-lbl', 'Top-Setzer'));
      top.forEach((x, i) => {
        const z = el('div', 'vk-top-zeile');
        const links = el('span');
        links.appendChild(el('span', 'vk-platz', String(i + 1)));
        const n = el('span', '', x.name);
        n.style.color = fb[x.optionId];
        links.appendChild(n);
        z.append(links, el('span', '', de(x.punkte)));
        t.appendChild(z);
      });
      box.appendChild(t);
    }
    const m = VS.momentum(ctx.verlauf.punkte(), ctx.jetzt());
    if (m.proMinute > 0) {
      const ziel = v.optionen.find((o) => o.id === m.nach);
      const mo = el('div', 'vk-momentum');
      mo.textContent = '⚡ ' + de(m.proMinute) + ' Pkt/Min' + (ziel ? ' · gerade fließt das meiste auf ' + ziel.titel : '');
      box.appendChild(mo);
    }
    return box;
  }

  function funkenAuf(ctx, ziel, farbe) {
    for (let i = 0; i < 6; i++) {
      const f = ctx.el('span', 'vk-funke');
      f.style.setProperty('--vk-farbe', farbe);
      f.style.left = (20 + Math.random() * 60) + '%';
      f.style.top = (30 + Math.random() * 50) + '%';
      f.style.setProperty('--dx', (Math.random() * 60 - 30).toFixed(0) + 'px');
      f.style.setProperty('--dy', (-20 - Math.random() * 30).toFixed(0) + 'px');
      f.style.animationDelay = (i * 60) + 'ms';
      ziel.appendChild(f);
    }
  }

  function konfetti(ctx, karte, farbe) {
    for (let i = 0; i < 18; i++) {
      const k = ctx.el('span', 'vk-konfetti');
      k.style.left = (Math.random() * 100) + '%';
      k.style.background = i % 2 ? '#ffd34d' : farbe;
      k.style.animationDelay = (Math.random() * 1.6).toFixed(2) + 's';
      k.style.animationDuration = (2 + Math.random() * 1.2).toFixed(2) + 's';
      karte.appendChild(k);
    }
  }

  root.VorhersageKarte = { baue };
})(typeof self !== 'undefined' ? self : this);
