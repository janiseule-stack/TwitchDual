// Video-Fenster: Twitch-Player-Embed + Zeit-Broadcast fuer Chat-Replay.

const $channel = document.getElementById('channel');
const $load = document.getElementById('load');
const $status = document.getElementById('status');
const $player = document.getElementById('player');
const $hint = document.getElementById('hint');

let player = null;
let timeTimer = null;

function setStatus(text) {
  $status.textContent = text;
}

// Player (neu) erzeugen. options: {channel} | {video}
function mountPlayer(options) {
  if ($hint) $hint.style.display = 'none';
  // Alten Player entfernen.
  if (player) {
    try { player = null; } catch (e) {}
  }
  $player.innerHTML = '';

  if (typeof Twitch === 'undefined' || !Twitch.Player) {
    setStatus('Twitch-Embed nicht geladen (Internet?)');
    return;
  }

  const base = {
    width: '100%',
    height: '100%',
    // WICHTIG: Embeds brauchen einen parent, der zum Hostname passt.
    // Wir liefern die Seite von http://localhost aus -> "localhost".
    parent: ['localhost'],
    autoplay: true
  };

  player = new Twitch.Player($player, { ...base, ...options });

  player.addEventListener(Twitch.Player.READY, () => {
    setStatus(options.channel ? `live: ${options.channel}` : `VOD: ${options.video}`);
  });
  player.addEventListener(Twitch.Player.PLAYING, () => {
    startTimeBroadcast();
  });

  startTimeBroadcast();
}

// Aktuelle Abspielzeit regelmaessig ans Chat-Fenster melden (fuer VOD-Replay).
function startTimeBroadcast() {
  if (timeTimer) return;
  timeTimer = setInterval(() => {
    if (!player || typeof player.getCurrentTime !== 'function') return;
    try {
      const t = player.getCurrentTime();
      if (typeof t === 'number' && !Number.isNaN(t)) {
        window.twitchDual.sendPlayerTime(t);
      }
    } catch (e) {
      // Bei Live liefert getCurrentTime evtl. nichts -> ignorieren.
    }
  }, 500);
}

async function doLoad() {
  const raw = $channel.value.trim();
  if (!raw) return;
  $load.disabled = true;
  setStatus('lade …');
  try {
    const res = await window.twitchDual.submitLoad(raw);
    if (!res.ok) {
      setStatus('Fehler: ' + res.error);
    }
    // Bei Erfolg reagiert dieses Fenster ueber onLoad (unten).
  } catch (e) {
    setStatus('Fehler: ' + (e.message || e));
  } finally {
    $load.disabled = false;
  }
}

$load.addEventListener('click', doLoad);
$channel.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLoad();
});

// Broadcast von Main: beide Fenster laden denselben Channel/VOD.
window.twitchDual.onLoad((payload) => {
  $channel.value = payload.mode === 'vod'
    ? (payload.videoId || '')
    : (payload.channel || '');
  if (payload.mode === 'vod') {
    mountPlayer({ video: payload.videoId });
  } else {
    mountPlayer({ channel: payload.channel });
  }
});
