// Live-Status und VOD-Listen ueber inoffizielle Twitch-GraphQL.
// Laeuft im Main-Prozess (kein CORS). Client-ID/Endpoint/Timeout zentral
// in ./twitch-gql.js. opts (fetchImpl, ...) sind fuer Tests injizierbar.

const { mapLiveUser, mapVod, sortByLive } = require('./browse-map');
const { gql } = require('./twitch-gql');

const LIVE_QUERY =
  `query($login:String!){ user(login:$login){ id login displayName ` +
  `profileImageURL(width:70) stream{ id title type viewersCount ` +
  `game{ displayName } previewImageURL(width:320,height:180) } } }`;

const LIVE_BATCH_QUERY =
  `query($logins:[String!]){ users(logins:$logins){ id login displayName ` +
  `profileImageURL(width:70) stream{ id title type viewersCount ` +
  `game{ displayName } previewImageURL(width:320,height:180) } } }`;
const LIVE_BLOCK = 100; // gemessen 09.10.2026: 100 Logins pro Abfrage ok

// Live-Status fuer viele Logins, gebuendelt (300 Kanaele = 3 Abfragen).
// Scheitert ein Block, werden nur dessen Kanaele zu Platzhaltern mit error.
async function getLiveStatus(logins, opts = {}) {
  const clean = [...new Set((logins || [])
    .map((l) => String(l).trim().toLowerCase().replace(/^#/, ''))
    .filter(Boolean))];
  const bloecke = [];
  for (let i = 0; i < clean.length; i += LIVE_BLOCK) bloecke.push(clean.slice(i, i + LIVE_BLOCK));
  const teile = await Promise.all(bloecke.map(async (block) => {
    try {
      const data = await gql({ query: LIVE_BATCH_QUERY, variables: { logins: block } }, opts);
      const users = (data && data.data && data.data.users) || [];
      const nachLogin = new Map(users.filter(Boolean).map((u) => [String(u.login).toLowerCase(), u]));
      // Kanal existiert nicht -> Platzhalter, damit die UI ihn zeigt.
      return block.map((login) => mapLiveUser(nachLogin.get(login)) || { login, displayName: login, avatar: null, live: false });
    } catch (e) {
      return block.map((login) => ({ login, displayName: login, avatar: null, live: false, error: true }));
    }
  }));
  // Live zuerst (nach Zuschauern), offline alphabetisch - zentral hier.
  return sortByLive(teile.flat());
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
