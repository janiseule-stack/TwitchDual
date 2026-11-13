// Kanalpunkte-Stand fuer einen beliebigen Kanal (Home-Aufkleber).
// Reine Logik: Token und API kommen von aussen, nach draussen geht nur
// { ok, balance, iconUrl } bzw. { ok:false, error, abgelaufen?, gesperrt? }.
const LOGIN_RE = /^[a-z0-9_]{2,25}$/;

async function homePunkte({ login, token, api }) {
  const name = typeof login === 'string' ? login.trim().toLowerCase() : '';
  if (!LOGIN_RE.test(name)) return { ok: false, error: 'ungueltiger Kanal' };
  if (!token) return { ok: false, error: 'nicht angemeldet' };
  try {
    const ctx = await api.context(token, name);
    return { ok: true, balance: ctx.balance, iconUrl: ctx.iconUrl };
  } catch (e) {
    const meldung = (e && e.message) || String(e);
    const r = { ok: false, error: meldung };
    if (/abgelaufen/i.test(meldung)) r.abgelaufen = true;
    if (/gesperrt/i.test(meldung)) r.gesperrt = true;
    return r;
  }
}

module.exports = { homePunkte };
