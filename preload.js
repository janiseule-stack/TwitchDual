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
    // Updater: Zustand fuer die Leiste + sofort installieren.
    getUpdateZustand: () => ipcRenderer.invoke('update-zustand'),
    onUpdateZustand: (cb) => { ipcRenderer.on('update-zustand', (_e, z) => cb(z)); },
    updateInstallieren: () => ipcRenderer.send('update-installieren'),
    // Neu geladenes Chat-Fenster: laufende Quelle abholen (oder null).
    getAktuelleQuelle: () => ipcRenderer.invoke('aktuelle-quelle'),
    // Emotes + Badges kommen nach 'load' hinterher (main.js ladeExtras).
    onLoadExtras: (cb) => {
      ipcRenderer.on('load-extras', (_e, extras) => cb(extras));
    },

    // Home-Overlay geoeffnet -> Chat trennt die laufende Quelle.
    notifyHomeOpen: () => ipcRenderer.send('home-open'),
    onHomeOpen: (cb) => {
      ipcRenderer.on('home-open', () => cb());
    },

    // Home-Overlay ohne Neuwahl geschlossen -> Chat verbindet die laufende
    // Quelle wieder (Gegenstueck zu home-open).
    notifyHomeClose: () => ipcRenderer.send('home-close'),
    onHomeClose: (cb) => {
      ipcRenderer.on('home-close', () => cb());
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
    onAndockZustand: (cb) => { ipcRenderer.on('andocken-zustand', (_e, z) => cb(z)); },
    andockenLoesen: () => ipcRenderer.send('andocken-loesen'),

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
    homeKanaele: () => ipcRenderer.invoke('home-kanaele'),
    addFavorite: (login) => ipcRenderer.invoke('add-favorite', login),
    removeFavorite: (login) => ipcRenderer.invoke('remove-favorite', login),
    channelVods: (login, limit) => ipcRenderer.invoke('channel-vods', { login, limit }),

    // Werbe-Status empfangen (Video-Fenster). Adblock ist immer an (kein Schalter).
    onAdblockState: (cb) => {
      ipcRenderer.on('adblock-state', (_e, payload) => cb(payload));
    },

    // Login (Device Flow) + Sende-Chat (v1.8.0).
    authStatus: () => ipcRenderer.invoke('auth-status'),
    authStart: () => ipcRenderer.invoke('auth-start'),
    authLogout: () => ipcRenderer.invoke('auth-logout'),
    onAuthChanged: (cb) => { ipcRenderer.on('auth-changed', (_e, st) => cb(st)); },
    kanalSuche: (query) => ipcRenderer.invoke('kanal-suche', query),
    getUserEmotes: () => ipcRenderer.invoke('get-user-emotes'),
    chatSend: (text) => ipcRenderer.invoke('chat-send', { text }),
    onChatNotice: (cb) => { ipcRenderer.on('chat-notice', (_e, n) => cb(n)); },
    onChatRoom: (cb) => { ipcRenderer.on('chat-room', (_e, r) => cb(r)); },

    // Web-Login (separat vom Device-Flow) + Kanalpunkte. Der Token selbst
    // bleibt im Main - hier gehen nur abgeleitete Werte durch (bool, Text,
    // Bilanz, Belohnungsliste).
    startWebLogin: () => ipcRenderer.invoke('web-login-start'),
    anmelden: () => ipcRenderer.invoke('anmelden'),
    abmelden: () => ipcRenderer.invoke('abmelden'),
    onWebLoginGeaendert: (cb) => { ipcRenderer.on('web-login-geaendert', (_e, st) => cb(st)); },
    webLoginStatus: () => ipcRenderer.invoke('web-login-status'),
    webLogout: () => ipcRenderer.invoke('web-login-logout'),
    getRewards: () => ipcRenderer.invoke('points-rewards'),
    redeemReward: (reward, textInput) => ipcRenderer.invoke('points-redeem', { reward, textInput }),
    onPointsUpdate: (cb) => { ipcRenderer.on('points-update', (_e, p) => cb(p)); },
    // Pins/Umfragen/Vorhersagen: fertiger Stand aus dem Main, Setzen per
    // invoke. Der Token bleibt im Main.
    onKanalEreignisse: (cb) => { ipcRenderer.on('kanal-ereignisse', (_e, p) => cb(p)); },
    vorhersageSetzen: (outcomeID, points) => ipcRenderer.invoke('vorhersage-setzen', { outcomeID, points }),
    linkOeffnen: (url) => ipcRenderer.send('link-oeffnen', url),
    // Zuschauer-Fenster: nur ein bool ("Twitch zaehlt dich"), sonst nichts.
    onZuschauerStatus: (cb) => { ipcRenderer.on('zuschauer-status', (_e, s) => cb(s)); },
    getZuschauerStatus: () => ipcRenderer.invoke('zuschauer-status-abfragen'),

    // Diagnose: melden geht IMMER (fuellt den Ringpuffer im Main), der
    // Schalter entscheidet nur ueber die Datei. Feuert und vergisst - ein
    // Protokollaufruf darf nie einen Renderer-Pfad blockieren.
    diag: (bereich, ereignis, detail) =>
      ipcRenderer.send('diag-melde', { bereich, ereignis, detail }),
    getDiagEnabled: () => ipcRenderer.invoke('get-diag-enabled'),
    setDiagEnabled: (an) => ipcRenderer.send('set-diag-enabled', !!an),
    openDiagFolder: () => ipcRenderer.send('open-diag-folder'),

    // Effekte testen (⚙): geht an BEIDE Fenster, jedes spielt seinen Teil.
    fxTest: (art) => ipcRenderer.send('fx-test', art),
    onFxTest: (cb) => { ipcRenderer.on('fx-test', (_e, art) => cb(art)); }
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

    // Theme-Effekte ueber dem Video (Gast-Fische) verdecken den Player kurz.
    // Twitch beobachtet per IntersectionObserver v2, ob er verdeckt ist, und
    // PAUSIERT ohne vorherigen Nutzer-Klick - bis man klickt (2026-10-07:
    // ohne diesen Eingriff Pause nach 1 s Fisch, mit ihm laeuft es durch).
    // Nur "verdeckt" wird ueberschrieben, "im Bild" (isIntersecting) bleibt
    // echt. Sofort und OHNE await, damit es vor Twitchs Skripten steht.
    webFrame.executeJavaScript(`(function(){
      try {
        var P = window.IntersectionObserverEntry && IntersectionObserverEntry.prototype;
        if (P && Object.getOwnPropertyDescriptor(P, 'isVisible')) {
          Object.defineProperty(P, 'isVisible', { configurable: true, get: function(){ return true; } });
        }
      } catch (e) {}
    })();`).catch(() => {});

    // Balken ueber/unter dem Video in Theme-Farbe (Spec Welle 1b, 3.). Das
    // <video> fuellt das iframe; sein Hintergrund ist genau die Balkenflaeche.
    // Farbfilter = Kopie von ThemeKatalog.SICHERE_FARBE (Sandbox: kein require;
    // test/balken-farbe.test.js haelt beide gleich).
    const SICHERE_FARBE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
    window.addEventListener('message', (e) => {
      const d = e && e.data;
      if (!d || d.source !== 'twitchdual-theme') return;
      try {
        let st = document.getElementById('twitchdual-balken');
        if (typeof d.balken !== 'string' || !SICHERE_FARBE.test(d.balken)) { if (st) st.remove(); return; }
        if (!st) {
          st = document.createElement('style');
          st.id = 'twitchdual-balken';
          (document.head || document.documentElement).appendChild(st);
        }
        st.textContent = 'video, .video-player, .video-player > div { background-color: ' + d.balken + ' !important; }';
      } catch (err) { /* Player nie stoeren */ }
    });
    // Adblock ist ab v1.8.4 immer aktiv (kein Schalter mehr) -> ungated injizieren.

    // Werbe-Signale der Seite (aus vaft-Wrapper) an Main relayen.
    window.addEventListener('message', (e) => {
      const d = e && e.data;
      if (d && d.source === 'twitchdual-adblock' &&
          (d.phase === 'start' || d.phase === 'end')) {
        ipcRenderer.send('adblock-state', { phase: d.phase });
      }
      // Diagnose aus der Main World des Players (dort gibt es kein
      // window.twitchDual - siehe Kommentar oben bei isTwitchFrame).
      if (d && d.source === 'twitchdual-diag' && d.ereignis) {
        ipcRenderer.send('diag-melde', {
          bereich: d.bereich || 'video', ereignis: d.ereignis, detail: d.detail
        });
      }
    });

    // Vendor-Datei kommt aus dem Main-Prozess (Sandbox: kein fs im Preload).
    const vaftSrc = await ipcRenderer.invoke('get-vaft-source');
    if (!vaftSrc) return;
    // Lautstaerke-Waechter (siehe renderer/lib/volume-guard.js). Faellt er aus,
    // laeuft der Player normal weiter - nur ohne diesen Backstop.
    const volumeGuardSrc = await ipcRenderer.invoke('get-volume-guard-source');

    // Wrapper: exponiert postMessage-Signal fuer unseren Hook, laedt dann vaft.
    // vaft loggt Ad-Erkennung; wir beobachten diese Signale defensiv ueber eine
    // von uns definierte Bruecke window.__twitchDualAd(phase). Ein leichter
    // console.log-Hook erkennt vafts Ad-Meldungen ueber heuristische Marker.
    // Reihenfolge: erst der Waechter (definiert window.createVolumeGuard), dann
    // unser Bootstrap (nutzt ihn sofort), zuletzt vaft.
    const bootstrap = volumeGuardSrc + '\n' + `
      (function(){
        window.__twitchDualAd = function(phase){
          try { window.postMessage({ source: 'twitchdual-adblock', phase: phase }, '*'); } catch(e){}
        };
        window.__twitchDualDiag = function(bereich, ereignis, detail){
          try {
            window.postMessage({ source: 'twitchdual-diag',
              bereich: bereich, ereignis: ereignis, detail: detail }, '*');
          } catch(e){}
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
        // Lautstaerke-Backstop: vaft stellt nach dem Werbe-Reload zwar den
        // Mute-Zustand wieder her, aber nicht die Lautstaerke des neuen
        // <video>-Elements.
        // Bleibt es unmuted auf 0 stehen, ist der Ton weg, waehrend die
        // Oberflaeche den alten Wert anzeigt - hier korrigiert.
        (function(){
          if (!window.createVolumeGuard) return;
          var guard = window.createVolumeGuard({
            melde: function(ereignis, detail){
              try { window.__twitchDualDiag('video', ereignis, detail); } catch(e){}
            }
          });
          setInterval(function(){
            try {
              var v = document.querySelector('video');
              var act = guard.observe(v ? { muted: v.muted, volume: v.volume } : null, Date.now());
              if (act && v) {
                v.volume = act.restoreTo;
                try { window.__twitchDualDiag('video', 'volume-guard-wiederhergestellt', { auf: act.restoreTo }); } catch(e){}
                console.log('[TwitchDual] Lautstaerke nach Player-Neustart wiederhergestellt: ' + act.restoreTo);
              }
            } catch(e){}
          }, 300);
        })();
      })();
    ` + vaftSrc;

    await webFrame.executeJavaScript(bootstrap);
  } catch (e) {
    // Bewusst schlucken: lieber Werbung als kaputter Player.
    try { console.error('[TwitchDual] Adblock-Injektion fehlgeschlagen:', e && e.message); } catch (_) {}
  }
})();
