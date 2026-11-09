// Kanalpunkte-Abruf fuer die CD vorne auf Home: Stillstand-Verzoegerung,
// Speicher pro Kanal, Sperre bei Abmeldung. DOM-frei, Uhr und Timer werden
// von aussen gegeben -> testbar. UMD wie chat-ui.js.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HomePunkte = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function createPunkteAbruf(opts) {
    const abfrage = opts.abfrage;
    const darf = opts.darf;
    const jetzt = opts.jetzt;
    const setzeTimer = opts.setzeTimer;
    const loescheTimer = opts.loescheTimer;
    const warteMs = opts.warteMs === undefined ? 400 : opts.warteMs;
    const merkMs = opts.merkMs === undefined ? 300000 : opts.merkMs;

    const speicher = new Map(); // login -> { balance, iconUrl, zeit }
    let aktuell = null;
    let timer = null;
    let gesperrt = false;
    let cb = null;

    function melde(login, stand) {
      if (cb) cb(login, { balance: stand.balance, iconUrl: stand.iconUrl });
    }

    function antwort(login, r) {
      if (login !== aktuell || !r) return; // veraltet
      if (r.ok && r.balance !== null && r.balance !== undefined) {
        const stand = { balance: r.balance, iconUrl: r.iconUrl, zeit: jetzt() };
        speicher.set(login, stand);
        melde(login, stand);
      } else if (r.abgelaufen || r.gesperrt) {
        gesperrt = true;
      }
      // sonstige Fehler: nichts (kein cb, keine Sperre)
    }

    function frage(login) {
      timer = null;
      if (gesperrt || login !== aktuell || !darf()) return;
      let p;
      try { p = abfrage(login); } catch (e) { return; }
      Promise.resolve(p).then((r) => antwort(login, r), () => {});
    }

    function vorne(login) {
      if (timer !== null) { loescheTimer(timer); timer = null; }
      aktuell = login;
      if (!login || gesperrt || !darf()) return;
      const alt = speicher.get(login);
      if (alt && jetzt() - alt.zeit < merkMs) {
        melde(login, alt);
        return;
      }
      timer = setzeTimer(() => frage(login), warteMs);
    }

    function oeffnen() {
      gesperrt = false;
    }

    function beiStand(fn) {
      cb = fn;
    }

    // Abmelden / Konto-Wechsel: alter Stand gehoert zum alten Konto.
    // Spaete Antworten verwirft antwort(), weil aktuell danach null ist.
    function leeren() {
      if (timer !== null) { loescheTimer(timer); timer = null; }
      speicher.clear();
      aktuell = null;
      gesperrt = false;
    }

    return { vorne, oeffnen, beiStand, leeren };
  }

  return { createPunkteAbruf };
});
