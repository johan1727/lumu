const {test}=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
test('scoped policy patch prevents browser profile escalation and preserves other schemas',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE public.profiles(id integer, is_premium boolean);ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
 GRANT ALL ON profiles TO PUBLIC,anon,authenticated,service_role;
 CREATE POLICY "Service role can manage profiles" ON profiles FOR ALL USING(true);
 GRANT UPDATE(is_premium) ON profiles TO authenticated;
 CREATE POLICY other_profile_write ON profiles FOR UPDATE TO authenticated USING(true);
 CREATE POLICY admin_can_change_premium ON profiles FOR UPDATE USING(true);
 CREATE POLICY own_read ON profiles FOR SELECT TO authenticated USING(id=1);
 INSERT INTO profiles VALUES(1,false),(2,true);
 CREATE SCHEMA another_app;CREATE TABLE another_app.example(id integer);GRANT USAGE ON SCHEMA another_app TO authenticated;GRANT SELECT ON another_app.example TO authenticated;`);
 const migration=readFileSync('supabase/migrations/20260919143808_lumu_scoped_policy_hardening.sql','utf8');await db.exec(migration);await db.exec(migration);
 await db.exec('SET ROLE authenticated');
 assert.equal((await db.query('SELECT * FROM public.profiles')).rows.length,1);
 await assert.rejects(db.exec('UPDATE public.profiles SET is_premium=true WHERE id=1'),/permission denied/);
 await assert.rejects(db.exec('INSERT INTO public.profiles VALUES(3,true)'),/permission denied/);
 await db.query('SELECT * FROM another_app.example');
 await db.exec('RESET ROLE; SET ROLE anon');assert.equal((await db.query('SELECT * FROM public.profiles')).rows.length,0);
 await db.exec('RESET ROLE; SET ROLE service_role; UPDATE public.profiles SET is_premium=true WHERE id=1; RESET ROLE');
 assert.equal((await db.query('SELECT is_premium FROM profiles WHERE id=1')).rows[0].is_premium,true);
 }finally{await db.close();}
});
