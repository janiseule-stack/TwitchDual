// Neon Dual: keine Dauer-Animation (Bestandsnutzer sollen nichts Neues
// aufgedraengt bekommen), nur ein Cyan/Magenta-Funkenregen am Punkte-Chip.
(function () {
  window.TwitchDualWelten = window.TwitchDualWelten || {};
  window.TwitchDualWelten['neon-dual'] = function ({ engine, FxEngine }) {
    const { tr, rnd } = FxEngine;
    function funke(x, y, i, weit) {
      const farbe = i % 2 ? 'var(--onair-to, #ff4fa3)' : 'var(--onair-from, #35e0ff)';
      const winkel = rnd(Math.PI * 1.05, Math.PI * 1.95);   // nach oben gefaechert
      const d = weit ? rnd(60, 160) : rnd(20, 50);
      engine.spawn({
        ebene: 'vorn',
        stil: { width: '4px', height: '4px', marginLeft: '-2px', marginTop: '-2px', borderRadius: '50%', background: farbe, boxShadow: '0 0 8px ' + farbe },
        keyframes: [
          { transform: tr(x, y), opacity: 1 },
          { transform: tr(x + Math.cos(winkel) * d, y + Math.sin(winkel) * d), opacity: 0.9, offset: 0.6 },
          { transform: tr(x + Math.cos(winkel) * d * 1.1, y + Math.sin(winkel) * d + 30), opacity: 0 }
        ],
        dauerMs: weit ? rnd(1100, 1700) : rnd(600, 900),
        easing: 'cubic-bezier(.2,.8,.3,1)'
      });
    }
    return {
      start() {},
      stop() {},
      ereignis(art, daten) {
        const u = daten.ursprung || { x: 0, y: 0 };
        const kiste = art === 'kiste';
        const n = kiste ? 26 : 8;
        for (let i = 0; i < n; i++) funke(u.x, u.y, i, kiste);
      }
    };
  };
})();
