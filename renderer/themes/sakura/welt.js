// Sakura: Kirschblueten segeln; Maus streut ab und zu eine Bluete, Klick ins
// Leere = Bluetenwirbel, Kiste = Bluetenexplosion aus dem Punkte-Chip.
(function () {
  window.TwitchDualWelten = window.TwitchDualWelten || {};
  window.TwitchDualWelten.sakura = function ({ engine, FxEngine, farben }) {
    const { tr, rnd } = FxEngine;
    const FARBE = (farben && farben.partikel) || '#ffb3cc';
    let letzteSpur = 0;

    function bluete(ebene, x0, y0, x1, y1, ms, groesse, deckkraft) {
      const dreh = rnd(-360, 360);
      // Bluete als Form statt Emoji: nur so wirkt die frei waehlbare Farbe.
      return engine.spawn({
        ebene,
        stil: {
          width: groesse + 'px', height: Math.round(groesse * 0.8) + 'px',
          marginLeft: (-groesse / 2) + 'px', marginTop: (-groesse / 2) + 'px',
          borderRadius: '150% 0 150% 0',
          background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,.75), transparent 65%), ' + FARBE,
          boxShadow: '0 0 3px rgba(0,0,0,.08)'
        },
        keyframes: [
          { transform: tr(x0, y0, ' rotate(0deg)'), opacity: 0 },
          { opacity: deckkraft, offset: 0.1 },
          { transform: tr((x0 + x1) / 2 + rnd(-30, 30), (y0 + y1) / 2, ' rotate(' + (dreh / 2) + 'deg)'), opacity: deckkraft, offset: 0.5 },
          { transform: tr(x1, y1, ' rotate(' + dreh + 'deg)'), opacity: 0 }
        ],
        dauerMs: ms, easing: 'ease-in-out'
      });
    }

    return {
      start() {
        engine.intervall(() => {
          const { w, h } = engine.groesse('hinten');
          const x = rnd(-20, w);
          bluete('hinten', x, -24, x + rnd(-40, 90), h + 24, rnd(6000, 10000), rnd(11, 17), 1);
        }, 900);
      },
      stop() {},
      maus(x, y) {
        const jetzt = Date.now();
        if (jetzt - letzteSpur < 350) return;
        letzteSpur = jetzt;
        bluete('hinten', x, y, x + rnd(-30, 30), y + rnd(60, 110), rnd(1400, 2000), rnd(9, 12), 0.9);
      },
      klickInsLeere(x, y) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          bluete('hinten', x, y, x + Math.cos(a) * rnd(35, 60), y + Math.sin(a) * rnd(35, 60) + 25, rnd(900, 1300), rnd(10, 14), 1);
        }
      },
      ereignis(art, daten) {
        const u = daten.ursprung || { x: 0, y: 0 };
        if (art === 'kiste') {
          for (let i = 0; i < 26; i++) {
            const zielX = u.x + rnd(-260, 60);
            bluete('vorn', u.x, u.y, zielX, u.y - rnd(120, 420), rnd(2200, 3200), rnd(14, 24), 1);
          }
        } else {
          for (let i = 0; i < 5; i++) bluete('vorn', u.x, u.y, u.x + rnd(-50, 30), u.y - rnd(30, 80), rnd(900, 1300), rnd(10, 13), 1);
        }
      },
      gast() {
        const { w, h } = engine.groesse('gast');
        const y0 = rnd(0, h * 0.4);
        bluete('gast', -30, y0, w + 30, y0 + rnd(h * 0.3, h * 0.6), rnd(5000, 6500), 22, 0.85);
      }
    };
  };
})();
