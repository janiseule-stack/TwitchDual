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

let refreshTimer = null;
let favorites = [];

// --- Sichtbarkeit / Navigation --------------------------------------------
function showFavView() {
  $vodView.classList.add('hidden');
  $favView.classList.remove('hidden');
  $homeBack.classList.add('hidden');
  $homeTitle.textContent = 'Favoriten';
}

function showVodView(login, displayName) {
  $favView.classList.add('hidden');
  $vodView.classList.remove('hidden');
  $homeBack.classList.remove('hidden');
  $homeTitle.textContent = 'VODs · ' + (displayName || login);
}

function openHome() {
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

// --- Favoriten laden / anzeigen -------------------------------------------
async function loadAndRefresh() {
  favorites = await window.twitchDual.getFavorites();
  renderFavoritesSkeleton();
  await refreshLive();
}

function renderFavoritesSkeleton() {
  $favList.innerHTML = '';
  if (!favorites.length) {
    $favEmpty.classList.remove('hidden');
    return;
  }
  $favEmpty.classList.add('hidden');
}

async function refreshLive() {
  if (!favorites.length) return;
  const res = await window.twitchDual.liveStatus(favorites);
  if (!res.ok) return;
  // Live zuerst, dann nach Zuschauern.
  const channels = res.channels.slice().sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    return (b.viewers || 0) - (a.viewers || 0);
  });
  renderFavorites(channels);
}

function renderFavorites(channels) {
  $favList.innerHTML = '';
  for (const ch of channels) {
    $favList.appendChild(buildFavCard(ch));
  }
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
  else closeHome();
});
$homeClose.addEventListener('click', closeHome);
$homeBack.addEventListener('click', showFavView);
$addBtn.addEventListener('click', doAdd);
$addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
$refreshBtn.addEventListener('click', refreshLive);

// Wenn etwas geladen wird (auch via Eingabefeld), Overlay schliessen.
window.twitchDual.onLoad(() => closeHome());

// Beim Start Overlay zeigen, damit man gleich Favoriten sieht.
// (Dieses Script laeuft am Ende von <body>, die Elemente existieren bereits.)
openHome();
