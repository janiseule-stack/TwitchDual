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

// Ein Fenster fuer beide Logins: erst twitch.tv/login (Web-Token fuer
// Kanalpunkte), danach im selben, schon angemeldeten Fenster die
// Aktivierungsseite des Device Flows mit vorausgefuelltem Code (Chat/Gefolgt)
// -> nur noch "Aktivieren" + "Autorisieren" klicken. Fehlt nur ein Teil, nur
// diesen Schritt. Ein Takt (1 s) prueft erst das Cookie, dann den Device Flow.
function oeffneAnmeldeFenster({
  BrowserWindow, brauchtWeb, brauchtGeraet, onWebToken, starteGeraet, istGeraetFertig,
  onFertig, onAbbruch, setIntervalImpl = setInterval, clearIntervalImpl = clearInterval
}) {
  const { aktivierungsUrl } = require('../renderer/lib/anmeldung');
  const win = new BrowserWindow({
    width: 1000, height: 800, autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  let fertig = false;
  let phase = brauchtWeb ? 'web' : 'geraet-start';
  let timer = null;

  function ende() {
    fertig = true;
    if (timer !== null) { clearIntervalImpl(timer); timer = null; }
    onFertig();
    try { win.close(); } catch { /* schon zu */ }
  }

  async function geraetStarten() {
    if (!brauchtGeraet) { ende(); return; }
    phase = 'geraet-laeuft';
    const d = await starteGeraet();
    if (fertig) return;
    try { win.setTitle('Twitch – Code ' + (d.user_code || '') + ' aktivieren'); } catch { /* egal */ }
    win.loadURL(aktivierungsUrl(d));
  }

  async function takt() {
    if (fertig) return;
    if (phase === 'web') {
      const cookies = await win.webContents.session.cookies.get({ domain: '.twitch.tv', name: 'auth-token' });
      const token = tokenAusCookies(cookies);
      if (!token) return;
      onWebToken(token);
      await geraetStarten();
    } else if (phase === 'geraet-laeuft' && istGeraetFertig()) {
      ende();
    }
  }

  timer = setIntervalImpl(() => { takt().catch(() => {}); }, 1000);
  win.on('closed', () => {
    if (timer !== null) { clearIntervalImpl(timer); timer = null; }
    if (!fertig && onAbbruch) onAbbruch();
  });
  if (brauchtWeb) win.loadURL('https://www.twitch.tv/login');
  else geraetStarten().catch(() => {});
  return win;
}

module.exports = { tokenAusCookies, createWebAuthStore, oeffneLoginFenster, oeffneAnmeldeFenster };
