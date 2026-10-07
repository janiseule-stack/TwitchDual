const { test } = require('node:test');
const assert = require('node:assert');
const { setupAutoUpdate, safeCheck } = require('../src/auto-update');

// Fake-Updater: emittiert Events wie electron-updater und laesst
// checkForUpdatesAndNotify wahlweise ablehnen (simuliert Rate-Limit/Offline).
function fakeUpdater(checkImpl) {
  const handlers = {};
  return {
    handlers,
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return this; },
    emit(ev, ...a) { (handlers[ev] || []).forEach((fn) => fn(...a)); },
    checkForUpdatesAndNotify: checkImpl,
  };
}

function collectLog() {
  const lines = [];
  const log = (event, detail) => lines.push(detail === undefined ? event : `${event}:${detail}`);
  log.lines = lines;
  return log;
}

test('safeCheck: faengt eine abgelehnte Pruefung ab, wirft nie', async () => {
  const log = collectLog();
  const updater = fakeUpdater(async () => { throw new Error('HttpError: 403 rate limit'); });
  const ok = await safeCheck(updater, log); // darf NICHT werfen
  assert.equal(ok, false);
  assert.ok(log.lines.some((l) => l.startsWith('check-failed')), `kein check-failed geloggt: ${log.lines}`);
});

test('safeCheck: erfolgreiche Pruefung gibt true zurueck', async () => {
  const log = collectLog();
  const updater = fakeUpdater(async () => ({ updateInfo: { version: '1.7.0' } }));
  assert.equal(await safeCheck(updater, log), true);
});

test('setupAutoUpdate: ungepackte App startet keinen Updater', () => {
  const log = collectLog();
  const updater = fakeUpdater(async () => { throw new Error('sollte nie laufen'); });
  const res = setupAutoUpdate(updater, log, { isPackaged: false });
  assert.equal(res.started, false);
});

test('setupAutoUpdate: verdrahtet Event-Handler und ueberlebt eine abgelehnte Erstpruefung', async () => {
  const log = collectLog();
  const updater = fakeUpdater(async () => { throw new Error('offline'); });
  let scheduled = null;
  const res = setupAutoUpdate(updater, log, {
    isPackaged: true,
    setInterval: (fn, ms) => { scheduled = { fn, ms }; return 'timer'; },
    intervalMs: 12345,
  });
  assert.equal(res.started, true);
  assert.ok(updater.handlers.error, 'error-Handler nicht registriert');
  assert.ok(updater.handlers['update-downloaded'], 'update-downloaded-Handler nicht registriert');
  assert.equal(scheduled.ms, 12345);
  await res.initialCheck; // Erstpruefung darf nicht werfen
  assert.ok(log.lines.some((l) => l.startsWith('check-failed')));
});

test('setupAutoUpdate: error-Event wird protokolliert', () => {
  const log = collectLog();
  const updater = fakeUpdater(async () => ({}));
  setupAutoUpdate(updater, log, { isPackaged: true, setInterval: () => 'timer' });
  updater.emit('error', new Error('boom'));
  assert.ok(log.lines.some((l) => l.startsWith('error') && l.includes('boom')));
});

// --- Zustand fuer die Anzeige + sofort installieren ----------------------------
const { naechsterZustand } = require('../src/auto-update');

test('naechsterZustand: suche -> laedt mit Prozent -> bereit; Fehler/aktuell zerstoeren "bereit" nicht', () => {
  let z = { phase: 'suche' };
  z = naechsterZustand(z, 'available', '1.12.0');
  assert.deepEqual(z, { phase: 'laedt', version: '1.12.0', prozent: 0 });
  z = naechsterZustand(z, 'progress', 45);
  assert.deepEqual(z, { phase: 'laedt', version: '1.12.0', prozent: 45 });
  z = naechsterZustand(z, 'downloaded', '1.12.0');
  assert.deepEqual(z, { phase: 'bereit', version: '1.12.0' });
  assert.equal(naechsterZustand(z, 'checking'), z, 'spaeterer Check laesst bereit stehen');
  assert.equal(naechsterZustand(z, 'up-to-date'), z);
  assert.equal(naechsterZustand(z, 'error', 'x'), z);
  assert.deepEqual(naechsterZustand({ phase: 'suche' }, 'error', '403'), { phase: 'fehler', fehler: '403' });
  assert.deepEqual(naechsterZustand({ phase: 'suche' }, 'up-to-date'), { phase: 'aktuell' });
});

test('setupAutoUpdate: meldet Zustaende und installiert nur, wenn fertig geladen', async () => {
  const log = collectLog();
  const updater = fakeUpdater(async () => ({}));
  let installiert = null;
  updater.quitAndInstall = (still, neustart) => { installiert = { still, neustart }; };
  const gemeldet = [];
  const st = setupAutoUpdate(updater, log, { isPackaged: true, setInterval: () => 0, onZustand: (z) => gemeldet.push(z.phase) });
  assert.equal(updater.autoDownload, true);
  assert.equal(updater.autoInstallOnAppQuit, true);
  assert.equal(st.installieren(), false, 'noch nichts geladen');
  updater.emit('checking-for-update');
  updater.emit('update-available', { version: '1.12.0' });
  updater.emit('download-progress', { percent: 50.4 });
  updater.emit('download-progress', { percent: 50.2 });   // gleiche Prozentzahl -> keine neue Meldung
  updater.emit('update-downloaded', { version: '1.12.0' });
  assert.deepEqual(gemeldet, ['laedt', 'laedt', 'bereit']);
  assert.deepEqual(st.zustand(), { phase: 'bereit', version: '1.12.0' });
  assert.equal(st.installieren(), true);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(installiert, { still: true, neustart: true });
  await st.initialCheck;
});
