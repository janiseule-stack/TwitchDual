// Dev-Werkzeug (nicht gepackt): wertet JS im laufenden TwitchDual-Fenster aus.
// App vorher starten mit: npx electron . --remote-debugging-port=9333
// Aufruf: node tools/cdp-eval.js chat "document.documentElement.dataset.theme"
//         node tools/cdp-eval.js video "..."  [--png datei.png]
const fs = require('fs');
const [,, welches, ausdruck, flag, pngDatei] = process.argv;
(async () => {
  const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
  const t = list.find((x) => x.type === 'page' && x.url.includes('/' + welches + '/index.html'));
  if (!t) throw new Error('Fenster nicht gefunden: ' + welches);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const offen = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); } });
  const cdp = (method, params) => new Promise((r) => { const i = ++id; offen.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const m = await cdp('Runtime.evaluate', { expression: ausdruck, awaitPromise: true, returnByValue: true });
  if (m.result.exceptionDetails) { console.error('FEHLER:', JSON.stringify(m.result.exceptionDetails)); process.exit(1); }
  console.log(JSON.stringify(m.result.result.value, null, 2));
  if (flag === '--png') {
    const s = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(pngDatei, Buffer.from(s.result.data, 'base64'));
    console.log('Screenshot:', pngDatei);
  }
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
