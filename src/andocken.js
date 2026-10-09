// Chat-Fenster magnetisch ans Video-Fenster andocken (rechts, links, unten).
// Reine Rechnerei auf Fenster-Bounds {x, y, width, height} -> ohne Electron
// testbar. main.js haengt das an die Fensterbewegungen.
const SCHWELLE = 20;
const SEITEN = ['rechts', 'links', 'unten'];

const ueberlapptSenkrecht = (a, b) => a.y < b.y + b.height && a.y + a.height > b.y;
const ueberlapptWaagrecht = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x;

// Welche Seite ist nah genug (<= Schwelle) und liegt auch daneben? Sonst null.
function erkenneSeite(video, chat, schwelle = SCHWELLE) {
  const kandidaten = [];
  if (ueberlapptSenkrecht(chat, video)) {
    kandidaten.push(['rechts', Math.abs(chat.x - (video.x + video.width))]);
    kandidaten.push(['links', Math.abs(chat.x + chat.width - video.x)]);
  }
  if (ueberlapptWaagrecht(chat, video)) {
    kandidaten.push(['unten', Math.abs(chat.y - (video.y + video.height))]);
  }
  const nah = kandidaten.filter(([, d]) => d <= schwelle).sort((a, b) => a[1] - b[1]);
  return nah.length ? nah[0][0] : null;
}

// Sollplatz des Chats: rechts/links in Videohoehe, unten in Videobreite. Die
// jeweils andere Abmessung (Chatbreite bzw. -hoehe) bleibt, wie der Nutzer sie hat.
function position(video, chat, seite) {
  if (seite === 'rechts') return { x: video.x + video.width, y: video.y, width: chat.width, height: video.height };
  if (seite === 'links') return { x: video.x - chat.width, y: video.y, width: chat.width, height: video.height };
  return { x: video.x, y: video.y + video.height, width: video.width, height: chat.height };
}

// Hat der Nutzer den Chat weiter als die Schwelle vom Sollplatz weggezogen?
function istGeloest(soll, ist, schwelle = SCHWELLE) {
  return Math.max(Math.abs(ist.x - soll.x), Math.abs(ist.y - soll.y)) > schwelle;
}

function liesSeite(wert) {
  return SEITEN.includes(wert) ? wert : null;
}

module.exports = { SCHWELLE, erkenneSeite, position, istGeloest, liesSeite };
