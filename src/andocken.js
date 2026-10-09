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

// Nie kleiner als das, sonst ist Video bzw. Chat nicht mehr benutzbar.
const MIN = { videoBreite: 480, videoHoehe: 270, chatBreite: 250, chatHoehe: 180 };

// Video + angedockter Chat muessen ganz auf den Bildschirm (wa = Arbeitsbereich
// des Monitors, auf dem das Video liegt, ohne Taskleiste). Erst ruecken, dann
// das Video verkleinern, zuletzt den Chat - nie unter MIN (Janis 09.10.2026:
// "anpassen, dass alles Platz hat, nachjustieren kann man immer noch").
function einpassen(video, chat, seite, wa) {
  const v = { ...video };
  let cw = chat.width;
  let ch = chat.height;
  const rechts = wa.x + wa.width;
  const unten = wa.y + wa.height;
  if (seite === 'unten') {
    if (v.height + ch > wa.height) v.height = Math.max(MIN.videoHoehe, wa.height - ch);
    if (v.height + ch > wa.height) ch = Math.max(MIN.chatHoehe, wa.height - v.height);
    v.width = Math.min(v.width, wa.width);
    if (v.y + v.height + ch > unten) v.y = unten - v.height - ch;
    if (v.x + v.width > rechts) v.x = rechts - v.width;
  } else {
    if (v.width + cw > wa.width) v.width = Math.max(MIN.videoBreite, wa.width - cw);
    if (v.width + cw > wa.width) cw = Math.max(MIN.chatBreite, wa.width - v.width);
    v.height = Math.min(v.height, wa.height);
    if (seite === 'rechts' && v.x + v.width + cw > rechts) v.x = rechts - v.width - cw;
    if (seite === 'links' && v.x + v.width > rechts) v.x = rechts - v.width;
    if (seite === 'links' && v.x - cw < wa.x) v.x = wa.x + cw;
    if (v.y + v.height > unten) v.y = unten - v.height;
  }
  v.x = Math.max(v.x, wa.x);
  v.y = Math.max(v.y, wa.y);
  return { video: v, chat: position(v, { ...chat, width: cw, height: ch }, seite) };
}

module.exports = { SCHWELLE, MIN, erkenneSeite, position, istGeloest, liesSeite, einpassen };
