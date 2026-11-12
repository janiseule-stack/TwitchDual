// DOM-freier Zustand von Home (Regal-Belegung, VOD-Nachladen, Karten-Zustand,
// Vorschau-URL, Ablauf beim Auflegen; createBuehne/createRad sind seit dem neuen
// Regal ungenutzt). UMD wie chat-ui.js: laeuft im Browser
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

  // ---- Regal neu (Plan docs/superpowers/plans/2026-11-11-regal-neu.md, Task 2) ----
  // Reine Logik fuer Regal-Belegung, VOD-Nachladen und Karten-Zustand.

  // Stabil absteigend nach Zuschauern (Array.prototype.sort ist stabil).
  function nachZuschauern(liste) {
    return liste.slice().sort((a, b) => (b.viewers || 0) - (a.viewers || 0));
  }

  // abschnitte = HomeListe.abschnitte(...).abschnitte. Live-Favoriten: die
  // ersten `plaetze` aufs Brett, der Rest vorne in `live`. Jeder Login einmal.
  function regalBelegung(o) {
    const opt = o || {};
    const abschnitte = opt.abschnitte || [];
    const plaetze = Math.max(0, opt.plaetze || 0);
    const kanaele = (art) => {
      const a = abschnitte.find((x) => x.art === art);
      return a ? a.kanaele || [] : [];
    };
    const gesehen = new Set();
    const neu = (liste) => liste.filter((kanal) => {
      if (!kanal || gesehen.has(kanal.login)) return false;
      gesehen.add(kanal.login);
      return true;
    });
    const favs = nachZuschauern(neu(kanaele('favoriten')));
    const brett = favs.slice(0, plaetze);
    const live = favs.slice(plaetze).map((kanal) => ({ kanal, art: 'favorit' }));
    nachZuschauern(neu(kanaele('live'))).forEach((kanal) => live.push({ kanal, art: 'live' }));
    const offline = neu(kanaele('offline')).filter((kanal) => opt.suche || kanal.favorit);
    const unten = offline.map((kanal) => ({ kanal, art: 'offline' }));
    neu(kanaele('twitch')).forEach((kanal) => unten.push({ kanal, art: 'twitch' }));
    return { brett, live, unten };
  }

  const VODS = { schritt: 25, max: 100 };

  // Naechstes Limit fuers Nachladen oder null (alles da / Obergrenze erreicht).
  function vodLimit(geladen, letztesLimit) {
    if (geladen < letztesLimit || letztesLimit >= VODS.max) return null;
    return Math.min(VODS.max, letztesLimit + VODS.schritt);
  }

  // Alte VODs behalten ihren Platz, unbekannte IDs aus `neu` kommen hinten dran.
  function vodsZusammen(alt, neu) {
    const a = alt || [];
    const bekannt = new Set(a.map((v) => v.id));
    const dazu = (neu || []).filter((v) => !bekannt.has(v.id));
    return { vods: a.concat(dazu), neuAb: a.length };
  }

  // ID des VODs, das gerade mitlaeuft (Start des Streams ~ Start des VODs).
  function laufendesVod(vods, kanal) {
    if (!kanal || !kanal.live || !kanal.start || !vods || !vods.length) return null;
    const diff = Math.abs(Date.parse(vods[0].published) - Date.parse(kanal.start));
    return diff <= 15 * 60000 ? vods[0].id : null;
  }

  // h = { login, art, kanal } (Schnappschuss beim Herausnehmen).
  function herausgenommenStand(h, kanaele) {
    if (!h) return null;
    const aktuell = (kanaele || []).find((x) => x.login === h.login);
    const kanal = aktuell || h.kanal;
    if (kanal && kanal.live) return { kanal, modus: 'live' };
    if (['brett', 'live', 'favorit'].includes(h.art)) return { kanal, modus: 'markiert' };
    return { kanal, modus: 'offline' };
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

  return { createBuehne, createRad, vorschauUrl, tvVorschau, createLaufwerk, regalBelegung, VODS, vodLimit, vodsZusammen, laufendesVod, herausgenommenStand };
});
