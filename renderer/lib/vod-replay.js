// Kernlogik des VOD-Chat-Replays: Fenster per Offset nachladen, per
// Kommentar-id deduplizieren, Puffer synchron zur Abspielzeit rendern.
// Bewusst DOM-frei: Rendering/Fehler laufen ueber injizierte Callbacks,
// das Nachladen ueber eine injizierte fetchPage-Funktion. Dadurch laeuft
// die Klasse sowohl im Browser (<script>) als auch unter Node (require)
// und ist ohne Electron unit-testbar (test/vod-replay.test.js).
//
// Zur Paginierung selbst (warum Offset statt Cursor): siehe src/twitch-api.js
// und README "VOD-Kommentar-Paginierung".

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VodReplayCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const VOD_LOOKAHEAD = 30; // Sekunden Puffer, die wir vor der Abspielzeit vorhalten
  const VOD_GAP_STEP = 30;  // Sprung, wenn ein Fenster keine neuen Kommentare bringt
  const SEEK_THRESHOLD = 10; // >10s Zeitdifferenz = Sprung im Player
  const KEEP_BEHIND = 120;  // abgespielte Kommentare aelter als das werden verworfen

  // Fragmente aus der VOD-API (koennen native Twitch-Emotes enthalten)
  // -> reiner Text; 7TV-Ersetzung passiert erst beim Rendern.
  function fragmentsToText(fragments) {
    return (fragments || []).map((f) => f.text).join('');
  }

  // Fragmente -> Token-Liste (gleiche Form wie IrcParse.emoteTokens).
  // Twitch liefert die Emote-ID je nach Query-Variante als emoteID oder id.
  function fragmentsToTokens(fragments) {
    const tokens = [];
    for (const f of fragments || []) {
      if (!f || !f.text) continue;
      const id = f.emote && (f.emote.emoteID || f.emote.id);
      if (id) tokens.push({ type: 'emote', name: f.text, id: String(id) });
      else tokens.push({ type: 'text', value: f.text });
    }
    return tokens;
  }

  // Dedupe-Schluessel eines Kommentars (id, sonst Inhalts-Fallback).
  function keyOf(c) {
    return c.id || `${c.offset}|${c.name}|${fragmentsToText(c.fragments)}`;
  }

  class VodReplayCore {
    // opts:
    //   videoId:       string
    //   lengthSeconds: number – VOD-Laenge; 0/unbekannt = keine Endebedingung
    //   fetchPage: async (videoId, offsetSeconds) => { ok, comments, error }
    //   onMessage: (comment) => void   – Kommentar rendern
    //   onClear:   () => void          – Anzeige leeren (nach Seek)
    //   onError:   (message) => void   – Fehlermeldung anzeigen
    constructor(opts) {
      const o = opts || {};
      this.videoId = o.videoId;
      this.lengthSeconds = o.lengthSeconds || 0;
      this.fetchPage = o.fetchPage;
      this.onMessage = o.onMessage || (() => {});
      this.onClear = o.onClear || (() => {});
      this.onError = o.onError || (() => {});

      this.buffer = [];        // sortiert nach offset, dedupliziert per id
      this.seen = new Set();   // bereits eingesammelte Kommentar-ids
      this.renderIndex = 0;    // naechster zu zeigender Kommentar
      this.coveredUntil = -1;  // bis zu diesem Offset haben wir Kommentare angefragt
      this.fetching = false;
      this.lastTime = null;
      this.initialized = false;
      // Jeder Seek erhoeht die Epoche. Antworten von Fetches, die vor dem Seek
      // gestartet wurden, tragen eine aeltere Epoche und werden verworfen –
      // sonst wuerde ein altes Fenster den frisch geleerten Puffer der neuen
      // Position verschmutzen (onTime/ensureCoverage feuern alle 500 ms und
      // koennen sich mit einem Seek ueberlappen).
      this.epoch = 0;
    }

    // Kommentare eines Fensters einsortieren (dedupe per id). Neue Kommentare
    // haben stets einen groesseren Offset als alles bereits Gezeigte, landen also
    // hinten – der Sort laesst den gerenderten Bereich [0..renderIndex) unberuehrt.
    merge(comments) {
      let added = 0;
      for (const c of comments) {
        const key = keyOf(c);
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        this.buffer.push(c);
        added++;
      }
      if (added) this.buffer.sort((a, b) => a.offset - b.offset);
      return added;
    }

    // Ein Kommentarfenster ab `offset` laden und einsortieren.
    // Gibt { reached, collision } zurueck – oder null, wenn die Antwort
    // veraltet ist (Seek waehrend des Fetches). collision heisst: die Antwort
    // ENTHIELT Kommentare, aber alle bei/hinter dem angefragten Offset –
    // Twitch hat (wieder) die Seite vor der Seitengrenze geliefert. Das ist
    // keine stille Luecke, sondern eine Grenz-/Void-Kollision (in busy Chats
    // bei ~55 Kommentaren/Seite staendig; live verifiziert 2026-07-04).
    async fetchAtOffset(offset) {
      const epoch = this.epoch;
      this.fetching = true;
      let res;
      try {
        res = await this.fetchPage(this.videoId, offset);
      } finally {
        // Nach einem Seek gehoert das fetching-Flag der neuen Epoche.
        if (epoch === this.epoch) this.fetching = false;
      }
      if (epoch !== this.epoch) return null;
      if (!res || !res.ok) {
        this.onError(res && res.error ? res.error : 'Kommentare nicht ladbar');
        return { reached: offset, collision: false };
      }
      this.merge(res.comments);
      const maxOff = res.comments.length
        ? res.comments[res.comments.length - 1].offset : null;
      return {
        reached: maxOff == null ? offset : Math.max(maxOff, offset),
        collision: maxOff != null && maxOff <= offset
      };
    }

    // Alles bis zum VOD-Ende angefragt? Dann gibt es nichts mehr nachzuladen.
    atEnd() {
      return this.lengthSeconds > 0 && this.coveredUntil >= this.lengthSeconds;
    }

    // Abgespielte Kommentare weit hinter der Abspielzeit verwerfen, damit
    // buffer und seen bei langen VODs nicht unbegrenzt wachsen. Die seen-Keys
    // duerfen mit raus: vorwaerts blaettern erreicht so alte Offsets nie
    // wieder, und ein Seek setzt ohnehin alles zurueck.
    trim(t) {
      const cutoff = t - KEEP_BEHIND;
      let n = 0;
      while (n < this.renderIndex && this.buffer[n].offset < cutoff) n++;
      if (n === 0) return 0;
      for (const c of this.buffer.splice(0, n)) this.seen.delete(keyOf(c));
      this.renderIndex -= n;
      return n;
    }

    // Puffer bis `t + VOD_LOOKAHEAD` auffuellen (ein Fenster pro Aufruf).
    async ensureCoverage(t) {
      if (this.fetching) return;
      if (this.atEnd()) return;
      if (this.coveredUntil >= t + VOD_LOOKAHEAD) return;
      const reqOffset = Math.max(this.coveredUntil, Math.floor(t));
      const r = await this.fetchAtOffset(reqOffset);
      if (r == null) return; // veraltet: Seek hat uebernommen
      if (r.reached > reqOffset) {
        this.coveredUntil = r.reached;
      } else if (r.collision) {
        // Seitengrenze/Void getroffen (busy Chat): +1s weitertasten, bis die
        // Folgeseite kommt. NICHT um GAP_STEP springen – das verwarf bis zu
        // 30s echte Kommentare ("Chat stuck" in Mega-Chats wie Caedrel).
        this.coveredUntil = reqOffset + 1;
      } else {
        // Komplett leere Antwort (hinter VOD-Ende / keine Daten) ->
        // grosszuegig ueberspringen, damit die Wiedergabe nicht haengt.
        this.coveredUntil = reqOffset + VOD_GAP_STEP;
      }
    }

    // Nach einem Sprung (Seek) komplett neu positionieren.
    async seekTo(t) {
      this.epoch++; // laufende Fetches der alten Position invalidieren
      this.fetching = false;
      this.onClear();
      this.buffer = [];
      this.seen = new Set();
      this.renderIndex = 0;
      this.coveredUntil = -1;
      const start = Math.max(0, Math.floor(t));
      const r = await this.fetchAtOffset(start);
      if (r == null) return; // veraltet: noch neuerer Seek dazwischen
      this.coveredUntil = Math.max(r.reached, start);
      // Etwas Kontext zeigen: die Kommentare bis t sofort einblenden.
      this.advance(t);
    }

    advance(t) {
      while (
        this.renderIndex < this.buffer.length &&
        this.buffer[this.renderIndex].offset <= t
      ) {
        this.onMessage(this.buffer[this.renderIndex]);
        this.renderIndex++;
      }
    }

    async onTime(t) {
      if (!this.initialized) {
        this.initialized = true;
        this.lastTime = t;
        await this.seekTo(t);
        return;
      }
      // Sprung erkennen (vor/zurueck).
      if (Math.abs(t - this.lastTime) > SEEK_THRESHOLD) {
        this.lastTime = t;
        await this.seekTo(t);
        return;
      }
      this.lastTime = t;
      this.advance(t);
      this.trim(t);
      await this.ensureCoverage(t);
    }
  }

  VodReplayCore.fragmentsToText = fragmentsToText;
  VodReplayCore.fragmentsToTokens = fragmentsToTokens;
  VodReplayCore.VOD_LOOKAHEAD = VOD_LOOKAHEAD;
  VodReplayCore.VOD_GAP_STEP = VOD_GAP_STEP;
  VodReplayCore.SEEK_THRESHOLD = SEEK_THRESHOLD;
  VodReplayCore.KEEP_BEHIND = KEEP_BEHIND;

  return VodReplayCore;
});
