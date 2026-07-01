// Eingabe im gemeinsamen Feld interpretieren.
//
// Erlaubt:
//   - Channel-Name         -> LIVE            "papaplatte", "#papaplatte"
//   - VOD-Link             -> VOD via ID      "https://www.twitch.tv/videos/123456789"
//   - VOD-ID (mit v)       -> VOD             "v123456789"
//   - reine Ziffern        -> VOD             "123456789"
//   - Channel-URL          -> LIVE            "https://twitch.tv/papaplatte"

function parseInput(raw) {
  const input = String(raw || '').trim();
  if (!input) return { mode: null, value: null, error: 'Leere Eingabe' };

  // VOD-URL: .../videos/<id>
  const vodUrl = input.match(/twitch\.tv\/videos\/(\d+)/i);
  if (vodUrl) {
    return { mode: 'vod', value: vodUrl[1] };
  }

  // Channel-URL: twitch.tv/<name> (aber nicht /videos)
  const chanUrl = input.match(/twitch\.tv\/([A-Za-z0-9_]{2,25})(?:$|[/?])/i);
  if (chanUrl && chanUrl[1].toLowerCase() !== 'videos') {
    return { mode: 'live', value: chanUrl[1].toLowerCase() };
  }

  // "v123456789" oder reine Ziffern -> VOD-ID
  const vId = input.match(/^v?(\d{4,})$/i);
  if (vId) {
    return { mode: 'vod', value: vId[1] };
  }

  // Sonst: Channel-Name
  const name = input.replace(/^#/, '');
  if (/^[A-Za-z0-9_]{2,25}$/.test(name)) {
    return { mode: 'live', value: name.toLowerCase() };
  }

  return { mode: null, value: null, error: `Unbekannte Eingabe: "${input}"` };
}

module.exports = { parseInput };
