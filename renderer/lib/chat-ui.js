// DOM-freie Helfer fuer die Chat-UI (Schriftgroesse, Emote-Tooltip,
// User-Karte, Einblende-Drossel). UMD wie backoff.js: laeuft im Browser
// (<script>) und unter Node -> testbar.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChatUi = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const FONT_MIN = 11;
  const FONT_MAX = 22;
  const FONT_DEFAULT = 14;
  // Ab dieser Nachrichtenrate (pro Fenster) wird die Einblende-Animation
  // abgeschaltet - in Mega-Chats wuerde sie nur flackern.
  const ANIM_MAX_RATE = 5;

  // Schriftgroesse aus dem Store kann Muell sein (alte Version, Handedit).
  function clampFontSize(v) {
    if (v == null || v === '') return FONT_DEFAULT; // Number(null) waere 0 -> 11
    const n = Number(v);
    if (!Number.isFinite(n)) return FONT_DEFAULT;
    return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n)));
  }

  // Anbieter eines Emotes anhand der Bild-URL (fuer den Tooltip).
  // Unbekannt/kaputt -> '' (Tooltip zeigt dann nur Name + Vorschau).
  function emoteProvider(url) {
    if (typeof url !== 'string') return '';
    let host;
    try { host = new URL(url).hostname; } catch (e) { return ''; }
    if (host === 'static-cdn.jtvnw.net') return 'Twitch';
    if (host === '7tv.io' || host === '7tv.app' ||
        host.endsWith('.7tv.io') || host.endsWith('.7tv.app')) return '7TV';
    if (host.includes('betterttv')) return 'BTTV';
    if (host.includes('frankerfacez')) return 'FFZ';
    return '';
  }

  // Letzte `limit` Nachrichten eines Users, chronologisch (fuer die
  // User-Karte). entries: [{name, text}] in Chat-Reihenfolge.
  function lastMessagesOf(entries, name, limit = 5) {
    const out = [];
    for (let i = entries.length - 1; i >= 0 && out.length < limit; i--) {
      const e = entries[i];
      if (e && e.name === name && typeof e.text === 'string') out.push(e.text);
    }
    return out.reverse();
  }

  // Gleitendes Zaehlfenster: tick(now) traegt ein Ereignis ein und liefert,
  // wie viele im Fenster liegen. Ereignis am exakten Fensterrand zaehlt noch.
  function createRateMeter({ windowMs = 1000 } = {}) {
    let times = [];
    return {
      tick(now) {
        times.push(now);
        const cutoff = now - windowMs;
        while (times.length && times[0] < cutoff) times.shift();
        return times.length;
      },
      reset() { times = []; }
    };
  }

  // 0..1: wie „heiss" der Chat gerade ist (msg/min gegen eine Obergrenze).
  // Treibt Glow/Groesse des Puls-Punkts im Footer. Rein, damit testbar.
  function rateHeat(n, max = 120) {
    if (!(max > 0)) return 0;
    return Math.max(0, Math.min(1, n / max));
  }

  return {
    clampFontSize, emoteProvider, lastMessagesOf, createRateMeter, rateHeat,
    FONT_MIN, FONT_MAX, FONT_DEFAULT, ANIM_MAX_RATE
  };
});
