// Partikel-Engine fuer die Theme-Welten (Spec 2026-10-07, Abschnitt 6).
// Animation NUR ueber transform/opacity per Web Animations API (Compositor,
// kein Layout). Alle Abhaengigkeiten (DOM, Zeitgeber, Sichtbarkeit) sind
// injizierbar -> unter Node mit Attrappen testbar. UMD wie die anderen Libs.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FxEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function tr(x, y, extra) {
    return 'translate(' + x + 'px,' + y + 'px)' + (extra || '');
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function createEngine(opts) {
    const o = opts || {};
    const ebenen = o.ebenen || {};
    const doc = o.doc || (typeof document !== 'undefined' ? document : null);
    const max = o.max || 40;
    const sichtbar = o.sichtbar || (() => !doc || doc.visibilityState !== 'hidden');
    const setI = o.setInterval || ((fn, ms) => setInterval(fn, ms));
    const clearI = o.clearInterval || ((id) => clearInterval(id));
    const raf = o.raf || ((fn) => requestAnimationFrame(fn));
    const caf = o.caf || ((id) => cancelAnimationFrame(id));
    const dpr = () => o.dpr || (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1;

    let faktor = typeof o.faktor === 'number' ? o.faktor : 1;
    let pausiert = false;
    let gestoppt = false;
    const partikel = new Map();   // el -> Animation
    const elemente = new Set();   // dauerhafte Elemente
    const intervalle = new Set();
    const schleifen = new Set();  // { id, letzte, tick }
    const leinwaende = new Set(); // Canvas der gezeichneten Welten

    function grenze() { return Math.round(max * faktor); }
    function laeuft() { return !gestoppt && !pausiert && faktor > 0 && sichtbar(); }
    function platzFrei() {
      return !gestoppt && faktor > 0 && partikel.size + elemente.size < grenze();
    }

    function neuesElement(ebeneName, inhalt, stil) {
      const ebene = ebenen[ebeneName || 'hinten'];
      if (!ebene || !doc) return null;
      const el = doc.createElement('div');
      el.style.position = 'absolute';
      el.style.left = '0';
      el.style.top = '0';
      el.style.pointerEvents = 'none';
      el.style.willChange = 'transform, opacity';
      if (stil) for (const k in stil) el.style[k] = stil[k];
      if (inhalt) el.textContent = inhalt;
      ebene.appendChild(el);
      return el;
    }

    function starteSchleife(s) {
      if (s.id === null && laeuft()) { s.letzte = null; s.id = raf(s.tick); }
    }

    return {
      spawn(p) {
        if (!platzFrei()) return null;
        const el = neuesElement(p.ebene, p.inhalt, p.stil);
        if (!el) return null;
        if (p.keyframes && p.keyframes[0] && p.keyframes[0].transform) {
          el.style.transform = p.keyframes[0].transform;
        }
        const anim = el.animate(p.keyframes, {
          duration: p.dauerMs, easing: p.easing || 'linear', fill: 'forwards'
        });
        partikel.set(el, anim);
        anim.onfinish = () => { partikel.delete(el); el.remove(); };
        return el;
      },
      element(p) {
        if (!platzFrei()) return null;
        const el = neuesElement(p && p.ebene, p && p.inhalt, p && p.stil);
        if (el) elemente.add(el);
        return el;
      },
      entferne(el) {
        if (!el) return;
        const anim = partikel.get(el);
        if (anim) { try { anim.cancel(); } catch (e) { /* schon fertig */ } partikel.delete(el); }
        elemente.delete(el);
        el.remove();
      },
      // Zeichenflaeche ueber die ganze Ebene (gezeichnete Welten). Zaehlt nicht
      // gegen max - sie ist der Hintergrund, kein Partikel. passe() gleicht
      // Groesse/Pixeldichte an und meldet true, wenn neu gezeichnet werden muss.
      leinwand(ebeneName) {
        const ebene = ebenen[ebeneName || 'hinten'];
        if (gestoppt || !ebene || !doc) return null;
        const el = doc.createElement('canvas');
        el.style.position = 'absolute';
        el.style.left = '0';
        el.style.top = '0';
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.pointerEvents = 'none';
        ebene.appendChild(el);
        leinwaende.add(el);
        const ctx = el.getContext('2d');
        const l = {
          el, ctx, w: 0, h: 0, dpr: 0,
          passe() {
            const w = ebene.clientWidth || 0, h = ebene.clientHeight || 0, d = dpr();
            if (w === l.w && h === l.h && d === l.dpr) return false;
            l.w = w; l.h = h; l.dpr = d;
            el.width = Math.max(1, Math.round(w * d));
            el.height = Math.max(1, Math.round(h * d));
            if (ctx && ctx.setTransform) ctx.setTransform(d, 0, 0, d, 0, 0);
            return true;
          }
        };
        l.passe();
        return l;
      },
      intervall(fn, ms) {
        const id = setI(() => { if (laeuft()) fn(); }, ms);
        intervalle.add(id);
        return id;
      },
      // fn(dtMs) pro Frame, nur solange laeuft(). Pausiert/unsichtbar wird KEIN
      // neuer Frame angefordert (null Last); weiter() nimmt sie wieder auf.
      schleife(fn) {
        const s = { id: null, letzte: null, tick: null };
        s.tick = (t) => {
          s.id = null;
          if (!laeuft()) return;
          const dt = s.letzte === null ? 16 : Math.min(100, t - s.letzte);
          s.letzte = t;
          fn(dt);
          if (laeuft()) s.id = raf(s.tick);
        };
        schleifen.add(s);
        starteSchleife(s);
        return s;
      },
      setFaktor(f) { faktor = Math.max(0, Number(f) || 0); },
      get faktor() { return faktor; },
      pausieren(an) { pausiert = !!an; },
      get pausiert() { return pausiert; },
      weiter() { for (const s of schleifen) starteSchleife(s); },
      laeuft,
      anzahl() { return partikel.size + elemente.size; },
      groesse(name) {
        const e = ebenen[name || 'hinten'];
        return e ? { w: e.clientWidth, h: e.clientHeight } : { w: 0, h: 0 };
      },
      rechteck(name) {
        const e = ebenen[name || 'hinten'];
        return e ? e.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
      },
      stop() {
        gestoppt = true;
        for (const id of intervalle) clearI(id);
        intervalle.clear();
        for (const s of schleifen) { if (s.id !== null) caf(s.id); s.id = null; }
        schleifen.clear();
        for (const [el, anim] of partikel) { try { anim.cancel(); } catch (e) { /* egal */ } el.remove(); }
        partikel.clear();
        for (const el of elemente) el.remove();
        elemente.clear();
        for (const el of leinwaende) el.remove();
        leinwaende.clear();
      }
    };
  }

  return { createEngine, tr, rnd };
});
