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

// Zustand fuer die Anzeige in der App (vorher sah man nichts: weder Fortschritt
// noch "fertig" - und die Installation beim Beenden kam oft nicht durch, das
// Update wurde beim naechsten Start erneut geladen).
//   phase: 'suche' | 'aktuell' | 'laedt' | 'bereit' | 'fehler'
function naechsterZustand(z, ereignis, wert) {
  if (ereignis === 'checking') return z.phase === 'laedt' || z.phase === 'bereit' ? z : { phase: 'suche' };
  if (ereignis === 'available') return { phase: 'laedt', version: wert, prozent: 0 };
  if (ereignis === 'progress') return { ...z, phase: 'laedt', prozent: wert };
  if (ereignis === 'downloaded') return { phase: 'bereit', version: wert };
  if (ereignis === 'up-to-date') return z.phase === 'bereit' ? z : { phase: 'aktuell' };
  if (ereignis === 'error') return z.phase === 'bereit' ? z : { phase: 'fehler', fehler: wert };
  return z;
}

// Verdrahtet den Updater: sichtbares Event-Logging + periodischer, abgesicherter
// Check. deps (nur fuer Tests/Injektion): { isPackaged, setInterval, intervalMs,
// onZustand }. Rueckgabe zusaetzlich: zustand() und installieren().
function setupAutoUpdate(updater, log, deps = {}) {
  const isPackaged = deps.isPackaged !== undefined ? deps.isPackaged : true;
  if (!isPackaged) {
    log('skip', 'nicht gepackt');
    return { started: false };
  }

  const schedule = deps.setInterval || setInterval;
  const intervalMs = deps.intervalMs || UPDATE_INTERVAL_MS;
  const onZustand = deps.onZustand || (() => {});
  let zustand = { phase: 'suche' };
  let letzteProzent = -1;
  function weiter(ereignis, wert) {
    const neu = naechsterZustand(zustand, ereignis, wert);
    if (JSON.stringify(neu) === JSON.stringify(zustand)) return;   // nichts Neues
    zustand = neu;
    try { onZustand({ ...zustand }); } catch { /* Anzeige darf nie stoeren */ }
  }

  // Herunterladen im Hintergrund; installiert wird per Knopf (installieren)
  // oder - als Rueckfall - beim Beenden.
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  // Alle Updater-Ereignisse sichtbar machen (Diagnose kuenftiger Probleme).
  updater.on('error', (e) => { const m = e && e.message ? e.message : String(e); log('error', m); weiter('error', m); });
  updater.on('checking-for-update', () => { log('checking'); weiter('checking'); });
  updater.on('update-available', (i) => { log('available', i && i.version); weiter('available', i && i.version); });
  updater.on('update-not-available', () => { log('up-to-date'); weiter('up-to-date'); });
  updater.on('download-progress', (p) => {
    const pr = Math.round(p && p.percent || 0);
    log('progress', pr + '%');
    if (pr !== letzteProzent) { letzteProzent = pr; weiter('progress', pr); }
  });
  updater.on('update-downloaded', (i) => { log('downloaded', i && i.version); weiter('downloaded', i && i.version); });

  const initialCheck = safeCheck(updater, log);
  const timer = schedule(() => { void safeCheck(updater, log); }, intervalMs);
  return {
    started: true, timer, initialCheck,
    zustand: () => ({ ...zustand }),
    // Sofort installieren und neu starten - nur wenn wirklich fertig geladen.
    installieren() {
      if (zustand.phase !== 'bereit') return false;
      log('install-jetzt', zustand.version);
      // isSilent=true: kein Installer-Fenster; isForceRunAfter=true: App startet danach.
      setImmediate(() => updater.quitAndInstall(true, true));
      return true;
    }
  };
}

module.exports = { setupAutoUpdate, safeCheck, naechsterZustand, UPDATE_INTERVAL_MS };
