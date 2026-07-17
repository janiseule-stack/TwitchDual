const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

const { startServer } = require('./src/server');
const { parseInput } = require('./src/parse-input');
const twitch = require('./src/twitch-api');
const browse = require('./src/twitch-browse');
const badgeSources = require('./src/badge-sources');
const BadgesLib = require('./renderer/lib/badges');
const ThemeLib = require('./renderer/lib/theme');

const store = new Store({
  defaults: {
    videoBounds: { width: 500, height: 900, x: undefined, y: undefined },
    chatBounds: { width: 420, height: 900, x: undefined, y: undefined },
    favorites: [],
    history: [],      // zuletzt geladene Quellen [{ value, mode, label }]
    lastSource: '',   // letzte Roheingabe (Prefill beim Start)
    playerPrefs: { volume: null, quality: null },
    chatPrefs: { showTimestamps: true, showBadges: true },
    adblockEnabled: true,
    themePrefs: { videoAccent: '#35e0ff', chatAccent: '#ff4fa3', videoAlpha: 100, chatAlpha: 100 }
  }
});

const HISTORY_MAX = 10;

// Erfolgreich geladene Quelle in den Verlauf aufnehmen (vorn, dedupliziert).
function pushHistory(entry) {
  const hist = store.get('history', [])
    .filter((h) => !(h.mode === entry.mode && h.value === entry.value));
  hist.unshift(entry);
  store.set('history', hist.slice(0, HISTORY_MAX));
}

let videoWin = null;
let chatWin = null;
let serverPort = 0;

function persistBounds(win, key) {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  store.set(key, b);
}

function createWindows() {
  const vb = store.get('videoBounds');
  const cb = store.get('chatBounds');

  videoWin = new BrowserWindow({
    ...vb,
    title: 'TwitchDual — Video',
    backgroundColor: '#00000000',
    transparent: true,
    frame: false, // randlos: die App-Leiste ist die Titelleiste (Buttons via window-control)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true
    }
  });

  chatWin = new BrowserWindow({
    ...cb,
    title: 'TwitchDual — Chat',
    backgroundColor: '#00000000',
    transparent: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  videoWin.loadURL(`http://localhost:${serverPort}/video/index.html`);
  chatWin.loadURL(`http://localhost:${serverPort}/chat/index.html`);

  // Fenster-Bounds bei jeder Aenderung merken.
  const save = () => {
    persistBounds(videoWin, 'videoBounds');
    persistBounds(chatWin, 'chatBounds');
  };
  for (const win of [videoWin, chatWin]) {
    win.on('resize', save);
    win.on('move', save);
  }

  videoWin.on('closed', () => {
    videoWin = null;
    if (chatWin && !chatWin.isDestroyed()) chatWin.close();
  });
  chatWin.on('closed', () => {
    chatWin = null;
  });
}

function broadcast(channel, payload) {
  for (const win of [videoWin, chatWin]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

// --- Badges: Kataloge pro Load, Third-Party pro User (Session-Cache) -------
// BTTV/FFZ liefern Gesamtlisten (userId -> Badges) einmal pro Load; 7TV wird
// pro User beim ersten Auftauchen nachgeschlagen. Negative Treffer werden
// mitgecacht. Alles fail-soft: ohne Badge-Daten laeuft der Chat normal.
let thirdPartyBadges = {};        // twitchUserId -> [{url, title}] (BTTV+FFZ)
const sevenTvCache = new Map();   // twitchUserId -> Promise<[{url, title}]>

async function loadBadgeData(channelId) {
  const [globalBadges, channelBadges, bttv, ffz] = await Promise.all([
    badgeSources.fetchGlobalBadges(),
    badgeSources.fetchChannelBadges(channelId),
    badgeSources.fetchBttvBadges(),
    badgeSources.fetchFfzBadges()
  ]);
  thirdPartyBadges = { ...bttv };
  for (const [id, list] of Object.entries(ffz)) {
    thirdPartyBadges[id] = (thirdPartyBadges[id] || []).concat(list);
  }
  return BadgesLib.buildCatalog(globalBadges, channelBadges);
}

// --- IPC: zentrale Lade-Logik ---------------------------------------------
// Das gemeinsame Eingabefeld (im Video-Fenster) schickt 'submit-load'.
// Wir parsen, loesen IDs + 7TV-Emotes auf und broadcasten 'load' an beide.
ipcMain.handle('submit-load', async (_evt, raw) => {
  const parsed = parseInput(raw);
  if (!parsed.mode) {
    return { ok: false, error: parsed.error || 'Ungueltige Eingabe' };
  }

  try {
    const globalEmotes = await twitch.fetch7tvGlobal();

    if (parsed.mode === 'live') {
      const user = await twitch.resolveUserId(parsed.value);
      const channelEmotes = await twitch.fetch7tvEmotes(user.id);
      const emotes = { ...globalEmotes, ...channelEmotes };
      const badgeCatalog = await loadBadgeData(user.id);
      const payload = {
        mode: 'live',
        channel: user.login,
        displayName: user.displayName,
        userId: user.id,
        emotes,
        badgeCatalog
      };
      broadcast('load', payload);
      pushHistory({ value: user.login, mode: 'live', label: user.displayName });
      store.set('lastSource', user.login);
      return { ok: true, ...payload, emoteCount: Object.keys(emotes).length };
    }

    // VOD
    let owner = { id: null, login: null, displayName: 'VOD', lengthSeconds: 0 };
    try {
      owner = await twitch.resolveVideoOwner(parsed.value);
    } catch (e) {
      // Owner-Aufloesung optional; ohne sie gibt es nur globale Emotes.
    }
    const channelEmotes = owner.id ? await twitch.fetch7tvEmotes(owner.id) : {};
    const emotes = { ...globalEmotes, ...channelEmotes };
    const badgeCatalog = await loadBadgeData(owner.id);
    const payload = {
      mode: 'vod',
      videoId: parsed.value,
      displayName: owner.displayName,
      channel: owner.login,
      lengthSeconds: owner.lengthSeconds || 0,
      emotes,
      badgeCatalog
    };
    broadcast('load', payload);
    pushHistory({
      value: parsed.value,
      mode: 'vod',
      label: (owner.displayName || 'VOD') + ' · VOD ' + parsed.value
    });
    store.set('lastSource', parsed.value);
    return { ok: true, ...payload, emoteCount: Object.keys(emotes).length };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

// Theme-Farben aus dem Store koennen Muell sein -> immer saeubern (ThemeLib).
function cleanThemePrefs(prefs) {
  const d = ThemeLib.DEFAULTS;
  return {
    videoAccent: ThemeLib.normalizeHex(prefs && prefs.videoAccent, d.videoAccent),
    chatAccent: ThemeLib.normalizeHex(prefs && prefs.chatAccent, d.chatAccent),
    videoAlpha: ThemeLib.clampAlpha(prefs && prefs.videoAlpha),
    chatAlpha: ThemeLib.clampAlpha(prefs && prefs.chatAlpha)
  };
}

// UI-Voreinstellungen fuers Video-Fenster (Verlauf, Prefill, Player-Prefs).
ipcMain.handle('get-ui-prefs', () => ({
  history: store.get('history', []),
  lastSource: store.get('lastSource', ''),
  playerPrefs: store.get('playerPrefs', { volume: null, quality: null }),
  chatPrefs: store.get('chatPrefs', { showTimestamps: true, showBadges: true }),
  themePrefs: cleanThemePrefs(store.get('themePrefs'))
}));

ipcMain.on('save-player-prefs', (_evt, prefs) => {
  const cur = store.get('playerPrefs', { volume: null, quality: null });
  store.set('playerPrefs', { ...cur, ...(prefs || {}) });
});

ipcMain.on('save-chat-prefs', (_evt, prefs) => {
  const cur = store.get('chatPrefs', { showTimestamps: true, showBadges: true });
  store.set('chatPrefs', { ...cur, ...(prefs || {}) });
});

// Fensterfarben: speichern broadcastet an BEIDE Fenster (Wirkung sofort);
// preview broadcastet nur (Live-Vorschau beim Ziehen im Farbwaehler).
ipcMain.on('save-theme-prefs', (_evt, prefs) => {
  const clean = cleanThemePrefs(prefs);
  store.set('themePrefs', clean);
  broadcast('theme-changed', clean);
});
ipcMain.on('preview-theme-prefs', (_evt, prefs) => {
  broadcast('theme-changed', cleanThemePrefs(prefs));
});

// Adblock-Einstellung (persistent, Default an).
ipcMain.handle('get-adblock-enabled', () => store.get('adblockEnabled', true));
ipcMain.handle('set-adblock-enabled', (_evt, enabled) => {
  const val = !!enabled;
  store.set('adblockEnabled', val);
  return { ok: true, enabled: val };
});

// vaft-Quelltext fuer die Injektion: das Preload ist sandboxed (kein fs)
// und holt sich die gepinnte Vendor-Datei deshalb per IPC.
let vaftSourceCache = null;
ipcMain.handle('get-vaft-source', () => {
  if (vaftSourceCache === null) {
    vaftSourceCache = fs.readFileSync(path.join(__dirname, 'vendor', 'vaft.js'), 'utf8');
  }
  return vaftSourceCache;
});

// Rahmenlose Fenster: Titelleisten-Buttons (─ ▢ ✕) aus dem Renderer.
// Nur-Video-Modus: gemerkte Fenstergroesse pro Fenster (Key = win.id), damit
// 'video-only-off' die Groesse vor dem 16:9-Einrasten wiederherstellen kann.
const preVideoOnlyBounds = new Map();

ipcMain.on('window-control', (evt, action) => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  if (!win || win.isDestroyed()) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') (win.isMaximized() ? win.unmaximize() : win.maximize());
  else if (action === 'close') win.close();
  else if (action === 'video-only-on') {
    if (win.isMaximized()) win.unmaximize();
    preVideoOnlyBounds.set(win.id, win.getBounds());
    const [w] = win.getContentSize();
    win.setContentSize(w, Math.round(w * 9 / 16)); // 16:9, Breite behalten
  } else if (action === 'video-only-off') {
    const b = preVideoOnlyBounds.get(win.id);
    if (b) { win.setBounds(b); preVideoOnlyBounds.delete(win.id); }
  }
});

// Werbe-Status aus dem Player-iframe -> ans Video-Fenster relayen.
ipcMain.on('adblock-state', (_evt, payload) => {
  const phase = payload && payload.phase;
  if ((phase === 'start' || phase === 'end') && videoWin && !videoWin.isDestroyed()) {
    videoWin.webContents.send('adblock-state', { phase });
  }
});

// Chat-Fenster laedt VOD-Kommentarseiten nach (immer per Offset, siehe twitch-api.js).
ipcMain.handle('vod-comments', async (_evt, args) => {
  try {
    const { videoId, offsetSeconds } = args || {};
    const page = await twitch.fetchVodComments(videoId, { offsetSeconds });
    return { ok: true, ...page };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

// Third-Party-Badges (7TV/BTTV/FFZ) eines Users, gecacht pro Session.
ipcMain.handle('user-badges', async (_evt, userId) => {
  const id = String(userId || '');
  if (!id) return { ok: true, badges: [] };
  if (!sevenTvCache.has(id)) {
    sevenTvCache.set(id, badgeSources.fetch7tvUserBadge(id).catch(() => []));
  }
  const sevenTv = await sevenTvCache.get(id);
  return { ok: true, badges: [...(thirdPartyBadges[id] || []), ...sevenTv] };
});

// --- IPC: Home-Overlay (Favoriten, Live-Status, VOD-Listen) ---------------
ipcMain.handle('get-favorites', () => {
  return store.get('favorites', []);
});

ipcMain.handle('add-favorite', (_evt, login) => {
  const clean = String(login || '').trim().toLowerCase().replace(/^#/, '');
  if (!/^[a-z0-9_]{2,25}$/.test(clean)) {
    return { ok: false, error: 'Ungueltiger Channel-Name' };
  }
  const favs = store.get('favorites', []);
  if (!favs.includes(clean)) favs.push(clean);
  store.set('favorites', favs);
  return { ok: true, favorites: favs };
});

ipcMain.handle('remove-favorite', (_evt, login) => {
  const clean = String(login || '').trim().toLowerCase();
  const favs = store.get('favorites', []).filter((f) => f !== clean);
  store.set('favorites', favs);
  return { ok: true, favorites: favs };
});

ipcMain.handle('live-status', async (_evt, logins) => {
  try {
    const list = await browse.getLiveStatus(logins);
    return { ok: true, channels: list };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('channel-vods', async (_evt, args) => {
  try {
    const { login, limit } = args || {};
    const vods = await browse.getChannelVods(login, limit || 20);
    return { ok: true, vods };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

// Player-Zeit vom Video-Fenster -> an Chat-Fenster weiterreichen (fuer Replay-Sync).
ipcMain.on('player-time', (_evt, seconds) => {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.send('player-time', seconds);
  }
});

// Player-Zustand (Pause/Play/Ende) ebenso ans Chat-Fenster relayen.
ipcMain.on('player-state', (_evt, state) => {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.send('player-state', state);
  }
});

// --- Auto-Update (GitHub Releases) -----------------------------------------
// Laedt neue Versionen im Hintergrund; Installation beim naechsten Beenden.
// Nur in der gepackten App aktiv; Fehler (offline, Rate-Limit) sind unkritisch.
const UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  autoUpdater.on('error', (e) => {
    console.error('AutoUpdater:', e && e.message ? e.message : e);
  });
  autoUpdater.checkForUpdatesAndNotify();
  setInterval(() => autoUpdater.checkForUpdatesAndNotify(), UPDATE_INTERVAL_MS);
}

app.whenReady().then(async () => {
  const { port } = await startServer(path.join(__dirname, 'renderer'));
  serverPort = port;
  createWindows();
  setupAutoUpdate();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
