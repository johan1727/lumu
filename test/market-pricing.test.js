const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sameMarket, canCompareOfferPrices } = require('../src/services/marketPricing');

const offer = (patch = {}) => ({ currency: 'MXN', countryCode: 'MX', _modelMatchScore: 0.9, ...patch });

test('price comparisons require the same known market', () => {
    assert.equal(sameMarket(offer(), offer()), true);
    assert.equal(sameMarket(offer(), offer({ currency: 'USD' })), false);
    assert.equal(sameMarket(offer(), offer({ countryCode: 'US' })), false);
    assert.equal(sameMarket(offer(), offer({ currency: null })), false);
    assert.equal(canCompareOfferPrices(offer(), offer({ currency: 'USD' })), false);
});

test('same-market price comparisons require close model match and no variant conflict', () => {
    assert.equal(canCompareOfferPrices(offer(), offer({ _modelMatchScore: 0.82 })), true);
    assert.equal(canCompareOfferPrices(offer(), offer({ _modelMatchScore: 0.7 })), false);
    assert.equal(canCompareOfferPrices(offer(), offer({ _modelMatchScore: 0.6 })), false);
    assert.equal(canCompareOfferPrices(offer(), offer({ _modelMatchScore: 0.9, _variantMismatch: true })), false);
});
