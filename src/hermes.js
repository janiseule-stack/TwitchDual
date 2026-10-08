// src/hermes.js
// Twitchs Ereignis-Strom "Hermes" (Nachfolger von pubsub-edge, gemessen
// 2026-08-12 und 2026-10-09, siehe docs/TODO.md). Electron-frei: die
// WebSocket-Klasse wird uebergeben (Default: Paket 'ws', wie chat-send.js).
// Abmelden einzelner Themen ist ungemessen -> eine neue Themenliste heisst
// neue Verbindung.
const { randomUUID } = require('crypto');
const Backoff = require('../renderer/lib/backoff');

const HERMES_URL = 'wss://hermes.twitch.tv/v1?clientId=kimne78kx3ncx6brgo4mv6wki5h1ko';

const neueId = () => randomUUID().replace(/-/g, '').slice(0, 21);

function createHermes({
  WebSocketImpl = require('ws'),
  getToken = () => null,
  onEreignis = () => {},
  onStatus = () => {},
  diag = () => {},
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  jetzt = Date.now,
  delay = (versuch) => Backoff.delay(versuch)
} = {}) {
  let themen = [];            // aktuelle Liste
  let aboZuThema = new Map(); // abo-id -> thema (pro Verbindung neu)
  let ws = null;
  let waechter = null;
  let wiederTimer = null;
  let versuch = 0;
  let begruesst = false;      // schon ein welcome fuer diese Themenliste?

  function sende(sock, obj) {
    sock.send(JSON.stringify({ ...obj, timestamp: new Date(jetzt()).toISOString() }));
  }

  function stoppeTimer() {
    if (waechter) { clearTimeoutImpl(waechter); waechter = null; }
    if (wiederTimer) { clearTimeoutImpl(wiederTimer); wiederTimer = null; }
  }

  function waechterNeu(sock, keepaliveSec) {
    if (waechter) clearTimeoutImpl(waechter);
    waechter = setTimeoutImpl(() => {
      diag('keepalive-ausfall', {});
      sock.close();
    }, (keepaliveSec || 15) * 2000);
  }

  // Alte Verbindung schliessen, ohne dass ihr onclose eine Neuverbindung plant.
  function trenneStill() {
    stoppeTimer();
    if (!ws) return;
    const alt = ws;
    ws = null;
    alt.onclose = null;
    alt.onmessage = null;
    try { alt.close(); } catch (e) { /* schon zu */ }
  }

  function verbinde() {
    if (!themen.length) return;
    const sock = new WebSocketImpl(HERMES_URL, { headers: { Origin: 'https://www.twitch.tv' } });
    ws = sock;
    aboZuThema = new Map();
    let keepaliveSec = 15;

    sock.onmessage = (ev) => {
      if (ws !== sock) return;
      let d;
      try { d = JSON.parse(String(ev.data)); } catch (e) { diag('rahmen-kaputt', { stufe: 'umschlag' }); return; }
      waechterNeu(sock, keepaliveSec);
      if (d.welcome) {
        keepaliveSec = d.welcome.keepaliveSec || 15;
        waechterNeu(sock, keepaliveSec);
        const token = getToken();
        if (token) sende(sock, { id: neueId(), type: 'authenticate', authenticate: { token } });
        for (const thema of themen) {
          const aboId = neueId();
          aboZuThema.set(aboId, thema);
          sende(sock, { type: 'subscribe', id: neueId(), subscribe: { id: aboId, type: 'pubsub', pubsub: { topic: thema } } });
        }
        versuch = 0;
        onStatus(begruesst ? 'wieder-da' : 'verbunden');
        begruesst = true;
        return;
      }
      if (d.type === 'notification' && d.notification) {
        const thema = aboZuThema.get(d.notification.subscription && d.notification.subscription.id);
        if (!thema) return;
        let nutzlast;
        try { nutzlast = JSON.parse(d.notification.pubsub); } catch (e) {
          diag('rahmen-kaputt', { stufe: 'pubsub', thema });
          return;
        }
        onEreignis(thema, nutzlast);
        return;
      }
      if (d.type === 'subscribeResponse' && d.subscribeResponse && d.subscribeResponse.result !== 'ok') {
        diag('abo-fehler', { ergebnis: d.subscribeResponse.result });
      }
      if (d.type === 'authenticateResponse' && d.authenticateResponse && d.authenticateResponse.result !== 'ok') {
        diag('anmeldung-fehler', { ergebnis: d.authenticateResponse.result });
      }
    };

    sock.onerror = () => { /* onclose folgt */ };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      stoppeTimer();
      onStatus('getrennt');
      if (!themen.length) return;
      const warte = delay(versuch++);
      diag('neuverbindung', { versuch, warteMs: warte });
      wiederTimer = setTimeoutImpl(() => { wiederTimer = null; verbinde(); }, warte);
    };
  }

  return {
    setzeThemen(neu) {
      const liste = [...new Set(neu || [])];
      if (liste.length === themen.length && liste.every((t, i) => t === themen[i])) return;
      themen = liste;
      trenneStill();
      begruesst = false;
      versuch = 0;
      if (themen.length) verbinde();
    },
    schliesse() {
      themen = [];
      trenneStill();
    }
  };
}

module.exports = { createHermes, HERMES_URL };
