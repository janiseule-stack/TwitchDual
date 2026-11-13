// Misst je Chat-Groesse, welcher Teil des Stadtbilds (344x277) sichtbar ist und ob
// leuchtende Wolke + Blitz-Strahl darin liegen. Fotografiert jede Groesse mit Blitz.
// Aufruf: node blitz-sicht.js <zielordner>
const fs = require('fs');
const path = require('path');
const ziel = process.argv[2];
const GROESSEN = [[1397, 1332], [480, 1390], [400, 1332], [900, 1000], [1397, 700], [1397, 400], [2560, 1440]];

(async () => {
  const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
  const t = list.find((x) => x.type === 'page' && x.url.includes('/chat/index.html'));
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
  fs.mkdirSync(ziel, { recursive: true });
  const zeilen = [];
  for (const [b, h] of GROESSEN) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: b, height: h, deviceScaleFactor: 1, mobile: false });
    await new Promise((r) => setTimeout(r, 500));
    const m = await werte(`(function(){
      var e = document.getElementById('stadt'); var r = e.getBoundingClientRect();
      var cs = getComputedStyle(e);
      var f = parseFloat(cs.getPropertyValue('--stadt-f')), l = parseFloat(cs.getPropertyValue('--stadt-links')), o = parseFloat(cs.getPropertyValue('--stadt-oben'));
      var sx0 = -l / f, sx1 = sx0 + r.width / f, sy0 = -o / f;
      var sicht = { links: sx0, rechts: sx1, oben: sy0 };
      // welche Wolken die App fuer einen Blitz in Frage zieht (Mittelwert-Zufall 0..1 abtasten)
      var moeglich = {};
      for (var z = 0; z < 1; z += 0.05) { var ziel = Stadt.blitzZiel(sicht, function () { return z; }); if (ziel) moeglich[Stadt.STADT.blitzWolken[ziel.wolke].datei.replace('stadt-himmel-blitz-', '').replace('.png', '')] = 1; }
      return { wirt: [Math.round(r.width), Math.round(r.height)], f: +f.toFixed(2),
        sicht: [Math.round(sx0), Math.round(sx1), Math.round(sy0), 277],
        wolken: Object.keys(moeglich) };
    })()`);
    zeilen.push(b + 'x' + h + ' ' + JSON.stringify(m));
    await werte('stadt.blitz(); new Promise(function(r){ setTimeout(r, 120); })');
    const s = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ziel, 'chat-' + b + 'x' + h + '.png'), Buffer.from(s.result.data, 'base64'));
  }
  await cdp('Emulation.clearDeviceMetricsOverride', {});
  console.log(zeilen.join('\n'));
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
