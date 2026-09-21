const {test}=require('node:test');const assert=require('node:assert/strict');
const {fetchPrimarySearchRoutes}=require('../src/services/primarySearchRoutes');
const defaults={apiKey:'test-only',shoppingQuery:'iPhone 15 128GB',webSearchQ:'iPhone 15 128GB site:amazon.com.mx',amazonDomain:'amazon.com.mx',gl:'mx',hl:'es',webNum:10,amazonNum:10,timeout:1000,retries:0};
test('exact product replaces redundant Shopping with organic destinations without crossing evidence',async()=>{
 const calls=[];const organic={organic:[{title:'iPhone 15 128GB',link:'https://www.amazon.com.mx/dp/B0CHX1W1XY',snippet:'Precio no informado'}]};
 const request=async c=>{calls.push(c);return {data:organic};};
 for(const preferredIncludesAmazon of [false,true]){
  calls.length=0;const p=fetchPrimarySearchRoutes({...defaults,request,isSpecificProduct:true,preferredIncludesAmazon});
  const [web,shopping]=await Promise.all([p.webPromise,p.amazonSpecificShoppingPromise]);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://google.serper.dev/search');assert.equal(JSON.parse(calls[0].data).gl,'mx');assert.equal(shopping,null);assert.deepEqual(web.data,organic);assert.equal(web.data.organic[0].price,undefined);
 }
});
test('generic explicit Amazon preference keeps two distinct sources; errors do not invent results',async()=>{
 const calls=[];const p=fetchPrimarySearchRoutes({...defaults,isSpecificProduct:false,preferredIncludesAmazon:true,request:async c=>{calls.push(c.url);throw new Error('provider denied');}});
 assert.deepEqual(await Promise.all([p.webPromise,p.amazonSpecificShoppingPromise]),[null,null]);assert.deepEqual(calls,['https://google.serper.dev/search','https://google.serper.dev/shopping']);
});
test('observed organic evidence never turns an ambiguous carrier amount into cash price',()=>{
 const {merchantReference}=require('../src/services/merchantReference');
 const sample=require('./fixtures/serper-organic-reference.json').organic;
 const rows=sample.map(x=>merchantReference(x,'iPhone 15 128GB'));
 assert.equal(rows.filter(x=>!x.qualityRejected).length,2);
 for(const r of rows){assert.equal(r.price,null);assert.equal(r.totalCost,null);assert.equal(r.availabilityState,'unknown');assert.equal(r.isMerchantReference,true);}
 assert.equal(rows[0].url,sample[0].link);assert.equal(rows[1].url,sample[1].link);
});
