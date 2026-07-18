// src/chat-send-core.js
// Reine Helfer fuer den Sende-Pfad: IRC-Zeilenbau, Rate-Limit, NOTICE-Texte,
// ROOMSTATE-Parsing. Kein Netz, kein DOM -> voll unit-testbar.

function formatPrivmsg(channel, text) {
  const chan = String(channel).trim().toLowerCase().replace(/^#/, '');
  const clean = String(text).replace(/[\r\n]+/g, ' '); // keine IRC-Injection
  return `PRIVMSG #${chan} :${clean}`;
}

class RateLimiter {
  constructor(max, windowMs) { this.max = max; this.windowMs = windowMs; this.hits = []; }
  tryAcquire(now = Date.now()) {
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
    if (this.hits.length >= this.max) return false;
    this.hits.push(now);
    return true;
  }
}

// Bekannte Twitch-NOTICE-msg-ids -> verstaendlicher deutscher Text.
const NOTICE_MAP = {
  msg_ratelimit: 'Zu viele Nachrichten — kurz warten.',
  msg_duplicate: 'Identische Nachricht — Twitch blockt Wiederholungen.',
  msg_slowmode: 'Slow-Mode aktiv — bitte warten.',
  msg_followersonly: 'Nur Follower dürfen schreiben.',
  msg_followersonly_zero: 'Nur Follower dürfen schreiben.',
  msg_subsonly: 'Nur Abonnenten dürfen schreiben.',
  msg_emoteonly: 'Nur-Emote-Modus — nur Emotes erlaubt.',
  msg_r9k: 'R9K-Modus — Nachricht muss einzigartig sein.',
  msg_banned: 'Du bist in diesem Channel gebannt.',
  msg_timedout: 'Du bist aktuell getimed out.',
  msg_channel_suspended: 'Dieser Channel ist gesperrt.',
  msg_verified_email: 'Zum Chatten ist eine verifizierte E-Mail nötig.'
};

function noticeText(msgId, rawParams) {
  return NOTICE_MAP[msgId] || String(rawParams || '');
}

function parseRoomstate(tags) {
  const num = (k) => (tags && tags[k] !== undefined && tags[k] !== '' ? Number(tags[k]) : null);
  const bool = (k) => (tags && tags[k] !== undefined && tags[k] !== '' ? tags[k] === '1' : null);
  return {
    followersOnly: num('followers-only'), // -1 aus, 0 jeder Follower, >0 Minuten
    subsOnly: bool('subs-only'),
    slowSeconds: num('slow'),
    emoteOnly: bool('emote-only')
  };
}

module.exports = { formatPrivmsg, RateLimiter, noticeText, parseRoomstate };
