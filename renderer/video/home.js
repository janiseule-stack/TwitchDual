// Home-Overlay: eine Ansicht mit Suche, ★-Favoriten, gefolgten Kanaelen
// (Live/Offline) und Twitch-Treffern beim Suchen + VOD-Browser.
// Spec: docs/superpowers/specs/2026-10-09-home-ein-tab-design.md
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
const $liste = document.getElementById('home-liste');

// Welche Abschnitte zu sind, gemerkt.
let abschnitteZu = { ...HomeAbschnitte.STANDARD };
try { abschnitteZu = HomeAbschnitte.lies(localStorage.getItem('homeAbschnitteZu')); } catch { /* egal */ }

let kanaele = [];          // aus home-kanaele: Kanal + {favorit, gefolgt}
let gefolgtFehler = null;
let geladen = false;       // erster Stand da? (sonst Platzhalter)
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
  showKanaeleView();
  $suche.focus(); // direkt lostippen
  ladeKanaele();
  if (!refreshTimer) {
    refreshTimer = setInterval(() => {
      if (!$home.classList.contains('hidden') && !$kanaeleView.classList.contains('hidden')) ladeKanaele();
    }, 60000);
  }
}

function closeHome() {
  $home.classList.add('hidden');
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
  if (!geladen) zeichnePlatzhalter();
  const nr = ladeLauf.start();
  sterneWaehrendLaden = []; // diese Ladung liest die aktuellen Favoriten
  let res;
  try { res = await window.twitchDual.homeKanaele(); } catch (e) { res = { ok: false, error: e.message || String(e) }; }
  if (!ladeLauf.aktuell(nr)) return; // neuere Ladung kam dazwischen
  if (!res.ok) { gefolgtFehler = res.error || 'unbekannt'; geladen = true; renderHome(); return; }
  kanaele = HomeListe.sterneNachholen(res.kanaele, sterneWaehrendLaden);
  sterneWaehrendLaden = [];
  gefolgtFehler = res.gefolgtFehler;
  geladen = true;
  renderHome();
}

// Nur beim allerersten Laden schimmernde Platzhalter.
function zeichnePlatzhalter() {
  $liste.innerHTML = '';
  const grid = document.createElement('div');
  grid.id = 'live-grid';
  for (let i = 0; i < 3; i++) {
    const sk = document.createElement('div');
    sk.className = 'live-card skeleton';
    sk.innerHTML = '<div class="lc-thumbwrap"></div><div class="lc-body">' +
      '<div class="sk-line w60"></div></div>'; // statisches Markup, keine Fremddaten
    grid.appendChild(sk);
  }
  $liste.appendChild(grid);
}

function renderHome() {
  const r = HomeListe.abschnitte({ kanaele, nadel: nadel(), twitch: twitch.channels, exakt: twitch.exakt, twitchFuer: twitch.nadel, zu: abschnitteZu });
  $liste.innerHTML = '';
  if (r.keineEigenen) $liste.appendChild(emptyMsg('Keine eigenen Kanäle passen.'));
  for (const a of r.abschnitte) $liste.appendChild(abschnittBox(a));
  renderHinweis();
}

function renderHinweis() {
  let text = '';
  if (gefolgtFehler) text = 'Gefolgte Kanäle nicht abrufbar: ' + gefolgtFehler;
  else if (geladen && !loggedIn) text = 'Mit Twitch anmelden, um deine gefolgten Kanäle zu sehen.';
  else if (geladen && !kanaele.length) text = 'Noch keine Kanäle – oben suchen und mit ☆ merken.';
  $hinweis.textContent = text;
  $hinweis.classList.toggle('hidden', !text);
}

// Kopf + Inhalt eines Abschnitts. Live-Kanaele (ausser bei „Auf Twitch“)
// als Vorschau-Karten im Grid, der Rest kompakt.
function abschnittBox(a) {
  const box = document.createElement('div');
  box.className = 'home-abschnitt' + (a.offen ? '' : ' zu');
  box.dataset.art = a.art;
  const kopf = document.createElement('button');
  kopf.type = 'button';
  kopf.className = 'abschnitt-kopf';
  const pfeil = document.createElement('span'); pfeil.className = 'abschnitt-pfeil'; pfeil.textContent = '▾';
  const titel = document.createElement('span'); titel.textContent = a.titel;
  const anzahl = document.createElement('span'); anzahl.className = 'abschnitt-anzahl'; anzahl.textContent = a.kanaele.length;
  kopf.append(pfeil, titel, anzahl);
  const inhalt = document.createElement('div');
  inhalt.className = 'abschnitt-inhalt';
  const gross = a.art !== 'twitch';
  const live = gross ? a.kanaele.filter((ch) => ch.live) : [];
  if (live.length) {
    const grid = document.createElement('div');
    grid.id = 'live-grid';
    for (const ch of live) grid.appendChild(buildLiveCard(ch));
    inhalt.appendChild(grid);
  }
  for (const ch of a.kanaele) if (!live.includes(ch)) inhalt.appendChild(buildFavCard(ch));
  // Umschalten toggelt nur die Klasse (Live-Vorschauen bleiben stehen).
  kopf.addEventListener('click', () => {
    abschnitteZu = HomeAbschnitte.umschalten(abschnitteZu, a.art);
    try { localStorage.setItem('homeAbschnitteZu', JSON.stringify(abschnitteZu)); } catch { /* egal */ }
    box.classList.toggle('zu', !(nadel() || !abschnitteZu[a.art]));
  });
  box.append(kopf, inhalt);
  return box;
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
function sternKnopf(ch) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'stern' + (ch.favorit ? ' an' : '');
  b.textContent = ch.favorit ? '★' : '☆';
  b.title = ch.favorit ? 'Aus Favoriten entfernen' : 'Zu Favoriten';
  b.addEventListener('click', (e) => {
    e.stopPropagation(); // nicht den Karten-Klick (Stream laden) ausloesen
    sternUmschalten(ch);
  });
  return b;
}

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

// --- Karten ----------------------------------------------------------------------
function nameMitHaken(ch) {
  const s = document.createElement('span');
  s.textContent = ch.displayName || ch.login;
  if (ch.verifiziert) {
    const h = document.createElement('span');
    h.className = 'haken';
    h.textContent = '✓';
    h.title = 'Verifiziert';
    s.appendChild(h);
  }
  return s;
}

function buildFavCard(ch) {
  const card = document.createElement('div');
  card.className = 'fav';

  const avatar = document.createElement('img');
  avatar.className = 'avatar' + (ch.live ? ' live' : '');
  if (ch.avatar) avatar.src = ch.avatar;
  avatar.alt = '';
  avatar.onerror = () => { avatar.style.visibility = 'hidden'; };
  card.appendChild(avatar);

  const info = document.createElement('div');
  info.className = 'info';
  const name = document.createElement('div');
  name.className = 'name';
  name.appendChild(nameMitHaken(ch));
  const badge = document.createElement('span');
  badge.className = 'badge' + (ch.live ? '' : ' off');
  badge.textContent = ch.live ? 'live' : 'offline';
  name.appendChild(badge);
  info.appendChild(name);

  const meta = document.createElement('div');
  meta.className = 'meta';
  if (ch.live) {
    const parts = [];
    if (ch.viewersLabel) parts.push(ch.viewersLabel + ' Zuschauer');
    if (ch.game) parts.push(ch.game);
    meta.textContent = parts.join(' · ') + (ch.title ? ' — ' + ch.title : '');
  } else {
    meta.textContent = ch.error ? 'Status nicht abrufbar' : 'offline';
  }
  info.appendChild(meta);
  card.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const watch = document.createElement('button');
  watch.className = 'watch';
  watch.textContent = '▶ Live';
  watch.disabled = !ch.live;
  watch.addEventListener('click', () => {
    window.twitchDual.submitLoad(ch.login);
    closeHome();
  });
  actions.appendChild(watch);
  const vods = document.createElement('button');
  vods.className = 'vods';
  vods.textContent = 'VODs';
  vods.addEventListener('click', () => openVods(ch.login, ch.displayName));
  actions.appendChild(vods);
  actions.appendChild(sternKnopf(ch));
  card.appendChild(actions);
  return card;
}

// Stream-Vorschau ohne API: Twitch liefert Live-Thumbnails ueber eine
// vorhersagbare CDN-URL. Cache-Buster wechselt mit dem 60-s-Refresh.
function previewUrl(login) {
  const bust = Math.floor(Date.now() / 60000);
  return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(login)}-440x248.jpg?t=${bust}`;
}

function buildLiveCard(ch) {
  const card = document.createElement('div');
  card.className = 'live-card';
  card.title = 'Klick: Stream laden';
  card.addEventListener('click', () => {
    window.twitchDual.submitLoad(ch.login);
    closeHome();
  });

  const wrap = document.createElement('div');
  wrap.className = 'lc-thumbwrap';
  const thumb = document.createElement('img');
  thumb.className = 'lc-thumb';
  thumb.src = previewUrl(ch.login);
  thumb.alt = '';
  thumb.loading = 'lazy';
  thumb.onerror = () => { thumb.style.visibility = 'hidden'; };
  wrap.appendChild(thumb);
  const liveTag = document.createElement('span');
  liveTag.className = 'lc-live';
  liveTag.textContent = 'LIVE';
  wrap.appendChild(liveTag);
  if (ch.viewersLabel) {
    const v = document.createElement('span');
    v.className = 'lc-viewers';
    v.textContent = ch.viewersLabel + ' Zuschauer';
    wrap.appendChild(v);
  }
  card.appendChild(wrap);

  const body = document.createElement('div');
  body.className = 'lc-body';
  const avatar = document.createElement('img');
  avatar.className = 'avatar';
  if (ch.avatar) avatar.src = ch.avatar;
  avatar.alt = '';
  avatar.onerror = () => { avatar.style.visibility = 'hidden'; };
  body.appendChild(avatar);
  const info = document.createElement('div');
  info.className = 'lc-info';
  const name = document.createElement('div');
  name.className = 'lc-name';
  name.appendChild(nameMitHaken(ch));
  info.appendChild(name);
  const meta = document.createElement('div');
  meta.className = 'lc-meta';
  meta.textContent = (ch.game ? ch.game : '') + (ch.title ? (ch.game ? ' — ' : '') + ch.title : '');
  info.appendChild(meta);
  body.appendChild(info);
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'lc-actions';
  const vods = document.createElement('button');
  vods.className = 'vods';
  vods.textContent = 'VODs';
  vods.addEventListener('click', (e) => {
    e.stopPropagation(); // nicht den Karten-Klick (Stream laden) ausloesen
    openVods(ch.login, ch.displayName);
  });
  actions.appendChild(vods);
  actions.appendChild(sternKnopf(ch));
  card.appendChild(actions);

  return card;
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
