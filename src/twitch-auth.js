// src/twitch-auth.js
// Twitch OAuth Device Code Grant Flow (Public Client, kein Secret).
// Reine Netz-Logik mit injizierbarem fetch -> in test/twitch-auth.test.js
// vollstaendig ohne echtes Netz getestet.

// Client-ID der registrierten Twitch-App (Public). NICHT geheim.
const CLIENT_ID = 'by9tsq2or5ztro5o2g1qgrp32ptd9s';
const SCOPES = 'chat:read chat:edit user:read:follows user:read:emotes';

const DEVICE_URL = 'https://id.twitch.tv/oauth2/device';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

function form(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%20/g, '+')}`)
    .join('&');
}

async function startDeviceAuth({ fetchImpl = fetch } = {}) {
  const res = await fetchImpl(DEVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_id: CLIENT_ID, scopes: SCOPES })
  });
  if (!res.ok) throw new Error('Device-Start fehlgeschlagen (' + res.status + ')');
  return res.json();
}

// Ein einzelner Poll-Versuch. Der Aufrufer wiederholt im 'interval'.
async function pollTokenOnce({ deviceCode, fetchImpl = fetch }) {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_id: CLIENT_ID, device_code: deviceCode, grant_type: DEVICE_GRANT })
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.access_token) return { status: 'authorized', tokens: body };
  const msg = String(body.message || '');
  if (/authorization_pending/i.test(msg)) return { status: 'pending' };
  if (/slow_down/i.test(msg)) return { status: 'slow_down' };
  return { status: 'error', error: msg || ('HTTP ' + res.status) };
}

async function refreshTokens({ refreshToken, fetchImpl = fetch }) {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  if (!res.ok) throw new Error('Token-Refresh fehlgeschlagen (' + res.status + ')');
  return res.json();
}

async function validateToken({ accessToken, fetchImpl = fetch }) {
  const res = await fetchImpl(VALIDATE_URL, { headers: { Authorization: 'OAuth ' + accessToken } });
  if (!res.ok) throw new Error('Token ungueltig (' + res.status + ')');
  const b = await res.json();
  return { login: b.login, userId: b.user_id, expiresIn: b.expires_in, scopes: b.scopes || [] };
}

module.exports = {
  CLIENT_ID, SCOPES,
  startDeviceAuth, pollTokenOnce, refreshTokens, validateToken
};
