// Vorschlaege fuer das Kanal-Feld oben: lokale Treffer (Gefolgt, Favoriten,
// Verlauf) sofort, Twitch-Suche wird nachgereicht. DOM-frei, UMD wie die
// anderen Libs -> unter Node testbar.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KanalVorschlaege = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // Kanalartige Eingabe? VOD-Links/-IDs und URLs bekommen keine Vorschlaege.
  function sollSuchen(roh) {
    const s = String(roh || '').trim();
    if (!s) return false;
    if (/[/.]/.test(s)) return false;
    if (/^v?\d{4,}$/i.test(s)) return false;
    return true;
  }

  // 0 = exakt, 1 = Anfang, 2 = Teilstring, -1 = kein Treffer
  function rang(k, nadel) {
    const namen = [k.login, (k.displayName || '').toLowerCase()];
    if (namen.includes(nadel)) return 0;
    if (namen.some((n) => n.startsWith(nadel))) return 1;
    if (namen.some((n) => n.includes(nadel))) return 2;
    return -1;
  }

  function lokaleTreffer(eingabe, quellen, max = 8) {
    const nadel = String(eingabe || '').trim().toLowerCase().replace(/^#/, '');
    if (!nadel) return [];
    const q = quellen || {};
    const kanaele = new Map(); // login -> Eintrag; erste Quelle gewinnt
    const rein = (k) => { if (k.login && !kanaele.has(k.login)) kanaele.set(k.login, k); };
    for (const g of q.gefolgt || []) rein({ ...g, quelle: 'gefolgt' });
    for (const f of q.favoriten || []) rein({ login: f, displayName: f, live: false, quelle: 'favorit' });
    for (const h of q.verlauf || []) {
      if (h.mode === 'live') rein({ login: h.value, displayName: h.value, live: false, quelle: 'verlauf' });
    }
    return [...kanaele.values()]
      .map((k) => ({ k, r: rang(k, nadel) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => (a.r - b.r) || ((b.k.live ? 1 : 0) - (a.k.live ? 1 : 0)) || a.k.login.localeCompare(b.k.login))
      .slice(0, max)
      .map((x) => x.k);
  }

  // Lokale zuerst (bekommen frischen Live-Status/Avatar aus der Suche),
  // danach neue Twitch-Treffer.
  function zusammenfuehren(lokal, twitch, max = 10) {
    const ausTwitch = new Map((twitch || []).map((t) => [t.login, t]));
    const out = (lokal || []).map((l) => {
      const t = ausTwitch.get(l.login);
      return t ? { ...l, ...t, quelle: l.quelle } : l;
    });
    const schon = new Set(out.map((k) => k.login));
    for (const t of twitch || []) {
      if (!schon.has(t.login)) { out.push({ ...t, quelle: 'twitch' }); schon.add(t.login); }
    }
    return out.slice(0, max);
  }

  // Exakt eingetippten Kanal einreihen: hinter eigenen (lokalen) und
  // verifizierten Twitch-Kanaelen, vor dem Rest der Twitch-Vorschlaege.
  function mitExaktTreffer(liste, exakt) {
    const rest = (liste || []).filter((k) => !exakt || k.login !== exakt.login);
    if (!exakt) return rest;
    let i = rest.findIndex((k) => k.quelle === 'twitch' && !k.verifiziert);
    if (i < 0) i = rest.length;
    return [...rest.slice(0, i), exakt, ...rest.slice(i)];
  }

  return { sollSuchen, lokaleTreffer, zusammenfuehren, mitExaktTreffer };
});
