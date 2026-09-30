const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseShoppingPrice } = require('../src/services/priceParser');

test('parses common US and Latin American price separators without changing magnitude', () => {
    for (const [value, expected] of [
        ['$1,299.00 MXN', 1299],
        ['MXN 1.299,00', 1299],
        ['$1.299', 1299],
        ['$1,299', 1299],
        ['12,99', 12.99],
        ['12.99', 12.99],
        ['1.299.999', 1299999],
        ['1,299,999', 1299999],
        [1299, 1299]
    ]) assert.equal(parseShoppingPrice(value), expected, String(value));
});

test('rejects empty, nonpositive, malformed and ranged provider prices', () => {
    for (const value of ['', 'sin precio', '$0', '-10', '-$10', '$-10', '$29.99 - $39.99', 'MXN 1,299 a 1,599']) {
        assert.equal(parseShoppingPrice(value), null, String(value));
    }
});
