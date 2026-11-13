const { test } = require('node:test');
const assert = require('node:assert');
const m = require('../src/browse-map');

test('formatViewers', () => {
  assert.equal(m.formatViewers(999), '999');
  assert.equal(m.formatViewers(1000), '1K');
  assert.equal(m.formatViewers(22384), '22.4K');
  assert.equal(m.formatViewers(1500000), '1.5M');
});

test('formatDuration', () => {
  assert.equal(m.formatDuration(45), '45s');
  assert.equal(m.formatDuration(125), '2m 5s');
  assert.equal(m.formatDuration(9426), '2h 37m');
});

test('relativeDate', () => {
  const now = new Date('2026-07-02T12:00:00Z').getTime();
  assert.equal(m.relativeDate('2026-07-02T11:59:30Z', now), 'gerade eben');
  assert.equal(m.relativeDate('2026-07-02T10:00:00Z', now), 'vor 2 Std.');
  assert.equal(m.relativeDate('2026-06-30T12:00:00Z', now), 'vor 2 Tagen');
  assert.equal(m.relativeDate(null, now), '');
});

test('mapLiveUser: live', () => {
  const r = m.mapLiveUser({
    login: 'xqc', displayName: 'xQc', profileImageURL: 'http://a/av.jpg',
    stream: { title: 'T', viewersCount: 22384, game: { displayName: 'Chatting' }, previewImageURL: 'http://a/p.jpg' }
  });
  assert.equal(r.live, true);
  assert.equal(r.viewers, 22384);
  assert.equal(r.viewersLabel, '22.4K');
  assert.equal(r.game, 'Chatting');
  assert.equal(r.thumb, 'http://a/p.jpg');
});

test('mapLiveUser: offline (stream null)', () => {
  const r = m.mapLiveUser({ login: 'twitch', displayName: 'Twitch', stream: null });
  assert.equal(r.live, false);
  assert.equal(r.viewers, 0);
  assert.equal(r.thumb, null);
});

test('mapLiveUser: start aus stream.createdAt', () => {
  const r = m.mapLiveUser({ login: 'kanal_a', stream: { createdAt: '2026-11-09T10:00:00Z' } });
  assert.equal(r.start, '2026-11-09T10:00:00Z');
});

test('mapLiveUser: start null offline oder ohne Feld', () => {
  assert.equal(m.mapLiveUser({ login: 'kanal_a', stream: null }).start, null);
  assert.equal(m.mapLiveUser({ login: 'kanal_a', stream: { title: 't' } }).start, null);
});

test('mapLiveUser: null node -> null', () => {
  assert.equal(m.mapLiveUser(null), null);
});

test('mapVod', () => {
  const now = new Date('2026-07-02T12:00:00Z').getTime();
  const r = m.mapVod({
    id: '123', title: 'Stream', lengthSeconds: 3600,
    viewCount: 2868, publishedAt: '2026-07-01T12:00:00Z', previewThumbnailURL: 'http://a/t.jpg'
  }, now);
  assert.equal(r.id, '123');
  assert.equal(r.lengthLabel, '1h 0m');
  assert.equal(r.viewsLabel, '2.9K');
  assert.equal(r.publishedLabel, 'vor 1 Tag');
});

test('sortByLive: live zuerst, dann Zuschauer', () => {
  const list = [
    { login: 'a', live: false, viewers: 0 },
    { login: 'b', live: true, viewers: 100 },
    { login: 'c', live: true, viewers: 5000 }
  ];
  assert.deepEqual(m.sortByLive(list).map((x) => x.login), ['c', 'b', 'a']);
});

test('mapVod: Platzhalter-Bild eines VODs in Aufnahme -> kein Bild, laeuft markiert', () => {
  // Twitch liefert fuer laufende Aufnahmen .../_404/404_processing_...png (antwortet 403)
  const r = m.mapVod({ id: '1', status: 'RECORDING',
    previewThumbnailURL: 'https://vod-secure.twitch.tv/_404/404_processing_640x360.png' });
  assert.equal(r.thumb, null);
  assert.equal(r.aufnahme, true);
  const fertig = m.mapVod({ id: '2', status: 'RECORDED', previewThumbnailURL: 'http://a/t.jpg' });
  assert.equal(fertig.thumb, 'http://a/t.jpg');
  assert.equal(fertig.aufnahme, false);
  assert.equal(m.echteVorschau('https://vod-secure.twitch.tv/_404/404_processing_640x360.png'), null);
  assert.equal(m.echteVorschau(null), null);
  assert.equal(m.echteVorschau('http://a/t.jpg'), 'http://a/t.jpg');
});

test('mapVod: Spiel', () => {
  assert.equal(m.mapVod({ id: '1', game: { displayName: 'Spiel' } }).game, 'Spiel');
  assert.equal(m.mapVod({ id: '1', game: null }).game, '');
  assert.equal(m.mapVod({ id: '1' }).game, '');
});

test('sortByLive: Offline alphabetisch nach Anzeigename (case-insensitiv)', () => {
  const list = [
    { login: 'zeta', displayName: 'Zeta', live: false },
    { login: 'alpha', displayName: 'alpha', live: false },
    { login: 'mitte', displayName: 'Mitte', live: false },
    { login: 'l', displayName: 'L', live: true, viewers: 1 }
  ];
  assert.deepEqual(m.sortByLive(list).map((x) => x.login), ['l', 'alpha', 'mitte', 'zeta']);
});
