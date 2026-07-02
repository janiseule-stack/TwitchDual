// Wandelt einen Chat-Text in DOM-sichere HTML-Bausteine um und ersetzt
// Emote-Woerter durch <img>. Funktioniert sowohl im Browser (<script>) als
// auch unter Node (require) -> dadurch testbar.
//
// Rueckgabe: Array von Tokens { type: 'text', value } | { type: 'emote', name, url }
// Das Escaping/Rendering macht der Aufrufer (damit XSS-frei ueber textContent).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EmoteText = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // text: string, emoteMap: { name: url }
  function tokenize(text, emoteMap) {
    const tokens = [];
    if (!text) return tokens;
    // An Whitespace splitten, Trenner behalten, damit Abstaende erhalten bleiben.
    const parts = String(text).split(/(\s+)/);
    for (const part of parts) {
      if (part === '') continue;
      if (/^\s+$/.test(part)) {
        tokens.push({ type: 'text', value: part });
        continue;
      }
      if (emoteMap && Object.prototype.hasOwnProperty.call(emoteMap, part)) {
        tokens.push({ type: 'emote', name: part, url: emoteMap[part] });
      } else {
        tokens.push({ type: 'text', value: part });
      }
    }
    return tokens;
  }

  // Offizielle Twitch-Emotes: Bild-URL ist rein aus der ID ableitbar
  // (statischer CDN, kein API-Call). Einzige Stelle fuer dieses URL-Schema.
  function twitchEmoteUrl(id) {
    return 'https://static-cdn.jtvnw.net/emoticons/v2/' +
      encodeURIComponent(String(id)) + '/default/dark/1.0';
  }

  return { tokenize, twitchEmoteUrl };
});
