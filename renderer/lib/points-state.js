// DOM-freie Takt- und Fehlerlogik fuer die Kanalpunkte-Abfrage.
// UMD wie ad-overlay-state.js: laeuft im Browser und unter Node -> testbar.
//
// Regeln:
//   - abgefragt wird nur bei Live-Kanal, spielendem Player und vorhandenem Token
//   - nach Fehlern verdoppelt sich der Abstand bis maxBackoffMs, Erfolg setzt zurueck
//   - dieselbe Kiste hoechstens maxClaimVersuche mal (sonst Dauerfeuer gegen Twitch)
//   - ein Kanal ohne Punkte wird dauerhaft gesperrt statt endlos angefragt

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.createPointsState = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function createPointsState({ intervalMs = 15000, maxBackoffMs = 300000, maxClaimVersuche = 3 } = {}) {
    let abstand = intervalMs;
    let letzteAbfrage = null;
    const claimVersuche = new Map();
    const gesperrteKanaele = new Set();

    return {
      sollAbfragen(zustand, nowMs) {
        if (!zustand || !zustand.hatToken) return false;
        if (!zustand.live || !zustand.playing) return false;
        if (zustand.channelLogin && gesperrteKanaele.has(zustand.channelLogin)) return false;
        if (letzteAbfrage === null) return true;
        return nowMs - letzteAbfrage >= abstand;
      },
      abfrageOk(nowMs) {
        letzteAbfrage = nowMs;
        abstand = intervalMs;
      },
      abfrageFehler(nowMs) {
        letzteAbfrage = nowMs;
        abstand = Math.min(abstand * 2, maxBackoffMs);
      },
      darfClaimen(claimID) {
        return (claimVersuche.get(claimID) || 0) < maxClaimVersuche;
      },
      claimFehlgeschlagen(claimID) {
        claimVersuche.set(claimID, (claimVersuche.get(claimID) || 0) + 1);
      },
      // Nach einem frischen Anmelden muss der Takt sofort wieder greifen.
      // Ohne das steht der Abstand nach einem abgelaufenen Token noch auf bis
      // zu 5 Minuten und der Chip haengt so lange auf "..." fest.
      // Bewusst NICHT zurueckgesetzt: Kanalsperren und Kisten-Zaehler. Beide
      // haengen am Kanal bzw. an der Kiste, nicht an der Anmeldung - sie hier
      // zu leeren wuerde nur wieder gegen dieselbe Wand laufen.
      zuruecksetzen() {
        abstand = intervalMs;
        letzteAbfrage = null;
      },
      kanalGesperrt(channelLogin) {
        gesperrteKanaele.add(channelLogin);
      },
      istKanalGesperrt(channelLogin) {
        return gesperrteKanaele.has(channelLogin);
      },
      get aktuellerAbstandMs() { return abstand; }
    };
  }
  return createPointsState;
});
