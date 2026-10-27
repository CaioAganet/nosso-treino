import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('bundle inicia e navega sem depender de módulos do navegador',()=>{
 const elements=new Map(); const handlers={};
 const element=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},style:{}});return elements.get(key);};
 const context={Intl,Date,console,localStorage:{getItem:()=>null},document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(name,fn)=>handlers[name]=fn},window:{scrollTo(){}}};
 vm.runInNewContext(readFileSync(new URL('../bundle.js',import.meta.url),'utf8'),context);
 assert.match(element('#app').innerHTML,/Vamos nessa, Caio/);
 handlers.click({target:{closest:()=>({dataset:{view:'treino'}})}});
 assert.match(element('#app').innerHTML,/Leg press 45/);
 handlers.click({target:{closest:()=>({dataset:{profile:'Nicolli'}})}});
 assert.match(element('#app').innerHTML,/NICOLLI/);
 handlers.click({target:{closest:()=>({dataset:{view:'historico'}})}});
 assert.match(element('#app').innerHTML,/Seu histórico/);
});

test('salvar treino parcial preserva séries e confirma apenas gravações bem-sucedidas',()=>{
 const elements=new Map(), handlers={}, memory=new Map();let fail=false;
 const element=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',querySelectorAll:()=>[],classList:{add(){},remove(){},toggle(){}},style:{}});return elements.get(key);};
 const context={Intl,Date,console,localStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>{if(fail)throw Error('Sem espaço');memory.set(k,v);}},document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(name,fn)=>handlers[name]=fn},window:{scrollTo(){}}};
 vm.runInNewContext(readFileSync(new URL('../bundle.js',import.meta.url),'utf8'),context);
 const click=b=>handlers.click({target:{closest:()=>({dataset:{},...b})}});
 click({dataset:{view:'treino'}});
 handlers.input({target:{dataset:{set:'leg-press:0',field:'done'},type:'checkbox',checked:true,checkValidity:()=>true}});
 click({id:'save-workout'});
 const saved=JSON.parse(memory.get('nosso-treino:v1'));
 assert.equal(Object.values(saved.sessions)[0].sets['leg-press:0'].done,true);
 assert.equal(Object.keys(Object.values(saved.sessions)[0].sets).length,1);
 assert.match(element('#save-workout-message').textContent,/Treino salvo e encerrado/);
 assert.match(element('#save-workout-message').textContent,/1 de 12 séries/);
 const savedKey=Object.keys(saved.sessions)[0];
 assert.ok(element('#saved-workout-actions').innerHTML.includes('data-resume="'+savedKey+'"'));
 click({dataset:{resume:savedKey}});
 assert.match(element('#app').innerHTML,/somente leitura/);
 assert.match(element('#app').innerHTML,/data-field="done" checked/);
 click({dataset:{view:'treino'}});
 click({id:'save-workout'});
 assert.equal(Object.keys(JSON.parse(memory.get('nosso-treino:v1')).sessions).length,1);
 assert.doesNotMatch(element('#app').innerHTML,/data-field="done" checked/);
 handlers.input({target:{dataset:{set:'leg-press:0',field:'done'},type:'checkbox',checked:true,checkValidity:()=>true}});
 fail=true;click({id:'save-workout'});
 assert.match(element('#save-workout-message').textContent,/Não foi possível salvar/);
 click({dataset:{view:'historico'}});
 assert.match(element('#app').innerHTML,/8%/);
});


test('excluir treino exige confirmação, isola perfil e recupera falha de gravação',()=>{
 const elements=new Map(),handlers={};let confirmed=false,fail=false;
 const key='Caio:2026-10-27:B:1',other='Nicolli:2026-10-27:B:1';
 let stored=JSON.stringify({sessions:{[key]:{profile:'Caio',date:'2026-10-27',workout:'B',sets:{}},[other]:{profile:'Nicolli',date:'2026-10-27',workout:'B',sets:{}}}});
 const element=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},style:{}});return elements.get(k);};
 vm.runInNewContext(readFileSync(new URL('../bundle.js',import.meta.url),'utf8'),{Intl,Date,console,confirm:()=>confirmed,localStorage:{getItem:()=>stored,setItem:(k,v)=>{if(fail)throw Error();stored=v;}},document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(n,f)=>handlers[n]=f},window:{scrollTo(){}}});
 const click=dataset=>handlers.click({target:{closest:()=>({dataset})}});
 click({view:'historico'});assert.match(element('#app').innerHTML,/Excluir treino/);
 click({deleteSession:key});assert.ok(JSON.parse(stored).sessions[key]);
 confirmed=true;click({deleteSession:other});assert.ok(JSON.parse(stored).sessions[other]);
 fail=true;click({deleteSession:key});assert.match(element('#history-message').textContent,/registro foi mantido/);
 fail=false;click({deleteSession:key});assert.equal(JSON.parse(stored).sessions[key],undefined);assert.ok(JSON.parse(stored).sessions[other]);assert.match(element('#history-message').textContent,/Treino excluído/);
});

test('abrir registro identifica cada sessão do mesmo dia e não permite sobrescrever',()=>{
 const elements=new Map(),handlers={};let writes=0;
 const first='Caio:2026-10-27:B:1',second='Caio:2026-10-27:B:2';
 const session=weight=>({profile:'Caio',date:'2026-10-27',workout:'B',sets:{'leg-press:0':{weight,reps:'12',done:true}}});
 const stored=JSON.stringify({sessions:{[first]:session('30'),[second]:session('50')}});
 const element=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',querySelectorAll:()=>[],classList:{add(){},remove(){},toggle(){}},style:{}});return elements.get(k);};
 vm.runInNewContext(readFileSync(new URL('../bundle.js',import.meta.url),'utf8'),{Intl,Date,console,localStorage:{getItem:()=>stored,setItem:()=>writes++},document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(n,f)=>handlers[n]=f},window:{scrollTo(){}}});
 const click=b=>handlers.click({target:{closest:()=>({dataset:{},...b})}});
 click({dataset:{view:'historico'}});assert.ok(element('#app').innerHTML.includes(`data-resume="${first}"`));
 click({dataset:{resume:first}});assert.match(element('#app').innerHTML,/value="30"/);assert.match(element('#app').innerHTML,/somente leitura/);assert.equal(element('#save-workout').hidden,true);
 click({id:'save-workout'});assert.equal(writes,0);
 click({dataset:{view:'historico'}});click({dataset:{resume:second}});assert.match(element('#app').innerHTML,/value="50"/);
 handlers.input({target:{dataset:{set:'leg-press:0',field:'weight'},value:'99',checkValidity:()=>true}});assert.equal(writes,0);
 click({dataset:{view:'historico'}});click({dataset:{view:'treino'}});assert.doesNotMatch(element('#app').innerHTML,/somente leitura/);
});

test('histórico filtra treino e datas, mostra horário de São Paulo e mantém registros antigos',()=>{
 const elements=new Map(),handlers={};
 const stored=JSON.stringify({sessions:{
 'Caio:2026-10-26:B:1':{profile:'Caio',date:'2026-10-26',workout:'B',sets:{},savedAt:'2026-10-27T00:30:00Z'},
 'Caio:2026-10-25:A:1':{profile:'Caio',date:'2026-10-25',workout:'A',sets:{}}
 }});
 const element=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},style:{}});return elements.get(k);};
 vm.runInNewContext(readFileSync(new URL('../bundle.js',import.meta.url),'utf8'),{Intl,Date,console,localStorage:{getItem:()=>stored},document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(n,f)=>handlers[n]=f},window:{scrollTo(){}}});
 const click=b=>handlers.click({target:{closest:()=>({dataset:{},...b})}});
 click({dataset:{view:'historico'}});
 assert.match(element('#app').innerHTML,/21:30:00/);assert.match(element('#app').innerHTML,/horário não registrado/);assert.match(element('#app').innerHTML,/Parcial/);
 handlers.change({target:{id:'history-workout',value:'B'}});
 assert.match(element('#app').innerHTML,/1 registro\(s\)/);assert.doesNotMatch(element('#app').innerHTML,/data-resume="Caio:2026-10-25:A:1"/);
 handlers.change({target:{id:'history-from',value:'2026-10-27'}});assert.match(element('#app').innerHTML,/Nenhum treino encontrado/);
 click({id:'clear-history-filters'});assert.match(element('#app').innerHTML,/2 registro\(s\)/);
});

test('perfil escolhido sobrevive à reabertura sem alterar os registros de treino',()=>{
 const memory=new Map([['nosso-treino:v1',JSON.stringify({sessions:{}})]]);let fail=false;
 const boot=()=>{
  const elements=new Map(),handlers={};
  const element=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},style:{}});return elements.get(k);};
  vm.runInNewContext(readFileSync(new URL('../bundle.js',import.meta.url),'utf8'),{Intl,Date,console,localStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>{if(fail)throw Error();memory.set(k,v);}},document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(n,f)=>handlers[n]=f},window:{scrollTo(){}}});
  return {element,choose:profile=>handlers.click({target:{closest:()=>({dataset:{profile}})}})};
 };
 const original=memory.get('nosso-treino:v1');
 let page=boot();assert.match(page.element('#app').innerHTML,/Vamos nessa, Caio/);
 page.choose('Nicolli');page=boot();assert.match(page.element('#app').innerHTML,/Vamos nessa, Nicolli/);
 page.choose('Caio');page=boot();assert.match(page.element('#app').innerHTML,/Vamos nessa, Caio/);
 assert.equal(memory.get('nosso-treino:v1'),original);
 fail=true;page.choose('Nicolli');assert.match(page.element('#app').innerHTML,/Vamos nessa, Nicolli/);assert.match(page.element('#save-status').textContent,/não foi possível lembrar/);
 memory.set('nosso-treino:perfil','Inválido');page=boot();assert.match(page.element('#app').innerHTML,/Vamos nessa, Caio/);
});
