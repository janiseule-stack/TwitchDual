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
  // Nur ein dezenter Hinweis - NICHT stummschalten. vaft ersetzt die Werbung
  // bereits durch Inhalt; ein Zwangs-Mute strandete den Ton, wenn das (fragil
  // per console.log-Heuristik erkannte) Werbe-Ende ausblieb -> "Ton weg" bis der
  // 120-s-Watchdog griff. Overlay bleibt als reines, nicht-deckendes Feedback.
  $adOverlay.classList.toggle('hidden', !adState.overlayVisible);
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
// Default-Lautstaerke 15 % (0..1), falls noch nichts gemerkt ist; ein
// gespeicherter Wert (prefs.playerPrefs) ueberschreibt das beim Start.
let playerPrefs = { volume: 0.15, quality: null };
// Der Twitch-Embed durchlaeuft beim Autoplay-Start eine Mute-Sequenz und setzt
// die Lautstaerke dabei kurz auf seinen Default (100%). Bis der Stream wirklich
// laeuft, NICHT persistieren (sonst ueberschreiben diese Uebergangswerte den
// gemerkten Wert) und den gewuenschten Wert auf PLAYING erneut setzen.
let volumeReady = false;

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
  // Alten Player-Verweis freigeben; das iframe raeumt gleich innerHTML='' weg.
  player = null;
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

  volumeReady = false; // neuer Player -> Lautstaerke erst nach dem Einpendeln merken
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
    // Jetzt laeuft der Stream wirklich: gewuenschte Lautstaerke (erneut) setzen,
    // dann kurz danach das Merken freigeben (echte Nutzeraenderungen ab hier).
    if (!volumeReady) {
      try { if (playerPrefs.volume != null) player.setVolume(playerPrefs.volume); } catch (e) {}
      setTimeout(() => { volumeReady = true; }, 500);
    }
    startTimeBroadcast();
    window.twitchDual.sendPlayerState('playing');
    onAirPlayerState = 'playing'; updateOnAir();
  });
  player.addEventListener(Twitch.Player.PAUSE, () => {
    window.twitchDual.sendPlayerState('paused');
    onAirPlayerState = 'paused'; updateOnAir();
  });
  player.addEventListener(Twitch.Player.PLAY, () => {
    window.twitchDual.sendPlayerState('playing');
    onAirPlayerState = 'playing'; updateOnAir();
  });
  player.addEventListener(Twitch.Player.ENDED, () => {
    window.twitchDual.sendPlayerState('ended');
    onAirPlayerState = 'ended'; updateOnAir();
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
      // Lautstaerke/Qualitaet beobachten und Aenderungen persistieren - aber
      // erst, wenn der Player eingependelt ist (sonst speichern die Start-
      // Uebergangswerte den 100%-Default des Embeds ueber den gemerkten Wert).
      if (volumeReady) {
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
  onAirMode = payload.mode;
  onAirPlayerState = null;
  updateOnAir();
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

// ---------------------------------------------------------------------------
// Randloses Fenster: Titelleisten-Buttons + Doppelklick auf die Leiste.
// ---------------------------------------------------------------------------
document.getElementById('win-min').addEventListener('click', () => window.twitchDual.windowControl('minimize'));
document.getElementById('win-max').addEventListener('click', () => window.twitchDual.windowControl('maximize'));
document.getElementById('win-close').addEventListener('click', () => window.twitchDual.windowControl('close'));
// Doppelklick nur auf die freie Leiste (nicht Eingabefeld/Buttons) maximiert.
document.getElementById('bar').addEventListener('dblclick', (e) => {
  if (e.target.id === 'bar') window.twitchDual.windowControl('maximize');
});

// ---------------------------------------------------------------------------
// Nur-Video-Modus: Leiste/Rahmen weg, Fenster auf 16:9 (keine Balken). Kein
// Tastenkuerzel (stoert beim Zocken) - Umschalt-Button + schwebender
// Verlassen-Button, der bei Mausruhe ausblendet.
// ---------------------------------------------------------------------------
const $videoExit = document.getElementById('video-exit');
let controlsHideTimer = null;

function enterVideoOnly() {
  if (document.body.classList.contains('video-only')) return;
  document.body.classList.add('video-only');
  window.twitchDual.windowControl('video-only-on');
  showControlsBriefly();
}
function leaveVideoOnly() {
  if (!document.body.classList.contains('video-only')) return;
  document.body.classList.remove('video-only', 'controls-active');
  clearTimeout(controlsHideTimer);
  window.twitchDual.windowControl('video-only-off');
}
// Verlassen-Button zeigen und nach 2,5 s Ruhe wieder ausblenden.
function showControlsBriefly() {
  if (!document.body.classList.contains('video-only')) return;
  document.body.classList.add('controls-active');
  clearTimeout(controlsHideTimer);
  controlsHideTimer = setTimeout(() => document.body.classList.remove('controls-active'), 2500);
}

document.getElementById('video-only-btn').addEventListener('click', enterVideoOnly);
$videoExit.addEventListener('click', leaveVideoOnly);
// Doppelklick auf die Videoflaeche verlaesst den Modus ebenfalls.
document.getElementById('player').addEventListener('dblclick', () => {
  if (document.body.classList.contains('video-only')) leaveVideoOnly();
});
// Mausbewegung im Modus holt den Verlassen-Button kurz zurueck.
document.addEventListener('mousemove', showControlsBriefly);

// ---------------------------------------------------------------------------
// Neon Dual - On Air (v1.5.0): Fensterfarbe (Video = videoAccent) als CSS-
// Variablen; On-Air-Leiste haengt an load-Modus + eigenem Player-Zustand.
// ---------------------------------------------------------------------------
function applyTheme(prefs) {
  const t = { ...ThemeLib.DEFAULTS, ...(prefs || {}) };
  const vars = ThemeLib.accentVars(t.videoAccent); // Video-Fenster ist opak (kein Alpha)
  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(k, v);
  }
  document.documentElement.style.setProperty('--onair-from',
    ThemeLib.normalizeHex(t.videoAccent, ThemeLib.DEFAULTS.videoAccent));
  document.documentElement.style.setProperty('--onair-to',
    ThemeLib.normalizeHex(t.chatAccent, ThemeLib.DEFAULTS.chatAccent));
}

window.twitchDual.getUiPrefs()
  .then((prefs) => {
    applyTheme(prefs && prefs.themePrefs);
    const v = document.getElementById('home-version');
    if (v && prefs && prefs.appVersion) v.textContent = 'v' + prefs.appVersion;
  })
  .catch(() => applyTheme(null));
window.twitchDual.onThemeChanged(applyTheme);

let onAirMode = null;
let onAirPlayerState = null;
function updateOnAir() {
  const label = ThemeLib.onAirLabel(onAirMode, onAirPlayerState);
  document.body.classList.toggle('onair', label !== null);
  const el = document.getElementById('oa-label');
  if (el) el.textContent = label ? ('● ' + label) : '';
}
