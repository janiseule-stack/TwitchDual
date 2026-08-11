// src/twitch-web-auth.js
// Web-Login: echter Twitch-Browser-Login in einem Fenster, danach liegt das
// auth-token-Cookie in der Session. Nur dieser Token-Typ wird von der
// Kanalpunkte-API akzeptiert (Device-Flow-Token -> 401, siehe Spec).
//
// Der Token bleibt IMMER im Main-Prozess und wird verschluesselt abgelegt.

const SCHLUESSEL = 'webAuthToken';

function tokenAusCookies(cookies) {
  if (!Array.isArray(cookies)) return null;
  const c = cookies.find(x => x && x.name === 'auth-token' && x.value);
  return c ? c.value : null;
}

function createWebAuthStore({ safeStorage, store }) {
  return {
    speichern(token) {
      if (!safeStorage.isEncryptionAvailable()) {
        // Lieber gar nicht speichern als im Klartext.
        throw new Error('Verschluesselung nicht verfuegbar - Token wird nicht gespeichert');
      }
      // base64 statt Buffer: electron-store serialisiert nach JSON, ein Buffer
      // ueberlebt die Runde nicht (wird zu {type:'Buffer',data:[...]}).
      store.set(SCHLUESSEL, safeStorage.encryptString(token).toString('base64'));
    },
    lesen() {
      const roh = store.get(SCHLUESSEL);
      if (!roh) return null;
      try {
        return safeStorage.decryptString(Buffer.from(roh, 'base64'));
      } catch {
        return null;   // z.B. nach Nutzerwechsel nicht mehr entschluesselbar
      }
    },
    loeschen() {
      store.delete(SCHLUESSEL);
    }
  };
}

// Nicht unit-getestet (echtes Fenster). Oeffnet den Twitch-Login und meldet
// den Token, sobald das Cookie auftaucht.
function oeffneLoginFenster({ BrowserWindow, onToken, onAbbruch }) {
  const win = new BrowserWindow({
    width: 1000, height: 800, autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  let fertig = false;
  const pruefen = async () => {
    if (fertig) return;
    const cookies = await win.webContents.session.cookies.get({ domain: '.twitch.tv', name: 'auth-token' });
    const token = tokenAusCookies(cookies);
    if (token) {
      fertig = true;
      clearInterval(timer);
      onToken(token);
      try { win.close(); } catch { /* schon zu */ }
    }
  };
  const timer = setInterval(pruefen, 1000);
  win.on('closed', () => {
    clearInterval(timer);
    if (!fertig && onAbbruch) onAbbruch();
  });
  win.loadURL('https://www.twitch.tv/login');
  return win;
}

module.exports = { tokenAusCookies, createWebAuthStore, oeffneLoginFenster };
