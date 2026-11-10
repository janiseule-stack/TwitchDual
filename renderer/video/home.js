// Home-Overlay: CD-Buehne mit der gewaehlten CD, CD-Staender mit allen Live-
// Kanaelen (★-Favoriten zuerst) und Offline-Favoriten, Suche + VOD-Browser,
// Laufwerk beim Abspielen. Steuerung und Zustand hier, Darstellung in
// home-buehne-dom.js, Reihenfolge/Blaettern/Laufwerk-Ablauf in home-buehne.js.
// Plaene: docs/superpowers/plans/2026-11-09-home-cd.md, ...-home-cd-v2.md
// Auswahl ruft window.twitchDual.submitLoad(...) auf -> laedt beide Fenster.

const $home = document.getElementById('home');
const $homeBtn = document.getElementById('home-btn');
const $homeClose = document.getElementById('home-close');
const $homeBack = document.getElementById('home-back');
const $homeTitle = document.getElementById('home-title');
const $kanaeleView = document.getElementById('home-kanaele');
const $vodView = document.getElementById('home-vod-view');
const $vodList = document.getElementById('vod-list');
const $suche = document.getElementById('home-suche');
const $refreshBtn = document.getElementById('refresh-btn');
const $hinweis = document.getElementById('home-hinweis');
const $buehneFlaeche = document.getElementById('home-buehne');
const $staender = document.getElementById('home-staender');
const $huelle = document.getElementById('cd-huelle');
const $namen = document.getElementById('home-namen');

let kanaele = [];          // aus home-kanaele: Kanal + {favorit, gefolgt}
let gefolgtFehler = null;
let geladen = false;       // erster Stand da? (sonst pulsiert die Huelle)
const buehne = HomeBuehne.createBuehne();
let oeffnenAusstehend = false; // naechster Erfolg baut die Reihe neu (statt aktualisieren)
let offlineAnsicht = null;     // per Staender-Album gezeigter Offline-Kanal
// VOD-Rueckseite der Huelle: { status, vods?, seite, mehr?, schluessel } -
// schluessel = Login der CD, fuer die sie gilt.
let rueckseite = null;
let angezeigt = null;          // Schluessel (modus|login) der gezeichneten CD
let stickerStand = null;       // Kanalpunkte der CD vorne: { balance, symbol }
let laufendeSuche = null;      // { text, fertig: Promise, erledigt } der Twitch-Suche
let enterLaeuft = false;       // Enter wartet gerade auf die Twitch-Suche
let ladenLaeuft = false;       // submitLoad aus Home laeuft
let escZaehler = 0;            // Esc-Druecke (wartendes Enter verwirft sich danach)
let letzteVorladung = '';      // zuletzt vorgeladene Nachbar-Vorschauen
let namenAuswahl = null;       // Riesen-Namen dieses Oeffnens
const rad = HomeBuehne.createRad();
// Laufwerk beim Abspielen: Animation (mind. 1,5 s) und Laden laufen parallel.
const laufwerk = HomeBuehne.createLaufwerk({
  mindestMs: 1500,
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
function showKanaeleView() {
  $vodView.classList.add('hidden');
  $kanaeleView.classList.remove('hidden');
  $homeBack.classList.add('hidden');
  $homeTitle.textContent = 'Home';
}

function showVodView(login, displayName) {
  $kanaeleView.classList.add('hidden');
  $vodView.classList.remove('hidden');
  $homeBack.classList.remove('hidden');
  $homeTitle.textContent = 'VODs · ' + (displayName || login);
}

function openHome() {
  window.twitchDual.notifyHomeOpen(); // Chat trennt die laufende Quelle
  $home.classList.remove('hidden');
  document.body.classList.add('home-offen'); // Leiste oben: nur "Ads blocked"
  showKanaeleView();
  $suche.focus(); // direkt lostippen
  oeffnenAusstehend = true; // vorne die erste CD der frischen Reihe
  offlineAnsicht = null;
  rueckseite = null;
  angezeigt = null;   // erste Zeichnung gilt als Wechsel -> Punkte neu fragen
  stickerStand = null;
  punkteAbruf.oeffnen();
  renderHome(); // alten Stand (Rueckseite, Offline-Ansicht) sofort weg, nicht erst nach dem Laden
  ladeKanaele();
  if (!refreshTimer) {
    refreshTimer = setInterval(() => {
      if (!$home.classList.contains('hidden') && !$kanaeleView.classList.contains('hidden')) ladeKanaele();
    }, 60000);
  }
}

function closeHome() {
  // Laufwerk beenden (ein wartendes ladeWert laeuft so zu Ende statt zu haengen)
  if (laufwerk.laeuft) laufwerk.geladen(false);
  HomeBuehneDom.versteckeLaufwerk();
  $home.classList.add('hidden');
  document.body.classList.remove('home-offen');
  punkteAbruf.vorne(null); // keine Punkte-Abfrage fuer ein geschlossenes Home
}

// Home schliessen und zur bereits laufenden Quelle zurueck -> Chat wieder
// verbinden (der Player lief unter dem Overlay weiter). NICHT benutzen, wenn
// gerade eine neue Quelle geladen wird - das erledigt onLoad im Chat selbst.
function closeHomeResume() {
  // Laeuft gerade ein Laden aus Home (Laufwerk), ist die neue Quelle schon
  // unterwegs: nur schliessen, sonst verbaende sich der Chat doppelt neu.
  if (ladenLaeuft || laufwerk.laeuft) { closeHome(); return; }
  closeHome();
  window.twitchDual.notifyHomeClose();
}

// --- Laden / Zeichnen -------------------------------------------------------
async function ladeKanaele() {
  if (!geladen) renderHome(); // Huelle pulsiert bis zum ersten Stand
  const nr = ladeLauf.start();
  sterneWaehrendLaden = []; // diese Ladung liest die aktuellen Favoriten
  let res;
  try { res = await window.twitchDual.homeKanaele(); } catch (e) { res = { ok: false, error: e.message || String(e) }; }
  if (!ladeLauf.aktuell(nr)) return; // neuere Ladung kam dazwischen
  // Fehler: oeffnenAusstehend bleibt, der naechste Erfolg baut die Reihe neu.
  if (!res.ok) { gefolgtFehler = res.error || 'unbekannt'; renderHome(); return; }
  kanaele = HomeListe.sterneNachholen(res.kanaele, sterneWaehrendLaden);
  sterneWaehrendLaden = [];
  gefolgtFehler = res.gefolgtFehler;
  geladen = true;
  // Laufende Suche gilt auch fuer die frische Reihe: nach dem Oeffnen vorne
  // der beste Treffer, beim Aktualisieren ohne Sprung.
  const frisch = oeffnenAusstehend;
  if (frisch) {
    const live = reihe();
    buehne.oeffnen(live);
    // Riesen-Namen nur einmal je Oeffnen (Neubau startet die Laufbaender neu).
    const offlineFavs = abschnittKanaele(HomeListe.abschnitte({ kanaele, nadel: '' }), 'offline').filter((k) => k.favorit);
    namenAuswahl = HomeBuehne.namenAuswahl(live, offlineFavs);
    HomeBuehneDom.zeichneNamen(namenAuswahl);
    oeffnenAusstehend = false;
  } else buehne.aktualisieren(reihe());
  wendeSucheAn(frisch);
  renderHome();
}

function abschnittKanaele(r, art) {
  const a = r.abschnitte.find((x) => x.art === art);
  return a ? a.kanaele : [];
}

// Live-CDs der Buehne: ★-Favoriten zuerst, dann gefolgte - immer ungefiltert.
function reihe() {
  const r = HomeListe.abschnitte({ kanaele, nadel: '' });
  return [...abschnittKanaele(r, 'favoriten'), ...abschnittKanaele(r, 'live')];
}

// Stern-Klick ruft kein aktualisieren -> Stern-Stand der gezeigten CD aus kanaele.
function mitStern(k) {
  const f = kanaele.find((x) => x.login === k.login);
  return { ...k, favorit: f ? f.favorit : false };
}

// Text in der leeren Huelle (erste zutreffende Bedingung).
function huellenText() {
  if (!geladen) return null; // pulsiert stattdessen
  const n = nadel();
  if (n) {
    const r = HomeListe.abschnitte({ kanaele, nadel: n });
    if (r.keineEigenen) return 'Keine eigenen Kanäle passen';
    const live = abschnittKanaele(r, 'favoriten').length + abschnittKanaele(r, 'live').length;
    if (!live && abschnittKanaele(r, 'offline').length) return 'Kein Live-Treffer – unten im Ständer';
  }
  if (!kanaele.length) return 'Noch keine Kanäle – oben suchen und mit ☆ merken';
  return 'Gerade spielt niemand';
}

// Laden aus Home (▶, Cover, Track, Staender, Enter). Mit Kanal und Effekten
// an: Laufwerk-Ablauf (Schublade, Terminal) parallel zum Laden; Home schliesst,
// wenn beides fertig ist. Erfolg -> Suche leeren und schliessen; Fehler ->
// Laufwerk weg, Hinweiszeile.
function effekteAus() { return document.documentElement.dataset.animationen === 'aus'; }
async function ladeWert(wert, kanal) {
  if (ladenLaeuft || laufwerk.laeuft) return; // Doppelklick / Enter waehrend des Ladens
  ladenLaeuft = true;
  const mitLaufwerk = !!kanal && !effekteAus();
  let ende = null;
  const fertig = new Promise((r) => { ende = r; });
  if (mitLaufwerk) {
    laufwerk.start((ok) => ende(ok));
    HomeBuehneDom.zeigeLaufwerk(kanal);
  }
  let r;
  try { r = await window.twitchDual.submitLoad(wert); } catch (e) { r = { ok: false, error: e.message || String(e) }; }
  finally { ladenLaeuft = false; }
  const ok = !!(r && r.ok);
  if (mitLaufwerk) {
    laufwerk.geladen(ok);
    await fertig; // Mindestdauer der Animation abwarten
    HomeBuehneDom.versteckeLaufwerk();
  }
  if (ok) { $suche.value = ''; sucheGetippt(); closeHome(); return; }
  $hinweis.textContent = (r && r.error) || 'Laden fehlgeschlagen';
  $hinweis.classList.remove('hidden');
}
// Kanal zu einem Login fuer das Laufwerk (Profilbild, Name).
function kanalZu(login) {
  const g = gezeigt();
  if (g.kanal && g.kanal.login === login) return g.kanal;
  return kanaele.find((x) => x.login === login) || (twitch.channels || []).find((x) => x.login === login) || { login };
}

// Handler fuer HomeBuehneDom.
const buehnenHandler = {
  laden: (login) => ladeWert(login, kanalZu(login)),
  // Offline-Marke der Buehne nicht in kanaele uebernehmen
  stern: ({ offline, ...k }) => sternUmschalten(k),
  vods: (k) => zeigeRueckseite(k),
  rueckseiteZu: () => { rueckseite = null; renderHome(); },
  // VOD laden: Laufwerk mit dem Kanal der CD vorne
  vod: (id) => ladeWert(id, gezeigt().kanal),
  vodSeite: (richtung) => {
    if (!rueckseite || !rueckseite.vods) return;
    const seiten = Math.max(1, Math.ceil(rueckseite.vods.length / 4));
    rueckseite = { ...rueckseite, seite: Math.min(seiten - 1, Math.max(0, (rueckseite.seite || 0) + richtung)) };
    renderHome();
  },
  mehr: (k) => openVods(k.login, k.displayName),
};
// Staender: Live-Album -> diese CD vorne; Offline-Album -> Offline-Ansicht mit
// VOD-Rueckseite; live Twitch-Treffer -> gleich laden.
const staenderHandler = {
  waehle: (k, art) => {
    if (art === 'live') {
      offlineAnsicht = null;
      rueckseite = null;
      buehne.springeZu(k.login);
      renderHome();
    } else if (art === 'twitch' && k.live) {
      ladeWert(k.login, k);
    } else {
      offlineAnsicht = k;
      zeigeRueckseite(k);
    }
  },
  stern: (k) => sternUmschalten(k),
};

// Ein Schritt (Mausrad, ↑/↓): erst Offline-Ansicht, dann Rueckseite
// schliessen, sonst blaettern.
function schritt(r) {
  if (offlineAnsicht) offlineAnsicht = null;
  else if (rueckseite) rueckseite = null;
  else if (!buehne.blaettern(r)) {
    // Ende der Live-Reihe: Staender weiterschieben, damit die Offline- und
    // Twitch-Alben dahinter erreichbar sind (keine sichtbare Scrollleiste).
    $staender.scrollBy({ left: r * $staender.clientWidth * 0.6, behavior: 'smooth' });
    return;
  }
  renderHome();
}

// Welche CD vorne steht: Offline-Ansicht vor der Buehne.
function gezeigt() {
  if (offlineAnsicht) return { kanal: mitStern(offlineAnsicht), modus: 'offline' };
  const a = buehne.aktuelle();
  if (a) return { kanal: mitStern(a), modus: a.offline ? 'markiert' : 'live' };
  return { kanal: null, modus: 'live' };
}
function schluesselVon(g) { return g.kanal ? g.modus + '|' + g.kanal.login : null; }
// Login-Teil eines Schluessels (modus|login); null bleibt null.
function loginVon(schluessel) { return schluessel ? schluessel.slice(schluessel.indexOf('|') + 1) : null; }

// VOD-Rueckseite fuer die CD vorne laden: bis zu 24 VODs, 4 je Seite; gibt es
// genau 24, kann es mehr geben -> Knopf "Alle VODs" (alte Liste).
// schluessel der Rueckseite = Login: geht die CD vorne offline (live ->
// markiert), bleibt die Rueckseite offen.
const VODS_MAX = 24;
function zeigeRueckseite(k) {
  const g = gezeigt();
  if (!g.kanal || g.kanal.login !== k.login) return;
  const schluessel = g.kanal.login;
  const r = { status: 'laden', seite: 0, schluessel };
  rueckseite = r;
  renderHome();
  Promise.resolve()
    .then(() => window.twitchDual.channelVods(k.login, VODS_MAX))
    .catch((e) => ({ ok: false, error: e && e.message }))
    .then((res) => {
      if (rueckseite !== r || loginVon(angezeigt) !== schluessel) return; // CD gewechselt / zugedreht
      const vods = (res && res.ok && res.vods) || [];
      rueckseite = res && res.ok
        ? { status: vods.length ? 'ok' : 'leer', vods, seite: 0, mehr: vods.length >= VODS_MAX, schluessel }
        : { status: 'fehler', seite: 0, schluessel };
      renderHome();
    });
}

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

function zeichneHuelle() {
  const g = gezeigt();
  HomeBuehneDom.zeichneBuehne({
    kanal: g.kanal, modus: g.modus,
    rueckseite: g.kanal ? rueckseite : null,
    punkte: g.kanal ? stickerStand : null,
    leerText: g.kanal ? null : huellenText(),
    ladend: !geladen,
  }, buehnenHandler);
  // Gleicher Name -> zeichneMitte tut nichts; leere Huelle -> leer.
  HomeBuehneDom.zeichneMitte(g.kanal ? (g.kanal.displayName || g.kanal.login) : null);
}

// Mittelzeile der Riesen-Namen auf Hoehe der CD-Mitte setzen (CSS-Variable
// an #home-namen). Nur Lesen von zwei Rechtecken, kein Neubau.
function setzeMitteY() {
  if ($home.classList.contains('hidden')) return;
  const h = $huelle.getBoundingClientRect();
  const n = $namen.getBoundingClientRect();
  if (!h.height || !n.height) return;
  $namen.style.setProperty('--mitte-y', Math.round(h.top + h.height / 2 - n.top) + 'px');
}
// Neu messen, wenn sich Buehne, Huelle oder Info-Block in der Groesse aendern
// (schmales Layout: Info-Text verschiebt die Huelle) und nach dem Wachsen der
// Huelle (VOD-Rueckseite, 400 ms Uebergang).
if (typeof ResizeObserver === 'function') {
  const ro = new ResizeObserver(setzeMitteY);
  ro.observe($buehneFlaeche);
  ro.observe($huelle);
  ro.observe(document.getElementById('cd-info'));
}
$huelle.addEventListener('transitionend', (e) => { if (e.target === $huelle) setzeMitteY(); });

// Vorschaubilder der Nachbar-CDs in den Cache holen (Blaettern ohne Warten).
function vorladen() {
  const s = buehne.sichtbar();
  const i = buehne.index();
  if (i < 0) return;
  const jetzt = Date.now();
  const urls = [s[i - 1], s[i + 1]].filter(Boolean).map((k) => HomeBuehne.vorschauUrl(k.login, jetzt));
  const merk = urls.join(' ');
  if (merk === letzteVorladung) return;
  letzteVorladung = merk;
  urls.forEach((u) => { new Image().src = u; });
}

function renderHome() {
  const g = gezeigt();
  const schluessel = schluesselVon(g);
  if (schluessel !== angezeigt) {
    // Merker zuerst: punkteAbruf.vorne ruft aus dem Speicher sofort zurueck
    // und zeichnet dabei neu.
    const vorher = angezeigt;
    angezeigt = schluessel;
    // Nur ein echter Kanalwechsel dreht die Rueckseite zu (nicht live -> markiert).
    if (rueckseite && rueckseite.schluessel !== loginVon(schluessel)) rueckseite = null;
    stickerStand = null; // auch bei live -> markiert: markierte CD hat keinen Sticker
    // Andere CD: Schlitten faehrt rein, Inhalt tauscht, faehrt wieder raus.
    if (vorher && schluessel && loginVon(vorher) !== g.kanal.login) {
      HomeBuehneDom.cdWechsel(zeichneHuelle);
    }
    punkteAbruf.vorne(g.kanal && g.modus === 'live' ? g.kanal.login : null);
    // Mittelzeile der Riesen-Namen: zeichnet zeichneHuelle, also beim
    // CD-Wechsel erst im Tausch - Name und Cover wechseln zusammen.
  }
  // Waehrend der Schlitten in der Huelle ist, tauscht cdWechsel den Inhalt.
  if (!HomeBuehneDom.cdWechselLaeuft()) zeichneHuelle();
  HomeBuehneDom.zeichneStaender(staenderEintraege(), g.kanal ? g.kanal.login : null, staenderHandler);
  vorladen();
  renderHinweis();
  setzeMitteY();
}

// Staender: ohne Suche alle Live-CDs der Buehne und die Offline-Favoriten;
// mit Suche Live-, Offline- (Favoriten zuerst) und Twitch-Treffer.
function staenderEintraege() {
  const n = nadel();
  if (!n) {
    const r = HomeListe.abschnitte({ kanaele, nadel: '' });
    return HomeBuehne.staenderEintraege({
      live: buehne.sichtbar().map(mitStern),
      offlineFavoriten: abschnittKanaele(r, 'offline').filter((k) => k.favorit),
    });
  }
  const r = HomeListe.abschnitte({ kanaele, nadel: n, twitch: twitch.channels, exakt: twitch.exakt, twitchFuer: twitch.nadel });
  return HomeBuehne.staenderEintraege({
    suche: true,
    live: buehne.sichtbar().map(mitStern),
    offlineTreffer: abschnittKanaele(r, 'offline'),
    twitchTreffer: abschnittKanaele(r, 'twitch'),
  });
}

// „Noch keine Kanäle …“ steht in der Huelle (huellenText), nicht hier.
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
// dass gleich noch ein Exakt-Treffer kommen kann.
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
  offlineAnsicht = null; // Suche zeigt wieder die Live-CDs
  wendeSucheAn(true);
  renderHome();
}

// Buehne auf die Live-Treffer begrenzen; mit springen vorne der beste Treffer.
function wendeSucheAn(springen) {
  const n = nadel();
  if (!n) { buehne.filter(null); return; }
  const r = HomeListe.abschnitte({ kanaele, nadel: n });
  const logins = [...abschnittKanaele(r, 'favoriten'), ...abschnittKanaele(r, 'live')].map((k) => k.login);
  // Gerade offline gegangene CD vorne bleibt markiert stehen, bis man weiterblaettert.
  const vorne = buehne.aktuelle();
  if (vorne && vorne.offline && !logins.includes(vorne.login)) logins.push(vorne.login);
  buehne.filter(logins);
  if (springen) {
    const ziel = HomeListe.besterTreffer(buehne.sichtbar(), n);
    if (ziel) buehne.springeZu(ziel);
  }
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
  renderHome();
}

// --- VOD-Ansicht ----------------------------------------------------------
async function openVods(login, displayName) {
  showVodView(login, displayName);
  $vodList.innerHTML = '<div class="empty">lade VODs …</div>';
  const res = await window.twitchDual.channelVods(login, 100); // mehr als die Rueckseite (24)
  if (!res.ok) { $vodList.innerHTML = ''; $vodList.appendChild(emptyMsg('Fehler: ' + res.error)); return; }
  if (!res.vods.length) { $vodList.innerHTML = ''; $vodList.appendChild(emptyMsg('Keine VODs gefunden.')); return; }
  $vodList.innerHTML = '';
  for (const v of res.vods) $vodList.appendChild(buildVodCard(v));
}

function emptyMsg(text) {
  const d = document.createElement('div');
  d.className = 'empty';
  d.textContent = text;
  return d;
}

function buildVodCard(v) {
  const card = document.createElement('div');
  card.className = 'vod';
  card.addEventListener('click', () => {
    window.twitchDual.submitLoad(v.id);
    closeHome();
  });

  const thumbwrap = document.createElement('div');
  thumbwrap.className = 'thumbwrap';
  const thumb = document.createElement('img');
  thumb.className = 'thumb';
  if (v.thumb) thumb.src = v.thumb;
  thumb.alt = '';
  thumb.onerror = () => { thumb.style.visibility = 'hidden'; };
  thumbwrap.appendChild(thumb);
  const len = document.createElement('span');
  len.className = 'len';
  len.textContent = v.lengthLabel;
  thumbwrap.appendChild(len);
  card.appendChild(thumbwrap);

  const vinfo = document.createElement('div');
  vinfo.className = 'vinfo';
  const title = document.createElement('div');
  title.className = 'vtitle';
  title.textContent = v.title;
  vinfo.appendChild(title);
  const vmeta = document.createElement('div');
  vmeta.className = 'vmeta';
  const parts = [];
  if (v.publishedLabel) parts.push(v.publishedLabel);
  if (v.viewsLabel) parts.push(v.viewsLabel + ' Aufrufe');
  vmeta.textContent = parts.join(' · ');
  vinfo.appendChild(vmeta);
  card.appendChild(vinfo);

  return card;
}

// --- Events ---------------------------------------------------------------
$homeBtn.addEventListener('click', () => {
  if ($home.classList.contains('hidden')) openHome();
  else closeHomeResume();
});
$homeClose.addEventListener('click', closeHomeResume);
$homeBack.addEventListener('click', showKanaeleView);
$refreshBtn.addEventListener('click', ladeKanaele);
$suche.addEventListener('input', sucheGetippt);
// Enter: Reihenfolge in HomeListe.enterZiel (VOD > eigener Kanal > Twitch-
// Exakttreffer > vordere CD > Kanalname). Laeuft die Twitch-Suche zu genau
// diesem Text noch, hoechstens 1500 ms auf sie warten.
$suche.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter' || enterLaeuft) return;
  e.preventDefault();
  const text = $suche.value;
  const n = HomeListe.normalisiere(text);
  const ziel = (sucheLaeuft) => HomeListe.enterZiel({
    text, eigene: kanaele, exakt: twitch.exakt, exaktFuer: twitch.nadel,
    // Offline-Kanal vorne ist per Enter nicht ladbar (nicht die Live-CD dahinter laden)
    sucheLaeuft, vordere: offlineAnsicht ? null : buehne.aktuelle(),
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
$buehneFlaeche.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = rad.eingabe(e.deltaY, e.deltaMode, performance.now());
  if (r) schritt(r);
}, { passive: false });
// Staender: Mausrad blaettert wie auf der Buehne (Auswahl scrollt in Sicht);
// waagerechtes Rad (Touchpad) scrollt den Staender selbst.
$staender.addEventListener('wheel', (e) => {
  if (!e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  e.preventDefault();
  const r = rad.eingabe(e.deltaY, e.deltaMode, performance.now());
  if (r) schritt(r);
}, { passive: false });
// Fuer die Leiste im Video-Fenster: Klick auf die Infos / Strg+L.
window.homeMitSuche = () => {
  if ($home.classList.contains('hidden')) openHome();
  else showKanaeleView();
  $suche.focus();
  $suche.select();
};

// Tasten auf Home: ↑/↓ blaettern wie das Rad (nicht in der alten VOD-Ansicht),
// Esc geht schrittweise zurueck: VOD-Ansicht > Offline-Ansicht > Rueckseite > schliessen.
document.addEventListener('keydown', (e) => {
  if ($home.classList.contains('hidden')) return;
  const vodAnsicht = !$vodView.classList.contains('hidden');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (vodAnsicht || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault(); // im Suchfeld sonst Cursor an Anfang/Ende
    schritt(e.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (e.key !== 'Escape') return;
  escZaehler += 1; // bricht ein wartendes Enter ab
  if (vodAnsicht) showKanaeleView();
  else if (offlineAnsicht) { offlineAnsicht = null; rueckseite = null; renderHome(); }
  else if (rueckseite) { rueckseite = null; renderHome(); }
  else closeHomeResume();
});

// Wenn etwas geladen wird (auch via Eingabefeld), Overlay schliessen - ausser
// das Laufwerk spielt gerade; dann schliesst ladeWert nach der Animation.
window.twitchDual.onLoad(() => { if (!laufwerk.laeuft) closeHome(); });

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
    // Wie Neu-Oeffnen: Reihe neu bauen (sonst stuende ein nur gefolgter
    // Kanal nach dem Abmelden als "gerade offline gegangen" vorne) und
    // Punkte-Stand des alten Kontos vergessen; die naechste Zeichnung gilt
    // als Wechsel und fragt die Punkte neu.
    oeffnenAusstehend = true;
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
// bei einer spaeten Antwort nicht mehr); angemeldet -> Punkte der CD vorne holen.
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
