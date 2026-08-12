// Kanalpunkte ueber Twitchs inoffizielle GraphQL-API.
// Bekommt Token und fetch uebergeben -> kein Electron, voll testbar.
// Bewiesen 2026-08-11: nur ein echter Web-Login-Token wird akzeptiert,
// der Device-Flow-Token liefert 401. Siehe Spec.

const { randomUUID } = require('crypto');

const WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const ENDPUNKT = 'https://gql.twitch.tv/gql';

const Q_CONTEXT = `query($channelLogin: String!) {
  community: user(login: $channelLogin) {
    id displayName
    channel {
      communityPointsSettings { name image { url } }
      self { communityPoints { balance availableClaim { id } } }
    }
  }
}`;

const M_CLAIM = `mutation($input: ClaimCommunityPointsInput!) {
  claimCommunityPoints(input: $input) { currentPoints error { code } }
}`;

const Q_REWARDS = `query($channelLogin: String!) {
  community: user(login: $channelLogin) {
    id
    channel { communityPointsSettings {
      customRewards { id title cost prompt isEnabled isPaused }
    } }
  }
}`;

const M_REDEEM = `mutation($input: RedeemCommunityPointsCustomRewardInput!) {
  redeemCommunityPointsCustomReward(input: $input) { error { code } }
}`;

// Erzeugt eine Transaktions-ID im Format, das Twitchs eigene Oberflaeche
// verwendet: UUID ohne Bindestriche.
function neueTransaktionsId() {
  return randomUUID().replace(/-/g, '');
}

function createPointsApi({ fetchImpl = fetch } = {}) {
  async function ruf(token, query, variables, extraHeaders) {
    const res = await fetchImpl(ENDPUNKT, {
      method: 'POST',
      headers: {
        ...(extraHeaders || {}),
        // Diese drei muessen zuletzt kommen: extraHeaders duerfen obendrauf
        // kommen, aber die Grundkopfzeilen niemals ersetzen.
        'Client-ID': WEB_CLIENT_ID,
        'Content-Type': 'application/json',
        'Authorization': 'OAuth ' + token
      },
      body: JSON.stringify({ query, variables })
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('Anmeldung abgelaufen (HTTP ' + res.status + ')');
    }
    const daten = JSON.parse(await res.text());
    if (daten.errors && daten.errors.length) {
      const erster = daten.errors[0];
      const m = erster.message || 'unbekannt';
      const code = erster.extensions && erster.extensions.code;
      // "service error" = Feld existiert, Dienst verweigert (Client-Integrity).
      if (/service error/i.test(m)) throw new Error('Von Twitch gesperrt: ' + m);
      // IntegrityCheckFailed: eigener, unterscheidbarer Fehlertyp, damit der
      // Aufrufer den Integrity-Satz verwerfen und neu ernten kann.
      if (code === 'IntegrityCheckFailed' || /integrity/i.test(m)) {
        const fehler = new Error('Twitch-Fehler: ' + m);
        fehler.integrity = true;
        throw fehler;
      }
      throw new Error('Twitch-Fehler: ' + m);
    }
    return daten.data;
  }

  return {
    async context(token, channelLogin) {
      const d = await ruf(token, Q_CONTEXT, { channelLogin });
      const c = d && d.community;
      if (!c) return { channelID: null, displayName: null, balance: null, claimID: null, punkteName: null, iconUrl: null };
      const cp = c.channel && c.channel.self && c.channel.self.communityPoints;
      // Kanaleigenes Punkte-Symbol und -Name. Rund die Haelfte der Kanaele
      // setzt beides nicht (am 2026-08-12 gegen die echte API geprueft) -
      // der Renderer hat dafuer eine Rueckfallebene.
      const cps = c.channel && c.channel.communityPointsSettings;
      return {
        channelID: c.id,
        displayName: c.displayName,
        balance: cp ? cp.balance : null,
        claimID: cp && cp.availableClaim ? cp.availableClaim.id : null,
        punkteName: (cps && cps.name) || null,
        iconUrl: (cps && cps.image && cps.image.url) || null
      };
    },

    async claim(token, channelID, claimID, extraHeaders) {
      const d = await ruf(token, M_CLAIM, { input: { channelID, claimID } }, extraHeaders);
      const r = d && d.claimCommunityPoints;
      const fehler = r && r.error ? r.error.code : null;
      // currentPoints ist der Stand NACH dem Einloesen. Die Kontext-Abfrage
      // liefert den Stand davor - die Differenz ist der Kistenbetrag. Bei
      // einem Fehlschlag ist der Wert bedeutungslos, deshalb null.
      const stand = !fehler && r && typeof r.currentPoints === 'number' ? r.currentPoints : null;
      return { ok: !fehler, error: fehler, currentPoints: stand };
    },

    async rewards(token, channelLogin) {
      const d = await ruf(token, Q_REWARDS, { channelLogin });
      const s = d && d.community && d.community.channel && d.community.channel.communityPointsSettings;
      const liste = (s && s.customRewards) || [];
      return liste
        .filter(r => r.isEnabled && !r.isPaused)
        // prompt wird durchgereicht, weil redeem ihn zwingend mitschicken muss
        // (sonst PROPERTIES_MISMATCH). null -> '' , damit die Mutation immer
        // einen String bekommt.
        .map(r => ({ id: r.id, title: r.title, cost: r.cost, prompt: r.prompt || '', enabled: true }));
    },

    // transactionID: von uns erzeugt, macht den Aufruf idempotent-faehig.
    // cost, title und prompt verlangt Twitch zwingend und vergleicht sie mit
    // der Belohnung auf dem Server - damit niemand eine veraltete Fassung
    // einloest. Fehlt einer davon, kommt PROPERTIES_MISMATCH zurueck (live
    // belegt 2026-08-12 am Kanal tolkin: cost+title allein reichten nicht).
    // Alle drei muessen deshalb aus der Belohnungsliste durchgereicht werden.
    async redeem(token, channelID, reward, textInput) {
      const d = await ruf(token, M_REDEEM, {
        input: {
          channelID,
          rewardID: reward.id,
          cost: reward.cost,
          title: reward.title,
          prompt: reward.prompt || '',
          transactionID: neueTransaktionsId(),
          textInput: textInput || ''
        }
      });
      const r = d && d.redeemCommunityPointsCustomReward;
      const fehler = r && r.error ? r.error.code : null;
      return { ok: !fehler, error: fehler };
    }
  };
}

module.exports = createPointsApi;
