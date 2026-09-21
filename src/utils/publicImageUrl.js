const dns = require('node:dns').promises;
const net = require('node:net');
const ipaddr = require('ipaddr.js');

function isPublicAddress(address) {
    try {
        let parsed = ipaddr.parse(address);
        if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) parsed = parsed.toIPv4Address();
        return parsed.range() === 'unicast';
    } catch {
        return false;
    }
}

async function resolvePublicImageUrl(value, lookup = dns.lookup) {
    if (typeof value !== 'string' || value.length > 4096) throw new Error('Invalid URL');
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        hostname === 'localhost' || hostname.endsWith('.localhost')) throw new Error('Invalid URL');
    const family = net.isIP(hostname);
    const addresses = family ? [{ address: hostname, family }] : await lookup(hostname, { all: true });
    if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) throw new Error('Blocked address');
    // Pin the validated answer to the socket: a second DNS lookup would allow rebinding.
    const pinnedLookup = (_hostname, options, callback) => {
        if (typeof options === 'function') { callback = options; options = {}; }
        const requestedFamily = typeof options === 'number' ? options : options?.family;
        const candidates = requestedFamily ? addresses.filter(entry => entry.family === requestedFamily) : addresses;
        if (!candidates.length) return callback(new Error('Address family unavailable'));
        if (options?.all) return callback(null, candidates);
        callback(null, candidates[0].address, candidates[0].family);
    };
    return { url: url.href, lookup: pinnedLookup };
}

module.exports = { isPublicAddress, resolvePublicImageUrl };
