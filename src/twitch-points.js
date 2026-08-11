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
    channel { self { communityPoints { balance availableClaim { id } } } }
  }
}`;

const M_CLAIM = `mutation($input: ClaimCommunityPointsInput!) {
  claimCommunityPoints(input: $input) { currentPoints error { code } }
}`;

const Q_REWARDS = `query($channelLogin: String!) {
  community: user(login: $channelLogin) {
    id
    channel { communityPointsSettings {
      customRewards { id title cost isEnabled isPaused }
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
      if (!c) return { channelID: null, displayName: null, balance: null, claimID: null };
      const cp = c.channel && c.channel.self && c.channel.self.communityPoints;
      return {
        channelID: c.id,
        displayName: c.displayName,
        balance: cp ? cp.balance : null,
        claimID: cp && cp.availableClaim ? cp.availableClaim.id : null
      };
    },

    async claim(token, channelID, claimID, extraHeaders) {
      const d = await ruf(token, M_CLAIM, { input: { channelID, claimID } }, extraHeaders);
      const r = d && d.claimCommunityPoints;
      const fehler = r && r.error ? r.error.code : null;
      return { ok: !fehler, error: fehler };
    },

    async rewards(token, channelLogin) {
      const d = await ruf(token, Q_REWARDS, { channelLogin });
      const s = d && d.community && d.community.channel && d.community.channel.communityPointsSettings;
      const liste = (s && s.customRewards) || [];
      return liste
        .filter(r => r.isEnabled && !r.isPaused)
        .map(r => ({ id: r.id, title: r.title, cost: r.cost, enabled: true }));
    },

    // transactionID: von uns erzeugt, macht den Aufruf idempotent-faehig.
    // cost und title verlangt Twitch zwingend (im Spike gemessen), sie muessen
    // aus der Belohnungsliste durchgereicht werden.
    async redeem(token, channelID, reward, textInput) {
      const d = await ruf(token, M_REDEEM, {
        input: {
          channelID,
          rewardID: reward.id,
          cost: reward.cost,
          title: reward.title,
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
