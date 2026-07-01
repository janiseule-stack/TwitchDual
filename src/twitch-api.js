// Inoffizielle Twitch-GraphQL- und 7TV-Aufrufe.
//
// WICHTIG / REALISTISCHE HINWEISE:
// - gql.twitch.tv ist NICHT offiziell dokumentiert. Wir nutzen die
//   oeffentliche Web-Client-ID, die der Twitch-Webplayer selbst verwendet.
//   Diese kann sich aendern; dann muss CLIENT_ID aktualisiert werden.
// - Die "persisted query" Hashes koennen serverseitig rotiert werden.
//   Wenn VOD-Kommentare ploetzlich leer sind, ist meist der Hash veraltet.
// - Diese Aufrufe laufen im Main-Prozess (Node), damit keine CORS-Regeln
//   des Browsers greifen.

const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const GQL_URL = 'https://gql.twitch.tv/gql';

// Persisted-Query-Hash fuer VOD-Kommentare (VideoCommentsByOffsetOrCursor).
const VIDEO_COMMENTS_HASH =
  'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a';

async function gql(body) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Client-ID': CLIENT_ID,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`GQL HTTP ${res.status}`);
  }
  return res.json();
}

// Channel-Name -> numerische Twitch-User-ID.
async function resolveUserId(login) {
  const clean = String(login).trim().toLowerCase().replace(/^#/, '');
  const data = await gql({
    query: `query($login:String!){ user(login:$login){ id displayName } }`,
    variables: { login: clean }
  });
  const user = data && data.data && data.data.user;
  if (!user) throw new Error(`Channel "${clean}" nicht gefunden`);
  return { id: user.id, displayName: user.displayName || clean, login: clean };
}

// Zu einer VOD-ID den Broadcaster (Owner) aufloesen -> fuer 7TV-Emotes.
async function resolveVideoOwner(videoId) {
  const data = await gql({
    query: `query($id:ID!){ video(id:$id){ id lengthSeconds owner{ id login displayName } } }`,
    variables: { id: String(videoId) }
  });
  const video = data && data.data && data.data.video;
  if (!video) throw new Error(`VOD "${videoId}" nicht gefunden`);
  const owner = video.owner || {};
  return {
    id: owner.id || null,
    login: owner.login || null,
    displayName: owner.displayName || owner.login || 'VOD',
    lengthSeconds: video.lengthSeconds || 0
  };
}

// 7TV-Emote-Set eines Channels laden -> { name: url }-Map.
// animierte Emotes werden als WEBP geliefert (Chromium rendert animiert).
async function fetch7tvEmotes(twitchUserId) {
  const map = {};
  try {
    const res = await fetch(`https://7tv.io/v3/users/twitch/${twitchUserId}`);
    if (!res.ok) return map; // Channel hat evtl. kein 7TV -> leer ist ok.
    const data = await res.json();
    const emotes =
      (data && data.emote_set && data.emote_set.emotes) || [];
    for (const e of emotes) {
      const host = e.data && e.data.host;
      if (!host) continue;
      // Beste verfuegbare Variante waehlen (bevorzugt 2x webp).
      const files = host.files || [];
      const webp = files.filter((f) => f.format === 'WEBP');
      const pick =
        webp.find((f) => f.name.startsWith('2x')) ||
        webp.find((f) => f.name.startsWith('1x')) ||
        webp[0];
      if (!pick) continue;
      const base = host.url.startsWith('//') ? 'https:' + host.url : host.url;
      map[e.name] = `${base}/${pick.name}`;
    }
  } catch (e) {
    // Netzwerkfehler -> ohne Emotes weitermachen.
  }
  return map;
}

// Global-7TV-Emotes zusaetzlich laden (z.B. "OMEGALUL").
async function fetch7tvGlobal() {
  const map = {};
  try {
    const res = await fetch('https://7tv.io/v3/emote-sets/global');
    if (!res.ok) return map;
    const data = await res.json();
    const emotes = (data && data.emotes) || [];
    for (const e of emotes) {
      const host = e.data && e.data.host;
      if (!host) continue;
      const files = host.files || [];
      const webp = files.filter((f) => f.format === 'WEBP');
      const pick =
        webp.find((f) => f.name.startsWith('2x')) ||
        webp.find((f) => f.name.startsWith('1x')) ||
        webp[0];
      if (!pick) continue;
      const base = host.url.startsWith('//') ? 'https:' + host.url : host.url;
      map[e.name] = `${base}/${pick.name}`;
    }
  } catch (e) {
    // ignore
  }
  return map;
}

// Eine Seite VOD-Kommentare laden.
// Entweder per contentOffsetSeconds (Startpunkt) oder per cursor (naechste Seite).
async function fetchVodComments(videoId, { offsetSeconds = null, cursor = null } = {}) {
  const variables = { videoID: String(videoId) };
  if (cursor) variables.cursor = cursor;
  else variables.contentOffsetSeconds = offsetSeconds == null ? 0 : Math.floor(offsetSeconds);

  const data = await gql([
    {
      operationName: 'VideoCommentsByOffsetOrCursor',
      variables,
      extensions: {
        persistedQuery: { version: 1, sha256Hash: VIDEO_COMMENTS_HASH }
      }
    }
  ]);

  const root =
    Array.isArray(data) && data[0] && data[0].data && data[0].data.video;
  if (!root || !root.comments) {
    return { comments: [], hasNext: false, cursor: null };
  }

  const edges = root.comments.edges || [];
  const comments = edges.map((edge) => {
    const n = edge.node || {};
    const commenter = n.commenter || {};
    const msg = n.message || {};
    const fragments = (msg.fragments || []).map((f) => ({
      text: f.text || '',
      emote: f.emote || null
    }));
    return {
      offset: n.contentOffsetSeconds || 0,
      name: commenter.displayName || commenter.login || 'anon',
      color: (msg.userColor) || null,
      fragments
    };
  });

  const pageInfo = root.comments.pageInfo || {};
  const lastCursor = edges.length ? edges[edges.length - 1].cursor : null;
  return {
    comments,
    hasNext: !!pageInfo.hasNextPage,
    cursor: lastCursor
  };
}

module.exports = {
  CLIENT_ID,
  resolveUserId,
  resolveVideoOwner,
  fetch7tvEmotes,
  fetch7tvGlobal,
  fetchVodComments
};
