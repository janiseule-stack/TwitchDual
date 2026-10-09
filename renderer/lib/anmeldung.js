// Ein Anmelden fuer beides: Chat/Gefolgt (Device Flow) + Kanalpunkte
// (Web-Login). Was steht in Home, welcher Schritt fehlt. DOM-frei, UMD wie
// die anderen Libs -> unter Node testbar.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Anmeldung = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function anzeige({ chat, punkte, name }) {
    if (chat && punkte) return { text: 'Angemeldet als ' + name, knopf: null, abmelden: true };
    if (!chat && !punkte) return { text: 'Nicht angemeldet', knopf: 'Mit Twitch anmelden', abmelden: false };
    return {
      text: 'Anmeldung unvollständig – ' + (chat ? 'Kanalpunkte fehlen' : 'Chat fehlt'),
      knopf: 'Anmeldung abschließen',
      abmelden: true
    };
  }

  // Twitch liefert die Aktivierungsseite meist schon mit device-code (Code
  // vorausgefuellt); sonst haengen wir ihn selbst an.
  function aktivierungsUrl({ verification_uri, user_code }) {
    const u = verification_uri || 'https://www.twitch.tv/activate';
    if (/[?&]device-code=/.test(u)) return u;
    return u + (u.includes('?') ? '&' : '?') + 'device-code=' + encodeURIComponent(user_code || '');
  }

  return { anzeige, aktivierungsUrl };
});
