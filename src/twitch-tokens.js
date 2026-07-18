// src/twitch-tokens.js
// Verschluesselter Speicher fuers Twitch-Token-Buendel. Crypto ist injizierbar
// (Produktion: Electron safeStorage), damit die Datei-/JSON-Logik ohne Electron
// testbar ist. Die verschluesselten Bytes werden base64-kodiert als Textdatei
// abgelegt.

const realFs = require('fs');

class TokenStore {
  constructor(filePath, crypto, fsImpl = realFs) {
    this.filePath = filePath;
    this.crypto = crypto;
    this.fs = fsImpl;
  }

  available() {
    try { return !!this.crypto.isAvailable(); } catch { return false; }
  }

  save(bundle) {
    const json = JSON.stringify(bundle);
    const enc = this.crypto.encrypt(json);            // Buffer|string
    const b64 = Buffer.isBuffer(enc) ? enc.toString('base64') : String(enc);
    this.fs.writeFileSync(this.filePath, b64, 'utf8');
  }

  load() {
    let b64;
    try { b64 = this.fs.readFileSync(this.filePath, 'utf8'); }
    catch { return null; }                            // keine Datei -> nicht eingeloggt
    try {
      const dec = this.crypto.decrypt(Buffer.from(b64, 'base64'));
      return JSON.parse(dec);
    } catch { return null; }                          // korrupt -> wie ausgeloggt
  }

  clear() {
    try { this.fs.unlinkSync(this.filePath); } catch { /* schon weg */ }
  }
}

module.exports = { TokenStore };
