// Pin-Leiste + Karten fuer Umfrage/Vorhersage. Bekommt fertige Staende aus
// dem Main (kanal-ereignisse), zeichnet nur. Spec:
// docs/superpowers/specs/2026-10-09-pins-umfragen-vorhersagen-design.md
(function (root) {
  const ZU_NACH_ENDE_MS = 30000;

  function create({ doc, wirt, KE, setzen, linkOeffnen, anmelden, effekt, jetzt = Date.now }) {
    let stand = null;
    let angemeldet = false;
    let pinWeg = null;            // ID des weggeklickten Pins (dann nur 📌-Knopf)
    const eingeklappt = new Set(); // Karten-IDs, die der Nutzer zugeklappt hat
    const endeSeit = new Map();    // Karten-ID -> Zeitpunkt, ab dem sie beendet ist
    let pinOffen = false;
    const VS = root.VorhersageStatistik;
    const verlauf = VS.createVerlauf();
    let funkenAusstehend = [];     // Options-IDs mit neuem Zuwachs (einmal Funken)
    let vorhersageTab = 'duell';
    try { vorhersageTab = localStorage.getItem('vorhersageTab') || 'duell'; } catch (e) { /* egal */ }
    let auswahl = null;            // { optionId, betrag } fuer Task 9
    let meldung = null;            // { text, ok, laeuft } Rueckmeldung beim Setzen
    // Waehrend die Maus gedrueckt ist, wird nicht neu aufgebaut (sonst geht der
    // click verloren); Hermes schickt bei Vorhersagen ~1 Stand pro Sekunde.
    const sperre = KE.createNeuaufbauSperre((fn) => setTimeout(fn, 0));
    wirt.addEventListener('pointerdown', () => sperre.druecken());
    doc.addEventListener('pointerup', () => sperre.loslassen());
    doc.addEventListener('pointercancel', () => sperre.loslassen());

    const el = (tag, cls, text) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };

    // Text mit klickbaren https-Links (keine HTML-Einschleusung: nur Textknoten).
    function textMitLinks(text) {
      const f = doc.createDocumentFragment();
      const teile = String(text).split(/(https:\/\/\S+)/g);
      for (const t of teile) {
        if (/^https:\/\//.test(t)) {
          const a = el('a', 'ke-link', t);
          a.href = '#';
          a.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); linkOeffnen(t); });
          f.appendChild(a);
        } else if (t) f.appendChild(doc.createTextNode(t));
      }
      return f;
    }

    // Einblende-Animation nur beim ersten Auftauchen einer ID - gezeichnet wird
    // bis zu 1x pro Sekunde neu (Hermes event-updated), sonst flackert es.
    const gesehen = new Set();
    function neuKlasse(id) {
      if (gesehen.has(id)) return '';
      gesehen.add(id);
      return ' neu';
    }

    function pinLeiste(p) {
      const b = el('div', 'ke-pin' + (pinOffen ? ' offen' : '') + neuKlasse(p.id));
      b.appendChild(el('span', 'ke-pin-icon', '📌'));
      const t = el('div', 'ke-pin-text');
      const name = el('span', 'ke-pin-name', p.absender.name + ': ');
      if (p.absender.farbe) name.style.color = p.absender.farbe;
      t.appendChild(name);
      t.appendChild(textMitLinks(p.text));
      if (pinOffen && p.angeheftetVon) t.appendChild(el('div', 'ke-pin-von', 'angeheftet von ' + p.angeheftetVon));
      b.appendChild(t);
      const x = el('button', 'ke-x', '✕');
      x.title = 'Verkleinern (📌 holt sie zurück)';
      x.addEventListener('click', (ev) => { ev.stopPropagation(); pinWeg = p.id; zeichne(); });
      b.appendChild(x);
      b.addEventListener('click', () => { pinOffen = !pinOffen; zeichne(); });
      return b;
    }

    // Ausgeblendeter Pin: kleiner Knopf, Klick holt die Leiste zurueck.
    function pinKnopf() {
      const k = el('button', 'ke-pin-knopf', '📌');
      k.type = 'button';
      k.title = 'Angepinnte Nachricht wieder anzeigen';
      k.addEventListener('click', () => { pinWeg = null; zeichne(); });
      return k;
    }

    // bis: Zeitpunkt fuer den Countdown (ms) oder null fuer festen Text.
    function kopf(karte, id, titel, untertitel, bis) {
      const k = el('div', 'ke-kopf');
      const t = el('span', 'ke-titel');
      // Fuehrendes Emoji (🔮, 📊) eigens: auf dunklem Grund sonst kaum zu sehen.
      const m = /^(\p{Extended_Pictographic}️?)\s(.*)$/su.exec(titel);
      if (m) { t.appendChild(el('span', 'ke-icon', m[1])); t.appendChild(doc.createTextNode(m[2])); }
      else t.textContent = titel;
      k.appendChild(t);
      const zeit = el('span', 'ke-zeit', untertitel);
      if (bis) zeit.dataset.bis = String(bis);
      k.appendChild(zeit);
      k.addEventListener('click', () => {
        if (eingeklappt.has(id)) eingeklappt.delete(id); else eingeklappt.add(id);
        zeichne();
      });
      karte.appendChild(k);
    }

    function balken(anteil, farbe) {
      const b = el('div', 'ke-balken');
      const f = el('div', 'ke-balken-fuell' + (farbe ? ' ' + farbe.toLowerCase() : ''));
      f.style.width = Math.round(anteil * 1000) / 10 + '%';
      b.appendChild(f);
      return b;
    }

    function umfrageKarte(u) {
      const karte = el('div', 'ke-karte ke-umfrage' + (eingeklappt.has(u.id) ? ' zu' : '') + neuKlasse(u.id));
      const laeuft = u.status === 'ACTIVE';
      kopf(karte, u.id, '📊 ' + u.titel, laeuft ? KE.countdownText(KE.restMs(u.endetUm, jetzt())) : 'beendet',
        laeuft ? u.endetUm : null);
      if (eingeklappt.has(u.id)) return karte;
      const max = Math.max(...u.optionen.map((o) => o.stimmen));
      for (const o of u.optionen) {
        const z = el('div', 'ke-option' + (u.status !== 'ACTIVE' && o.stimmen === max ? ' gewinner' : ''));
        const zeile = el('div', 'ke-zeile');
        zeile.appendChild(el('span', 'ke-opt-titel', o.titel));
        zeile.appendChild(el('span', 'ke-opt-wert', Math.round(o.anteil * 100) + ' % · ' + o.stimmen.toLocaleString('de-DE')));
        z.appendChild(zeile);
        z.appendChild(balken(o.anteil));
        karte.appendChild(z);
      }
      if (u.status === 'ACTIVE') karte.appendChild(el('div', 'ke-hinweis', 'Abstimmen auf twitch.tv'));
      return karte;
    }

    function vorhersageKarte(v) {
      const karte = el('div', 'ke-karte ke-vorhersage' + (eingeklappt.has(v.id) ? ' zu' : '') + neuKlasse(v.id));
      const status = v.status === 'ACTIVE' ? KE.countdownText(KE.restMs(v.einreichungBis, jetzt()))
        : v.status === 'LOCKED' ? 'Setzen vorbei · warte auf Ergebnis'
        : v.status === 'CANCELED' ? 'Abgebrochen'
        : 'Entschieden';
      kopf(karte, v.id, '🔮 ' + v.titel, status, v.status === 'ACTIVE' ? v.einreichungBis : null);
      if (eingeklappt.has(v.id)) return karte;
      root.VorhersageKarte.baue({
        doc, el, karte, v, stand, KE, VS, verlauf, tab: vorhersageTab, jetzt,
        setzeTab: (t) => { vorhersageTab = t; try { localStorage.setItem('vorhersageTab', t); } catch (e) { /* egal */ } zeichne(); },
        zaehle, funken: funkenAusstehend.splice(0),
        endeSeit: (id) => (endeSeit.has(id) ? endeSeit.get(id) : null),
        bedieneSetzen: () => {
          if (root.EreignisKartenSetzen) root.EreignisKartenSetzen.bediene({ doc, karte, v, stand, angemeldet, KE, el, auswahl: () => auswahl, waehle, sende, meldung: () => meldung, anmelden, fehler: meldeFehler });
        }
      });
      return karte;
    }

    // Zahlen weich hochzaehlen: merkt den zuletzt gezeigten Wert je Schluessel.
    const angezeigt = new Map();
    function zaehle(elem, schluessel, neu, format) {
      const alt = angezeigt.has(schluessel) ? angezeigt.get(schluessel) : neu;
      angezeigt.set(schluessel, neu);
      if (alt === neu || typeof requestAnimationFrame !== 'function') { elem.textContent = format(neu); return; }
      const start = jetzt();
      elem.textContent = format(alt);
      const schritt = () => {
        if (!elem.isConnected) return; // Neuaufbau hat das Element ersetzt
        const f = (jetzt() - start) / 600;
        elem.textContent = format(f >= 1 ? neu : VS.zaehlStand(alt, neu, f));
        if (f < 1) requestAnimationFrame(schritt);
      };
      requestAnimationFrame(schritt);
    }

    // Fuer Task 9 (Setzen-Bedienung).
    function waehle(a) { auswahl = a; meldung = null; zeichne(); }
    function meldeFehler(text) { meldung = { text, ok: false }; zeichne(); }
    async function sende() {
      if (!auswahl || (meldung && meldung.laeuft)) return; // Doppelklick
      const a = auswahl;
      meldung = { text: 'Setze …', ok: true, laeuft: true };
      zeichne();
      const r = await setzen(a.optionId, a.betrag);
      meldung = { text: r.text, ok: r.ok };
      if (r.ok) auswahl = null;
      zeichne();
    }

    function sichtbar(eintrag, istEnde) {
      if (!eintrag) return false;
      if (!istEnde) { endeSeit.delete(eintrag.id); return true; }
      if (!endeSeit.has(eintrag.id)) endeSeit.set(eintrag.id, jetzt());
      return jetzt() - endeSeit.get(eintrag.id) < ZU_NACH_ENDE_MS;
    }

    function zeichne() {
      // Tippt der Nutzer gerade einen eigenen Betrag, ueberlebt das den Neuaufbau.
      const a = doc.activeElement;
      const fokus = a && a.classList && a.classList.contains('ke-feld')
        ? { option: a.dataset.option, wert: a.value } : null;
      wirt.textContent = '';
      if (!stand) return;
      const u = stand.umfrage;
      if (sichtbar(u, u && u.status !== 'ACTIVE')) wirt.appendChild(umfrageKarte(u));
      const v = stand.vorhersage;
      if (sichtbar(v, v && (v.status === 'RESOLVED' || v.status === 'CANCELED'))) wirt.appendChild(vorhersageKarte(v));
      // Pin unter Umfrage/Vorhersage (Janis 09.10.2026: sieht oben schlecht aus).
      const pinArt = KE.pinAnzeige(stand.pin, pinWeg);
      if (pinArt === 'leiste') wirt.appendChild(pinLeiste(stand.pin));
      if (pinArt === 'knopf') {
        // Eingeklappter Pin sitzt rechts neben der letzten Karte (Janis 09.10.2026).
        const letzte = wirt.lastElementChild;
        if (letzte && letzte.classList.contains('ke-karte')) {
          const reihe = el('div', 'ke-reihe');
          wirt.insertBefore(reihe, letzte);
          reihe.append(letzte, pinKnopf());
        } else wirt.appendChild(pinKnopf());
      }
      if (fokus) {
        const f = [...wirt.querySelectorAll('.ke-feld')].find((x) => x.dataset.option === fokus.option);
        if (f) { f.value = fokus.wert; f.focus(); }
      }
    }

    // Countdown laeuft ohne Neuaufbau weiter (nur die Zeit-Texte).
    setInterval(() => {
      for (const s of wirt.querySelectorAll('.ke-zeit[data-bis]')) {
        const rest = KE.restMs(Number(s.dataset.bis), jetzt());
        s.textContent = KE.countdownText(rest);
        s.classList.toggle('knapp', rest > 0 && rest <= 10000);
      }
    }, 1000);

    return {
      zeige(p) {
        const altVorhersage = stand && stand.vorhersage && stand.vorhersage.id;
        const altV = stand && stand.vorhersage;
        stand = p && p.stand;
        if (stand && stand.vorhersage) {
          verlauf.nimm(stand.vorhersage, jetzt());
          funkenAusstehend = VS.zuwachs(altV, stand.vorhersage);
        }
        angemeldet = !!(p && p.angemeldet);
        if (!stand || !stand.vorhersage || stand.vorhersage.id !== altVorhersage) { auswahl = null; meldung = null; }
        for (const s of (p && p.signale) || []) {
          if (s.art === 'ereignis-start') eingeklappt.delete(s.id); // neu -> aufklappen
          effekt(s);
        }
        sperre.anfordern(zeichne);
      }
    };
  }

  root.EreignisKarten = { create };
})(typeof self !== 'undefined' ? self : this);
