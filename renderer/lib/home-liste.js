// Home: Kanaele in Abschnitte ★ Favoriten / Live / Offline / Auf Twitch
// teilen. DOM-frei, UMD wie die anderen Libs -> unter Node testbar.
// Spec: docs/superpowers/specs/2026-10-09-home-ein-tab-design.md
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HomeListe = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_TWITCH = 2;
  const ARTEN = ['favoriten', 'live', 'offline', 'twitch'];
  const TITEL = { favoriten: '★ Favoriten', live: 'Live', offline: 'Offline', twitch: 'Auf Twitch' };

  // Filter ueber Name, Spiel und Stream-Titel (case-insensitiv).
  function passt(k, nadel) {
    if (!nadel) return true;
    return `${k.login} ${k.displayName || ''} ${k.game || ''} ${k.title || ''}`.toLowerCase().includes(nadel);
  }

  // Exakt getippten Kanal hinter die fuehrenden verifizierten Treffer
  // einreihen (Twitchs Vorschlaege lassen ihn oft aus).
  function mitExaktTreffer(liste, exakt) {
    const rest = (liste || []).filter((k) => !exakt || k.login !== exakt.login);
    if (!exakt) return rest;
    let i = rest.findIndex((k) => !k.verifiziert);
    if (i < 0) i = rest.length;
    return [...rest.slice(0, i), exakt, ...rest.slice(i)];
  }

  function abschnitte({ kanaele = [], nadel = '', twitch = [], exakt = null, zu = {} } = {}) {
    const n = String(nadel || '').trim().toLowerCase().replace(/^#/, '');
    const eigene = kanaele.filter((k) => passt(k, n));
    const gruppen = {
      favoriten: eigene.filter((k) => k.favorit),
      live: eigene.filter((k) => !k.favorit && k.live),
      offline: eigene.filter((k) => !k.favorit && !k.live),
      twitch: []
    };
    if (n.length >= MIN_TWITCH) {
      const bekannt = new Set(kanaele.map((k) => k.login));
      const neu = (twitch || []).filter((k) => !bekannt.has(k.login));
      const ex = exakt && !bekannt.has(exakt.login) ? exakt : null;
      gruppen.twitch = mitExaktTreffer(neu, ex).map((k) => ({ ...k, favorit: false, gefolgt: false }));
    }
    return {
      keineEigenen: !!n && kanaele.length > 0 && eigene.length === 0,
      abschnitte: ARTEN
        .filter((art) => gruppen[art].length)
        .map((art) => ({ art, titel: TITEL[art], kanaele: gruppen[art], offen: !!n || !zu[art] }))
    };
  }

  // Nach Stern-Klick: Flags aus der neuen Favoritenliste; nicht gefolgte
  // ohne Stern fliegen raus, neu gesternte Twitch-Treffer kommen dazu.
  function sternAnwenden(kanaele, ch, favoriten) {
    const fav = new Set(favoriten || []);
    const out = (kanaele || [])
      .map((k) => ({ ...k, favorit: fav.has(k.login) }))
      .filter((k) => k.favorit || k.gefolgt);
    if (fav.has(ch.login) && !out.some((k) => k.login === ch.login)) {
      out.push({ ...ch, favorit: true, gefolgt: false });
    }
    return out;
  }

  return { MIN_TWITCH, abschnitte, mitExaktTreffer, sternAnwenden };
});
