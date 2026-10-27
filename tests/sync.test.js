import test from 'node:test';import assert from 'node:assert/strict';import {SyncEngine} from '../sync-engine.js';
function memory(){const values=new Map();return {getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),key:i=>[...values.keys()][i],get length(){return values.size;},values};}
const state=value=>({sessions:{value}});
const remote={revision:0,state:state(0)};
test('sincronização só confirma após resposta e envia alterações ocorridas durante uma gravação',async()=>{
 const storage=memory(),statuses=[],calls=[],replies=[];
 const engine=new SyncEngine({owner:'a',remote,storage,onStatus:s=>statuses.push(s),writeRemote:(value,revision)=>{calls.push({value,revision});return new Promise(resolve=>replies.push(resolve));}});
 engine.queue(state(1));const flight=engine.flush();assert.equal(statuses.includes('synced'),false);
 engine.queue(state(2));replies.shift()(1);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls[1].revision,1);assert.equal(calls[1].value.sessions.value,2);assert.equal(statuses.includes('synced'),false);
 replies.shift()(2);await flight;assert.equal(engine.pending,false);assert.equal(statuses.at(-1),'synced');
});
test('falha de rede preserva fila e permite retomar após recarregar',async()=>{
 const storage=memory();let fail=true;
 let engine=new SyncEngine({owner:'a',remote,storage,writeRemote:async()=>{if(fail)throw Error('offline');return 1;}});
 engine.queue(state(1));await engine.flush();assert.equal(engine.pending,true);engine.close();fail=false;
 engine=new SyncEngine({owner:'a',remote,storage,writeRemote:async()=>1});assert.equal(engine.state.sessions.value,1);await engine.flush();assert.equal(engine.pending,false);
});
test('conflito nunca é apagado por uma recarga e não sobrescreve outro aparelho',async()=>{
 const storage=memory();let calls=0;
 let engine=new SyncEngine({owner:'a',remote,storage,writeRemote:async()=>{calls++;throw Object.assign(Error('SYNC_CONFLICT'),{code:'40001'});}});
 engine.queue(state(1));await engine.flush();assert.equal(engine.conflict,true);engine.close();
 for(let i=0;i<2;i++){
  engine=new SyncEngine({owner:'a',remote:{revision:2,state:state(2)},storage,writeRemote:async()=>{calls++;return 3;}});
  assert.equal(engine.conflict,true);assert.equal(engine.revision,2);await engine.flush();assert.equal(engine.state.sessions.value,1);engine.close();
 }
 assert.equal(calls,1);
});
test('filas de usuários diferentes são isoladas e resposta após sair não muda o cache',async()=>{
 const storage=memory();let reply;
 const a=new SyncEngine({owner:'a',remote,storage,writeRemote:()=>new Promise(resolve=>reply=resolve)});a.queue(state(1));const flight=a.flush();a.close();
 const b=new SyncEngine({owner:'b',remote,storage,writeRemote:async()=>1});assert.equal(b.state.sessions.value,0);
 reply(1);await flight;assert.equal(JSON.parse(storage.getItem(a.key)).pending,true);assert.equal(b.pending,false);assert.equal(b.key,null);
});
test('falha ao salvar no navegador não coloca um estado não durável na fila',()=>{
 const storage=memory();const engine=new SyncEngine({owner:'a',remote,storage,writeRemote:async()=>1});storage.setItem=()=>{throw Error('sem espaço');};
 assert.throws(()=>engine.queue(state(1)),/sem espaço/);assert.equal(engine.pending,false);assert.equal(engine.state.sessions.value,0);
});

function server(initial={sessions:{}}){
 let snapshot={revision:0,state:structuredClone(initial)},online=true;
 return {read:async()=>{if(!online)throw Error('offline');return structuredClone(snapshot);},
 write:async(state,revision)=>{if(!online)throw Error('offline');if(revision!==snapshot.revision)throw Object.assign(Error('SYNC_CONFLICT'),{code:'40001'});snapshot={revision:revision+1,state:structuredClone(state)};return snapshot.revision;},
 get value(){return snapshot;},set online(value){online=value;}};
}
const session=n=>({profile:'Caio',date:'2026-10-27',workout:'A',sets:{x:{weight:String(n),reps:'10',done:true}}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const engineFor=async(db,storage=memory(),owner='a',extra={})=>new SyncEngine({owner,storage,remote:await db.read(),readRemote:db.read,writeRemote:db.write,...extra});

test('duas abas com fila compartilhada e dois aparelhos combinam registros independentes após corrida de revisão',async()=>{
 for(const sameDevice of [true,false]){
  const db=server(),storage=memory(),a=await engineFor(db,storage),b=await engineFor(db,sameDevice?storage:memory());
  a.queue({sessions:{a:session(10)}});b.queue({sessions:{b:session(20)}});
  assert.notEqual(a.key,b.key);await Promise.all([a.flush(),b.flush()]);
  assert.deepEqual(Object.keys(db.value.state.sessions).sort(),['a','b']);assert.equal(a.conflict||b.conflict,false);
  await a.flush();assert.deepEqual(a.state,db.value.state);assert.equal(storage.length,0);
 }
});

test('edições concorrentes e exclusão contra edição do mesmo registro preservam a fila sem sobrescrever',async()=>{
 for(const deletion of [true,false]){
  const db=server({sessions:{a:session(10)}}),sa=memory(),sb=memory(),a=await engineFor(db,sa),b=await engineFor(db,sb);
  a.queue({sessions:{a:session(20)}});b.queue({sessions:deletion?{}:{a:session(30)}});
  await a.flush();await b.flush();assert.equal(b.conflict,true);assert.equal(b.pending,true);assert.equal(db.value.state.sessions.a.sets.x.weight,'20');
  const pending=sb.getItem(b.key);b.close();const reloaded=await engineFor(db,sb);assert.equal(reloaded.conflict,true);await reloaded.flush();assert.equal(sb.getItem(b.key),pending);
 }
});

test('recarga recupera todas as filas offline e não apaga uma nova gravação de uma aba viva',async()=>{
 const db=server(),storage=memory(),a=await engineFor(db,storage),b=await engineFor(db,storage);
 db.online=false;a.queue({sessions:{a:session(1)}});b.queue({sessions:{b:session(2)}});await Promise.all([a.flush(),b.flush()]);
 db.online=true;const recovered=await engineFor(db,storage);assert.deepEqual(Object.keys(recovered.state.sessions).sort(),['a','b']);
 let release;recovered.writeRemote=(state,revision)=>new Promise(resolve=>{release=async()=>resolve(await db.write(state,revision));});
 const flight=recovered.flush();await tick();a.queue({sessions:{a:session(1),c:session(3)}});const freshKey=a.key;
 await release();await flight;assert.ok(storage.getItem(freshKey));await a.flush();assert.equal(db.value.state.sessions.c.sets.x.weight,'3');assert.ok(db.value.state.sessions.b);
});

test('campos recebidos durante digitação não permitem salvar uma tela antiga por cima de outro aparelho',async()=>{
 const db=server({sessions:{a:session(10)}}),a=await engineFor(db),visible=structuredClone(a.state),b=await engineFor(db);
 b.queue({sessions:{a:session(20)}});await b.flush();await a.flush();
 a.queue({sessions:{a:session(30)}},visible);await a.flush();assert.equal(a.conflict,true);assert.equal(a.pending,true);assert.equal(db.value.state.sessions.a.sets.x.weight,'20');
});

test('troca de conta e parceiro usa filas distintas; revogação conserva dados sem novas gravações',async()=>{
 const db=server(),storage=memory(),a=await engineFor(db,storage,'actor:partner:b');a.queue({sessions:{a:session(1)}});
 a.readRemote=async()=>{throw Error('PARTNER_ACCESS_REQUIRED');};await a.flush();assert.equal(a.pending,true);assert.equal(db.value.revision,0);
 const other=await engineFor(db,storage,'actor:partner:c');assert.equal(other.pending,false);assert.deepEqual(other.state.sessions,{});
 const own=await engineFor(db,storage,'actor');assert.equal(own.pending,false);assert.ok(storage.getItem(a.key));
});

test('cache legado pendente é recuperado; revisão diferente exige resolução sem adivinhar exclusões',()=>{
 for(const revision of [0,2]){
  const storage=memory();storage.setItem('nosso-treino:cloud:a',JSON.stringify({revision:0,state:state(1),pending:true}));
  const a=new SyncEngine({owner:'a',storage,remote:{revision,state:state(0)},writeRemote:async()=>revision+1});
  assert.equal(a.pending,true);assert.equal(a.state.sessions.value,1);assert.equal(a.conflict,revision!==0);
 }
});

test('carregar servidor arquiva apenas filas conhecidas e recuperação não volta a ser uma fila ativa',async()=>{
 const db=server(),storage=memory(),a=await engineFor(db,storage);a.queue({sessions:{a:session(1)}});
 const b=await engineFor(db,storage);b.queue({sessions:{a:session(2)}});const freshKey=b.key;
 const candidate=await engineFor(db,storage,'a',{ignoreJournals:a.journals});a.discard();assert.ok(storage.getItem(freshKey));assert.equal(candidate.pending,true);
 b.discard();const clean=await engineFor(db,storage);assert.equal(clean.pending,false);assert.ok([...storage.values.keys()].some(k=>k.includes(':recovery:')));
});

test('metadados e números normalizados pelo banco não causam falso conflito',async()=>{
 const db=server(),a=await engineFor(db);a.queue({sessions:{a:{...session(10),savedAt:'2026-10-27T12:00:00.000Z'}}});await a.flush();
 const remote=structuredClone(db.value);remote.state.sessions.a.updatedAt='2026-10-27T12:01:00Z';remote.state.sessions.a.savedAt='2026-10-27T12:00:00+00:00';remote.state.sessions.a.sets.x.weight=10;
 a.readRemote=async()=>remote;a.queue({sessions:{a:{...session(20),savedAt:'2026-10-27T12:00:00.000Z'}}});await a.flush();assert.equal(a.conflict,false);assert.equal(a.pending,false);
});

test('conflito de uma tela antiga permanece após recarregar com a mesma revisão do servidor',async()=>{
 const db=server({sessions:{a:session(1)}}),storage=memory(),a=await engineFor(db,storage),visible=structuredClone(a.state),b=await engineFor(db);
 b.queue({sessions:{a:session(2)}});await b.flush();await a.flush();a.queue({sessions:{a:session(3)}},visible);assert.equal(a.conflict,true);
 a.close();const reloaded=await engineFor(db,storage);assert.equal(reloaded.conflict,true);await reloaded.flush();assert.equal(reloaded.pending,true);assert.equal(db.value.state.sessions.a.sets.x.weight,'2');
});

test('confirmação de envio anterior não libera conflito criado durante a resposta',async()=>{
 const db=server({sessions:{a:session(1)}}),a=await engineFor(db),visible=structuredClone(a.state),b=await engineFor(db);
 b.queue({sessions:{a:session(2)}});await b.flush();await a.flush();
 a.queue({sessions:{a:session(1),b:session(10)}},visible); // só b mudou na tela antiga
 let release;a.writeRemote=(state,revision)=>new Promise(resolve=>{release=async()=>resolve(await db.write(state,revision));});
 const flight=a.flush();await tick();a.queue({sessions:{a:session(3),b:session(10)}},visible);assert.equal(a.conflict,true);
 await release();await flight;assert.equal(a.conflict,true);assert.equal(a.pending,true);assert.equal(db.value.state.sessions.a.sets.x.weight,'2');
});
