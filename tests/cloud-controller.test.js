import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {SyncEngine} from '../sync-engine.js';import {validateBackup} from '../store.js';
function setup(){
 const values=new Map(),writes=[],statuses=[],workspaces=[];let session=null,events,fail=false,locked=false;
 const auth={onAuthStateChange:fn=>events=fn,getSession:async()=>({data:{session}}),signInWithPassword:async()=>{session={user:{id:'owner-a',email:'user@example.test',user_metadata:{display_name:'Caio'}},access_token:'test-access-token'};events('SIGNED_IN',session);return {data:{session}};},signUp:async()=>({data:{session:null}}),signOut:async()=>{session=null;events('SIGNED_OUT',null);return {};}};
 const context={createClient:()=>({auth,rpc:(name,args)=>({setHeader:async(header,token)=>{
  assert.equal(header,'Authorization');assert.equal(token,'Bearer test-access-token');
  if(fail)return {error:{message:'offline'}};
  if(name==='nt_write_state'){writes.push(args);return {data:args.p_revision+1};}
  return {data:{revision:0,profile:'Caio',state:{sessions:{}}}};
 }})}),supabaseConfig:{url:'https://example.test',publishableKey:'test'},SyncEngine,validateBackup,structuredClone,localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},navigator:{locks:{request:async(name,options,fn)=>fn(locked?null:{name})}},location:{protocol:'https:',href:'https://example.test/nosso-treino/'},URL,window:{addEventListener(){}},setTimeout:()=>1,clearTimeout(){}};
 vm.runInNewContext(readFileSync(new URL('../cloud.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''),context);
 const cloud=context.NossoCloud;
 return {cloud,writes,statuses,workspaces,fail:value=>fail=value,lock:value=>locked=value,start:()=>cloud.start({workspace:w=>workspaces.push(w),status:s=>statuses.push(s)})};
}
test('login separa workspace, não importa dados locais automaticamente e só confirma gravação após RPC',async()=>{
 const a=setup();await a.start();assert.equal(a.cloud.active,false);assert.equal(a.writes.length,0);
 await a.cloud.login('user@example.test','example-password','Caio');assert.equal(a.cloud.active,true);assert.equal(a.workspaces.at(-1).owner,'owner-a');assert.equal(a.writes.length,0);
 a.cloud.save({sessions:{'Caio:2026-10-27:A:1':{profile:'Caio',date:'2026-10-27',workout:'A',sets:{}}}});assert.equal(a.cloud.pending,true);await a.cloud.retry();assert.equal(a.writes.length,1);assert.equal(a.cloud.pending,false);assert.match(a.cloud.notice,/confirmado pelo servidor/);
 await a.cloud.logout();assert.equal(a.cloud.active,false);assert.equal(a.workspaces.at(-1),null);
});
test('cadastro sem sessão pede confirmação de e-mail e não declara conta sincronizada',async()=>{
 const a=setup();await a.start();const message=await a.cloud.signup('user@example.test','example-password','Nicolli');assert.match(message,/confirme o cadastro/);assert.equal(a.cloud.active,false);assert.equal(a.writes.length,0);
});
test('falha ao carregar a conta mantém modo local e não cria fila com dados do visitante',async()=>{
 const a=setup();await a.start();a.fail(true);await assert.rejects(a.cloud.login('user@example.test','example-password','Caio'));assert.equal(a.cloud.active,false);assert.equal(a.writes.length,0);assert.match(a.cloud.notice,/Não foi possível abrir/);
});
test('outra aba com a mesma conta é bloqueada e dados de outro perfil não entram na fila',async()=>{
 const a=setup();await a.start();a.lock(true);await assert.rejects(a.cloud.login('user@example.test','example-password','Caio'),/outra aba/);a.lock(false);await a.cloud.retry();
 assert.throws(()=>a.cloud.save({sessions:{'Nicolli:2026-10-27:A:1':{profile:'Nicolli',date:'2026-10-27',workout:'A',sets:{}}}}),/outro perfil/);assert.equal(a.writes.length,0);
});
