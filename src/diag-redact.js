// src/diag-redact.js
// Schwaerzt Zugangsdaten aus Protokollzeilen. Bewusst eine eigene Datei: das
// ist der Teil, der bei einem Fehler wirklich schadet, und er gehoert isoliert
// gegen echte Beispiele geprueft (test/diag-redact.test.js).
//
// LEHRE AUS DEM PUBSUB-SPIKE (2026-08-12): dort stand Janis' Token im Klartext
// im Protokoll, weil die Schwaerzung nur 'auth_token' und 'OAuth ' kannte -
// Hermes nutzt "token", IRC "PASS oauth:" klein geschrieben. Die Lehre war
// nicht "mehr Muster raten", sondern dass zusaetzlich ein STRUKTURELLES Netz
// noetig ist. Jedes benannte Muster unten stammt aus einem Rahmen, den diese
// App nachweislich verschickt; die Quelle steht jeweils dahinter.

// Twitchs OAuth-Token ist durchgaengig 30 Zeichen [a-z0-9]. Die Wortgrenzen
// sind Absicht: sie treffen NUR Laeufe von exakt 30 Zeichen. Ein 64-stelliger
// Persisted-Query-Hash (src/twitch-gql.js:25) und 26-stellige 7TV-ULIDs
// bleiben damit unangetastet, Kanal-Logins (hoechstens 25 Zeichen, main.js:658)
// und numerische VOD-IDs ebenso.
const AUFFANGNETZ = /\b[a-z0-9]{30}\b/g;

function schwaerze(text) {
  if (text === null || text === undefined) return '';
  let s = String(text);

  // Zuerst die Kopfzeilen, die als GANZES weg muessen: in einem Cookie-Kopf
  // steht mehr als nur der Token. Ab dem Doppelpunkt bis zum Zeilenende.
  s = s.replace(/\b(Set-Cookie|Cookie)\s*:[^\n]*/gi, '$1: ***');

  // Web-Cookie. ACHTUNG: es heisst wirklich 'auth-token' mit Bindestrich
  // (src/twitch-web-auth.js:12) - der Unterstrich ist die alte
  // PubSub-Schreibweise. Beide abdecken, genau solche Luecken haben geleckt.
  s = s.replace(/(["']?auth[-_]token["']?\s*[=:]\s*["']?)[^"'&;,\s}]+/gi, '$1***');

  // Hermes-Anmelderahmen: {"authenticate":{"token":"<Web-Token>"}}
  // (gemessen im Spike, docs/TODO.md:270).
  s = s.replace(/(["']token["']\s*:\s*["'])[^"']*/gi, '$1***');

  // GQL-Authorization (src/twitch-points.js:54).
  s = s.replace(/(OAuth\s+)[A-Za-z0-9._-]+/gi, '$1***');

  // IRC-Anmeldung, klein geschrieben (src/chat-send.js:72).
  s = s.replace(/(PASS\s+oauth:)[A-Za-z0-9._-]+/gi, '$1***');

  // Kisten-Claim (main.js:442). Der Integrity-Satz ist ein JWT - laenger als
  // 30 Zeichen und mit Punkten, das Auffangnetz greift dort nicht.
  s = s.replace(/(Client-Integrity["']?\s*[:=]\s*["']?)[A-Za-z0-9._-]+/gi, '$1***');

  // Zuletzt das strukturelle Netz - es faengt den Token auch in einem Rahmen,
  // den wir heute nicht kennen.
  s = s.replace(AUFFANGNETZ, '***');

  return s;
}

module.exports = { schwaerze };
