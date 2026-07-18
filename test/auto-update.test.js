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
