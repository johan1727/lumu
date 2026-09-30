const { test } = require('node:test');
const assert = require('node:assert/strict');
const { priceAlertSchema } = require('../src/schemas/searchSchemas');

const request = (patch = {}) => ({
    product_name: 'Laptop Model X',
    target_price: 1000,
    product_url: 'https://store.example/product',
    target_currency: 'USD',
    country_code: 'US',
    ...patch
});

test('price alerts require a labeled target country and currency', () => {
    assert.equal(priceAlertSchema.safeParse(request()).success, true);
    assert.equal(priceAlertSchema.safeParse(request({ target_currency: undefined })).success, false);
    assert.equal(priceAlertSchema.safeParse(request({ country_code: undefined })).success, false);
    assert.equal(priceAlertSchema.safeParse(request({ product_url: undefined })).success, false);
    assert.equal(priceAlertSchema.safeParse(request({ target_currency: 'usd' })).success, false);
    assert.equal(priceAlertSchema.safeParse(request({ country_code: 'USA' })).success, false);
    assert.equal(priceAlertSchema.safeParse(request({ product_url: 'not-a-url' })).success, false);
});
