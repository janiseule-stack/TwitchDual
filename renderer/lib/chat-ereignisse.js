// Abos, Geschenk-Abos und Raids aus Twitch-IRC (USERNOTICE). DOM-frei, UMD
// wie irc.js -> mit echten Beispielzeilen unter Node getestet.
//   ereignisAus(msg)  geparste IRC-Zeile -> { art, ... } oder null
//   zeile(ev)         Text fuer die hervorgehobene Chat-Zeile
//   createEreignisFilter()  entscheidet, ob ein Theme-Effekt laeuft:
//     Abo-Regen = EIN Effekt, dessen Einzel-Geschenke keiner; Abos
//     hoechstens alle abstandMs (Chat-Zeilen gibt es trotzdem fuer jedes).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChatEreignisse = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // IRCv3-Tag-Escapes: \s Leerzeichen, \: Semikolon, \\ Backslash.
  function tagWert(v) {
    return String(v || '').replace(/\\(s|:|\\|r|n)/g, (_, c) =>
      ({ s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' })[c]);
  }
  function nachrichtAus(params) {
    const i = String(params || '').indexOf(':');
    return i === -1 ? '' : params.slice(i + 1);
  }
  function zahl(v, standard) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : standard;
  }

  function ereignisAus(msg) {
    if (!msg || msg.command !== 'USERNOTICE') return null;
    const t = msg.tags || {};
    const id = t['msg-id'];
    const anonym = id === 'anonsubgift' || id === 'anonsubmysterygift' || t.login === 'ananonymousgifter';
    const name = anonym ? 'Anonym' : (tagWert(t['display-name']) || t.login || 'Jemand');
    if (id === 'sub' || id === 'resub') {
      return { art: 'abo', name, monate: zahl(t['msg-param-cumulative-months'], 1),
        prime: t['msg-param-sub-plan'] === 'Prime', nachricht: nachrichtAus(msg.params) };
    }
    if (id === 'subgift' || id === 'anonsubgift') {
      return { art: 'geschenk', name, empfaenger: tagWert(t['msg-param-recipient-display-name']) || 'jemandem',
        gruppe: t['msg-param-community-gift-id'] || null };
    }
    if (id === 'submysterygift' || id === 'anonsubmysterygift') {
      return { art: 'abo-regen', name, anzahl: zahl(t['msg-param-mass-gift-count'], 1),
        gruppe: t['msg-param-community-gift-id'] || null };
    }
    if (id === 'raid') {
      return { art: 'raid', name: tagWert(t['msg-param-displayName']) || name, anzahl: zahl(t['msg-param-viewerCount'], 0) };
    }
    return null;
  }

  function deZahl(n) { return Number(n).toLocaleString('de-DE'); }

  function zeile(ev) {
    if (!ev) return '';
    if (ev.art === 'abo') {
      return ev.monate > 1 ? '⭐ ' + ev.name + ' abonniert seit ' + ev.monate + ' Monaten'
        : '⭐ ' + ev.name + ' hat abonniert' + (ev.prime ? ' (Prime)' : '');
    }
    if (ev.art === 'geschenk') return '🎁 ' + ev.name + ' schenkt ' + ev.empfaenger + ' ein Abo';
    if (ev.art === 'abo-regen') return '🎁 ' + ev.name + ' verschenkt ' + deZahl(ev.anzahl) + (ev.anzahl === 1 ? ' Abo' : ' Abos');
    if (ev.art === 'raid') return '🚀 ' + ev.name + ' raidet mit ' + deZahl(ev.anzahl) + (ev.anzahl === 1 ? ' Zuschauer' : ' Zuschauern');
    return '';
  }

  function createEreignisFilter(o) {
    const abstandMs = (o && o.abstandMs) || 4000;
    const gruppeMs = 60000;
    const gruppen = new Map();   // community-gift-id -> bis
    let letztesAbo = -Infinity;

    function aboErlaubt(jetzt) {
      if (jetzt - letztesAbo < abstandMs) return false;
      letztesAbo = jetzt;
      return true;
    }

    return {
      effekt(ev, jetzt) {
        if (!ev) return null;
        for (const [g, bis] of gruppen) if (bis < jetzt) gruppen.delete(g);
        if (ev.art === 'raid') return { art: 'raid', daten: { name: ev.name, anzahl: ev.anzahl } };
        if (ev.art === 'abo-regen') {
          if (ev.gruppe) gruppen.set(ev.gruppe, jetzt + gruppeMs);
          letztesAbo = jetzt;   // der Regen hat Vorrang, zaehlt als Abo-Effekt
          return { art: 'abo', daten: { name: ev.name, zeilen: [ev.name, deZahl(ev.anzahl) + (ev.anzahl === 1 ? ' Abo verschenkt' : ' Abos verschenkt')] } };
        }
        if (ev.art === 'geschenk') {
          if (ev.gruppe && gruppen.has(ev.gruppe)) return null;
          if (!aboErlaubt(jetzt)) return null;
          return { art: 'abo', daten: { name: ev.name, zeilen: [ev.name, 'schenkt ' + ev.empfaenger + ' ein Abo'] } };
        }
        if (ev.art === 'abo') {
          if (!aboErlaubt(jetzt)) return null;
          const unter = ev.monate > 1 ? 'seit ' + ev.monate + ' Monaten dabei' : (ev.prime ? 'Prime-Abo' : 'hat abonniert');
          return { art: 'abo', daten: { name: ev.name, zeilen: [ev.name, unter] } };
        }
        return null;
      }
    };
  }

  return { ereignisAus, zeile, createEreignisFilter, tagWert };
});
