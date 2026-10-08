// src/twitch-kanal-ereignisse.js
// Pins, Umfragen, Vorhersagen ueber Twitchs Web-GQL. Persisted queries,
// mitgeschnitten am 09.10.2026 (docs/TODO.md). Anonym abfragbar, nur
// Client-ID; mit Web-Token zusaetzlich die eigenen Daten. fetch wird
// uebergeben -> kein Electron, voll testbar.
const { randomUUID } = require('crypto');

const WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const ENDPUNKT = 'https://gql.twitch.tv/gql';

const HASH = {
  pin: '450320a012e0f1704586e55755307ca3f8a4c611d678687cc3e202471a33e615',
  umfrage: 'b2386b4f33494ae5b67b92c4279ce9aad3bd912b1f7e1f07fc6a42d5cb6afc5d',
  vorhersage: 'd364abb25d0ad06fc973de923fb10a7631c6cfb4ef7d24cd3e9811593db09ccd',
  restriktion: 'e0c56e52f9743ad3f5d9b5b201da5f44e4d1028d2e32787f8e72641daaea55f6',
  setzen: 'b44682ecc88358817009f20e69d75081b1e58825bb40aa53d5dbadcc17c881d8'
};

// Codes nicht gemessen (nur der Erfolgsfall ist belegt) - gaengige Namen aus
// Twitchs Oberflaeche; alles andere wird roh angezeigt und protokolliert.
const FEHLER_TEXT = {
  NOT_ENOUGH_POINTS: 'Nicht genug Punkte',
  EVENT_NOT_ACTIVE: 'Einreichung ist vorbei',
  EVENT_LOCKED: 'Einreichung ist vorbei',
  MAX_POINTS_PER_EVENT: 'Höchstbetrag für diese Vorhersage erreicht',
  MULTIPLE_OUTCOMES: 'Du hast schon auf die andere Option gesetzt',
  USER_BANNED: 'Du bist in diesem Kanal gesperrt',
  DUPLICATE_TRANSACTION: 'Doppelt abgeschickt, bitte neu laden'
};

function fehlerText(code) {
  return FEHLER_TEXT[code] || 'Twitch lehnt ab: ' + code;
}

const persisted = (operationName, hash, variables) => ({
  operationName, variables, extensions: { persistedQuery: { version: 1, sha256Hash: hash } }
});

function createKanalEreignisseApi({ fetchImpl = fetch, neueTransaktionsId = () => randomUUID().replace(/-/g, '') } = {}) {
  async function post(body, token, kopf) {
    const headers = { ...(kopf || {}), 'Client-ID': WEB_CLIENT_ID, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'OAuth ' + token;
    const res = await fetchImpl(ENDPUNKT, { method: 'POST', headers, body: JSON.stringify(body) });
    if (res.status === 401 || res.status === 403) throw new Error('Anmeldung abgelaufen (HTTP ' + res.status + ')');
    return JSON.parse(await res.text());
  }

  // Einzelantwort eines Batch-Eintrags: Fehler -> Exception mit Integrity-Merker.
  function pruefe(antwort) {
    const errs = antwort && antwort.errors;
    if (errs && errs.length) {
      const m = errs[0].message || 'unbekannt';
      const e = new Error('Twitch-Fehler: ' + m);
      if (/integrity/i.test(m) || (errs[0].extensions && errs[0].extensions.code === 'IntegrityCheckFailed')) e.integrity = true;
      throw e;
    }
    return antwort.data;
  }

  return {
    async startzustand({ channelID, login, token }) {
      let antwort;
      try {
        antwort = await post([
          persisted('GetPinnedChat', HASH.pin, { channelID, count: 1 }),
          persisted('ChannelPollContext_GetViewablePoll', HASH.umfrage, { login }),
          persisted('ChannelPointsPredictionContext', HASH.vorhersage, { count: 1, channelLogin: login })
        ], token);
      } catch (e) {
        return { pin: null, umfrage: null, vorhersage: null, fehler: ['netz: ' + e.message] };
      }
      const fehler = [];
      const teil = (name, i, zieh) => {
        const a = Array.isArray(antwort) ? antwort[i] : null;
        if (!a || (a.errors && a.errors.length)) {
          fehler.push(name + ': ' + ((a && a.errors && a.errors[0].message) || 'keine Antwort'));
          return null;
        }
        try { return zieh(a.data) || null; } catch (e) { fehler.push(name + ': Form unerwartet'); return null; }
      };
      const pin = teil('pin', 0, (d) => {
        const kanten = d.channel && d.channel.pinnedChatMessages && d.channel.pinnedChatMessages.edges;
        return kanten && kanten[0] && kanten[0].node;
      });
      const umfrage = teil('umfrage', 1, (d) => d.channel && d.channel.viewablePoll);
      const vorhersage = teil('vorhersage', 2, (d) => {
        const c = d.community && d.community.channel;
        if (!c) return null;
        const aufgeloest = c.resolvedPredictionEvents && c.resolvedPredictionEvents.edges;
        return (c.activePredictionEvents || [])[0]
          || (c.lockedPredictionEvents || [])[0]
          || (aufgeloest && aufgeloest[0] && aufgeloest[0].node);
      });
      // Eigene Wetten stehen nur mit Login drin (self.recentPredictions,
      // gemessen 09.10.: event.id, outcome.id, points, pointsWon, result).
      const a2 = Array.isArray(antwort) ? antwort[2] : null;
      const self = a2 && a2.data && a2.data.community && a2.data.community.channel && a2.data.community.channel.self;
      const meineTipps = (self && self.recentPredictions) || [];
      return { pin, umfrage, vorhersage, meineTipps, fehler };
    },

    async meineId(token) {
      const a = await post({ query: 'query { currentUser { id } }' }, token);
      const d = pruefe(a);
      return (d && d.currentUser && d.currentUser.id) || null;
    },

    // Reihenfolge wie die echte Seite (Mitschnitt 09.10.): erst Restriction,
    // dann MakePrediction. Das Ergebnis der Restriction ist ungemessen und
    // wird nicht ausgewertet.
    async setze({ token, eventID, outcomeID, points, kopf }) {
      await post([persisted('UserPredictionEventRestriction', HASH.restriktion, { eventID })], token, kopf);
      const a = await post([persisted('MakePrediction', HASH.setzen, {
        input: { eventID, outcomeID, points, transactionID: neueTransaktionsId() }
      })], token, kopf);
      const d = pruefe(Array.isArray(a) ? a[0] : a);
      const err = d && d.makePrediction && d.makePrediction.error;
      return { ok: !err, code: err ? err.code : null };
    }
  };
}

module.exports = { createKanalEreignisseApi, fehlerText, HASH };
