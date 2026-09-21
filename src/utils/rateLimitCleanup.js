const { isIP } = require('node:net');

// rate_limits also stores durable reward markers and monthly bonus credits.
// Delete only this request's network counter, never the entire shared ledger.
async function cleanupRequestCounters(client, ip, cutoff) {
    if (!isIP(ip)) return;
    return client.from('rate_limits').delete().eq('ip', ip).lt('created_at', cutoff);
}
module.exports = { cleanupRequestCounters };
