const { contextBridge, ipcRenderer, webFrame } = require('electron');
// ACHTUNG: Preload laeuft in der Electron-Sandbox — require() kann hier NUR
// 'electron' (+ events/timers/url). Kein fs/path! Dateien liest der
// Main-Prozess und liefert sie per IPC (siehe 'get-vaft-source').

// Laeuft dieser Preload in einem eingebetteten Twitch-iframe? (Video-Fenster
// hat nodeIntegrationInSubFrames.) Dann NUR den Werbe-Blocker aktivieren und
// die twitchDual-Bruecke NICHT exponieren - sonst koennte Twitch-/Werbe-Code
// im iframe Verlauf/Favoriten lesen oder den Player fernsteuern.
const isTwitchFrame = /(^|\.)twitch\.tv$/.test(location.hostname || '');

// Sichere Bruecke Renderer <-> Main. Renderer hat KEIN nodeIntegration.
// Nur im eigenen Fenster (localhost) exponieren, nicht in Twitch-iframes.
if (!isTwitchFrame) {
  contextBridge.exposeInMainWorld('twitchDual', {
    // Gemeinsames Eingabefeld: Channel/VOD laden.
    submitLoad: (raw) => ipcRenderer.invoke('submit-load', raw),

    // Beide Fenster reagieren auf 'load'.
    onLoad: (cb) => {
      ipcRenderer.on('load', (_e, payload) => cb(payload));
    },

    // Home-Overlay geoeffnet -> Chat trennt die laufende Quelle.
    notifyHomeOpen: () => ipcRenderer.send('home-open'),
    onHomeOpen: (cb) => {
      ipcRenderer.on('home-open', () => cb());
    },

    // VOD-Kommentarseiten nachladen (Chat-Fenster).
    fetchVodComments: (args) => ipcRenderer.invoke('vod-comments', args),

    // Third-Party-Badges (7TV/BTTV/FFZ) eines Users (Chat-Fenster).
    fetchUserBadges: (userId) => ipcRenderer.invoke('user-badges', userId),

    // Video-Fenster meldet aktuelle Abspielzeit.
    sendPlayerTime: (seconds) => ipcRenderer.send('player-time', seconds),

    // Chat-Fenster empfaengt die Abspielzeit.
    onPlayerTime: (cb) => {
      ipcRenderer.on('player-time', (_e, seconds) => cb(seconds));
    },

    // Video-Fenster meldet Player-Zustand ('playing'|'paused'|'ended').
    sendPlayerState: (state) => ipcRenderer.send('player-state', state),
    onPlayerState: (cb) => {
      ipcRenderer.on('player-state', (_e, state) => cb(state));
    },

    // Rahmenlose Fenster: Titelleisten-Buttons ('minimize'|'maximize'|'close').
    windowControl: (action) => ipcRenderer.send('window-control', action),

    // UI-Voreinstellungen: Verlauf, letzte Quelle, Player-Prefs.
    getUiPrefs: () => ipcRenderer.invoke('get-ui-prefs'),
    savePlayerPrefs: (prefs) => ipcRenderer.send('save-player-prefs', prefs),
    saveChatPrefs: (prefs) => ipcRenderer.send('save-chat-prefs', prefs),
    saveThemePrefs: (prefs) => ipcRenderer.send('save-theme-prefs', prefs),
    previewThemePrefs: (prefs) => ipcRenderer.send('preview-theme-prefs', prefs),
    onThemeChanged: (cb) => {
      ipcRenderer.on('theme-changed', (_e, prefs) => cb(prefs));
    },

    // Home-Overlay: Favoriten, Live-Status, VOD-Listen.
    getFavorites: () => ipcRenderer.invoke('get-favorites'),
    addFavorite: (login) => ipcRenderer.invoke('add-favorite', login),
    removeFavorite: (login) => ipcRenderer.invoke('remove-favorite', login),
    liveStatus: (logins) => ipcRenderer.invoke('live-status', logins),
    channelVods: (login, limit) => ipcRenderer.invoke('channel-vods', { login, limit }),

    // Adblock: Einstellung lesen/setzen + Werbe-Status empfangen (Video-Fenster).
    getAdblockEnabled: () => ipcRenderer.invoke('get-adblock-enabled'),
    setAdblockEnabled: (enabled) => ipcRenderer.invoke('set-adblock-enabled', enabled),
    onAdblockState: (cb) => {
      ipcRenderer.on('adblock-state', (_e, payload) => cb(payload));
    }
  });
}

// --- Werbe-Blocker: nur im Twitch-Player-iframe ------------------------------
// Der Preload laeuft (Video-Fenster, nodeIntegrationInSubFrames) auch in
// Subframes. Im player.twitch.tv-iframe injizieren wir vaft in die Main World
// und leiten Werbe-Start/-Ende an Main weiter. Fehler duerfen den Player nie
// kaputtmachen -> alles in try/catch, im Zweifel passiert nichts.
(async function setupAdblock() {
  try {
    if (!isTwitchFrame) return;                       // nur in Twitch-iframes

    const enabled = await ipcRenderer.invoke('get-adblock-enabled');
    if (!enabled) return;

    // Werbe-Signale der Seite (aus vaft-Wrapper) an Main relayen.
    window.addEventListener('message', (e) => {
      const d = e && e.data;
      if (d && d.source === 'twitchdual-adblock' &&
          (d.phase === 'start' || d.phase === 'end')) {
        ipcRenderer.send('adblock-state', { phase: d.phase });
      }
    });

    // Vendor-Datei kommt aus dem Main-Prozess (Sandbox: kein fs im Preload).
    const vaftSrc = await ipcRenderer.invoke('get-vaft-source');
    if (!vaftSrc) return;

    // Wrapper: exponiert postMessage-Signal fuer unseren Hook, laedt dann vaft.
    // vaft loggt Ad-Erkennung; wir beobachten diese Signale defensiv ueber eine
    // von uns definierte Bruecke window.__twitchDualAd(phase). Ein leichter
    // console.log-Hook erkennt vafts Ad-Meldungen ueber heuristische Marker.
    const bootstrap = `
      (function(){
        window.__twitchDualAd = function(phase){
          try { window.postMessage({ source: 'twitchdual-adblock', phase: phase }, '*'); } catch(e){}
        };
        var _log = console.log.bind(console);
        console.log = function(){
          try {
            var msg = Array.prototype.join.call(arguments, ' ');
            if (/ad segment|midroll|commercial|purhcasing|stream is ad|adblock/i.test(msg)) {
              window.__twitchDualAd('start');
            }
            if (/clean stream|main stream|ad(s)? (over|ended|finished)|switching back/i.test(msg)) {
              window.__twitchDualAd('end');
            }
          } catch(e){}
          return _log.apply(console, arguments);
        };
      })();
    ` + vaftSrc;

    await webFrame.executeJavaScript(bootstrap);
  } catch (e) {
    // Bewusst schlucken: lieber Werbung als kaputter Player.
    try { console.error('[TwitchDual] Adblock-Injektion fehlgeschlagen:', e && e.message); } catch (_) {}
  }
})();
