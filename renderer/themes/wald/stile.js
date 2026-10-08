// Wald: Zeichenstile der Varianten (Canvas 2D). welt.js bewegt die
// Gluehwuermchen, hier steht nur, WIE gezeichnet wird. Jeder Stil liefert:
//   hintergrund(g, w, h, W, Z)  einmal pro Groesse, in eine Offscreen-Leinwand.
//                               Z = Stil-eigene Daten (Pilze, Huette ...).
//   fliege(g, x, y, a, farbe, W) ein Gluehwuermchen, a = Helligkeit 0..1
//   unter(g, ms, w, h, W, Z, k, maus)  optional, jedes Bild VOR den Fliegen
//   ueber(g, ms, w, h, W, Z)    optional, jedes Bild NACH allem
//   klick(Z, x, y, w, h)        optional, Klick ins Leere
//   ereignis(Z, art)            optional, Kiste/Punkte/Abo/Raid
//   schrift {...}               Namenskaertchen (Abo/Raid)
// Sonderfaelle: pixel = Kantenlaenge eines Pixels (Hintergrund klein bauen,
// ohne Glaettung hochskalieren), koernung = Papierrauschen, auftrieb =
// Partikel steigen (Sporen), anzahl = Faktor fuer die Partikelzahl,
// tempo = Faktor fuer die Schwirr-Geschwindigkeit.
(function () {
  const TAU = Math.PI * 2;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  // Feste Zufallsfolge: der Hintergrund sieht nach jedem Groessenwechsel gleich aus.
  let saatWert = 7;
  function saat(n) { saatWert = n; }
  function srnd(a, b) { saatWert = (saatWert * 16807) % 2147483647; return a + (saatWert / 2147483647) * (b - a); }
  function leinwand(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  function koernung(g, w, h, staerke) {
    const bild = g.getImageData(0, 0, w, h), d = bild.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * staerke;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(bild, 0, 0);
  }
  function dichte(w, h) { return Math.max(0.3, (w * h) / 141000); }
  function mitAlpha(farbe, a) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(farbe || '');
    if (!m) return farbe;
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
  }
  // Weicher Lichtfleck. Einmal je Farbe/Radius vorgerendert und dann nur noch
  // kopiert - ein Verlauf pro Fliege und Bild waere zu teuer.
  const sprites = new Map();
  function sprite(farbe, r) {
    const rr = Math.max(2, Math.round(r));
    const key = farbe + '|' + rr;
    let c = sprites.get(key);
    if (c) return c;
    c = leinwand(rr * 4, rr * 4);
    const g = c.getContext('2d');
    if (g) {
      const gr = g.createRadialGradient(rr * 2, rr * 2, 0, rr * 2, rr * 2, rr * 2);
      gr.addColorStop(0, mitAlpha(farbe, 0.9)); gr.addColorStop(0.35, mitAlpha(farbe, 0.35)); gr.addColorStop(1, mitAlpha(farbe, 0));
      g.fillStyle = gr; g.fillRect(0, 0, rr * 4, rr * 4);
    }
    if (sprites.size > 64) sprites.clear();
    sprites.set(key, c);
    return c;
  }
  function leuchte(g, x, y, r, farbe, a) {
    if (a <= 0.01) return;
    g.globalAlpha = Math.min(1, a);
    g.drawImage(sprite(farbe, r), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1;
  }
  function punkt(g, x, y, r, farbe, a) {
    g.globalAlpha = Math.max(0, Math.min(1, a));
    g.fillStyle = farbe; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
  function glueh(g, x, y, r, farbe, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, farbe); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.globalAlpha = 1;
  }
  // Tanne mit gestuften Zweigen. x = Mitte, yb = Fuss, h = Hoehe, b = Breite.
  function tannePfad(g, x, yb, h, b) {
    const pts = [], st = 5;
    for (let i = 1; i <= st; i++) {
      const y = yb - h * 0.08 - h * 0.92 * (1 - i / st);
      const ww = b / 2 * (0.28 + 0.72 * i / st);
      pts.push([ww, y]);
      if (i < st) pts.push([ww * 0.42, y - h * 0.015]);
    }
    g.beginPath(); g.moveTo(x, yb - h);
    for (const p of pts) g.lineTo(x + p[0], p[1]);
    g.lineTo(x + b * 0.05, yb - h * 0.08); g.lineTo(x + b * 0.05, yb);
    g.lineTo(x - b * 0.05, yb); g.lineTo(x - b * 0.05, yb - h * 0.08);
    for (let m = pts.length - 1; m >= 0; m--) g.lineTo(x - pts[m][0], pts[m][1]);
    g.closePath();
  }
  // Eine Reihe Tannen (Positionen), Anzahl waechst mit der Breite.
  function reihe(w, fussY, n, hMin, hMax) {
    const r = [], anzahl = Math.max(2, Math.round(n * Math.max(0.7, w / 300)));
    for (let i = 0; i < anzahl; i++) {
      const h = srnd(hMin, hMax);
      r.push({ x: (i + srnd(0.1, 0.9)) * (w + 40) / anzahl - 20, yb: fussY + srnd(-6, 6), h, b: h * srnd(0.36, 0.46) });
    }
    return r;
  }
  function waldLagen(g, w, h, lagen) {
    for (let l = 0; l < lagen.length; l++) {
      const [farbe, fuss, hoehe] = lagen[l];
      const baeume = reihe(w, fuss, 7 - l, h * hoehe * 0.7, h * hoehe);
      g.fillStyle = farbe;
      for (const B of baeume) { tannePfad(g, B.x, B.yb, B.h, B.b); g.fill(); }
      g.fillRect(0, fuss - 2, w, h - fuss + 2);
    }
  }
  function nachtHimmel(g, w, h, oben, mitte, unten, sterne) {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, oben); gr.addColorStop(0.5, mitte); gr.addColorStop(1, unten);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const n = Math.round(sterne * dichte(w, h));
    for (let s = 0; s < n; s++) { g.fillStyle = 'rgba(255,255,255,' + srnd(0.25, 0.9) + ')'; g.fillRect(srnd(0, w), srnd(0, h * 0.5), srnd(1, 2), srnd(1, 2)); }
  }
  function mond(g, x, y, r) {
    glueh(g, x, y, r * 3.3, 'rgba(255,240,200,0.35)', 1);
    g.fillStyle = '#fff3d6'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = 'rgba(220,205,170,0.5)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.2, r * 0.19, 0, TAU); g.arc(x + r * 0.33, y + r * 0.28, r * 0.14, 0, TAU); g.fill();
  }
  function stempel(g, x, y, s, zeichen) {
    g.fillStyle = '#b8361f'; g.fillRect(x, y, s, s);
    g.fillStyle = '#f3e7cf'; g.font = 'bold ' + Math.round(s * 0.72) + 'px "Yu Mincho", "MS Mincho", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(zeichen || '森', x + s / 2, y + s / 2 + 1);
  }
  function namensKarte(g, stil, x, y, zeilen) {
    const sch = stil.schrift;
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let breite = 0;
    zeilen.forEach((z, i) => {
      g.font = i === 0 ? sch.font : sch.fontKlein;
      const m = g.measureText(z);
      breite = Math.max(breite, (m && m.width) || z.length * 7);
    });
    breite += 20;
    const hoehe = zeilen.length * 18 + 10;
    g.beginPath();
    if (g.roundRect) g.roundRect(x - breite / 2, y, breite, hoehe, sch.radius); else g.rect(x - breite / 2, y, breite, hoehe);
    g.fillStyle = sch.kasten; g.fill();
    if (sch.schatten) { g.save(); g.globalCompositeOperation = 'destination-over'; g.fillStyle = sch.schatten; g.fillRect(x - breite / 2 + 4, y + 4, breite, hoehe); g.restore(); }
    if (sch.rand) { g.strokeStyle = sch.rand; g.lineWidth = sch.randBreite || 1; g.stroke(); }
    zeilen.forEach((z, i) => {
      g.fillStyle = i === 0 ? sch.farbe : sch.zweit;
      g.font = i === 0 ? sch.font : sch.fontKlein;
      g.fillText(z, x, y + 14 + i * 18);
    });
    g.restore();
    return hoehe;
  }

  const W = { TAU, rnd, srnd, saat, leinwand, koernung, dichte, mitAlpha, leuchte, punkt, glueh, tannePfad, reihe, waldLagen, nachtHimmel, mond, stempel, namensKarte };

  // =========================================================================
  const aquarell = {
    koernung: 14,
    schrift: { font: '600 13px "Segoe Print", Candara, cursive', fontKlein: '11px Candara, sans-serif', farbe: '#3f7a5e', zweit: '#5a6a62',
      kasten: 'rgba(250,250,246,.93)', rand: 'rgba(80,130,110,.45)', randBreite: 1, radius: 10 },
    hintergrund(g, w, h) {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#c9dce6'); gr.addColorStop(0.45, '#e2dcec'); gr.addColorStop(1, '#eef0e4');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const tupfer = ['#9cc3c9', '#c9b8d8', '#b9d3b0', '#d8cfe6'];
      const n = Math.round(46 * dichte(w, h));
      for (let i = 0; i < n; i++) glueh(g, srnd(0, w), srnd(0, h), srnd(30, 90), tupfer[i % 4], 0.22);
      const lagen = [['#a8c4c6', 0.5, h * 0.62, 0.32], ['#7fa59b', 0.62, h * 0.74, 0.42], ['#4f7a68', 0.78, h * 0.9, 0.62]];
      for (let l = 0; l < lagen.length; l++) {
        const [farbe, deck, fuss, hoehe] = lagen[l];
        for (const B of reihe(w, fuss, 7 - l, h * hoehe * 0.7, h * hoehe)) {
          for (let p = 0; p < 3; p++) {
            g.globalAlpha = deck / 2.2; g.fillStyle = farbe;
            tannePfad(g, B.x + srnd(-2.5, 2.5), B.yb + srnd(-2, 2), B.h * srnd(0.97, 1.03), B.b); g.fill();
          }
        }
        g.globalAlpha = 0.35; g.fillStyle = farbe; g.fillRect(0, fuss - 2, w, h - fuss + 2);
      }
      g.globalAlpha = 1;
    },
    fliege(g, x, y, a, farbe) {
      leuchte(g, x, y, 11, farbe, a * 0.8);
      punkt(g, x, y, 2.4, farbe, a);
      punkt(g, x, y, 1.1, '#fffbe6', a);
    }
  };

  // =========================================================================
  const lofi = {
    koernung: 10,
    schrift: { font: '700 13px Bahnschrift, "Segoe UI", sans-serif', fontKlein: '11px Bahnschrift, sans-serif', farbe: '#c8ff7a', zweit: '#b7b8e0',
      kasten: 'rgba(20,20,46,.92)', rand: 'rgba(200,255,140,.35)', randBreite: 1.5, radius: 12 },
    hintergrund(g, w, h) {
      nachtHimmel(g, w, h, '#15123a', '#29265e', '#3a336f', 70);
      mond(g, w * 0.74, h * 0.15, 21);
      const lagen = [['#2c2d62', h * 0.6, 0.34], ['#1f2049', h * 0.74, 0.46], ['#12132e', h * 0.92, 0.66]];
      waldLagen(g, w, h, [lagen[0]]);
      const ng = g.createLinearGradient(0, h * 0.6 - 40, 0, h * 0.6 + 20);
      ng.addColorStop(0, 'rgba(170,160,255,0)'); ng.addColorStop(0.6, 'rgba(170,160,255,0.16)'); ng.addColorStop(1, 'rgba(170,160,255,0)');
      g.fillStyle = ng; g.fillRect(0, h * 0.6 - 40, w, 60);
      waldLagen(g, w, h, lagen.slice(1));
    },
    fliege(g, x, y, a, farbe) {
      leuchte(g, x, y, 14, farbe, a * 0.8);
      punkt(g, x, y, 3, farbe, Math.min(1, a + 0.15));
      punkt(g, x, y, 1.4, '#fbffe6', Math.min(1, a + 0.15));
    }
  };

  // =========================================================================
  const tusche = {
    koernung: 12,
    schrift: { font: '600 13px "Yu Mincho", Georgia, serif', fontKlein: '11px Georgia, serif', farbe: '#2f4a3a', zweit: '#555',
      kasten: 'rgba(245,241,230,.94)', rand: 'rgba(30,30,30,.45)', randBreite: 1, radius: 4 },
    hintergrund(g, w, h) {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#f4f0e5'); gr.addColorStop(1, '#ebe4d2');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const lagen = [[0.13, h * 0.58, 0.3], [0.3, h * 0.72, 0.44], [0.82, h * 0.92, 0.66]];
      g.lineCap = 'round';
      for (let l = 0; l < lagen.length; l++) {
        const [deck, fuss, hoehe] = lagen[l];
        for (const B of reihe(w, fuss, 6 - l, h * hoehe * 0.7, h * hoehe)) {
          for (let p = 0; p < 2; p++) { g.fillStyle = 'rgba(25,25,25,' + (deck * 0.55) + ')'; tannePfad(g, B.x + srnd(-1.5, 1.5), B.yb, B.h, B.b * srnd(0.92, 1.04)); g.fill(); }
          g.strokeStyle = 'rgba(20,20,20,' + deck + ')';
          for (let s = 0; s < 9; s++) {
            const yy = B.yb - B.h * srnd(0.1, 0.9), ww = B.b / 2 * (1 - (B.yb - yy) / B.h) * srnd(0.7, 1.1);
            g.lineWidth = srnd(1, 2.6);
            g.beginPath(); g.moveTo(B.x, yy - 4); g.quadraticCurveTo(B.x + ww * 0.5, yy - 2, B.x + ww, yy + 3); g.stroke();
            g.beginPath(); g.moveTo(B.x, yy - 4); g.quadraticCurveTo(B.x - ww * 0.5, yy - 2, B.x - ww, yy + 3); g.stroke();
          }
        }
        const ng = g.createLinearGradient(0, fuss - 30, 0, fuss + 10);
        ng.addColorStop(0, 'rgba(244,240,229,0)'); ng.addColorStop(1, 'rgba(244,240,229,0.85)');
        g.fillStyle = ng; g.fillRect(0, fuss - 30, w, 40);
      }
      g.fillStyle = 'rgba(25,25,25,0.75)'; g.font = '20px "Yu Mincho", "MS Mincho", serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillText('静', w - 24, 40); g.fillText('森', w - 24, 64);
      stempel(g, w - 34, 74, 20, '森');
    },
    fliege(g, x, y, a, farbe) {
      leuchte(g, x, y, 8, farbe, a * 0.55);
      punkt(g, x, y, 2, farbe, Math.min(1, a + 0.1));
    }
  };

  // =========================================================================
  const bleiglas = {
    schrift: { font: '600 13px "Palatino Linotype", Georgia, serif', fontKlein: '11px "Palatino Linotype", Georgia, serif', farbe: '#c8f0a0', zweit: '#a8c0b8',
      kasten: 'rgba(12,20,22,.94)', rand: '#0a0c0e', randBreite: 3, radius: 8 },
    hintergrund(g, w, h) {
      g.fillStyle = '#0d1418'; g.fillRect(0, 0, w, h);
      const schritt = 34, pts = [];
      for (let yy = -schritt; yy <= h + schritt; yy += schritt) {
        const r = [];
        for (let xx = -schritt; xx <= w + schritt; xx += schritt) r.push([xx + srnd(-10, 10), yy + srnd(-10, 10)]);
        pts.push(r);
      }
      const blau = ['#1e4a6e', '#265d86', '#1b3d5c', '#2f6c8f', '#3a5f8a'];
      function scherbe(a, b, c, farbe) {
        g.fillStyle = farbe; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.closePath(); g.fill();
        g.strokeStyle = '#0a0c0e'; g.lineWidth = 2.5; g.stroke();
      }
      for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < pts[i].length - 1; j++) {
        scherbe(pts[i][j], pts[i][j + 1], pts[i + 1][j], blau[Math.floor(srnd(0, 5))]);
        scherbe(pts[i][j + 1], pts[i + 1][j + 1], pts[i + 1][j], blau[Math.floor(srnd(0, 5))]);
      }
      g.fillStyle = '#f2e27a'; g.strokeStyle = '#0a0c0e'; g.lineWidth = 3;
      g.beginPath(); g.arc(w * 0.72, h * 0.15, 22, 0, TAU); g.fill(); g.stroke();
      const gruen = [['#3f8f5a', '#4fa86a', '#357a4c'], ['#2c6e44', '#3a8452', '#245a38'], ['#1d4f31', '#286040', '#173f27']];
      const fuesse = [h * 0.62, h * 0.76, h * 0.93], hoehen = [0.33, 0.46, 0.66];
      for (let l = 0; l < 3; l++) {
        g.fillStyle = gruen[l][2]; g.fillRect(0, fuesse[l], w, h - fuesse[l]);
        for (const B of reihe(w, fuesse[l], 6 - l, h * hoehen[l] * 0.72, h * hoehen[l])) {
          g.save(); tannePfad(g, B.x, B.yb, B.h, B.b); g.fillStyle = gruen[l][0]; g.fill(); g.clip();
          g.fillStyle = gruen[l][1]; g.beginPath(); g.moveTo(B.x, B.yb - B.h); g.lineTo(B.x + B.b, B.yb); g.lineTo(B.x, B.yb); g.closePath(); g.fill();
          g.strokeStyle = '#0a0c0e'; g.lineWidth = 2;
          for (let q = 1; q < 5; q++) { const qy = B.yb - B.h * q / 5; g.beginPath(); g.moveTo(B.x - B.b, qy + 10); g.lineTo(B.x + B.b, qy - 6); g.stroke(); }
          g.restore();
          g.strokeStyle = '#0a0c0e'; g.lineWidth = 3; tannePfad(g, B.x, B.yb, B.h, B.b); g.stroke();
        }
        g.beginPath(); g.moveTo(0, fuesse[l]); g.lineTo(w, fuesse[l]); g.stroke();
      }
    },
    ueber(g, ms, w, h) {
      const x = ((ms * 0.04) % (w * 2.4)) - w * 0.7;
      const gr = g.createLinearGradient(x - 90, 0, x + 90, h);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,230,0.13)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    },
    fliege(g, x, y, a, farbe) {
      leuchte(g, x, y, 12, farbe, a * 0.7);
      g.globalAlpha = Math.max(0.35, Math.min(1, a)); g.fillStyle = farbe; g.strokeStyle = '#0a0c0e'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, 3.6, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(x - 1.1, y - 1.1, 1.1, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
  };

  // =========================================================================
  // Pixel: hintergrund bekommt die KLEINEN Masse (w/pixel, h/pixel).
  const pixel = {
    pixel: 4,
    schrift: { font: '700 13px Consolas, "Courier New", monospace', fontKlein: '11px Consolas, "Courier New", monospace', farbe: '#b6f07a', zweit: '#a8c8e8',
      kasten: '#16233a', rand: '#8fd65a', randBreite: 3, radius: 0, schatten: '#0a1020' },
    hintergrund(c, kw, kh) {
      const stufen = ['#0f0b2e', '#16123f', '#1e1a52', '#272266', '#30297a'];
      for (let i = 0; i < kh; i++) {
        const f = i / kh * 0.75 * stufen.length, s = Math.floor(f), rest = f - s;
        for (let x = 0; x < kw; x++) {
          const nimm = (rest > 0.5 && ((x + i) % 2 === 0)) ? s + 1 : s;
          c.fillStyle = stufen[Math.min(stufen.length - 1, nimm)]; c.fillRect(x, i, 1, 1);
        }
      }
      const sterne = Math.round(40 * Math.max(0.5, (kw * kh) / 8800));
      for (let s2 = 0; s2 < sterne; s2++) { c.fillStyle = srnd(0, 1) < 0.3 ? '#ffe9a8' : '#cfd6ff'; c.fillRect(Math.floor(srnd(0, kw)), Math.floor(srnd(0, kh * 0.45)), 1, 1); }
      c.fillStyle = '#fff1c4';
      const mx = Math.floor(kw * 0.72), my = Math.floor(kh * 0.15);
      for (let yy = -5; yy <= 5; yy++) for (let xx = -5; xx <= 5; xx++) if (xx * xx + yy * yy <= 26) c.fillRect(mx + xx, my + yy, 1, 1);
      c.fillStyle = '#e2cf98'; c.fillRect(mx - 2, my - 1, 2, 2); c.fillRect(mx + 2, my + 2, 1, 1);
      const farben = ['#24306a', '#1a2a4c', '#0e1c2a'], fuss = [0.6, 0.75, 0.93], hoe = [0.32, 0.45, 0.64];
      for (let l = 0; l < 3; l++) {
        c.fillStyle = farben[l]; c.fillRect(0, Math.floor(kh * fuss[l]), kw, kh);
        for (const B of reihe(kw, Math.floor(kh * fuss[l]), 6 - l, kh * hoe[l] * 0.72, kh * hoe[l])) {
          const top = B.yb - B.h, stufe0 = Math.max(3, Math.floor(B.h / 5));
          for (let row = 0; row < B.h; row++) {
            const stufe = (row % stufe0) / stufe0;
            const breite = Math.max(1, Math.round((B.b / 2) * (0.25 + 0.75 * row / B.h) * (0.6 + 0.4 * stufe)));
            c.fillRect(Math.round(B.x - breite), Math.round(top + row), breite * 2 + 1, 1);
          }
        }
      }
    },
    fliege(g, x, y, a, farbe) {
      if (a < 0.2) return;
      const P = 4, px = Math.round(x / P) * P, py = Math.round(y / P) * P;
      if (a > 0.6) { g.fillStyle = mitAlpha(farbe, 0.35); g.fillRect(px - P, py, P * 3, P); g.fillRect(px, py - P, P, P * 3); }
      g.fillStyle = a > 0.6 ? '#f2ffb0' : farbe; g.fillRect(px, py, P, P);
    }
  };

  // =========================================================================
  // Leuchtpilze: Pilze gluehen (heller bei Mausnaehe), Sporen steigen auf.
  const pilze = {
    auftrieb: -0.035,
    anzahl: 1.4,
    koernung: 6,
    schrift: { font: '700 13px Bahnschrift, "Segoe UI", sans-serif', fontKlein: '11px Bahnschrift, sans-serif', farbe: '#9ff6ff', zweit: '#c8a8ff',
      kasten: 'rgba(8,20,26,.92)', rand: 'rgba(120,240,255,.4)', randBreite: 1.5, radius: 12 },
    hintergrund(g, w, h, W, Z) {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#07131c'); gr.addColorStop(0.6, '#0d222b'); gr.addColorStop(1, '#081418');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const farben = ['#0f2a33', '#0b2028', '#061219'];
      for (let l = 0; l < 3; l++) {
        const n = Math.max(2, Math.round((6 - l) * Math.max(0.7, w / 300)));
        for (let i = 0; i < n; i++) {
          const x = srnd(-10, w + 10), b = srnd(10, 22) * (1 + l * 0.6);
          g.fillStyle = farben[l]; g.beginPath(); g.moveTo(x - b / 2, h); g.lineTo(x - b * 0.32, -10); g.lineTo(x + b * 0.32, -10); g.lineTo(x + b / 2, h); g.closePath(); g.fill();
        }
      }
      g.fillStyle = '#05100f'; g.beginPath(); g.moveTo(0, h * 0.7);
      for (let xx = 0; xx <= w; xx += 15) g.lineTo(xx, h * 0.7 + Math.sin(xx * 0.05) * 6);
      g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
      g.strokeStyle = '#0a1f1c'; g.lineWidth = 2;
      const farne = Math.round(14 * Math.max(0.7, w / 300));
      for (let f = 0; f < farne; f++) {
        const fx = srnd(0, w), fy = h * srnd(0.7, 0.8), lang = srnd(20, 46), seite = srnd(0, 1) < 0.5 ? -1 : 1;
        g.beginPath(); g.moveTo(fx, fy); g.quadraticCurveTo(fx + seite * lang * 0.4, fy - lang * 0.9, fx + seite * lang, fy - lang * 0.6); g.stroke();
      }
      // Pilzgruppen ueber die Breite verteilt, oberhalb der Chat-Eingabe.
      const n = Math.max(5, Math.round(7 * Math.max(0.7, w / 300)));
      Z.pilze = [];
      for (let i = 0; i < n; i++) {
        Z.pilze.push({ x: (i + srnd(0.15, 0.85)) * w / n, y: h * srnd(0.66, 0.77), r: srnd(9, 20),
          farbe: i % 3 === 1 ? [200, 140, 255] : [110, 240, 255], ph: srnd(0, TAU), blitz: 0 });
      }
    },
    unter(g, ms, w, h, W, Z, k, maus) {
      if (!Z.pilze) return;
      for (const p of Z.pilze) {
        let nah = 0;
        if (maus) nah = Math.max(0, 1 - Math.hypot(maus.x - p.x, maus.y - p.y) / 120);
        p.blitz = Math.max(0, p.blitz - 0.015 * k);
        const a = 0.45 + 0.2 * Math.sin(ms * 0.0015 + p.ph) + nah * 0.5 + p.blitz;
        const col = 'rgba(' + p.farbe[0] + ',' + p.farbe[1] + ',' + p.farbe[2] + ',';
        glueh(g, p.x, p.y - p.r * 0.4, p.r * 4.5, col + '0.55)', Math.min(1, a * 0.6));
        g.fillStyle = 'rgba(200,235,235,' + Math.min(1, 0.35 + a * 0.3) + ')'; g.fillRect(p.x - p.r * 0.18, p.y - p.r * 0.3, p.r * 0.36, p.r * 1.1);
        const gr = g.createLinearGradient(0, p.y - p.r, 0, p.y);
        gr.addColorStop(0, col + Math.min(1, 0.5 + a * 0.5) + ')'); gr.addColorStop(1, col + '0.25)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(p.x, p.y - p.r * 0.3, p.r, p.r * 0.7, 0, Math.PI, 0); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,' + Math.min(1, 0.25 + a * 0.3) + ')';
        g.beginPath(); g.arc(p.x - p.r * 0.35, p.y - p.r * 0.65, p.r * 0.12, 0, TAU); g.arc(p.x + p.r * 0.3, p.y - p.r * 0.55, p.r * 0.09, 0, TAU); g.fill();
      }
    },
    klick(Z, x, y) { if (Z.pilze) for (const p of Z.pilze) if (Math.hypot(p.x - x, p.y - y) < 160) p.blitz = 0.9; },
    ereignis(Z, art) { if (Z.pilze && art !== 'punkte') for (const p of Z.pilze) p.blitz = 1; },
    // Sporen, die oben verschwinden, steigen unten neu auf.
    neuStart(f, w, h) { if (f.y < -10) { f.y = h * rnd(0.7, 0.8); f.x = rnd(0, w); } },
    fliege(g, x, y, a, farbe) {
      leuchte(g, x, y, 7, farbe, a * 0.7);
      punkt(g, x, y, 1.4, farbe, Math.min(1, a + 0.2));
    }
  };

  // =========================================================================
  // Lichtstrahlen (Komorebi): Strahlen durchs Blaetterdach, Staub glitzert,
  // Blaetter segeln. Partikel sind Staub, nicht Gluehwuermchen.
  function neuesBlatt(w, h, y) {
    const farben = ['#8cbf5a', '#a9cf6a', '#6fa04a', '#c5d977'];
    return { x: rnd(-10, w + 10), y, vx: rnd(-0.3, 0.3), vy: rnd(0.4, 0.9), rot: rnd(0, TAU), dr: rnd(-0.03, 0.03), ph: rnd(0, TAU), farbe: farben[Math.floor(rnd(0, 4))] };
  }
  const licht = {
    anzahl: 1.6,
    tempo: 0.5,
    koernung: 8,
    schrift: { font: '600 13px "Segoe Print", Candara, cursive', fontKlein: '11px Candara, sans-serif', farbe: '#3f6a32', zweit: '#5a6a4a',
      kasten: 'rgba(248,252,240,.94)', rand: 'rgba(80,120,60,.45)', randBreite: 1, radius: 10 },
    hintergrund(g, w, h) {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#eef5dc'); gr.addColorStop(0.5, '#d3e6c0'); gr.addColorStop(1, '#a9c79a');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const lagen = [['#b9d0ad', 7], ['#8eae86', 5], ['#56744f', 3]];
      for (let l = 0; l < 3; l++) {
        const n = Math.max(2, Math.round(lagen[l][1] * Math.max(0.7, w / 300)));
        for (let i = 0; i < n; i++) {
          const x = srnd(-10, w + 10), b = srnd(12, 20) * (1 + l * 0.9);
          g.fillStyle = lagen[l][0]; g.beginPath(); g.moveTo(x - b / 2, h); g.lineTo(x - b * 0.34, 0); g.lineTo(x + b * 0.34, 0); g.lineTo(x + b / 2, h); g.closePath(); g.fill();
          g.strokeStyle = lagen[l][0]; g.lineWidth = b * 0.18;
          for (let a = 0; a < 2; a++) { const ay = h * srnd(0.1, 0.4), s = srnd(0, 1) < 0.5 ? -1 : 1; g.beginPath(); g.moveTo(x, ay); g.quadraticCurveTo(x + s * b * 1.2, ay - 18, x + s * b * 2.4, ay - 40); g.stroke(); }
        }
      }
      const laub = ['rgba(90,140,80,0.55)', 'rgba(120,170,95,0.5)', 'rgba(70,115,65,0.6)'];
      const n = Math.round(60 * Math.max(0.7, w / 300));
      for (let c = 0; c < n; c++) glueh(g, srnd(-20, w + 20), srnd(-30, h * 0.16), srnd(20, 48), laub[c % 3], 0.9);
      g.fillStyle = '#7fa06e'; g.fillRect(0, h * 0.86, w, h * 0.14);
      g.strokeStyle = '#4f6f45'; g.lineWidth = 1.6;
      for (let f = 0; f < 22; f++) { const fx = srnd(0, w), fy = h * srnd(0.84, 0.95), ln = srnd(14, 30), sd = srnd(-1, 1); g.beginPath(); g.moveTo(fx, fy); g.quadraticCurveTo(fx + sd * ln * 0.5, fy - ln, fx + sd * ln, fy - ln * 0.7); g.stroke(); }
    },
    unter(g, ms, w, h, W, Z, k) {
      const strahlen = [[0.18, 0.9], [0.42, 1.3], [0.66, 0.8], [0.88, 1.1]];
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < strahlen.length; i++) {
        const x = w * strahlen[i][0], b = 26 * strahlen[i][1] * Math.max(1, w / 400), a = 0.07 + 0.05 * Math.sin(ms * 0.0008 + i * 1.7);
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, 'rgba(255,250,215,' + (a * 1.6) + ')'); gr.addColorStop(1, 'rgba(255,250,215,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(x - b * 0.4, 0); g.lineTo(x + b * 0.4, 0); g.lineTo(x + b * 0.6 + h * 0.35, h); g.lineTo(x - b * 0.6 + h * 0.35, h); g.closePath(); g.fill();
      }
      g.restore();
      if (!Z.blaetter) { Z.blaetter = []; for (let i = 0; i < 9; i++) Z.blaetter.push(neuesBlatt(w, h, rnd(0, h))); }
      Z.wind = (Z.wind || 0) * Math.pow(0.97, k);
      for (let j = 0; j < Z.blaetter.length; j++) {
        const L = Z.blaetter[j];
        L.vx += (Math.sin(ms * 0.001 + L.ph) * 0.02 + Z.wind * 0.02) * k; L.vx *= Math.pow(0.985, k);
        L.y += L.vy * k; L.x += (L.vx + Math.sin(ms * 0.002 + L.ph) * 0.5) * k; L.rot += (L.dr + L.vx * 0.02) * k;
        if (L.y > h + 10 || L.x < -30 || L.x > w + 30) Z.blaetter[j] = neuesBlatt(w, h, -10);
        g.save(); g.translate(L.x, L.y); g.rotate(L.rot); g.scale(1, Math.abs(Math.sin(ms * 0.003 + L.ph)) * 0.6 + 0.4);
        g.fillStyle = L.farbe; g.beginPath(); g.ellipse(0, 0, 7, 3.4, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(40,70,35,0.5)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-7, 0); g.lineTo(7, 0); g.stroke(); g.restore();
      }
    },
    klick(Z, x, y, w, h) {
      Z.wind = x < w / 2 ? 6 : -6;
      if (!Z.blaetter) return;
      for (let i = 0; i < 6; i++) Z.blaetter.push(neuesBlatt(w, h, rnd(0, h * 0.3)));
      if (Z.blaetter.length > 24) Z.blaetter.splice(0, Z.blaetter.length - 24);
    },
    ereignis(Z, art) { if (art === 'kiste' || art === 'raid') Z.wind = 5; },
    fliege(g, x, y, a, farbe) {
      leuchte(g, x, y, 5, farbe, a * 0.85);
      punkt(g, x, y, 1.2, farbe, a * 0.9);
    }
  };

  // =========================================================================
  // Waldhuette: Fenster leuchtet und flackert, Rauch aus dem Kamin.
  const huette = {
    koernung: 10,
    schrift: { font: '700 13px Bahnschrift, "Segoe UI", sans-serif', fontKlein: '11px Bahnschrift, sans-serif', farbe: '#ffd27a', zweit: '#c8c0e8',
      kasten: 'rgba(22,24,48,.92)', rand: 'rgba(255,210,140,.4)', randBreite: 1.5, radius: 12 },
    hintergrund(g, w, h, W, Z) {
      nachtHimmel(g, w, h, '#121838', '#1e2550', '#2a3060', 60);
      glueh(g, w * 0.2, h * 0.13, 55, 'rgba(255,240,210,0.3)', 1);
      g.fillStyle = '#fbf1d6'; g.beginPath(); g.arc(w * 0.2, h * 0.13, 15, 0, TAU); g.fill();
      g.fillStyle = '#20275a'; g.beginPath(); g.arc(w * 0.2 + 6, h * 0.13 - 3, 13, 0, TAU); g.fill();
      waldLagen(g, w, h, [['#262c5a', h * 0.6, 0.34], ['#1a1f44', h * 0.7, 0.44]]);
      const hx = w * 0.62, hy = h * 0.66, bw = 74, bh = 46;
      Z.hx = hx; Z.hy = hy;
      g.fillStyle = '#1b1830'; g.fillRect(hx - bw / 2, hy - bh, bw, bh);
      g.strokeStyle = 'rgba(80,70,110,0.6)'; g.lineWidth = 1;
      for (let b = 1; b < 6; b++) { g.beginPath(); g.moveTo(hx - bw / 2, hy - bh + b * bh / 6); g.lineTo(hx + bw / 2, hy - bh + b * bh / 6); g.stroke(); }
      g.fillStyle = '#100e22'; g.beginPath(); g.moveTo(hx - bw / 2 - 10, hy - bh); g.lineTo(hx, hy - bh - 36); g.lineTo(hx + bw / 2 + 10, hy - bh); g.closePath(); g.fill();
      g.fillRect(hx + 14, hy - bh - 32, 10, 22);
      g.fillStyle = '#0d0b1c'; g.fillRect(hx - 30, hy - 30, 15, 30);
      waldLagen(g, w, h, [['#0f1230', h * 0.9, 0.62]]);
      g.fillStyle = '#0f1230'; g.fillRect(0, h * 0.66, w, h);
    },
    unter(g, ms, w, h, W, Z, k) {
      if (Z.hx === undefined) return;
      Z.rauch = Z.rauch || [];
      Z.flacker = Math.max(0, (Z.flacker || 0) - 0.02 * k);
      const a = Math.min(1, 0.85 + 0.1 * Math.sin(ms * 0.013) * Math.sin(ms * 0.007) + Z.flacker * 0.3);
      const fx = Z.hx + 8, fy = Z.hy - 30;
      glueh(g, fx + 8, fy + 8, 46, 'rgba(255,200,120,0.5)', a * 0.7);
      g.fillStyle = 'rgba(255,205,120,' + a + ')'; g.fillRect(fx, fy, 16, 15);
      g.strokeStyle = '#1b1830'; g.lineWidth = 2; g.beginPath(); g.moveTo(fx + 8, fy); g.lineTo(fx + 8, fy + 15); g.moveTo(fx, fy + 7.5); g.lineTo(fx + 16, fy + 7.5); g.stroke();
      if (Math.random() < 0.06 * k) Z.rauch.push({ x: Z.hx + 19, y: Z.hy - 78, r: 4, a: 0.32, vx: rnd(0.15, 0.4) });
      for (let i = Z.rauch.length - 1; i >= 0; i--) {
        const R = Z.rauch[i];
        R.y -= 0.45 * k; R.x += (R.vx + Math.sin(ms * 0.002 + i) * 0.25) * k; R.r += 0.09 * k; R.a -= 0.0016 * k;
        if (R.a <= 0) { Z.rauch.splice(i, 1); continue; }
        glueh(g, R.x, R.y, R.r * 2.2, 'rgba(190,185,225,0.8)', R.a);
      }
      if (Z.rauch.length > 80) Z.rauch.splice(0, Z.rauch.length - 80);
    },
    klick(Z) { huette.ereignis(Z, 'kiste'); },
    ereignis(Z, art) {
      if (Z.hx === undefined || art === 'punkte') return;
      Z.flacker = 1; Z.rauch = Z.rauch || [];
      for (let i = 0; i < 5; i++) Z.rauch.push({ x: Z.hx + 19 + rnd(-3, 3), y: Z.hy - 78 - i * 6, r: rnd(5, 9), a: 0.4, vx: rnd(0.2, 0.6) });
    },
    fliege: lofi.fliege
  };

  const ziel = typeof window !== 'undefined' ? window : globalThis;
  ziel.WaldStile = { werkzeug: W, stile: { aquarell, lofi, tusche, bleiglas, pixel, pilze, licht, huette } };
})();
