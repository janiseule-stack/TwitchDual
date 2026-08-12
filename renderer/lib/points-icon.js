// Waehlt das Ersatz-Symbol fuer den Punktestand, wenn der Kanal kein eigenes
// gesetzt hat. UMD wie points-state.js: laeuft im Browser und unter Node.
//
// Regel: Farbfamilie folgt der Akzentfarbe des Fensters, die Auswahl
// innerhalb der Familie folgt dem Kanalnamen. Damit wechselt das Symbol mit
// dem Kanal, bleibt fuer denselben Kanal aber stabil - ein bei jedem Takt
// wechselndes Symbol waere Flackern, kein Wiedererkennungswert.
//
// Die Farbtoene sind aus der Sichtpruefung der Bilder geschaetzt, nicht
// gemessen. Fuer eine Auswahl in 60-Grad-Schritten reicht das.
//
// Hex-Auswertung bewusst eigenstaendig statt ThemeLib.normalizeHex: eine
// UMD-Abhaengigkeit zwischen zwei Libs muesste in beiden Welten (Browser-
// Global und Node-require) aufgeloest werden und waere mehr Umstand als die
// vier Zeilen hier.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PointsIcon = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // Handverlesen am 2026-08-12: einzeln in Originalgroesse angesehen. 7TVs
  // Katalog ist ueberwiegend Foto- und Meme-Material, das bei 18 px zu Matsch
  // wird - nur einfache Geometrie mit klarem Umriss bleibt lesbar.
  // Bekannte Luecke: Gruen und echtes Cyan fehlen; dort greift die
  // Ausweichregel. Die Liste ist reine Daten und darf wachsen.
  const EMOTES = [
    { name: 'heart',       id: '01KZ2PG8B9TNSPYCR5DM1JFG6F', farbton: 0 },
    { name: 'CoinSpin',    id: '01KTQBP5NBM4T6VN1X1VM234SR', farbton: 45 },
    { name: 'Diamond',     id: '01KYZBYQEFNJMEMVXW9QKRM8EF', farbton: 215 },
    { name: 'CrystalBall', id: '01KYGN8CP0JV0JG5RACB4PHX7T', farbton: 280 },
    { name: 'PixelHeart',  id: '01KF76P304N9AY0HKV32MN5A8C', farbton: 320 }
  ];

  const NAH_GRAD = 60;   // Breite einer Farbfamilie
  const ERSATZ_ANZAHL = 3; // wieviele Naechstliegende, wenn keine Familie passt

  function hexZuFarbton(input) {
    if (typeof input !== 'string') return null;
    let s = input.trim().toLowerCase();
    if (s[0] === '#') s = s.slice(1);
    if (/^[0-9a-f]{3}$/.test(s)) s = s.replace(/./g, (c) => c + c);
    if (!/^[0-9a-f]{6}$/.test(s)) return null;
    const r = parseInt(s.slice(0, 2), 16) / 255;
    const g = parseInt(s.slice(2, 4), 16) / 255;
    const b = parseInt(s.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    if (d === 0) return 0; // Grau hat keinen Farbton -> wie Rot behandeln
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  }

  // Kuerzester Weg auf dem Farbkreis - 350 und 10 sind 20 Grad auseinander,
  // nicht 340.
  function farbAbstand(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  // Stabile Streuung ueber den Kanalnamen. Keine Krypto noetig, nur eine
  // Zahl, die sich bei aehnlichen Namen unterscheidet.
  function quersumme(text) {
    let n = 0;
    const s = typeof text === 'string' ? text : '';
    for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) % 100000;
    return n;
  }

  function emoteUrl(id) {
    return 'https://cdn.7tv.app/emote/' + id + '/2x.webp';
  }

  function waehleEmote(accentHex, channelLogin, liste = EMOTES) {
    if (!Array.isArray(liste) || liste.length === 0) return null;
    const h = hexZuFarbton(accentHex);
    if (h === null) return null;
    let kandidaten = liste.filter((e) => farbAbstand(e.farbton, h) <= NAH_GRAD);
    if (kandidaten.length === 0) {
      // Keine passende Familie (z.B. gruene Akzentfarbe): die naechsten
      // nehmen, statt gar kein Symbol zu zeigen.
      kandidaten = liste
        .slice()
        .sort((a, b) => farbAbstand(a.farbton, h) - farbAbstand(b.farbton, h))
        .slice(0, ERSATZ_ANZAHL);
    }
    const e = kandidaten[quersumme(channelLogin) % kandidaten.length];
    return { ...e, url: emoteUrl(e.id) };
  }

  return { EMOTES, emoteUrl, waehleEmote, hexZuFarbton, farbAbstand };
});
