const axios = require('axios');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { resolvePublicImageUrl } = require('../utils/publicImageUrl');

const RASTER_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/x-icon', 'image/vnd.microsoft.icon']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

exports.proxyImage = async (req, res) => {
    let target;
    try {
        target = await resolvePublicImageUrl(req.query.url);
    } catch {
        return res.status(400).send('URL inválida');
    }
    let source;
    try {
        const response = await axios({
            method: 'get', url: target.url, lookup: target.lookup,
            // A proxy or automatic redirect could bypass the validated destination.
            proxy: false, maxRedirects: 0, responseType: 'stream', timeout: 5000,
            headers: { 'User-Agent': 'Lumu-ImageProxy/1.0', Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' }
        });
        source = response.data;
        const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!RASTER_TYPES.has(contentType) || Number(response.headers['content-length']) > MAX_IMAGE_BYTES) {
            source.destroy();
            return res.status(400).send('Recurso inválido');
        }
        res.setHeader('Content-Type', contentType);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
        res.setHeader('Cache-Control', 'public, max-age=86400');
        let received = 0;
        const limit = new Transform({
            transform(chunk, encoding, callback) {
                received += chunk.length;
                callback(received > MAX_IMAGE_BYTES ? new Error('Image too large') : null, chunk);
            }
        });
        await pipeline(source, limit, res);
    } catch (error) {
        source?.destroy();
        error.response?.data?.destroy?.();
        console.warn('[ImageProxy] Image unavailable');
        if (!res.headersSent && !res.destroyed) res.status(404).end();
    }
};
