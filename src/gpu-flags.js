// GPU-Flag-Entscheidung fuer TwitchDual.
//
// Bewusst ohne require('electron') — die Logik muss mit `node --test`
// pruefbar bleiben. main.js reicht Electron-Objekte von aussen herein.

// Reihenfolge ist dokumentiert (siehe Spec) und wird vom Test festgenagelt.
const SWITCHES = [
  'ignore-gpu-blocklist',
  'enable-gpu-rasterization',
  'enable-zero-copy',
  'enable-hardware-overlays',
  'disable-gpu-driver-bug-workarounds'
];

const DEFAULT_STATE = { mode: 'accel', pending: false };

// 'safe' heisst: keine Flags setzen. Nicht: Hardwarebeschleunigung abschalten.
function decideMode(state, env) {
  if (env && env.TWITCHDUAL_NO_GPU === '1') return 'safe';
  const s = state || DEFAULT_STATE;
  if (s.mode === 'safe') return 'safe';
  // Offene Marke = der vorige Start hat das Rendern nicht ueberlebt.
  if (s.pending) return 'safe';
  return 'accel';
}

function nextState(state, event) {
  const s = { ...DEFAULT_STATE, ...(state || {}) };
  switch (event) {
    case 'start-accel': return { mode: 'accel', pending: true };
    case 'start-safe': return { mode: 'safe', pending: false };
    case 'render-ok': return { mode: s.mode, pending: false };
    case 'gpu-crash': return { mode: 'safe', pending: false };
    default: return s;
  }
}

// Wendet die Flags an und liefert den Zustand zurueck, den der Aufrufer
// speichern muss. Kennt weder electron-store noch app — beides kommt von aussen.
function applyGpuFlags({ commandLine, state, env, log }) {
  const erzwungen = !!(env && env.TWITCHDUAL_NO_GPU === '1');
  const mode = decideMode(state, env);
  if (mode === 'accel') {
    for (const name of SWITCHES) commandLine.appendSwitch(name);
  }
  log('gpu-mode', erzwungen ? 'safe (erzwungen)' : mode);
  // Der Not-Aus gilt nur fuer diesen Start. Wuerden wir hier 'start-safe'
  // fortschreiben, blieben die Flags nach dem Entfernen der Variable
  // dauerhaft aus — ein stiller Dauerzustand, den niemand bemerkt.
  if (erzwungen) return { ...DEFAULT_STATE, ...(state || {}) };
  return nextState(state, mode === 'accel' ? 'start-accel' : 'start-safe');
}

module.exports = { SWITCHES, DEFAULT_STATE, decideMode, nextState, applyGpuFlags };
