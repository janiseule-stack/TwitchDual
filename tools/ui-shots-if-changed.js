// Stop-Hook-Helfer: erzeugt die UI-Screenshots nur, wenn seit dem letzten
// Commit etwas unter renderer/ geaendert wurde. So laeuft Electron nicht bei
// jeder Antwort, sondern nur wenn die UI tatsaechlich angefasst wurde.
// Aufruf (aus .claude/settings.json Stop-Hook): `node tools/ui-shots-if-changed.js`
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString();

try {
  // Geaenderte (unstaged+staged) und neue renderer/-Dateien.
  const dirty = run('git status --porcelain -- renderer').trim();
  if (!dirty) process.exit(0); // nichts an der UI geaendert -> nichts tun

  console.log('[ui-shots] renderer geaendert -> erzeuge Screenshots …');
  execSync('npm run shots', { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  // Hook darf den Ablauf nie blockieren (z.B. kein git, kein electron).
  console.log('[ui-shots] uebersprungen:', e.message);
  process.exit(0);
}
