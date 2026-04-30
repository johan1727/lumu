const buyTimingService = require('../services/buyTimingService');

/**
 * GET /api/buy-timing
 * Returns AI-powered buy timing prediction for a product
 * 
 * Query params:
 * - query (string, required): Product search term
 * - productUrl (string, optional): Specific product URL for precise prediction
 * - country (string, default: MX): Country code (MX, US, CL, CO, AR, PE)
 * - category (string, optional): Product category for better context
 */
exports.getBuyTiming = async (req, res) => {
  try {
    const query = (req.query.query || '').trim();
    const productUrl = (req.query.productUrl || '').trim() || null;
    const countryCode = String(req.query.country || 'MX').trim().toUpperCase();
    const category = (req.query.category || '').trim();
    
    // Validate required parameters
    if (!query || query.length < 2) {
      return res.status(400).json({ 
        error: 'Se requiere un query de al menos 2 caracteres.',
        example: '/api/buy-timing?query=iphone+15&country=MX'
      });
    }
    
    // Validate country code
    const validCountries = ['MX', 'US', 'CL', 'CO', 'AR', 'PE'];
    if (!validCountries.includes(countryCode)) {
      return res.status(400).json({ 
        error: 'Código de país no válido.',
        validCountries
      });
    }
    
    // Get prediction
    const result = await buyTimingService.getBuyTimingPrediction(
      query,
      productUrl,
      countryCode,
      category
    );
    
    // Handle unavailable predictions
    if (!result.available) {
      return res.status(200).json({
        query,
        country: countryCode,
        available: false,
        message: result.error || 'No hay suficientes datos históricos para esta predicción.',
        reason: result.reason || 'insufficient_data',
        tip: 'Intenta con un producto más popular o busca de nuevo en unos días para acumular más datos.'
      });
    }
    
    // Set cache headers (prediction changes slowly)
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=7200');
    
    res.json({
      query,
      country: countryCode,
      available: true,
      prediction: result.prediction,
      currentPriceContext: result.currentPriceContext,
      historicalPattern: result.historicalPattern,
      product: result.product,
      cached: result.cached || false
    });
    
  } catch (err) {
    console.error('[BuyTimingController] Error:', err);
    res.status(500).json({ 
      error: 'Error del servidor al generar predicción.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * GET /api/buy-timing/batch
 * Batch endpoint for multiple products (for VIP/B2B users)
 */
exports.getBatchTiming = async (req, res) => {
  try {
    const items = req.body?.items || [];
    const countryCode = String(req.body?.country || 'MX').trim().toUpperCase();
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'Se requiere array de items en el body.',
        example: {
          items: [
            { query: 'iphone 15', url: 'https://...' },
            { query: 'macbook air', category: 'laptop' }
          ],
          country: 'MX'
        }
      });
    }
    
    if (items.length > 10) {
      return res.status(400).json({
        error: 'Máximo 10 items por batch.'
      });
    }
    
    // Process in parallel
    const results = await Promise.all(
      items.map(async (item) => {
        const result = await buyTimingService.getBuyTimingPrediction(
          item.query,
          item.url || null,
          countryCode,
          item.category || ''
        );
        return {
          query: item.query,
          available: result.available,
          prediction: result.prediction,
          error: result.error
        };
      })
    );
    
    res.json({
      country: countryCode,
      results,
      processed: results.length,
      successful: results.filter(r => r.available).length
    });
    
  } catch (err) {
    console.error('[BuyTimingController] Batch error:', err);
    res.status(500).json({ error: 'Error procesando batch.' });
  }
};
