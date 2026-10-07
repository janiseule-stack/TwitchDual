// Merkt sich im Main die gerade geladene Quelle (Kanal/VOD + nachgeladene
// Emotes/Badges), damit ein neu geladenes Chat-Fenster (Absturz, Strg+R)
// nicht auf "nicht verbunden" stehen bleibt, sondern sich wieder einklinkt.
// Bei offenem Home gibt es nichts zurueck - dort ist der Chat absichtlich leer.

function createQuellenGedaechtnis() {
  let payload = null;
  let extras = null;
  let homeOffen = false;
  return {
    geladen(p) { payload = p || null; extras = null; homeOffen = false; },
    extrasDa(e) { if (payload && e && e.ladeId === payload.ladeId) extras = e; },
    home(offen) { homeOffen = !!offen; },
    // Fuer das Chat-Fenster: dieselbe Form wie 'load', Extras schon eingerechnet.
    fuerNeustart() {
      if (!payload || homeOffen) return null;
      if (!extras) return { ...payload };
      return { ...payload, emotes: extras.emotes || {}, badgeCatalog: extras.badgeCatalog || {} };
    }
  };
}

module.exports = { createQuellenGedaechtnis };
