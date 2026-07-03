// Geteilte Test-Helfer: Fake-Response + Fake-fetch, Antworten der Reihe
// nach abspielen. Kein Netz in Tests.

function res(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeFetch(script) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const next = script.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { fn, calls };
}

// Tests nicht schlafen lassen (Backoff-Delays ueberspringen).
const fast = { delayFn: async () => {} };

module.exports = { res, fakeFetch, fast };
