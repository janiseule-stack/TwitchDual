// DOM-freier Zustand der Home-Buehne (Platten-Reihe, Blaettern, Mausrad,
// Vorschau-URL, Regal-Eintraege, Ablauf beim Auflegen). UMD wie chat-ui.js: laeuft im Browser
// (<script>, globales HomeBuehne) und unter Node -> testbar.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HomeBuehne = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function createBuehne() {
    let reihe = [];           // alle CDs in Anzeigereihenfolge
    let aktuellLogin = null;  // Login der aktuellen CD
    let offline = new Set();  // Logins, die nicht mehr live sind (nur die vordere)
    let filterLogins = null;  // null = Filter aus, sonst Logins der Teilreihe
    let gemerkt = null;       // CD, die vor dem ersten Filter aktuell war

    function sichtbar() {
      if (!filterLogins) return reihe.slice();
      return filterLogins.map((l) => reihe.find((c) => c.login === l)).filter(Boolean);
    }

    function index() {
      const s = sichtbar();
      return s.findIndex((c) => c.login === aktuellLogin);
    }

    function aktuelle() {
      const c = reihe.find((x) => x.login === aktuellLogin);
      if (!c) return null;
      return offline.has(c.login) ? Object.assign({}, c, { offline: true }) : c;
    }

    // Markierte CD entfernen, die nicht (mehr) die vordere ist
    function aufraeumen() {
      for (const l of Array.from(offline)) {
        if (l !== aktuellLogin) {
          offline.delete(l);
          reihe = reihe.filter((c) => c.login !== l);
        }
      }
    }

    function oeffnen(neu) {
      reihe = (neu || []).slice();
      aktuellLogin = reihe.length ? reihe[0].login : null;
      offline = new Set();
      filterLogins = null;
      gemerkt = null;
    }

    function aktualisieren(jetzt) {
      const liste = jetzt || [];
      const neuMap = new Map(liste.map((c) => [c.login, c]));
      const bekannt = new Set(reihe.map((c) => c.login));
      const naechste = [];
      for (const c of reihe) {
        const frisch = neuMap.get(c.login);
        if (frisch) {
          naechste.push(Object.assign({}, c, frisch));
          offline.delete(c.login);
        } else if (c.login === aktuellLogin) {
          naechste.push(c);
          offline.add(c.login);
        }
        // sonst: nicht-vordere, nicht mehr live -> weg
      }
      for (const c of liste) {
        if (!bekannt.has(c.login)) naechste.push(c);
      }
      reihe = naechste;
      aufraeumen();
      // Leere Buehne (nichts live / markierte weggeblaettert): erste
      // sichtbare neue CD wird aktuell.
      if (aktuellLogin === null) {
        const s = sichtbar();
        if (s.length) aktuellLogin = s[0].login;
      }
    }

    function setzeAktuell(login) {
      aktuellLogin = login;
      aufraeumen();
    }

    function blaettern(richtung) {
      const s = sichtbar();
      const i = s.findIndex((c) => c.login === aktuellLogin);
      if (i >= 0 && offline.has(aktuellLogin)) {
        // markierte CD verlassen: erst aus der Reihe nehmen
        offline.delete(aktuellLogin);
        reihe = reihe.filter((c) => c.login !== aktuellLogin);
        const rest = sichtbar();
        if (!rest.length) {
          aktuellLogin = null;
        } else if (richtung > 0) {
          aktuellLogin = rest[Math.min(i, rest.length - 1)].login;
        } else {
          aktuellLogin = rest[Math.max(i - 1, 0)].login;
        }
        return true;
      }
      const ziel = i + (richtung > 0 ? 1 : -1);
      if (i < 0 || ziel < 0 || ziel >= s.length) return false;
      setzeAktuell(s[ziel].login);
      return true;
    }

    function springeZu(login) {
      if (!sichtbar().some((c) => c.login === login)) return false;
      setzeAktuell(login);
      return true;
    }

    function filter(logins) {
      if (logins === null || logins === undefined) {
        if (!filterLogins) return;
        filterLogins = null;
        if (gemerkt && reihe.some((c) => c.login === gemerkt)) {
          aktuellLogin = gemerkt;
        } else if (aktuellLogin === null && reihe.length) {
          aktuellLogin = reihe[0].login;
        }
        gemerkt = null;
        aufraeumen();
        return;
      }
      if (!filterLogins) gemerkt = aktuellLogin;
      const menge = new Set(logins);
      filterLogins = reihe.filter((c) => menge.has(c.login)).map((c) => c.login);
      if (!filterLogins.includes(aktuellLogin)) {
        aktuellLogin = filterLogins.length ? filterLogins[0] : null;
      }
      aufraeumen();
    }

    return { oeffnen, aktualisieren, aktuelle, sichtbar, index, blaettern, springeZu, filter };
  }

  // Mausrad: summiert Pixel, ein Schritt ab Schwelle, danach kurze Sperre
  function createRad(opt) {
    const schwelle = (opt && opt.schwelle) || 60;
    const sperreMs = opt && opt.sperreMs !== undefined ? opt.sperreMs : 250;
    let summe = 0;
    let letzterSchritt = -Infinity;
    return {
      eingabe(deltaY, deltaMode, jetztMs) {
        if (jetztMs - letzterSchritt < sperreMs) return 0;
        summe += deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1);
        if (Math.abs(summe) >= schwelle) {
          const r = summe > 0 ? 1 : -1;
          summe = 0;
          letzterSchritt = jetztMs;
          return r;
        }
        return 0;
      },
    };
  }

  function vorschauUrl(login, jetztMs) {
    return 'https://static-cdn.jtvnw.net/previews-ttv/live_user_' + encodeURIComponent(login) +
      '-640x360.jpg?t=' + Math.floor(jetztMs / 60000);
  }

  // Bild fuer den Fernseher im Raum aus window.laeuftEtwas(): live -> Live-
  // Vorschau, VOD -> sein Vorschaubild (kommt mit den Stream-Infos), sonst aus.
  function tvVorschau(l, jetztMs) {
    if (!l) return null;
    if (l.mode === 'live') return l.login ? vorschauUrl(l.login, jetztMs) : null;
    if (l.mode === 'vod') return l.vorschau || null;
    return null;
  }

  // Staender unten (Runde 2): ohne Suche alle Live-CDs, dann die Offline-
  // Favoriten; mit Suche Live-, Offline- und Twitch-Treffer, jeder Kanal einmal.
  function staenderEintraege(o) {
    const opt = o || {};
    const gesehen = new Set();
    const out = [];
    const dazu = (liste, art) => (liste || []).forEach((kanal) => {
      if (!kanal || gesehen.has(kanal.login)) return;
      gesehen.add(kanal.login);
      out.push({ kanal, art });
    });
    dazu(opt.live, 'live');
    if (opt.suche) {
      dazu(opt.offlineTreffer, 'offline');
      dazu(opt.twitchTreffer, 'twitch');
    } else {
      dazu(opt.offlineFavoriten, 'offline');
    }
    return out;
  }

  // Laufwerk-Ablauf beim Abspielen: fertig erst, wenn die Mindestdauer der
  // Animation vorbei ist UND das Laden gemeldet wurde; ein Fehler beendet sofort.
  function createLaufwerk(o) {
    const opt = o || {};
    const mindestMs = opt.mindestMs === undefined ? 1500 : opt.mindestMs;
    let lauf = null; // { cb, zeitUm, ladenOk, timer }
    function pruefe() {
      if (!lauf || !lauf.zeitUm || lauf.ladenOk === null) return;
      const cb = lauf.cb;
      lauf = null;
      cb(true);
    }
    const api = {
      get laeuft() { return lauf !== null; },
      start(beiFertig) {
        if (lauf) return false;
        const l = { cb: beiFertig, zeitUm: false, ladenOk: null, timer: null };
        lauf = l;
        l.timer = opt.setzeTimer(() => { if (lauf !== l) return; l.timer = null; l.zeitUm = true; pruefe(); }, mindestMs);
        return true;
      },
      geladen(ok) {
        if (!lauf) return;
        if (!ok) {
          const l = lauf;
          lauf = null;
          if (l.timer !== null) opt.loescheTimer(l.timer);
          l.cb(false);
          return;
        }
        lauf.ladenOk = true;
        pruefe();
      },
      // Mindestdauer gilt als abgelaufen; fertig wird es erst mit geladen(true).
      ueberspringen() {
        if (!lauf) return;
        if (lauf.timer !== null) opt.loescheTimer(lauf.timer);
        lauf.timer = null;
        lauf.zeitUm = true;
        pruefe();
      },
      abbrechen() {
        if (!lauf) return;
        if (lauf.timer !== null) opt.loescheTimer(lauf.timer);
        lauf = null;
      },
    };
    return api;
  }

  return { createBuehne, createRad, vorschauUrl, tvVorschau, staenderEintraege, createLaufwerk };
});
