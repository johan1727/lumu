const axios = require('axios');

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
        if (contentType) {
            res.setHeader('Content-Type', contentType);
        }

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
