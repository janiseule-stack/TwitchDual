// Wald: Gluehwuermchen schwirren und pulsieren, folgen der Maus locker.
// Klick = Funke, Kiste = Schwarm fliegt zum Punkte-Chip und leuchtet auf.
(function () {
  window.TwitchDualWelten = window.TwitchDualWelten || {};
  window.TwitchDualWelten.wald = function ({ engine, FxEngine }) {
    const { tr, rnd } = FxEngine;
    const GLUEH = {
      width: '5px', height: '5px', marginLeft: '-2px', marginTop: '-2px', borderRadius: '50%',
      background: '#e8ff7a', boxShadow: '0 0 8px 3px rgba(232, 255, 122, .7)'
    };
    let fliegen = [];
    let maus = null;

    function funke(ebene, x0, y0, x1, y1, ms) {
      engine.spawn({
        ebene, stil: GLUEH,
        keyframes: [
          { transform: tr(x0, y0), opacity: 0 },
          { opacity: 1, offset: 0.2 },
          { transform: tr(x1, y1), opacity: 1, offset: 0.85 },
          { transform: tr(x1, y1, ' scale(2.2)'), opacity: 0 }
        ],
        dauerMs: ms, easing: 'ease-in-out'
      });
    }

    return {
      start() {
        const { w, h } = engine.groesse('hinten');
        const n = Math.max(2, Math.round(6 * engine.faktor));
        for (let i = 0; i < n; i++) {
          const el = engine.element({ ebene: 'hinten', stil: GLUEH });
          if (!el) break;
          fliegen.push({ el, x: rnd(0, w), y: rnd(0, h), vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), phase: rnd(0, 6.28) });
        }
        engine.schleife((dt) => {
          const { w: W, h: H } = engine.groesse('hinten');
          const k = dt / 16;
          for (const f of fliegen) {
            f.phase += dt * 0.004;
            if (maus && Math.hypot(maus.x - f.x, maus.y - f.y) < 160) {
              f.vx += (maus.x - f.x) * 0.0006 * k;
              f.vy += (maus.y - f.y) * 0.0006 * k;
            }
            f.vx = (f.vx + rnd(-0.05, 0.05)) * 0.98;
            f.vy = (f.vy + rnd(-0.05, 0.05)) * 0.98;
            const v = Math.hypot(f.vx, f.vy);
            if (v > 1.2) { f.vx *= 1.2 / v; f.vy *= 1.2 / v; }
            f.x += f.vx * k; f.y += f.vy * k;
            if (f.x < -10) f.x = W + 10; if (f.x > W + 10) f.x = -10;
            if (f.y < -10) f.y = H + 10; if (f.y > H + 10) f.y = -10;
            f.el.style.transform = tr(f.x, f.y);
            f.el.style.opacity = String(0.35 + 0.65 * (0.5 + 0.5 * Math.sin(f.phase)));
          }
        });
      },
      stop() { fliegen = []; },
      maus(x, y) { maus = { x, y }; },
      klickInsLeere(x, y) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          funke('hinten', x, y, x + Math.cos(a) * rnd(20, 40), y + Math.sin(a) * rnd(20, 40), rnd(700, 1000));
        }
      },
      ereignis(art, daten) {
        const u = daten.ursprung || { x: 0, y: 0 };
        const { w, h } = engine.groesse('vorn');
        const n = art === 'kiste' ? 18 : 3;
        for (let i = 0; i < n; i++) {
          const vonRand = Math.random() < 0.5;
          const x0 = vonRand ? (Math.random() < 0.5 ? -10 : w + 10) : rnd(0, w);
          const y0 = vonRand ? rnd(0, h) : -10;
          funke('vorn', x0, y0, u.x + rnd(-12, 12), u.y + rnd(-8, 8), art === 'kiste' ? rnd(1400, 2400) : rnd(900, 1300));
        }
      },
      gast() {
        const { w, h } = engine.groesse('gast');
        const y = rnd(h * 0.2, h * 0.8);
        engine.spawn({
          ebene: 'gast', stil: GLUEH,
          keyframes: [
            { transform: tr(-20, y), opacity: 0 },
            { transform: tr(w * 0.3, y - 40), opacity: 1, offset: 0.3 },
            { transform: tr(w * 0.6, y + 30), opacity: 0.6, offset: 0.6 },
            { transform: tr(w + 20, y - 20), opacity: 0 }
          ],
          dauerMs: 6000, easing: 'ease-in-out'
        });
      }
    };
  };
})();
