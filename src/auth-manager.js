// src/auth-manager.js
// Orchestriert Device-Flow + TokenStore + Auto-Refresh und haelt den
// Session-Status. Netz-Details liegen in twitch-auth.js (getestet); hier ist
// die Zustands-/Timing-Logik, die im Main-Prozess mit echtem Netz laeuft.

const auth = require('./twitch-auth');

class AuthManager {
  constructor({ tokenStore, onChanged = () => {} }) {
    this.store = tokenStore;
    this.onChanged = onChanged;
    this.bundle = this.store.available() ? this.store.load() : null; // {access,refresh,userId,login,expiresAt}
    this.polling = false;
  }

  status() {
    return this.bundle
      ? { loggedIn: true, login: this.bundle.login, displayName: this.bundle.login }
      : { loggedIn: false, login: null, displayName: null };
  }

  async startDeviceFlow() {
    if (!this.store.available()) throw new Error('Sicherer Speicher auf diesem System nicht verfügbar.');
    const d = await auth.startDeviceAuth({});
    this._poll(d.device_code, (d.interval || 5) * 1000, Date.now() + (d.expires_in || 1800) * 1000);
    return { user_code: d.user_code, verification_uri: d.verification_uri };
  }

  _poll(deviceCode, intervalMs, deadline) {
    this.polling = true;
    const tick = async () => {
      if (!this.polling) return;
      if (Date.now() > deadline) { this.polling = false; return; }
      let r;
      try { r = await auth.pollTokenOnce({ deviceCode }); }
      catch { r = { status: 'pending' }; }
      if (r.status === 'authorized') {
        this.polling = false;
        await this._acceptTokens(r.tokens);
        return;
      }
      if (r.status === 'error') { this.polling = false; return; }
      if (r.status === 'slow_down') intervalMs += 5000;
      setTimeout(tick, intervalMs);
    };
    setTimeout(tick, intervalMs);
  }

  async _acceptTokens(tokens) {
    const v = await auth.validateToken({ accessToken: tokens.access_token });
    this.bundle = {
      access: tokens.access_token,
      refresh: tokens.refresh_token,
      userId: v.userId,
      login: v.login,
      expiresAt: Date.now() + (tokens.expires_in || 14400) * 1000
    };
    this.store.save(this.bundle);
    this.onChanged(this.status());
  }

  async getAccess() {
    if (!this.bundle) return null;
    // Frueh genug erneuern (60 s Puffer).
    if (Date.now() > this.bundle.expiresAt - 60000) {
      try {
        const t = await auth.refreshTokens({ refreshToken: this.bundle.refresh });
        this.bundle = { ...this.bundle, access: t.access_token, refresh: t.refresh_token,
          expiresAt: Date.now() + (t.expires_in || 14400) * 1000 };
        this.store.save(this.bundle);
      } catch {
        this.logout();          // Refresh tot (30 Tage) -> sauber ausloggen
        return null;
      }
    }
    return { accessToken: this.bundle.access, userId: this.bundle.userId, login: this.bundle.login };
  }

  logout() {
    this.bundle = null;
    this.polling = false;
    this.store.clear();
    this.onChanged(this.status());
  }
}

module.exports = { AuthManager };
