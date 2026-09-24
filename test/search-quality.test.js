const {test}=require('node:test');const assert=require('node:assert/strict');
const {availabilityOf,assessResult}=require('../src/services/resultQuality');
const {createProviderRequest}=require('../src/services/providerRequest');
test('stock separates terminal listings from verification failures and unknowns',()=>{
 assert.equal(availabilityOf({productHttpStatus:404}),'removed');
 assert.equal(availabilityOf({availability:'https://schema.org/OutOfStock'}),'out_of_stock');
 assert.equal(availabilityOf({available_quantity:0}),'out_of_stock');
 assert.equal(availabilityOf({productHttpStatus:403,availability:'OutOfStock'}),'unknown');
 assert.equal(availabilityOf({verificationError:'timeout'}),'unknown');
 assert.equal(availabilityOf({snippet:'Envío no disponible para tu código postal'}),'unknown');
 assert.equal(availabilityOf({availability:'https://schema.org/InStock'}),'in_stock');
 assert.equal(availabilityOf({snippet:'Producto agotado'}),'possibly_unavailable');
});
test('specific devices exclude wrong generation and accessory listings but retain intended accessories',()=>{
 assert.equal(assessResult({title:'Funda para iPhone 15'},'iPhone 15').qualityRejected,true);
 assert.equal(assessResult({title:'Apple iPhone 14 128GB'},'iPhone 15').qualityRejected,true);
 assert.equal(assessResult({title:'Apple iPhone 15 128GB'},'iPhone 15').qualityRejected,false);
 assert.equal(assessResult({title:'Funda transparente iPhone 15'},'funda iPhone 15').qualityRejected,false);
 assert.ok(assessResult({title:'Sony audífonos inalámbricos'},'audífonos Sony').relevanceScore>assessResult({title:'Monitor LG 27 pulgadas'},'audífonos Sony').relevanceScore);
});
test('provider deduplicates bursts, limits cache freshness and preserves result isolation',async()=>{
 let calls=0,time=0;const fetch=createProviderRequest(async()=>{calls++;return {status:200,data:{shopping:[{title:'Phone'}]}}},{now:()=>time,ttl:30});
 const config={url:'https://google.serper.dev/shopping',method:'POST',data:{q:'phone',gl:'mx'}};
 const results=await Promise.all(Array.from({length:5},()=>fetch(config)));
 assert.equal(calls,1);results[0].data.shopping[0].title='changed';assert.equal(results[1].data.shopping[0].title,'Phone');
 await fetch(config);assert.equal(calls,1);time=31;await fetch(config);assert.equal(calls,2);
 await fetch({...config,data:{q:'phone',gl:'us'}});assert.equal(calls,3);
});
test('429 respects cooldown, authentication errors do not retry and 5xx retries are bounded',async()=>{
 let calls=0,time=0;const fetch=createProviderRequest(async()=>{calls++;const e=new Error('quota');e.response={status:429,headers:{'retry-after':'10'}};throw e},{now:()=>time,sleep:async()=>{}});
 const config={url:'https://google.serper.dev/shopping'};
 await assert.rejects(fetch(config));await assert.rejects(fetch(config));assert.equal(calls,1);
 time=10001;await assert.rejects(fetch(config));assert.equal(calls,2);
 for(const [status,expected] of [[401,1],[500,2]]){let n=0;const f=createProviderRequest(async()=>{n++;throw Object.assign(new Error('fail'),{response:{status}})},{sleep:async()=>{}});await assert.rejects(f(config,1));assert.equal(n,expected);}
});
test('cancelling one search does not cancel a coalesced caller',async()=>{
 let finish,calls=0;const request=createProviderRequest(async()=>{calls++;return new Promise(resolve=>{finish=()=>resolve({status:200,data:{shopping:[]}});});});
 const a=new AbortController(),b=new AbortController();const config={url:'https://google.serper.dev/shopping',data:'same'};
 const first=request({...config,signal:a.signal});const second=request({...config,signal:b.signal});a.abort();await assert.rejects(first,{code:'ERR_CANCELED'});finish();assert.deepEqual((await second).data,{shopping:[]});assert.equal(calls,1);
});
test('live reference: opaque Google Shopping URLs are not buyable merchant offers',()=>{
 const sample=require('./fixtures/google-shopping-reference.json');
 for(const item of sample){const result=assessResult(item,'iPhone 15 128GB');assert.equal(result.qualityRejected,true);assert.equal(result.qualityReason,'unresolved_merchant_url');}
 const direct=assessResult({title:'iPhone 15',url:'https://www.google.com/url?q=https%3A%2F%2Fwww.amazon.com.mx%2Fdp%2FB012345678'},'iPhone 15');assert.equal(direct.qualityRejected,false);assert.equal(new URL(direct.url).hostname,'www.amazon.com.mx');
});
test('capacity, variant and stated condition are explicit constraints',()=>{
 for(const [title,query,reason] of [['iPhone 15 256GB','iPhone 15 128GB','different_capacity'],['iPhone 15 Pro 128GB','iPhone 15 128GB','different_variant'],['iPhone 15 usado','iPhone 15 nuevo','different_condition']]) assert.equal(assessResult({title},query).qualityReason,reason);
 assert.equal(assessResult({title:'iPhone 15 1TB'},'iPhone 15 1024GB').qualityRejected,false);
});
test('totals require complete explicit costs, and commission cannot affect order',()=>{
 const {rankOffers,offerEvidence}=require('../src/services/resultQuality');
 const a={title:'Phone A',price:100,currency:'MXN',shippingCost:0,additionalFees:0,costsComplete:true};
 assert.equal(offerEvidence(a).totalCost,100);
 for(const change of [{shippingCost:null},{additionalFees:undefined},{costsComplete:false},{currency:null},{shippingCost:''}]) assert.equal(offerEvidence({...a,...change}).totalCost,null);
 assert.equal(offerEvidence(a).availabilityEvidence.observedAt,null);
 const b={...a,title:'Phone B',price:80};
 assert.deepEqual(rankOffers([a,b],'Phone').map(x=>x.title),['Phone B','Phone A']);
 assert.deepEqual(rankOffers([{...a,commission:999,affiliatePriorityRank:0,affiliateCapBoost:99},{...b,commission:0}],'Phone').map(x=>x.title),['Phone B','Phone A']);
});
test('provider negative operators are exclusions, not requested condition or accessories',()=>{
 const q='iPhone 15 128GB -funda -case -usado -reacondicionado -refurbished -"open box"';
 assert.equal(assessResult({title:'iPhone 15 128GB',condition:'new'},q).qualityRejected,false);
 assert.equal(assessResult({title:'Funda iPhone 15 128GB'},q).qualityReason,'accessory_for_device');
 assert.equal(assessResult({title:'iPhone 15 128GB',condition:'refurbished'},'iPhone 15 128GB nuevo').qualityReason,'different_condition');
});
