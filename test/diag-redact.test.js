const { test } = require('node:test');
const assert = require('node:assert');
const { schwaerze } = require('../src/diag-redact');

// Die Rahmen unten sind NICHT erfunden. Jeder stammt aus einer Stelle, die
// diese App wirklich verschickt - Quelle jeweils im Kommentar. Beim
// PubSub-Spike (2026-08-12) stand Janis' Token im Klartext im Protokoll, weil
// die Schwaerzung gegen geratene Rahmen gebaut war und die echten (Hermes
// "token", IRC "PASS oauth:" klein) nicht kannte.

// Ein echt geformter Twitch-Token: 30 Zeichen [a-z0-9].
const TOKEN = 'k9x2p7mq4wz8vn3jb6hy5td1rc0slf';

test('Web-Cookie mit Bindestrich (so heisst es wirklich)', () => {
  // src/twitch-web-auth.js:12 - das Cookie heisst 'auth-token', nicht 'auth_token'.
  const roh = 'auth-token=' + TOKEN + '; unique_id=abc; Path=/';
  const s = schwaerze(roh);
  assert.ok(!s.includes(TOKEN), 'Token steht noch drin: ' + s);
  assert.ok(s.includes('auth-token=***'));
});

test('Web-Cookie mit Unterstrich (alte PubSub-Schreibweise)', () => {
  const s = schwaerze('{"auth_token":"' + TOKEN + '"}');
  assert.ok(!s.includes(TOKEN));
  assert.ok(s.includes('***'));
});

test('GQL-Authorization', () => {
  // src/twitch-points.js:54
  const s = schwaerze('{"Authorization":"OAuth ' + TOKEN + '","Client-ID":"kimne78kx3ncx6brgo4mv6wki5h1ko"}');
  assert.ok(!s.includes(TOKEN));
  assert.ok(s.includes('OAuth ***'));
});

test('Hermes-Anmelderahmen (docs/TODO.md:270)', () => {
  // Genau die Form, die im Spike gemessen wurde.
  const rahmen = '{"id":"n1","type":"authenticate","authenticate":{"token":"' +
    TOKEN + '"},"timestamp":"2026-08-12T18:04:11.000Z"}';
  const s = schwaerze(rahmen);
  assert.ok(!s.includes(TOKEN), 'Hermes-Token steht noch drin: ' + s);
  assert.ok(s.includes('"token":"***"'));
  // Der Rest des Rahmens bleibt lesbar - sonst ist das Protokoll wertlos.
  assert.ok(s.includes('"type":"authenticate"'));
});

test('IRC-Anmeldung, klein geschrieben (src/chat-send.js:72)', () => {
  const s = schwaerze('PASS oauth:' + TOKEN);
  assert.ok(!s.includes(TOKEN));
  assert.equal(s, 'PASS oauth:***');
});

test('Client-Integrity (main.js:442)', () => {
  // Echter Integrity-Satz: ein JWT, nicht 30 Zeichen - der Auffang greift hier
  // NICHT, deshalb braucht es das eigene Muster.
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3NTUxMDAwMDB9.Qk1sVGhpc0lzTm90UmVhbA';
  const s = schwaerze('Client-Integrity: ' + jwt);
  assert.ok(!s.includes(jwt), 'Integrity-Token steht noch drin: ' + s);
  assert.ok(s.includes('Client-Integrity: ***'));
});

test('Cookie-Kopfzeilen werden komplett unkenntlich', () => {
  const a = schwaerze('Cookie: auth-token=' + TOKEN + '; unique_id=xyz');
  const b = schwaerze('Set-Cookie: auth-token=' + TOKEN + '; Secure; HttpOnly');
  assert.ok(!a.includes(TOKEN) && !a.includes('unique_id'));
  assert.ok(!b.includes(TOKEN) && !b.includes('HttpOnly'));
});

test('Auffangnetz: freistehender Token in einem unbekannten Rahmen', () => {
  // Der eigentliche Zweck: ein Rahmen, den wir HEUTE nicht kennen.
  const s = schwaerze('{"irgendwas":{"geheim":"' + TOKEN + '"}}');
  assert.ok(!s.includes(TOKEN), 'Auffangnetz hat nicht gegriffen: ' + s);
});

test('mehrere Treffer in einer Zeile werden alle ersetzt', () => {
  const zwei = 'a2b4c6d8e0f2g4h6j8k0m2n4p6q8r0';
  const s = schwaerze('OAuth ' + TOKEN + ' und PASS oauth:' + zwei);
  assert.ok(!s.includes(TOKEN) && !s.includes(zwei), s);
});

// --- Gegenprobe: ein zu gieriges Netz ist genauso wertlos wie ein leckendes ---

test('Gegenprobe: deutscher Fliesstext bleibt unveraendert', () => {
  const text = 'Kanalwechsel waehrend laufender Abfrage - Basislinie vergessen, ' +
    'der naechste Takt meldet sonst den vollen Kontostand als Zuwachs.';
  assert.equal(schwaerze(text), text);
});

test('Gegenprobe: Kanal-Logins bleiben unveraendert', () => {
  // Twitch-Logins sind hoechstens 25 Zeichen (main.js:658) - nie 30.
  const zeile = 'punkte:kanalwechsel {"von":"tolkin","nach":"papaplatte","lang":"abcdefghijklmnopqrstuvwxy"}';
  assert.equal(schwaerze(zeile), zeile);
});

test('Gegenprobe: 7TV-ULID bleibt unveraendert', () => {
  // 26-stellige Grossbuchstaben-ULID, echtes Beispiel aus renderer/chat/index.html:56.
  const zeile = 'chat:emote 01FHPG3BCR00093JSPCMYFBG0E';
  assert.equal(schwaerze(zeile), zeile);
});

test('Gegenprobe: VOD-ID bleibt unveraendert', () => {
  const zeile = 'chat:vod-luecke {"videoId":"2467910019","von":120,"bis":150}';
  assert.equal(schwaerze(zeile), zeile);
});

test('Gegenprobe: 64-stelliger Persisted-Query-Hash bleibt unveraendert', () => {
  // src/twitch-gql.js:25 - laenger als 30, also kein Token. Die Wortgrenzen im
  // Auffangnetz sorgen dafuer, dass er nicht mittendrin zerschnitten wird.
  const hash = 'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a';
  assert.equal(schwaerze('gql:hash ' + hash), 'gql:hash ' + hash);
});

test('nimmt alles entgegen und wirft nie', () => {
  assert.equal(schwaerze(undefined), '');
  assert.equal(schwaerze(null), '');
  assert.equal(schwaerze(42), '42');
});
