// Windows 11 rundet randlose Fenster ab und zeichnet einen eigenen 1-px-
// Systemrand drumherum. In den Ecken und an der Linie schien deshalb der
// Desktop durch (Janis 09.11.2026, live bestaetigt). Electron 33 kann das nur
// auf macOS abschalten (roundedCorners), daher setzen wir die zwei DWM-
// Attribute selbst - per PowerShell, ohne native Abhaengigkeit:
//   33 DWMWA_WINDOW_CORNER_PREFERENCE = 1 (DWMWCP_DONOTROUND)
//   34 DWMWA_BORDER_COLOR             = 0xFFFFFFFE (DWMWA_COLOR_NONE)
// Unter Windows 10 kennt DWM die Attribute nicht; der Aufruf laeuft ins Leere.
const { spawn } = require('child_process');

function hwndAus(puffer) {
  return puffer.length >= 8 ? puffer.readBigUInt64LE(0).toString() : String(puffer.readUInt32LE(0));
}

function skript(hwnds) {
  return [
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class TdEcken {',
    '  [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr h, int a, ref uint v, int s);',
    '}',
    '"@',
    'foreach ($h in @(' + hwnds.map((h) => "'" + h + "'").join(',') + ')) {',
    '  $p = [IntPtr][long]$h',
    '  $ecke = [uint32]1; [void][TdEcken]::DwmSetWindowAttribute($p, 33, [ref]$ecke, 4)',
    '  $rand = [uint32]4294967294; [void][TdEcken]::DwmSetWindowAttribute($p, 34, [ref]$rand, 4)',
    '}'
  ].join('\n');
}

const standardStart = (prog, args) => {
  const k = spawn(prog, args, { windowsHide: true, stdio: 'ignore' });
  k.on('error', () => {});
  k.unref();
};

function eckenAus(fenster, { platform = process.platform, starte = standardStart } = {}) {
  if (platform !== 'win32') return;
  const hwnds = fenster
    .filter((w) => w && !w.isDestroyed())
    .map((w) => hwndAus(w.getNativeWindowHandle()));
  if (!hwnds.length) return;
  const kodiert = Buffer.from(skript(hwnds), 'utf16le').toString('base64');
  starte('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', kodiert]);
}

module.exports = { hwndAus, skript, eckenAus };
