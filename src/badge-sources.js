// Badge-Datenquellen: Twitch-GQL-Kataloge (global + Kanal) und
// Third-Party-Badges (BTTV/FFZ/7TV) pro User.
//
// ALLE Funktionen sind fail-soft: jeder Fehler -> leeres Ergebnis. Badges
// sind Komfort; ohne sie laeuft der Chat normal weiter (Kuerzel-Fallback
// uebernimmt renderer/lib/badges.js). opts (fetchImpl, timeoutMs, retries,
// delayFn) wie ueberall -> ohne Netz unit-testbar.

const { gql, fetchWithRetry } = require('./twitch-gql');

// Globaler Twitch-Badge-Katalog: ALLE Sets inkl. Wahl-Badges (Turbo, Prime,
// Sub-Gifter, OG, Spiele-/Event-Badges, ...). Keine hartkodierte Auswahl.
async function fetchGlobalBadges(opts = {}) {
  try {
    const data = await gql({
      query: 'query{ badges { setID version title imageURL(size: DOUBLE) } }'
    }, opts);
    return ((data && data.data && data.data.badges) || []).filter(Boolean);
  } catch (e) {
    return [];
  }
}

// Kanal-Badges (Sub-Monatsstufen + Bits) -> ueberschreiben beim Katalog-Bau
// die globalen Eintraege (renderer/lib/badges.js buildCatalog).
async function fetchChannelBadges(channelId, opts = {}) {
  if (!channelId) return [];
  try {
    const data = await gql({
      query: 'query($id:ID!){ user(id:$id){ broadcastBadges { setID version title imageURL(size: DOUBLE) } } }',
      variables: { id: String(channelId) }
    }, opts);
    const user = data && data.data && data.data.user;
    return ((user && user.broadcastBadges) || []).filter(Boolean);
  } catch (e) {
    return [];
  }
}

// BTTV: eine gecachte Gesamtliste "wer traegt welches Badge" (Dev/Pro/...).
// providerId ist die Twitch-User-ID.
async function fetchBttvBadges(opts = {}) {
  const map = {};
  try {
    const res = await fetchWithRetry(
      'https://api.betterttv.net/3/cached/badges/twitch', {}, opts
    );
    if (!res.ok) return map;
    const list = await res.json();
    for (const u of Array.isArray(list) ? list : []) {
      const id = u && u.providerId ? String(u.providerId) : '';
      const badge = u && u.badge;
      if (!id || !badge || !badge.svg) continue;
      (map[id] = map[id] || []).push({
        url: badge.svg,
        title: badge.description || 'BTTV'
      });
    }
  } catch (e) {
    // fail-soft
  }
  return map;
}

// FFZ: badges-Liste + users-Map (badgeId -> [twitchUserId]).
async function fetchFfzBadges(opts = {}) {
  const map = {};
  try {
    const res = await fetchWithRetry(
      'https://api.frankerfacez.com/v1/badges/ids', {}, opts
    );
    if (!res.ok) return map;
    const data = await res.json();
    const users = (data && data.users) || {};
    for (const b of (data && data.badges) || []) {
      if (!b || b.id == null || !b.urls) continue;
      const raw = b.urls['2'] || b.urls['1'];
      if (!raw) continue;
      const url = raw.startsWith('//') ? 'https:' + raw : raw;
      for (const uid of users[String(b.id)] || []) {
        const id = String(uid);
        (map[id] = map[id] || []).push({ url, title: b.title || 'FFZ' });
      }
    }
  } catch (e) {
    // fail-soft
  }
  return map;
}

// 7TV: aktives Badge eines Users (per Twitch-User-ID). Endpoint/Form live
// verifiziert am 2026-07-03 gegen echte 7TV-Accounts (u.a. pajlada/11148817,
// die ein "7TV Subscriber"-Badge tragen) -> https://7tv.io/v4/gql (Query
// users.userByConnection(platform:TWITCH, platformId), Feld
// style.activeBadge.images[]) liefert bereits fertige absolute Bild-URLs in
// mehreren Formaten/Groessen (webp/avif/png x 1x-4x). Ohne 7TV-Account liefert
// userByConnection null; mit Account aber ohne aktives Badge liefert
// style.activeBadge null - beide Faelle -> []. Mirror-Host, falls dieser
// Endpoint ausfaellt: https://api.7tv.app/v4/gql (identische Form, ebenfalls
// live geprueft). Bei Ausfall zuerst hier pruefen (siehe
// docs/superpowers/specs/2026-07-03-chat-badges-design.md).
async function fetch7tvUserBadge(twitchUserId, opts = {}) {
  if (!twitchUserId) return [];
  try {
    const res = await fetchWithRetry('https://7tv.io/v4/gql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'query($id:String!){users{userByConnection(platform:TWITCH,platformId:$id){style{activeBadge{name description images{url width}}}}}}',
        variables: { id: String(twitchUserId) }
      })
    }, opts);
    if (!res.ok) return [];
    const data = await res.json();
    const badge = data && data.data && data.data.users &&
      data.data.users.userByConnection &&
      data.data.users.userByConnection.style &&
      data.data.users.userByConnection.style.activeBadge;
    if (!badge || !Array.isArray(badge.images) || !badge.images.length) return [];
    const img = badge.images.find((i) => i && i.width >= 30) || badge.images[badge.images.length - 1];
    if (!img || !img.url) return [];
    return [{ url: img.url, title: badge.description || badge.name || '7TV' }];
  } catch (e) {
    return [];
  }
}

module.exports = {
  fetchGlobalBadges, fetchChannelBadges, fetchBttvBadges, fetchFfzBadges,
  fetch7tvUserBadge
};
