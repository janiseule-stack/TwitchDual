// Animierte 7TV-Emotes fuer "Ads blocked" in der Leiste (Janis 09.10.2026:
// ausgesucht aus zwei Vorschau-Runden). Wechseln ab und zu, sofort bei einer
// geblockten Werbung. DOM-frei, UMD -> unter Node testbar.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AdsEmotes = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const EMOTES = [
    { name: 'block', id: '01HWTPMG7R0003S49WDMY4P5E5' },
    { name: 'roadblock', id: '01GYP3RCMR0000V37N96CPBMDT' },
    { name: 'Stop', id: '01FVPZD9W0000B05D8JC8TFHBC' },
    { name: 'WARNING', id: '01F7K98778000013577RS0MX3J' },
    { name: 'NOPERS', id: '01EZY51MDR000CYST6006V20T4' },
    { name: 'Tssk', id: '01GJECMQKR000FJVP0DX6EYSNN' },
    { name: 'DENIED', id: '01J35NXJ580001YW89XDYA9B36' },
    { name: 'BlockedByJames', id: '01GSC9P88R0003BP6R36CJ0X0N' }
  ];
  const url = (e) => 'https://cdn.7tv.app/emote/' + e.id + '/2x.webp';
  // Ein anderes als das aktuelle (zufall: () => 0..1).
  function naechstes(vorher, zufall) {
    if (vorher < 0) return Math.floor(zufall() * EMOTES.length);
    return (vorher + 1 + Math.floor(zufall() * (EMOTES.length - 1))) % EMOTES.length;
  }
  return { EMOTES, url, naechstes };
});
