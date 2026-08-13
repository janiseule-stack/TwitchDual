const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

const { setupAutoUpdate } = require('./src/auto-update');
const { startServer } = require('./src/server');
const { parseInput } = require('./src/parse-input');
const twitch = require('./src/twitch-api');
const browse = require('./src/twitch-browse');
const badgeSources = require('./src/badge-sources');
const BadgesLib = require('./renderer/lib/badges');
const ThemeLib = require('./renderer/lib/theme');
const { TokenStore } = require('./src/twitch-tokens');
const { AuthManager } = require('./src/auth-manager');
const helix = require('./src/twitch-helix');
const { ChatSender } = require('./src/chat-send');
const { safeStorage, session } = require('electron');

const store = new Store({
  defaults: {
    videoBounds: { width: 500, height: 900, x: undefined, y: undefined },
    chatBounds: { width: 420, height: 900, x: undefined, y: undefined },
    favorites: [],
    history: [],      // zuletzt geladene Quellen [{ value, mode, label }]
    lastSource: '',   // letzte Roheingabe (Prefill beim Start)
    playerPrefs: { volume: null, quality: null },
    chatPrefs: { showTimestamps: true, showBadges: true },
    themePrefs: { videoAccent: '#35e0ff', chatAccent: '#ff4fa3', chatAlpha: 100 },
    diagEnabled: false   // Diagnose-Protokoll: Standard aus = nichts auf der Platte
  }
});

// --- Twitch-Login + Sende-Chat (v1.8.0) ------------------------------------
let authManager = null;
let chatSender = null;
let currentLiveChannel = null; // aktuell geladener Live-Channel (fuer Sende-Socket)

function initAuth() {
  const cryptoBridge = {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (s) => safeStorage.encryptString(s),
    decrypt: (buf) => safeStorage.decryptString(Buffer.from(buf))
  };
  const tokenStore = new TokenStore(path.join(app.getPath('userData'), 'twitch-auth.enc'), cryptoBridge);
  authManager = new AuthManager({
    tokenStore,
    onChanged: async (st) => {
      broadcast('auth-changed', st);
      // Sende-Socket an den neuen Login-Zustand anpassen.
      if (st.loggedIn) {
        const acc = await authManager.getAccess();
        if (acc) chatSender.login({ login: acc.login, accessToken: acc.accessToken });
      } else {
        chatSender.logout();
      }
    }
  });
  chatSender = new ChatSender({
    onNotice: (n) => { if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat-notice', n); },
    onRoom: (r) => { if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat-room', r); }
  });
}

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
    backgroundColor: '#0b0b11', // Video-Fenster bleibt opak (Player deckt eh alles)
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
  diagLog.melde('app', 'fenster', { welches: 'beide', was: 'auf' });

  // Fenster-Bounds bei jeder Aenderung merken.
  const save = () => {
    persistBounds(videoWin, 'videoBounds');
    persistBounds(chatWin, 'chatBounds');
  };
  for (const win of [videoWin, chatWin]) {
    win.on('resize', save);
    win.on('move', save);
  }

  // Login-Panel oeffnet twitch.tv/activate im Systembrowser (nicht im
  // Electron-Fenster) - Links aus dem Video-Renderer immer extern oeffnen.
  videoWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  videoWin.on('closed', () => {
    diagLog.melde('app', 'fenster', { welches: 'video', was: 'zu' });
    videoWin = null;
    if (chatWin && !chatWin.isDestroyed()) chatWin.close();
  });
  chatWin.on('closed', () => {
    diagLog.melde('app', 'fenster', { welches: 'chat', was: 'zu' });
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
      // Kanalwechsel: Chip sofort leeren statt bis zu 15s den alten Stand zu
      // zeigen. Der neue Stand kommt innerhalb von 15s per Takt nach. Die
      // Basislinie muss mit, sonst meldet der neue Kanal seinen vollen
      // Kontostand als Zuwachs.
      broadcast('points-update', { balance: null, displayName: null, fehler: null });
      pointsState.standVergessen();
      punkteChannelId = null;
      // Ein erfolgreicher Ladevorgang heisst: das Home-Overlay ist zu. Der
      // Weg "aus Home heraus einen Kanal starten" schickt kein home-close
      // (home.js closeHome() blendet nur aus; nur closeHomeResume() meldet
      // sich), sonst bliebe der Takt bis zum Programmende schlafen.
      punkteHomeOffen = false;
      currentLiveChannel = user.login;
      diagLog.melde('punkte', 'kanalwechsel', { modus: 'live', nach: user.login, userId: user.id });
      if (chatSender) chatSender.setChannel(user.login);
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
    // Kanalwechsel (VOD): siehe Kommentar im Live-Zweig oben, inklusive der
    // Basislinie.
    broadcast('points-update', { balance: null, displayName: null, fehler: null });
    pointsState.standVergessen();
    punkteChannelId = null;
    punkteHomeOffen = false; // wie im Live-Zweig: geladen heisst Overlay zu
    currentLiveChannel = null;
    diagLog.melde('punkte', 'kanalwechsel', { modus: 'vod', nach: null, videoId: parsed.value });
    if (chatSender) chatSender.setChannel(null);
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
    chatAlpha: ThemeLib.clampAlpha(prefs && prefs.chatAlpha)
  };
}

// UI-Voreinstellungen fuers Video-Fenster (Verlauf, Prefill, Player-Prefs).
ipcMain.handle('get-ui-prefs', () => ({
  history: store.get('history', []),
  lastSource: store.get('lastSource', ''),
  playerPrefs: store.get('playerPrefs', { volume: null, quality: null }),
  chatPrefs: store.get('chatPrefs', { showTimestamps: true, showBadges: true }),
  themePrefs: cleanThemePrefs(store.get('themePrefs')),
  appVersion: app.getVersion()
}));

// Home-Overlay geoeffnet -> beide Fenster benachrichtigen (Chat trennt die Quelle).
ipcMain.on('home-open', () => {
  if (chatSender) chatSender.setChannel(null);
  punkteHomeOffen = true; // Kanalpunkte-Takt ruht, solange das Overlay offen ist
  broadcast('home-open');
});
// Zurueck zur laufenden Quelle: Sende-Socket wieder auf den Live-Channel joinen
// (home-open hatte setChannel(null) gemacht) - sonst bleibt Senden tot.
ipcMain.on('home-close', () => {
  if (chatSender && currentLiveChannel) chatSender.setChannel(currentLiveChannel);
  punkteHomeOffen = false;
  broadcast('home-close');
});

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

// vaft-Quelltext fuer die Injektion: das Preload ist sandboxed (kein fs)
// und holt sich die gepinnte Vendor-Datei deshalb per IPC.
let vaftSourceCache = null;
ipcMain.handle('get-vaft-source', () => {
  if (vaftSourceCache === null) {
    vaftSourceCache = fs.readFileSync(path.join(__dirname, 'vendor', 'vaft.js'), 'utf8');
  }
  return vaftSourceCache;
});

// Lautstaerke-Waechter fuer die Injektion (gleicher Weg wie vaft): das Modul
// liegt als eine Quelle in renderer/lib und wird per Test abgedeckt.
let volumeGuardSourceCache = null;
ipcMain.handle('get-volume-guard-source', () => {
  if (volumeGuardSourceCache === null) {
    volumeGuardSourceCache = fs.readFileSync(
      path.join(__dirname, 'renderer', 'lib', 'volume-guard.js'), 'utf8');
  }
  return volumeGuardSourceCache;
});

// --- Kanalpunkte -------------------------------------------------------
// Der Web-Token bleibt hier im Main. Kein IPC-Kanal gibt ihn heraus - nur
// abgeleitete Werte (Bilanz, Anmeldestatus als bool, Fehlertexte) verlassen
// den Prozess. Siehe Praefungsschritt am Ende der Aufgabe.
const createPointsApi = require('./src/twitch-points');
const createPointsState = require('./renderer/lib/points-state');
const { createWebAuthStore, oeffneLoginFenster } = require('./src/twitch-web-auth');
const { createIntegrityStore, ernteIntegrity } = require('./src/twitch-integrity');

const pointsApi = createPointsApi({});
const pointsState = createPointsState({ intervalMs: 15000 });
const webAuth = createWebAuthStore({ safeStorage, store });
const integrity = createIntegrityStore({});

// webToken wird EINMAL beim Start gelesen (nicht bei jedem Takt - safeStorage
// entschluesselt sonst dauerhaft einmal pro Sekunde) und bei Login/Logout
// nachgefuehrt. currentLiveChannel (oben, Login+Sende-Chat) traegt bereits
// die Live-vs-VOD-Wahrheit, deshalb keine zweite Kanal-Variable.
let webToken = null;
// Token vorhanden, aber von Twitch abgewiesen. Spec: "Takt stoppt". Ohne das
// klopft der Takt bis zum Programmende gegen einen toten Token, und
// web-login-status meldet weiter "angemeldet".
let webTokenAbgelaufen = false;
let punkteSpielt = false;     // Player-Zustand ('playing' vom Video-Fenster)
let punkteHomeOffen = false;  // Home-Overlay offen -> Takt ruht
let punkteLaeuft = false;     // verhindert ueberlappende Takt-Durchlaeufe
let punkteChannelId = null;   // channelID des zuletzt abgefragten Kanals (fuer Redeem)

// Zuletzt gemeldeter Grund, warum der Takt ruht. Der Tick laeuft jede Sekunde;
// ohne diese Flanke waere 'takt-aus' eine Zeile pro Sekunde und der
// 10000er-Ringpuffer reichte keine drei Stunden zurueck.
let letzterTaktGrund = null;

// Meldet nur, wenn sich der Grund geaendert hat. null = Takt laeuft.
function meldeTaktGrund(grund) {
  if (grund === letzterTaktGrund) return;
  letzterTaktGrund = grund;
  if (grund) diagLog.melde('punkte', 'takt-aus', { grund });
  else diagLog.melde('punkte', 'takt-an');
}

// Ist ein brauchbarer Web-Token da? Ein abgelaufener zaehlt nicht.
function webTokenNutzbar() {
  return !!webToken && !webTokenAbgelaufen;
}

// Genaue Absage statt Sammelbegriff: "nicht angemeldet" gegenueber jemandem,
// der angemeldet ist und nur gerade ein VOD schaut, schickt ihn zu einem
// voellig sinnlosen zweiten Login.
function punkteAbsage() {
  if (!webToken) return 'nicht angemeldet';
  if (webTokenAbgelaufen) return 'Anmeldung abgelaufen';
  if (!currentLiveChannel) return 'kein Live-Kanal';
  return null;
}

ipcMain.handle('web-login-start', () => new Promise((resolve) => {
  oeffneLoginFenster({
    BrowserWindow,
    onToken: async (token) => {
      try {
        webAuth.speichern(token);
        webToken = token;
        webTokenAbgelaufen = false;
        diagLog.melde('punkte', 'anmeldung', { was: 'eingeloggt' });
        // Takt frisch anlaufen lassen: nach einem abgelaufenen Token steht
        // der Abstand sonst noch auf bis zu 5 Minuten und das Neuanmelden
        // bliebe so lange ohne sichtbare Wirkung.
        pointsState.zuruecksetzen();
        resolve({ ok: true });
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    },
    onAbbruch: () => resolve({ ok: false, error: 'Anmeldung abgebrochen' })
  });
}));

ipcMain.handle('web-login-status', () => ({ angemeldet: webTokenNutzbar() }));
ipcMain.handle('web-login-logout', () => {
  webAuth.loeschen();
  webToken = null;
  diagLog.melde('punkte', 'anmeldung', { was: 'abgemeldet' });
  webTokenAbgelaufen = false;
  return { ok: true };
});

ipcMain.handle('points-rewards', async () => {
  const absage = punkteAbsage();
  if (absage) return { ok: false, error: absage };
  try {
    return { ok: true, rewards: await pointsApi.rewards(webToken, currentLiveChannel) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// reward: das volle Belohnungsobjekt { id, title, cost } aus points-rewards -
// Twitch verlangt cost und title zwingend, eine blosse ID reicht nicht.
ipcMain.handle('points-redeem', async (_e, { reward, textInput }) => {
  const absage = punkteAbsage();
  if (absage) return { ok: false, error: absage };
  try {
    let channelID = punkteChannelId;
    if (!channelID) {
      const ctx = await pointsApi.context(webToken, currentLiveChannel);
      channelID = ctx.channelID;
    }
    const r = await pointsApi.redeem(webToken, channelID, reward, textInput);
    diagLog.melde('punkte', 'einloesen', {
      belohnung: reward && reward.title, kosten: reward && reward.cost,
      ok: r.ok, code: r.error
    });
    return r;
  } catch (e) {
    diagLog.melde('punkte', 'einloesen', {
      belohnung: reward && reward.title, ok: false, code: e.message
    });
    return { ok: false, error: e.message };
  }
});

// Kiste einloesen. Twitch verlangt dafuer Integrity-Kopfzeilen aus einer
// echten Seitensitzung; die werden nur geholt, wenn wirklich eine Kiste
// offen ist, und bei Ablehnung genau einmal erneuert.
async function kisteEinloesen(channelID, claimID) {
  let satz = integrity.holen(Date.now());
  if (!satz) {
    satz = await ernteIntegrity({ BrowserWindow, ses: session.defaultSession });
    diagLog.melde('punkte', 'integrity-ernte', { ergebnis: satz ? 'ok' : 'fehlgeschlagen', grund: 'kein Satz im Speicher' });
    if (!satz) return { ok: false, error: 'Integrity-Kopfzeilen nicht erhalten' };
    integrity.setzen(satz, Date.now());
  }
  const kopf = {
    'Client-Integrity': satz.integrity,
    'X-Device-Id': satz.deviceId,
    'Client-Session-Id': satz.sessionId,
    'Client-Version': satz.version
  };
  try {
    return await pointsApi.claim(webToken, channelID, claimID, kopf);
  } catch (e) {
    if (!e.integrity) throw e;
    // Abgelehnt -> Satz ist verbraucht, genau einmal neu holen und wiederholen.
    integrity.verwerfen();
    const neu = await ernteIntegrity({ BrowserWindow, ses: session.defaultSession });
    diagLog.melde('punkte', 'integrity-ernte', { ergebnis: neu ? 'ok' : 'fehlgeschlagen', grund: 'Satz abgelehnt, zweiter Versuch' });
    if (!neu) return { ok: false, error: 'Integrity-Kopfzeilen nicht erhalten' };
    integrity.setzen(neu, Date.now());
    return await pointsApi.claim(webToken, channelID, claimID, {
      'Client-Integrity': neu.integrity,
      'X-Device-Id': neu.deviceId,
      'Client-Session-Id': neu.sessionId,
      'Client-Version': neu.version
    });
  }
}

// 15-s-Takt (Sekunden-Tick, sollAbfragen laesst nur alle 15s wirklich durch -
// so wirkt das Zurueckfahren bei Fehlern, ohne den Timer neu zu setzen).
// Abgefragt wird nur bei Live-Kanal, spielendem Player, vorhandenem Token und
// geschlossenem Home-Overlay. Gegen Ueberlappung gesichert (punkteLaeuft),
// weil eine Abfrage samt Integrity-Ernte laenger als eine Sekunde dauern kann
// und ernteIntegrity nur einen Lauscher pro Sitzung gleichzeitig vertraegt.
async function punkteTick() {
  if (punkteLaeuft) return;
  punkteLaeuft = true;
  try {
    // Kanal EINMAL festhalten. Waehrend der Abfrage kann submit-load den Kanal
    // wechseln; alles, was danach kommt, gehoert zum alten Kanal und darf den
    // neuen nicht anfassen.
    const kanal = currentLiveChannel;
    const zustand = {
      live: !!kanal && !punkteHomeOffen,
      playing: punkteSpielt,
      hatToken: webTokenNutzbar(),
      channelLogin: kanal
    };
    if (!pointsState.sollAbfragen(zustand, Date.now())) {
      // Genauer Grund statt Sammelbegriff - die Reihenfolge entspricht der
      // Pruefreihenfolge in points-state.js sollAbfragen().
      meldeTaktGrund(
        !webToken ? 'kein Token'
        : webTokenAbgelaufen ? 'Token abgelaufen'
        : !kanal ? 'kein Live-Kanal'
        : punkteHomeOffen ? 'Home offen'
        : !punkteSpielt ? 'pausiert'
        : pointsState.istKanalGesperrt(kanal) ? 'Kanal gesperrt'
        : 'Abstand');
      return;
    }
    meldeTaktGrund(null);
    try {
      const ctx = await pointsApi.context(webToken, kanal);
      if (currentLiveChannel !== kanal) return;
      punkteChannelId = ctx.channelID;
      diagLog.melde('punkte', 'kontext', {
        kanal, channelID: ctx.channelID, stand: ctx.balance,
        claimID: ctx.claimID, punkteName: ctx.punkteName
      });
      if (ctx.balance === null) {
        if (ctx.channelID != null) {
          // Kanal gibt es, er hat Kanalpunkte aus -> einmal melden, dann ruhen.
          pointsState.abfrageOk(Date.now());
          pointsState.kanalGesperrt(kanal);
          diagLog.melde('punkte', 'kanal-gesperrt', { kanal });
          broadcast('points-update', { balance: null, displayName: null, fehler: 'Kanal hat keine Kanalpunkte' });
        } else {
          // Gar kein community-Objekt: Kanal unbekannt oder Antwort unbrauchbar.
          // NICHT sperren - die Sperre gilt bis zum Programmende, und "gibt es
          // nicht" ist etwas anderes als "hat keine Punkte". Das Zurueckfahren
          // kuemmert sich um die Wiederholung.
          pointsState.abfrageFehler(Date.now());
          broadcast('points-update', { balance: null, displayName: null, fehler: 'Kanal nicht gefunden' });
        }
        return;
      }
      pointsState.abfrageOk(Date.now());
      // ctx.balance ist der Stand VOR einem Claim. Klappt die Kiste, liefert
      // die Mutation den Stand danach - erst der ist aktuell, und die
      // Differenz ist der Kistenbetrag.
      let stand = ctx.balance;
      let kistenBetrag = 0;
      if (ctx.claimID && pointsState.darfClaimen(ctx.claimID)) {
        diagLog.melde('punkte', 'kiste-versuch', { kanal, claimID: ctx.claimID });
        try {
          const r = await kisteEinloesen(ctx.channelID, ctx.claimID);
          if (!r.ok) {
            diagLog.melde('punkte', 'kiste-fehler', { claimID: ctx.claimID, code: r.error });
            pointsState.claimFehlgeschlagen(ctx.claimID);
          } else if (r.currentPoints != null) {
            kistenBetrag = Math.max(0, r.currentPoints - ctx.balance);
            stand = r.currentPoints;
            diagLog.melde('punkte', 'kiste-ok', {
              davor: ctx.balance, danach: r.currentPoints, betrag: kistenBetrag
            });
          } else {
            // r.ok ohne currentPoints - der Zuwachs faellt beim naechsten Takt
            // als "passiv" auf. Trotzdem festhalten, sonst sieht es aus, als
            // waere die Kiste nie eingeloest worden.
            diagLog.melde('punkte', 'kiste-ok', { davor: ctx.balance, danach: null, betrag: null });
          }
        } catch (e) {
          // Wirft kisteEinloesen (z.B. beide Integrity-Versuche mit
          // IntegrityCheckFailed abgelehnt), zaehlt das genauso als
          // Fehlversuch - sonst greift die Drei-Versuche-Sperre nie und die
          // Kiste wird bei jedem zurueckgefahrenen Takt erneut versucht.
          diagLog.melde('punkte', 'kiste-fehler', {
            claimID: ctx.claimID, code: e && e.message, integrity: !!(e && e.integrity)
          });
          pointsState.claimFehlgeschlagen(ctx.claimID);
          throw e;
        }
      }
      // Zweite Wache: die Kisten-Einloesung samt Integrity-Ernte dauert
      // Sekunden. Kam der Wechsel erst danach, wuerde zuwaechse() die frisch
      // von standVergessen() geleerte Basislinie mit dem Stand des ALTEN
      // Kanals neu setzen - der naechste Takt meldete dann den kompletten
      // Kontostand des neuen Kanals als Zuwachs.
      if (currentLiveChannel !== kanal) return;
      broadcast('points-update', {
        balance: stand,
        displayName: ctx.displayName,
        fehler: null,
        zuwaechse: pointsState.zuwaechse(stand, kistenBetrag),
        punkteName: ctx.punkteName,
        iconUrl: ctx.iconUrl,
        channelLogin: kanal
      });
    } catch (e) {
      // Abgelaufener Token: Takt anhalten (Spec). Der Chip zeigt die Meldung
      // samt Knopf zum Neuanmelden; ein Weiterklopfen mit totem Token bringt
      // nichts und laesst web-login-status "angemeldet" luegen.
      if (/abgelaufen/i.test(e.message)) {
        webTokenAbgelaufen = true;
        diagLog.melde('punkte', 'token-abgelaufen', { kanal });
      }
      diagLog.melde('punkte', 'abfrage-fehler', { kanal, fehler: e.message });
      pointsState.abfrageFehler(Date.now());
      broadcast('points-update', { balance: null, displayName: null, fehler: e.message });
    }
  } finally {
    punkteLaeuft = false;
  }
}

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
    win.setContentSize(w, Math.round(w * 9 / 16)); // sofort auf 16:9, Breite behalten
    win.setAspectRatio(16 / 9); // bleibt beim Resize 16:9 -> nie wieder Balken
  } else if (action === 'video-only-off') {
    win.setAspectRatio(0); // Seitenverhaeltnis-Sperre wieder loesen
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

// --- Login (Device Flow) -----------------------------------------------
ipcMain.handle('auth-status', () => authManager.status());
ipcMain.handle('auth-start', async () => {
  try { return { ok: true, ...(await authManager.startDeviceFlow()) }; }
  catch (e) { return { ok: false, error: e.message || String(e) }; }
});
ipcMain.handle('auth-logout', () => { authManager.logout(); return { ok: true }; });

// Gefolgte Channels (mit Live-Status, live-first via browse.getLiveStatus).
ipcMain.handle('get-followed', async () => {
  try {
    const acc = await authManager.getAccess();
    if (!acc) return { ok: false, error: 'Nicht angemeldet.' };
    const followed = await helix.getFollowedChannels({ userId: acc.userId, accessToken: acc.accessToken });
    const channels = await browse.getLiveStatus(followed.map((f) => f.login));
    return { ok: true, channels };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

// Eigene Twitch-Emotes fuer den Picker.
ipcMain.handle('get-user-emotes', async () => {
  try {
    const acc = await authManager.getAccess();
    if (!acc) return { ok: false, error: 'Nicht angemeldet.' };
    const emotes = await helix.getUserEmotes({ userId: acc.userId, accessToken: acc.accessToken });
    return { ok: true, emotes };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

// Nachricht senden (nur Live + eingeloggt; Guards im ChatSender).
ipcMain.handle('chat-send', (_evt, args) => {
  const { text } = args || {};
  if (!chatSender) return { ok: false, error: 'Chat nicht bereit.' };
  return chatSender.send(String(text || ''));
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
  punkteSpielt = (state === 'playing'); // Kanalpunkte-Takt fragt nur bei spielendem Player
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.send('player-state', state);
  }
});

// --- Auto-Update (GitHub Releases) -----------------------------------------
// Laedt neue Versionen im Hintergrund; Installation beim naechsten Beenden.
// Nur in der gepackten App aktiv; Fehler (offline, Rate-Limit) sind unkritisch.
// Verdrahtung + Fehlerabfang stecken in src/auto-update.js (getestet).

// --- Diagnose-Protokoll ----------------------------------------------------
// Der Ringpuffer laeuft immer mit; der Schalter entscheidet nur ueber die
// Datei. Beim Einschalten geht der Puffer als Vorgeschichte raus - genau das
// ist der Zweck (siehe docs/superpowers/specs/2026-08-13-diagnose-schalter-design.md).
// Die Pfade werden bei jedem Zugriff frisch geholt, damit auf Modulebene kein
// app.getPath() vor whenReady faellig wird.
const createDiagLog = require('./src/diag-log');

const diagPfad = () => path.join(app.getPath('userData'), 'diagnose.log');
const diagAltPfad = () => path.join(app.getPath('userData'), 'diagnose.1.log');

const diagLog = createDiagLog({
  schreiben: (block) => fs.appendFileSync(diagPfad(), block),
  groesse: () => { try { return fs.statSync(diagPfad()).size; } catch { return 0; } },
  // Hoechstens zwei Dateien, hoechstens ~20 MB - es kann nie die Platte
  // volllaufen. Eine vorhandene diagnose.1.log wird ueberschrieben.
  umlegen: () => fs.renameSync(diagPfad(), diagAltPfad())
});

// Renderer melden IMMER, auch bei ausgeschaltetem Schalter - nur so fuellt sich
// der Ringpuffer, und der ist der ganze Punkt. Vertretbar, weil der
// Ereignis-Katalog bewusst duenn ist: einzelne Meldungen pro Minute, keine pro
// Chat-Nachricht.
ipcMain.on('diag-melde', (_evt, m) => {
  if (!m) return;
  diagLog.melde(String(m.bereich || 'app'), String(m.ereignis || '?'), m.detail);
});

ipcMain.handle('get-diag-enabled', () => diagLog.istAktiv());

ipcMain.on('set-diag-enabled', (_evt, an) => {
  const ein = !!an;
  store.set('diagEnabled', ein);
  if (ein) {
    diagLog.setAktiv(true);          // schreibt die Vorgeschichte
  } else {
    diagLog.melde('app', 'diagnose-aus');   // noch in die Datei, dann Schluss
    diagLog.setAktiv(false);
  }
});

// Ordner statt Datei: beim ersten Einschalten existiert diagnose.log noch
// nicht, showItemInFolder taete dann nichts.
ipcMain.on('open-diag-folder', () => {
  shell.openPath(app.getPath('userData')).catch(() => { /* Komfort, kein Muss */ });
});

// Protokolliert Updater-Ereignisse sichtbar in eine Datei (console.* ist in der
// gepackten App unsichtbar). Darf den Start nie blockieren.
function updaterLog(event, detail) {
  const line = `[${new Date().toISOString()}] update:${event}` +
    (detail !== undefined ? ` ${detail}` : '');
  console.log(line);
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'updater.log'), line + '\n');
  } catch { /* Logging ist best-effort */ }
  // Zusaetzlich in die Diagnose. Der Ereignisname bleibt roh, damit
  // 'gpu-status' und 'unhandled-rejection' im Diagnose-Protokoll so heissen,
  // wie der Katalog es vorsieht - in updater.log behalten sie ihr 'update:'.
  try { diagLog.melde('app', event, detail); } catch { /* nie stoeren */ }
}

// Defense-in-Depth: electron-updater laesst bei Download-Fehlern intern eine
// nicht abgefangene Rejection stehen (AppUpdater.js: `void downloadPromise.then`),
// die wir von aussen nicht catchen koennen. Ein Hintergrund-Update darf die App
// des Nutzers niemals abschiessen — daher hier auffangen und nur protokollieren.
process.on('unhandledRejection', (reason) => {
  updaterLog('unhandled-rejection', reason && reason.message ? reason.message : String(reason));
});

app.whenReady().then(async () => {
  const { port } = await startServer(path.join(__dirname, 'renderer'));
  serverPort = port;
  // Gemerkten Schalterstand anwenden, BEVOR das erste Ereignis faellt.
  diagLog.setAktiv(store.get('diagEnabled', false));
  diagLog.melde('app', 'start', { version: app.getVersion(), gepackt: app.isPackaged });
  initAuth();
  webToken = webAuth.lesen(); // einmalig beim Start, siehe Kommentar oben bei der Deklaration
  createWindows();

  // Kanalpunkte-Takt: tickt jede Sekunde, sollAbfragen() im punkteTick laesst
  // die eigentliche Abfrage nur alle 15s (bzw. seltener nach Fehlern) durch.
  // Erst hier starten, nicht auf Modulebene - sonst liefe der Takt schon vor
  // app.whenReady().
  setInterval(() => { punkteTick().catch(() => { /* punkteTick faengt selbst ab; Netz */ }); }, 1000);

  // Belegt im Log, ob die GPU den Twitch-Stream wirklich dekodiert.
  // WICHTIG: erst nach abgeschlossener Info-Sammlung abfragen. Direkt bei
  // whenReady meldet Chromium noch ueberall "disabled_software", auch wenn
  // die Beschleunigung laeuft — das sieht wie ein Totalausfall aus und ist
  // keiner.
  app.getGPUInfo('complete')
    .then(() => updaterLog('gpu-status', JSON.stringify(app.getGPUFeatureStatus())))
    .catch((e) => updaterLog('gpu-status-fehler', e && e.message ? e.message : String(e)));
  if (authManager.status().loggedIn) {
    const acc = await authManager.getAccess();
    if (acc) chatSender.login({ login: acc.login, accessToken: acc.accessToken });
  }
  setupAutoUpdate(autoUpdater, updaterLog, { isPackaged: app.isPackaged });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
