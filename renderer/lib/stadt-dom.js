// Chat-Stadt (Regennacht) hinter den Chat-Nachrichten: baut die Ebenen aus den
// PixelLab-Bildern (stadt*.png) in eine skalierte Bildebene (344x277 Bildpixel) und
// steuert Blitz, Fensterlichter, Passanten, Autos und Raids. Es wird nichts gezeichnet:
// nur Bilder einsetzen, ausschneiden (Fenster), spiegeln, abdunkeln und bewegen.
// Logik (Masse, Licht, Gewitter, Regisseur, Raid-Plan) kommt aus stadt.js.
// UMD: im Fenster window.StadtDom (braucht window.Stadt), in Node per require.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./stadt.js'));
  else root.StadtDom = factory(root.Stadt);
})(typeof self !== 'undefined' ? self : this, function (Stadt) {
  const S = Stadt.STADT;
  // Janis kann diese Werte beim Anschauen aendern.
  const DUNKEL = 0.25;          // Abdunkeln hinter dem Text (0..1)
  const DUNKEL_BLITZ = 0.45;    // waehrend eines Blitzes staerker, Helligkeit bleibt gleich
  const BLITZ_MS = 250;         // hoechstens 300 ms
  const LEBEN_PAUSE = Object.freeze({ min: 6000, max: 20000 });
  const PASSANT_ANTEIL = 0.7;   // sonst ein Auto
  const AUTO = Object.freeze({ pxProBild: 3, msProBild: 60 });
  const UHR_PAUSE = Object.freeze({ min: 2 * 60000, max: 5 * 60000 });
  const UHR_WARTEN = 10000;     // Mitte belegt: spaeter nochmal
  const FENSTER_MS = 300;       // weiches An/Aus eines Fensters
  const ABO_ABSTAND = 400;      // Geschenk: Fenster nacheinander
  const BUS = Object.freeze({ dauer: 5000, ankunft: 1500, abfahrt: 3500, tuerX: 92, halteAnteil: 0.25 });

  const px = (n) => n + 'px';
  const url = (pfad, datei) => "url('" + pfad + datei + "')";

  // wirt = #stadt; pfad = Ordner der Bilder ('../themes/cozy/').
  // opt: setTimeout, clearTimeout, jetzt, zufall, stunde (Tests), band (#stadt-band),
  //      gewitter (Ersatz fuer Stadt.gewitter, Tests).
  function baue(doc, wirt, pfad, opt) {
    const o = opt || {};
    const setT = o.setTimeout || ((f, ms) => setTimeout(f, ms));
    const clearT = o.clearTimeout || ((id) => clearTimeout(id));
    const jetzt = o.jetzt || (() => Date.now());
    const zufall = o.zufall || Math.random;
    const stunde = o.stunde || (() => new Date().getHours());
    const spanne = (s) => s.min + zufall() * (s.max - s.min);
    const regie = Stadt.regisseur({ jetzt });
    const wetter = o.gewitter || Stadt.gewitter({ zufall, startMs: jetzt() });

    function neu(klasse, eltern) {
      const d = doc.createElement('div');
      d.className = klasse;
      if (eltern) eltern.appendChild(d);
      return d;
    }

    const ebene = neu('stadt-bildebene', wirt);
    ebene.style.backgroundImage = url(pfad, 'stadt.png');
    const blitz = neu('stadt-blitz', ebene);
    blitz.style.backgroundImage = url(pfad, 'stadt-himmel-blitz.png');
    const fensterEbene = neu('stadt-fenster-ebene', ebene);
    const strasse = neu('stadt-strasse', ebene);
    const regenHinten = neu('stadt-regen hinten', ebene);
    regenHinten.style.backgroundImage = url(pfad, 'stadt-regen-hinten.png');
    const regenVorn = neu('stadt-regen vorn', ebene);
    regenVorn.style.backgroundImage = url(pfad, 'stadt-regen-vorn.png');
    const dunkel = neu('stadt-dunkel', ebene);
    dunkel.style.height = px(S.ebenen.strasse.y);
    wirt.style.setProperty('--stadt-dunkel', String(DUNKEL));

    // --- Fensterlichter -------------------------------------------------------------
    const fenster = S.fenster.map((f) => {
      const d = neu('stadt-fenster', fensterEbene);
      d.style.left = px(f.x);
      d.style.top = px(f.y);
      d.style.width = px(f.b);
      d.style.height = px(f.h);
      d.style.backgroundImage = url(pfad, 'stadt-haeuser-licht.png');
      d.style.backgroundPosition = px(-f.x) + ' ' + px(-f.y);
      return d;
    });
    const istAn = (i) => fenster[i].classList.contains('an');
    const anListe = () => fenster.map((_, i) => i).filter(istAn);
    const ziel = () => Math.round(Stadt.lichtAnteil(stunde()) * fenster.length);
    for (const i of Stadt.aboFenster(fenster.length, [], ziel(), zufall)) fenster[i].classList.add('an');

    let laeuft = false;
    let uhrTimer = null;
    function uhrTakt() {
      uhrTimer = null;
      if (laeuft && !regie.darf('mitte')) { uhrTimer = setT(uhrTakt, UHR_WARTEN); return; }
      const an = anListe();
      const soll = ziel();
      let wechsel = null;
      if (an.length < soll) wechsel = Stadt.aboFenster(fenster.length, an, 1, zufall)[0];
      else if (an.length > soll) {
        const uhrAn = an.filter((i) => !fenster[i].classList.contains('abo'));
        if (uhrAn.length) wechsel = uhrAn[Math.min(uhrAn.length - 1, Math.floor(zufall() * uhrAn.length))];
      }
      if (wechsel !== null && wechsel !== undefined) {
        fenster[wechsel].classList.toggle('an');
        if (laeuft) regie.belegt('mitte', FENSTER_MS);
      }
      uhrTimer = setT(uhrTakt, spanne(UHR_PAUSE));
    }
    uhrTimer = setT(uhrTakt, spanne(UHR_PAUSE));

    let aboTimer = [];
    function aboAn(i) {
      fenster[i].classList.add('an', 'abo');
    }
    function aboFenster(n) {
      // schon vorgemerkte (noch nicht angegangene) nicht doppelt nehmen
      const belegt = anListe().concat(aboTimer.map((t) => t.i));
      const neueFenster = Stadt.aboFenster(fenster.length, belegt, n, zufall);
      neueFenster.forEach((i, k) => {
        if (!laeuft || k === 0) { aboAn(i); return; }
        fenster[i].classList.add('abo-wartet');
        const id = setT(() => {
          aboTimer = aboTimer.filter((t) => t.id !== id);
          fenster[i].classList.remove('abo-wartet');
          aboAn(i);
        }, k * ABO_ABSTAND);
        aboTimer.push({ id, i });
      });
    }

    // --- Gewitter ----------------------------------------------------------------------
    let wetterTimer = null;
    let blitzTimer = null;
    function blitzAus() {
      if (blitzTimer !== null) { clearT(blitzTimer); blitzTimer = null; }
      blitz.classList.remove('an');
      wirt.style.setProperty('--stadt-dunkel', String(DUNKEL));
    }
    function blitzt() {
      wetterTimer = null;
      if (!laeuft) return;
      if (regie.darf('himmel')) {
        regie.belegt('himmel', BLITZ_MS);
        blitz.classList.add('an');
        wirt.style.setProperty('--stadt-dunkel', String(DUNKEL_BLITZ));
        blitzTimer = setT(() => { blitzTimer = null; blitzAus(); }, BLITZ_MS);
      }
      wetterTakt();
    }
    function wetterTakt() {
      if (!laeuft) return;
      const n = wetter.naechste(jetzt());
      if (n.blitzInMs !== null) wetterTimer = setT(blitzt, n.blitzInMs);
      else wetterTimer = setT(() => { wetterTimer = null; wetterTakt(); }, Math.max(1000, n.wechselInMs));
    }

    // --- Strasse: Passanten, Autos, Raid ---------------------------------------------
    let sichtLinks = 0;
    let sichtBreite = S.bild.b;
    const unterwegs = new Set(); // { el, timer }

    function weg(u) {
      if (!unterwegs.has(u)) return;
      unterwegs.delete(u);
      if (u.timer !== null) clearT(u.timer);
      u.el.remove();
    }
    function losschicken(el, dauerMs) {
      const u = { el, timer: null };
      unterwegs.add(u);
      strasse.appendChild(el);
      el.addEventListener('animationend', (e) => { if (e.target === el) weg(u); });
      u.timer = setT(() => { u.timer = null; weg(u); }, dauerMs + 500);
      return u;
    }
    // Bewegung in ganzen Bildpixeln: von -> bis in `schritte` Schritten
    function bahn(el, von, bis, schritte, msProBild, verzugMs) {
      el.style.setProperty('--von', px(von));
      el.style.setProperty('--bis', px(bis));
      el.style.setProperty('--schritte', schritte);
      el.style.setProperty('--dauer', schritte * msProBild + 'ms');
      el.style.setProperty('--verzug', (verzugMs || 0) + 'ms');
    }
    function figur(klasse, nachLinks, von, weite, verzugMs) {
      const F = S.figur;
      const el = neu(klasse);
      el.style.top = px(S.gehwegY - F.h);
      el.style.width = px(F.b);
      el.style.height = px(F.h);
      const schritte = Math.ceil(weite / F.pxProBild);
      const bis = von + (nachLinks ? -1 : 1) * schritte * F.pxProBild;
      bahn(el, von, bis, schritte, F.msProBild, verzugMs);
      const g = neu('stadt-geht' + (nachLinks ? ' links' : ''), el);
      g.style.setProperty('--bilder', F.bilder);
      g.style.setProperty('--dauer', F.bilder * F.msProBild + 'ms');
      g.style.setProperty('--sb', px(F.bilder * F.b));
      g.style.setProperty('--verzug', (verzugMs || 0) + 'ms');
      const variante = F.varianten[Math.min(F.varianten.length - 1, Math.floor(zufall() * F.varianten.length))];
      g.style.backgroundImage = url(pfad, variante);
      return { el, dauer: (verzugMs || 0) + schritte * F.msProBild };
    }
    function passant() {
      const F = S.figur;
      const nachLinks = zufall() < 0.5;
      const weite = sichtBreite + F.b;
      const von = nachLinks ? sichtLinks + sichtBreite : sichtLinks - F.b;
      const f = figur('stadt-figur', nachLinks, von, weite, 0);
      losschicken(f.el, f.dauer);
      regie.belegt('strasse', f.dauer);
    }
    function auto() {
      const A = S.auto;
      const nachLinks = zufall() < 0.5;
      const el = neu('stadt-auto' + (nachLinks ? ' links' : ''));
      el.style.top = px(S.fahrbahnY - A.h);
      el.style.width = px(A.b);
      el.style.height = px(A.h);
      // Bild und Spiegelung als Kinder: die Bewegung (transform) liegt auf el, das
      // Spiegeln fuer die Fahrtrichtung auf den Kindern.
      neu('stadt-auto-bild', el).style.backgroundImage = url(pfad, 'stadt-auto.png');
      const spiegel = neu('stadt-spiegel', el);
      spiegel.style.backgroundImage = url(pfad, 'stadt-auto.png');
      const schritte = Math.ceil((sichtBreite + A.b) / AUTO.pxProBild);
      const von = nachLinks ? sichtLinks + sichtBreite : sichtLinks - A.b;
      bahn(el, von, von + (nachLinks ? -1 : 1) * schritte * AUTO.pxProBild, schritte, AUTO.msProBild, 0);
      const dauer = schritte * AUTO.msProBild;
      losschicken(el, dauer);
      regie.belegt('strasse', dauer);
    }
    let lebenTimer = null;
    function lebenTakt() {
      lebenTimer = setT(() => {
        lebenTimer = null;
        if (!laeuft) return;
        if (regie.darf('strasse')) {
          if (zufall() < PASSANT_ANTEIL) passant();
          else auto();
        }
        lebenTakt();
      }, spanne(LEBEN_PAUSE));
    }

    let raidLauf = null; // { ende (resolve), timer, teile: [u], tuer: [timer] }
    function stoppeRaid() {
      const r = raidLauf;
      if (!r) return;
      raidLauf = null;
      if (r.timer !== null) clearT(r.timer);
      for (const t of r.tuer) clearT(t);
      for (const u of r.teile) weg(u);
      regie.frei('strasse');
      regie.frei('strasse');
      r.ende();
    }
    function raid(plan) {
      stoppeRaid();
      return new Promise((ende) => {
        const F = S.figur;
        const dauer = Stadt.raidDauer(plan, sichtBreite);
        const r = { ende, timer: null, teile: [], tuer: [] };
        raidLauf = r;
        regie.belegt('strasse', dauer);
        regie.belegt('strasse', dauer);
        const abstandMs = (Stadt.RAID_ABSTAND / F.pxProBild) * F.msProBild;
        let start = sichtLinks - F.b;
        let weite = sichtBreite + F.b;
        let verzug = 0;
        if (plan.bus) {
          const B = S.bus;
          const bus = neu('stadt-bus');
          bus.style.top = px(S.fahrbahnY - B.h);
          bus.style.width = px(B.b);
          bus.style.height = px(B.h);
          bus.style.backgroundImage = url(pfad, 'stadt-bus.png');
          const halt = Math.round(sichtLinks + sichtBreite * BUS.halteAnteil);
          bus.style.setProperty('--von', px(sichtLinks - B.b));
          bus.style.setProperty('--halt', px(halt));
          bus.style.setProperty('--bis', px(sichtLinks + sichtBreite));
          bus.style.setProperty('--dauer', BUS.dauer + 'ms');
          r.teile.push(losschicken(bus, BUS.dauer));
          r.tuer.push(setT(() => { bus.style.backgroundImage = url(pfad, 'stadt-bus-tuer.png'); }, BUS.ankunft));
          r.tuer.push(setT(() => { bus.style.backgroundImage = url(pfad, 'stadt-bus.png'); }, BUS.abfahrt));
          start = halt + BUS.tuerX - F.b / 2;
          weite = sichtLinks + sichtBreite - start;
          verzug = BUS.ankunft + 200;
        }
        for (let i = 0; i < plan.figuren; i++) {
          const f = figur('stadt-raid-figur', false, start, weite, verzug + i * abstandMs);
          r.teile.push(losschicken(f.el, f.dauer));
        }
        r.timer = setT(() => { r.timer = null; if (raidLauf === r) stoppeRaid(); }, dauer);
      });
    }

    function richteAus(breite, hoehe) {
      const m = Stadt.masse(breite, hoehe);
      wirt.style.setProperty('--stadt-f', String(m.faktor));
      wirt.style.setProperty('--stadt-links', px(m.links));
      wirt.style.setProperty('--stadt-oben', px(m.oben));
      if (o.band) o.band.style.height = px(m.strasseH);
      if (breite > 0 && m.faktor > 0) {
        sichtLinks = -m.links / m.faktor;
        sichtBreite = breite / m.faktor;
      }
    }

    return {
      an() {
        if (laeuft) return;
        laeuft = true;
        wetterTakt();
        lebenTakt();
      },
      aus() {
        laeuft = false;
        if (wetterTimer !== null) { clearT(wetterTimer); wetterTimer = null; }
        if (lebenTimer !== null) { clearT(lebenTimer); lebenTimer = null; }
        blitzAus();
        stoppeRaid();
        for (const u of [...unterwegs]) weg(u);
        // wartende Abo-Fenster gehen sofort (hart) an
        for (const t of aboTimer) { clearT(t.id); fenster[t.i].classList.remove('abo-wartet'); aboAn(t.i); }
        aboTimer = [];
      },
      richteAus,
      aboFenster,
      raid,
      stoppeRaid,
      // Dauer eines Raids bei der aktuell sichtbaren Strassenbreite (fuer den Abspieler)
      raidDauer: (plan) => Stadt.raidDauer(plan, sichtBreite),
    };
  }

  return { baue, DUNKEL, DUNKEL_BLITZ, BLITZ_MS };
});
