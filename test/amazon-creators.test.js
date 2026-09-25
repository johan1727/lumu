const {test}=require('node:test');const assert=require('node:assert/strict');
const {createAmazonCreatorsService}=require('../src/services/amazonCreatorsService');
const env={AMAZON_CREATORS_ENABLED:'true',AMAZON_CREATORS_CREDENTIAL_ID:'fixture-id',AMAZON_CREATORS_CREDENTIAL_SECRET:'fixture-secret',AMAZON_CREATORS_CREDENTIAL_VERSION:'3.1',AMAZON_AFFILIATE_TAG_MX:'fixture-mx',AMAZON_AFFILIATE_TAG_US:'fixture-us'};
const item=(host='www.amazon.com.mx',currency='MXN')=>({detailPageURL:`https://${host}/dp/B0CHX41WDS?tag=fixture-mx`,itemInfo:{title:{displayValue:'iPhone 15 128GB'}},offersV2:{listings:[{isBuyBoxWinner:true,price:{money:{amount:9000,currency}},condition:{value:'New'},availability:{type:'IN_STOCK'}}]}});
test('Creators API is opt-in and requires complete current credentials and market tag',async()=>{
 for(const config of [{}, {...env,AMAZON_CREATORS_ENABLED:'false'}, {...env,AMAZON_CREATORS_CREDENTIAL_VERSION:'2.1'}, {...env,AMAZON_CREATORS_CREDENTIAL_SECRET:''}, {...env,AMAZON_AFFILIATE_TAG_US:''}]){
  const service=createAmazonCreatorsService({env:config,request:()=>assert.fail('network without configuration')});assert.equal(await service.search('iPhone','US'),null);
 }
 const service=createAmazonCreatorsService({env,request:()=>assert.fail('unsupported market')});assert.equal(await service.search('iPhone','CL'),null);
});
test('OAuth tokens are cached/renewed, official camelCase OffersV2 preserves evidence and market boundaries',async()=>{
 let time=1000000;const requests=[];
 const service=createAmazonCreatorsService({env,now:()=>time,request:async options=>{requests.push(options);return {data:options.url.includes('/auth/')?{access_token:'fixture-access',expires_in:3600}:{searchResult:{items:[item()]}}};}});
 let rows=await service.search('iPhone 15 128GB','MX');await service.search('iPhone 15 128GB','MX');assert.equal(requests.filter(r=>r.url.includes('/auth/')).length,1);
 assert.equal(requests[0].url,'https://api.amazon.com/auth/o2/token');assert.equal(requests[0].data.scope,'creatorsapi::default');
 const call=requests[1];assert.equal(call.url,'https://creatorsapi.amazon/catalog/v1/searchItems');assert.equal(call.headers.Authorization,'Bearer fixture-access');assert.equal(call.headers['x-marketplace'],'www.amazon.com.mx');assert.equal(call.data.partnerTag,'fixture-mx');assert.ok(call.data.resources.includes('offersV2.listings.price'));assert.ok(!('Resources' in call.data));assert.equal(call.maxRedirects,0);assert.equal(call.timeout,4500);
 assert.equal(rows.length,1);assert.equal(rows[0].price,9000);assert.equal(rows[0].currency,'MXN');assert.equal(rows[0].availabilityState,'in_stock');assert.equal(rows[0].condition,'New');assert.equal(rows[0].totalCost,null);assert.equal(rows[0].affiliateAttributionStatus,'unverified');
 time+=3600000;await service.search('iPhone 15 128GB','MX');assert.equal(requests.filter(r=>r.url.includes('/auth/')).length,2);
 assert.equal((await service.search('iPhone 15 128GB','US')).length,0);assert.equal(requests.at(-1).data.partnerTag,'fixture-us');
});
test('denials and quota cooldown do not leak secrets or retry credentials',async()=>{
 for(const status of [401,403,429]){
  let calls=0;const service=createAmazonCreatorsService({env,request:async()=>{calls++;throw Object.assign(new Error('fixture-secret fixture-access'),{response:{status,data:'fixture-secret'}});}});
  await assert.rejects(service.search('iPhone','MX'),error=>error.status===status&&!JSON.stringify(error).includes('fixture-secret')&&!error.message.includes('fixture-secret'));
  assert.deepEqual(await service.search('iPhone','MX'),[]);assert.equal(calls,1);
 }
});
test('only matching featured listing supplies cash price; gated deals and unknown availability are not invented',async()=>{
 const missing=item();delete missing.offersV2.listings[0].availability;
 const rowsToReject=[];
 for(const change of [x=>x.offersV2.listings[0].isBuyBoxWinner=false,x=>x.offersV2.listings[0].price.money.currency='USD',x=>x.offersV2.listings[0].availability.type='OUT_OF_STOCK',x=>x.offersV2.listings[0].type='SUBSCRIBEAND_SAVE',x=>x.offersV2.listings[0].dealDetails={accessType:'PRIME_EXCLUSIVE'},x=>x.detailPageURL='https://www.amazon.com.mx.evil.test/dp/1']){const x=item();change(x);rowsToReject.push(x);}
 const service=createAmazonCreatorsService({env,request:async options=>({data:options.url.includes('/auth/')?{access_token:'fixture-access',expires_in:3600}:{searchResult:{items:[missing,...rowsToReject]}}})});
 const rows=await service.search('iPhone 15 128GB','MX');assert.equal(rows.length,1);assert.equal(rows[0].availabilityState,'unknown');assert.equal(rows[0].totalCost,null);
});
test('concurrent searches share token acquisition and cancellation does not cancel others',async()=>{
 let authCalls=0;const service=createAmazonCreatorsService({env,request:async options=>{if(options.url.includes('/auth/')){authCalls++;await new Promise(r=>setTimeout(r,5));return {data:{access_token:'fixture-access',expires_in:3600}};}return {data:{searchResult:{items:[item()]}}};}});
 const controller=new AbortController();const a=service.search('iPhone 15','MX',controller.signal),b=service.search('iPhone 15','MX');controller.abort();assert.deepEqual(await a,[]);assert.equal((await b).length,1);assert.equal(authCalls,1);
});
