// Seifenblasen: Blasen steigen schillernd auf. Klick auf eine Blase = sie
// platzt in Funken, Klick daneben = neue Blase. Punkte/Kiste = Blase mit "+N".
(function () {
  window.TwitchDualWelten = window.TwitchDualWelten || {};
  window.TwitchDualWelten.blasen = function ({ engine, FxEngine }) {
    const { tr, rnd } = FxEngine;
    const SCHILLER = 'radial-gradient(circle at 30% 30%, rgba(255,255,255,.95) 0 12%, transparent 13%), ' +
      'radial-gradient(circle, rgba(255,255,255,0) 55%, rgba(170,200,255,.55) 70%, rgba(255,170,230,.6) 85%, rgba(170,255,230,.5) 100%)';
    const FUNKEN = ['#b48bff', '#7ec8ff', '#ff9ad5', '#8affc8'];
    const blasen = new Set();

    function blase(ebene, x, yStart, yEnde, s, ms, text) {
      const sw = rnd(10, 25);
      const stil = { width: s + 'px', height: s + 'px', marginLeft: (-s / 2) + 'px', marginTop: (-s / 2) + 'px', borderRadius: '50%', background: SCHILLER };
      if (text) {
        stil.display = 'flex'; stil.alignItems = 'center'; stil.justifyContent = 'center';
        stil.font = '700 11px "Segoe UI", sans-serif'; stil.color = '#5a4adf';
      }
      const el = engine.spawn({
        ebene, inhalt: text || '', stil,
        keyframes: [
          { transform: tr(x, yStart) },
          { transform: tr(x + sw, yStart + (yEnde - yStart) * 0.33) },
          { transform: tr(x - sw, yStart + (yEnde - yStart) * 0.66) },
          { transform: tr(x + sw / 2, yEnde) }
        ],
        dauerMs: ms, easing: 'ease-in-out'
      });
      if (el && ebene === 'hinten') blasen.add(el);
      return el;
    }
    function platzen(el) {
      const ebene = engine.rechteck('hinten');
      const r = el.getBoundingClientRect();
      const cx = r.left - ebene.left + r.width / 2;
      const cy = r.top - ebene.top + r.height / 2;
      blasen.delete(el);
      engine.entferne(el);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const d = rnd(12, 22);
        engine.spawn({
          ebene: 'hinten',
          stil: { width: '4px', height: '4px', marginLeft: '-2px', marginTop: '-2px', borderRadius: '50%', background: FUNKEN[i % 4] },
          keyframes: [{ transform: tr(cx, cy), opacity: 1 }, { transform: tr(cx + Math.cos(a) * d, cy + Math.sin(a) * d), opacity: 0 }],
          dauerMs: 500, easing: 'ease-out'
        });
      }
    }

    return {
      start() {
        engine.intervall(() => {
          const { w, h } = engine.groesse('hinten');
          const s = rnd(10, 26);
          blase('hinten', rnd(0, w), h + s, -s - 5, s, rnd(5000, 8000));
          for (const el of blasen) if (!el.isConnected) blasen.delete(el);
        }, 700);
      },
      stop() { blasen.clear(); },
      klickInsLeere(x, y) {
        const ebene = engine.rechteck('hinten');
        let getroffen = false;
        for (const el of [...blasen]) {
          if (!el.isConnected) { blasen.delete(el); continue; }
          const r = el.getBoundingClientRect();
          const cx = r.left - ebene.left + r.width / 2;
          const cy = r.top - ebene.top + r.height / 2;
          if (Math.hypot(cx - x, cy - y) < r.width / 2 + 8) { platzen(el); getroffen = true; }
        }
        if (!getroffen) blase('hinten', x, y, -30, rnd(14, 22), rnd(1800, 2600));
      },
      ereignis(art, daten) {
        const u = daten.ursprung || { x: 0, y: 0 };
        const text = '+' + Number(daten.betrag || 0).toLocaleString('de-DE');
        if (art === 'kiste') {
          blase('vorn', u.x, u.y, u.y - rnd(260, 420), 44, 2800, text);
          for (let i = 0; i < 20; i++) {
            setTimeout(() => blase('vorn', u.x + rnd(-120, 40), u.y, u.y - rnd(150, 400), rnd(10, 22), rnd(1500, 2500)), i * 40);
          }
        } else {
          blase('vorn', u.x, u.y, u.y - rnd(80, 140), 34, 1600, text);
        }
      },
      gast() {
        const { w, h } = engine.groesse('gast');
        const y = rnd(h * 0.4, h * 0.9);
        engine.spawn({
          ebene: 'gast',
          stil: { width: '30px', height: '30px', marginLeft: '-15px', marginTop: '-15px', borderRadius: '50%', background: SCHILLER },
          keyframes: [
            { transform: tr(-30, y), opacity: 0 },
            { opacity: 0.85, offset: 0.15 },
            { transform: tr(w * 0.5, y - h * 0.3), opacity: 0.85, offset: 0.55 },
            { transform: tr(w + 30, y - h * 0.5), opacity: 0 }
          ],
          dauerMs: 6000, easing: 'ease-in-out'
        });
      }
    };
  };
})();
