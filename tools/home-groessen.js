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
if (!ziel) { console.error('Aufruf: node tools/home-groessen.js <zielordner> [raum|regal|karte|rueckseite|fach-1|fach-2|fach-3]'); process.exit(1); }

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
    namen: Array.from({ length: 40 }, (_, i) => 'kanal' + String(i + 1).padStart(2, '0')),
  };
}

// Beispiel-Belegung fuer zeichneRegal (Regal von nahe): 3 Cover auf dem Brett, 25
// Live-Ruecken, 12 untere Ruecken; neutrale Namen kanal01…, ohne Bilder (kein Netz).
function beispielBelegung() {
  let i = 0;
  const kanal = (live) => {
    i += 1;
    return { login: 'kanal' + String(i).padStart(2, '0'), displayName: 'kanal' + String(i).padStart(2, '0'),
      live, favorit: false, avatar: null, game: live ? 'Beispiel-Spiel' : '', viewersLabel: live ? '1,2K' : '' };
  };
  const zahl = (n, art) => Array.from({ length: n }, () => (art === 'brett' ? kanal(true) : { art, kanal: kanal(art === 'live') }));
  return { brett: zahl(3, 'brett'), live: zahl(25, 'live'), unten: zahl(12, 'offline') };
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
    // fach-1..3 (Regal von nahe): Beispiel-Belegung, Fach n, Hover auf der dritten Platte
    const karte = ansicht === 'karte' || ansicht === 'rueckseite';
    const fach = ['fach-1', 'fach-2', 'fach-3'].indexOf(ansicht) + 1;
    const regal = karte || fach > 0;
    let zeichne = regal ? 'HomeRaumDom.zeichneRegal((' + beispielBelegung.toString() + ')(), {}, {});' : '';
    if (karte) zeichne += "HomeRaumDom.zeichneKarte(null, {}); HomeRaumDom.zeichneKarte((" + beispielStand.toString() + ")('" + ansicht + "'), {});";
    if (fach) {
      const box = ['.brett-neu', '.ruecken-fach-live', '.ruecken-fach-unten'][fach - 1];
      zeichne += 'HomeRaumDom.zeigeNahFach(' + (fach - 1) + "); setTimeout(function(){ var p=document.querySelectorAll('#home " + box + " [data-login]')[2]; if (p) p.dispatchEvent(new MouseEvent('mouseenter')); }, 100);";
    }
    const oben = await werte("(function(){ var h=document.getElementById('home'); h.style.right='auto'; h.style.bottom='auto'; h.style.width='" + b + "px'; h.style.height='" + h + "px'; HomeRaumDom.zeigeAnsicht('" + (regal ? 'regal' : ansicht) + "'); HomeRaumDom.neuAusrichten(); " + zeichne + " return new Promise(function(r){ setTimeout(function(){ r(h.getBoundingClientRect().top); }, 500); }); })()");
    const s = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: oben, width: b, height: h, scale: 1 } });
    const datei = path.join(ziel, ansicht + '-' + b + 'x' + h + '.png');
    fs.writeFileSync(datei, Buffer.from(s.result.data, 'base64'));
    console.log(datei);
  }
  await cdp('Emulation.clearDeviceMetricsOverride', {});
  await werte("(function(){ var h=document.getElementById('home'); h.style.right=''; h.style.bottom=''; h.style.width=''; h.style.height=''; HomeRaumDom.zeichneKarte(null, {}); HomeRaumDom.zeichneRegal({ brett: [], live: [], unten: [] }, {}, {}); HomeRaumDom.zeigeAnsicht('raum'); return 'zurueck'; })()");
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
