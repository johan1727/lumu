// Exact-product searches need organic merchant links: Shopping may expose only
// opaque Google offer pages. Replace the redundant Amazon Shopping call with
// organic search; do not join its price to a different page by title similarity.
function fetchPrimarySearchRoutes({request,apiKey,isSpecificProduct,preferredIncludesAmazon,shoppingQuery,webSearchQ,amazonDomain,gl,hl,webNum,amazonNum,timeout,signal,retries}) {
 const call=(endpoint,data)=>request({method:'post',url:`https://google.serper.dev/${endpoint}`,headers:{'X-API-KEY':apiKey,'Content-Type':'application/json'},data:JSON.stringify(data),timeout,signal},retries).catch(()=>null);
 return {
  webPromise:call('search',{q:webSearchQ,gl,hl,num:webNum}),
  amazonSpecificShoppingPromise:!isSpecificProduct&&preferredIncludesAmazon
   ?call('shopping',{q:`${shoppingQuery} site:${amazonDomain}`,gl,hl,num:amazonNum})
   :Promise.resolve(null)
 };
}
module.exports={fetchPrimarySearchRoutes};
