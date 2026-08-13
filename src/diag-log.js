// src/diag-log.js
// Ringpuffer + Datei-Protokoll fuer den Diagnose-Schalter.
//
// Die entscheidende Eigenschaft: der Puffer laeuft IMMER mit, unabhaengig vom
// Schalter. Wird eingeschaltet, landet er als Vorgeschichte in der Datei. Ein
// Schalter, den man erst nach dem Symptom umlegt, haette bei keinem der
// letzten drei Fehler geholfen ("Ton weg nach Werbung" trat alle paar Tage
// einmal auf).
//
// Dateizugriff kommt von aussen (schreiben/groesse/umlegen) - das Modul kennt
// kein fs und ist damit unit-testbar wie points-state.js.

const { schwaerze } = require('./diag-redact');

function createDiagLog({
  schreiben,
  groesse,
  umlegen,
  jetzt = Date.now,
  maxPuffer = 10000,
  maxBytes = 10 * 1024 * 1024
} = {}) {
  // Gespeichert werden nur fertige Textzeilen, kein Objektgeflecht: bei ~150
  // Byte je Zeile sind 10000 Zeilen rund 1,5 MB - in einer Electron-App nicht
  // messbar.
  const puffer = [];
  let aktiv = false;

  // JSON.stringify kann werfen (zirkulaer, BigInt) und undefined liefern
  // (Funktion, undefined). Beides faellt auf String(detail) zurueck.
  function detailText(detail) {
    if (detail === undefined) return '';
    try {
      const s = JSON.stringify(detail);
      return ' ' + (s === undefined ? String(detail) : s);
    } catch {
      return ' ' + String(detail);
    }
  }

  // Geschwaerzt wird beim EINTRITT, nicht beim Schreiben. Damit gilt die
  // Zusicherung "im Diagnose-System existiert nichts Ungeschwaerztes" auch
  // fuer den Ringpuffer im Speicher.
  function baueZeile(bereich, ereignis, detail) {
    const stempel = new Date(jetzt()).toISOString();
    return schwaerze(`[${stempel}] ${bereich}:${ereignis}${detailText(detail)}`);
  }

  // Ein Block, ein Schreibvorgang. Wirft nie: eine nicht schreibbare Datei
  // (Rechte, Platte voll) darf die App nicht stoeren.
  function schreibeBlock(block) {
    try {
      let gross = 0;
      try { gross = groesse ? groesse() : 0; } catch { gross = 0; }
      if (gross > maxBytes) {
        // Schlaegt das Umlegen fehl, wird weitergeschrieben und die Datei
        // waechst ueber die Grenze - besser als Protokollverlust.
        try { umlegen(); } catch { /* siehe Kommentar */ }
      }
      schreiben(block);
    } catch { /* Protokollieren wirft nie */ }
  }

  return {
    melde(bereich, ereignis, detail) {
      try {
        const zeile = baueZeile(bereich, ereignis, detail);
        puffer.push(zeile);
        // Wanderndes Fenster: der Puffer ist nie "voll" im Sinne von
        // Aufhoeren, er haelt immer die LETZTEN maxPuffer Ereignisse.
        if (puffer.length > maxPuffer) puffer.splice(0, puffer.length - maxPuffer);
        if (aktiv) schreibeBlock(zeile + '\n');
      } catch { /* Protokollieren wirft nie */ }
    },

    setAktiv(an) {
      const neu = !!an;
      if (neu === aktiv) return;   // zweites setAktiv(true) schreibt nichts erneut
      aktiv = neu;
      if (!aktiv) return;          // aus: Schreiben stoppt, der Puffer laeuft weiter
      try {
        const kopf = schwaerze(
          `[${new Date(jetzt()).toISOString()}] app:diagnose-an ` +
          `{"vorgeschichte":${puffer.length}}`);
        // EIN Schreibvorgang. Bei 10000 einzelnen synchronen Anhaengen friert
        // die App beim Umlegen des Schalters sichtbar ein.
        schreibeBlock([kopf, ...puffer].join('\n') + '\n');
      } catch { /* Protokollieren wirft nie */ }
    },

    istAktiv() { return aktiv; },

    // Kopie, damit ein Aufrufer den Ringpuffer nicht von aussen umbauen kann.
    puffer() { return puffer.slice(); }
  };
}

module.exports = createDiagLog;
