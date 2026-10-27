import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {SyncEngine} from '../sync-engine.js';import {validateBackup} from '../store.js';
function setup(options={}){
 const values=new Map(),writes=[],statuses=[],workspaces=[];let session=null,events,fail=false,locked=false;
 const resets=[],updates=[];const auth={resetPasswordForEmail:async(email,options)=>{resets.push({email,options});return {};},updateUser:async data=>{updates.push(data);return options.updateError?{error:{message:'update failed'}}:{};},onAuthStateChange:fn=>events=fn,getSession:async()=>({data:{session}}),signInWithPassword:async()=>{session={user:{id:'owner-a',email:'user@example.test',user_metadata:{display_name:'Caio'}},access_token:'test-access-token'};events('SIGNED_IN',session);return {data:{session}};},signUp:async()=>{if(!options.instantSignup)return {data:{session:null}};session={user:{id:'owner-a',email:'user@example.test',user_metadata:{display_name:'Caio'}},access_token:'test-access-token'};events('SIGNED_IN',session);return {data:{session}};},signOut:async()=>{session=null;events('SIGNED_OUT',null);return {};}};
 const context={createClient:()=>({auth,rpc:(name,args)=>({setHeader:async(header,token)=>{
  assert.equal(header,'Authorization');assert.equal(token,'Bearer test-access-token');
  if(fail)return {error:{message:'offline'}};
  if(options.rpc){const response=await options.rpc(name,args);if(response)return response;}
  if(name==='nt_read_profile')return {data:{owner:'owner-b',revision:0,profile:'Nicolli',state:{sessions:{}}}};
  if(name==='nt_write_profile'){writes.push({...args,partner:true});return {data:args.p_revision+1};}
  if(name==='nt_write_state'){writes.push(args);return {data:args.p_revision+1};}
  return {data:{revision:0,profile:'Caio',state:{sessions:{}}}};
 }})}),supabaseConfig:{url:'https://example.test',publishableKey:'test'},SyncEngine,validateBackup,structuredClone,localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),key:i=>[...values.keys()][i],get length(){return values.size;}},navigator:{locks:{request:async(name,options,fn)=>fn(locked?null:{name})}},location:{protocol:'https:',href:'https://example.test/nosso-treino/'},URL,URLSearchParams,history:{replaceState(){}},window:{addEventListener(){}},setTimeout:()=>1,clearTimeout(){}};
 vm.runInNewContext(readFileSync(new URL('../cloud.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''),context);
 const cloud=context.NossoCloud;
 return {cloud,writes,statuses,workspaces,resets,updates,recover:()=>events('PASSWORD_RECOVERY',session),fail:value=>fail=value,lock:value=>locked=value,start:(extra={})=>cloud.start({...extra,workspace:w=>workspaces.push(w),status:s=>statuses.push(s)})};
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
test('outra aba com a mesma conta é permitida e dados de outro perfil não entram na fila',async()=>{
 const a=setup();await a.start();a.lock(true);await a.cloud.login('user@example.test','example-password','Caio');assert.equal(a.cloud.active,true);await a.cloud.retry();
 assert.throws(()=>a.cloud.save({sessions:{'Nicolli:2026-10-27:A:1':{profile:'Nicolli',date:'2026-10-27',workout:'A',sets:{}}}}),/outro perfil/);assert.equal(a.writes.length,0);
});

test('cadastro com confirmação desabilitada abre a conta imediatamente',async()=>{const a=setup({instantSignup:true});await a.start();const message=await a.cloud.signup('user@example.test','example-password','Caio');assert.equal(a.cloud.active,true);assert.match(message,/Conta criada e conectada/);assert.equal(a.writes.length,0);});

test('recuperação usa redirect autorizado e exige sessão antes de alterar senha',async()=>{
 const a=setup();await a.start();await a.cloud.requestPasswordReset('user@example.test');
 assert.equal(a.resets[0].options.redirectTo,'https://example.test/nosso-treino/');
 await assert.rejects(a.cloud.updatePassword('new-example-password'),/Link expirado/);assert.equal(a.updates.length,0);
 await a.cloud.login('user@example.test','example-password','Caio');a.recover();assert.equal(a.cloud.recovering,true);
 await a.cloud.updatePassword('new-example-password');assert.equal(a.updates[0].password,'new-example-password');assert.equal(a.cloud.recovering,false);
});
test('falha ao alterar senha mantém recuperação aberta para tentar novamente',async()=>{
 const a=setup({updateError:true});await a.start();await a.cloud.login('user@example.test','example-password','Caio');a.recover();
 await assert.rejects(a.cloud.updatePassword('new-example-password'));assert.equal(a.cloud.recovering,true);
});

test('troca de pessoa mantém login e envia cada treino ao dono correto',async()=>{
 const a=setup();await a.start();await a.cloud.login('user@example.test','example-password','Caio');
 await a.cloud.switchProfile('Nicolli');assert.equal(a.cloud.owner,'owner-a');assert.equal(a.cloud.loginProfile,'Caio');assert.equal(a.cloud.profile,'Nicolli');
 a.cloud.save({sessions:{'Nicolli:2026-10-27:A:1':{profile:'Nicolli',date:'2026-10-27',workout:'A',sets:{}}}});
 await a.cloud.switchProfile('Caio');assert.equal(a.writes[0].partner,true);assert.equal(a.writes[0].p_owner,'owner-b');assert.equal(a.writes[0].p_profile,'Nicolli');assert.equal(a.cloud.profile,'Caio');assert.equal(Object.keys(a.workspaces.at(-1).state.sessions).length,0);
 a.cloud.save({sessions:{'Caio:2026-10-27:A:1':{profile:'Caio',date:'2026-10-27',workout:'A',sets:{}}}});a.fail(true);
 await assert.rejects(a.cloud.switchProfile('Nicolli'),/pendentes/);assert.equal(a.cloud.profile,'Caio');assert.equal(a.cloud.pending,true);
});

test('consulta periódica atualiza dados; digitação adia a tela e gravação detecta conflito com a versão recebida',async()=>{
 let remote={revision:0,profile:'Caio',state:{sessions:{}}},editing=false;const updates=[];
 const a=setup({rpc:async name=>['nt_read_state','nt_open_account'].includes(name)?{data:structuredClone(remote)}:null});
 await a.start({editing:()=>editing,update:s=>updates.push(s)});await a.cloud.login('x','password','Caio');
 const key='Caio:2026-10-27:A:1',record={profile:'Caio',date:'2026-10-27',workout:'A',sets:{}};
 remote={...remote,revision:1,state:{sessions:{[key]:record}}};editing=true;await a.cloud.retry();assert.equal(updates.length,0);
 editing=false;await a.cloud.retry();assert.equal(updates.length,1);assert.ok(updates[0].sessions[key]);
 remote={...remote,revision:2,state:{sessions:{[key]:{...record,savedAt:'2026-10-27T12:00:00Z'}}}};editing=true;await a.cloud.retry();
 a.cloud.save({sessions:{[key]:{...record,savedAt:'2026-10-27T13:00:00Z'}}});await a.cloud.retry();assert.equal(a.cloud.conflict,true);assert.equal(a.writes.length,0);
});

test('revogação bloqueia sincronização do parceiro e refresh explícito arquiva a fila ao carregar servidor',async()=>{
 let revoked=false;
 const a=setup({rpc:async name=>revoked&&['nt_read_profile','nt_write_profile'].includes(name)?{error:{message:'PARTNER_ACCESS_REQUIRED',code:'42501'}}:null});
 await a.start();await a.cloud.login('x','password','Caio');await a.cloud.switchProfile('Nicolli');
 const state={sessions:{'Nicolli:2026-10-27:A:1':{profile:'Nicolli',date:'2026-10-27',workout:'A',sets:{}}}};
 a.cloud.save(state);revoked=true;await a.cloud.retry();assert.equal(a.cloud.pending,true);assert.match(a.cloud.notice,/encerrado/);assert.equal(a.writes.length,0);
 await assert.rejects(a.cloud.switchProfile('Caio'),/pendentes/);assert.equal(a.cloud.profile,'Nicolli');
 revoked=false;await a.cloud.refresh();assert.equal(a.cloud.pending,false);assert.deepEqual(Object.keys(a.workspaces.at(-1).state.sessions),[]);
});
