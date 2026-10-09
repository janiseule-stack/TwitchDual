// src/integrity-aufruf.js
// "Mit Integrity-Kopfzeilen aufrufen": Satz aus dem Speicher, sonst ernten;
// lehnt Twitch ab (fehler.integrity), Satz verwerfen, GENAU einmal neu ernten
// und wiederholen. Vorher inline in main.js kisteEinloesen - jetzt auch fuers
// Setzen auf Vorhersagen.
function createIntegrityAufruf({ store, ernte, jetzt = Date.now, melde = () => {} }) {
  const kopfAus = (s) => ({
    'Client-Integrity': s.integrity,
    'X-Device-Id': s.deviceId,
    'Client-Session-Id': s.sessionId,
    'Client-Version': s.version
  });
  const KEIN_SATZ = { ok: false, error: 'Integrity-Kopfzeilen nicht erhalten' };

  // Single-Flight: ernteIntegrity vertraegt nur einen Lauscher pro Sitzung.
  // Laeuft schon eine Ernte (z. B. Kiste), wartet der zweite Aufruf (Setzen) mit.
  let laufend = null;
  function hole(grund) {
    if (laufend) return laufend;
    laufend = (async () => {
      try {
        const s = await ernte();
        melde('integrity-ernte', { ergebnis: s ? 'ok' : 'fehlgeschlagen', grund });
        if (s) store.setzen(s, jetzt());
        return s;
      } finally {
        laufend = null;
      }
    })();
    return laufend;
  }

  return async function mitIntegrity(fn) {
    let satz = store.holen(jetzt());
    if (!satz) {
      satz = await hole('kein Satz im Speicher');
      if (!satz) return KEIN_SATZ;
    }
    try {
      return await fn(kopfAus(satz));
    } catch (e) {
      if (!e.integrity) throw e;
      store.verwerfen();
      const neu = await hole('Satz abgelehnt, zweiter Versuch');
      if (!neu) return KEIN_SATZ;
      return await fn(kopfAus(neu));
    }
  };
}

module.exports = { createIntegrityAufruf };
