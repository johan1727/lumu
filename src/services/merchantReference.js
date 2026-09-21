const {assessResult}=require('./resultQuality');
// Search snippets do not establish a cash price (e.g. carrier installments).
// Keep the discovered page as a reference, never borrow a Shopping offer price.
function merchantReference(item, query) {
 return assessResult({title:item.title||'',url:item.link||'',snippet:item.snippet||'',price:null,
  isMerchantReference:true,isDirectProductPage:true,priceNeedsVerification:true,
  priceSource:'unverified_search_reference',priceConfidence:0,
  priceEvidenceSource:'search_index_snippet',availability:'',originalPrice:null,
  isDealPrice:false,discountPct:0},query);
}
module.exports={merchantReference};
