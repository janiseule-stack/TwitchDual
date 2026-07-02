// Inoffizielle Twitch-GraphQL- und 7TV-Aufrufe.
//
// Client-ID, Endpoint, Persisted-Query-Hash, Timeout/Retry: zentral in
// ./twitch-gql.js (dort steht auch die Fallback-Skizze fuer API-Aenderungen).
// Diese Aufrufe laufen im Main-Prozess (Node), damit keine CORS-Regeln
// des Browsers greifen.
//
// Alle Funktionen nehmen optionale `opts` (fetchImpl, timeoutMs, retries,
// delayFn) und reichen sie an twitch-gql durch -> ohne Netz unit-testbar.

const { gql, fetchWithRetry, VIDEO_COMMENTS_HASH, CLIENT_ID } = require('./twitch-gql');

// Channel-Name -> numerische Twitch-User-ID.
async function resolveUserId(login, opts = {}) {
  const clean = String(login).trim().toLowerCase().replace(/^#/, '');
  const data = await gql({
    query: `query($login:String!){ user(login:$login){ id displayName } }`,
    variables: { login: clean }
  }, opts);
  const user = data && data.data && data.data.user;
  if (!user) throw new Error(`Channel "${clean}" nicht gefunden`);
  return { id: user.id, displayName: user.displayName || clean, login: clean };
}

// Zu einer VOD-ID den Broadcaster (Owner) aufloesen -> fuer 7TV-Emotes + Laenge.
async function resolveVideoOwner(videoId, opts = {}) {
  const data = await gql({
    query: `query($id:ID!){ video(id:$id){ id lengthSeconds owner{ id login displayName } } }`,
    variables: { id: String(videoId) }
  }, opts);
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

// Beste verfuegbare Emote-Variante waehlen (bevorzugt 2x webp).
function pick7tvUrl(e) {
  const host = e.data && e.data.host;
  if (!host) return null;
  const files = host.files || [];
  const webp = files.filter((f) => f.format === 'WEBP');
  const pick =
    webp.find((f) => f.name.startsWith('2x')) ||
    webp.find((f) => f.name.startsWith('1x')) ||
    webp[0];
  if (!pick) return null;
  const base = host.url.startsWith('//') ? 'https:' + host.url : host.url;
  return `${base}/${pick.name}`;
}

// 7TV-Emote-Set eines Channels laden -> { name: url }-Map.
// animierte Emotes werden als WEBP geliefert (Chromium rendert animiert).
async function fetch7tvEmotes(twitchUserId, opts = {}) {
  const map = {};
  try {
    const res = await fetchWithRetry(
      `https://7tv.io/v3/users/twitch/${twitchUserId}`, {}, opts
    );
    if (!res.ok) return map; // Channel hat evtl. kein 7TV -> leer ist ok.
    const data = await res.json();
    const emotes = (data && data.emote_set && data.emote_set.emotes) || [];
    for (const e of emotes) {
      const url = pick7tvUrl(e);
      if (url) map[e.name] = url;
    }
  } catch (e) {
    // Netzwerkfehler -> ohne Emotes weitermachen.
  }
  return map;
}

// Global-7TV-Emotes zusaetzlich laden (z.B. "OMEGALUL").
async function fetch7tvGlobal(opts = {}) {
  const map = {};
  try {
    const res = await fetchWithRetry('https://7tv.io/v3/emote-sets/global', {}, opts);
    if (!res.ok) return map;
    const data = await res.json();
    const emotes = (data && data.emotes) || [];
    for (const e of emotes) {
      const url = pick7tvUrl(e);
      if (url) map[e.name] = url;
    }
  } catch (e) {
    // ignore
  }
  return map;
}

// Eine Seite VOD-Kommentare laden, immer per contentOffsetSeconds.
//
// WICHTIG: Twitch verlangt fuer die CURSOR-basierte Paginierung inzwischen einen
// Client-Integrity-Token; ohne ihn antwortet der Server mit
// "IntegrityCheckFailed" und comments=null. Die OFFSET-basierte Anfrage
// funktioniert dagegen weiterhin ohne Token. Deshalb blaettern wir ausschliesslich
// per Offset weiter (der Aufrufer fragt die naechste Seite mit einem groesseren
// Offset an). Jeder Kommentar traegt seine "id", damit ueberlappende Fenster
// dedupliziert werden koennen.
async function fetchVodComments(videoId, { offsetSeconds = null } = {}, opts = {}) {
  const variables = {
    videoID: String(videoId),
    contentOffsetSeconds: offsetSeconds == null ? 0 : Math.max(0, Math.floor(offsetSeconds))
  };

  const data = await gql([
    {
      operationName: 'VideoCommentsByOffsetOrCursor',
      variables,
      extensions: {
        persistedQuery: { version: 1, sha256Hash: VIDEO_COMMENTS_HASH }
      }
    }
  ], opts);

  const entry = Array.isArray(data) ? data[0] : null;
  const root = entry && entry.data && entry.data.video;

  if (!root || !root.comments) {
    // GQL-Fehler (z.B. IntegrityCheckFailed, rotierter Hash) NICHT still als
    // leeren Chat maskieren, sondern sichtbar hochreichen.
    const errors = (entry && entry.errors) || [];
    if (errors.length) {
      const msg = errors
        .map((e) => e.message || (e.extensions && e.extensions.code) || '')
        .filter(Boolean)
        .join(', ') || 'unbekannter GQL-Fehler';
      const hint = /integrity/i.test(msg)
        ? ' (Integrity-Sperre — siehe README "VOD-Kommentar-Paginierung")'
        : /PersistedQueryNotFound/i.test(msg)
          ? ' (Persisted-Query-Hash veraltet — VIDEO_COMMENTS_HASH in src/twitch-gql.js aktualisieren)'
          : '';
      throw new Error(`Twitch-GQL: ${msg}${hint}`);
    }
    return { comments: [] }; // wirklich keine Kommentare (z.B. hinter VOD-Ende)
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
      id: n.id || null,
      offset: n.contentOffsetSeconds || 0,
      name: commenter.displayName || commenter.login || 'anon',
      color: (msg.userColor) || null,
      // userBadges: [{ setID: 'moderator', version: '1' }, ...] -> Typen-Liste
      badges: (msg.userBadges || []).map((b) => b.setID || '').filter(Boolean),
      fragments
    };
  });

  return { comments };
}

module.exports = {
  CLIENT_ID,
  resolveUserId,
  resolveVideoOwner,
  fetch7tvEmotes,
  fetch7tvGlobal,
  fetchVodComments
};
