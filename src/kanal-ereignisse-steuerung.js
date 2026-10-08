// src/kanal-ereignisse-steuerung.js
// Ablauf fuer Pins/Umfragen/Vorhersagen, ohne Electron: Kanal geladen ->
// Startzustand (GQL) -> Hermes-Themen -> 10-s-Rueckfall fuer Pin/Umfrage
// (deren Hermes-Rahmen sind ungemessen). Der Zustand lebt hier; das
// Chat-Fenster bekommt { stand, signale, angemeldet } und zeichnet nur.
const KE = require('../renderer/lib/kanal-ereignisse');
const { fehlerText } = require('./twitch-kanal-ereignisse');

const RUECKFALL_MS = 10000;
const MAX_PROTOKOLL_JE_TYP = 3;

function createSteuerung({
  api, hermes, getToken, getUserId, mitIntegrity, senden,
  diag = () => {}, jetzt = Date.now,
  setIntervalImpl = setInterval, clearIntervalImpl = clearInterval
}) {
  let lauf = 0;          // steigt bei jedem Kanalwechsel -> alte Antworten erkennen
  let kanal = null;      // { login, channelID }
  let zustand = null;
  let takt = null;
  let unbekanntGezaehlt = new Map();

  const angemeldet = () => !!getToken();

  function schicke(signale) {
    senden({ stand: zustand ? zustand.stand() : null, signale: signale || [], angemeldet: angemeldet() });
  }

  async function holeStart(nr, nurTeile) {
    const daten = await api.startzustand({ channelID: kanal.channelID, login: kanal.login, token: getToken() || null });
    if (nr !== lauf || !zustand) return null;
    if (daten.fehler && daten.fehler.length) diag('start-fehler', { kanal: kanal.login, fehler: daten.fehler });
    const teile = nurTeile
      ? Object.fromEntries(nurTeile.map((k) => [k, daten[k]]))
      : { pin: daten.pin, umfrage: daten.umfrage, vorhersage: daten.vorhersage };
    return teile;
  }

  function stoppeTakt() {
    if (takt !== null) { clearIntervalImpl(takt); takt = null; }
  }

  return {
    async kanalGeladen({ login, channelID }) {
      const nr = ++lauf;
      stoppeTakt();
      kanal = { login, channelID };
      zustand = KE.createZustand();
      unbekanntGezaehlt = new Map();
      const teile = await holeStart(nr);
      if (!teile) return;
      const signale = zustand.ausStart(teile, jetzt(), { erstes: true });
      diag('start', { kanal: login, pin: !!teile.pin, umfrage: !!teile.umfrage, vorhersage: !!teile.vorhersage });
      schicke(signale);
      const themen = [`pinned-chat-updates-v1.${channelID}`, `polls.${channelID}`, `predictions-channel-v1.${channelID}`];
      if (getToken()) {
        const uid = await getUserId();
        if (nr !== lauf) return;
        if (uid) themen.push(`predictions-user-v1.${uid}`, `community-points-user-v1.${uid}`);
      }
      hermes.setzeThemen(themen);
      takt = setIntervalImpl(async () => {
        try {
          const t = await holeStart(nr, ['pin', 'umfrage']);
          if (t) schicke(zustand.ausStart(t, jetzt(), { erstes: false }));
        } catch (e) { diag('rueckfall-fehler', { fehler: e.message }); }
      }, RUECKFALL_MS);
    },

    aus() {
      lauf++;
      stoppeTakt();
      kanal = null;
      zustand = null;
      hermes.setzeThemen([]);
      schicke([]);
    },

    hermesEreignis(thema, nutzlast) {
      if (!zustand) return;
      const r = zustand.ausHermes(thema, nutzlast, jetzt());
      if (r.unbekannt) {
        const typ = String(thema).split('.')[0] + ':' + (nutzlast && nutzlast.type);
        const n = (unbekanntGezaehlt.get(typ) || 0) + 1;
        unbekanntGezaehlt.set(typ, n);
        if (n <= MAX_PROTOKOLL_JE_TYP) diag('hermes-rahmen', { typ, nutzlast: JSON.stringify(nutzlast).slice(0, 1500) });
        return;
      }
      schicke(r.signale);
    },

    async hermesStatus(status) {
      diag('hermes-status', { status });
      if (status !== 'wieder-da' || !kanal) return;
      const nr = lauf;
      try {
        const teile = await holeStart(nr);
        if (teile) schicke(zustand.ausStart(teile, jetzt(), { erstes: false }));
      } catch (e) { diag('start-fehler', { fehler: [e.message] }); }
    },

    async setze({ outcomeID, points }) {
      const token = getToken();
      if (!token) return { ok: false, text: 'Zum Setzen anmelden' };
      if (!zustand) return { ok: false, text: 'Kein Live-Kanal' };
      const stand = zustand.stand();
      const v = stand.vorhersage;
      if (!v || v.status !== 'ACTIVE') return { ok: false, text: 'Einreichung ist vorbei' };
      if (!KE.setzbareOptionen(stand).includes(outcomeID)) return { ok: false, text: 'Nur noch auf deine Option möglich' };
      const b = KE.eigenerBetrag(String(points), stand.guthaben);
      if (b.fehler) return { ok: false, text: b.fehler };
      const nr = lauf;
      try {
        const r = await mitIntegrity((kopf) => api.setze({ token, eventID: v.id, outcomeID, points: b.betrag, kopf }));
        if (r && r.error) { diag('setzen-fehler', { grund: r.error }); return { ok: false, text: r.error }; }
        if (!r.ok) { diag('setzen-fehler', { code: r.code }); return { ok: false, text: fehlerText(r.code) }; }
        diag('setzen', { eventID: v.id, outcomeID, punkte: b.betrag });
        if (nr === lauf && zustand) schicke(zustand.eigenerTipp({ eventId: v.id, optionId: outcomeID, punkte: b.betrag }));
        return { ok: true, text: b.betrag.toLocaleString('de-DE') + ' gesetzt' };
      } catch (e) {
        diag('setzen-fehler', { fehler: e.message, integrity: !!e.integrity });
        return { ok: false, text: e.integrity ? 'Twitch hat die Prüfung abgelehnt, bitte nochmal' : e.message };
      }
    }
  };
}

module.exports = { createSteuerung };
