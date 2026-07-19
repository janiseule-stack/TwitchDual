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
const $optFont = document.getElementById('opt-font');
const $optFontVal = document.getElementById('opt-font-val');

let emoteMap = {};
let badgeCatalog = {};
// Third-Party-Badges pro User: userId -> [{url,title}] (fertig) | true (laeuft).
// Badge erscheint ab der Nachricht, zu der der Lookup fertig ist.
let userBadgeCache = new Map();
let ircSocket = null;
let vod = null; // VodReplay-Instanz

// ---------------------------------------------------------------------------
// Gemeinsames Rendering
// ---------------------------------------------------------------------------
// autoScroll = "am unteren Rand kleben". AUSschalten darf das nur eine
// explizite Nutzer-Eingabe nach oben (Mausrad, Tasten, Scrollbar-Ziehen).
// Scroll-Events schalten hoechstens wieder EIN (unten angekommen) - denn
// Chromium feuert auch selbst Scroll-Events (Scroll-Anchoring/Clamping bei
// nachladenden Bildern und DOM-Trim), und jede Messung darauf kippte das
// Kleben grundlos aus -> "Chat bleibt stehen" in Emote-Chats.
// Solange autoScroll an ist, scrollt JEDE neue Nachricht ans Ende; das
// repariert Bild-Drift von selbst.
let autoScroll = true;
let scrollbarDrag = false;

// Einblende-Drossel: ueber ANIM_MAX_RATE Nachrichten/s keine Animation mehr.
const msgRate = ChatUi.createRateMeter({ windowMs: 1000 });

// Nachrichten pro Minute fuers Footer-Display (Monospace-Detail).
const $rate = document.getElementById('rate');
const minuteRate = ChatUi.createRateMeter({ windowMs: 60000 });
let rateShown = -1;
function tickRateDisplay(now) {
  const n = minuteRate.tick(now);
  if (n !== rateShown) {
    rateShown = n;
    $rate.textContent = n + ' msg/min';
    // Glow waechst mit der Rate (rein aus ChatUi.rateHeat, 0..1).
    $rate.style.setProperty('--rate-glow', (6 + ChatUi.rateHeat(n) * 12) + 'px');
  }
}

// Puls-Punkt kurz aufblitzen (Animation via Reflow neu starten).
function pingRate() {
  $rate.classList.remove('ping');
  void $rate.offsetWidth;
  $rate.classList.add('ping');
}

function nearBottom() {
  return $messages.scrollHeight - $messages.scrollTop - $messages.clientHeight < 40;
}

function scrollToBottom() {
  $messages.scrollTop = $messages.scrollHeight;
}

// Nutzer will nach oben (nur relevant, wenn es ueberhaupt Overflow gibt).
function userScrollsUp() {
  if ($messages.scrollHeight > $messages.clientHeight) autoScroll = false;
}

$messages.addEventListener('wheel', (e) => {
  if (e.deltaY < 0) userScrollsUp();
}, { passive: true });

window.addEventListener('keydown', (e) => {
  if (e.key === 'PageUp' || e.key === 'ArrowUp' || e.key === 'Home') userScrollsUp();
});

// Scrollbar gepackt? Klick rechts der Inhaltsflaeche (clientWidth ist ohne
// Scrollbar) - waehrend des Ziehens entscheiden die Scroll-Events.
$messages.addEventListener('mousedown', (e) => {
  if (e.offsetX >= $messages.clientWidth) scrollbarDrag = true;
});
window.addEventListener('mouseup', () => { scrollbarDrag = false; });

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

// Scroll-Events: beim Scrollbar-Ziehen nach oben ausschalten, ansonsten
// hoechstens wieder einschalten, wenn der Nutzer unten angekommen ist.
$messages.addEventListener('scroll', () => {
  if (scrollbarDrag && !nearBottom()) autoScroll = false;
  if (nearBottom()) {
    autoScroll = true;
    updateNewMsgsButton(); // wieder unten -> Button weg
  }
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
  scrollToBottom();
  trimMessages();
}

// Ein Emote-Bild XSS-sicher anhaengen (7TV liefert url, natives Twitch die id).
function appendEmote(parent, name, url) {
  const img = document.createElement('img');
  img.className = 'emote';
  img.src = url;
  img.alt = name; // kein title: der eigene Tooltip uebernimmt (sonst doppelt)
  img.loading = 'lazy';
  parent.appendChild(img);
}

// Ein aufgeloestes Badge anhaengen: Bild oder Kuerzel-Chip (Fallback).
function appendBadge(parent, b) {
  if (b.url) {
    const img = document.createElement('img');
    img.className = 'badge';
    img.src = b.url;
    img.alt = b.title;
    img.title = b.title;
    img.loading = 'lazy';
    parent.appendChild(img);
  } else {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = b.fallback;
    chip.style.background = b.color;
    chip.title = b.title;
    parent.appendChild(chip);
  }
}

// name: string, color: string|null,
// tokens: [{type:'text',value}|{type:'emote',name,id|url}] – aus
// IrcParse.emoteTokens (live) bzw. VodReplayCore.fragmentsToTokens (VOD).
// opts: { replay?, timeSeconds?, badges?: [{set,version}], months?, userId? }
function appendMessage(name, color, tokens, opts = {}) {
  const div = document.createElement('div');
  div.className = 'msg' + (opts.replay ? ' replay' : '');

  if (opts.timeSeconds != null) {
    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = formatTime(opts.timeSeconds);
    div.appendChild(ts);
  }

  // Badges: Katalog-Aufloesung (DOM-frei getestet in ../lib/badges.js).
  // Wirft nie; leerer Katalog -> Kuerzel-Chips wie frueher.
  for (const b of Badges.resolve(opts.badges, badgeCatalog, { months: opts.months })) {
    appendBadge(div, b);
  }
  // Third-Party (7TV/BTTV/FFZ) aus dem Session-Cache; erster Treffer eines
  // Users stoesst den Lookup an, gerendert wird ab der naechsten Nachricht.
  if (opts.userId) {
    const cached = userBadgeCache.get(opts.userId);
    if (Array.isArray(cached)) {
      for (const b of cached) appendBadge(div, b);
    } else if (!cached) {
      userBadgeCache.set(opts.userId, true);
      window.twitchDual.fetchUserBadges(opts.userId)
        .then((r) => userBadgeCache.set(opts.userId, (r && r.badges) || []))
        .catch(() => userBadgeCache.set(opts.userId, []));
    }
  }

  const user = document.createElement('span');
  user.className = 'user';
  user.textContent = name;
  user.style.color = color || '#bf94ff';
  user.title = 'Klick: User-Info';
  user.addEventListener('click', (e) => openUserCard(e, name, color || '#bf94ff', div));
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

  // Einblende-Animation nur in ruhigen Chats; Seek-Bursts im VOD treiben
  // die Rate sofort ueber die Schwelle -> Animation ist dann automatisch aus.
  const rateNow = Date.now();
  const busy = msgRate.tick(rateNow) > ChatUi.ANIM_MAX_RATE;
  $messages.classList.toggle('no-anim', busy);
  tickRateDisplay(rateNow);
  // Diskreter Blitz nur in ruhigen Chats; bei Mega-Chats/Seeks bleibt es beim
  // stetigen Glow (kein Flackern) — gleiche Schwelle wie die Einblende-Drossel.
  if (!busy) pingRate();

  $messages.appendChild(div);
  // Nutzer-Absicht (autoScroll) statt Pixel-Messung: nearBottom() pro
  // Nachricht kippte um, sobald nachladende Emote-Bilder das Layout
  // verschoben hatten -> Chat blieb dauerhaft stehen (Mega-Chats).
  if (autoScroll) {
    scrollToBottom();
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
// Emote-Tooltip: EIN wiederverwendetes fixed-Overlay, Delegation auf
// #messages (kein Listener pro Emote - wichtig bei Mega-Chats).
// ---------------------------------------------------------------------------
const $emoteTip = document.getElementById('emote-tip');
const $emoteTipImg = document.getElementById('emote-tip-img');
const $emoteTipName = document.getElementById('emote-tip-name');
const $emoteTipSrc = document.getElementById('emote-tip-src');

function showEmoteTip(img) {
  $emoteTipImg.src = img.src;
  $emoteTipName.textContent = img.alt;
  $emoteTipSrc.textContent = ChatUi.emoteProvider(img.src);
  $emoteTip.classList.remove('hidden');
  // Erst einblenden, dann messen - sonst sind offsetWidth/Height 0.
  const r = img.getBoundingClientRect();
  const w = $emoteTip.offsetWidth, h = $emoteTip.offsetHeight;
  const left = Math.min(Math.max(4, r.left + r.width / 2 - w / 2), window.innerWidth - w - 4);
  let top = r.top - h - 6;
  if (top < 4) top = r.bottom + 6; // oben kein Platz -> unter das Emote
  $emoteTip.style.left = left + 'px';
  $emoteTip.style.top = top + 'px';
}

function hideEmoteTip() { $emoteTip.classList.add('hidden'); }

$messages.addEventListener('mouseover', (e) => {
  if (e.target.classList && e.target.classList.contains('emote')) showEmoteTip(e.target);
});
$messages.addEventListener('mouseout', (e) => {
  if (e.target.classList && e.target.classList.contains('emote')) hideEmoteTip();
});

// ---------------------------------------------------------------------------
// User-Karte: Klick auf einen Namen -> Name, Badges der Nachricht,
// Kopieren-Button und die letzten Nachrichten des Users aus dem DOM-Puffer.
// Kein eigenes Datenmodell: gesammelt wird beim Oeffnen aus den .msg-Knoten.
// ---------------------------------------------------------------------------
const $userCard = document.getElementById('user-card');
const $ucBadges = document.getElementById('uc-badges');
const $ucName = document.getElementById('uc-name');
const $ucCopy = document.getElementById('uc-copy');
const $ucMsgs = document.getElementById('uc-msgs');

// Nachrichtentext eines .msg-Knotens: alles nach dem ': '-Separator;
// Emote-Bilder zaehlen mit ihrem alt-Namen als Text.
function collectMsgText(msgDiv) {
  let text = '';
  let afterSep = false;
  for (const node of msgDiv.childNodes) {
    if (!afterSep) {
      if (node.classList && node.classList.contains('sep')) afterSep = true;
      continue;
    }
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    else if (node.classList && node.classList.contains('emote')) text += node.alt;
  }
  return text.trim();
}

function collectEntries() {
  const entries = [];
  for (const div of $messages.querySelectorAll('.msg:not(.system)')) {
    const u = div.querySelector('.user');
    if (u) entries.push({ name: u.textContent, text: collectMsgText(div) });
  }
  return entries;
}

function closeUserCard() { $userCard.classList.add('hidden'); }

function openUserCard(evt, name, color, msgDiv) {
  $ucName.textContent = name;
  $ucName.style.color = color;
  $ucBadges.innerHTML = '';
  for (const b of msgDiv.querySelectorAll('.badge, .chip')) {
    $ucBadges.appendChild(b.cloneNode(true));
  }
  $ucMsgs.innerHTML = '';
  const history = ChatUi.lastMessagesOf(collectEntries(), name, 5);
  if (!history.length) {
    const d = document.createElement('div');
    d.className = 'empty-hint';
    d.textContent = 'keine weiteren Nachrichten im Puffer';
    $ucMsgs.appendChild(d);
  }
  for (const t of history) {
    const d = document.createElement('div');
    d.className = 'uc-msg';
    d.textContent = t;
    $ucMsgs.appendChild(d);
  }
  $userCard.classList.remove('hidden');
  // Nahe am Klick positionieren, im Fenster clampen (erst zeigen, dann messen).
  const w = $userCard.offsetWidth, h = $userCard.offsetHeight;
  const left = Math.min(Math.max(4, evt.clientX - 20), window.innerWidth - w - 4);
  const top = Math.min(evt.clientY + 10, window.innerHeight - h - 4);
  $userCard.style.left = left + 'px';
  $userCard.style.top = top + 'px';
}

$ucCopy.addEventListener('click', () => {
  navigator.clipboard && navigator.clipboard.writeText($ucName.textContent).catch(() => {});
});

// Schliessen: Klick ausserhalb (mousedown, damit auch Scrollbar-Klicks zaehlen)
// oder Esc. Klick auf einen anderen Namen oeffnet direkt die neue Karte.
document.addEventListener('mousedown', (e) => {
  if ($userCard.classList.contains('hidden')) return;
  if ($userCard.contains(e.target)) return;
  if (e.target.classList && e.target.classList.contains('user')) return;
  closeUserCard();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeUserCard();
});

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
  setConn('verbinde …', 'connecting');
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
          badges: Badges.parseBadgeTag(msg.tags),
          months: Badges.subMonths(msg.tags),
          userId: msg.tags['user-id'] || null
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
      { replay: true, timeSeconds: c.offset, badges: c.badges, userId: c.userId }
    ),
    onClear: () => { $messages.innerHTML = ''; $messages.classList.add('no-anim'); },
    onError: (msg) => setConn('VOD-Fehler: ' + msg, 'err')
  });
}

// ---------------------------------------------------------------------------
// Steuerung: auf 'load' und 'player-time' reagieren
// ---------------------------------------------------------------------------
// Zuletzt geladene Quelle - fuer den Wiederaufbau, wenn der Nutzer aus dem
// Home-Menue OHNE Neuwahl zur laufenden Quelle zurueckkehrt (home-close).
let currentPayload = null;

function applySource(payload) {
  currentPayload = payload;
  onAirMode = payload.mode;
  onAirPlayerState = null;
  updateOnAir();
  emoteMap = payload.emotes || {};
  badgeCatalog = payload.badgeCatalog || {};
  userBadgeCache = new Map(); // neue Quelle -> Cache der alten verwerfen
  $messages.innerHTML = '';
  hideEmoteTip();
  closeUserCard();
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
    $mode.textContent = `${emoteCount} 7TV-Emotes`;
    connectIrc(payload.channel);
  } else {
    $title.textContent = payload.displayName || ('VOD ' + payload.videoId);
    $mode.textContent = `${emoteCount} 7TV-Emotes`;
    setConn('warte auf Player-Zeit …', 'connecting');
    vod = createVodReplay(payload);
  }

  chatMode = payload.mode; updateComposerState();
}
window.twitchDual.onLoad(applySource);

// Player-Zustand aus dem Video-Fenster (fuer die Statuszeile im Replay).
let playerState = 'playing';
window.twitchDual.onPlayerState((state) => {
  playerState = state;
  onAirPlayerState = state;
  updateOnAir();
  if (!vod) return;
  if (state === 'paused') setConn('⏸ Replay pausiert');
  else if (state === 'ended') setConn('Replay-Ende', 'ok');
});

// Nutzer geht zurueck ins Home-Menue -> laufende Quelle trennen, sonst laeuft
// der Chat der alten Quelle im Hintergrund weiter.
window.twitchDual.onHomeOpen(() => {
  vod = null;
  ircChannel = null;
  closeIrc();
  onAirMode = null;
  onAirPlayerState = null;
  updateOnAir();
  setConn('nicht verbunden');
  $mode.textContent = '';
  $title.textContent = 'Chat';

  chatMode = null; updateComposerState();
});

// Nutzer schliesst Home zurueck zur laufenden Quelle -> Chat wieder aufbauen.
// currentPayload bleibt ueber home-open erhalten; ohne Quelle passiert nichts.
window.twitchDual.onHomeClose(() => {
  if (currentPayload) applySource(currentPayload);
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
let chatPrefs = { showTimestamps: true, showBadges: true, fontSize: ChatUi.FONT_DEFAULT };

function applyChatPrefs() {
  $messages.classList.toggle('hide-ts', !chatPrefs.showTimestamps);
  $messages.classList.toggle('hide-badges', !chatPrefs.showBadges);
  $optTs.checked = !!chatPrefs.showTimestamps;
  $optBadges.checked = !!chatPrefs.showBadges;
  // Schriftgroesse: kaputte Store-Werte werden geclampt (11-22, Default 14).
  const px = ChatUi.clampFontSize(chatPrefs.fontSize);
  $messages.style.setProperty('--chat-font-size', px + 'px');
  $optFont.value = String(px);
  $optFontVal.textContent = px + ' px';
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

// Slider: live anwenden beim Ziehen, speichern erst beim Loslassen
// (sonst ein Store-Write pro Pixel).
$optFont.addEventListener('input', () => {
  chatPrefs.fontSize = ChatUi.clampFontSize($optFont.value);
  applyChatPrefs();
});
$optFont.addEventListener('change', () => window.twitchDual.saveChatPrefs(chatPrefs));

// ---------------------------------------------------------------------------
// Randloses Fenster: Titelleisten-Buttons + Doppelklick auf die Kopfzeile.
// ---------------------------------------------------------------------------
document.getElementById('win-min').addEventListener('click', () => window.twitchDual.windowControl('minimize'));
document.getElementById('win-max').addEventListener('click', () => window.twitchDual.windowControl('maximize'));
document.getElementById('win-close').addEventListener('click', () => window.twitchDual.windowControl('close'));
// Doppelklick auf die Kopfzeile (nicht auf Buttons) maximiert.
document.getElementById('head').addEventListener('dblclick', (e) => {
  if (!e.target.closest('button')) window.twitchDual.windowControl('maximize');
});

// ---------------------------------------------------------------------------
// Neon Dual - On Air (v1.5.0): Fensterfarbe (Chat = chatAccent) als CSS-
// Variablen; On-Air-Leiste haengt an load-Modus + player-state.
// ---------------------------------------------------------------------------
const $colorVideo = document.getElementById('opt-color-video');
const $colorChat = document.getElementById('opt-color-chat');
const $colorReset = document.getElementById('opt-color-reset');
const $alphaChat = document.getElementById('opt-alpha-chat');
const $alphaChatVal = document.getElementById('opt-alpha-chat-val');
const $presets = document.getElementById('opt-presets');

let themePrefs = { ...ThemeLib.DEFAULTS };

// Preset-Chips (Zwei-Ton: Video-Farbe ↖ / Chat-Farbe ↘) einmalig rendern.
// Klick uebernimmt beide Akzente wie der Reset-Button; Deckkraft bleibt.
if ($presets) {
  for (const p of ThemeLib.PRESETS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'preset-chip';
    chip.dataset.id = p.id;
    chip.title = p.name;
    chip.setAttribute('aria-label', p.name);
    chip.style.setProperty('--pv', p.videoAccent);
    chip.style.setProperty('--pc', p.chatAccent);
    chip.addEventListener('click', () => {
      window.twitchDual.saveThemePrefs({
        videoAccent: p.videoAccent,
        chatAccent: p.chatAccent,
        chatAlpha: ThemeLib.clampAlpha(themePrefs.chatAlpha)
      });
    });
    $presets.appendChild(chip);
  }
}

function applyTheme(prefs) {
  themePrefs = { ...ThemeLib.DEFAULTS, ...(prefs || {}) };
  const vars = ThemeLib.accentVars(themePrefs.chatAccent, themePrefs.chatAlpha);
  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(k, v);
  }
  document.documentElement.style.setProperty('--onair-from',
    ThemeLib.normalizeHex(themePrefs.videoAccent, ThemeLib.DEFAULTS.videoAccent));
  document.documentElement.style.setProperty('--onair-to',
    ThemeLib.normalizeHex(themePrefs.chatAccent, ThemeLib.DEFAULTS.chatAccent));
  // Farbwaehler im ⚙-Popup spiegeln den aktiven Zustand.
  if ($colorVideo) $colorVideo.value = ThemeLib.normalizeHex(themePrefs.videoAccent, ThemeLib.DEFAULTS.videoAccent);
  if ($colorChat) $colorChat.value = ThemeLib.normalizeHex(themePrefs.chatAccent, ThemeLib.DEFAULTS.chatAccent);
  // Deckkraft-Slider + %-Anzeige spiegeln den aktiven Zustand (nur Chat).
  const ca = ThemeLib.clampAlpha(themePrefs.chatAlpha);
  if ($alphaChat) $alphaChat.value = ca;
  if ($alphaChatVal) $alphaChatVal.textContent = ca + '%';
  // Aktiven Preset-Chip markieren (oder keinen, wenn Farben von Hand geaendert).
  if ($presets) {
    const active = ThemeLib.activePreset(themePrefs);
    for (const chip of $presets.children) {
      chip.classList.toggle('active', !!active && chip.dataset.id === active.id);
    }
  }
}

window.twitchDual.getUiPrefs()
  .then((prefs) => applyTheme(prefs && prefs.themePrefs))
  .catch(() => applyTheme(null)); // Defaults, App startet nie ohne Farben
window.twitchDual.onThemeChanged(applyTheme);

// input = Live-Vorschau in BEIDEN Fenstern (Broadcast ohne Store-Write),
// change = speichern. Muster wie beim Schriftgroessen-Slider.
function currentPickerPrefs() {
  return {
    videoAccent: $colorVideo.value,
    chatAccent: $colorChat.value,
    chatAlpha: ThemeLib.clampAlpha($alphaChat ? $alphaChat.value : themePrefs.chatAlpha)
  };
}
for (const el of [$colorVideo, $colorChat]) {
  el.addEventListener('input', () => window.twitchDual.previewThemePrefs(currentPickerPrefs()));
  el.addEventListener('change', () => window.twitchDual.saveThemePrefs(currentPickerPrefs()));
}
$alphaChat.addEventListener('input', () => {
  // %-Anzeige sofort, Live-Vorschau ins Chat-Fenster (kein Store-Write).
  $alphaChatVal.textContent = ThemeLib.clampAlpha($alphaChat.value) + '%';
  window.twitchDual.previewThemePrefs(currentPickerPrefs());
});
$alphaChat.addEventListener('change', () => window.twitchDual.saveThemePrefs(currentPickerPrefs()));
$colorReset.addEventListener('click', () => {
  window.twitchDual.saveThemePrefs({ ...ThemeLib.DEFAULTS });
});

// On Air: live + spielt. Bis zum ersten 'playing' nach einem Load gilt
// gedimmt - nie faelschlich on air (Spec Fehlerfaelle).
let onAirMode = null;        // 'live' | 'vod' | null (aus dem load-Broadcast)
let onAirPlayerState = null; // letzter player-state nach dem Load

function updateOnAir() {
  const label = ThemeLib.onAirLabel(onAirMode, onAirPlayerState);
  document.body.classList.toggle('onair', label !== null);
  const el = document.getElementById('oa-label');
  if (el) el.textContent = label ? ('● ' + label) : '';
}

// ---------------------------------------------------------------------------
// Senden (v1.8.0): Eingabefeld ist nur eingeloggt + im Live-Modus aktiv.
// chatLoggedIn/chatMode/updateComposerState/showChatError sind Modul-Zustand
// fuer Task 10 (Emote-Picker) und Task 11 (Sende-Fehler/Room-Status).
// ---------------------------------------------------------------------------
const $composerInput = document.getElementById('chat-input');
const $composerSend = document.getElementById('chat-send');
const $emoteBtn = document.getElementById('emote-btn');
const $chatError = document.getElementById('chat-error');

let chatLoggedIn = false;
let chatMode = null; // 'live' | 'vod' | null

function updateComposerState() {
  const canChat = chatLoggedIn && chatMode === 'live';
  $composerInput.disabled = !canChat;
  $composerSend.disabled = !canChat;
  $emoteBtn.disabled = !canChat;
  $composerInput.placeholder = !chatLoggedIn ? 'Zum Chatten anmelden'
    : chatMode !== 'live' ? 'Chatten nur im Live-Modus'
    : 'Nachricht senden …';
}

async function doSend() {
  const text = $composerInput.value.trim();
  if (!text) return;
  $composerInput.value = '';
  const r = await window.twitchDual.chatSend(text);
  if (!r.ok) showChatError(r.error);
}

function showChatError(text) {
  $chatError.textContent = text;
  $chatError.classList.remove('hidden');
  clearTimeout(showChatError._t);
  showChatError._t = setTimeout(() => $chatError.classList.add('hidden'), 4000);
}

$composerSend.addEventListener('click', doSend);
$composerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });

window.twitchDual.authStatus().then((st) => { chatLoggedIn = !!(st && st.loggedIn); updateComposerState(); }).catch(() => {});
window.twitchDual.onAuthChanged((st) => { chatLoggedIn = !!(st && st.loggedIn); updateComposerState(); });

// --- Emote-Picker -----------------------------------------------------------
const $emotePanel = document.getElementById('emote-panel');
const $epChannel = document.getElementById('ep-channel');
const $epUser = document.getElementById('ep-user');
let userEmotesLoaded = false;

function insertEmote(code) {
  const el = $composerInput;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const pad = (start > 0 && el.value[start - 1] !== ' ') ? ' ' : '';
  el.value = el.value.slice(0, start) + pad + code + ' ' + el.value.slice(end);
  el.focus();
}

function fillEmoteGrid(container, entries) {
  container.innerHTML = '';
  for (const e of entries) {
    const img = document.createElement('img');
    img.className = 'ep-emote';
    img.src = e.url;
    img.alt = e.name;
    img.title = e.name;
    img.loading = 'lazy';
    img.addEventListener('click', () => insertEmote(e.name));
    container.appendChild(img);
  }
}

async function openEmotePanel() {
  // Channel-Emotes aus der bereits geladenen emoteMap (name -> url).
  fillEmoteGrid($epChannel, Object.entries(emoteMap).map(([name, url]) => ({ name, url })).slice(0, 200));
  if (!userEmotesLoaded) {
    const res = await window.twitchDual.getUserEmotes();
    if (res.ok) fillEmoteGrid($epUser, res.emotes);
    userEmotesLoaded = true;
  }
  $emotePanel.classList.remove('hidden');
}

$emoteBtn.addEventListener('click', () => {
  if ($emotePanel.classList.contains('hidden')) openEmotePanel();
  else $emotePanel.classList.add('hidden');
});
// Klick außerhalb schließt das Panel.
document.addEventListener('mousedown', (e) => {
  if ($emotePanel.classList.contains('hidden')) return;
  if ($emotePanel.contains(e.target) || e.target === $emoteBtn) return;
  $emotePanel.classList.add('hidden');
});
