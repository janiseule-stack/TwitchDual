// Home-Overlay als Cozy-Raum: Raum-Ansicht (Hauptmenue, Klick auf Regal,
// Fernseher, Plattenspieler, Bild, Lampe) und Regal-Ansicht: oben das
// Ausstellbrett mit den Live-Favoriten (Cover), darunter die Faecher mit den
// Plattenruecken (Live, Offline-Favoriten bzw. Suchtreffer). Eine Platte wird
// als Karte herausgenommen (vorn Infos, hinten die VOD-Liste, die beim Scrollen
// nachlaedt); Tafel fuer Konto und Licht; Ablauf beim Auflegen. Steuerung und
// Zustand hier, Darstellung in home-raum-dom.js, Geometrie in lib/raum.js,
// Belegung/VOD-Nachladen/Ablauf in home-buehne.js.
// Plan: docs/superpowers/plans/2026-11-11-regal-neu.md (Task 9b).
// Auswahl ruft window.twitchDual.submitLoad(...) auf -> laedt beide Fenster.

const $home = document.getElementById('home');
const $homeBtn = document.getElementById('onair-bar'); // Schild links in der Leiste (auch Zurueck)
const $suche = document.getElementById('home-suche');
const $refreshBtn = document.getElementById('refresh-btn');
const $hinweis = document.getElementById('home-hinweis');
const $authBar = document.getElementById('auth-bar');

let kanaele = [];          // aus home-kanaele: Kanal + {favorit, gefolgt}
let gefolgtFehler = null;
let geladen = false;       // erster Stand da? (sonst pulsiert die gewaehlte Platte)
// Herausgenommene Platte (Karte): { login, art, kanal } - kanal ist der Schnappschuss
// beim Herausnehmen (HomeBuehne.herausgenommenStand nimmt den frischen aus kanaele).
let herausgenommen = null;
let seite = 'vorn';        // Seite der Karte: 'vorn' | 'rueck'
// VODs der herausgenommenen Platte: { status, liste, limit, weitere, laedtNach,
// login, nr, laufend }; login = Platte, fuer die sie gelten.
let vods = null;
let vodsNr = 0;            // Laufnummer: verwirft verspaetete VOD-Antworten
let angezeigt = null;      // Schluessel (modus|login) der herausgenommenen Platte
let stickerStand = null;   // Kanalpunkte der Karte: { balance, symbol }
let laufendeSuche = null;  // { text, fertig: Promise, erledigt } der Twitch-Suche
let enterLaeuft = false;   // Enter wartet gerade auf die Twitch-Suche
let ladenLaeuft = false;   // submitLoad aus Home laeuft
let escZaehler = 0;        // Esc-Druecke (wartendes Enter verwirft sich danach)
// Ablauf beim Auflegen: Animation (mind. 7,9 s = Summe ABLAUF_MS in
// home-raum-dom.js, per Klick/Taste ueberspringbar) und Laden laufen parallel.
const laufwerk = HomeBuehne.createLaufwerk({
  mindestMs: 7900,
  jetzt: Date.now,
  setzeTimer: (f, ms) => setTimeout(f, ms),
  loescheTimer: (t) => clearTimeout(t),
});
const punkteAbruf = HomePunkte.createPunkteAbruf({
  abfrage: (login) => window.twitchDual.homePunkte(login),
  darf: () => punkteLogin,
  jetzt: Date.now,
  setzeTimer: (f, ms) => setTimeout(f, ms),
  loescheTimer: (t) => clearTimeout(t),
});
let twitch = { nadel: null, channels: [], exakt: null }; // letzte Twitch-Treffer + ihr Suchtext
let sterneWaehrendLaden = []; // Stern-Klicks, die eine laufende Ladung noch nicht kennt
let suchNr = 0;            // verwirft verspaetete Suchantworten
let suchTimer = null;
let refreshTimer = null;
const ladeLauf = HomeListe.createLaufnummer(); // verwirft verspaetete home-kanaele-Antworten
let loggedIn = false;      // aus renderAuth (Login-Teil unten)

function nadel() { return HomeListe.normalisiere($suche.value); }

// --- Sichtbarkeit / Navigation --------------------------------------------
// Passt der Raum mindestens in Faktor 2? Sonst gibt es nur die Regal-Ansicht.
function raumPasst() { return Raum.passtAlsRaum($home.clientWidth, $home.clientHeight); }

function schliesseTafel() {
  HomeRaumDom.versteckeTafel();
  zeigeZurueckSchild();
}

// weich: Nahbild waechst aus dem Regal bzw. schrumpft hinein (HomeRaumDom, nur mit
// Animationen); Home-Oeffnen, Strg+L und zu kleines Fenster wechseln sofort.
function zeigeRegal(fokus, weich) {
  HomeRaumDom.zeigeAnsicht('regal', weich);
  if (fokus) $suche.focus(); // direkt lostippen
  zeigeZurueckSchild();
}
function zeigeRaum(weich) {
  // Fokus nicht in der versteckten Regal-Ansicht lassen (Tippen landet sonst dort)
  const a = document.activeElement;
  if (a && a !== document.body && $home.contains(a)) a.blur();
  HomeRaumDom.zeigeAnsicht('raum', weich);
  zeigeZurueckSchild();
}

// Karte zuruecklegen (ohne Zeichnen; der Aufrufer zeichnet).
function legeZurueck() {
  herausgenommen = null;
  seite = 'vorn';
  vods = null;
  vodsNr += 1; // laufende VOD-Anfrage gilt nicht mehr
}

// Ein Schritt zurueck (Esc, ←): Tafel zu > Rueckseite einer Live- oder markierten
// Platte -> Vorderseite > Karte zuruecklegen > Regal -> Raum (nur wenn der Raum
// passt). false: nichts mehr zurueck.
function zurueckSchritt() {
  if (HomeRaumDom.tafelOffen()) schliesseTafel();
  else if (seite === 'rueck' && herausgenommen && gezeigt().modus !== 'offline') { seite = 'vorn'; renderHome(); }
  else if (herausgenommen) { legeZurueck(); renderHome(); }
  else if (HomeRaumDom.ansicht() === 'regal' && raumPasst()) zeigeRaum(true);
  else return false;
  return true;
}
function kannZurueck() {
  return HomeRaumDom.tafelOffen() || !!herausgenommen ||
    (HomeRaumDom.ansicht() === 'regal' && raumPasst());
}
// Zurueck geht ueber das Schild oben links (Janis 12.11., Task 9e): Ist Home offen
// und gibt es ein Zurueck, zeigt es den PixelLab-Pfeil auch ohne Hover und ist
// klickbar, auch ohne Quelle (CSS: #onair-bar.zurueck in index.html).
function zeigeZurueckSchild() {
  const zurueck = !$home.classList.contains('hidden') && kannZurueck();
  $homeBtn.classList.toggle('zurueck', zurueck);
  $homeBtn.title = zurueck ? 'Zurück' : 'Home';
}

// Ziel: 'regal' (Strg+L, Klick auf die Stream-Infos) oder Raum (Start,
// Home-Knopf). Passt der Raum nicht, immer das Regal.
function openHome(ziel) {
  window.twitchDual.notifyHomeOpen(); // Chat trennt die laufende Quelle
  $home.classList.remove('hidden');
  document.body.classList.add('home-offen'); // Leiste oben: nur "Ads blocked"
  zeigeSchliessKnoepfe();
  HomeRaumDom.versteckeTafel();
  HomeRaumDom.neuAusrichten(); // init hat im versteckten #home gemessen
  if (ziel === 'regal' || !raumPasst()) zeigeRegal(true);
  else zeigeRaum();
  // Start ohne herausgenommene Platte (ganzes Regal)
  herausgenommen = null;
  seite = 'vorn';
  vods = null;
  vodsNr += 1;
  angezeigt = null;   // erste Zeichnung gilt als Wechsel -> Punkte neu fragen
  stickerStand = null;
  punkteAbruf.oeffnen();
  renderHome(); // alte Karte sofort weg, nicht erst nach dem Laden
  HomeRaumDom.leben(!effekteAus()); // Regen, Katze, Dampf, Lampe
  ladeKanaele();
  if (!refreshTimer) {
    refreshTimer = setInterval(() => {
      if (!$home.classList.contains('hidden')) ladeKanaele();
    }, 60000);
  }
}

function closeHome() {
  // Laufwerk beenden (ein wartendes ladeWert laeuft so zu Ende statt zu haengen)
  if (laufwerk.laeuft) laufwerk.geladen(false);
  HomeRaumDom.versteckeAblauf();
  HomeRaumDom.leben(false);
  $home.classList.add('hidden');
  document.body.classList.remove('home-offen');
  zeigeZurueckSchild(); // Pfeil am Schild weg
  getSelection().removeAllRanges(); // keine Markierung ueber dem Stream liegen lassen
  punkteAbruf.vorne(null); // keine Punkte-Abfrage fuer ein geschlossenes Home
}

// Home schliessen geht nur, wenn ein Stream oder VOD geladen ist (Janis 11.11.2026):
// sonst laege dahinter nur die leere Holzwand. ☰ in der Leiste und ✕ in Home
// erscheinen deshalb erst, wenn etwas geladen ist.
function kannSchliessen() {
  return !!(window.laeuftEtwas && window.laeuftEtwas());
}
function zeigeSchliessKnoepfe() {
  // Das Schild links (video.js) ist ohne Quelle leer und nicht klickbar.
  const zu = document.getElementById('home-close');
  if (zu) zu.classList.toggle('hidden', !kannSchliessen());
}

// Home schliessen und zur bereits laufenden Quelle zurueck -> Chat wieder
// verbinden (der Player lief unter dem Overlay weiter). NICHT benutzen, wenn
// gerade eine neue Quelle geladen wird - das erledigt onLoad im Chat selbst.
function closeHomeResume() {
  if (!kannSchliessen()) return; // nichts geladen: hinter Home laege nur die leere Wand
  // Laeuft gerade ein Laden aus Home (Laufwerk), ist die neue Quelle schon
  // unterwegs: nur schliessen, sonst verbaende sich der Chat doppelt neu.
  if (ladenLaeuft || laufwerk.laeuft) { closeHome(); return; }
  closeHome();
  window.twitchDual.notifyHomeClose();
}

// --- Laden / Zeichnen -------------------------------------------------------
async function ladeKanaele() {
  if (!geladen) renderHome(); // gewaehlte Platte pulsiert bis zum ersten Stand
  const nr = ladeLauf.start();
  sterneWaehrendLaden = []; // diese Ladung liest die aktuellen Favoriten
  let res;
  try { res = await window.twitchDual.homeKanaele(); } catch (e) { res = { ok: false, error: e.message || String(e) }; }
  if (!ladeLauf.aktuell(nr)) return; // neuere Ladung kam dazwischen
  if (!res.ok) { gefolgtFehler = res.error || 'unbekannt'; renderHome(); return; }
  kanaele = HomeListe.sterneNachholen(res.kanaele, sterneWaehrendLaden);
  sterneWaehrendLaden = [];
  gefolgtFehler = res.gefolgtFehler;
  geladen = true;
  renderHome();
}

function abschnittKanaele(r, art) {
  const a = r.abschnitte.find((x) => x.art === art);
  return a ? a.kanaele : [];
}

// Regal-Belegung: Brett (Live-Favoriten, so viele wie Platz haben), Live-Ruecken,
// unten Offline-Favoriten bzw. Suchtreffer (HomeBuehne.regalBelegung).
function belegung() {
  return HomeBuehne.regalBelegung({
    abschnitte: HomeListe.abschnitte({ kanaele, nadel: nadel(), twitch: twitch.channels, exakt: twitch.exakt, twitchFuer: twitch.nadel }).abschnitte,
    plaetze: Raum.fachFenster(99, -1, Raum.REGAL.brett.b, 0).sichtbar,
    suche: !!nadel(),
  });
}

// Bester Live-Treffer zum Suchtext (Brett und Live-Ruecken): Kanal oder null.
// Er ist angehoben (vorschlag) und das Ziel von Enter.
function besterTreffer(b = belegung()) {
  const login = HomeListe.besterTreffer([...b.brett, ...b.live.map((e) => e.kanal)], nadel());
  if (!login) return null;
  return b.brett.find((k) => k.login === login) || b.live.map((e) => e.kanal).find((k) => k.login === login) || null;
}

// Vordere Platte fuer Enter: die herausgenommene, wenn sie live ist; sonst mit
// Suchtext der beste Treffer; sonst keine.
function vordere() {
  const g = gezeigt();
  if (herausgenommen && g.modus === 'live') return g.kanal;
  return besterTreffer();
}

// Text ueber dem leeren Brett (erste zutreffende Bedingung). Liegen Live-Platten
// in den Faechern (keine davon Favorit), bleibt das Brett ohne Text.
function brettText(b) {
  if (!geladen) return null; // die gewaehlte Platte pulsiert stattdessen
  const n = nadel();
  if (n) {
    const r = HomeListe.abschnitte({ kanaele, nadel: n });
    if (r.keineEigenen) return 'Keine eigenen Kanäle passen';
    const live = abschnittKanaele(r, 'favoriten').length + abschnittKanaele(r, 'live').length;
    if (!live && abschnittKanaele(r, 'offline').length) return 'Kein Live-Treffer – unten in den Fächern';
  }
  if (!kanaele.length) return 'Noch keine Kanäle – oben suchen und mit ☆ merken';
  if (b && b.live.length) return null;
  return 'Gerade spielt niemand';
}

// Laden aus Home (Auflegen, VOD, Regal, Enter). Mit Kanal und Animationen
// an: Ablauf (ueberspringbar) parallel zum Laden; Home schliesst, wenn beides
// fertig ist. Erfolg -> Suche leeren und schliessen; Fehler -> Ablauf weg,
// Hinweiszeile.
function effekteAus() { return document.documentElement.dataset.animationen === 'aus'; }
// Animationen im Licht-Menue umgeschaltet: Raum-Leben bei offenem Home sofort mit.
new MutationObserver(() => {
  if (!$home.classList.contains('hidden')) HomeRaumDom.leben(!effekteAus());
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-animationen'] });
// Vorschaubild eines VODs aus der geladenen Liste der Karte (null: unbekannt/ohne Bild).
function vodVorschau(id) {
  const treffer = vods && vods.liste ? vods.liste.find((v) => v.id === id) : null;
  return treffer ? treffer.thumb || null : null;
}
async function ladeWert(wert, kanal) {
  if (ladenLaeuft || laufwerk.laeuft) return; // Doppelklick / Enter waehrend des Ladens
  ladenLaeuft = true;
  const mitLaufwerk = !!kanal && !effekteAus();
  let ende = null;
  const fertig = new Promise((r) => { ende = r; });
  if (mitLaufwerk) {
    // Neues Bild in den Fernseher: live die Vorschau, VOD sein Vorschaubild, sonst
    // aus. Im Ablauf ist es verborgen, bis der Fernseher anflackert (home-raum.css).
    // Schlaegt das Laden fehl, setzt der naechste renderHome den laufenden Stream zurueck.
    const tvBild = kanal.login && wert === kanal.login && !kanal.offline
      ? HomeBuehne.vorschauUrl(kanal.login, Date.now()) : vodVorschau(wert);
    HomeRaumDom.setzeTv(tvBild ? { vorschauUrl: tvBild } : null);
    laufwerk.start((ok) => ende(ok));
    HomeRaumDom.zeigeAblauf(kanal, () => laufwerk.ueberspringen());
  }
  let r;
  try { r = await window.twitchDual.submitLoad(wert); } catch (e) { r = { ok: false, error: e.message || String(e) }; }
  finally { ladenLaeuft = false; }
  const ok = !!(r && r.ok);
  if (mitLaufwerk) {
    laufwerk.geladen(ok);
    await fertig; // Mindestdauer der Animation abwarten (oder uebersprungen)
    HomeRaumDom.versteckeAblauf();
  }
  if (ok) { $suche.value = ''; sucheGetippt(); closeHome(); return; }
  $hinweis.textContent = (r && r.error) || 'Laden fehlgeschlagen';
  $hinweis.classList.remove('hidden');
  zeichneTv(); // Fernseher wieder auf das, was laeuft (nicht die fehlgeschlagene Quelle)
  // Der Ablauf hatte den Fokus und ist jetzt ausgeblendet: Fokus zurueck ins Suchfeld.
  if (HomeRaumDom.ansicht() === 'regal') $suche.focus();
}
// Kanal zu einem Login fuer das Laufwerk (Profilbild, Name).
function kanalZu(login) {
  const g = gezeigt();
  if (g.kanal && g.kanal.login === login) return g.kanal;
  return kanaele.find((x) => x.login === login) || (twitch.channels || []).find((x) => x.login === login) || { login };
}

// Platte im Regal gewaehlt (Cover, Ruecken): ein fremder Live-Treffer laedt
// sofort; sonst wird sie als Karte herausgenommen - live vorn, offline gleich
// mit der VOD-Rueckseite.
function waehle(k, art) {
  if (art === 'twitch' && k.live) { ladeWert(k.login, k); return; }
  herausgenommen = { login: k.login, art, kanal: k };
  seite = k.live ? 'vorn' : 'rueck';
  vods = null;
  vodsNr += 1;
  if (seite === 'rueck') ladeVods(k.login, HomeBuehne.VODS.schritt);
  renderHome();
}

// Karte umdrehen: vorn -> hinten (beim ersten Mal VODs laden), hinten -> vorn.
function umdrehen() {
  if (!herausgenommen) return;
  if (seite === 'rueck') seite = 'vorn';
  else {
    seite = 'rueck';
    if (!vods || vods.login !== herausgenommen.login) ladeVods(herausgenommen.login, HomeBuehne.VODS.schritt);
  }
  renderHome();
}

// VODs der Platte login laden (bis limit). Laufnummer: eine verspaetete Antwort
// (andere Platte, zurueckgelegt, neuere Anfrage) wird verworfen. Bekannte VODs
// behalten ihren Platz, neue kommen hinten dran (vodsZusammen).
function ladeVods(login, limit) {
  const nr = ++vodsNr;
  if (!vods || vods.login !== login) {
    vods = { status: 'laden', liste: [], limit, weitere: false, laedtNach: false, login, nr, laufend: null };
  } else vods.nr = nr;
  Promise.resolve()
    .then(() => window.twitchDual.channelVods(login, limit))
    .catch((e) => ({ ok: false, error: e && e.message }))
    .then((res) => {
      if (nr !== vodsNr || !vods || vods.login !== login) return; // Platte gewechselt / zurueckgelegt
      const alt = vods;
      if (res && res.ok) {
        const liste = HomeBuehne.vodsZusammen(alt.liste, res.vods || []).vods;
        const g = gezeigt();
        vods = {
          status: liste.length ? 'ok' : 'leer', liste, limit,
          weitere: HomeBuehne.vodLimit(liste.length, limit) !== null,
          laedtNach: false, login, nr,
          laufend: HomeBuehne.laufendesVod(liste, g.kanal && g.kanal.login === login ? g.kanal : null),
        };
      } else {
        // Fehler: Liste bleibt; kein weiteres automatisches Nachladen (sonst fragt
        // die Liste nach jedem Zeichnen sofort wieder an).
        vods = { ...alt, status: alt.liste.length ? alt.status : 'fehler', weitere: false, laedtNach: false, nr };
      }
      renderHome();
    });
}

// Ende der VOD-Liste erreicht (Karte): naechstes Limit laden. laedtNach wird
// sofort im selben Zustand gesetzt, damit weitere Scroll-Ereignisse nicht doppelt
// anfragen; es laeuft hoechstens eine Anfrage.
function mehrVods() {
  if (!vods || vods.laedtNach || !vods.weitere) return;
  const limit = HomeBuehne.vodLimit(vods.liste.length, vods.limit);
  if (limit === null) { vods.weitere = false; return; }
  vods.laedtNach = true;
  renderHome();
  ladeVods(vods.login, limit);
}

// Handler fuer das Regal (HomeRaumDom.zeichneRegal).
const regalHandler = {
  waehle,
  laden: (login) => ladeWert(login, kanalZu(login)),
  stern: (k) => sternUmschalten(k),
};
// Handler fuer die Karte (HomeRaumDom.zeichneKarte).
const karteHandler = {
  laden: (login) => ladeWert(login, kanalZu(login)),
  stern: (k) => sternUmschalten(k),
  umdrehen,
  zuruecklegen: () => { legeZurueck(); renderHome(); },
  // VOD laden: Laufwerk mit dem Kanal der herausgenommenen Platte
  vod: (id) => ladeWert(id, herausgenommen && herausgenommen.kanal),
  mehrVods,
};

// Ein Schritt (↑/↓): Rueckseite offen -> VOD-Liste scrollen; Vorderseite offen ->
// naechste/vorige Live-Platte (Brett, dann Live-Ruecken) herausnehmen; ohne Karte
// nimmt ↓ die erste, ↑ die letzte. Ohne Live-Platten blaettert das untere Fach.
// Das Mausrad blaettert die Faecher selbst (home-raum-dom.js).
function schritt(r) {
  if (herausgenommen && seite === 'rueck') { HomeRaumDom.kartenScrollen(r); return; }
  const b = belegung();
  const reihe = [...b.brett.map((kanal) => ({ kanal, art: 'brett' })), ...b.live];
  if (!reihe.length) { HomeRaumDom.fachBlaettern('unten', r); return; }
  const i = herausgenommen ? reihe.findIndex((e) => e.kanal.login === herausgenommen.login) : -1;
  let ziel = r > 0 ? 0 : reihe.length - 1;
  if (i >= 0) {
    ziel = i + (r > 0 ? 1 : -1);
    if (ziel < 0 || ziel >= reihe.length) return; // Ende der Reihe: Platte bleibt
  }
  waehle(reihe[ziel].kanal, reihe[ziel].art);
}

// Was gezeigt wird: die herausgenommene Platte (frischer Stand aus kanaele) oder nichts.
// Nie null: Aufrufer lesen g.kanal ohne Pruefung.
function gezeigt() {
  return HomeBuehne.herausgenommenStand(herausgenommen, kanaele) || { kanal: null, modus: 'live' };
}
function schluesselVon(g) { return g.kanal ? g.modus + '|' + g.kanal.login : null; }

// Symbol fuer den Punkte-Sticker: Kanal-Icon, sonst die Pixel-Muenze aus dem Raum.
function punkteSymbolFuer(login, iconUrl) {
  return { art: 'url', url: iconUrl || '../themes/cozy/symbol-muenze.png' };
}

// Antwort des Punkte-Abrufs; wirft nie (laeuft evtl. in einem .then).
punkteAbruf.beiStand((login, s) => {
  try {
    if (angezeigt !== 'live|' + login || !punkteLogin) return;
    stickerStand = { balance: s.balance, symbol: punkteSymbolFuer(login, s.iconUrl) };
    renderHome();
  } catch (e) {
    console.warn('Home-Punkte:', e && e.message);
  }
});

// Fernseher im Raum: Vorschau des laufenden Live-Kanals oder Vorschaubild des
// laufenden VODs (verpixelt wie live), sonst aus.
function zeichneTv() {
  // Waehrend des Auflegens gehoert der Fernseher dem Ablauf (ladeWert hat das neue
  // Bild gesetzt); ein renderHome dazwischen darf es nicht ueberschreiben.
  if (ladenLaeuft || laufwerk.laeuft) return;
  const l = window.laeuftEtwas ? window.laeuftEtwas() : null;
  const url = HomeBuehne.tvVorschau(l, Date.now());
  HomeRaumDom.setzeTv(url ? { vorschauUrl: url } : null);
}

function renderHome() {
  const g = gezeigt();
  const schluessel = schluesselVon(g);
  if (schluessel !== angezeigt) {
    // Merker zuerst: punkteAbruf.vorne ruft aus dem Speicher sofort zurueck
    // und zeichnet dabei neu.
    angezeigt = schluessel;
    stickerStand = null; // auch bei live -> markiert: markierte Platte hat keine Punkte
    punkteAbruf.vorne(g.kanal && g.modus === 'live' ? g.kanal.login : null);
  }
  const b = belegung();
  const vorschlag = besterTreffer(b);
  HomeRaumDom.zeichneRegal(b, {
    gewaehlt: herausgenommen ? herausgenommen.login : null,
    vorschlag: vorschlag ? vorschlag.login : null,
    brettText: brettText(b),
    ladend: !geladen,
  }, regalHandler);
  HomeRaumDom.zeichneKarte(g.kanal ? {
    kanal: g.kanal, modus: g.modus, seite,
    vods: vods && vods.login === g.kanal.login ? vods : null,
    punkte: g.modus === 'live' ? stickerStand : null,
  } : null, karteHandler);
  zeichneTv();
  renderHinweis();
  zeigeZurueckSchild();
}

// „Noch keine Kanäle …“ steht ueber dem Brett (brettText), nicht hier.
function renderHinweis() {
  let text = '';
  if (gefolgtFehler) text = 'Gefolgte Kanäle nicht abrufbar: ' + gefolgtFehler;
  else if (geladen && !loggedIn) text = 'Mit Twitch anmelden, um deine gefolgten Kanäle zu sehen.';
  $hinweis.textContent = text;
  $hinweis.classList.toggle('hidden', !text);
}

// --- Suche -------------------------------------------------------------------
// Eigene Kanaele filtern sofort; Twitch-Treffer kommen entprellt nach.
// laufendeSuche gilt schon waehrend der Entprellung, damit Enter weiss,
// dass gleich noch ein Exakt-Treffer kommen kann. Tippen legt die Karte zurueck.
function sucheGetippt() {
  clearTimeout(suchTimer);
  const n = nadel();
  const nr = ++suchNr;
  if (laufendeSuche) laufendeSuche.beenden(); // neuer Tastendruck ersetzt sie
  laufendeSuche = null;
  if (n.length >= HomeListe.MIN_TWITCH) {
    const lauf = { text: n, erledigt: false };
    lauf.fertig = new Promise((fertig) => {
      lauf.beenden = () => { lauf.erledigt = true; fertig(); };
    });
    laufendeSuche = lauf;
    suchTimer = setTimeout(async () => {
      let res = null;
      try { res = await window.twitchDual.kanalSuche(n); } catch { /* still */ }
      const gueltig = nr === suchNr && res && res.ok; // sonst veraltet oder Fehler
      if (gueltig) twitch = { nadel: n, channels: res.channels || [], exakt: res.exakt || null };
      lauf.beenden(); // nach twitch, damit wartendes Enter den Treffer sieht
      if (gueltig) renderHome();
    }, 250);
  }
  legeZurueck();
  renderHome();
}

// --- Stern ---------------------------------------------------------------------
// Ohne Netzabfrage: Flags lokal anpassen und neu zeichnen.
async function sternUmschalten(ch) {
  const r = ch.favorit
    ? await window.twitchDual.removeFavorite(ch.login)
    : await window.twitchDual.addFavorite(ch.login);
  if (!r.ok) return;
  sterneWaehrendLaden.push({ ch, favoriten: r.favorites }); // laufende Ladung holt ihn nach
  kanaele = HomeListe.sternAnwenden(kanaele, ch, r.favorites);
  // Schnappschuss der Karte nachziehen (falls der Kanal aus kanaele herausfiel)
  if (herausgenommen && herausgenommen.login === ch.login) {
    herausgenommen = { ...herausgenommen, kanal: { ...herausgenommen.kanal, favorit: (r.favorites || []).includes(ch.login) } };
  }
  renderHome();
}

// --- Events ---------------------------------------------------------------
// Schild: Home zu -> oeffnen. Home offen -> ein Schritt zurueck wie Esc
// (zurueckSchritt); gibt es keinen, wie bisher zurueck zum Stream (closeHomeResume).
$homeBtn.addEventListener('click', () => {
  if ($home.classList.contains('hidden')) { openHome(); return; }
  escZaehler += 1; // bricht ein wartendes Enter ab (wie Esc)
  if (!zurueckSchritt()) closeHomeResume();
});
$refreshBtn.addEventListener('click', ladeKanaele);
$suche.addEventListener('input', sucheGetippt);
// Enter: Reihenfolge in HomeListe.enterZiel (VOD > eigener Kanal > Twitch-
// Exakttreffer > vordere Platte > Kanalname). Laeuft die Twitch-Suche zu genau
// diesem Text noch, hoechstens 1500 ms auf sie warten.
$suche.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter' || enterLaeuft) return;
  e.preventDefault();
  const text = $suche.value;
  const n = HomeListe.normalisiere(text);
  const ziel = (sucheLaeuft) => HomeListe.enterZiel({
    text, eigene: kanaele, exakt: twitch.exakt, exaktFuer: twitch.nadel,
    // nur eine Live-Platte ist per Enter ladbar (herausgenommen oder bester Treffer)
    sucheLaeuft, vordere: vordere(),
  });
  let z = ziel(!!laufendeSuche && laufendeSuche.text === n && !laufendeSuche.erledigt);
  if (z && z.art === 'warten') {
    const esc = escZaehler;
    enterLaeuft = true;
    try {
      await Promise.race([laufendeSuche.fertig, new Promise((r) => setTimeout(r, 1500))]);
    } finally {
      enterLaeuft = false;
    }
    // Home inzwischen zu oder Text geaendert -> nicht mehr laden
    if ($home.classList.contains('hidden') || $suche.value !== text || escZaehler !== esc) return;
    z = ziel(false);
  }
  if (z && z.art === 'laden') {
    // Kanalname -> Laufwerk mit dessen Profilbild; VOD-Link/-ID -> ohne Laufwerk
    const login = HomeListe.normalisiere(z.wert);
    ladeWert(z.wert, /^[a-z0-9_]{2,25}$/.test(login) && !/^v?\d{4,}$/.test(login) ? kanalZu(login) : null);
  }
});
// Fuer die Leiste im Video-Fenster: Klick auf die Infos / Strg+L -> Regal
// mit Fokus im Suchfeld.
window.homeMitSuche = () => {
  if ($home.classList.contains('hidden')) openHome('regal');
  else { schliesseTafel(); zeigeRegal(false); }
  $suche.focus();
  $suche.select();
};

// --- Klick im Raum -------------------------------------------------------------
// Was liegt gerade auf? Kanalname (Anzeigename, wenn bekannt), bei VOD "VOD".
function aufgelegt() {
  const l = window.laeuftEtwas ? window.laeuftEtwas() : null;
  if (!l) return null;
  if (l.mode !== 'live' || !l.login) return 'VOD';
  const k = kanalZu(l.login);
  return k.displayName || k.login;
}

// Tafel "Licht": Schalter Animationen und Pixel-Uebergang (wie im ⚙-Fenster des Chats).
let $licht = null;
let $lichtAnimationen = null;
let $lichtPixel = null;
function lichtInhalt() {
  if (!$licht) {
    $licht = document.createElement('div');
    $licht.className = 'licht-inhalt';
    const zeile = document.createElement('label');
    $lichtAnimationen = document.createElement('input');
    $lichtAnimationen.type = 'checkbox';
    $lichtAnimationen.addEventListener('change', () => {
      window.twitchDual.saveThemePrefs({ animationen: $lichtAnimationen.checked });
    });
    zeile.append($lichtAnimationen, ' Animationen');
    const zeilePixel = document.createElement('label');
    $lichtPixel = document.createElement('input');
    $lichtPixel.type = 'checkbox';
    $lichtPixel.addEventListener('change', () => {
      window.twitchDual.saveThemePrefs({ pixelUebergang: $lichtPixel.checked });
    });
    zeilePixel.append($lichtPixel, ' Pixel-Übergang');
    const satz = document.createElement('p');
    satz.textContent = 'Weitere Einstellungen: ⚙ im Chat';
    $licht.append(zeile, zeilePixel, satz);
  }
  $lichtAnimationen.checked = !effekteAus();
  $lichtPixel.checked = document.documentElement.dataset.uebergang === 'pixel';
  return $licht;
}

function beiFlaeche(id) {
  if (id === 'regal') zeigeRegal(true, true);
  else if (id === 'fernseher') {
    if (window.laeuftEtwas && window.laeuftEtwas()) closeHomeResume();
    else HomeRaumDom.zeigeSchild('Nichts geladen');
  } else if (id === 'plattenspieler') HomeRaumDom.zeigeSchild(aufgelegt() || 'Leer');
  else if (id === 'bild') HomeRaumDom.zeigeTafel('konto', $authBar);
  else if (id === 'lampe') HomeRaumDom.zeigeTafel('licht', lichtInhalt());
  zeigeZurueckSchild();
}

HomeRaumDom.init({
  beiFlaeche,
  beiSchliessen: closeHomeResume,
  beiTafelZu: zeigeZurueckSchild, // ✕ der Tafel: Pfeil am Schild nachziehen
});

window.addEventListener('resize', () => {
  if ($home.classList.contains('hidden')) return;
  HomeRaumDom.neuAusrichten();
  // Fenster zu klein fuer den Raum: Regal (ohne Fokus zu stehlen)
  if (HomeRaumDom.ansicht() === 'raum' && !raumPasst()) zeigeRegal(false);
  else zeigeZurueckSchild();
});

// Tasten auf Home: ↑/↓ in der Regal-Ansicht (schritt; nicht bei offener Tafel);
// Esc geht schrittweise zurueck (zurueckSchritt), zuletzt schliessen.
// Im Raum wechselt ein Buchstabe oder eine Ziffer ins Regal und landet im
// Suchfeld (ersetzt einen alten Suchtext, wie Strg+L).
document.addEventListener('keydown', (e) => {
  if ($home.classList.contains('hidden')) return;
  const tafel = HomeRaumDom.tafelOffen();
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (tafel || HomeRaumDom.ansicht() !== 'regal' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault(); // im Suchfeld sonst Cursor an Anfang/Ende
    schritt(e.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (e.key === 'Escape') {
    escZaehler += 1; // bricht ein wartendes Enter ab
    if (!zurueckSchritt()) closeHomeResume();
    return;
  }
  if (!tafel && HomeRaumDom.ansicht() === 'raum' && !e.ctrlKey && !e.altKey && !e.metaKey &&
      /^[\p{L}\p{N}]$/u.test(e.key)) {
    e.preventDefault();
    zeigeRegal(true, true);
    $suche.value = e.key;
    sucheGetippt();
  }
});

// Wenn etwas geladen wird (auch via Eingabefeld), Overlay schliessen - ausser
// das Laufwerk spielt gerade; dann schliesst ladeWert nach der Animation.
window.twitchDual.onLoad(() => { zeigeSchliessKnoepfe(); if (!laufwerk.laeuft) closeHome(); });

// --- Login: ein Anmelden fuer Chat (Device Flow) + Kanalpunkte (Web) -------
// Ablauf im Main (IPC 'anmelden'): ein Twitch-Fenster, nur fehlende Schritte.
const $authState = document.getElementById('auth-state');
const $authLogin = document.getElementById('auth-login');
const $authLogout = document.getElementById('auth-logout');

let authBekannt = false; // erster Status kommt beim Start; openHome laedt da schon
let chatLogin = { loggedIn: false, displayName: null };
let punkteLogin = false;

function zeigeAnmeldung() {
  const a = Anmeldung.anzeige({ chat: chatLogin.loggedIn, punkte: punkteLogin, name: chatLogin.displayName });
  $authState.textContent = a.text;
  $authLogin.textContent = a.knopf || '';
  $authLogin.classList.toggle('hidden', !a.knopf);
  $authLogout.classList.toggle('hidden', !a.abmelden);
  document.getElementById('auth-bar').classList.toggle('unvollstaendig', chatLogin.loggedIn !== punkteLogin);
}

function renderAuth(st) {
  const vorher = loggedIn;
  chatLogin = { loggedIn: !!(st && st.loggedIn), displayName: st && st.displayName };
  loggedIn = chatLogin.loggedIn;
  zeigeAnmeldung();
  // Anmelden/Abmelden aendert die gefolgten Kanaele -> neu laden, falls offen.
  const wechsel = authBekannt && vorher !== loggedIn;
  authBekannt = true;
  if (wechsel) {
    // Wie Neu-Oeffnen: Karte zuruecklegen (ihr Kanal gehoert evtl. nur zum alten
    // Konto) und Punkte-Stand des alten Kontos vergessen; die naechste Zeichnung
    // gilt als Wechsel und fragt die Punkte neu.
    legeZurueck();
    punkteAbruf.leeren();
    angezeigt = null;
    stickerStand = null;
  }
  if (wechsel && !$home.classList.contains('hidden')) ladeKanaele();
  else if (geladen) renderHinweis();
}

window.twitchDual.authStatus().then(renderAuth).catch(() => {});
window.twitchDual.onAuthChanged(renderAuth);
// Kanalpunkte-Anmeldung: abgemeldet -> Sticker weg (der Abruf prueft darf()
// bei einer spaeten Antwort nicht mehr); angemeldet -> Punkte der Karte holen.
function setzePunkteLogin(s) {
  const vorher = punkteLogin;
  punkteLogin = !!(s && s.angemeldet);
  zeigeAnmeldung();
  if (punkteLogin === vorher) return;
  if (!punkteLogin) {
    punkteAbruf.leeren(); // Speicher gehoert zum abgemeldeten Konto
    if (stickerStand) { stickerStand = null; if (!$home.classList.contains('hidden')) renderHome(); }
    return;
  }
  if ($home.classList.contains('hidden')) return;
  punkteAbruf.oeffnen();
  const g = gezeigt();
  punkteAbruf.vorne(g.kanal && g.modus === 'live' ? g.kanal.login : null);
}

window.twitchDual.webLoginStatus().then(setzePunkteLogin).catch(() => {});
window.twitchDual.onWebLoginGeaendert(setzePunkteLogin);

$authLogin.addEventListener('click', async () => {
  $authLogin.disabled = true;
  const r = await window.twitchDual.anmelden();
  $authLogin.disabled = false;
  if (!r.ok) $authState.textContent = r.error;
  window.twitchDual.webLoginStatus().then(setzePunkteLogin).catch(() => {});
});
$authLogout.addEventListener('click', () => window.twitchDual.abmelden());

// Beim Start Overlay zeigen, damit man gleich seine Kanaele sieht.
// (Dieses Script laeuft am Ende von <body>, die Elemente existieren bereits.)
openHome();
