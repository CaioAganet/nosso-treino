import test from 'node:test';import assert from 'node:assert/strict';import {SyncEngine} from '../sync-engine.js';
function memory(){const values=new Map();return {getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),values};}
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
  assert.equal(engine.conflict,true);assert.equal(engine.revision,0);await engine.flush();assert.equal(engine.state.sessions.value,1);engine.close();
 }
 assert.equal(calls,1);
});
test('filas de usuários diferentes são isoladas e resposta após sair não muda o cache',async()=>{
 const storage=memory();let reply;
 const a=new SyncEngine({owner:'a',remote,storage,writeRemote:()=>new Promise(resolve=>reply=resolve)});a.queue(state(1));const flight=a.flush();a.close();
 const b=new SyncEngine({owner:'b',remote,storage,writeRemote:async()=>1});assert.equal(b.state.sessions.value,0);
 reply(1);await flight;assert.equal(JSON.parse(storage.getItem(a.key)).pending,true);assert.equal(JSON.parse(storage.getItem(b.key)).pending,false);
});
test('falha ao salvar no navegador não coloca um estado não durável na fila',()=>{
 const storage=memory();const engine=new SyncEngine({owner:'a',remote,storage,writeRemote:async()=>1});storage.setItem=()=>{throw Error('sem espaço');};
 assert.throws(()=>engine.queue(state(1)),/sem espaço/);assert.equal(engine.pending,false);assert.equal(engine.state.sessions.value,0);
});
