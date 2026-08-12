// src/twitch-integrity.js
// Client-Integrity-Kopfzeilen: ohne sie weist Twitch claimCommunityPoints mit
// IntegrityCheckFailed ab (gemessen 2026-08-11, siehe Task-4b-Brief).
//
// Zwei Erkenntnisse aus dem Spike bestimmen den Zuschnitt:
// 1. Den Token selbst per POST gql.twitch.tv/integrity anzufordern ist
//    wertlos - der so erzeugte Token wird von Twitch abgewiesen. Deshalb
//    NICHT bauen: nur ein aus einer echten Seitensitzung mitgelesener Satz
//    traegt.
// 2. Es braucht keinen Video-Stream, twitch.tv/directory reicht.
//
// Reine Logik (kopfzeilenAusAnfrage, createIntegrityStore) ist DOM-frei und
// unit-getestet. ernteIntegrity haengt an einem echten BrowserWindow und ist
// bewusst nicht unit-getestet - dasselbe Muster wie oeffneLoginFenster in
// src/twitch-web-auth.js.

const DIRECTORY_URL = 'https://www.twitch.tv/directory';
const GQL_FILTER = { urls: ['https://gql.twitch.tv/*'] };

// Liest die vier zusammengehoerenden Kopfzeilen tolerant gegen Gross- und
// Kleinschreibung. Ohne Client-Integrity gibt es keinen gueltigen Satz - die
// drei uebrigen Felder duerfen leer sein (Client-Session-Id war im Spike
// nicht immer gesetzt).
function kopfzeilenAusAnfrage(headers) {
  if (!headers) return null;
  const gefunden = {};
  for (const [name, wert] of Object.entries(headers)) {
    gefunden[name.toLowerCase()] = wert;
  }
  const integrity = gefunden['client-integrity'];
  if (!integrity) return null;
  return {
    integrity,
    deviceId: gefunden['x-device-id'] || null,
    sessionId: gefunden['client-session-id'] || null,
    version: gefunden['client-version'] || null
  };
}

// Merkt sich den zuletzt geernteten Satz samt Setzzeitpunkt. Zwei
// Sicherungen statt einer Wette, weil die tatsaechliche Lebensdauer des
// Tokens nicht gemessen ist: weiche Haltbarkeit (Vorgabe 20 Minuten) und
// hartes Verwerfen, sobald Twitch IntegrityCheckFailed meldet.
function createIntegrityStore({ haltbarkeitMs = 1200000 } = {}) {
  let satz = null;
  let gesetztUm = 0;

  return {
    setzen(neuerSatz, nowMs = Date.now()) {
      satz = neuerSatz;
      gesetztUm = nowMs;
    },
    holen(nowMs = Date.now()) {
      if (!satz) return null;
      if (nowMs - gesetztUm > haltbarkeitMs) return null;
      return satz;
    },
    verwerfen() {
      satz = null;
      gesetztUm = 0;
    }
  };
}

// Nicht unit-getestet (echtes Fenster). Oeffnet ein unsichtbares Fenster auf
// der videofreien Verzeichnis-Seite, liest die erste GQL-Anfrage mit
// Client-Integrity-Kopfzeile mit und schliesst das Fenster wieder zu - in
// JEDEM Fall, sonst bleibt ein unsichtbares Fenster fuer immer offen.
// Kein Aufruf von gql.twitch.tv/integrity: der Weg ist gemessen und wertlos.
function ernteIntegrity({ BrowserWindow, ses, timeoutMs = 30000 }) {
  return new Promise((resolve) => {
    let fertig = false;
    let win = null;
    let timer = null;

    const abschliessen = (ergebnis) => {
      if (fertig) return;
      fertig = true;
      if (timer) clearTimeout(timer);
      try { ses.webRequest.onBeforeSendHeaders(GQL_FILTER, null); } catch { /* egal */ }
      if (win) {
        try { win.removeListener('closed', beiSchliessen); } catch { /* egal */ }
        // destroy() statt close(): close() laesst die Seite beforeunload
        // ausfuehren und kann abgelehnt werden. Bei show:false saehe das
        // niemand und das unsichtbare Fenster bliebe fuer immer offen.
        try { win.destroy(); } catch { /* schon zu */ }
      }
      resolve(ergebnis);
    };

    const beiSchliessen = () => abschliessen(null);

    const beiAnfrage = (details, callback) => {
      if (!fertig) {
        const satz = kopfzeilenAusAnfrage(details.requestHeaders);
        if (satz) abschliessen(satz);
      }
      callback({ cancel: false });
    };

    try {
      win = new BrowserWindow({
        show: false,
        webPreferences: {
          session: ses,
          nodeIntegration: false,
          contextIsolation: true
        }
      });
      win.webContents.setAudioMuted(true);
      win.on('closed', beiSchliessen);
      ses.webRequest.onBeforeSendHeaders(GQL_FILTER, beiAnfrage);

      // Nur ein echter Fehlschlag des HAUPTrahmens beendet die Ernte.
      // twitch.tv/directory laedt reichlich Unterrahmen und Beiwerk, und
      // ERR_ABORTED (-3) ist beim Weiternavigieren Alltag. Frueher brach
      // jeder dieser Faelle die Ernte ab -> "Integrity-Kopfzeilen nicht
      // erhalten" und einer von nur drei Kisten-Versuchen war verbrannt.
      // 'on' statt 'once': ein ignorierter Unterrahmen darf den Lauscher
      // nicht aufbrauchen.
      win.webContents.on('did-fail-load', (_ev, code, _beschreibung, _url, istHauptrahmen) => {
        if (istHauptrahmen !== true) return;
        if (code === -3) return; // ERR_ABORTED
        abschliessen(null);
      });

      timer = setTimeout(() => abschliessen(null), timeoutMs);

      win.loadURL(DIRECTORY_URL).catch(() => abschliessen(null));
    } catch {
      abschliessen(null);
    }
  });
}

module.exports = { kopfzeilenAusAnfrage, createIntegrityStore, ernteIntegrity };
