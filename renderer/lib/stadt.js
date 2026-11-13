// Chat-Stadt (Regennacht hinter dem Chat): reine Logik ohne DOM.
// Masse je Fenstergroesse, Fensterlicht nach Uhrzeit, Abo-Fenster, Gewitter-Phasen,
// Regisseur (wie viel sich gleichzeitig bewegt) und Raid-Plan. UMD wie szene.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Stadt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // 1:1 aus tools/raum-quellen/stadt.json (tools/stadt-bilder.py); ein Test prueft Gleichheit.
  const f = (x, y, b, h) => Object.freeze({ x, y, b, h });
  const STADT = Object.freeze({
    bild: Object.freeze({ b: 344, h: 277 }),
    ebenen: Object.freeze({
      himmel: Object.freeze({ y: 0, h: 125 }),
      haeuser: Object.freeze({ y: 125, h: 102 }),
      strasse: Object.freeze({ y: 227, h: 50 }),
    }),
    fenster: Object.freeze([
      f(319, 145, 7, 12), f(5, 146, 6, 4), f(335, 146, 5, 5), f(131, 150, 5, 5), f(147, 150, 5, 5), f(177, 150, 5, 5),
      f(162, 151, 5, 4), f(289, 151, 5, 4), f(5, 152, 6, 5), f(55, 152, 5, 11), f(70, 152, 5, 5), f(84, 152, 4, 4),
      f(98, 152, 4, 4), f(199, 152, 5, 6), f(232, 152, 6, 5), f(147, 156, 5, 6), f(131, 157, 5, 5), f(162, 157, 5, 5),
      f(178, 157, 4, 5), f(289, 157, 5, 5), f(69, 158, 5, 5), f(233, 159, 5, 4), f(6, 169, 5, 5), f(21, 170, 5, 4),
      f(320, 171, 4, 5), f(6, 172, 2, 2), f(70, 174, 5, 5), f(98, 174, 4, 5), f(147, 174, 5, 5), f(162, 174, 5, 5),
      f(199, 174, 5, 5), f(216, 174, 5, 5), f(273, 174, 6, 4), f(289, 174, 5, 5), f(55, 175, 5, 4), f(84, 175, 4, 4),
      f(130, 175, 6, 5), f(21, 176, 5, 5), f(320, 177, 4, 5), f(70, 180, 5, 5), f(162, 180, 5, 6), f(258, 180, 4, 5),
      f(289, 180, 5, 5), f(147, 181, 5, 4), f(273, 181, 5, 4), f(55, 182, 5, 4), f(36, 194, 4, 2), f(319, 194, 5, 5),
      f(6, 195, 5, 4), f(335, 195, 5, 5), f(6, 197, 3, 2), f(56, 197, 4, 5), f(69, 197, 6, 5), f(147, 197, 5, 5),
      f(218, 197, 3, 5), f(258, 197, 4, 5), f(131, 198, 5, 4), f(178, 198, 4, 4), f(273, 198, 5, 4), f(36, 200, 5, 6),
      f(319, 200, 5, 6), f(335, 201, 5, 5), f(56, 203, 4, 5), f(147, 204, 4, 5), f(177, 204, 5, 5), f(258, 204, 4, 5),
      f(273, 205, 6, 4), f(83, 221, 5, 4), f(181, 222, 5, 11), f(257, 222, 5, 5), f(62, 223, 3, 3), f(258, 228, 4, 5),
    ]),
    figur: Object.freeze({
      b: 24, h: 24, bilder: 8, msProBild: 120, pxProBild: 2,
      varianten: Object.freeze(['stadt-passant-a.png', 'stadt-passant-b.png', 'stadt-passant-c.png',
        'stadt-passant-d.png', 'stadt-passant-e.png', 'stadt-passant-f.png', 'stadt-passant-g.png']),
    }),
    auto: Object.freeze({
      b: 88, h: 44, radY: 43,
      varianten: Object.freeze(['stadt-auto-a.png', 'stadt-auto-b.png', 'stadt-auto-c.png', 'stadt-auto-d.png']),
    }),
    bus: Object.freeze({ b: 176, h: 56, tuerX: 138 }),
    regen: Object.freeze({
      bilder: 12, msProBild: 83,
      dateien: Object.freeze(['stadt-regen-himmel.png', 'stadt-regen-strasse.png']),
    }),
    strahl: Object.freeze({ b: 38, h: 69, bilder: 14, msProBild: 50, y: 50 }),
    blitzWolken: Object.freeze([
      Object.freeze({ x: 196, y: 32, b: 118, h: 42, datei: 'stadt-himmel-blitz-rechts.png' }),
      Object.freeze({ x: 16, y: 24, b: 120, h: 50, datei: 'stadt-himmel-blitz-links.png' }),
      Object.freeze({ x: 92, y: 14, b: 115, h: 65, datei: 'stadt-himmel-blitz-mitte.png' }),
      Object.freeze({ x: 24, y: 38, b: 172, h: 67, datei: 'stadt-himmel-blitz-tief.png' }),
    ]),
    gehwegY: 251,
    fahrbahnY: 272,
  });

  // Anteil heller Fenster nach Uhrzeit [von, bis) in Stunden. Janis kann die Werte aendern.
  const LICHT_NACH_STUNDE = Object.freeze([
    Object.freeze({ von: 18, bis: 22, anteil: 0.6 }),
    Object.freeze({ von: 22, bis: 24, anteil: 0.4 }),
    Object.freeze({ von: 0, bis: 1, anteil: 0.4 }),
    Object.freeze({ von: 1, bis: 5, anteil: 0.12 }),
    Object.freeze({ von: 5, bis: 8, anteil: 0.25 }),
  ]);
  const LICHT_TAGSUEBER = 0.3;

  const MIN = 60000;
  const GEWITTER = Object.freeze({
    regen: Object.freeze({ min: 8 * MIN, max: 20 * MIN }),
    gewitter: Object.freeze({ min: 2 * MIN, max: 4 * MIN }),
    blitz: Object.freeze({ min: 4000, max: 15000 }),
  });

  // Hoechstens so viele bewegte Dinge gleichzeitig (Lesbarkeit hinter dem Text).
  const BUDGET = Object.freeze({ mitte: 1, strasse: 2, gesamt: 3 });

  // Raid: Abstand der Figuren einer Gruppe (Bildpixel), Halt des Busses.
  const RAID_ABSTAND = 14;
  const BUS_HALT_MS = 2000;

  const zahl = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0);
  const spanne = (z, s) => s.min + z * (s.max - s.min);

  // Stadt deckend hinter der Nachrichtenliste (Hoehe `hoehe`), unten an der Eingabe
  // ausgerichtet, waagrecht mittig. Massstab wie der Streifen oben, groesser falls noetig.
  // Kein eigenes Strassenband (Janis 13.11.2026, Variante B): das wuchs mit dem Faktor
  // auf ~200 px, die Nachrichten endeten weit ueber der Eingabe. Die Strasse liegt
  // jetzt hinter dem Text.
  function masse(breite, hoehe) {
    const B = STADT.bild;
    const b = zahl(breite);
    const h = zahl(hoehe);
    if (!b || !h) return { faktor: 1, links: 0, oben: 0 };
    const faktor = Math.max(b / B.b, h / B.h);
    return { faktor, links: (b - B.b * faktor) / 2, oben: h - B.h * faktor };
  }

  // Ab diesem Anteil (Flaeche) gilt eine leuchtende Wolke als sichtbar.
  const WOLKE_SICHTBAR = 0.5;

  // Blitz (Janis 13.11.: „dass mans nicht sieht“): eine der Wolken, die im sichtbaren
  // Ausschnitt liegen, zufaellig; der Strahl beginnt im sichtbaren Teil dieser Wolke.
  // sicht = { links, rechts, oben } in Bildpixeln (unten ist immer der Bildrand).
  // -> { wolke: Index in STADT.blitzWolken, x } oder null (kein Himmel zu sehen).
  function blitzZiel(sicht, zufall = Math.random) {
    const R = STADT.strahl;
    const gute = [];
    STADT.blitzWolken.forEach((w, i) => {
      const b = Math.max(0, Math.min(w.x + w.b, sicht.rechts) - Math.max(w.x, sicht.links));
      const h = Math.max(0, w.y + w.h - Math.max(w.y, sicht.oben));
      if ((b * Math.min(h, w.h)) / (w.b * w.h) >= WOLKE_SICHTBAR) gute.push(i);
    });
    if (!gute.length) return null;
    const i = gute[Math.min(gute.length - 1, Math.floor(zufall() * gute.length))];
    const w = STADT.blitzWolken[i];
    const von = Math.max(w.x, sicht.links);
    const bis = Math.min(w.x + w.b, sicht.rechts);
    // schmaler als der Strahl: mittig in den sichtbaren Teil
    const x = bis - von >= R.b ? von + zufall() * (bis - von - R.b) : (von + bis - R.b) / 2;
    return { wolke: i, x };
  }

  function lichtAnteil(stunde) {
    const s = ((Math.floor(Number(stunde)) % 24) + 24) % 24;
    for (const e of LICHT_NACH_STUNDE) if (s >= e.von && s < e.bis) return e.anteil;
    return LICHT_TAGSUEBER;
  }

  // n Fenster fuer Abos: nur noch dunkle, zufaellig, nie mehr als vorhanden.
  function aboFenster(anzahl, schonAn, n, zufall = Math.random) {
    const an = new Set(schonAn || []);
    const dunkel = [];
    for (let i = 0; i < (zahl(anzahl) | 0); i++) if (!an.has(i)) dunkel.push(i);
    for (let i = dunkel.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(zufall() * (i + 1)));
      [dunkel[i], dunkel[j]] = [dunkel[j], dunkel[i]];
    }
    return dunkel.slice(0, zahl(n) | 0);
  }

  // Gewitter in Phasen: lange Regen, dann ein paar Minuten Gewitter mit Blitzen.
  // naechste(jetzt) -> { phase, blitzInMs (null = keiner mehr in dieser Phase), wechselInMs }.
  // Ist der geplante Blitz erreicht, plant der naechste Aufruf den folgenden (>= 4 s spaeter).
  function gewitter({ zufall = Math.random, startMs = 0 } = {}) {
    let phase = 'regen';
    let ende = startMs + spanne(zufall(), GEWITTER.regen);
    let letzter = -Infinity;
    return {
      naechste(jetzt) {
        while (jetzt >= ende) {
          phase = phase === 'regen' ? 'gewitter' : 'regen';
          ende += spanne(zufall(), GEWITTER[phase]);
          letzter = -Infinity;
        }
        const wechselInMs = ende - jetzt;
        if (phase === 'regen') return { phase, blitzInMs: null, wechselInMs };
        // Ein geplanter Blitz, der noch nicht dran war, bleibt (mehrfaches Fragen schadet nicht).
        if (letzter > jetzt) return { phase, blitzInMs: letzter - jetzt, wechselInMs };
        const zeit = Math.max(jetzt, letzter) + spanne(zufall(), GEWITTER.blitz);
        if (zeit >= ende) return { phase, blitzInMs: null, wechselInMs };
        letzter = zeit;
        return { phase, blitzInMs: zeit - jetzt, wechselInMs };
      },
    };
  }

  // Verteilt Bewegung: darf(ort) vor dem Start fragen, belegt(ort, ms) beim Start,
  // frei(ort) wenn es frueher endet. Abgelaufenes zaehlt nicht mehr.
  function regisseur({ jetzt = () => Date.now() } = {}) {
    const belegung = { mitte: [], strasse: [], himmel: [] };
    const aufraeumen = () => {
      const t = jetzt();
      for (const k of Object.keys(belegung)) belegung[k] = belegung[k].filter((e) => e > t);
    };
    const gesamt = () => Object.values(belegung).reduce((s, l) => s + l.length, 0);
    return {
      darf(ort) {
        aufraeumen();
        if (!belegung[ort]) return false;
        if (gesamt() >= BUDGET.gesamt) return false;
        const grenze = BUDGET[ort];
        return grenze === undefined || belegung[ort].length < grenze;
      },
      // gibt den Eintrag zurueck; frei(ort, eintrag) gibt genau diesen Platz frei
      belegt(ort, ms) {
        if (!belegung[ort]) return null;
        const e = jetzt() + Math.max(0, Number(ms) || 0);
        belegung[ort].push(e);
        return e;
      },
      frei(ort, eintrag) {
        const l = belegung[ort];
        if (!l || !l.length) return;
        const i = eintrag === undefined ? l.indexOf(Math.min(...l)) : l.indexOf(eintrag);
        if (i >= 0) l.splice(i, 1);
      },
    };
  }

  function raidPlan(anzahl) {
    const n = zahl(anzahl);
    // Janis 13.11.2026: kleine Raids zeigen nur eine Person, der Bus kommt erst bei grossen
    if (n >= 10000) return { figuren: 10, bus: true };
    if (n >= 5000) return { figuren: 8, bus: true };
    if (n >= 2000) return { figuren: 4, bus: true };
    if (n >= 500) return { figuren: 3, bus: false };
    return { figuren: 1, bus: false };
  }

  // Laufzeit des Raids: die letzte Figur geht ganz durch die Strasse (plus Bus-Halt).
  function raidDauer(plan, strassenBreiteBildpx) {
    const F = STADT.figur;
    const weg = zahl(strassenBreiteBildpx) + F.b + (Math.max(1, plan.figuren) - 1) * RAID_ABSTAND;
    return Math.ceil(weg / F.pxProBild) * F.msProBild + (plan.bus ? BUS_HALT_MS : 0);
  }

  // Welche Nachrichten werden ueber einem fahrenden Fahrzeug durchsichtig? boxen = je
  // { top, bottom } von der untersten Nachricht nach oben. Unter dem sichtbaren Bereich
  // (unten, hochgescrollt) wird uebersprungen; Schluss bei der ersten ganz ueber dem Dach
  // (grenze). Liefert die Indizes in boxen.
  function unterFahrzeug(boxen, grenze, unten) {
    const treffer = [];
    for (let i = 0; i < boxen.length; i++) {
      const b = boxen[i];
      if (b.top >= unten) continue;
      if (b.bottom <= grenze) break;
      treffer.push(i);
    }
    return treffer;
  }

  return {
    STADT, LICHT_NACH_STUNDE, GEWITTER, BUDGET, RAID_ABSTAND, BUS_HALT_MS, WOLKE_SICHTBAR, blitzZiel,
    masse, lichtAnteil, aboFenster, gewitter, regisseur, raidPlan, raidDauer, unterFahrzeug,
  };
});
