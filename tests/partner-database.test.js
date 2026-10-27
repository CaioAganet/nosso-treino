import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
test('convite com consentimento bilateral permite só leitura; revogação bloqueia novas consultas',async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 for(const file of ['202610270001_initial.sql','202610270002_partner_sharing.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002',c='00000000-0000-0000-0000-000000000003';
 await db.exec(`insert into auth.users values('${a}'),('${b}'),('${c}');set role authenticated;`);
 const as=async id=>db.exec(`set request.jwt.claim.sub='${id}'`);
 const rpc=async(name,args=[])=> (await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as result',args)).rows[0].result;
 for(const [id,name]of [[a,'Caio'],[b,'Nicolli'],[c,'Caio']]){await as(id);await rpc('nt_open_account',[name]);}
 await as(a);const saved={sessions:{'Caio:2026-10-27:A:1':{profile:'Caio',date:'2026-10-27',workout:'A',sets:{'supino-maquina:0':{weight:'30',reps:'12',done:true}}}}};await rpc('nt_write_state',[JSON.stringify(saved),0]);
 assert.equal(await rpc('nt_read_partner'),null);
 const first=await rpc('nt_create_partner_invite');assert.match(first.code,/^[a-f0-9]{32}$/);await assert.rejects(rpc('nt_accept_partner_invite',[first.code]),/OWN_INVITE/);
 const second=await rpc('nt_create_partner_invite');
 await as(b);await assert.rejects(rpc('nt_accept_partner_invite',[first.code]),/INVALID_INVITE/);assert.equal(await rpc('nt_read_partner'),null);
 const preview=await rpc('nt_preview_partner_invite',[second.code]);assert.equal(preview.name,'Caio');assert.equal((await rpc('nt_accept_partner_invite',[second.code])).partnerName,'Caio');
 assert.equal((await rpc('nt_read_partner')).sessions['Caio:2026-10-27:A:1'].sets['supino-maquina:0'].weight,'30');
 assert.equal((await db.query('select * from public.nt_sessions')).rows.length,0);
 await assert.rejects(db.query('update public.nt_sets set weight=999'),/permission denied/);
 await assert.rejects(rpc('nt_write_state',[JSON.stringify(saved),0]),/INVALID_SESSION/);
 await assert.rejects(rpc('nt_accept_partner_invite',[second.code]),/INVALID_INVITE/);
 await as(c);assert.equal(await rpc('nt_read_partner'),null);assert.equal((await db.query('select * from public.nt_partner_memberships')).rows.length,0);
 await as(a);assert.equal((await rpc('nt_read_partner')).profile,'Nicolli');await rpc('nt_stop_sharing');
 await as(b);assert.equal(await rpc('nt_read_partner'),null);assert.equal((await rpc('nt_sharing_status')).linked,false);
 await as(a);const expired=await rpc('nt_create_partner_invite');await db.exec(`reset role;update public.nt_partner_invites set expires_at=now()-interval '1 second';set role authenticated;`);await as(b);await assert.rejects(rpc('nt_accept_partner_invite',[expired.code]),/INVALID_INVITE/);
 await as(a);const canceled=await rpc('nt_create_partner_invite');await rpc('nt_cancel_partner_invite');await as(b);await assert.rejects(rpc('nt_preview_partner_invite',[canceled.code]),/INVALID_INVITE/);
 await db.exec(`set role anon;set request.jwt.claim.sub=''`);await assert.rejects(rpc('nt_read_partner'),/permission denied/);
 await db.close();
});
