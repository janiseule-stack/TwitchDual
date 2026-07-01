// Minimaler statischer HTTP-Server.
//
// Warum ueberhaupt ein Server statt file://?
// Der Twitch-Player-Embed (embed.twitch.tv/embed/v1.js) verlangt einen
// `parent`-Parameter, der zur Hostname des einbettenden Fensters passt.
// Bei file:// gibt es keinen sinnvollen Hostname -> der Player laedt nicht.
// Wenn wir die Renderer stattdessen von http://localhost ausliefern, ist
// window.location.hostname === "localhost" und parent:["localhost"] passt.

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function startServer(rootDir) {
  // rootDir normalisieren (Slash-Richtung/absolut) fuer robusten Vergleich.
  const root = path.resolve(rootDir);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent(req.url.split('?')[0]);
        if (urlPath === '/') urlPath = '/index.html';
        let filePath = path.join(root, urlPath);
        // Directory-Traversal verhindern (slash-unabhaengig).
        const rel = path.relative(root, filePath);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html');
        }
        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }
          const ext = path.extname(filePath).toLowerCase();
          res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
          res.end(data);
        });
      } catch (e) {
        res.writeHead(500);
        res.end('Server error');
      }
    });

    // Port 0 = OS vergibt freien Port; nur an localhost binden.
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
    server.on('error', reject);
  });
}

module.exports = { startServer };
