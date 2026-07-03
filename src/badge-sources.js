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

module.exports = { fetchGlobalBadges, fetchChannelBadges };
