// Zwischenspeicher fuer Listen, die sich selten aendern (7TV-Global-Emotes,
// Twitch-Global-Badges, BTTV/FFZ-Badge-Listen). Vorher wurden sie bei JEDEM
// Kanalwechsel neu geholt - und ein haengender FFZ-Server (gemessen: 2 von 8
// Abfragen nach 10 s abgebrochen) hielt den ganzen Ladevorgang auf.
//
// Regeln:
// - Treffer innerhalb ttlMs kommen aus dem Speicher.
// - Leere Ergebnisse ({} / []) werden NICHT gemerkt: die Quellen sind
//   fail-soft und liefern bei Fehlern leer - das soll beim naechsten Laden
//   erneut versucht werden, statt eine Stunde festzukleben.
// - Gleichzeitige Aufrufe teilen sich eine laufende Abfrage.

function istLeer(wert) {
  if (wert == null) return true;
  if (Array.isArray(wert)) return wert.length === 0;
  if (typeof wert === 'object') return Object.keys(wert).length === 0;
  return false;
}

function cachedLoader(laden, { ttlMs, now = Date.now } = {}) {
  let wert;
  let geladenUm = null;
  let laufend = null;

  return function () {
    if (geladenUm !== null && now() - geladenUm < ttlMs) return Promise.resolve(wert);
    if (laufend) return laufend;
    let start;
    try { start = Promise.resolve(laden()); } catch (e) { start = Promise.reject(e); }
    laufend = start
      .then((ergebnis) => {
        if (!istLeer(ergebnis)) { wert = ergebnis; geladenUm = now(); }
        return ergebnis;
      })
      .finally(() => { laufend = null; });
    return laufend;
  };
}

module.exports = { cachedLoader };
