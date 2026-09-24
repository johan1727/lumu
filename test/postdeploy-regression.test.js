const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const {createRequire}=require('node:module');
test('production shopping pipeline retains observed organic pages when Shopping links are opaque',async()=>{
 const file=path.resolve('src/services/shoppingService.js'),mod={exports:{}};const requests=[];
 const stubs={axios:async config=>{requests.push(config);return {status:200,data:config.url.endsWith('/shopping')?{shopping:[{title:'iPhone 15 128GB',price:10000,link:'https://www.google.com/search?ibp=oshop'}]}:require('./fixtures/serper-organic-reference.json')};},'./directScraper':new Proxy({},{get:()=>async()=>[]}),'./meliService':{searchMeli:async()=>[]},'./scraperMonitor':{wrap:fn=>fn()},'./localPriceExtractor':{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{exports:mod.exports,module:mod,require:n=>n in stubs?stubs[n]:createRequire(file)(n),process:{env:{NODE_ENV:'production',SERPER_API_KEY:'fixture-key'}},console:{log(){},warn(){},error(){}},URL,Buffer,setTimeout,clearTimeout,Date,AbortController});
 const rows=await mod.exports.searchGoogleShopping('iPhone 15 128GB','global',null,null,'producto',undefined,'new','MX',[],'smartphone',[],null,{queryType:'brand_model',webQuery:'iPhone 15 128GB -funda -usado -refurbished'});
 assert.ok(requests.some(x=>x.url.endsWith('/search')));
 assert.ok(rows.some(x=>x.url.includes('/dp/B0CHX41WDS')),JSON.stringify(rows));
 assert.ok(rows.every(x=>!x.url.includes('google.com')));
 assert.ok(rows.filter(x=>x.isMerchantReference).every(x=>x.price===null));
});
test('provider circuit distinguishes credential denial from transient failures',()=>{
 let time=0;const c=require('../src/utils/providerCircuit').createProviderCircuit(()=>time);
 c.observe('gemini',403);assert.equal(c.isBlocked('gemini'),true);assert.equal(c.isBlocked('meli'),false);
 time=300001;assert.equal(c.isBlocked('gemini'),false);c.observe('meli',429);assert.equal(c.isBlocked('meli'),true);
 c.observe('other',500);assert.equal(c.isBlocked('other'),false);
});
test('fetch wrapper strips Gemini URL key and prevents repeated suspended requests',async t=>{
 const previous=global.fetch;t.after(()=>{global.fetch=previous;});let calls=0;
 global.fetch=async(url,options)=>{calls++;assert.ok(!url.includes('secret'));assert.equal(options.headers['x-goog-api-key'],'secret');return {status:403,ok:false};};
 const bounded=require('../src/utils/fetchWithTimeout');
 await bounded('https://generativelanguage.googleapis.com/v1beta/test?key=secret');
 await assert.rejects(bounded('https://generativelanguage.googleapis.com/v1beta/test?key=secret'),e=>e.code==='PROVIDER_COOLDOWN'&&!e.message.includes('secret'));
 assert.equal(calls,1);
});
test('US never falls back to a Latin American marketplace currency or cached deals',async()=>{
 const meli=require('../src/services/meliService');
 assert.deepEqual(await meli.searchMeli('iPhone 15','US'),[]);
 assert.deepEqual(await meli.getFlashDeals('US'),[]);
});
