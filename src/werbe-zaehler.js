// Geblockte Werbungen insgesamt, dauerhaft im Store (Janis 05.11.2026: die
// Zahl neben ADS BLOCKED soll ueber Neustarts weiter steigen, nicht pro
// Sitzung bei 0 anfangen). Kaputte Werte im Store zaehlen als 0.

const SCHLUESSEL = 'werbungGeblockt';

function createWerbeZaehler(store) {
  function gesamt() {
    const n = Math.floor(Number(store.get(SCHLUESSEL, 0)));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function plusEins() {
    const n = gesamt() + 1;
    store.set(SCHLUESSEL, n);
    return n;
  }
  return { gesamt, plusEins };
}

module.exports = { createWerbeZaehler };
