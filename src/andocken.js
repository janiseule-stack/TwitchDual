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

// Chat-Masse wie auf twitch.tv: genug Platz daneben -> der Chat nimmt ihn
// (hoechstens seine eigene Groesse); unter MIN_PLATZ bekommt er die
// Komfort-Groesse und das Video macht dafuer Platz.
const KOMFORT = { chatBreite: 340, chatHoehe: 250 };
const MIN_PLATZ = { breite: 300, hoehe: 200 };

// Video + angedockter Chat ganz auf den Monitor (wa = Arbeitsbereich ohne
// Taskleiste). Das Video bleibt, wie es ist; angepasst wird der Chat
// (Janis 09.10.2026: "der Chat soll kleiner gemacht werden, so dass es passt").
function einpassen(video, chat, seite, wa) {
  const v = { ...video };
  let cw = chat.width;
  let ch = chat.height;
  const R = wa.x + wa.width;
  const U = wa.y + wa.height;
  if (seite === 'unten') {
    v.width = Math.min(v.width, wa.width);
    const platz = U - (v.y + v.height);
    ch = platz >= MIN_PLATZ.hoehe ? Math.min(ch, platz) : Math.min(ch, KOMFORT.chatHoehe);
    if (v.height + ch > wa.height) v.height = wa.height - ch;
    if (v.y + v.height + ch > U) v.y = U - v.height - ch;
    if (v.x + v.width > R) v.x = R - v.width;
  } else {
    v.height = Math.min(v.height, wa.height);
    const platz = seite === 'rechts' ? R - (v.x + v.width) : v.x - wa.x;
    cw = platz >= MIN_PLATZ.breite ? Math.min(cw, platz) : Math.min(cw, KOMFORT.chatBreite);
    if (v.width + cw > wa.width) v.width = wa.width - cw;
    if (seite === 'rechts' && v.x + v.width + cw > R) v.x = R - v.width - cw;
    if (seite === 'links' && v.x - cw < wa.x) v.x = wa.x + cw;
    if (v.y + v.height > U) v.y = U - v.height;
  }
  v.x = Math.max(v.x, wa.x);
  v.y = Math.max(v.y, wa.y);
  return { video: v, chat: position(v, { ...chat, width: cw, height: ch }, seite) };
}

// Knopf "Video + Chat bildschirmfuellend": Video links, Chat rechts mit ~20 %
// der Breite (340-480 px), beide in voller Hoehe.
function vollbild(wa) {
  const cw = Math.min(480, Math.max(340, Math.round(wa.width * 0.2)));
  return {
    video: { x: wa.x, y: wa.y, width: wa.width - cw, height: wa.height },
    chat: { x: wa.x + wa.width - cw, y: wa.y, width: cw, height: wa.height }
  };
}

// Nur-Video: Video 16:9 so gross wie moeglich (mind. Komfortbreite fuer den
// Chat bleibt frei), senkrecht mittig; der Chat fuellt den Rest daneben in
// voller Hoehe (Janis 09.10.2026: "dass alles ausgefuellt wird").
function nurVideo(wa) {
  const vw = Math.min(Math.round(wa.height * 16 / 9), wa.width - KOMFORT.chatBreite);
  const vh = Math.round(vw * 9 / 16);
  return {
    video: { x: wa.x, y: wa.y + Math.floor((wa.height - vh) / 2), width: vw, height: vh },
    chat: { x: wa.x + vw, y: wa.y, width: wa.width - vw, height: wa.height }
  };
}

// Trennlinie zwischen Video und Chat (◫ bzw. Nur-Video): Video links bis zur
// Linie, Chat rechts bis zum Bildschirmrand in voller Hoehe. Nur-Video bleibt
// 16:9 und senkrecht mittig; passt das nicht in die Hoehe, rueckt die Linie.
const MIN_TEILUNG = { video: 480, chat: 250 };
function teile(wa, linie, modus) {
  const R = wa.x + wa.width;
  let x = Math.min(R - MIN_TEILUNG.chat, Math.max(wa.x + MIN_TEILUNG.video, Math.round(linie)));
  let video;
  if (modus === 'nurvideo') {
    let vw = x - wa.x;
    let vh = Math.round(vw * 9 / 16);
    if (vh > wa.height) { vh = wa.height; vw = Math.round(vh * 16 / 9); x = wa.x + vw; }
    video = { x: wa.x, y: wa.y + Math.floor((wa.height - vh) / 2), width: vw, height: vh };
  } else {
    video = { x: wa.x, y: wa.y, width: x - wa.x, height: wa.height };
  }
  return { video, chat: { x, y: wa.y, width: R - x, height: wa.height } };
}

module.exports = { SCHWELLE, KOMFORT, erkenneSeite, position, istGeloest, liesSeite, einpassen, vollbild, nurVideo, teile };
