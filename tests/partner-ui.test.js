import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('tela Casal mantém dados do parceiro isolados e não oferece edição',async()=>{
 const elements=new Map(),handlers={},writes=[];let callbacks,reads=0,linked=true;
 const own={sessions:{'Caio:2026-10-27:A:1':{profile:'Caio',date:'2026-10-27',workout:'A',sets:{'supino-maquina:0':{weight:'30',reps:'12',done:true}}}}};
 const partner={profile:'Nicolli',fetchedAt:'2026-10-27T22:00:00Z',sessions:{'Nicolli:2026-10-27:A:1':{profile:'Nicolli',date:'2026-10-27',workout:'A',sets:{'supino-maquina:0':{weight:'10',reps:'12',done:true}}}}};
 const cloud={active:false,owner:'owner-a',profile:'Caio',notice:'Sincronizado',start:options=>{callbacks=options;return Promise.resolve();},save:state=>writes.push(state),sharing:async()=>({linked,partnerName:linked?'Nicolli':null}),readPartner:async()=>{reads++;return linked?partner:null;},friendly:error=>error.message};
 const element=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',value:'',querySelectorAll:()=>[],showModal(){this.open=true;},close(){this.open=false;},classList:{add(){},remove(){},toggle(){}},style:{}});return elements.get(k);};
 vm.runInNewContext(readFileSync(new URL('../bundle.js',import.meta.url),'utf8'),{Intl,Date,console,NossoCloud:cloud,localStorage:{getItem:()=>null},document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(n,f)=>handlers[n]=f},window:{scrollTo(){}}});
 cloud.active=true;callbacks.workspace({owner:'owner-a',profile:'Caio',state:own});
 const click=button=>handlers.click({target:{closest:()=>({dataset:{},...button})}}),settle=()=>new Promise(resolve=>setImmediate(resolve));
 click({dataset:{view:'parceiro'}});await settle();assert.equal(reads,1);assert.match(element('#app').innerHTML,/Treinos de Nicolli/);assert.match(element('#app').innerHTML,/10 kg/);assert.doesNotMatch(element('#app').innerHTML,/data-delete-session|id="edit-record"|data-set=/);assert.equal(writes.length,0);
 click({id:'open-account'});click({id:'cloud-sharing'});await settle();assert.match(element('#couple-panel').innerHTML,/Vinculado com/);
 click({dataset:{resume:'Caio:2026-10-27:A:1'}});assert.match(element('#app').innerHTML,/value="30"/);assert.doesNotMatch(element('#app').innerHTML,/Treinos de Nicolli/);
 click({dataset:{view:'parceiro'}});await settle();linked=false;click({id:'cloud-read-partner'});await settle();assert.doesNotMatch(element('#app').innerHTML,/10 kg/);assert.match(element('#app').innerHTML,/ainda não estão vinculadas/);assert.equal(writes.length,0);
});
