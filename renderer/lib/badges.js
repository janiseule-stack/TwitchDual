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

  return { parseBadgeTag: parseBadgeTag, subMonths: subMonths };
});
