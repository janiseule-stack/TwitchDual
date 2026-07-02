// Twitch-IRC-Zeilen parsen (Tags, Prefix, Command, Params) + Badge-Extraktion.
// UMD wie emote-text.js: laeuft im Browser (<script>) und unter Node -> testbar
// mit echten Beispielzeilen (test/irc.test.js).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.IrcParse = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // Eine rohe IRC-Zeile zerlegen: optionale @tags, optionaler :prefix,
  // COMMAND, Rest-Params.
  function parseIrc(line) {
    let rest = line;
    const tags = {};
    if (rest.startsWith('@')) {
      const sp = rest.indexOf(' ');
      const tagStr = rest.slice(1, sp);
      rest = rest.slice(sp + 1);
      for (const pair of tagStr.split(';')) {
        const eq = pair.indexOf('=');
        if (eq === -1) { tags[pair] = ''; continue; }
        tags[pair.slice(0, eq)] = pair.slice(eq + 1);
      }
    }
    let prefix = '';
    if (rest.startsWith(':')) {
      const sp = rest.indexOf(' ');
      prefix = rest.slice(1, sp);
      rest = rest.slice(sp + 1);
    }
    const sp = rest.indexOf(' ');
    const command = sp === -1 ? rest : rest.slice(0, sp);
    const params = sp === -1 ? '' : rest.slice(sp + 1);
    return { tags, prefix, command, params };
  }

  // badges-Tag ("broadcaster/1,subscriber/12") -> ['broadcaster','subscriber'].
  function badgeTypes(tags) {
    return String((tags && tags['badges']) || '')
      .split(',')
      .map((b) => b.split('/')[0].trim())
      .filter(Boolean);
  }

  // PRIVMSG-Params ("#channel :text") -> Nachrichtentext.
  function privmsgText(params) {
    const idx = params.indexOf(':');
    return idx === -1 ? '' : params.slice(idx + 1);
  }

  return { parseIrc, badgeTypes, privmsgText };
});
