// Reine Mapper: rohe GQL-JSON -> schlanke UI-Modelle. Ohne Netzwerk -> testbar.

function formatViewers(n) {
  if (n == null) return '';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function formatDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ISO-Datum -> "vor 3 Tagen" (grob, deutsch). now optional fuer Tests.
function relativeDate(iso, now = Date.now()) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60000);
  const hrs = Math.floor(min / 60);
  const days = Math.floor(hrs / 24);
  if (days >= 30) return `vor ${Math.floor(days / 30)} Mon.`;
  if (days >= 1) return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
  if (hrs >= 1) return `vor ${hrs} Std.`;
  if (min >= 1) return `vor ${min} Min.`;
  return 'gerade eben';
}

// user-Node aus der Live-Status-Abfrage -> Modell.
function mapLiveUser(node) {
  if (!node) return null;
  const stream = node.stream || null;
  return {
    login: node.login || '',
    displayName: node.displayName || node.login || '',
    avatar: node.profileImageURL || null,
    live: !!stream,
    title: stream ? (stream.title || '') : '',
    game: stream && stream.game ? (stream.game.displayName || '') : '',
    viewers: stream ? (stream.viewersCount || 0) : 0,
    viewersLabel: stream ? formatViewers(stream.viewersCount || 0) : '',
    thumb: stream ? (stream.previewImageURL || null) : null
  };
}

// video-Node aus der VOD-Liste -> Modell.
function mapVod(node, now = Date.now()) {
  if (!node) return null;
  return {
    id: node.id,
    title: node.title || '(ohne Titel)',
    length: node.lengthSeconds || 0,
    lengthLabel: formatDuration(node.lengthSeconds || 0),
    views: node.viewCount || 0,
    viewsLabel: formatViewers(node.viewCount || 0),
    published: node.publishedAt || null,
    publishedLabel: relativeDate(node.publishedAt, now),
    thumb: node.previewThumbnailURL || null
  };
}

// Live-Kanaele nach oben, dann nach Zuschauern absteigend.
function sortByLive(list) {
  return [...list].sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    return (b.viewers || 0) - (a.viewers || 0);
  });
}

module.exports = {
  formatViewers,
  formatDuration,
  relativeDate,
  mapLiveUser,
  mapVod,
  sortByLive
};
