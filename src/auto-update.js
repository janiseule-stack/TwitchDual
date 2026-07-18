'use strict';

// Robuste, beobachtbare Auto-Update-Verdrahtung (GitHub Releases).
//
// Warum ein eigenes Modul: electron-updaters checkForUpdatesAndNotify() liefert
// bei JEDEM fehlgeschlagenen Check (offline, GitHub-Rate-Limit 60/h unauth.,
// Checksumme) ein *rejectendes* Promise (AppUpdater.js). Ohne .catch wurde daraus
// eine Unhandled Rejection, die den Main-Prozess abschoss — genau der Bug
// "Updater ~3x oeffnen -> Crash -> dann laeuft das Update". Hier wird jeder
// Aufruf zentral abgefangen und jedes Ereignis protokolliert (vorher nur
// unsichtbares console.error in der gepackten App).

const UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;

// Fuehrt einen Update-Check aus und faengt JEDE Ablehnung ab. Wirft nie.
// Rueckgabe: true bei erfolgreichem Check, false bei Fehler.
async function safeCheck(updater, log) {
  try {
    await updater.checkForUpdatesAndNotify();
    return true;
  } catch (e) {
    log('check-failed', e && e.message ? e.message : String(e));
    return false;
  }
}

// Verdrahtet den Updater: sichtbares Event-Logging + periodischer, abgesicherter
// Check. deps (nur fuer Tests/Injektion): { isPackaged, setInterval, intervalMs }.
function setupAutoUpdate(updater, log, deps = {}) {
  const isPackaged = deps.isPackaged !== undefined ? deps.isPackaged : true;
  if (!isPackaged) {
    log('skip', 'nicht gepackt');
    return { started: false };
  }

  const schedule = deps.setInterval || setInterval;
  const intervalMs = deps.intervalMs || UPDATE_INTERVAL_MS;

  // Alle Updater-Ereignisse sichtbar machen (Diagnose kuenftiger Probleme).
  updater.on('error', (e) => log('error', e && e.message ? e.message : String(e)));
  updater.on('checking-for-update', () => log('checking'));
  updater.on('update-available', (i) => log('available', i && i.version));
  updater.on('update-not-available', () => log('up-to-date'));
  updater.on('download-progress', (p) => log('progress', Math.round(p && p.percent || 0) + '%'));
  updater.on('update-downloaded', (i) => log('downloaded', i && i.version));

  const initialCheck = safeCheck(updater, log);
  const timer = schedule(() => { void safeCheck(updater, log); }, intervalMs);
  return { started: true, timer, initialCheck };
}

module.exports = { setupAutoUpdate, safeCheck, UPDATE_INTERVAL_MS };
