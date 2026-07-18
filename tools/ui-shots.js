// UI-Screenshots: rendert die echten Renderer-Fenster in Electron, setzt
// realistische Zustaende (live/idle/Popup/Ads) und speichert PNGs nach
// design-screens/. Aufruf: `npm run shots` (oder electron tools/ui-shots.js).
//
// Kein Teil der App — reines Dev-Werkzeug, damit man UI-Aenderungen sofort
// visuell gegenpruefen kann. Blockt externe Requests (Twitch-Embed), damit der
// Load nicht haengt, und faengt window-all-closed ab (sonst quittet Electron
// nach dem ersten Fenster).
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const R = path.join(ROOT, 'renderer');
const OUT = path.join(ROOT, 'design-screens');

// Realistische Fake-Chatnachrichten (Neon Dual .msg-Struktur).
const CHAT_MSGS = `
  <div class="msg"><span class="ts">21:04</span><span class="user" style="color:#ff7ac6">gronkh</span><span class="sep">: </span>morgen zusammen o/</div>
  <div class="msg"><span class="ts">21:04</span><span class="user" style="color:#7ad0ff">Pixelfee</span><span class="sep">: </span>endlich live PogChamp</div>
  <div class="msg"><span class="ts">21:05</span><span class="user" style="color:#8affc1">bit_reaper</span><span class="sep">: </span>der Run gestern war krass</div>
  <div class="msg"><span class="ts">21:05</span><span class="user" style="color:#ffd27a">Lunavia</span><span class="sep">: </span>KEKW KEKW KEKW</div>
  <div class="msg"><span class="ts">21:06</span><span class="user" style="color:#c69bff">nachtschwarm</span><span class="sep">: </span>welche map kommt als naechstes?</div>
  <div class="msg"><span class="ts">21:06</span><span class="user" style="color:#ff9e9e">toastbrot</span><span class="sep">: </span>Hype! LETSGO</div>
`;

const CONFIGS = [
  { name: 'video-live', file: `${R}/video/index.html`, w: 1400, h: 300,
    inject: `document.body.classList.add('onair');
             const s=document.getElementById('status'); s.className=''; s.textContent='live: gronkh';
             const h=document.getElementById('hint'); if(h) h.textContent='';` },
  { name: 'video-idle', file: `${R}/video/index.html`, w: 1400, h: 300,
    inject: `const s=document.getElementById('status'); s.className=''; s.textContent='bereit';` },
  { name: 'video-adblock', file: `${R}/video/index.html`, w: 1400, h: 150,
    inject: `document.getElementById('adblock-toggle').classList.add('on');
             document.body.classList.add('onair');
             const s=document.getElementById('status'); s.className=''; s.textContent='live: gronkh';
             const h=document.getElementById('hint'); if(h) h.textContent='';` },
  { name: 'chat-live', file: `${R}/chat/index.html`, w: 640, h: 560,
    inject: `document.body.classList.add('onair');
             document.getElementById('messages').innerHTML=\`${CHAT_MSGS}\`;
             const c=document.getElementById('conn'); c.className='ok'; c.textContent='verbunden';
             document.getElementById('rate').textContent='42 msg/min';` },
  { name: 'chat-idle', file: `${R}/chat/index.html`, w: 640, h: 560,
    inject: `const c=document.getElementById('conn'); c.className=''; c.textContent='nicht verbunden';` },
  { name: 'chat-settings', file: `${R}/chat/index.html`, w: 640, h: 560,
    inject: `document.getElementById('settings-pop').classList.remove('hidden');
             document.getElementById('opt-font').value=14; document.getElementById('opt-font-val').textContent='14 px';
             document.body.classList.add('onair');
             document.getElementById('messages').innerHTML=\`${CHAT_MSGS}\`;
             const c=document.getElementById('conn'); c.className='ok'; c.textContent='verbunden';
             document.getElementById('rate').textContent='42 msg/min';` },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(cfg) {
  const win = new BrowserWindow({
    width: cfg.w, height: cfg.h, show: false, frame: false,
    backgroundColor: '#0b0b11',
    webPreferences: { offscreen: false, backgroundThrottling: false },
  });
  // Externe Requests (Twitch-Embed etc.) blocken, sonst haengt der Load.
  win.webContents.session.webRequest.onBeforeRequest((d, cb) => {
    cb({ cancel: /^https?:/i.test(d.url) });
  });
  // Nicht auf did-finish-load warten (haengt an externen Scripts) -> dom-ready + Timeout.
  await new Promise((resolve) => {
    let done = false; const go = () => { if (!done) { done = true; resolve(); } };
    win.webContents.once('dom-ready', go);
    setTimeout(go, 3000);
    win.loadFile(cfg.file).catch(() => {});
  });
  await delay(400);
  try { await win.webContents.executeJavaScript(cfg.inject); } catch (e) { console.log('inject err', cfg.name, e.message); }
  await delay(500);
  const img = await win.webContents.capturePage();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, cfg.name + '.png'), img.toPNG());
  console.log('shot', cfg.name);
  win.destroy();
}

app.on('window-all-closed', () => {}); // sonst quittet Electron nach dem 1. Fenster
app.whenReady().then(async () => {
  let code = 0;
  for (const cfg of CONFIGS) {
    try { await shoot(cfg); } catch (e) { console.log('shoot err', cfg.name, e.message); code = 1; }
  }
  app.exit(code);
});
