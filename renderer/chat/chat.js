// Chat-Fenster: LIVE (Twitch-IRC anonym) + VOD-Replay (GraphQL-Kommentare),
// jeweils mit 7TV-Emote-Ersetzung.

const $messages = document.getElementById('messages');
const $mode = document.getElementById('mode');
const $conn = document.getElementById('conn');
const $title = document.getElementById('title');

let emoteMap = {};
let ircSocket = null;
let vod = null; // VodReplay-Instanz

// ---------------------------------------------------------------------------
// Gemeinsames Rendering
// ---------------------------------------------------------------------------
// autoScroll = "am unteren Rand kleben". Wird NUR durch echtes Nutzer-Scrollen
// geaendert, nicht durch asynchrones Nachwachsen (Emote-Bilder laden verzoegert
// und verschieben das Layout -> deshalb kein nearBottom() pro Nachricht raten).
let autoScroll = true;

function nearBottom() {
  return $messages.scrollHeight - $messages.scrollTop - $messages.clientHeight < 40;
}

function scrollToBottom() {
  $messages.scrollTop = $messages.scrollHeight;
}

// Beim Scrollen entscheiden, ob wir weiter kleben. Scrollt der Nutzer hoch zum
// Lesen -> autoScroll aus; scrollt er zurueck nach unten -> wieder an.
$messages.addEventListener('scroll', () => {
  autoScroll = nearBottom();
});

function trimMessages(max = 300) {
  // Nur kuerzen, solange wir unten kleben. Sonst wuerde das Loeschen oben dem
  // Lesenden (nach oben gescrollt) die Position wegziehen.
  if (!autoScroll) return;
  while ($messages.childElementCount > max) {
    $messages.removeChild($messages.firstChild);
  }
}

function appendSystem(text) {
  const div = document.createElement('div');
  div.className = 'msg system';
  div.textContent = text;
  $messages.appendChild(div);
  $messages.scrollTop = $messages.scrollHeight;
  trimMessages();
}

// name: string, color: string|null, text: string, opts:{replay?:bool}
function appendMessage(name, color, text, opts = {}) {
  const stick = nearBottom();
  const div = document.createElement('div');
  div.className = 'msg' + (opts.replay ? ' replay' : '');

  const user = document.createElement('span');
  user.className = 'user';
  user.textContent = name;
  user.style.color = color || '#bf94ff';
  div.appendChild(user);

  const sep = document.createElement('span');
  sep.className = 'sep';
  sep.textContent = ': ';
  div.appendChild(sep);

  // Text -> Tokens -> sichere DOM-Knoten (kein innerHTML == kein XSS).
  const tokens = EmoteText.tokenize(text, emoteMap);
  for (const tok of tokens) {
    if (tok.type === 'emote') {
      const img = document.createElement('img');
      img.className = 'emote';
      img.src = tok.url;
      img.alt = tok.name;
      img.title = tok.name;
      img.loading = 'lazy';
      div.appendChild(img);
    } else {
      div.appendChild(document.createTextNode(tok.value));
    }
  }

  $messages.appendChild(div);
  if (stick) $messages.scrollTop = $messages.scrollHeight;
  trimMessages();
}

// Fragmente aus der VOD-API koennen native Twitch-Emotes enthalten.
// Wir bauen daraus einen reinen Text und lassen 7TV danach ersetzen.
function fragmentsToText(fragments) {
  return fragments.map((f) => f.text).join('');
}

function setConn(text, cls) {
  $conn.textContent = text;
  $conn.className = cls || '';
}

// ---------------------------------------------------------------------------
// LIVE: Twitch IRC (anonym, nur lesend)
// ---------------------------------------------------------------------------
function parseIrc(line) {
  // Optionale @tags, dann Prefix, Command, Params.
  let rest = line;
  let tags = {};
  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ');
    const tagStr = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
    for (const pair of tagStr.split(';')) {
      const eq = pair.indexOf('=');
      tags[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }
  let prefix = '';
  if (rest.startsWith(':')) {
    const sp = rest.indexOf(' ');
    prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
  }
  const sp = rest.indexOf(' ');
  const command = sp === -1 ? rest : rest.slice(0, sp);
  const params = sp === -1 ? '' : rest.slice(sp + 1);
  return { tags, prefix, command, params };
}

function connectIrc(channel) {
  closeIrc();
  setConn('verbinde …');
  const nick = 'justinfan' + Math.floor(Math.random() * 90000 + 10000);
  const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
  ircSocket = ws;

  ws.onopen = () => {
    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
    ws.send('NICK ' + nick);
    ws.send('JOIN #' + channel);
  };

  ws.onmessage = (evt) => {
    const lines = evt.data.split('\r\n');
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith('PING')) {
        ws.send('PONG :tmi.twitch.tv');
        continue;
      }
      const msg = parseIrc(line);
      if (msg.command === 'PRIVMSG') {
        // params: "#channel :text"
        const idx = msg.params.indexOf(':');
        const text = idx === -1 ? '' : msg.params.slice(idx + 1);
        const name = msg.tags['display-name'] ||
          (msg.prefix.split('!')[0]) || 'anon';
        const color = msg.tags['color'] || null;
        appendMessage(name, color, text);
      } else if (msg.command === '366') {
        setConn('verbunden ✓', 'ok');
      } else if (msg.command === 'NOTICE') {
        appendSystem(msg.params);
      }
    }
  };

  ws.onclose = () => {
    if (ircSocket === ws) setConn('getrennt', 'err');
  };
  ws.onerror = () => setConn('IRC-Fehler', 'err');
}

function closeIrc() {
  if (ircSocket) {
    try { ircSocket.close(); } catch (e) {}
    ircSocket = null;
  }
}

// ---------------------------------------------------------------------------
// VOD: Chat-Replay ueber GraphQL-Kommentare, synchron zur Player-Zeit
// ---------------------------------------------------------------------------
// Twitch-VOD-Kommentare werden pro Anfrage als Fenster um einen Offset geliefert
// (ca. 50 Kommentare, das Fenster beginnt etwas VOR dem Offset). Wir blaettern
// deshalb per Offset vorwaerts und deduplizieren die ueberlappenden Fenster ueber
// die Kommentar-id. (Cursor-Paginierung ist serverseitig gesperrt, siehe
// src/twitch-api.js.)
const VOD_LOOKAHEAD = 30; // Sekunden Puffer, die wir vor der Abspielzeit vorhalten
const VOD_GAP_STEP = 30;  // Sprung, wenn ein Fenster keine neuen Kommentare bringt

class VodReplay {
  constructor(videoId) {
    this.videoId = videoId;
    this.buffer = [];        // sortiert nach offset, dedupliziert per id
    this.seen = new Set();   // bereits eingesammelte Kommentar-ids
    this.renderIndex = 0;    // naechster zu zeigender Kommentar
    this.coveredUntil = -1;  // bis zu diesem Offset haben wir Kommentare angefragt
    this.fetching = false;
    this.lastTime = null;
    this.initialized = false;
  }

  // Kommentare eines Fensters einsortieren (dedupe per id). Neue Kommentare haben
  // stets einen groesseren Offset als alles bereits Gezeigte, landen also hinten –
  // der Sort laesst den bereits gerenderten Bereich [0..renderIndex) unberuehrt.
  merge(comments) {
    let added = 0;
    for (const c of comments) {
      const key = c.id || `${c.offset}|${c.name}|${fragmentsToText(c.fragments)}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      this.buffer.push(c);
      added++;
    }
    if (added) this.buffer.sort((a, b) => a.offset - b.offset);
    return added;
  }

  // Ein Kommentarfenster ab `offset` laden und einsortieren.
  // Gibt zurueck, bis zu welchem Offset das Fenster reicht.
  async fetchAtOffset(offset) {
    this.fetching = true;
    const res = await window.twitchDual.fetchVodComments({
      videoId: this.videoId, offsetSeconds: offset
    });
    this.fetching = false;
    if (!res.ok) { setConn('VOD-Fehler: ' + res.error, 'err'); return offset; }
    this.merge(res.comments);
    const maxOff = res.comments.length
      ? res.comments[res.comments.length - 1].offset : offset;
    return Math.max(maxOff, offset);
  }

  // Puffer bis `t + VOD_LOOKAHEAD` auffuellen (ein Fenster pro Aufruf).
  async ensureCoverage(t) {
    if (this.fetching) return;
    if (this.coveredUntil >= t + VOD_LOOKAHEAD) return;
    const reqOffset = Math.max(this.coveredUntil, Math.floor(t));
    const reached = await this.fetchAtOffset(reqOffset);
    // Kein Fortschritt (Luecke ohne Kommentare) -> Fenster nach vorn schieben,
    // damit die Wiedergabe nicht an einer stillen Stelle haengen bleibt.
    this.coveredUntil = reached > reqOffset ? reached : reqOffset + VOD_GAP_STEP;
  }

  // Nach einem Sprung (Seek) komplett neu positionieren.
  async seekTo(t) {
    $messages.innerHTML = '';
    this.buffer = [];
    this.seen = new Set();
    this.renderIndex = 0;
    this.coveredUntil = -1;
    const start = Math.max(0, Math.floor(t));
    const reached = await this.fetchAtOffset(start);
    this.coveredUntil = Math.max(reached, start);
    // Etwas Kontext zeigen: die Kommentare bis t sofort einblenden.
    this.advance(t);
  }

  advance(t) {
    while (
      this.renderIndex < this.buffer.length &&
      this.buffer[this.renderIndex].offset <= t
    ) {
      const c = this.buffer[this.renderIndex];
      appendMessage(c.name, c.color, fragmentsToText(c.fragments), { replay: true });
      this.renderIndex++;
    }
  }

  async onTime(t) {
    if (!this.initialized) {
      this.initialized = true;
      this.lastTime = t;
      await this.seekTo(t);
      return;
    }
    // Sprung erkennen (vor/zurueck): >10s Differenz.
    if (Math.abs(t - this.lastTime) > 10) {
      this.lastTime = t;
      await this.seekTo(t);
      return;
    }
    this.lastTime = t;
    this.advance(t);
    await this.ensureCoverage(t);
  }
}

// ---------------------------------------------------------------------------
// Steuerung: auf 'load' und 'player-time' reagieren
// ---------------------------------------------------------------------------
window.twitchDual.onLoad((payload) => {
  emoteMap = payload.emotes || {};
  $messages.innerHTML = '';
  closeIrc();
  vod = null;

  const emoteCount = Object.keys(emoteMap).length;

  if (payload.mode === 'live') {
    $title.textContent = payload.displayName || payload.channel;
    $mode.textContent = `LIVE · ${emoteCount} 7TV-Emotes`;
    connectIrc(payload.channel);
  } else {
    $title.textContent = payload.displayName || ('VOD ' + payload.videoId);
    $mode.textContent = `VOD-Replay · ${emoteCount} 7TV-Emotes`;
    setConn('warte auf Player-Zeit …');
    vod = new VodReplay(payload.videoId);
  }
});

window.twitchDual.onPlayerTime((seconds) => {
  if (vod) {
    setConn('Replay @ ' + formatTime(seconds), 'ok');
    vod.onTime(seconds);
  }
});

function formatTime(s) {
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return (h ? h + ':' : '') + pad(m) + ':' + pad(sec);
}
