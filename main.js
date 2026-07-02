const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');

const { startServer } = require('./src/server');
const { parseInput } = require('./src/parse-input');
const twitch = require('./src/twitch-api');
const browse = require('./src/twitch-browse');

const store = new Store({
  defaults: {
    videoBounds: { width: 500, height: 900, x: undefined, y: undefined },
    chatBounds: { width: 420, height: 900, x: undefined, y: undefined },
    favorites: []
  }
});

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
    backgroundColor: '#0e0e10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  chatWin = new BrowserWindow({
    ...cb,
    title: 'TwitchDual — Chat',
    backgroundColor: '#18181b',
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
      const payload = {
        mode: 'live',
        channel: user.login,
        displayName: user.displayName,
        userId: user.id,
        emotes
      };
      broadcast('load', payload);
      return { ok: true, ...payload, emoteCount: Object.keys(emotes).length };
    }

    // VOD
    let owner = { id: null, login: null, displayName: 'VOD' };
    try {
      owner = await twitch.resolveVideoOwner(parsed.value);
    } catch (e) {
      // Owner-Aufloesung optional; ohne sie gibt es nur globale Emotes.
    }
    const channelEmotes = owner.id ? await twitch.fetch7tvEmotes(owner.id) : {};
    const emotes = { ...globalEmotes, ...channelEmotes };
    const payload = {
      mode: 'vod',
      videoId: parsed.value,
      displayName: owner.displayName,
      channel: owner.login,
      emotes
    };
    broadcast('load', payload);
    return { ok: true, ...payload, emoteCount: Object.keys(emotes).length };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
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

app.whenReady().then(async () => {
  const { port } = await startServer(path.join(__dirname, 'renderer'));
  serverPort = port;
  createWindows();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
