// Home: welche Abschnitte ZU sind (gemerkt in localStorage). DOM-frei,
// UMD wie die anderen Libs -> unter Node testbar. Abschnittsbildung: home-liste.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HomeAbschnitte = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const STANDARD = Object.freeze({ favoriten: false, live: false, offline: true, twitch: false });

  function umschalten(zu, art) {
    const z = { ...STANDARD, ...(zu || {}) };
    return { ...z, [art]: !z[art] };
  }

  // Unbekannte/kaputte Werte -> Standard; fehlende Arten (alter Stand
  // {live, offline}) bekommen ihren Standard.
  function lies(roh) {
    try {
      const o = JSON.parse(roh);
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        const out = { ...STANDARD };
        for (const art of Object.keys(STANDARD)) if (typeof o[art] === 'boolean') out[art] = o[art];
        return out;
      }
    } catch (e) { /* Muell -> Standard */ }
    return { ...STANDARD };
  }

  return { STANDARD, umschalten, lies };
});
