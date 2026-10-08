// Setzen-Bedienung fuer die Vorhersage-Karte (ereignis-karten.js ruft
// EreignisKartenSetzen.bediene). Erster Klick waehlt, zweiter bestaetigt.
(function (root) {
  function bediene({ doc, karte, v, stand, angemeldet, KE, el, auswahl, waehle, sende, meldung, anmelden }) {
    if (v.status !== 'ACTIVE') return;
    const box = el('div', 'ke-setzen');
    if (!angemeldet) {
      const b = el('button', 'ke-anmelden', 'Zum Setzen anmelden');
      b.addEventListener('click', anmelden);
      box.appendChild(b);
      karte.appendChild(box);
      return;
    }
    const setzbar = KE.setzbareOptionen(stand);
    const a = auswahl();
    for (const o of v.optionen) {
      const reihe = el('div', 'ke-chips' + (setzbar.includes(o.id) ? '' : ' aus'));
      reihe.appendChild(el('span', 'ke-chips-name ' + String(o.farbe || '').toLowerCase(), o.titel));
      for (const art of KE.CHIPS) {
        const betrag = KE.chipBetrag(art, stand.guthaben);
        const label = art === 'alles' ? 'Alles' : art.endsWith('%') ? art : Number(art).toLocaleString('de-DE');
        const c = el('button', 'ke-chip', label);
        c.disabled = !setzbar.includes(o.id) || betrag === null;
        if (a && a.optionId === o.id && a.betrag === betrag) c.classList.add('gewaehlt');
        c.addEventListener('click', () => waehle({ optionId: o.id, betrag }));
        reihe.appendChild(c);
      }
      const feld = el('input', 'ke-feld');
      feld.type = 'text';
      feld.inputMode = 'numeric';
      feld.placeholder = 'eigener';
      feld.dataset.option = o.id; // damit zeichne() Fokus und Text wiederherstellt
      feld.disabled = !setzbar.includes(o.id);
      feld.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        const r = KE.eigenerBetrag(feld.value, stand.guthaben);
        if (r.fehler) { feld.classList.add('falsch'); feld.title = r.fehler; return; }
        waehle({ optionId: o.id, betrag: r.betrag });
      });
      reihe.appendChild(feld);
      box.appendChild(reihe);
    }
    if (a) {
      const opt = v.optionen.find((o) => o.id === a.optionId);
      const los = el('button', 'ke-los', a.betrag.toLocaleString('de-DE') + ' auf ' + (opt ? opt.titel : '?') + ' setzen');
      const m0 = meldung();
      los.disabled = !!(m0 && m0.laeuft); // waehrend des Sendens kein zweiter Klick
      los.addEventListener('click', sende);
      box.appendChild(los);
    }
    const m = meldung();
    if (m) box.appendChild(el('div', 'ke-meldung' + (m.ok ? '' : ' fehler'), m.text));
    if (typeof stand.guthaben === 'number') {
      box.appendChild(el('div', 'ke-guthaben', 'Guthaben ' + stand.guthaben.toLocaleString('de-DE')));
    }
    karte.appendChild(box);
  }
  root.EreignisKartenSetzen = { bediene };
})(typeof self !== 'undefined' ? self : this);
