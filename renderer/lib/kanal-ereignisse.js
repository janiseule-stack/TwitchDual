// renderer/lib/kanal-ereignisse.js
// Pins, Umfragen, Vorhersagen: bildet Twitch-GQL (camelCase) und Hermes
// (snake_case) auf EIN Format ab und erzeugt Effekt-Signale. DOM-frei, UMD
// wie chat-ereignisse.js -> mit echten Mitschnitten (09.10.2026) getestet.
// Spec: docs/superpowers/specs/2026-10-09-pins-umfragen-vorhersagen-design.md
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KanalEreignisse = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_EINSATZ = 10;
  const MAX_EINSATZ = 250000;
  // Zwischenzustaende zeigen wir wie "gesperrt": Einreichung ist vorbei,
  // Ergebnis steht noch aus.
  const STATUS_ALIAS = { RESOLVE_PENDING: 'LOCKED', CANCEL_PENDING: 'LOCKED' };
  const ENDGUELTIG = new Set(['RESOLVED', 'CANCELED']);

  const ms = (iso) => (iso ? Date.parse(iso) : null);

  function pinAus(node) {
    if (!node || !node.pinnedMessage) return null;
    const m = node.pinnedMessage;
    const s = m.sender || {};
    const von = node.pinnedBy;
    return {
      id: node.id,
      text: (m.content && m.content.text) || '',
      absender: { name: s.displayName || s.login || '', farbe: s.chatColor || null },
      angeheftetVon: von ? (von.displayName || von.login || null) : null,
      endetUm: ms(node.endsAt)
    };
  }

  function umfrageAus(p, jetzt) {
    if (!p) return null;
    const optionen = (p.choices || []).map((c) => ({
      id: c.id, titel: c.title, stimmen: (c.votes && c.votes.total) || 0
    }));
    const summe = optionen.reduce((n, o) => n + o.stimmen, 0);
    const rest = typeof p.remainingDurationMilliseconds === 'number' ? p.remainingDurationMilliseconds : null;
    return {
      id: p.id,
      titel: p.title,
      status: p.status,
      endetUm: p.status === 'ACTIVE' && rest !== null ? jetzt + rest : ms(p.endedAt),
      optionen: optionen.map((o) => ({ ...o, anteil: summe ? o.stimmen / summe : 0 })),
      gesamt: (p.votes && p.votes.total) || summe,
      mehrfach: !!(p.settings && p.settings.multichoice && p.settings.multichoice.isEnabled)
    };
  }

  // snake: true fuer Hermes-Nutzlasten, false fuer GQL.
  function vorhersageAus(e, snake) {
    if (!e) return null;
    const roh = (e.outcomes || []).map((o) => {
      const top = (snake ? o.top_predictors : o.topPredictors) || [];
      return {
        id: o.id,
        titel: o.title,
        farbe: o.color,
        punkte: (snake ? o.total_points : o.totalPoints) || 0,
        nutzer: (snake ? o.total_users : o.totalUsers) || 0,
        topEinsatz: top.reduce((m, t) => Math.max(m, t.points || 0), 0)
      };
    });
    const summe = roh.reduce((n, o) => n + o.punkte, 0);
    const erstellt = ms(snake ? e.created_at : e.createdAt);
    const fenster = snake ? e.prediction_window_seconds : e.predictionWindowSeconds;
    const gewinner = snake ? e.winning_outcome_id : (e.winningOutcome && e.winningOutcome.id);
    return {
      id: e.id,
      titel: e.title,
      status: STATUS_ALIAS[e.status] || e.status,
      einreichungBis: erstellt !== null && fenster ? erstellt + fenster * 1000 : null,
      optionen: roh.map((o) => ({
        ...o,
        anteil: summe ? o.punkte / summe : 0,
        quote: o.punkte ? summe / o.punkte : null
      })),
      gewinnerId: gewinner || null
    };
  }

  function createZustand() {
    const z = { pin: null, umfrage: null, vorhersage: null, meinTipp: null, guthaben: null };
    const gemeldet = new Set(); // 'start:<id>' / 'ende:<id>' -> jedes Signal genau einmal

    // Neue Umfrage/Vorhersage uebernehmen. Eine bereits beendete, die wir
    // nicht schon zeigen, ist Vergangenheit (z. B. beim Kanal-Laden) -> weg.
    function uebernehme(art, neu, istBeendet, erstes, signale) {
      const alt = z[art];
      if (neu && istBeendet(neu) && (!alt || alt.id !== neu.id)) neu = null;
      z[art] = neu;
      if (!neu) return;
      const k = 'start:' + neu.id;
      if (!istBeendet(neu) && !gemeldet.has(k)) {
        gemeldet.add(k);
        if (!erstes) signale.push({ art: 'ereignis-start', welche: art, id: neu.id });
      }
    }

    function endeSignal(signale) {
      const v = z.vorhersage;
      const t = z.meinTipp;
      if (!v || v.status !== 'RESOLVED' || !t || t.eventId !== v.id) return;
      const k = 'ende:' + v.id;
      if (gemeldet.has(k)) return;
      gemeldet.add(k);
      const opt = v.optionen.find((o) => o.id === t.optionId);
      if (v.gewinnerId === t.optionId && opt && opt.quote) {
        signale.push({ art: 'tipp-gewonnen', id: v.id, betrag: Math.floor(t.punkte * opt.quote) });
      } else {
        signale.push({ art: 'tipp-verloren', id: v.id });
      }
    }

    const umfrageBeendet = (u) => u.status !== 'ACTIVE';
    const vorhersageBeendet = (v) => ENDGUELTIG.has(v.status);

    return {
      ausStart(daten, jetzt, { erstes } = {}) {
        const signale = [];
        if ('pin' in daten) z.pin = pinAus(daten.pin);
        if ('umfrage' in daten) uebernehme('umfrage', umfrageAus(daten.umfrage, jetzt), umfrageBeendet, erstes, signale);
        if ('vorhersage' in daten) uebernehme('vorhersage', vorhersageAus(daten.vorhersage, false), vorhersageBeendet, erstes, signale);
        endeSignal(signale);
        return signale;
      },

      ausHermes(thema, nutzlast, jetzt) {
        const signale = [];
        const art = String(thema).split('.')[0];
        const typ = nutzlast && nutzlast.type;
        const d = (nutzlast && nutzlast.data) || {};
        if (art === 'predictions-channel-v1' && d.event) {
          uebernehme('vorhersage', vorhersageAus(d.event, true), vorhersageBeendet, false, signale);
          endeSignal(signale);
          return { signale, unbekannt: false };
        }
        if (art === 'predictions-user-v1' && d.prediction && /prediction-(made|updated)/.test(typ)) {
          z.meinTipp = { eventId: d.prediction.event_id, optionId: d.prediction.outcome_id, punkte: d.prediction.points };
          return { signale, unbekannt: false };
        }
        if (art === 'community-points-user-v1' && d.balance && typeof d.balance.balance === 'number') {
          z.guthaben = d.balance.balance;
          return { signale, unbekannt: false };
        }
        // Alles andere ist ungemessen (Pin, Umfrage, prediction-result, ...)
        // -> der Aufrufer protokolliert es, der 10-s-Rueckfall haelt Pin und
        // Umfrage aktuell.
        return { signale, unbekannt: true };
      },

      eigenerTipp({ eventId, optionId, punkte }) {
        const t = z.meinTipp;
        z.meinTipp = t && t.eventId === eventId && t.optionId === optionId
          ? { ...t, punkte: t.punkte + punkte }
          : { eventId, optionId, punkte };
        const signale = [];
        endeSignal(signale);
        return signale;
      },

      stand() {
        return JSON.parse(JSON.stringify(z));
      }
    };
  }

  return { createZustand, MIN_EINSATZ, MAX_EINSATZ };
});
