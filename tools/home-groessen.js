// Dev-Werkzeug (nicht gepackt): Home-Raum im laufenden Video-Fenster in mehreren
// Fenstergroessen fotografieren (Janis 11.11.2026: immer auf mehreren Groessen testen).
// App vorher starten mit: npx electron . --remote-debugging-port=9333
// Aufruf: node tools/home-groessen.js <zielordner> [raum|regal]
// Setzt #home voruebergehend auf die Groesse, richtet neu aus, schneidet das Bild zu
// und stellt danach alles zurueck. Groessen = feste Liste aus dem Gedaechtnis.
const fs = require('fs');
const path = require('path');

const GROESSEN = [[2960, 1390], [2040, 952], [1920, 1030], [1536, 1030], [1280, 670], [900, 700]];
const [,, ziel, ansicht = 'raum'] = process.argv;
if (!ziel) { console.error('Aufruf: node tools/home-groessen.js <zielordner> [raum|regal|karte|rueckseite]'); process.exit(1); }

// Beispiel-Stand fuer zeichneKarte (laeuft im Video-Fenster, daher ohne Verweise nach aussen):
// neutraler Kanal, 30 Beispiel-VODs mit Spiel; ohne Vorschaubilder (kein Netz).
function beispielStand(seite) {
  const liste = [];
  for (let i = 1; i <= 30; i++) {
    liste.push({
      id: 'v' + i, title: 'Beispiel-VOD ' + i + ' mit einem ziemlich langen Titel fuer den Zeilenumbruch',
      published: new Date(Date.now() - i * 86400000).toISOString(), publishedLabel: 'vor ' + i + ' T',
      length: 3600 + i * 60, lengthLabel: '1:' + String(10 + (i % 50)).padStart(2, '0') + ':00',
      thumb: null, game: i % 3 ? 'Beispiel-Spiel ' + (i % 4) : '',
    });
  }
  return {
    kanal: {
      login: 'beispiel', displayName: 'beispiel', live: true, favorit: false, verifiziert: true, avatar: null,
      title: 'Ein langer Beispiel-Titel, der sicher ueber zwei Zeilen geht und danach abgeschnitten wird',
      game: 'Beispiel-Spiel', viewersLabel: '12,3K', start: new Date(Date.now() - 5400000).toISOString(),
    },
    modus: 'live', seite: seite === 'rueckseite' ? 'rueck' : 'vorn', punkte: { balance: 12345 },
    vods: { status: 'ok', liste, weitere: true, laedtNach: false, laufend: 'v1' },
  };
}

(async () => {
  const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
  const t = list.find((x) => x.type === 'page' && x.url.includes('/video/index.html'));
  if (!t) throw new Error('Video-Fenster nicht gefunden');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const offen = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); } });
  const cdp = (method, params) => new Promise((r) => { const i = ++id; offen.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const werte = async (expr) => {
    const m = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (m.result.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails));
    return m.result.result.value;
  };
  // Ansicht voruebergehend so gross wie die groesste Groesse (auch wenn das Fenster kleiner ist)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 3000, height: 1500, deviceScaleFactor: 1, mobile: false });
  const fenster = await werte('[innerWidth, innerHeight]');
  fs.mkdirSync(ziel, { recursive: true });
  for (const [b, h] of GROESSEN) {
    if (b > fenster[0] || h + 50 > fenster[1]) { console.log('zu gross fuer das Fenster, uebersprungen:', b + 'x' + h); continue; }
    // karte/rueckseite: Regal-Ansicht, darueber die Karte mit Beispieldaten (kein Klick, kein Netz)
    const karte = ansicht === 'karte' || ansicht === 'rueckseite';
    const zeichne = karte ? "HomeRaumDom.zeichneKarte(null, {}); HomeRaumDom.zeichneKarte((" + beispielStand.toString() + ")('" + ansicht + "'), {});" : '';
    const oben = await werte("(function(){ var h=document.getElementById('home'); h.style.right='auto'; h.style.bottom='auto'; h.style.width='" + b + "px'; h.style.height='" + h + "px'; HomeRaumDom.zeigeAnsicht('" + (karte ? 'regal' : ansicht) + "'); " + zeichne + " return new Promise(function(r){ setTimeout(function(){ r(h.getBoundingClientRect().top); }, 400); }); })()");
    const s = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: oben, width: b, height: h, scale: 1 } });
    const datei = path.join(ziel, ansicht + '-' + b + 'x' + h + '.png');
    fs.writeFileSync(datei, Buffer.from(s.result.data, 'base64'));
    console.log(datei);
  }
  await cdp('Emulation.clearDeviceMetricsOverride', {});
  await werte("(function(){ var h=document.getElementById('home'); h.style.right=''; h.style.bottom=''; h.style.width=''; h.style.height=''; HomeRaumDom.zeichneKarte(null, {}); HomeRaumDom.zeigeAnsicht('raum'); return 'zurueck'; })()");
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
