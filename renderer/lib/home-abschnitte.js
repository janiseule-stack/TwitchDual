// Home: Kanaele in einklappbare Abschnitte Live/Offline teilen. DOM-frei,
// UMD wie die anderen Libs -> unter Node testbar. Zustand = welche
// Abschnitte ZU sind; ein aktiver Filter klappt alles auf (Treffer sehen).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HomeAbschnitte = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const STANDARD = Object.freeze({ live: false, offline: true });
  const TITEL = { live: 'Live', offline: 'Offline' };

  function teile(kanaele, zu, filterAktiv) {
    const z = zu || STANDARD;
    const gruppen = { live: [], offline: [] };
    for (const k of kanaele || []) gruppen[k.live ? 'live' : 'offline'].push(k);
    return ['live', 'offline']
      .filter((art) => gruppen[art].length)
      .map((art) => ({ art, titel: TITEL[art], kanaele: gruppen[art], offen: !!filterAktiv || !z[art] }));
  }

  function umschalten(zu, art) {
    return { ...(zu || STANDARD), [art]: !(zu || STANDARD)[art] };
  }

  function lies(roh) {
    try {
      const o = JSON.parse(roh);
      if (o && typeof o === 'object' && !Array.isArray(o) && typeof o.live === 'boolean' && typeof o.offline === 'boolean') {
        return { live: o.live, offline: o.offline };
      }
    } catch (e) { /* Muell -> Standard */ }
    return { ...STANDARD };
  }

  return { STANDARD, teile, umschalten, lies };
});
