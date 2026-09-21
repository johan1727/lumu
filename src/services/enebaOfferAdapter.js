// Staging contract only: an approved provider feed must map to this schema.
// No network access, credentials, automatic activation or guessed affiliate URLs.
const {z}=require('zod');
const approvedUrl=z.string().url().refine(value=>{
 const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='eneba.com'||u.hostname.endsWith('.eneba.com'));
});
const offerSchema=z.object({
 providerOfferId:z.string().min(1).max(160),title:z.string().min(3).max(300),
 platform:z.string().min(1).max(80),edition:z.string().min(1).max(120),
 activationCountries:z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
 currency:z.string().regex(/^[A-Z]{3}$/),price:z.number().positive().finite(),
 availability:z.enum(['in_stock','out_of_stock','unknown']),
 affiliateUrl:approvedUrl,observedAt:z.string().datetime(),
 activationNotes:z.string().min(1).max(1000)
}).strict();
function normalizeEnebaOffer(input,{country='MX',currency='MXN',now=Date.now()}={}){
 const parsed=offerSchema.safeParse(input);if(!parsed.success)return {accepted:false,reason:'invalid_offer'};
 const o=parsed.data,age=now-Date.parse(o.observedAt);
 if(age<0||age>6*60*60*1000)return {accepted:false,reason:'stale_offer'};
 if(!o.activationCountries.includes(country))return {accepted:false,reason:'activation_region'};
 if(o.currency!==currency)return {accepted:false,reason:'currency_mismatch'};
 if(o.availability!=='in_stock')return {accepted:false,reason:'availability_unconfirmed'};
 return {accepted:true,offer:{...o,provider:'eneba',expiresAt:new Date(Date.parse(o.observedAt)+6*60*60*1000).toISOString()}};
}
module.exports={normalizeEnebaOffer};
