// Live-Status und VOD-Listen ueber inoffizielle Twitch-GraphQL.
// Laeuft im Main-Prozess (kein CORS). Client-ID/Endpoint/Timeout zentral
// in ./twitch-gql.js. opts (fetchImpl, ...) sind fuer Tests injizierbar.

const { mapLiveUser, mapVod, sortByLive } = require('./browse-map');
const { gql } = require('./twitch-gql');

const LIVE_QUERY =
  `query($login:String!){ user(login:$login){ id login displayName ` +
  `profileImageURL(width:70) stream{ id title type viewersCount ` +
  `game{ displayName } previewImageURL(width:320,height:180) } } }`;

// Live-Status fuer mehrere Logins (parallel). Fehlerhafte einzelne Kanaele
// werden uebersprungen, nicht die ganze Liste.
async function getLiveStatus(logins, opts = {}) {
  const clean = (logins || [])
    .map((l) => String(l).trim().toLowerCase().replace(/^#/, ''))
    .filter(Boolean);

  const results = await Promise.all(
    clean.map(async (login) => {
      try {
        const data = await gql({ query: LIVE_QUERY, variables: { login } }, opts);
        const node = data && data.data && data.data.user;
        const model = mapLiveUser(node);
        // Falls Channel nicht existiert -> Platzhalter, damit UI ihn zeigt.
        return model || { login, displayName: login, avatar: null, live: false };
      } catch (e) {
        return { login, displayName: login, avatar: null, live: false, error: true };
      }
    })
  );
  // Live zuerst, dann nach Zuschauern - zentral hier statt im Renderer.
  return sortByLive(results);
}

// Genau einen Kanal nachschlagen (Vorschlaege oben). Die Twitch-Suche liefert
// offline Kanaele oft nicht - nicht mal bei exakt eingetipptem Login
// (gemessen 09.10.2026: exakter Login fehlt, nur aehnliche Namen).
async function findChannel(login, opts = {}) {
  const clean = String(login || '').trim().toLowerCase().replace(/^#/, '');
  if (!/^[a-z0-9_]{2,25}$/.test(clean)) return null;
  const data = await gql({ query: LIVE_QUERY, variables: { login: clean } }, opts);
  return mapLiveUser(data && data.data && data.data.user);
}

// Twitchs eigene Vorschlagssuche (wie beim Tippen auf twitch.tv): anonym,
// findet auch offline Kanaele und reiht verifizierte (Haken) vorn ein.
const SUGGEST_QUERY =
  `query($q:String!){ searchSuggestions(queryFragment:$q, withOfflineChannelContent:true){ ` +
  `edges{ node{ content{ __typename ... on SearchSuggestionChannel{ login isLive isVerified ` +
  `profileImageURL(width:50) user{ displayName stream{ game{ displayName } } } } } } } } }`;

async function sucheVorschlaege(query, opts = {}) {
  const data = await gql({ query: SUGGEST_QUERY, variables: { q: String(query || '') } }, opts);
  const edges = (data && data.data && data.data.searchSuggestions && data.data.searchSuggestions.edges) || [];
  return edges
    .map((e) => e && e.node && e.node.content)
    .filter((c) => c && c.__typename === 'SearchSuggestionChannel' && c.login)
    .map((c) => {
      const stream = c.user && c.user.stream;
      return {
        login: c.login,
        displayName: (c.user && c.user.displayName) || c.login,
        avatar: c.profileImageURL || null,
        live: !!c.isLive,
        verifiziert: !!c.isVerified,
        game: (stream && stream.game && stream.game.displayName) || ''
      };
    });
}

const VODS_QUERY =
  `query($login:String!,$n:Int!){ user(login:$login){ videos(first:$n,type:ARCHIVE,sort:TIME){ ` +
  `edges{ node{ id title lengthSeconds publishedAt viewCount ` +
  `previewThumbnailURL(width:320,height:180) } } } } }`;

async function getChannelVods(login, limit = 20, opts = {}) {
  const clean = String(login).trim().toLowerCase().replace(/^#/, '');
  const data = await gql({ query: VODS_QUERY, variables: { login: clean, n: limit } }, opts);
  const user = data && data.data && data.data.user;
  if (!user) throw new Error(`Channel "${clean}" nicht gefunden`);
  const edges = (user.videos && user.videos.edges) || [];
  return edges.map((e) => mapVod(e.node)).filter(Boolean);
}

module.exports = { getLiveStatus, findChannel, sucheVorschlaege, getChannelVods };
