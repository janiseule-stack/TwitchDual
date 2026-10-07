// Koi-Teich: Kois ziehen Kreise, Maus macht leise Wellen, Klick = Welle und
// die Fische fluechten. Kiste = goldene Lotusbluete am Punkte-Chip.
(function () {
  window.TwitchDualWelten = window.TwitchDualWelten || {};
  window.TwitchDualWelten.koi = function ({ engine, FxEngine, farben }) {
    const { tr, rnd } = FxEngine;
    const FARBE = (farben && farben.partikel) || '#ff7a2a';
    const FISCH = {
      width: '18px', height: '8px', marginLeft: '-9px', marginTop: '-4px',
      borderRadius: '50% 60% 60% 50%',
      background: 'radial-gradient(circle at 25% 50%, #fff 0 2px, transparent 3px), ' + FARBE,
      boxShadow: '0 0 6px ' + FARBE + '99'
    };
    let fische = [];
    let letzteWelle = 0;
    let lockUntil = 0;
    let lockZiel = null;
    // Wie im Wald: bei unsichtbarer Ebene (0x0) erst im ersten echten Frame verteilen.
    let verteilt = false;
    function verteile(w, h) {
      for (const f of fische) { f.x = rnd(20, Math.max(21, w - 20)); f.y = rnd(20, Math.max(21, h - 20)); }
      verteilt = true;
    }

    function schwanz(el) {
      const s = document.createElement('div');
      s.style.position = 'absolute'; s.style.right = '-7px'; s.style.top = '0';
      s.style.borderTop = '4px solid transparent'; s.style.borderBottom = '4px solid transparent';
      s.style.borderLeft = '7px solid ' + FARBE;
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
        if (w > 0 && h > 0) verteilt = true;
        engine.schleife((dt) => {
          const { w: W, h: H } = engine.groesse('hinten');
          if (!verteilt && W > 0 && H > 0) verteile(W, H);
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
