const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {claimBonus}=require('../src/services/bonusService');
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
test('bonus SQL: idempotency, atomic rollback, eligibility and RPC permissions', async()=>{
 const db=new PGlite();
 try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE public.profiles(id uuid primary key,created_at timestamptz default now(),referral_code text unique,referred_by uuid references public.profiles(id),referral_vip_rewarded boolean default false);
 CREATE TABLE public.rate_limits(ip text,created_at timestamptz default now());
 INSERT INTO profiles(id,referral_code) VALUES('${A}','ALPHA'),('${B}','BRAVO');`);
 await db.exec(readFileSync('supabase/migrations/20260919143138_lumu_atomic_bonus_claims.sql','utf8'));
 const call=async(id,kind,code=null)=>(await db.query('select public.lumu_claim_bonus($1,$2,$3) as result',[id,kind,code])).rows[0].result;
 assert.equal((await call(A,'signup')).bonus,2);
 const repeats=await Promise.all(Array.from({length:6},()=>call(A,'signup')));
 assert.ok(repeats.every(r=>r.already_claimed&&r.bonus===0));
 assert.equal((await db.query("select count(*)::int as n from rate_limits where ip=$1",['bonus:user:'+A])).rows[0].n,2);
 assert.equal((await call(A,'referral','ALPHA')).status,404);
 assert.equal((await call(A,'referral','BRAVO')).bonus_referrer,5);
 assert.equal((await call(A,'referral','BRAVO')).status,409);
 assert.equal((await call(A,'referral_vip')).bonus,40);
 assert.equal((await call(A,'referral_vip')).bonus,0);
 assert.equal((await call(A,'reward')).bonus,3);
 assert.equal((await call(A,'reward')).status,429);
 await db.exec(`ALTER TABLE rate_limits ADD CONSTRAINT simulate_credit_failure CHECK (ip <> 'bonus:user:${B}') NOT VALID;`);
 await assert.rejects(call(B,'signup'));
 assert.equal((await db.query("select count(*)::int as n from rate_limits where ip=$1",['signup-bonus:user:'+B])).rows[0].n,0);
 await db.exec('ALTER TABLE rate_limits DROP CONSTRAINT simulate_credit_failure');
 assert.equal((await call(B,'signup')).bonus,2);
 await db.exec(`UPDATE profiles SET created_at=now()-interval '8 days' WHERE id='${B}'`);
 assert.equal((await call(B,'referral','ALPHA')).status,403);
 for(const role of ['anon','authenticated']){
  const r=await db.query("select has_function_privilege($1,'public.lumu_claim_bonus(uuid,text,text)','EXECUTE') as allowed",[role]);
  assert.equal(r.rows[0].allowed,false);
 }
 assert.equal((await db.query("select has_function_privilege('service_role','public.lumu_claim_bonus(uuid,text,text)','EXECUTE') as allowed")).rows[0].allowed,true);
 } finally {await db.close();}
});
test('bonus service fails closed when migration missing and passes verified caller only',async()=>{
 await assert.rejects(claimBonus(null,A,'signup',null,{enabled:true}));
 await assert.rejects(claimBonus({rpc:async()=>({error:{code:'PGRST202'}})},A,'signup',null,{enabled:true}));
 const result=await claimBonus({rpc:async(name,args)=>{assert.equal(name,'lumu_claim_bonus');assert.equal(args.p_user_id,A);return {data:{status:200,success:true,bonus:2}};}},A,'signup',null,{enabled:true});
 assert.deepEqual(result,{status:200,body:{success:true,bonus:2}});
});
test('paused bonuses never touch RPC and do not block paid subscription fulfillment',async()=>{
 const {claimVipReferralIfEnabled}=require('../src/services/bonusService');let calls=0;
 const db={rpc:async()=>{calls++;throw new Error('RPC absent');}};
 assert.equal((await claimBonus(db,A,'signup',null,{enabled:false})).status,503);
 assert.deepEqual(await claimVipReferralIfEnabled(db,A,{enabled:false}),{skipped:true,reason:'BONUSES_PAUSED'});
 assert.equal(calls,0);
 await assert.rejects(claimVipReferralIfEnabled(db,A,{enabled:true}));assert.equal(calls,1);
});
