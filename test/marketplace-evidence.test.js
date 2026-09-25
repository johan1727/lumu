const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const {createRequire}=require('node:module');
const {assessResult}=require('../src/services/resultQuality');
const fixture={title:'iPhone 15 128GB',price:9000,currency_id:'BRL',permalink:'https://www.mercadolivre.com.br/p/MLB123',available_quantity:2,status:'active'};
function load(name,stubs){const file=path.resolve('src/services/'+name+'.js'),mod={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{exports:mod.exports,module:mod,require:n=>n in stubs?stubs[n]:createRequire(file)(n),process:{env:{MELI_ACCESS_TOKEN:'fixture-secret'}},console:{log(){},warn(){},error(){}},URL,URLSearchParams,Buffer,setTimeout,clearTimeout,Date,AbortController});return mod.exports;}
test('direct marketplace uses authorized token only on fixed API, preserves country and evidence',async()=>{
 const requests=[];const service=load('directScraper',{axios:{get:async(url,options)=>{requests.push({url,options});return {data:{results:[fixture]}};}}});
 const rows=await service.scrapeMercadoLibreAPI('iPhone 15 128GB','BR',undefined,'new');
 assert.equal(requests.length,2);for(const r of requests){assert.equal(new URL(r.url).hostname,'api.mercadolibre.com');assert.match(r.url,/sites\/MLB/);assert.equal(r.options.headers.Authorization,'Bearer fixture-secret');assert.equal(r.options.maxRedirects,0);}
 assert.equal(rows.length,1);assert.equal(rows[0].currency,'BRL');assert.equal(rows[0].conditionLabel,'');
 const quality=assessResult(rows[0],'iPhone 15 128GB');assert.equal(quality.availabilityState,'in_stock');assert.equal(quality.totalCost,null);assert.equal(quality.availabilityEvidence.source,'mercadolibre_api');assert.ok(quality.availabilityEvidence.observedAt);
});
test('marketplace service preserves provider currency, unknown stock and condition; missing permalink is not invented',async()=>{
 const service=load('meliService',{'../utils/fetchWithTimeout':async()=>({ok:true,json:async()=>({results:[{...fixture,available_quantity:undefined,condition:'refurbished'},{...fixture,permalink:undefined}]})})});
 const rows=await service.searchMeli('iPhone 15 128GB','MX');assert.equal(rows.length,1);assert.equal(rows[0].currency,'BRL');assert.equal(rows[0].moneda,'BRL');assert.equal(rows[0].condition,'Reacondicionado');assert.equal(assessResult(rows[0],'iPhone 15 128GB').availabilityState,'unknown');assert.equal(assessResult(rows[0],'iPhone 15 128GB',{conditionMode:'new'}).qualityRejected,true);
});
test('featured deals reject wrong currency, unavailable listings and invented destinations',async()=>{
 const good={...fixture,currency_id:'MXN',original_price:10000,permalink:'https://www.mercadolibre.com.mx/p/MLM123'};
 const service=load('meliService',{'../utils/fetchWithTimeout':async(url,options)=>{assert.equal(options.redirect,'error');return {ok:true,json:async()=>({results:[good,{...good,currency_id:'BRL'},{...good,available_quantity:0},{...good,status:'closed'},{...good,permalink:undefined}]})};}});
 const rows=await service.getFlashDeals('MX');assert.equal(rows.length,1);assert.equal(rows[0].currencyCode,'MXN');assert.equal(rows[0].url,good.permalink);
});
