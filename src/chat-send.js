// src/chat-send.js
// Authentifizierter IRC-Sende-Socket im Main-Prozess. Haelt EINE Verbindung
// mit dem eingeloggten Nutzer, joint den aktuell geladenen (Live-)Channel und
// sendet PRIVMSG. Eingehende NOTICE/ROOMSTATE werden ausgewertet und ueber
// Callbacks ans Chat-Fenster gemeldet. Reine Logik liegt in chat-send-core.js.

const { formatPrivmsg, RateLimiter, noticeText, parseRoomstate } = require('./chat-send-core');
const IrcParse = require('../renderer/lib/irc');

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';

class ChatSender {
  // WebSocketImpl-Default: Electron-Main laeuft unter Node 20 (Electron 33),
  // das noch KEIN globales WebSocket kennt (erst ab Node 21). Fallback auf
  // die 'ws'-Package-Implementierung. `require('ws')` wird nur ausgewertet,
  // wenn kein globales WebSocket existiert UND kein Impl injiziert wurde —
  // Tests, die einen Mock injizieren, sind davon nicht betroffen.
  constructor({ WebSocketImpl = globalThis.WebSocket || require('ws'), onNotice = () => {}, onRoom = () => {}, onStatus = () => {} } = {}) {
    this.WebSocketImpl = WebSocketImpl;
    this.onNotice = onNotice;
    this.onRoom = onRoom;
    this.onStatus = onStatus;
    this.ws = null;
    this.creds = null;      // { login, accessToken }
    this.channel = null;    // aktueller Live-Channel (lowercase, ohne #)
    this.ready = false;
    this.limiter = new RateLimiter(20, 30000);
  }

  login({ login, accessToken }) {
    this.creds = { login: String(login).toLowerCase(), accessToken };
    if (this.channel) this._connect();
  }

  logout() {
    this.creds = null;
    this._close();
  }

  setChannel(channel) {
    const chan = channel ? String(channel).toLowerCase().replace(/^#/, '') : null;
    if (chan === this.channel) return;
    // alten Channel verlassen
    if (this.ws && this.ready && this.channel) {
      try { this.ws.send('PART #' + this.channel); } catch {}
    }
    this.channel = chan;
    if (!chan) { this._close(); return; }
    if (!this.creds) return;                 // nicht eingeloggt -> nichts tun
    if (this.ready) { try { this.ws.send('JOIN #' + chan); } catch {} }
    else this._connect();
  }

  send(text) {
    if (!this.creds) return { ok: false, error: 'Nicht angemeldet.' };
    if (!this.channel) return { ok: false, error: 'Kein Live-Channel geladen.' };
    if (!this.ready || !this.ws) return { ok: false, error: 'Chat verbindet noch …' };
    if (!this.limiter.tryAcquire()) return { ok: false, error: 'Zu schnell — kurz warten.' };
    try { this.ws.send(formatPrivmsg(this.channel, text)); return { ok: true }; }
    catch (e) { return { ok: false, error: 'Senden fehlgeschlagen.' }; }
  }

  _connect() {
    this._close();
    if (!this.creds || !this.channel) return;
    const ws = new this.WebSocketImpl(IRC_URL);
    this.ws = ws;
    this.ready = false;

    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS oauth:' + this.creds.accessToken);
      ws.send('NICK ' + this.creds.login);
    };
    ws.onmessage = (evt) => this._onData(String(evt.data));
    ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.ready = false; } };
    ws.onerror = () => this.onStatus('error');
  }

  _onData(data) {
    for (const line of data.split('\r\n')) {
      if (!line) continue;
      if (line.startsWith('PING')) { try { this.ws.send('PONG :tmi.twitch.tv'); } catch {} continue; }
      const msg = IrcParse.parseIrc(line);
      if (msg.command === '001') {            // Login akzeptiert -> Channel joinen
        this.ready = true;
        this.onStatus('ready');
        if (this.channel) { try { this.ws.send('JOIN #' + this.channel); } catch {} }
      } else if (msg.command === 'NOTICE') {
        const id = msg.tags && msg.tags['msg-id'];
        this.onNotice({ text: noticeText(id, IrcParse.privmsgText(msg.params)), id: id || null });
      } else if (msg.command === 'ROOMSTATE') {
        this.onRoom(parseRoomstate(msg.tags || {}));
      }
    }
  }

  _close() {
    if (this.ws) { const ws = this.ws; this.ws = null; this.ready = false; try { ws.close(); } catch {} }
  }
}

module.exports = { ChatSender };
