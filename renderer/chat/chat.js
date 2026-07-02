// Chat-Fenster: LIVE (Twitch-IRC anonym) + VOD-Replay (GraphQL-Kommentare),
// jeweils mit 7TV-Emote-Ersetzung.

const $messages = document.getElementById('messages');
const $mode = document.getElementById('mode');
const $conn = document.getElementById('conn');
const $title = document.getElementById('title');
const $newMsgs = document.getElementById('new-msgs');
const $settingsBtn = document.getElementById('settings-btn');
const $settingsPop = document.getElementById('settings-pop');
const $optTs = document.getElementById('opt-ts');
const $optBadges = document.getElementById('opt-badges');

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

// Zaehler fuer Nachrichten, die unterhalb des Sichtbereichs aufgelaufen sind,
// waehrend der Nutzer hochgescrollt ist.
let pendingNew = 0;

function updateNewMsgsButton() {
  if (pendingNew > 0 && !autoScroll) {
    $newMsgs.textContent = `↓ ${pendingNew} neue Nachricht${pendingNew === 1 ? '' : 'en'}`;
    $newMsgs.classList.remove('hidden');
  } else {
    pendingNew = 0;
    $newMsgs.classList.add('hidden');
  }
}

$newMsgs.addEventListener('click', () => {
  autoScroll = true;
  scrollToBottom();
  pendingNew = 0;
  updateNewMsgsButton();
});

// Beim Scrollen entscheiden, ob wir weiter kleben. Scrollt der Nutzer hoch zum
// Lesen -> autoScroll aus; scrollt er zurueck nach unten -> wieder an.
$messages.addEventListener('scroll', () => {
  autoScroll = nearBottom();
  if (autoScroll) updateNewMsgsButton(); // wieder unten -> Button weg
});

function trimMessages(max = 300) {
  // Nur kuerzen, solange wir unten kleben. Sonst wuerde das Loeschen oben dem
  // Lesenden (nach oben gescrollt) die Position wegziehen.
  // Unabhaengig davon beschneidet VodReplayCore.trim() seinen Datenpuffer
  // (KEEP_BEHIND) - hier geht es nur um DOM-Knoten, dort um Speicher.
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

// Bekannte IRC-Badges -> kompakte farbige Kuerzel.
const KNOWN_BADGES = {
  broadcaster: ['B', '#eb0400'],
  moderator: ['M', '#00ad03'],
  vip: ['V', '#e005b9'],
  subscriber: ['S', '#9147ff']
};

// Ein Emote-Bild XSS-sicher anhaengen (7TV liefert url, natives Twitch die id).
function appendEmote(parent, name, url) {
  const img = document.createElement('img');
  img.className = 'emote';
  img.src = url;
  img.alt = name;
  img.title = name;
  img.loading = 'lazy';
  parent.appendChild(img);
}

// name: string, color: string|null,
// tokens: [{type:'text',value}|{type:'emote',name,id|url}] – aus
// IrcParse.emoteTokens (live) bzw. VodReplayCore.fragmentsToTokens (VOD).
// opts: { replay?: bool, timeSeconds?: number, badges?: string[] }
function appendMessage(name, color, tokens, opts = {}) {
  const stick = nearBottom();
  const div = document.createElement('div');
  div.className = 'msg' + (opts.replay ? ' replay' : '');

  if (opts.timeSeconds != null) {
    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = formatTime(opts.timeSeconds);
    div.appendChild(ts);
  }

  for (const b of opts.badges || []) {
    const def = KNOWN_BADGES[b];
    if (!def) continue;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = def[0];
    chip.style.background = def[1];
    chip.title = b;
    div.appendChild(chip);
  }

  const user = document.createElement('span');
  user.className = 'user';
  user.textContent = name;
  user.style.color = color || '#bf94ff';
  user.title = 'Klick: Name kopieren';
  user.addEventListener('click', () => {
    navigator.clipboard && navigator.clipboard.writeText(name).catch(() => {});
  });
  div.appendChild(user);

  const sep = document.createElement('span');
  sep.className = 'sep';
  sep.textContent = ': ';
  div.appendChild(sep);

  // Tokens -> sichere DOM-Knoten (kein innerHTML == kein XSS). Text-Tokens
  // laufen zusaetzlich durch die 7TV-Ersetzung; native Twitch-Emote-Tokens
  // (id statt url) werden direkt via twitchEmoteUrl gerendert.
  for (const tok of tokens || []) {
    if (tok.type === 'emote') {
      appendEmote(div, tok.name, tok.url || EmoteText.twitchEmoteUrl(tok.id));
    } else {
      for (const sub of EmoteText.tokenize(tok.value, emoteMap)) {
        if (sub.type === 'emote') appendEmote(div, sub.name, sub.url);
        else div.appendChild(document.createTextNode(sub.value));
      }
    }
  }

  $messages.appendChild(div);
  if (stick) {
    $messages.scrollTop = $messages.scrollHeight;
  } else {
    pendingNew++;
    updateNewMsgsButton();
  }
  trimMessages();
}

function setConn(text, cls) {
  $conn.textContent = text;
  $conn.className = cls || '';
}

// ---------------------------------------------------------------------------
// LIVE: Twitch IRC (anonym, nur lesend)
// ---------------------------------------------------------------------------
// Zeilen-Parsing + Badge-Extraktion: ../lib/irc.js (IrcParse, unit-getestet).

// Reconnect-Zustand: Kanal, den wir halten wollen, + Versuchszaehler.
// closeIrc() setzt ircSocket auf null, BEVOR es schliesst -> in onclose
// unterscheidet `ircSocket !== ws` gewollte von ungewollten Trennungen.
let ircChannel = null;
let ircAttempts = 0;
let ircReconnectTimer = null;

function scheduleIrcReconnect() {
  if (!ircChannel || ircReconnectTimer) return;
  const wait = Backoff.delay(ircAttempts++);
  setConn(`getrennt – neuer Versuch in ${Math.round(wait / 1000)}s …`, 'err');
  ircReconnectTimer = setTimeout(() => {
    ircReconnectTimer = null;
    if (ircChannel) connectIrc(ircChannel);
  }, wait);
}

function connectIrc(channel) {
  closeIrc();
  ircChannel = channel;
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
      const msg = IrcParse.parseIrc(line);
      if (msg.command === 'PRIVMSG') {
        const text = IrcParse.privmsgText(msg.params);
        const name = msg.tags['display-name'] ||
          (msg.prefix.split('!')[0]) || 'anon';
        const color = msg.tags['color'] || null;
        appendMessage(name, color, IrcParse.emoteTokens(text, msg.tags['emotes']), {
          badges: IrcParse.badgeTypes(msg.tags)
        });
      } else if (msg.command === '366') {
        ircAttempts = 0; // erfolgreich im Channel -> Backoff zuruecksetzen
        setConn('verbunden ✓', 'ok');
      } else if (msg.command === 'RECONNECT') {
        // Twitch bittet um Neuverbindung (Server-Wartung).
        try { ws.close(); } catch (e) {}
      } else if (msg.command === 'NOTICE') {
        appendSystem(msg.params);
      }
    }
  };

  ws.onclose = () => {
    if (ircSocket !== ws) return; // gewollt geschlossen/ersetzt
    ircSocket = null;
    scheduleIrcReconnect();
  };
  ws.onerror = () => setConn('IRC-Fehler', 'err'); // onclose folgt -> Reconnect dort
}

function closeIrc() {
  if (ircReconnectTimer) {
    clearTimeout(ircReconnectTimer);
    ircReconnectTimer = null;
  }
  if (ircSocket) {
    const ws = ircSocket;
    ircSocket = null; // vor close(): markiert die Trennung als gewollt
    try { ws.close(); } catch (e) {}
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
    lengthSeconds: payload.lengthSeconds || 0,
    fetchPage: (videoId, offsetSeconds) =>
      window.twitchDual.fetchVodComments({ videoId, offsetSeconds }),
    onMessage: (c) => appendMessage(
      c.name, c.color, VodReplayCore.fragmentsToTokens(c.fragments),
      { replay: true, timeSeconds: c.offset, badges: c.badges }
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
  autoScroll = true; // neue Quelle -> wieder unten kleben
  pendingNew = 0;
  updateNewMsgsButton();
  ircChannel = null; // kein Reconnect mehr auf die alte Quelle
  ircAttempts = 0;
  closeIrc();
  vod = null;
  playerState = 'playing';

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

// Player-Zustand aus dem Video-Fenster (fuer die Statuszeile im Replay).
let playerState = 'playing';
window.twitchDual.onPlayerState((state) => {
  playerState = state;
  if (!vod) return;
  if (state === 'paused') setConn('⏸ Replay pausiert');
  else if (state === 'ended') setConn('Replay-Ende', 'ok');
});

window.twitchDual.onPlayerTime((seconds) => {
  if (vod) {
    if (playerState === 'playing') setConn('Replay @ ' + formatTime(seconds), 'ok');
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

// ---------------------------------------------------------------------------
// ⚙ Chat-Einstellungen: wirken als CSS-Klassen sofort, ueberleben per Store.
// ---------------------------------------------------------------------------
let chatPrefs = { showTimestamps: true, showBadges: true };

function applyChatPrefs() {
  $messages.classList.toggle('hide-ts', !chatPrefs.showTimestamps);
  $messages.classList.toggle('hide-badges', !chatPrefs.showBadges);
  $optTs.checked = !!chatPrefs.showTimestamps;
  $optBadges.checked = !!chatPrefs.showBadges;
}

window.twitchDual.getUiPrefs().then((prefs) => {
  chatPrefs = { ...chatPrefs, ...((prefs && prefs.chatPrefs) || {}) };
  applyChatPrefs();
}).catch(() => {}); // Prefs sind Komfort - ohne sie gelten die Defaults

$settingsBtn.addEventListener('click', () => {
  $settingsPop.classList.toggle('hidden');
});

for (const [el, key] of [[$optTs, 'showTimestamps'], [$optBadges, 'showBadges']]) {
  el.addEventListener('change', () => {
    chatPrefs[key] = el.checked;
    applyChatPrefs();
    window.twitchDual.saveChatPrefs(chatPrefs);
  });
}
