// src/spike-pubsub-abo.js
// WEGWERF-CODE (Spike 2026-08-12).
// Form gemessen an der echten Twitch-Seite (siehe Stufe 0): Twitch benutzt
// nicht mehr pubsub-edge, sondern "Hermes". Ablauf: verbinden -> welcome
// abwarten -> EINMAL authenticate -> je Thema ein subscribe. Der Server
// schickt von sich aus alle ~10 s keepalive; ein eigener PING entfaellt.

const { schwaerzen, kuerzen } = require('./spike-pubsub-beobachten');

const HERMES_URL = 'wss://hermes.twitch.tv/v1?clientId=kimne78kx3ncx6brgo4mv6wki5h1ko';

function starteAbo({ url = HERMES_URL, token, themen, log }) {
  // Vorbedingung (gemessen): im Hauptprozess ohne
  // NODE_OPTIONS=--experimental-websocket gibt es keine WebSocket-Klasse.
  // Klar protokollieren statt werfen - der Spike darf die App nie stoeren.
  if (typeof WebSocket !== 'function') {
    log('spike-abo-fehler', 'WebSocket fehlt - NODE_OPTIONS=--experimental-websocket noetig');
    return () => {};
  }

  let ws;
  try {
    ws = new WebSocket(url);
  } catch (e) {
    log('spike-abo-fehler', 'Verbindungsaufbau: ' + e.message);
    return () => {};
  }

  let ersterKeepalive = true;
  // Umschlag-Nonce (subscribe.id oben) -> Thema, damit eine Antwort ueber
  // parentId eindeutig ihrem Thema zugeordnet werden kann.
  const themaNachUmschlag = new Map();

  ws.onopen = () => {
    try {
      log('spike-abo-offen', url);
      const rahmen = {
        id: 'spike-auth',
        type: 'authenticate',
        authenticate: { token },
        timestamp: new Date().toISOString()
      };
      ws.send(JSON.stringify(rahmen));
    } catch (e) {
      log('spike-abo-fehler', 'open: ' + e.message);
    }
  };

  ws.onmessage = (ev) => {
    try {
      const roh = ev && ev.data;
      let rahmen;
      try {
        rahmen = JSON.parse(roh);
      } catch (e) {
        log('spike-abo-fehler', 'JSON.parse: ' + e.message);
        return;
      }

      const typ = rahmen && rahmen.type;

      if (typ === 'keepalive') {
        // Kommt alle ~10s - wuerde das Protokoll zumuellen. Nur der erste
        // belegt, dass die Verbindung lebt.
        if (ersterKeepalive) {
          ersterKeepalive = false;
          log('spike-abo-keepalive', 'laeuft');
        }
        return;
      }

      if (typ === 'welcome') {
        // schwaerzen() ist hier ein No-Op (welcome traegt kein Token), aber
        // die bindende Vorgabe "alles roh Protokollierte vorher schwaerzen"
        // gilt ausnahmslos - lieber ein wirkungsloser Aufruf als eine Luecke.
        log('spike-abo-welcome', kuerzen(schwaerzen(roh), 200));
        return;
      }

      if (typ === 'authenticateResponse') {
        const ergebnis = rahmen.authenticateResponse && rahmen.authenticateResponse.result;
        if (ergebnis === 'ok') {
          log('spike-abo-auth', 'ok');
          // Erst JETZT abonnieren - ohne erfolgreiche Anmeldung waere jede
          // Abo-Antwort wertlos, und die Themen duerfen nicht vorher raus.
          (themen || []).forEach((thema, i) => {
            try {
              const umschlagId = 'spike-sub-' + i;
              const aboId = 'spike-aboid-' + i;
              themaNachUmschlag.set(umschlagId, thema);
              const subRahmen = {
                type: 'subscribe',
                id: umschlagId,
                subscribe: { id: aboId, type: 'pubsub', pubsub: { topic: thema } },
                timestamp: new Date().toISOString()
              };
              ws.send(JSON.stringify(subRahmen));
            } catch (e) {
              log('spike-abo-fehler', 'subscribe-senden ' + thema + ': ' + e.message);
            }
          });
        } else {
          log('spike-abo-auth', kuerzen(schwaerzen(roh), 400));
        }
        return;
      }

      if (typ === 'subscribeResponse') {
        const thema = themaNachUmschlag.get(rahmen.parentId) ||
          '(unbekanntes Thema, parentId=' + rahmen.parentId + ')';
        const sr = rahmen.subscribeResponse;
        const ergebnis = sr && sr.result;
        const detail = ergebnis === 'ok' ? ergebnis : kuerzen(schwaerzen(roh), 400);
        log('spike-abo-antwort', thema + ' -> ' + detail);
        return;
      }

      // alles andere: die eigentlichen Ereignisse (Nutzlast eines Themas)
      log('spike-abo-ereignis', kuerzen(schwaerzen(roh), 800));
    } catch (e) {
      log('spike-abo-fehler', 'message: ' + e.message);
    }
  };

  ws.onerror = (ev) => {
    try {
      const info = ev && ev.message ? ev.message : 'unbekannt';
      log('spike-abo-fehler', 'error: ' + info);
    } catch { /* Logging darf nie werfen */ }
  };

  ws.onclose = (ev) => {
    try {
      log('spike-abo-geschlossen', 'code=' + (ev && ev.code));
    } catch { /* Logging darf nie werfen */ }
  };

  return () => {
    try { ws.close(); } catch { /* schon zu oder nie offen */ }
  };
}

module.exports = { starteAbo, HERMES_URL };
