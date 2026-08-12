// src/spike-pubsub-beobachten.js
// WEGWERF-CODE (Spike 2026-08-12). Schreibt mit, welche WebSocket-
// Verbindungen die echte Twitch-Seite oeffnet und welche Rahmen darueber
// gehen. Ueber webRequest waere nur der Handschlag sichtbar, nicht die
// Rahmen - deshalb das DevTools-Protokoll (Domaene Network).

// Dieselbe Adresse wie das Ernte-Fenster in src/twitch-integrity.js (dort
// DIRECTORY_URL) - videofrei, aber eine echte, eingeloggte Twitch-Seite.
// Bewusst hier dupliziert statt importiert: twitch-integrity.js bleibt vom
// Spike unberuehrt (Review-Vorgabe, git diff master dort leer).
const DIRECTORY_URL = 'https://www.twitch.tv/directory';

// Zugangsdaten duerfen nie ins Protokoll. Twitch schickt den Token im
// LISTEN-Rahmen als "auth_token"; wir ersetzen den Wert vor dem Schreiben.
function schwaerzen(text) {
  return String(text || '')
    .replace(/("auth_token"\s*:\s*")[^"]*(")/g, '$1***$2')
    .replace(/(OAuth\s+)[A-Za-z0-9]+/g, '$1***');
}

function kuerzen(text, max = 600) {
  const s = String(text || '');
  return s.length > max ? s.slice(0, max) + ' …[' + s.length + ' Zeichen]' : s;
}

function beobachteWebSockets(webContents, log) {
  try {
    webContents.debugger.attach('1.3');
  } catch (e) {
    log('spike-ws-fehler', 'debugger.attach: ' + e.message);
    return;
  }

  const adressen = new Map(); // requestId -> URL

  webContents.debugger.on('message', (_ev, methode, p) => {
    try {
      if (methode === 'Network.webSocketCreated') {
        adressen.set(p.requestId, p.url);
        log('spike-ws-offen', p.url);
        return;
      }
      const richtung = methode === 'Network.webSocketFrameSent' ? 'raus'
        : methode === 'Network.webSocketFrameReceived' ? 'rein' : null;
      if (!richtung) return;
      const url = adressen.get(p.requestId) || '?';
      const nutzlast = p.response && p.response.payloadData;
      log('spike-ws-rahmen', richtung + ' ' + url + ' ' + kuerzen(schwaerzen(nutzlast)));
    } catch (e) {
      log('spike-ws-fehler', 'message: ' + e.message);
    }
  });

  webContents.debugger.sendCommand('Network.enable').catch((e) => {
    log('spike-ws-fehler', 'Network.enable: ' + e.message);
  });
}

// Der Spike braucht nur eine echte Twitch-Seite zum Zusehen, keine
// Integrity-Kopfzeilen. Eigenes Fenster statt ernteIntegrity: sonst haelt
// der Spike 5 Minuten lang den einzigen onBeforeSendHeaders-Lauscher der
// Sitzung besetzt und verbrennt einen Kisten-Claim.
function beobachteEchteSeite({ BrowserWindow, ses, log, dauerMs = 300000 }) {
  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true }
    });
    win.webContents.setAudioMuted(true);
    beobachteWebSockets(win.webContents, log);
    win.loadURL(DIRECTORY_URL).catch((e) => {
      log('spike-ws-fehler', 'loadURL: ' + e.message);
    });
    setTimeout(() => {
      // Debugger haengt sonst bis zum Zerstoeren des webContents am Fenster;
      // sauber abhaengen, bevor das Fenster verschwindet - darf nie werfen.
      try { win.webContents.debugger.detach(); } catch { /* schon weg oder nie angehaengt */ }
      try { win.destroy(); } catch { /* schon zu */ }
      log('spike-ws-ende', 'Beobachtungsfenster zu');
    }, dauerMs);
  } catch (e) {
    log('spike-ws-fehler', 'Fenster: ' + e.message);
    try { if (win) win.destroy(); } catch { /* egal */ }
  }
}

module.exports = { beobachteWebSockets, beobachteEchteSeite, schwaerzen, kuerzen };
