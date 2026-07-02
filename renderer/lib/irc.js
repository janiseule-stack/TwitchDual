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

  // emotes-Tag ("25:0-4,12-16/1902:6-10") + Text -> Token-Liste fuer das
  // Rendering. Die Ranges zaehlen CODEPOINTS (nicht UTF-16-Einheiten!),
  // deshalb Array.from. Kaputte/ueberlappende Ranges werden ignoriert,
  // die Funktion wirft nie (Fallback: alles Text).
  function emoteTokens(text, emotesTag) {
    const cps = Array.from(String(text || ''));
    const ranges = [];
    for (const part of String(emotesTag || '').split('/')) {
      const colon = part.indexOf(':');
      if (colon <= 0) continue;
      const id = part.slice(0, colon);
      for (const r of part.slice(colon + 1).split(',')) {
        const m = /^(\d+)-(\d+)$/.exec(r);
        if (!m) continue;
        const start = Number(m[1]);
        const end = Number(m[2]);
        if (start > end || end >= cps.length) continue;
        ranges.push({ start, end, id });
      }
    }
    ranges.sort((a, b) => a.start - b.start);

    const tokens = [];
    let pos = 0;
    for (const r of ranges) {
      if (r.start < pos) continue; // Ueberlappung -> ignorieren
      if (r.start > pos) {
        tokens.push({ type: 'text', value: cps.slice(pos, r.start).join('') });
      }
      tokens.push({
        type: 'emote',
        name: cps.slice(r.start, r.end + 1).join(''),
        id: r.id
      });
      pos = r.end + 1;
    }
    if (pos < cps.length) {
      tokens.push({ type: 'text', value: cps.slice(pos).join('') });
    }
    return tokens;
  }

  return { parseIrc, badgeTypes, privmsgText, emoteTokens };
});
