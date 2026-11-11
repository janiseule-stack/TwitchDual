// Cozy-Raum "Leben": Takt der Bild-Animationen, Warteschlange und Abspieler
// fuer Ereignis-Effekte (Raid, Kanalpunkte-Kiste). DOM-frei, UMD wie szene.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RaumLeben = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DAUER_KISTE = 4000;
  const MAX_WARTEND = 3;
  const MAX_ALTER = 30000;

  // Janis kann diese Werte beim Anschauen aendern.
  const TAKT = Object.freeze({
    regen: Object.freeze({ msProBild: 150, modus: 'schleife' }),
    dampf: Object.freeze({ msProBild: 200, modus: 'schleife' }),
    katze: Object.freeze({ msProBild: 200, modus: 'selten', pause: Object.freeze({ min: 8000, max: 20000 }) }),
    lampe: Object.freeze({ msProBild: 125, modus: 'selten', pause: Object.freeze({ min: 10000, max: 30000 }) }),
  });

  function schirmAnzahl(anzahl) {
    const n = typeof anzahl === 'number' && Number.isFinite(anzahl) ? anzahl : 0;
    if (n >= 200) return 4;
    if (n >= 50) return 3;
    if (n >= 10) return 2;
    return 1;
  }

  function naechstePause(zufall, { min, max }) {
    return Math.round(min + zufall() * (max - min));
  }

  function warteschlange({ jetzt }) {
    let liste = [];
    return {
      rein(art, daten) {
        liste.push({ art, daten, zeit: jetzt() });
        if (liste.length > MAX_WARTEND) liste = liste.slice(liste.length - MAX_WARTEND);
      },
      naechstes() {
        while (liste.length) {
          const ev = liste.shift();
          if (jetzt() - ev.zeit <= MAX_ALTER) return ev;
        }
        return null;
      },
      leeren() { liste = []; },
      get laenge() { return liste.length; },
    };
  }

  function abspieler({ schlange, aktiv, starte, stoppe, dauer, setTimeout: setT, clearTimeout: clearT }) {
    let timer = null;
    let laeuft = false;

    function weiter() {
      timer = null;
      for (;;) {
        const ev = schlange.naechstes();
        if (!ev) { laeuft = false; return; }
        laeuft = true;
        try {
          starte(ev);
        } catch (e) {
          // Ein kaputter Effekt darf den Abspieler nicht blockieren.
          if (!laeuft) return;
          continue;
        }
        // aus() innerhalb von starte hat schon alles gestoppt: nichts mehr planen.
        if (!laeuft) return;
        timer = setT(weiter, dauer(ev));
        return;
      }
    }

    return {
      melde(art, daten) {
        if (!aktiv()) return;
        schlange.rein(art, daten);
        if (!laeuft) weiter();
      },
      aus() {
        if (timer !== null) { clearT(timer); timer = null; }
        const warLaufend = laeuft;
        laeuft = false;
        schlange.leeren();
        if (warLaufend) stoppe();
      },
      get laeuft() { return laeuft; },
    };
  }

  return { DAUER_KISTE, MAX_WARTEND, MAX_ALTER, TAKT, schirmAnzahl, naechstePause, warteschlange, abspieler };
});
