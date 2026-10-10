// Video- und Chat-Fenster als Paar: wer eins nach vorne holt (Alt+Tab aus
// dem Spiel, Taskleiste, Klick), bekommt das andere mit - ohne dass ihm der
// Fokus geklaut wird. Minimieren/Wiederherstellen ebenso gemeinsam.
// Arbeitet nur auf der BrowserWindow-Schnittstelle -> mit Attrappen testbar.
const PARTNER_WECHSEL_MS = 300; // Fokus kam gerade vom Partner -> nichts zu tun

function verbinde(a, b, jetzt = Date.now) {
  const lebt = (w) => w && !w.isDestroyed();
  const blurZeit = new Map([[a, 0], [b, 0]]);

  for (const [selbst, partner] of [[a, b], [b, a]]) {
    selbst.on('blur', () => blurZeit.set(selbst, jetzt()));

    // Partner hinter dem fremden Fenster hervorholen, selbst obenauf bleiben.
    selbst.on('focus', () => {
      if (!lebt(partner) || !partner.isVisible() || partner.isMinimized()) return;
      if (jetzt() - blurZeit.get(partner) < PARTNER_WECHSEL_MS) return; // nur Video <-> Chat
      partner.moveTop();
      selbst.moveTop();
    });

    selbst.on('minimize', () => {
      if (lebt(partner) && partner.isVisible() && !partner.isMinimized()) partner.minimize();
    });

    // showInactive holt ein minimiertes Fenster zurueck, ohne es zu aktivieren.
    selbst.on('restore', () => {
      if (lebt(partner) && partner.isMinimized()) partner.showInactive();
    });
  }
}

module.exports = { verbinde, PARTNER_WECHSEL_MS };
