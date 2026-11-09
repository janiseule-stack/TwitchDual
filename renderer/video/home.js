// Home-Overlay: CD-Buehne mit den Live-Kanaelen (★-Favoriten zuerst), Regal
// mit den Offline-Favoriten, Suche + VOD-Browser. Steuerung und Zustand hier,
// Darstellung in home-buehne-dom.js, Reihenfolge/Blaettern in home-buehne.js.
// Plan: docs/superpowers/plans/2026-11-09-home-cd.md
// Auswahl ruft window.twitchDual.submitLoad(...) auf -> laedt beide Fenster.

const $home = document.getElementById('home');
const $homeBtn = document.getElementById('home-btn');
const $homeClose = document.getElementById('home-close');
const $homeBack = document.getElementById('home-back');
const $homeTitle = document.getElementById('home-title');
const $kanaeleView = document.getElementById('home-kanaele');
const $vodView = document.getElementById('home-vod-view');
const $vodList = document.getElementById('vod-list');
const $suche = document.getElementById('home-suche');
const $refreshBtn = document.getElementById('refresh-btn');
const $hinweis = document.getElementById('home-hinweis');

let kanaele = [];          // aus home-kanaele: Kanal + {favorit, gefolgt}
let gefolgtFehler = null;
let geladen = false;       // erster Stand da? (sonst pulsiert die Huelle)
const buehne = HomeBuehne.createBuehne();
let oeffnenAusstehend = false; // naechster Erfolg baut die Reihe neu (statt aktualisieren)
let offlineAnsicht = null;     // per Regal-Ruecken gezeigter Offline-Kanal
let rueckseite = null;         // VOD-Rueckseite der Huelle (Task 7)
let twitch = { nadel: null, channels: [], exakt: null }; // letzte Twitch-Treffer + ihr Suchtext
let sterneWaehrendLaden = []; // Stern-Klicks, die eine laufende Ladung noch nicht kennt
let suchNr = 0;            // verwirft verspaetete Suchantworten
let suchTimer = null;
let refreshTimer = null;
const ladeLauf = HomeListe.createLaufnummer(); // verwirft verspaetete home-kanaele-Antworten
let loggedIn = false;      // aus renderAuth (Login-Teil unten)

function nadel() { return $suche.value.trim().toLowerCase().replace(/^#/, ''); }

// --- Sichtbarkeit / Navigation --------------------------------------------
function showKanaeleView() {
  $vodView.classList.add('hidden');
  $kanaeleView.classList.remove('hidden');
  $homeBack.classList.add('hidden');
  $homeTitle.textContent = 'Home';
}

function showVodView(login, displayName) {
  $kanaeleView.classList.add('hidden');
  $vodView.classList.remove('hidden');
  $homeBack.classList.remove('hidden');
  $homeTitle.textContent = 'VODs · ' + (displayName || login);
}

function openHome() {
  window.twitchDual.notifyHomeOpen(); // Chat trennt die laufende Quelle
  $home.classList.remove('hidden');
  document.body.classList.add('home-offen'); // Leiste oben: nur "Ads blocked"
  showKanaeleView();
  $suche.focus(); // direkt lostippen
  oeffnenAusstehend = true; // vorne die erste CD der frischen Reihe
  offlineAnsicht = null;
  rueckseite = null;
  ladeKanaele();
  if (!refreshTimer) {
    refreshTimer = setInterval(() => {
      if (!$home.classList.contains('hidden') && !$kanaeleView.classList.contains('hidden')) ladeKanaele();
    }, 60000);
  }
}

function closeHome() {
  $home.classList.add('hidden');
  document.body.classList.remove('home-offen');
}

// Home schliessen und zur bereits laufenden Quelle zurueck -> Chat wieder
// verbinden (der Player lief unter dem Overlay weiter). NICHT benutzen, wenn
// gerade eine neue Quelle geladen wird - das erledigt onLoad im Chat selbst.
function closeHomeResume() {
  closeHome();
  window.twitchDual.notifyHomeClose();
}

// --- Laden / Zeichnen -------------------------------------------------------
async function ladeKanaele() {
  if (!geladen) renderHome(); // Huelle pulsiert bis zum ersten Stand
  const nr = ladeLauf.start();
  sterneWaehrendLaden = []; // diese Ladung liest die aktuellen Favoriten
  let res;
  try { res = await window.twitchDual.homeKanaele(); } catch (e) { res = { ok: false, error: e.message || String(e) }; }
  if (!ladeLauf.aktuell(nr)) return; // neuere Ladung kam dazwischen
  // Fehler: oeffnenAusstehend bleibt, der naechste Erfolg baut die Reihe neu.
  if (!res.ok) { gefolgtFehler = res.error || 'unbekannt'; renderHome(); return; }
  kanaele = HomeListe.sterneNachholen(res.kanaele, sterneWaehrendLaden);
  sterneWaehrendLaden = [];
  gefolgtFehler = res.gefolgtFehler;
  geladen = true;
  if (oeffnenAusstehend) { buehne.oeffnen(reihe()); oeffnenAusstehend = false; }
  else buehne.aktualisieren(reihe());
  renderHome();
}

function abschnittKanaele(r, art) {
  const a = r.abschnitte.find((x) => x.art === art);
  return a ? a.kanaele : [];
}

// Live-CDs der Buehne: ★-Favoriten zuerst, dann gefolgte - immer ungefiltert.
function reihe() {
  const r = HomeListe.abschnitte({ kanaele, nadel: '' });
  return [...abschnittKanaele(r, 'favoriten'), ...abschnittKanaele(r, 'live')];
}

// Stern-Klick ruft kein aktualisieren -> Stern-Stand der gezeigten CD aus kanaele.
function mitStern(k) {
  const f = kanaele.find((x) => x.login === k.login);
  return { ...k, favorit: f ? f.favorit : false };
}

// Text in der leeren Huelle (erste zutreffende Bedingung).
function huellenText() {
  if (!geladen) return null; // pulsiert stattdessen
  const n = nadel();
  if (n) {
    const r = HomeListe.abschnitte({ kanaele, nadel: n });
    if (r.keineEigenen) return 'Keine eigenen Kanäle passen';
    const live = abschnittKanaele(r, 'favoriten').length + abschnittKanaele(r, 'live').length;
    if (!live && abschnittKanaele(r, 'offline').length) return 'Kein Live-Treffer – unten im Regal';
  }
  if (!kanaele.length) return 'Noch keine Kanäle – oben suchen und mit ☆ merken';
  return 'Gerade spielt niemand';
}

function ladeStream(wert) {
  window.twitchDual.submitLoad(wert);
  closeHome();
}

// Handler fuer HomeBuehneDom. Rueckseite/Tracklist steuert Task 7; bis dahin
// fuehren VODs in die bisherige VOD-Ansicht.
const buehnenHandler = {
  laden: (login) => ladeStream(login),
  // Offline-Marke der Buehne nicht in kanaele uebernehmen
  stern: ({ offline, ...k }) => sternUmschalten(k),
  vods: (k) => openVods(k.login, k.displayName),
  rueckseiteZu: () => { rueckseite = null; renderHome(); },
  vod: (id) => ladeStream(id),
  mehr: (k) => openVods(k.login, k.displayName),
};
const regalHandler = {
  oeffne: (k) => { offlineAnsicht = k; rueckseite = null; renderHome(); },
  laden: (login) => ladeStream(login),
  stern: (k) => sternUmschalten(k),
};
function nachbarKlick(login) {
  buehne.springeZu(login);
  offlineAnsicht = null;
  rueckseite = null;
  renderHome();
}

function renderHome() {
  let kanal = null;
  let modus = 'live';
  if (offlineAnsicht) {
    kanal = mitStern(offlineAnsicht);
    modus = 'offline';
  } else {
    const a = buehne.aktuelle();
    if (a) { kanal = mitStern(a); modus = a.offline ? 'markiert' : 'live'; }
  }
  HomeBuehneDom.zeichneBuehne({
    kanal, modus,
    rueckseite: kanal ? rueckseite : null,
    punkte: null,
    leerText: kanal ? null : huellenText(),
    ladend: !geladen,
  }, buehnenHandler);
  const s = buehne.sichtbar();
  const i = buehne.index();
  HomeBuehneDom.zeichneNachbarn(i >= 0 ? s.slice(i + 1, i + 4) : [], nachbarKlick);
  const r = HomeListe.abschnitte({ kanaele, nadel: '' });
  const offlineFav = abschnittKanaele(r, 'offline').filter((k) => k.favorit);
  HomeBuehneDom.zeichneRegal(offlineFav.map((k) => ({ kanal: k, art: 'offline' })), regalHandler);
  renderHinweis();
}

// „Noch keine Kanäle …“ steht in der Huelle (huellenText), nicht hier.
function renderHinweis() {
  let text = '';
  if (gefolgtFehler) text = 'Gefolgte Kanäle nicht abrufbar: ' + gefolgtFehler;
  else if (geladen && !loggedIn) text = 'Mit Twitch anmelden, um deine gefolgten Kanäle zu sehen.';
  $hinweis.textContent = text;
  $hinweis.classList.toggle('hidden', !text);
}

// --- Suche -------------------------------------------------------------------
// Eigene Kanaele filtern sofort; Twitch-Treffer kommen entprellt nach.
function sucheGetippt() {
  renderHome();
  clearTimeout(suchTimer);
  const n = nadel();
  const nr = ++suchNr;
  if (n.length < HomeListe.MIN_TWITCH) return;
  suchTimer = setTimeout(async () => {
    let res = null;
    try { res = await window.twitchDual.kanalSuche(n); } catch { /* still */ }
    if (nr !== suchNr || !res || !res.ok) return; // veraltet oder Fehler
    twitch = { nadel: n, channels: res.channels || [], exakt: res.exakt || null };
    renderHome();
  }, 250);
}

// --- Stern ---------------------------------------------------------------------
// Ohne Netzabfrage: Flags lokal anpassen und neu zeichnen.
async function sternUmschalten(ch) {
  const r = ch.favorit
    ? await window.twitchDual.removeFavorite(ch.login)
    : await window.twitchDual.addFavorite(ch.login);
  if (!r.ok) return;
  sterneWaehrendLaden.push({ ch, favoriten: r.favorites }); // laufende Ladung holt ihn nach
  kanaele = HomeListe.sternAnwenden(kanaele, ch, r.favorites);
  renderHome();
}

// --- VOD-Ansicht ----------------------------------------------------------
async function openVods(login, displayName) {
  showVodView(login, displayName);
  $vodList.innerHTML = '<div class="empty">lade VODs …</div>';
  const res = await window.twitchDual.channelVods(login, 20);
  if (!res.ok) { $vodList.innerHTML = ''; $vodList.appendChild(emptyMsg('Fehler: ' + res.error)); return; }
  if (!res.vods.length) { $vodList.innerHTML = ''; $vodList.appendChild(emptyMsg('Keine VODs gefunden.')); return; }
  $vodList.innerHTML = '';
  for (const v of res.vods) $vodList.appendChild(buildVodCard(v));
}

function emptyMsg(text) {
  const d = document.createElement('div');
  d.className = 'empty';
  d.textContent = text;
  return d;
}

function buildVodCard(v) {
  const card = document.createElement('div');
  card.className = 'vod';
  card.addEventListener('click', () => {
    window.twitchDual.submitLoad(v.id);
    closeHome();
  });

  const thumbwrap = document.createElement('div');
  thumbwrap.className = 'thumbwrap';
  const thumb = document.createElement('img');
  thumb.className = 'thumb';
  if (v.thumb) thumb.src = v.thumb;
  thumb.alt = '';
  thumb.onerror = () => { thumb.style.visibility = 'hidden'; };
  thumbwrap.appendChild(thumb);
  const len = document.createElement('span');
  len.className = 'len';
  len.textContent = v.lengthLabel;
  thumbwrap.appendChild(len);
  card.appendChild(thumbwrap);

  const vinfo = document.createElement('div');
  vinfo.className = 'vinfo';
  const title = document.createElement('div');
  title.className = 'vtitle';
  title.textContent = v.title;
  vinfo.appendChild(title);
  const vmeta = document.createElement('div');
  vmeta.className = 'vmeta';
  const parts = [];
  if (v.publishedLabel) parts.push(v.publishedLabel);
  if (v.viewsLabel) parts.push(v.viewsLabel + ' Aufrufe');
  vmeta.textContent = parts.join(' · ');
  vinfo.appendChild(vmeta);
  card.appendChild(vinfo);

  return card;
}

// --- Events ---------------------------------------------------------------
$homeBtn.addEventListener('click', () => {
  if ($home.classList.contains('hidden')) openHome();
  else closeHomeResume();
});
$homeClose.addEventListener('click', closeHomeResume);
$homeBack.addEventListener('click', showKanaeleView);
$refreshBtn.addEventListener('click', ladeKanaele);
$suche.addEventListener('input', sucheGetippt);
// Enter: VOD-Link/-ID oder Kanalname direkt laden (oben gibt es kein
// Eingabefeld mehr - Kanal wechseln nur hier).
$suche.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const wert = HomeListe.enterLaden($suche.value);
  if (!wert) return;
  const r = await window.twitchDual.submitLoad(wert);
  if (r && r.ok) { $suche.value = ''; sucheGetippt(); closeHome(); return; }
  $hinweis.textContent = (r && r.error) || 'Laden fehlgeschlagen';
  $hinweis.classList.remove('hidden');
});
// Fuer die Leiste im Video-Fenster: Klick auf die Infos / Strg+L.
window.homeMitSuche = () => {
  if ($home.classList.contains('hidden')) openHome();
  else showKanaeleView();
  $suche.focus();
  $suche.select();
};

// Esc schliesst das Overlay (bzw. fuehrt aus der VOD-Ansicht zurueck).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || $home.classList.contains('hidden')) return;
  if (!$vodView.classList.contains('hidden')) showKanaeleView();
  else closeHomeResume();
});

// Wenn etwas geladen wird (auch via Eingabefeld), Overlay schliessen.
window.twitchDual.onLoad(() => closeHome());

// --- Login: ein Anmelden fuer Chat (Device Flow) + Kanalpunkte (Web) -------
// Ablauf im Main (IPC 'anmelden'): ein Twitch-Fenster, nur fehlende Schritte.
const $authState = document.getElementById('auth-state');
const $authLogin = document.getElementById('auth-login');
const $authLogout = document.getElementById('auth-logout');

let authBekannt = false; // erster Status kommt beim Start; openHome laedt da schon
let chatLogin = { loggedIn: false, displayName: null };
let punkteLogin = false;

function zeigeAnmeldung() {
  const a = Anmeldung.anzeige({ chat: chatLogin.loggedIn, punkte: punkteLogin, name: chatLogin.displayName });
  $authState.textContent = a.text;
  $authLogin.textContent = a.knopf || '';
  $authLogin.classList.toggle('hidden', !a.knopf);
  $authLogout.classList.toggle('hidden', !a.abmelden);
  document.getElementById('auth-bar').classList.toggle('unvollstaendig', chatLogin.loggedIn !== punkteLogin);
}

function renderAuth(st) {
  const vorher = loggedIn;
  chatLogin = { loggedIn: !!(st && st.loggedIn), displayName: st && st.displayName };
  loggedIn = chatLogin.loggedIn;
  zeigeAnmeldung();
  // Anmelden/Abmelden aendert die gefolgten Kanaele -> neu laden, falls offen.
  const wechsel = authBekannt && vorher !== loggedIn;
  authBekannt = true;
  if (wechsel && !$home.classList.contains('hidden')) ladeKanaele();
  else if (geladen) renderHinweis();
}

window.twitchDual.authStatus().then(renderAuth).catch(() => {});
window.twitchDual.onAuthChanged(renderAuth);
window.twitchDual.webLoginStatus().then((s) => { punkteLogin = !!(s && s.angemeldet); zeigeAnmeldung(); }).catch(() => {});
window.twitchDual.onWebLoginGeaendert((s) => { punkteLogin = !!(s && s.angemeldet); zeigeAnmeldung(); });

$authLogin.addEventListener('click', async () => {
  $authLogin.disabled = true;
  const r = await window.twitchDual.anmelden();
  $authLogin.disabled = false;
  if (!r.ok) $authState.textContent = r.error;
  window.twitchDual.webLoginStatus().then((s) => { punkteLogin = !!(s && s.angemeldet); zeigeAnmeldung(); }).catch(() => {});
});
$authLogout.addEventListener('click', () => window.twitchDual.abmelden());

// Beim Start Overlay zeigen, damit man gleich seine Kanaele sieht.
// (Dieses Script laeuft am Ende von <body>, die Elemente existieren bereits.)
openHome();
