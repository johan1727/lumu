const {test}=require('node:test');const assert=require('node:assert/strict');const {normalizeEnebaOffer:normalize}=require('../src/services/enebaOfferAdapter');
test('Eneba staging contract rejects unsupported region, stale stock and forged links',()=>{
 const now=Date.parse('2026-09-19T12:00:00Z');const offer={providerOfferId:'fixture-1',title:'Example Game',platform:'Steam',edition:'Standard',activationCountries:['MX'],currency:'MXN',price:100,availability:'in_stock',affiliateUrl:'https://www.eneba.com/example?af_id=fixture',observedAt:'2026-09-19T11:00:00Z',activationNotes:'Activación en México.'};
 assert.equal(normalize(offer,{now}).accepted,true);
 for(const patch of [{activationCountries:['US']},{availability:'unknown'},{currency:'USD'},{observedAt:'2026-09-18T11:00:00Z'},{affiliateUrl:'https://eneba.com.evil.test/item'},{price:0}])assert.equal(normalize({...offer,...patch},{now}).accepted,false);
});
