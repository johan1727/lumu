const {test}=require('node:test');const assert=require('node:assert/strict');
process.env.AMAZON_AFFILIATE_TAG='lumu-test-20';process.env.AMAZON_AFFILIATE_TAG_US='lumu-us-test-20';
const {generateAffiliateLink:link,resolveDirectProductUrl:resolve}=require('../src/utils/affiliateManager');
test('affiliate tags only attach to actual Amazon domains and correct country',()=>{
 assert.equal(new URL(link('https://www.amazon.com.mx/dp/B012345678?tag=old')).searchParams.get('tag'),'lumu-test-20');
 assert.equal(new URL(link('https://www.amazon.com/dp/B012345678')).searchParams.get('tag'),'lumu-us-test-20');
 assert.equal(link('https://amazon.com.evil.example/p'),'https://amazon.com.evil.example/p');
});
test('preserves provider-generated signed links and rejects unsafe redirects',()=>{
 const signed='https://mercadolibre.com/sec/ABC?signature=x%26y%3Dz&re_id=official';assert.equal(link(signed),signed);
 assert.equal(link('https://www.google.com/url?q=javascript%3Aalert(1)'), '');
 assert.equal(link('javascript:alert(1)'),'');assert.equal(link('not a url'),'');assert.equal(link('https://user:pass@amazon.com/p'),'');
 const nested='https://www.google.com/url?q='+encodeURIComponent(signed);assert.equal(resolve(nested),signed);
 assert.equal(link('https://shop.example/product','Mercado Libre'),'https://shop.example/product');
});
