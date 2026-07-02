// Zentraler Zugriff auf die inoffizielle Twitch-GraphQL-API.
//
// Alles, was Twitch serverseitig rotieren kann, liegt HIER an einer Stelle:
// - CLIENT_ID: oeffentliche Web-Client-ID des Twitch-Players.
// - VIDEO_COMMENTS_HASH: Persisted-Query-Hash fuer VOD-Kommentare.
// Wenn VOD-Kommentare/ID-Aufloesung ploetzlich ausfallen, zuerst diese
// Konstanten gegen den aktuellen Twitch-Webplayer pruefen (DevTools-Network).
//
// Fallback-Skizze, falls die inoffizielle API dichtgemacht wird:
// - User-ID-Aufloesung + VOD-Listen + Live-Status gehen auch ueber die
//   offizielle Helix-API (braucht eigene App-Registrierung + Client-Credentials-
//   Token; Endpunkte: /users, /videos, /streams).
// - Fuer VOD-Kommentare gibt es KEINE offizielle Alternative; dann bliebe nur
//   ein echter Client-Integrity-Token aus einem Browser-Kontext.
//
// Alle Requests laufen mit Timeout (haengender Request blockierte sonst das
// Laden unbegrenzt) und begrenzten Retries: wiederholt wird nur bei
// Netzwerkfehlern/Timeouts/5xx - 4xx ist ein endgueltiges Nein.

const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const GQL_URL = 'https://gql.twitch.tv/gql';

// Persisted-Query-Hash fuer VOD-Kommentare (VideoCommentsByOffsetOrCursor).
const VIDEO_COMMENTS_HASH =
  'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a';

const TIMEOUT_MS = 10000;
const RETRIES = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// fetch mit Timeout + Retries. opts sind fuer Tests injizierbar:
//   fetchImpl (default: globales fetch), timeoutMs, retries,
//   delayFn(attempt) -> Promise (default: 500ms * 2^attempt).
async function fetchWithRetry(url, init = {}, opts = {}) {
  const {
    fetchImpl = fetch,
    timeoutMs = TIMEOUT_MS,
    retries = RETRIES,
    delayFn = (attempt) => sleep(500 * Math.pow(2, attempt))
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`); // transient -> erneut versuchen
      } else {
        return res; // Erfolg oder 4xx (endgueltig, Aufrufer entscheidet)
      }
    } catch (e) {
      lastErr = e; // Netzwerkfehler / Timeout -> erneut versuchen
    }
    if (attempt < retries) await delayFn(attempt);
  }
  throw lastErr;
}

async function gql(body, opts = {}) {
  const res = await fetchWithRetry(GQL_URL, {
    method: 'POST',
    headers: {
      'Client-ID': CLIENT_ID,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }, opts);
  if (!res.ok) throw new Error(`GQL HTTP ${res.status}`);
  return res.json();
}

module.exports = {
  CLIENT_ID,
  GQL_URL,
  VIDEO_COMMENTS_HASH,
  TIMEOUT_MS,
  RETRIES,
  fetchWithRetry,
  gql
};
