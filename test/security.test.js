const { test } = require('node:test');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Readable, Writable } = require('node:stream');
const { isPublicAddress, resolvePublicImageUrl } = require('../src/utils/publicImageUrl');

function load(file, stubs, env = {}) {
    const exports = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
        exports, module: { exports }, require: name => Object.hasOwn(stubs, name) ? stubs[name] : createRequire(path.join(__dirname, '..', file))(name),
        process: { env }, console, Buffer, URL, setTimeout, clearTimeout, Date
    });
    return exports;
}
function response() {
    const chunks = [];
    const res = new Writable({ write(chunk, _, cb) { chunks.push(chunk); cb(); } });
    res.statusCode = 200; res.headers = {};
    res.status = code => { res.statusCode = code; return res; };
    res.json = res.send = body => { res.body = body; res.end(); return res; };
    res.setHeader = (key, value) => { res.headers[key] = value; };
    res.chunks = chunks;
    return res;
}

test('proxy blocks private, mapped, reserved, multicast and malformed IPs', () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1', 'bad']) assert.equal(isPublicAddress(address), false, address);
    assert.equal(isPublicAddress('8.8.8.8'), true);
    assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});
test('URL checks reject unsafe schemes, credentials, mixed DNS and encoded loopback', async () => {
    for (const url of ['file:///etc/passwd', 'http://user:pass@example.com', 'http://2130706433', 'http://[::ffff:7f00:1]', ['https://example.com']]) await assert.rejects(resolvePublicImageUrl(url));
    await assert.rejects(resolvePublicImageUrl('https://example.com', async () => [{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]));
});
test('socket lookup reuses checked DNS answer without resolving again', async () => {
    let calls = 0;
    const target = await resolvePublicImageUrl('https://example.com/a.png', async () => { calls++; return [{address:'8.8.8.8',family:4}]; });
    target.lookup('example.com', {}, (err, address, family) => { assert.ifError(err); assert.equal(address,'8.8.8.8'); assert.equal(family,4); });
    target.lookup('example.com', {all:true}, (err, entries) => { assert.ifError(err); assert.equal(entries[0].address,'8.8.8.8'); });
    assert.equal(calls, 1);
});
for (const mime of ['image/svg+xml', 'text/html', 'image/png']) test(`proxy MIME handling: ${mime}`, async () => {
    const stream = Readable.from([Buffer.from('image fixture')]);
    const controller = load('src/controllers/imageProxy.js', {
        axios: async options => { assert.equal(options.maxRedirects,0); assert.equal(options.proxy,false); assert.equal(typeof options.lookup,'function'); return {headers:{'content-type':mime},data:stream}; },
        '../utils/publicImageUrl': {resolvePublicImageUrl: async () => ({url:'https://example.com/image',lookup(){}})}
    });
    const res = response(); await controller.proxyImage({query:{url:'https://example.com/image'}},res);
    if (mime === 'image/png') { assert.equal(res.statusCode,200); assert.equal(res.headers['Content-Security-Policy'],"sandbox; default-src 'none'"); assert.equal(Buffer.concat(res.chunks).toString(),'image fixture'); }
    else { assert.equal(res.statusCode,400); assert.equal(stream.destroyed,true); }
});
for (const secret of [undefined, 'expected']) test(`Telegram rejects ${secret ? 'wrong secret' : 'missing configuration'} before DB access`, async () => {
    const controller = load('src/controllers/telegramController.js', {'../config/supabase': new Proxy({}, {get(){throw new Error('Database must not be accessed');}})}, {TELEGRAM_WEBHOOK_SECRET:secret});
    const res = response(); await controller.handleWebhook({headers:{'x-telegram-bot-api-secret-token':'wrong'},body:{}},res);
    assert.equal(res.statusCode, secret ? 403 : 503);
});
test('Telegram accepts the configured secret for a no-op update', async () => {
    const controller = load('src/controllers/telegramController.js', {'../config/supabase':null}, {TELEGRAM_WEBHOOK_SECRET:'expected'});
    const res=response(); await controller.handleWebhook({headers:{'x-telegram-bot-api-secret-token':'expected'},body:{}},res); assert.equal(res.statusCode,200);
});
for (const plan of ['free','personal_vip','personal_vip_annual','b2b','b2b_annual']) test(`bulk search plan gate: ${plan}`, async () => {
    let accessedQuota = false;
    const fakeDb={from(){accessedQuota=true;return {select(){return this;},eq(){return this;},gte:async()=>({count:200,error:null})};}};
    const dependencies=['llmService','shoppingService','cacheService','deepResearchEnhancer','visionService','couponService','storeTrustService','regionConfigService','buyTimingService','userProfileService'];
    const stubs=Object.fromEntries(dependencies.map(name=>[`../services/${name}`,{}]));
    Object.assign(stubs, {'../utils/affiliateManager':{},'../config/supabase':fakeDb,'../utils/profileCache':{getProfile:async()=>({plan,is_premium:plan!=='free'})}});
    const controller=load('src/controllers/searchController.js',stubs); const res=response();
    await controller.bulkSearch({userId:'test-user',body:{queries:['test']}},res);
    assert.equal(res.statusCode,402); assert.equal(accessedQuota,plan.startsWith('b2b'));
});
test('rate cleanup preserves signup, referral and bonus ledger rows', async () => {
    const { cleanupRequestCounters } = require('../src/utils/rateLimitCleanup');
    const old='2026-01-01T00:00:00.000Z'; const cutoff='2026-09-18T00:00:00.000Z';
    let rows=['8.8.8.8','1.1.1.1','signup-bonus:user:alice','referral-used:user:alice','bonus:user:alice'].map(ip=>({ip,created_at:old}));
    const client={from(table){assert.equal(table,'rate_limits');return {delete(){return this;},eq(key,value){this.key=key;this.value=value;return this;},lt(key,value){rows=rows.filter(row=>!(row[this.key]===this.value && row[key]<value));return Promise.resolve({});}};}};
    await cleanupRequestCounters(client,'8.8.8.8',cutoff);
    assert.deepEqual(rows.map(row=>row.ip),['1.1.1.1','signup-bonus:user:alice','referral-used:user:alice','bonus:user:alice']);
    await cleanupRequestCounters(client,'signup-bonus:user:alice',cutoff);
    assert.equal(rows.length,4);
});
