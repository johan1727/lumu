const { test } = require('node:test');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Writable } = require('node:stream');

function response() {
    const res = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    res.statusCode = 200;
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.body = body; return res; };
    return res;
}

function makeDb({ historyCurrency = 'USD', historyCountry = 'US', historySource = 'direct_scraper', historyConfidence = 0.9, alertCurrency = 'USD', alertCountry = 'US' } = {}) {
    const alert = { id: 'alert-1', user_id: 'user-1', product_name: 'Game', target_price: 20, target_currency: alertCurrency, country_code: alertCountry, product_url: 'https://example.com/product?ref=affiliate', store_name: 'Store', triggered: false };
    const updates = [];
    const historyFilters = [];
    const db = {
        from(table) {
            const query = { table, action: 'select', filters: [], values: null };
            query.select = () => { if (query.action !== 'update') query.action = 'select'; else query.returning = true; return query; };
            query.update = values => { query.action = 'update'; query.values = values; return query; };
            query.eq = (key, value) => { query.filters.push([key, value]); return query; };
            query.limit = () => query;
            query.in = () => query;
            query.ilike = () => query;
            query.gte = () => query;
            query.gt = () => query;
            query.order = () => query;
            query.then = (resolve, reject) => Promise.resolve().then(() => {
                if (query.table === 'price_alerts' && query.action === 'select') return { data: alert.triggered ? [] : [{ ...alert }], error: null };
                if (query.table === 'profiles') return { data: [{ id: 'user-1', telegram_chat_id: 'chat-1' }], error: null };
                if (query.table === 'price_history') { historyFilters.push(...query.filters); return { data: [{ product_title: 'Game', price: 10, store_name: 'Store', normalized_url: 'https://example.com/product', currency: historyCurrency, country_code: historyCountry, price_source: historySource, price_confidence: historyConfidence }], error: null }; }
                if (query.table === 'price_alerts' && query.action === 'update') {
                    updates.push({ ...query.values });
                    const matches = query.filters.every(([key, value]) => alert[key] === value);
                    if (!matches) return { data: [], error: null };
                    Object.assign(alert, query.values);
                    return { data: query.returning ? [{ id: alert.id }] : null, error: null };
                }
                return { data: [], error: null };
            }).then(resolve, reject);
            return query;
        },
        alert,
        updates,
        historyFilters
    };
    return db;
}

function loadController(db, sendPriceAlert) {
    const file = path.join(__dirname, '..', 'src/controllers/alertCheckController.js');
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
        module,
        exports: module.exports,
        require: name => {
            if (name === '../config/supabase') return db;
            if (name === './telegramController') return { sendPriceAlert };
            return createRequire(file)(name);
        },
        process: { env: { NODE_ENV: 'test' } },
        console,
        Date,
        URL
    });
    return module.exports;
}

test('failed Telegram delivery releases the alert for retry', async () => {
    const db = makeDb();
    const controller = loadController(db, async () => false);
    const res = response();
    await controller.checkAlerts({ headers: {} }, res);
    assert.equal(db.alert.triggered, false);
    assert.equal(res.body.triggered, 1);
    assert.equal(res.body.notified, 0);
    assert.equal(res.body.errors, 1);
    assert.deepEqual(db.updates.map(update => update.triggered), [true, false]);
    assert.ok(db.historyFilters.some(([key, value]) => key === 'normalized_url' && value === 'https://example.com/product'));
    assert.ok(db.historyFilters.some(([key, value]) => key === 'store_name' && value === 'Store'));
    assert.ok(db.historyFilters.some(([key, value]) => key === 'currency' && value === 'USD'));
    assert.ok(db.historyFilters.some(([key, value]) => key === 'country_code' && value === 'US'));
});

test('simultaneous cron runs claim a triggered alert only once', async () => {
    const db = makeDb();
    let sends = 0;
    const controller = loadController(db, async () => { sends++; await new Promise(resolve => setTimeout(resolve, 10)); return true; });
    const first = response();
    const second = response();
    await Promise.all([
        controller.checkAlerts({ headers: {} }, first),
        controller.checkAlerts({ headers: {} }, second)
    ]);
    assert.equal(sends, 1);
    assert.equal(db.alert.triggered, true);
    assert.equal(first.body.notified + second.body.notified, 1);
});

test('unlabelled historical prices cannot trigger a currency-sensitive alert', async () => {
    const db = makeDb({ historyCurrency: null });
    let sends = 0;
    const controller = loadController(db, async () => { sends++; return true; });
    const res = response();
    await controller.checkAlerts({ headers: {} }, res);
    assert.equal(db.alert.triggered, false);
    assert.equal(sends, 0);
    assert.equal(res.body.triggered, 0);
});

test('alerts reject nonmatching market and weak reported price sources', async () => {
    for (const options of [{ historyCurrency: 'MXN' }, { historyCountry: 'MX' }, { historySource: 'shopping_api', historyConfidence: 0.78 }]) {
        const db = makeDb(options);
        let sends = 0;
        const controller = loadController(db, async () => { sends++; return true; });
        const res = response();
        await controller.checkAlerts({ headers: {} }, res);
        assert.equal(db.alert.triggered, false);
        assert.equal(sends, 0);
    }
});

test('legacy alerts without saved market are held without guessing', async () => {
    const db = makeDb({ alertCurrency: null, alertCountry: null });
    let sends = 0;
    const controller = loadController(db, async () => { sends++; return true; });
    const res = response();
    await controller.checkAlerts({ headers: {} }, res);
    assert.equal(db.alert.triggered, false);
    assert.equal(sends, 0);
    assert.equal(db.historyFilters.length, 0);
});
