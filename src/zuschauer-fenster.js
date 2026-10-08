// Zuschauer-Fenster: reine Logik, DOM- und Electron-frei (voll testbar).
// Der eingebettete Player zaehlt bei Twitch nicht als Zuschauen (gemessen
// 13.08.2026: 20 min = 0 Punkte, keine Kiste). Ein unsichtbares Fenster auf
// twitch.tv/<kanal> schon. Hier steht nur, WANN es fuer WELCHEN Kanal laeuft
// und wie der Waechter Messungen bewertet; das echte Fenster lebt in main.js.

// Kanal, den das Fenster schauen soll, oder null.
function zielKanal({ kanal, spielt, homeOffen, webAngemeldet }) {
  if (!kanal || !webAngemeldet || !spielt || homeOffen) return null;
  return kanal;
}

// Harte Gruende wirken sofort, weiche (Pause, Home) erst nach der Karenz -
// wer kurz pausiert, soll keine Zaehlzeit verlieren.
function stoppGrund(zustand, laufend) {
  if (!zustand.kanal) return { grund: 'kein Live-Kanal', hart: true };
  if (!zustand.webAngemeldet) return { grund: 'nicht angemeldet', hart: true };
  if (zustand.kanal !== laufend) return { grund: 'Kanalwechsel', hart: true };
  if (zustand.homeOffen) return { grund: 'Home offen', hart: false };
  return { grund: 'pausiert', hart: false };
}

function createZuschauerSteuerung({ karenzMs = 60000 } = {}) {
  let laufend = null;
  let karenzSeit = null;
  // Kanal, fuer den der Waechter aufgegeben hat. Faellt, sobald ein anderer
  // (oder gar kein) Kanal geladen ist - sonst startete der 2-s-Takt dasselbe
  // kaputte Fenster sofort wieder.
  let gesperrt = null;

  function aktualisiere(zustand, nowMs) {
    if (gesperrt && zustand.kanal !== gesperrt) gesperrt = null;
    const ziel = zielKanal(zustand);

    if (ziel && ziel === laufend) {
      karenzSeit = null;
      return null;
    }
    if (ziel && ziel !== gesperrt) {
      laufend = ziel;
      karenzSeit = null;
      return { art: 'start', kanal: ziel };
    }
    if (!laufend) return null;

    const { grund, hart } = stoppGrund(zustand, laufend);
    if (!hart) {
      if (karenzSeit === null) karenzSeit = nowMs;
      if (nowMs - karenzSeit < karenzMs) return null;
    }
    laufend = null;
    karenzSeit = null;
    return { art: 'stopp', grund };
  }

  function aufgegeben() {
    gesperrt = laufend;
    laufend = null;
    karenzSeit = null;
  }

  return { aktualisiere, aufgegeben, laufend: () => laufend };
}

// Bewertet die Waechter-Messungen eines Fensters. Fortschritt = Video da,
// nicht pausiert und currentTime gestiegen. Nach (Neu-)Laden gibt es keine
// alte Zeit; dann zaehlt jedes laufende Video mit currentTime > 0.
// anlaufNachsicht: so viele fruehe Fehlmessungen direkt nach dem Start
// zaehlen nicht als Stillstand (die Seite darf noch laden).
function createWaechter({ stillstandBisNeuLaden = 2, maxNeuLaden = 3, anlaufNachsicht = 0 } = {}) {
  let letzteZeit = null;
  let stillstand = 0;
  let neuLadungen = 0;
  let nachsicht = anlaufNachsicht;

  function messung(m) {
    const laeuft = !!(m && m.hatVideo && !m.paused);
    const zeit = m && typeof m.currentTime === 'number' ? m.currentTime : 0;
    const fortschritt = laeuft && (letzteZeit === null ? zeit > 0 : zeit > letzteZeit);
    if (laeuft) letzteZeit = zeit;

    if (fortschritt) {
      stillstand = 0;
      neuLadungen = 0;
      nachsicht = 0;
      return 'ok';
    }
    if (nachsicht > 0) {
      nachsicht -= 1;
      return 'warten';
    }
    stillstand += 1;
    if (stillstand < stillstandBisNeuLaden) return 'warten';
    stillstand = 0;
    letzteZeit = null;
    if (neuLadungen >= maxNeuLaden) return 'aufgeben';
    neuLadungen += 1;
    return 'neu-laden';
  }

  return { messung, neuLadungen: () => neuLadungen };
}

// Wartet hoechstens ms auf promise; danach oder bei Fehler kommt ersatz.
// Eine haengende Seite (executeJavaScript loest nie auf) zaehlt so als
// Stillstand, statt den Waechter fuer immer festzuhalten.
function mitZeitlimit(promise, ms, ersatz) {
  let timer = null;
  const ablauf = new Promise((resolve) => { timer = setTimeout(() => resolve(ersatz), ms); });
  return Promise.race([Promise.resolve(promise).catch(() => ersatz), ablauf])
    .finally(() => clearTimeout(timer));
}

module.exports = { zielKanal, createZuschauerSteuerung, createWaechter, mitZeitlimit };
