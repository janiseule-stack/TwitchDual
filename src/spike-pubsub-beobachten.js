// src/spike-pubsub-beobachten.js
// WEGWERF-CODE (Spike 2026-08-12). Schreibt mit, welche WebSocket-
// Verbindungen die echte Twitch-Seite oeffnet und welche Rahmen darueber
// gehen. Ueber webRequest waere nur der Handschlag sichtbar, nicht die
// Rahmen - deshalb das DevTools-Protokoll (Domaene Network).

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

module.exports = { beobachteWebSockets, schwaerzen, kuerzen };
