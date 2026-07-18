// Home-Overlay: Favoriten mit Live-Status + VOD-Browser.
// Auswahl ruft window.twitchDual.submitLoad(...) auf -> laedt beide Fenster.

const $home = document.getElementById('home');
const $homeBtn = document.getElementById('home-btn');
const $homeClose = document.getElementById('home-close');
const $homeBack = document.getElementById('home-back');
const $homeTitle = document.getElementById('home-title');
const $favView = document.getElementById('home-fav-view');
const $vodView = document.getElementById('home-vod-view');
const $favList = document.getElementById('fav-list');
const $favEmpty = document.getElementById('fav-empty');
const $vodList = document.getElementById('vod-list');
const $addInput = document.getElementById('add-input');
const $addBtn = document.getElementById('add-btn');
const $refreshBtn = document.getElementById('refresh-btn');
const $filterInput = document.getElementById('filter-input');
const $favNoMatch = document.getElementById('fav-nomatch');
const $favTools = document.getElementById('fav-tools-toggle');

// Suche/Hinzufuegen ein-/ausblendbar; Zustand bleibt ueber Sitzungen erhalten.
let toolsCollapsed = false;
try { toolsCollapsed = localStorage.getItem('favToolsCollapsed') === '1'; } catch { /* egal */ }
function applyToolsState() {
  $favView.classList.toggle('tools-collapsed', toolsCollapsed);
  $favTools.classList.toggle('active', toolsCollapsed);
}

let refreshTimer = null;
let favorites = [];
let lastChannels = []; // letzter Live-Status (sortiert vom Main-Prozess)

// --- Sichtbarkeit / Navigation --------------------------------------------
function showFavView() {
  $vodView.classList.add('hidden');
  $favView.classList.remove('hidden');
  $homeBack.classList.add('hidden');
  $favTools.classList.remove('hidden'); // Umschalter nur bei Favoriten
  $homeTitle.textContent = 'Favoriten';
}

function showVodView(login, displayName) {
  $favView.classList.add('hidden');
  $vodView.classList.remove('hidden');
  $homeBack.classList.remove('hidden');
  $favTools.classList.add('hidden'); // in der VOD-Ansicht kein Suchfeld
  $homeTitle.textContent = 'VODs · ' + (displayName || login);
}

function openHome() {
  window.twitchDual.notifyHomeOpen(); // Chat trennt die laufende Quelle
  $home.classList.remove('hidden');
  showFavView();
  loadAndRefresh();
  if (!refreshTimer) {
    refreshTimer = setInterval(() => {
      if (!$home.classList.contains('hidden') && !$favView.classList.contains('hidden')) {
        refreshLive();
      }
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

// --- Favoriten laden / anzeigen -------------------------------------------
async function loadAndRefresh() {
  favorites = await window.twitchDual.getFavorites();
  renderFavoritesSkeleton();
  await refreshLive();
}

function renderFavoritesSkeleton() {
  $favList.innerHTML = '';
  $favNoMatch.classList.add('hidden');
  if (!favorites.length) {
    lastChannels = [];
    $favEmpty.classList.remove('hidden');
    return;
  }
  $favEmpty.classList.add('hidden');
  // Nur beim allerersten Laden (noch kein Live-Status da) schimmernde
  // Platzhalter zeigen; spaetere Refreshes ersetzen die Daten in place.
  if (!lastChannels.length) {
    const grid = document.createElement('div');
    grid.id = 'live-grid';
    const n = Math.min(favorites.length, 3);
    for (let i = 0; i < n; i++) {
      const sk = document.createElement('div');
      sk.className = 'live-card skeleton';
      sk.innerHTML = '<div class="lc-thumbwrap"></div><div class="lc-body">' +
        '<div class="sk-line w60"></div></div>'; // statisches Markup, keine Fremddaten
      grid.appendChild(sk);
    }
    $favList.appendChild(grid);
  }
}

async function refreshLive() {
  if (!favorites.length) return;
  const res = await window.twitchDual.liveStatus(favorites);
  if (!res.ok) return;
  // Sortierung (live zuerst, dann Zuschauer) macht der Main-Prozess
  // via browse-map.sortByLive - hier nur noch rendern.
  lastChannels = res.channels;
  renderFavorites();
}

// Filter ueber Name, Spiel und Stream-Titel (case-insensitiv).
function matchesFilter(ch, needle) {
  if (!needle) return true;
  const hay = `${ch.login} ${ch.displayName} ${ch.game || ''} ${ch.title || ''}`.toLowerCase();
  return hay.includes(needle);
}

function renderFavorites() {
  const needle = $filterInput.value.trim().toLowerCase();
  const filtered = lastChannels.filter((ch) => matchesFilter(ch, needle));
  $favList.innerHTML = '';
  // Live-Kanaele als grosse Vorschau-Karten im Grid, offline kompakt darunter.
  const live = filtered.filter((ch) => ch.live);
  const off = filtered.filter((ch) => !ch.live);
  if (live.length) {
    const grid = document.createElement('div');
    grid.id = 'live-grid';
    for (const ch of live) grid.appendChild(buildLiveCard(ch));
    $favList.appendChild(grid);
  }
  for (const ch of off) $favList.appendChild(buildFavCard(ch));
  $favNoMatch.classList.toggle('hidden', !(lastChannels.length && !filtered.length));
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
  const nameText = document.createElement('span');
  nameText.textContent = ch.displayName || ch.login;
  name.appendChild(nameText);
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

  const remove = document.createElement('button');
  remove.className = 'remove';
  remove.textContent = '✕';
  remove.title = 'Aus Favoriten entfernen';
  remove.addEventListener('click', async (e) => {
    e.stopPropagation();
    const r = await window.twitchDual.removeFavorite(ch.login);
    if (r.ok) { favorites = r.favorites; renderFavoritesSkeleton(); refreshLive(); }
  });
  actions.appendChild(remove);

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
  name.textContent = ch.displayName || ch.login;
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
  const remove = document.createElement('button');
  remove.className = 'remove';
  remove.textContent = '✕';
  remove.title = 'Aus Favoriten entfernen';
  remove.addEventListener('click', async (e) => {
    e.stopPropagation();
    const r = await window.twitchDual.removeFavorite(ch.login);
    if (r.ok) { favorites = r.favorites; renderFavoritesSkeleton(); refreshLive(); }
  });
  actions.appendChild(remove);
  card.appendChild(actions);

  return card;
}

// --- Favoriten hinzufuegen ------------------------------------------------
async function doAdd() {
  const name = $addInput.value.trim();
  if (!name) return;
  const r = await window.twitchDual.addFavorite(name);
  if (!r.ok) { $addInput.placeholder = r.error; return; }
  $addInput.value = '';
  favorites = r.favorites;
  renderFavoritesSkeleton();
  refreshLive();
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
$homeBack.addEventListener('click', showFavView);
$addBtn.addEventListener('click', doAdd);
$addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
$refreshBtn.addEventListener('click', refreshLive);
$filterInput.addEventListener('input', renderFavorites);
$favTools.addEventListener('click', () => {
  toolsCollapsed = !toolsCollapsed;
  try { localStorage.setItem('favToolsCollapsed', toolsCollapsed ? '1' : '0'); } catch { /* egal */ }
  applyToolsState();
});
applyToolsState();

// Esc schliesst das Overlay (bzw. fuehrt aus der VOD-Ansicht zurueck).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || $home.classList.contains('hidden')) return;
  if (!$vodView.classList.contains('hidden')) showFavView();
  else closeHomeResume();
});

// Wenn etwas geladen wird (auch via Eingabefeld), Overlay schliessen.
window.twitchDual.onLoad(() => closeHome());

// --- Login (Device Flow) ---------------------------------------------------
const $authState = document.getElementById('auth-state');
const $authLogin = document.getElementById('auth-login');
const $authLogout = document.getElementById('auth-logout');
const $authCode = document.getElementById('auth-code');
const $authUri = document.getElementById('auth-uri');
const $authCodeVal = document.getElementById('auth-code-val');
const $authCopy = document.getElementById('auth-copy');
const $authOpen = document.getElementById('auth-open');

let loggedIn = false;

function renderAuth(st) {
  loggedIn = !!(st && st.loggedIn);
  $authState.textContent = loggedIn ? ('Angemeldet als ' + st.displayName) : 'Nicht angemeldet';
  $authLogin.classList.toggle('hidden', loggedIn);
  $authLogout.classList.toggle('hidden', !loggedIn);
  if (loggedIn) $authCode.classList.add('hidden');
  if (typeof refreshFollowed === 'function') refreshFollowed(); // Task 8
}

window.twitchDual.authStatus().then(renderAuth).catch(() => {});
window.twitchDual.onAuthChanged(renderAuth);

$authLogin.addEventListener('click', async () => {
  $authLogin.disabled = true;
  const r = await window.twitchDual.authStart();
  $authLogin.disabled = false;
  if (!r.ok) { $authState.textContent = 'Fehler: ' + r.error; return; }
  $authUri.textContent = (r.verification_uri || 'https://www.twitch.tv/activate').replace(/^https?:\/\//, '');
  $authUri.dataset.href = r.verification_uri;
  $authCodeVal.textContent = r.user_code;
  $authCode.classList.remove('hidden');
});
$authCopy.addEventListener('click', () => {
  navigator.clipboard && navigator.clipboard.writeText($authCodeVal.textContent).catch(() => {});
});
$authOpen.addEventListener('click', () => {
  // Externer Browser: main.js setzt am Video-Fenster einen
  // setWindowOpenHandler, der http(s)-Ziele an shell.openExternal gibt.
  window.open($authUri.dataset.href || 'https://www.twitch.tv/activate', '_blank');
});
$authLogout.addEventListener('click', () => window.twitchDual.authLogout());

// Beim Start Overlay zeigen, damit man gleich Favoriten sieht.
// (Dieses Script laeuft am Ende von <body>, die Elemente existieren bereits.)
openHome();
