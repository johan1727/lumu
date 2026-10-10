const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/analytics.js'), 'utf8');

function createPage({ consent = null, config = {} } = {}) {
    const values = new Map(consent ? [['lumu_cookies', consent]] : []);
    const scripts = [];
    let configRequests = 0;
    const document = {
        readyState: 'loading',
        documentElement: { lang: 'es' },
        head: { appendChild: (script) => scripts.push(script) },
        body: { appendChild() {} },
        addEventListener() {},
        createElement: (tag) => ({ tagName: tag, setAttribute() {}, addEventListener() {}, style: {} }),
        getElementById: () => null
    };
    const window = {};
    vm.runInNewContext(source, {
        window,
        document,
        localStorage: {
            getItem: (key) => values.get(key) || null,
            setItem: (key, value) => values.set(key, value),
            removeItem: (key) => values.delete(key)
        },
        fetch: async () => {
            configRequests += 1;
            return { ok: true, json: async () => config };
        }
    });
    return { window, scripts, values, get configRequests() { return configRequests; } };
}

test('third-party analytics stays unloaded until optional consent is granted', async () => {
    const page = createPage({ config: { googleAnalyticsId: 'G-TEST123', clarityProjectId: 'a1b2c3d' } });
    assert.equal(page.configRequests, 0);
    assert.equal(page.scripts.length, 0);

    page.values.set('lumu_cookies', 'accepted');
    await page.window.updateAnalyticsConsent(true);

    assert.equal(page.configRequests, 1);
    assert.deepEqual(page.scripts.map((script) => script.src).sort(), [
        'https://www.clarity.ms/tag/a1b2c3d',
        'https://www.googletagmanager.com/gtag/js?id=G-TEST123'
    ]);
});

test('invalid public analytics identifiers are ignored', async () => {
    const page = createPage({ consent: 'accepted', config: {
        googleAnalyticsId: 'https://attacker.example/script.js',
        clarityProjectId: 'https://attacker.example'
    } });
    await page.window.updateAnalyticsConsent(true);
    assert.equal(page.scripts.length, 0);
});

test('rejecting analytics after consent sends denied states to loaded providers', async () => {
    const page = createPage({ consent: 'accepted', config: { googleAnalyticsId: 'G-TEST123', clarityProjectId: 'a1b2c3d' } });
    await page.window.updateAnalyticsConsent(true);
    page.window.updateAnalyticsConsent(false);

    const googleDenial = page.window.dataLayer.some((entry) => entry[0] === 'consent' && entry[1] === 'update' && entry[2].analytics_storage === 'denied');
    const clarityDenial = page.window.clarity.q.some((entry) => entry[0] === 'consentv2' && entry[1].analytics_Storage === 'denied');
    assert.equal(googleDenial, true);
    assert.equal(clarityDenial, true);
});
