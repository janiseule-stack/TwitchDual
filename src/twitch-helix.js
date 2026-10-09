// src/twitch-helix.js
// Helix-Abfragen mit User-Token: gefolgte Channels + eigene Emotes.
// Laeuft im Main-Prozess. Paginierung wird intern aufgeloest.

const { CLIENT_ID } = require('./twitch-auth');
const BASE = 'https://api.twitch.tv/helix';

function headers(accessToken) {
  return { 'Client-Id': CLIENT_ID, Authorization: 'Bearer ' + accessToken };
}

// Alle Seiten einer Helix-Liste holen (cursor-basiert).
async function fetchAllPages(url, accessToken, fetchImpl) {
  const out = [];
  let template = null;
  let cursor = null;
  do {
    const full = url + (cursor ? (url.includes('?') ? '&' : '?') + 'after=' + encodeURIComponent(cursor) : '');
    const res = await fetchImpl(full, { headers: headers(accessToken) });
    if (!res.ok) throw new Error('Helix ' + res.status);
    const body = await res.json();
    if (body.template) template = body.template;
    for (const row of body.data || []) out.push(row);
    cursor = body.pagination && body.pagination.cursor;
  } while (cursor);
  return { rows: out, template };
}

async function getFollowedChannels({ userId, accessToken, fetchImpl = fetch }) {
  const { rows } = await fetchAllPages(
    `${BASE}/channels/followed?user_id=${encodeURIComponent(userId)}&first=100`,
    accessToken, fetchImpl
  );
  return rows.map((r) => ({ login: r.broadcaster_login, displayName: r.broadcaster_name, id: r.broadcaster_id }));
}

async function getUserEmotes({ userId, accessToken, fetchImpl = fetch }) {
  const { rows, template } = await fetchAllPages(
    `${BASE}/chat/emotes/user?user_id=${encodeURIComponent(userId)}`,
    accessToken, fetchImpl
  );
  const tpl = template || 'https://static-cdn.jtvnw.net/emoticons/v2/{{id}}/{{format}}/{{theme_mode}}/{{scale}}';
  const url = (id) => tpl
    .replace('{{id}}', id).replace('{{format}}', 'static')
    .replace('{{theme_mode}}', 'dark').replace('{{scale}}', '2.0');
  return rows.map((r) => ({ id: r.id, name: r.name, url: url(r.id) }));
}

module.exports = { getFollowedChannels, getUserEmotes };
