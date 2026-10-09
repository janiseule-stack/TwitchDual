// Home: Favoriten (lokal) + gefolgte Kanaele (Helix) zu einer Liste mit
// Live-Status. Abhaengigkeiten injiziert -> ohne Netz testbar.
// Spec: docs/superpowers/specs/2026-10-09-home-ein-tab-design.md

// holeGefolgt: null = nicht angemeldet; wirft = Helix-Fehler.
async function ladeHomeKanaele({ favoriten, holeGefolgt, liveStatus }) {
  let angemeldet = false;
  let gefolgtFehler = null;
  let gefolgt = [];
  try {
    const g = await holeGefolgt();
    if (g) { angemeldet = true; gefolgt = g; }
  } catch (e) {
    angemeldet = true;
    gefolgtFehler = e.message || String(e);
  }
  const fav = new Set(favoriten || []);
  const gef = new Set(gefolgt.map((g) => g.login));
  const logins = [...new Set([...fav, ...gef])];
  const kanaele = logins.length ? await liveStatus(logins) : [];
  return {
    angemeldet,
    gefolgtFehler,
    kanaele: kanaele.map((k) => ({ ...k, favorit: fav.has(k.login), gefolgt: gef.has(k.login) }))
  };
}

module.exports = { ladeHomeKanaele };
