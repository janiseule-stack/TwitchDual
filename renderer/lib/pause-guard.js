// DOM-freier Waechter gegen "Stream bleibt bei Werbung stehen".
// UMD wie volume-guard.js: laeuft im Player-iframe (injiziert) und unter Node -> testbar.
//
// HINTERGRUND: vaft haengt an jedes <video> einen 'pause'-Listener und wertet
// JEDE Pause, die es nicht selbst ausgeloest hat, als Nutzerabsicht
// (vendor/vaft.js, userPauseIntent). Haelt Twitch beim Umschalten
// Werbung <-> Stream selbst an, verweigert vaft danach bewusst das
// Weiterspielen ("Respecting user pause intent") - der Stream steht, bis man
// klickt.
//
// ERKENNUNG: Gewollt ist eine Pause nur, wenn kurz davor eine echte Eingabe
// kam (Klick/Taste im Player oder unser Space-Kuerzel, das per postMessage
// gemeldet wird). Alles andere ist ungewollt -> nach wartezeitMs play(),
// hoechstens maxVersuche mal (offline/kaputt: nicht endlos haemmern).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.createPauseGuard = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function createPauseGuard({
    wartezeitMs = 1500, eingabeFensterMs = 1500, maxVersuche = 3, melde = () => {}
  } = {}) {
    let letzteEingabe = -Infinity;
    let verdachtSeit = null;   // Zeitpunkt der ungewollten Pause bzw. des letzten Versuchs
    let versuche = 0;

    return {
      nutzerEingabe(nowMs) {
        letzteEingabe = nowMs;
        verdachtSeit = null;   // laufender Verdacht: der Nutzer greift selbst ein
      },
      pausiert(nowMs, { ended = false } = {}) {
        if (ended) { verdachtSeit = null; return; }
        if (nowMs - letzteEingabe <= eingabeFensterMs) { verdachtSeit = null; return; }
        if (verdachtSeit === null && versuche === 0) melde('pause-ungewollt', {});
        verdachtSeit = nowMs;
      },
      spielt() {
        verdachtSeit = null;
        versuche = 0;
      },
      // Rueckgabe: null (nichts tun) oder { play: true, versuch }.
      tick(nowMs) {
        if (verdachtSeit === null) return null;
        if (nowMs - verdachtSeit < wartezeitMs) return null;
        if (versuche >= maxVersuche) {
          verdachtSeit = null;
          melde('pause-aufgegeben', { versuche });
          return null;
        }
        versuche++;
        verdachtSeit = nowMs; // naechster Versuch erst nach erneuter Wartezeit
        melde('pause-weiter', { versuch: versuche });
        return { play: true, versuch: versuche };
      }
    };
  }

  return createPauseGuard;
});
