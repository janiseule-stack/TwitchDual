// Infos zum laufenden Stream fuer die Leiste im Video-Fenster (statt des
// Eingabefelds): Name · Titel, darunter Spiel · Zuschauer · Laufzeit.
// DOM-frei, UMD wie die anderen Libs -> unter Node testbar.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StreamInfo = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const de = (n) => Math.round(n).toLocaleString('de-DE');

  function laufzeit(start, jetzt) {
    const t = Date.parse(start || '');
    if (!Number.isFinite(t)) return '';
    const min = Math.max(0, Math.floor((jetzt - t) / 60000));
    if (min < 60) return 'seit ' + min + ' min';
    return 'seit ' + Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0') + ' h';
  }

  function dauer(sek) {
    const min = Math.round((sek || 0) / 60);
    return min < 60 ? min + ' min' : Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0') + ' h';
  }

  const teile = (...xs) => xs.filter((x) => x !== '' && x !== null && x !== undefined).join(' · ');

  function zeilen(info, jetzt) {
    const oben = teile(info.name, info.titel);
    if (info.art === 'live') {
      return { oben, unten: teile(info.spiel, de(info.zuschauer || 0) + ' Zuschauer', laufzeit(info.start, jetzt)), live: true };
    }
    if (info.art === 'vod') {
      const d = new Date(Date.parse(info.datum || ''));
      const datum = Number.isFinite(d.getTime()) ? 'vom ' + String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' : '';
      return { oben, unten: teile('VOD', info.spiel, info.laenge ? dauer(info.laenge) : '', datum), live: false };
    }
    return { oben, unten: 'offline', live: false };
  }

  // Neuer Stand von Twitch (alle 30 s): Zuschauer sofort, Titel und Spiel
  // nur alle 5 Minuten (Janis 09.10.2026) - ausser beim ersten Stand oder
  // wenn sich die Art aendert (live/offline/VOD).
  const TITEL_MS = 5 * 60000;
  function mische(zustand, neu, jetzt) {
    const alt = zustand && zustand.info;
    if (!neu) return { info: null, titelZeit: 0 };
    if (!alt || alt.art !== neu.art || alt.name !== neu.name || jetzt - (zustand.titelZeit || 0) >= TITEL_MS) {
      return { info: neu, titelZeit: jetzt };
    }
    return { info: { ...neu, titel: alt.titel, spiel: alt.spiel }, titelZeit: zustand.titelZeit };
  }

  return { laufzeit, zeilen, mische };
});
