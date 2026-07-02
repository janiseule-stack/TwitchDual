// DOM-freie Zustandsmaschine fuer den Werbe-Overlay-Fallback.
// UMD wie backoff.js: laeuft im Browser (<script>) und unter Node -> testbar.
//
// Zustaende: idle <-> ad. Im ad-Zustand ist Overlay sichtbar und der Player
// soll gemutet sein. Beim Uebergang idle->ad wird der aktuelle Mute-Zustand
// gemerkt (restoreMuted) und beim Uebergang ad->idle wiederhergestellt.
// Watchdog: bleibt adEnd aus, raeumt tick() nach watchdogMs automatisch auf.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.createAdOverlayState = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function createAdOverlayState({ watchdogMs = 120000 } = {}) {
    let inAd = false;
    let restoreMuted = false;
    let startTick = null; // Zeit (ms) des ersten tick nach adStart

    return {
      adStart(currentlyMuted) {
        if (inAd) return;        // schon in Werbung -> restoreMuted nicht ueberschreiben
        inAd = true;
        restoreMuted = !!currentlyMuted;
        startTick = null;
      },
      adEnd() {
        inAd = false;
        startTick = null;
      },
      tick(nowMs) {
        if (!inAd) return;
        if (startTick === null) {
          startTick = nowMs;
          // Check watchdog immediately on first tick
          if (nowMs >= watchdogMs) {
            inAd = false;
            startTick = null;
          }
          return;
        }
        if (nowMs - startTick >= watchdogMs) {
          inAd = false;
          startTick = null;
        }
      },
      get overlayVisible() { return inAd; },
      get shouldMute() { return inAd; },
      get restoreMuted() { return restoreMuted; },
      get active() { return inAd; }
    };
  }
  return createAdOverlayState;
});
