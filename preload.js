const { contextBridge, ipcRenderer } = require('electron');

// Sichere Bruecke Renderer <-> Main. Renderer hat KEIN nodeIntegration.
contextBridge.exposeInMainWorld('twitchDual', {
  // Gemeinsames Eingabefeld: Channel/VOD laden.
  submitLoad: (raw) => ipcRenderer.invoke('submit-load', raw),

  // Beide Fenster reagieren auf 'load'.
  onLoad: (cb) => {
    ipcRenderer.on('load', (_e, payload) => cb(payload));
  },

  // VOD-Kommentarseiten nachladen (Chat-Fenster).
  fetchVodComments: (args) => ipcRenderer.invoke('vod-comments', args),

  // Video-Fenster meldet aktuelle Abspielzeit.
  sendPlayerTime: (seconds) => ipcRenderer.send('player-time', seconds),

  // Chat-Fenster empfaengt die Abspielzeit.
  onPlayerTime: (cb) => {
    ipcRenderer.on('player-time', (_e, seconds) => cb(seconds));
  }
});
