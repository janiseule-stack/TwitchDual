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
// Die Kernlogik (Offset-Paginierung, Dedupe, Puffer) lebt DOM-frei in
// ../lib/vod-replay.js (VodReplayCore) und ist dort unit-getestet. Hier
// werden nur die DOM-Callbacks und der IPC-Fetch eingehaengt.
function createVodReplay(payload) {
  return new VodReplayCore({
    videoId: payload.videoId,
    fetchPage: (videoId, offsetSeconds) =>
      window.twitchDual.fetchVodComments({ videoId, offsetSeconds }),
    onMessage: (c) => appendMessage(
      c.name, c.color, VodReplayCore.fragmentsToText(c.fragments), { replay: true }
    ),
    onClear: () => { $messages.innerHTML = ''; },
    onError: (msg) => setConn('VOD-Fehler: ' + msg, 'err')
  });
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
    vod = createVodReplay(payload);
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
