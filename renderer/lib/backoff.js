// Exponentieller Backoff mit Jitter fuer Reconnects (z.B. Twitch-IRC).
// UMD wie emote-text.js: laeuft im Browser (<script>) und unter Node -> testbar.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Backoff = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // Verzoegerung fuer den `attempt`-ten Wiederholungsversuch (0-basiert) in ms.
  // Verdoppelt sich pro Versuch (base, 2*base, 4*base, ...), gedeckelt bei max.
  // Jitter streut auf 50-100 % des Werts, damit nicht alle Clients einer
  // Twitch-Stoerung gleichzeitig wiederkommen. random injizierbar fuer Tests.
  function delay(attempt, { base = 1000, max = 30000, random = Math.random } = {}) {
    const exp = Math.min(max, base * Math.pow(2, Math.max(0, attempt)));
    return Math.round(exp / 2 + (exp / 2) * random());
  }

  return { delay };
});
