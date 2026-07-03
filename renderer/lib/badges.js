// Badge-Aufloesung: IRC-Tags/VOD-Badges + Kataloge (Twitch global/Kanal)
// -> Render-Liste mit Bild-URLs. UMD wie irc.js: Browser (<script>) und
// Node (Tests). DOM-frei, wirft nie.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Badges = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // badges-Tag ("subscriber/24,premium/1") -> [{set, version}].
  // Fehlende Version -> '1' (Twitch schickt praktisch immer eine).
  function parseBadgeTag(tags) {
    return String((tags && tags['badges']) || '')
      .split(',')
      .map(function (part) {
        var slash = part.indexOf('/');
        if (slash === -1) return { set: part.trim(), version: '1' };
        return {
          set: part.slice(0, slash).trim(),
          version: part.slice(slash + 1).trim() || '1'
        };
      })
      .filter(function (b) { return b.set; });
  }

  // badge-info-Tag ("subscriber/26") -> Abo-Monate fuer den Tooltip.
  // Gilt fuer subscriber und founder; alles andere (z.B. predictions) null.
  function subMonths(tags) {
    var parts = String((tags && tags['badge-info']) || '').split(',');
    for (var i = 0; i < parts.length; i++) {
      var slash = parts[i].indexOf('/');
      if (slash === -1) continue;
      var set = parts[i].slice(0, slash).trim();
      if (set === 'subscriber' || set === 'founder') {
        var n = parseInt(parts[i].slice(slash + 1), 10);
        if (!isNaN(n) && n > 0) return n;
      }
    }
    return null;
  }

  // Kuerzel-Fallback (ehemals KNOWN_BADGES in chat.js), wenn der Katalog
  // komplett fehlt (Netz-/GQL-Ausfall). Farben wie bisher.
  var FALLBACK = {
    broadcaster: ['B', '#eb0400'],
    moderator: ['M', '#00ad03'],
    vip: ['V', '#e005b9'],
    subscriber: ['S', '#9147ff']
  };

  // GQL-Listen -> flache Map "set/version" -> {url, title}. Kanal-Liste
  // ueberschreibt die globale. "set/*" zeigt je Liste auf die erste Version
  // des Sets (Fallback fuer unbekannte Versionen), Kanal gewinnt auch hier.
  function buildCatalog(globalList, channelList) {
    var catalog = {};
    [globalList, channelList].forEach(function (list) {
      var seenSets = {};
      (Array.isArray(list) ? list : []).forEach(function (b) {
        if (!b || !b.setID || b.version == null || !b.imageURL) return;
        var entry = { url: String(b.imageURL), title: b.title || b.setID };
        catalog[b.setID + '/' + b.version] = entry;
        if (!seenSets[b.setID]) {
          seenSets[b.setID] = true;
          catalog[b.setID + '/*'] = entry;
        }
      });
    });
    return catalog;
  }

  // Paare + Katalog -> Render-Liste. Katalog leer -> Kuerzel-Fallback,
  // unbekanntes Set bei vorhandenem Katalog -> weglassen. Wirft nie.
  function resolve(pairs, catalog, opts) {
    var months = (opts && opts.months) || null;
    var cat = (catalog && typeof catalog === 'object') ? catalog : {};
    var empty = Object.keys(cat).length === 0;
    var out = [];
    (Array.isArray(pairs) ? pairs : []).forEach(function (p) {
      if (!p || !p.set) return;
      if (empty) {
        var fb = FALLBACK[p.set];
        if (fb) out.push({ fallback: fb[0], color: fb[1], title: p.set });
        return;
      }
      var entry = cat[p.set + '/' + p.version] || cat[p.set + '/*'];
      if (!entry) return;
      var title = entry.title;
      if (months && (p.set === 'subscriber' || p.set === 'founder')) {
        title += ' (' + months + ' Monate)';
      }
      out.push({ url: entry.url, title: title });
    });
    return out;
  }

  return { parseBadgeTag: parseBadgeTag, subMonths: subMonths, buildCatalog: buildCatalog, resolve: resolve, FALLBACK: FALLBACK };
});
