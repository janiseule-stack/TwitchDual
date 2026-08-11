// DOM-freier Waechter gegen "Ton weg nach Werbung".
// UMD wie ad-overlay-state.js: laeuft im Browser (<script>) und unter Node -> testbar.
//
// HINTERGRUND (bewiesen per adblock-diag.log, 2026-08-09 17:31):
// vaft macht nach einer Werbeunterbrechung einen Hard-Reload und ersetzt dabei
// das <video>-Element. Fuer `muted` raeumt vaft gruendlich auf (Listener auf
// canplay/playing/loadeddata, 4000-ms-Timeout, 5500-ms-Backstop). Fuer `volume`
// schreibt es nur den localStorage-Wert zurueck und hofft, dass Twitchs Player
// ihn liest - ein Rennen. Verliert es das Rennen, bleibt das neue Element auf
// volume=0 stehen:
//
//   17:31:16.013  muted:true   volume:0     <- vaft stummt bewusst
//   17:31:16.328  muted:false  volume:0     <- Mute weg, Lautstaerke bleibt 0
//   18:24:10.627  muted:false  volume:0     <- 53 Minuten spaeter unveraendert
//
// Die Embed-API meldet weiter den alten Wert (0.11), weil nur das Element auf 0
// steht. Deshalb sieht in der Oberflaeche alles "an" aus, es kommt aber kein Ton
// - und video.js kann es ueber player.getVolume() gar nicht bemerken.
//
// ERKENNUNG: `muted === false && volume === 0` ist ueber die Twitch-Oberflaeche
// nicht erreichbar - wer den Regler auf 0 zieht, bekommt zusaetzlich muted=true.
// Unmuted-auf-Null ist damit immer der kaputte Zustand, nie eine Nutzerabsicht.
//
// FEHLALARM-SCHUTZ: Beim gesunden Reload tritt volume=0 ebenfalls kurz auf (im
// Log 279 ms lang). Erst wenn der Zustand graceMs ueberdauert, greifen wir ein.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.createVolumeGuard = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function createVolumeGuard({ graceMs = 1500 } = {}) {
    let lastGoodVolume = null;  // zuletzt gesehene Lautstaerke > 0
    let suspectSince = null;    // seit wann steht unmuted auf volume=0?

    return {
      // Einen Messwert des <video>-Elements einspeisen. `state` ist null, wenn
      // gerade kein Element existiert (Teardown waehrend des Reloads).
      // Rueckgabe: null (nichts tun) oder { restoreTo } (Lautstaerke setzen).
      observe(state, nowMs) {
        if (!state) { suspectSince = null; return null; }

        if (typeof state.volume === 'number' && state.volume > 0) {
          lastGoodVolume = state.volume;   // gilt auch bei muted: der Wert bleibt gueltig
          suspectSince = null;
          return null;
        }
        // Gemutet ist ein legitimer Zustand (Nutzer oder vaft waehrend des
        // Reloads) - der Mute-Backstop von vaft ist dafuer zustaendig.
        if (state.muted) { suspectSince = null; return null; }
        // Nie eine brauchbare Lautstaerke gesehen -> nichts zu restaurieren.
        if (lastGoodVolume === null) { suspectSince = null; return null; }

        if (suspectSince === null) { suspectSince = nowMs; return null; }
        if (nowMs - suspectSince < graceMs) return null;

        // Frist abgelaufen, Zustand haelt an -> wiederherstellen. Frist neu
        // starten, damit eine wirkungslose Korrektur erneut versucht wird.
        suspectSince = nowMs;
        return { restoreTo: lastGoodVolume };
      },
      get lastGoodVolume() { return lastGoodVolume; }
    };
  }
  return createVolumeGuard;
});
