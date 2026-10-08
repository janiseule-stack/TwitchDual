// Haengt sich per CDP an das twitch.tv-Fenster der laufenden Dev-App,
// laedt es neu und schneidet GQL + WebSockets zu Pins/Umfragen/Vorhersagen mit.
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const [,, kanal, sek = '60'] = process.argv;
const OUT = path.join(require('os').tmpdir(), `twitchdual-mitschnitt-${kanal}.jsonl`);
fs.writeFileSync(OUT, '');
const log = (o) => fs.appendFileSync(OUT, JSON.stringify({ t: Date.now(), ...o }) + '\n');
const redact = (s) => String(s)
  .replace(/("token"\s*:\s*")[^"]+/gi, '$1<X>')
  .replace(/(OAuth )\S+/gi, '$1<X>')
  .replace(/(PASS oauth:)\S+/gi, '$1<X>');
const INTERESSANT = /poll|pin|prediction/i;

(async () => {
  const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
  const t = list.find((x) => x.type === 'page' && new RegExp('twitch\\.tv/' + kanal + '(\\b|$)', 'i').test(x.url));
  if (!t) { console.error('Kein Fenster fuer', kanal, '-', list.map((x) => x.url).join(' | ')); process.exit(1); }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));
  let id = 0; const offen = new Map(); const gqlReq = new Map();
  const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; offen.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.on('message', async (raw) => {
    const m = JSON.parse(raw);
    if (m.id && offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); return; }
    const p = m.params;
    try {
      if (m.method === 'Network.requestWillBeSent' && /gql\.twitch\.tv/.test(p.request.url) && p.request.postData) {
        let body; try { body = JSON.parse(p.request.postData); } catch { body = p.request.postData; }
        const ops = (Array.isArray(body) ? body : [body]).map((b) => ({ op: b.operationName, vars: b.variables, query: b.query, hash: b.extensions?.persistedQuery?.sha256Hash }));
        gqlReq.set(p.requestId, ops);
        log({ art: 'gql-req', ops: ops.map((o) => o.op) });
        for (const o of ops) if (INTERESSANT.test(JSON.stringify(o))) log({ art: 'gql-req-voll', ...o });
      }
      if (m.method === 'Network.loadingFinished' && gqlReq.has(p.requestId)) {
        const ops = gqlReq.get(p.requestId); gqlReq.delete(p.requestId);
        const r = await cdp('Network.getResponseBody', { requestId: p.requestId });
        const body = r.result?.body || '';
        if (INTERESSANT.test(body)) log({ art: 'gql-res', ops: ops.map((o) => o.op), body: redact(body).slice(0, 500000) });
      }
      if (m.method === 'Network.webSocketCreated') log({ art: 'ws-neu', url: redact(p.url) });
      if (m.method === 'Network.webSocketFrameSent') log({ art: 'ws-out', d: redact(p.response.payloadData).slice(0, 3000) });
      if (m.method === 'Network.webSocketFrameReceived') {
        const d = p.response.payloadData;
        if (/keepalive/.test(d) && d.length < 200) return;
        if (/PRIVMSG/.test(d)) return;
        log({ art: 'ws-in', d: redact(d).slice(0, 6000) });
      }
    } catch (err) { log({ art: 'fehler', msg: String(err) }); }
  });
  await cdp('Network.enable', { maxPostDataSize: 1 << 20 });
  await cdp('Page.reload', { ignoreCache: true });
  log({ art: 'neu-geladen', url: t.url });
  setTimeout(async () => {
    const r = await cdp('Runtime.evaluate', { returnByValue: true, expression: `
      [...document.querySelectorAll('[class*="pinned" i],[class*="poll" i],[class*="prediction" i],[data-test-selector*="pin" i],[data-test-selector*="poll" i]')]
        .slice(0, 15).map(e => ({ cls: String(e.className).slice(0,120), sel: e.getAttribute('data-test-selector'), txt: e.innerText.slice(0, 300) }))` });
    log({ art: 'dom', dom: r.result?.result?.value });
    process.exit(0);
  }, Number(sek) * 1000);
})().catch((e) => { console.error(e.message); process.exit(1); });
