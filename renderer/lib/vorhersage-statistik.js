// Vorhersage-Karte: Verlauf mitschreiben, Trend, Momentum, Stats, Top-Setzer,
// SVG-Geometrie fuer Kurve und Ring. DOM-frei, UMD wie die anderen Libs ->
// unter Node testbar. Gezeichnet wird in renderer/chat/ereignis-karten.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VorhersageStatistik = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const FENSTER_MS = 60000;

  // Anteile/Punkte je Option ueber die Zeit. Nur Aenderungen zaehlen; eine
  // neue Vorhersage (andere ID) beginnt einen neuen Verlauf.
  function createVerlauf({ max = 600 } = {}) {
    let id = null;
    let liste = [];
    return {
      nimm(v, t) {
        if (!v) return;
        if (v.id !== id) { id = v.id; liste = []; }
        const anteile = {};
        const punkte = {};
        let summe = 0;
        for (const o of v.optionen) { anteile[o.id] = o.anteil; punkte[o.id] = o.punkte; summe += o.punkte; }
        const letzte = liste[liste.length - 1];
        if (letzte && letzte.summe === summe && Object.keys(punkte).every((k) => letzte.punkte[k] === punkte[k])) return;
        liste.push({ t, anteile, punkte, summe });
        if (liste.length > max) liste = liste.slice(liste.length - max);
      },
      punkte: () => liste
    };
  }

  // Letzter Punkt, der vor Fensterbeginn lag (sonst der erste).
  function bezug(punkte, jetzt, fenster) {
    let ref = punkte[0];
    for (const p of punkte) if (p.t <= jetzt - fenster) ref = p;
    return ref;
  }

  // Aenderung des Anteils in Prozentpunkten ueber das Fenster.
  function trend(punkte, optionId, jetzt, fenster = FENSTER_MS) {
    if (!punkte || !punkte.length) return 0;
    const jetztP = punkte[punkte.length - 1];
    const ref = bezug(punkte, jetzt, fenster);
    return Math.round(((jetztP.anteile[optionId] || 0) - (ref.anteile[optionId] || 0)) * 100);
  }

  // Punkte pro Minute im Fenster und die Option mit dem groessten Zufluss.
  function momentum(punkte, jetzt, fenster = FENSTER_MS) {
    if (!punkte || punkte.length < 2) return { proMinute: 0, nach: null };
    const letzte = punkte[punkte.length - 1];
    const ref = bezug(punkte, jetzt, fenster);
    const dt = letzte.t - ref.t;
    if (dt <= 0) return { proMinute: 0, nach: null };
    let nach = null;
    let meist = 0;
    for (const k of Object.keys(letzte.punkte)) {
      const d = letzte.punkte[k] - (ref.punkte[k] || 0);
      if (d > meist) { meist = d; nach = k; }
    }
    return { proMinute: Math.round((letzte.summe - ref.summe) / dt * 60000), nach };
  }

  function stats(v) {
    return v.optionen.map((o) => ({
      id: o.id,
      punkte: o.punkte,
      nutzer: o.nutzer,
      schnitt: o.nutzer ? Math.round(o.punkte / o.nutzer) : 0,
      groesster: Math.max(0, o.topEinsatz || 0, ...(o.top || []).map((t) => t.punkte || 0)),
      gewinnPro1000: o.quote ? Math.floor(1000 * o.quote) : 0
    }));
  }

  function topSetzer(v, n = 3) {
    return v.optionen
      .flatMap((o) => (o.top || []).map((t) => ({ name: t.name, punkte: t.punkte, optionId: o.id, farbe: o.farbe })))
      .sort((a, b) => b.punkte - a.punkte)
      .slice(0, n);
  }

  // Optionen, die seit dem letzten Stand Punkte bekommen haben (Funken).
  function zuwachs(alt, neu) {
    if (!alt || !neu || alt.id !== neu.id) return [];
    return neu.optionen
      .filter((o) => { const a = alt.optionen.find((x) => x.id === o.id); return a && o.punkte > a.punkte; })
      .map((o) => o.id);
  }

  const zahl = (x) => String(Math.round(x * 10) / 10);

  // Ein SVG-Pfad je Option: x = Zeit (Start..jetzt), y = Anteil (100 % oben).
  function kurven(punkte, ids, breite, hoehe) {
    const out = {};
    for (const id of ids) {
      if (!punkte || !punkte.length) { out[id] = ''; continue; }
      const t0 = punkte[0].t;
      const spanne = punkte[punkte.length - 1].t - t0;
      out[id] = punkte.map((p, i) => {
        const x = spanne > 0 ? (p.t - t0) / spanne * breite : 0;
        const y = (1 - (p.anteile[id] || 0)) * hoehe;
        return (i ? 'L' : 'M') + zahl(x) + ',' + zahl(y);
      }).join(' ');
    }
    return out;
  }

  // Ring: Bogenstuecke in Prozent der Kreislinie (stroke-dasharray mit pathLength 100).
  function ringSegmente(optionen) {
    let versatz = 0;
    return optionen.map((o) => {
      const laenge = Math.round(o.anteil * 100);
      const seg = { id: o.id, farbe: o.farbe, laenge, versatz };
      versatz += laenge;
      return seg;
    });
  }

  function moeglicherGewinn(tipp, v) {
    if (!tipp || !v || tipp.eventId !== v.id) return null;
    const o = v.optionen.find((x) => x.id === tipp.optionId);
    return o && o.quote ? Math.floor(tipp.punkte * o.quote) : null;
  }

  // Hochzaehlen mit ease-out (f = 0..1 der Animationszeit).
  function zaehlStand(alt, neu, f) {
    const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, f)), 3);
    return Math.round(alt + (neu - alt) * e);
  }

  return { createVerlauf, trend, momentum, stats, topSetzer, zuwachs, kurven, ringSegmente, moeglicherGewinn, zaehlStand };
});
