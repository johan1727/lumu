const axios = require('axios');
const dns = require('dns').promises;

function isBlockedHostname(hostname = '') {
    const normalized = String(hostname || '').trim().toLowerCase();
    if (!normalized) return true;
    if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
    if (normalized === '0.0.0.0' || normalized === '::1' || normalized === '[::1]') return true;
    if (/^127\./.test(normalized)) return true;
    if (/^10\./.test(normalized)) return true;
    if (/^192\.168\./.test(normalized)) return true;
    if (/^169\.254\./.test(normalized)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) return true;
    return false;
}

// FIX #6: Resolve DNS and verify the resolved IP is not private (blocks DNS rebinding)
async function isBlockedAfterDnsResolve(hostname) {
    try {
        const result = await dns.lookup(hostname, { all: true });
        for (const entry of result) {
            if (isBlockedHostname(entry.address)) return true;
        }
        return false;
    } catch {
        return true;
    }
}

exports.proxyImage = async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).send('Falta el parámetro url');
        }

        // Validate basic URL structure
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            return res.status(400).send('URL inválida');
        }
        if (parsedUrl.username || parsedUrl.password || isBlockedHostname(parsedUrl.hostname)) {
            return res.status(400).send('URL inválida');
        }

        // FIX #6: DNS resolution check to prevent SSRF via DNS rebinding
        const dnsBlocked = await isBlockedAfterDnsResolve(parsedUrl.hostname);
        if (dnsBlocked) {
            return res.status(400).send('URL inválida');
        }

        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
            }
        });

        // Copy content type from source image
        const contentType = response.headers['content-type'];
        if (!contentType || !String(contentType).toLowerCase().startsWith('image/')) {
            return res.status(400).send('Recurso inválido');
        }
        res.setHeader('Content-Type', contentType);

        // Add caching headers so the browser doesn't refetch the same image constantly
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

        // Pipe the image stream directly to the response
        response.data.pipe(res);

    } catch (error) {
        console.error('[ImageProxy] Error fetching image:', error.message);
        // Silently fail and return a 404 so the frontend's onerror handler can kick in
        res.status(404).end();
    }
};
