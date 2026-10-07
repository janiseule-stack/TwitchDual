// Koi-Teich: Zeichenstile der Varianten (Canvas 2D). welt.js bewegt die
// Fische, hier steht nur, WIE gezeichnet wird. Jeder Stil liefert:
//   fischFarben  [[koerper, flecken], ...]  (null = Partikelfarbe)
//   hintergrund(g, w, h, W)   einmal pro Groesse, in eine Offscreen-Leinwand
//   unter(g, t, w, h, W)      optional, jedes Bild VOR den Fischen
//   fisch(g, f, W)            ein Koi (f.segs = Wirbelsaeule, Kopf zuerst)
//   blatt(g, bl, W)           Seerosenblatt (schon verschoben/gedreht)
//   welle(g, x, y, r, W)      ein Wellenring (globalAlpha ist gesetzt)
//   ueber(g, t, w, h, W)      optional, jedes Bild NACH allem
// W = Werkzeug (unten). Nur Canvas-API, kein DOM ausser createElement.
(function () {
  const TAU = Math.PI * 2;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function leinwand(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  // Papier-/Kreidekoernung direkt in die Pixel (nur beim Hintergrund-Bau).
  function koernung(g, w, h, staerke) {
    const bild = g.getImageData(0, 0, w, h), d = bild.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * staerke;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(bild, 0, 0);
  }
  function stempel(g, x, y) {
    g.save(); g.globalAlpha = 0.88; g.fillStyle = '#c0392b'; g.fillRect(x, y, 26, 26);
    g.fillStyle = '#f6efe2'; g.font = 'bold 19px "Yu Mincho", "MS Mincho", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('鯉', x + 13, y + 14);
    g.restore();
  }

  // --- Koerper-Geometrie (fuer alle Stile gleich) ----------------------------
  function koerper(g, f, dx, dy) {
    const L = [], R = [], n = f.segs.length, breite = f.laenge * 0.2;
    for (let i = 0; i < n; i++) {
      const p = f.segs[i], q = f.segs[Math.min(i + 1, n - 1)], o = f.segs[Math.max(i - 1, 0)];
      const wi = Math.atan2(o.y - q.y, o.x - q.x) + Math.PI / 2, tt = i / (n - 1);
      const b = breite * Math.pow(Math.sin(Math.PI * (0.18 + tt * 0.78)), 0.9) * (1 - tt * 0.55);
      L.push([p.x + Math.cos(wi) * b + dx, p.y + Math.sin(wi) * b + dy]);
      R.push([p.x - Math.cos(wi) * b + dx, p.y - Math.sin(wi) * b + dy]);
    }
    const k = f.segs[0], h1 = f.segs[1], ka = Math.atan2(k.y - h1.y, k.x - h1.x);
    g.beginPath(); g.moveTo(R[0][0], R[0][1]);
    g.quadraticCurveTo(k.x + Math.cos(ka) * breite * 1.1 + dx, k.y + Math.sin(ka) * breite * 1.1 + dy, L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) g.lineTo(L[i][0], L[i][1]);
    for (let i = n - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
    g.closePath();
  }
  // Schwanz (2 Lappen) + Brustflossen als einzelne Pfade.
  function flossen(g, f, dx, dy, lang, je) {
    const n = f.segs.length, ende = f.segs[n - 1], vor = f.segs[n - 3];
    const wa = Math.atan2(ende.y - vor.y, ende.x - vor.x), schlag = Math.sin(f.phase) * 0.5;
    const L = f.laenge * (lang ? 0.55 : 0.32);
    for (let s = -1; s <= 1; s += 2) {
      const aa = wa + s * 0.5 + schlag;
      g.beginPath(); g.moveTo(ende.x + dx, ende.y + dy);
      g.quadraticCurveTo(ende.x + Math.cos(wa + s * 0.15) * L * 0.6 + dx, ende.y + Math.sin(wa + s * 0.15) * L * 0.6 + dy,
        ende.x + Math.cos(aa) * L + dx, ende.y + Math.sin(aa) * L + dy);
      g.quadraticCurveTo(ende.x + Math.cos(wa) * L * 0.5 + dx, ende.y + Math.sin(wa) * L * 0.5 + dy, ende.x + dx, ende.y + dy);
      je();
    }
    const b1 = f.segs[2], b2 = f.segs[3], ba = Math.atan2(b1.y - b2.y, b1.x - b2.x);
    for (let s = -1; s <= 1; s += 2) {
      const fa = ba + s * (2.1 + Math.sin(f.phase * 0.7) * 0.25);
      g.beginPath();
      g.ellipse(b1.x + Math.cos(fa) * f.laenge * 0.17 + dx, b1.y + Math.sin(fa) * f.laenge * 0.17 + dy,
        f.laenge * (lang ? 0.18 : 0.13), f.laenge * 0.06, fa, 0, TAU);
      je();
    }
  }
  function flecken(g, f) {
    g.beginPath();
    for (const fl of f.flecken) {
      const p = f.segs[fl.s], r = f.laenge * 0.17 * fl.r, x = p.x + fl.dx * 6, y = p.y + fl.dx * 4;
      g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU);
    }
  }
  function augen(g, f, farbe) {
    const k = f.segs[0], h1 = f.segs[1], ka = Math.atan2(k.y - h1.y, k.x - h1.x);
    g.fillStyle = farbe;
    for (let s = -1; s <= 1; s += 2) {
      g.beginPath();
      g.arc(k.x + Math.cos(ka + s * 0.9) * f.laenge * 0.09, k.y + Math.sin(ka + s * 0.9) * f.laenge * 0.09, 1.4, 0, TAU);
      g.fill();
    }
  }
  function blattPfad(g, r) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, 0.28, TAU - 0.28); g.closePath(); }
  function blattAdern(g, r) {
    for (let a = 0.9; a < TAU - 0.5; a += 0.9) {
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85); g.stroke();
    }
  }
  function bluete(g, farbe, rand, randBreite) {
    for (let p = 0; p < 7; p++) {
      const pa = p / 7 * TAU;
      g.fillStyle = farbe;
      g.beginPath(); g.ellipse(Math.cos(pa) * 6, Math.sin(pa) * 6, 7, 3.6, pa, 0, TAU); g.fill();
      if (rand) { g.strokeStyle = rand; g.lineWidth = randBreite || 1; g.stroke(); }
    }
    g.fillStyle = '#ffd54a'; g.beginPath(); g.arc(0, 0, 3.5, 0, TAU); g.fill();
  }
  function doppelRing(g, x, y, r) {
    g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, TAU); g.stroke();
    g.beginPath(); g.ellipse(x, y, r * 0.6, r * 0.48, 0, 0, TAU); g.stroke();
  }
  function dichte(w, h) { return Math.max(0.3, (w * h) / 141000); }

  const W = { TAU, rnd, leinwand, koernung, stempel, koerper, flossen, flecken, augen, dichte };

  // =========================================================================
  const aquarell = {
    fischFarben: [['#f3ece0', null], ['#f3ece0', '#d9534a'], ['#efc36a', '#e8a443'], ['#f3ece0', '#3c3a3f'], ['#f3ece0', null]],
    hintergrund(g, w, h) {
      g.fillStyle = '#dfeae2'; g.fillRect(0, 0, w, h);
      const toene = ['120,170,165', '150,190,160', '110,150,170', '190,210,180', '95,140,150'];
      const n = Math.round(260 * dichte(w, h));
      for (let i = 0; i < n; i++) {
        const x = rnd(-40, w + 40), y = rnd(-40, h + 40), r = rnd(20, 90), t = toene[i % toene.length];
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(' + t + ',' + rnd(0.04, 0.1) + ')'); gr.addColorStop(1, 'rgba(' + t + ',0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      for (let i = 0; i < 40 * dichte(w, h); i++) {
        g.strokeStyle = 'rgba(70,110,120,' + rnd(0.03, 0.07) + ')'; g.lineWidth = rnd(1, 3);
        const sx = rnd(0, w), sy = rnd(0, h);
        g.beginPath(); g.moveTo(sx, sy);
        g.bezierCurveTo(sx + rnd(-60, 60), sy + rnd(-30, 30), sx + rnd(-60, 60), sy + rnd(-30, 30), sx + rnd(-90, 90), sy + rnd(-40, 40));
        g.stroke();
      }
    },
    koernung: 18,
    fisch(g, f) {
      g.save(); g.filter = 'blur(3px)'; g.globalAlpha = 0.18; g.fillStyle = '#2a4a50';
      koerper(g, f, 5, 7); g.fill(); g.restore();
      g.save(); g.globalAlpha = 0.88;
      g.fillStyle = 'rgba(240,225,205,.6)';
      flossen(g, f, 0, 0, false, () => g.fill());
      koerper(g, f, 0, 0); g.fillStyle = f.farben[0]; g.fill();
      g.save(); g.clip(); flecken(g, f); g.fillStyle = f.farben[1]; g.fill(); g.restore();
      koerper(g, f, 0, 0); g.strokeStyle = 'rgba(150,90,70,.35)'; g.lineWidth = 1.2; g.stroke();
      augen(g, f, 'rgba(40,40,50,.7)');
      g.restore();
    },
    blatt(g, bl) {
      g.globalAlpha = 0.75; blattPfad(g, bl.r); g.fillStyle = '#8fb58a'; g.fill();
      g.strokeStyle = 'rgba(80,120,80,.35)'; g.lineWidth = 1; g.stroke();
      g.strokeStyle = 'rgba(30,70,40,.3)'; blattAdern(g, bl.r);
      g.globalAlpha = 1;
      if (bl.bluete) bluete(g, 'rgba(240,170,190,.9)');
    },
    welle(g, x, y, r) { g.strokeStyle = 'rgba(90,130,140,.45)'; g.lineWidth = 1.4; doppelRing(g, x, y, r); }
  };

  // =========================================================================
  const lofi = {
    fischFarben: [['#ffe9cf', null], ['#ffe9cf', '#ff5d6c'], ['#ffd27a', '#ffa64d'], ['#ffe9cf', '#2a2950'], [null, '#ffe9cf']],
    hintergrund(g, w, h, Wz, zustand) {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#2c2c63'); gr.addColorStop(0.6, '#36457a'); gr.addColorStop(1, '#2a3a63');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) {
        const mb = 46 - Math.abs(i - 3) * 8;
        g.fillStyle = 'rgba(255,236,190,' + (0.55 - i * 0.05) + ')';
        g.beginPath(); g.ellipse(w * 0.68 + (i % 2 ? 6 : -6), 46 + i * 9, Math.max(6, mb), 2.6, 0, 0, TAU); g.fill();
      }
      g.strokeStyle = 'rgba(140,160,230,.13)'; g.lineWidth = 2; g.lineCap = 'round';
      for (let i = 0; i < 14 * dichte(w, h); i++) {
        const bx = rnd(0, w), by = rnd(120, h);
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + rnd(20, 60), by); g.stroke();
      }
      zustand.sterne = [];
      for (let i = 0; i < 26 * dichte(w, h); i++) zustand.sterne.push({ x: rnd(0, w), y: rnd(0, h), p: rnd(0, TAU) });
    },
    unter(g, t, w, h, Wz, zustand) {
      for (const s of zustand.sterne || []) {
        g.fillStyle = 'rgba(255,245,210,' + (0.3 + 0.7 * Math.max(0, Math.sin(t * 0.03 + s.p))) + ')';
        g.beginPath(); g.arc(s.x, s.y, 1.2, 0, TAU); g.fill();
      }
    },
    fisch(g, f) {
      g.fillStyle = f.farben[1]; g.strokeStyle = '#1d1c3d'; g.lineWidth = 1.5;
      flossen(g, f, 0, 0, false, () => { g.fill(); g.stroke(); });
      koerper(g, f, 0, 0); g.fillStyle = f.farben[0]; g.fill();
      g.save(); g.clip(); flecken(g, f); g.fillStyle = f.farben[1]; g.fill(); g.restore();
      koerper(g, f, 0, 0); g.strokeStyle = '#1d1c3d'; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
      augen(g, f, '#111');
    },
    blatt(g, bl) {
      blattPfad(g, bl.r); g.fillStyle = '#3d7f74'; g.fill();
      g.strokeStyle = '#1d1c3d'; g.lineWidth = 2; g.stroke();
      g.strokeStyle = 'rgba(29,28,61,.5)'; g.lineWidth = 1; blattAdern(g, bl.r);
      if (bl.bluete) bluete(g, '#ffb3d1', '#1d1c3d', 1);
    },
    welle(g, x, y, r) { g.strokeStyle = 'rgba(200,210,255,.55)'; g.lineWidth = 2; doppelRing(g, x, y, r); }
  };

  // =========================================================================
  const holzschnitt = {
    fischFarben: [['#f2e6cc', null], ['#f2e6cc', '#c0392b'], ['#e8a53a', '#f2e6cc'], ['#f2e6cc', '#1c1a18'], [null, '#f2e6cc']],
    hintergrund(g, w, h) {
      g.fillStyle = '#2f4d70'; g.fillRect(0, 0, w, h);
      g.lineWidth = 1;
      for (let row = 0, y = 0; y < h + 14; row++, y += 9) {
        for (let x = (row % 2) * 12 - 12; x < w + 24; x += 24) {
          for (let r = 12; r > 0; r -= 4) {
            g.fillStyle = r === 8 ? '#3d618a' : '#2f4d70';
            g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.fill();
            g.strokeStyle = 'rgba(232,222,196,.55)';
            g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.stroke();
          }
        }
      }
      g.strokeStyle = '#efe3c8'; g.lineWidth = 14; g.strokeRect(0, 0, w, h);
      g.strokeStyle = '#1c1a18'; g.lineWidth = 2.5; g.strokeRect(7, 7, w - 14, h - 14);
    },
    koernung: 20,
    stempel: true,
    fisch(g, f) {
      g.fillStyle = f.farben[0]; g.strokeStyle = '#1c1a18'; g.lineWidth = 1.5;
      flossen(g, f, 0, 0, false, () => { g.fill(); g.stroke(); });
      koerper(g, f, 0, 0); g.fillStyle = f.farben[0]; g.fill();
      g.save(); g.clip(); flecken(g, f); g.fillStyle = f.farben[1]; g.fill();
      g.strokeStyle = 'rgba(28,26,24,.45)'; g.lineWidth = 0.8;
      for (let i = 2; i < 10; i++) {
        const p = f.segs[i];
        g.beginPath(); g.arc(p.x, p.y, f.laenge * 0.12, f.a + 1.2, f.a + 1.9 + Math.PI); g.stroke();
      }
      g.restore();
      koerper(g, f, 0, 0); g.strokeStyle = '#1c1a18'; g.lineWidth = 2.2; g.lineJoin = 'round'; g.stroke();
      augen(g, f, '#111');
    },
    blatt(g, bl) {
      blattPfad(g, bl.r); g.fillStyle = '#4b6e3a'; g.fill();
      g.strokeStyle = '#1c1a18'; g.lineWidth = 1.8; g.stroke();
      g.lineWidth = 0.8; blattAdern(g, bl.r);
      if (bl.bluete) bluete(g, '#e88aa0', '#1c1a18', 0.9);
    },
    welle(g, x, y, r) { g.strokeStyle = 'rgba(240,230,205,.85)'; g.lineWidth = 2; doppelRing(g, x, y, r); }
  };

  // =========================================================================
  const tusche = {
    // Ein roter Fisch (Partikelfarbe), der Rest Tusche.
    fischFarben: [[null, null], ['rgba(25,25,25,.78)', null], ['rgba(40,40,40,.55)', null], ['rgba(25,25,25,.8)', null], ['rgba(60,60,60,.45)', null]],
    hintergrund(g, w, h) {
      g.fillStyle = '#f4efe3'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 18 * dichte(w, h); i++) {
        const x = rnd(0, w), y = rnd(0, h), r = rnd(30, 110);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(60,60,60,' + rnd(0.03, 0.08) + ')'); gr.addColorStop(1, 'rgba(60,60,60,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const sx = rnd(8, 40) + (i > 1 ? w - 60 : 0), sy = h - rnd(0, 40);
        g.strokeStyle = 'rgba(30,30,30,' + rnd(0.35, 0.6) + ')'; g.lineWidth = rnd(1.5, 3);
        g.beginPath(); g.moveTo(sx, sy);
        g.quadraticCurveTo(sx + rnd(-10, 20), sy - 120, sx + rnd(-20, 30), sy - rnd(170, 260)); g.stroke();
      }
    },
    koernung: 20,
    stempel: true,
    fisch(g, f) {
      g.save(); g.filter = 'blur(1.1px)';
      g.fillStyle = f.farben[0]; g.globalAlpha = 0.35;
      flossen(g, f, 0, 0, true, () => g.fill());
      g.globalAlpha = 1; koerper(g, f, 0, 0); g.fill();
      g.restore();
      g.strokeStyle = 'rgba(10,10,10,.55)'; g.lineWidth = 2.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(f.segs[0].x, f.segs[0].y);
      for (let i = 1; i < 7; i++) g.lineTo(f.segs[i].x, f.segs[i].y);
      g.stroke();
      augen(g, f, 'rgba(10,10,10,.9)');
    },
    blatt(g, bl) {
      g.filter = 'blur(2px)'; blattPfad(g, bl.r); g.fillStyle = 'rgba(70,80,70,.22)'; g.fill(); g.filter = 'none';
      g.strokeStyle = 'rgba(30,30,30,.35)'; g.lineWidth = 1.2; g.stroke();
    },
    welle(g, x, y, r) { g.strokeStyle = 'rgba(40,40,40,.35)'; g.lineWidth = 1.3; doppelRing(g, x, y, r); }
  };

  // =========================================================================
  const bleiglas = {
    fischFarben: [['#ffcf8a', null], ['#ffe2b8', '#e8402f'], ['#ffd34a', '#ff9a2a'], ['#ffe2b8', '#5a2a6a'], [null, '#ffe2b8']],
    hintergrund(g, w, h) {
      // Voronoi-Scherben mit Bleifassung in voller Aufloesung. Die Punkte
      // liegen auf einem verwackelten Raster - pro Pixel reichen so die 3x3
      // Nachbarzellen (sonst waeren grosse Fenster zu langsam).
      const Z = 64, BW = Math.ceil(w), BH = Math.ceil(h), ZX = Math.ceil(BW / Z) + 2, ZY = Math.ceil(BH / Z) + 2;
      const palette = [[40, 90, 150], [30, 120, 140], [50, 70, 130], [25, 105, 110], [70, 60, 140], [35, 140, 160], [20, 80, 120]];
      const raster = [];
      for (let zy = 0; zy < ZY; zy++) for (let zx = 0; zx < ZX; zx++) {
        raster.push([(zx - 1 + rnd(0.1, 0.9)) * Z, (zy - 1 + rnd(0.1, 0.9)) * Z,
          palette[Math.floor(Math.random() * palette.length)], rnd(0.8, 1.2)]);
      }
      const c = leinwand(BW, BH), cg = c.getContext('2d'), bild = cg.createImageData(BW, BH), d = bild.data;
      for (let y = 0; y < BH; y++) {
        const zy = Math.floor(y / Z) + 1;
        for (let x = 0; x < BW; x++) {
          const zx = Math.floor(x / Z) + 1;
          let b1 = 1e9, b2 = 1e9, n1 = raster[0];
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const p = raster[(zy + oy) * ZX + zx + ox];
            if (!p) continue;
            const dx = x - p[0], dy = y - p[1], dd = dx * dx + dy * dy;
            if (dd < b1) { b2 = b1; b1 = dd; n1 = p; } else if (dd < b2) b2 = dd;
          }
          const o = (y * BW + x) * 4, rand = Math.sqrt(b2) - Math.sqrt(b1);
          if (rand < 2.6) { d[o] = 18; d[o + 1] = 16; d[o + 2] = 22; } else {
            const hell = n1[3] * (0.85 + 0.25 * Math.min(1, rand / 24));
            d[o] = n1[2][0] * hell; d[o + 1] = n1[2][1] * hell; d[o + 2] = n1[2][2] * hell;
          }
          d[o + 3] = 255;
        }
      }
      cg.putImageData(bild, 0, 0);
      g.imageSmoothingEnabled = true; g.drawImage(c, 0, 0, w, h);
    },
    fisch(g, f) {
      g.fillStyle = 'rgba(255,230,200,.75)'; g.strokeStyle = '#121016'; g.lineWidth = 2.2;
      flossen(g, f, 0, 0, false, () => { g.fill(); g.stroke(); });
      koerper(g, f, 0, 0); g.fillStyle = f.farben[0]; g.fill();
      g.save(); g.clip(); flecken(g, f); g.fillStyle = f.farben[1]; g.fill();
      g.strokeStyle = '#121016'; g.lineWidth = 2;
      for (let i = 3; i < 11; i += 3) {
        const q = f.segs[i], o = f.segs[i - 1], wi = Math.atan2(q.y - o.y, q.x - o.x) + Math.PI / 2;
        g.beginPath(); g.moveTo(q.x + Math.cos(wi) * 20, q.y + Math.sin(wi) * 20);
        g.lineTo(q.x - Math.cos(wi) * 20, q.y - Math.sin(wi) * 20); g.stroke();
      }
      const gl = g.createRadialGradient(f.segs[2].x, f.segs[2].y, 1, f.segs[2].x, f.segs[2].y, f.laenge * 0.5);
      gl.addColorStop(0, 'rgba(255,255,255,.45)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gl; g.fillRect(f.x - 70, f.y - 70, 140, 140);
      g.restore();
      koerper(g, f, 0, 0); g.strokeStyle = '#121016'; g.lineWidth = 3.2; g.lineJoin = 'round'; g.stroke();
      augen(g, f, '#111');
    },
    blatt(g, bl) {
      blattPfad(g, bl.r); g.fillStyle = '#3fa35a'; g.fill();
      const gl = g.createRadialGradient(-bl.r * 0.4, -bl.r * 0.4, 1, 0, 0, bl.r);
      gl.addColorStop(0, 'rgba(200,255,180,.45)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gl; g.fill();
      g.strokeStyle = '#121016'; g.lineWidth = 2.6; g.stroke();
      if (bl.bluete) bluete(g, '#ff9ac0', '#121016', 1.6);
    },
    welle(g, x, y, r) { g.strokeStyle = 'rgba(255,240,200,.6)'; g.lineWidth = 1.4; doppelRing(g, x, y, r); },
    ueber(g, t, w, h) {
      // Lichtschein wandert diagonal ueber das Fenster.
      const lx = ((t * 0.8) % (w + 300)) - 150;
      g.save(); g.globalCompositeOperation = 'lighter';
      const lg = g.createLinearGradient(lx - 80, 0, lx + 80, h);
      lg.addColorStop(0, 'rgba(255,240,200,0)'); lg.addColorStop(0.5, 'rgba(255,240,200,.14)'); lg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = lg; g.fillRect(0, 0, w, h); g.restore();
    }
  };

  const ziel = typeof window !== 'undefined' ? window : globalThis;
  ziel.KoiStile = { werkzeug: W, stile: { aquarell, lofi, holzschnitt, tusche, bleiglas } };
})();
