// Video-Fenster: Twitch-Player-Embed + Zeit-Broadcast fuer Chat-Replay.

const $channel = document.getElementById('channel');
const $load = document.getElementById('load');
const $status = document.getElementById('status');
const $player = document.getElementById('player');
const $hint = document.getElementById('hint');
const $history = document.getElementById('history');
const $adOverlay = document.getElementById('ad-overlay');
const adState = window.createAdOverlayState ? window.createAdOverlayState() : null;

function renderAdOverlay() {
  if (!adState || !$adOverlay) return;
  $adOverlay.classList.toggle('hidden', !adState.overlayVisible);
  if (!player) return;
  try {
    if (adState.shouldMute) {
      player.setMuted(true);
    } else {
      // Werbe-Ende: gemerkten Mute-Zustand wiederherstellen.
      player.setMuted(adState.restoreMuted);
    }
  } catch (e) {}
}

// Werbe-Status aus dem Player-iframe (via Main-Relay).
if (window.twitchDual.onAdblockState) {
  window.twitchDual.onAdblockState((payload) => {
    if (!adState) return;
    const phase = payload && payload.phase;
    if (phase === 'start') {
      let muted = false;
      try { muted = !!(player && player.getMuted && player.getMuted()); } catch (e) {}
      adState.adStart(muted);
    } else if (phase === 'end') {
      adState.adEnd();
    }
    renderAdOverlay();
  });
}

// Watchdog-Timer: raeumt Overlay/Mute auf, falls kein 'end' kommt.
setInterval(() => {
  if (!adState) return;
  const wasActive = adState.overlayVisible;
  adState.tick(Date.now());
  if (wasActive && !adState.overlayVisible) renderAdOverlay();
}, 1000);

let player = null;
let timeTimer = null;
let playerPrefs = { volume: null, quality: null }; // zuletzt gespeicherte Werte

function setStatus(text, isError = false) {
  $status.textContent = text;
  $status.className = isError ? 'err' : '';
}

// Verlauf (zuletzt geladene Quellen) in die Eingabe-Datalist spiegeln.
async function refreshHistory() {
  const prefs = await window.twitchDual.getUiPrefs();
  $history.innerHTML = '';
  for (const h of prefs.history || []) {
    const opt = document.createElement('option');
    opt.value = h.value;
    opt.label = h.label || h.value;
    $history.appendChild(opt);
  }
  return prefs;
}

// Player (neu) erzeugen. options: {channel} | {video}
function mountPlayer(options) {
  if ($hint) $hint.style.display = 'none';
  // Alten Player entfernen.
  if (player) {
    try { player = null; } catch (e) {}
  }
  $player.innerHTML = '';
  // innerHTML='' hat auch das Werbe-Overlay entfernt -> wieder einhaengen
  // (Referenz bleibt gueltig; z-index haelt es ueber dem Embed-iframe).
  if ($adOverlay) $player.appendChild($adOverlay);

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
    // Gemerkte Lautstaerke/Qualitaet wieder anwenden.
    try {
      if (playerPrefs.volume != null) player.setVolume(playerPrefs.volume);
      if (playerPrefs.quality) player.setQuality(playerPrefs.quality);
    } catch (e) {}
  });
  player.addEventListener(Twitch.Player.PLAYING, () => {
    startTimeBroadcast();
  });

  // Pause/Play/Ende an den Chat melden (Statusanzeige im VOD-Replay).
  player.addEventListener(Twitch.Player.PAUSE, () =>
    window.twitchDual.sendPlayerState('paused'));
  player.addEventListener(Twitch.Player.PLAY, () =>
    window.twitchDual.sendPlayerState('playing'));
  player.addEventListener(Twitch.Player.ENDED, () =>
    window.twitchDual.sendPlayerState('ended'));

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
      // Lautstaerke/Qualitaet beobachten und Aenderungen persistieren.
      const v = player.getVolume();
      const q = player.getQuality();
      const vChanged = typeof v === 'number' && v !== playerPrefs.volume;
      const qChanged = !!q && q !== playerPrefs.quality;
      if (vChanged || qChanged) {
        playerPrefs = {
          volume: typeof v === 'number' ? v : playerPrefs.volume,
          quality: q || playerPrefs.quality
        };
        window.twitchDual.savePlayerPrefs(playerPrefs);
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
  $load.textContent = 'lädt …';
  setStatus('lade …');
  try {
    const res = await window.twitchDual.submitLoad(raw);
    if (!res.ok) {
      setStatus('Fehler: ' + res.error, true);
    } else {
      refreshHistory(); // Verlauf hat einen neuen Eintrag
    }
    // Bei Erfolg reagiert dieses Fenster ueber onLoad (unten).
  } catch (e) {
    setStatus('Fehler: ' + (e.message || e), true);
  } finally {
    $load.disabled = false;
    $load.textContent = 'Laden';
  }
}

$load.addEventListener('click', doLoad);
$channel.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLoad();
});

// Tastenkuerzel: Ctrl+L fokussiert das Eingabefeld, Space togglet Play/Pause
// (nur ausserhalb von Eingabefeldern; greift nicht, wenn das Player-iframe
// selbst den Fokus hat - dann uebernimmt der Twitch-Player).
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    $channel.focus();
    $channel.select();
    return;
  }
  const t = e.target;
  const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  if (inField) return;
  if (e.key === ' ' && player) {
    e.preventDefault();
    try {
      if (player.isPaused()) player.play(); else player.pause();
    } catch (err) {}
  }
});

// Beim Start: Verlauf fuellen + letzte Quelle ins Feld vorschlagen
// (kein Autoplay - nur Prefill, Laden bleibt ein Klick).
refreshHistory().then((prefs) => {
  if (prefs.playerPrefs) playerPrefs = prefs.playerPrefs;
  if (prefs.lastSource && !$channel.value) $channel.value = prefs.lastSource;
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

// --- Adblock-Schalter -------------------------------------------------------
const $adblock = document.getElementById('adblock-toggle');

function renderAdblockBtn(enabled) {
  if (!$adblock) return;
  $adblock.classList.toggle('on', !!enabled);
  $adblock.textContent = enabled ? '🛡 Ads: an' : '🛡 Ads: aus';
}

if ($adblock) {
  window.twitchDual.getAdblockEnabled().then(renderAdblockBtn).catch(() => {});
  $adblock.addEventListener('click', async () => {
    try {
      const cur = await window.twitchDual.getAdblockEnabled();
      const res = await window.twitchDual.setAdblockEnabled(!cur);
      renderAdblockBtn(res.enabled);
      setStatus(res.enabled
        ? 'Werbe-Blocker an — beim nächsten Laden aktiv.'
        : 'Werbe-Blocker aus — beim nächsten Laden.');
    } catch (e) {}
  });
}
