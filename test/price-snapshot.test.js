const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPriceSnapshotRows } = require('../src/services/cacheService');

const goodOffer = (patch = {}) => ({
    titulo: 'Laptop Model X',
    precio: '$1,299.00 USD',
    tienda: 'Store',
    urlOriginal: 'https://store.example/product?utm_source=search',
    countryCode: 'US',
    currency: 'USD',
    priceSource: 'direct_scraper',
    priceConfidence: 0.9,
    ...patch
});

test('price snapshots keep explicit market, source, confidence and normalized price', () => {
    const rows = buildPriceSnapshotRows([goodOffer()], 'query-key', 'US');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].price, 1299);
    assert.equal(rows[0].currency, 'USD');
    assert.equal(rows[0].country_code, 'US');
    assert.equal(rows[0].price_source, 'direct_scraper');
    assert.equal(rows[0].price_confidence, 0.9);
    assert.equal(rows[0].normalized_url, 'https://store.example/product');
});

test('snapshots skip unknown currency, uncertain, low confidence and unavailable offers', () => {
    const rows = buildPriceSnapshotRows([
        goodOffer({ currency: null }),
        goodOffer({ priceNeedsVerification: true }),
        goodOffer({ priceConfidence: 0.5 }),
        goodOffer({ isPotentiallyUnavailable: true }),
        goodOffer({ currency: 'US' }),
        goodOffer({ countryCode: 'ZZ' })
    ], 'query-key', 'US');
    assert.deepEqual(rows, []);
});
