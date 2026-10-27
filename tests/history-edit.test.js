import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {today} from '../data.js';
const archived='Caio:2026-10-20:B:1', active='Caio:2026-10-21:B';
function setup(){
 let stored=JSON.stringify({sessions:{[archived]:{profile:'Caio',date:'2026-10-20',workout:'B',savedAt:'2026-10-20T22:00:00Z',sets:{'leg-press:0':{weight:'30',reps:'12',done:true}}},[active]:{profile:'Caio',date:'2026-10-21',workout:'B',sets:{'leg-press:0':{weight:'40',reps:'10',done:true}}}}});
 const elements=new Map(),handlers={};let fail=false,confirmResult=false;
 const element=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',querySelectorAll:()=>[],classList:{add(){},remove(){},toggle(){}},style:{}});return elements.get(k);};
 vm.runInNewContext(readFileSync(new URL('../bundle.js',import.meta.url),'utf8'),{Intl,Date,console,confirm:()=>confirmResult,localStorage:{getItem:k=>k==='nosso-treino:v1'?stored:null,setItem:(k,v)=>{if(fail)throw Error();stored=v;}},document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(n,f)=>handlers[n]=f},window:{scrollTo(){}}});
 return {element,read:()=>JSON.parse(stored),fail:v=>fail=v,confirm:v=>confirmResult=v,click:b=>handlers.click({target:{closest:()=>({dataset:{},...b})}}),input:value=>handlers.input({target:{dataset:{set:'leg-press:0',field:'weight'},type:'number',value,checkValidity:()=>true}}),change:(id,value)=>handlers.change({target:{id,value}})};
}
test('consulta antiga restaura data do treino; voltar para hoje é explícito',()=>{
 const a=setup();a.click({dataset:{resume:archived}});assert.match(a.element('#app').innerHTML,/value="2026-10-20"/);
 a.click({dataset:{view:'treino'}});assert.ok(a.element('#app').innerHTML.includes(`value="${today()}"`));
 a.change('date','2026-10-19');assert.match(a.element('#app').innerHTML,/Voltar para hoje/);a.click({id:'return-today'});assert.ok(a.element('#app').innerHTML.includes(`value="${today()}"`));
});
test('continuar sessão em andamento atualiza a mesma sessão sem duplicar',()=>{
 const a=setup();a.click({dataset:{view:'historico'}});assert.match(a.element('#app').innerHTML,/Continuar treino/);
 a.click({dataset:{resume:active}});assert.doesNotMatch(a.element('#app').innerHTML,/somente leitura/);a.input('45');assert.equal(a.read().sessions[active].sets['leg-press:0'].weight,'45');assert.equal(Object.keys(a.read().sessions).length,2);
 a.click({dataset:{view:'inicio'}});assert.ok(a.element('#app').innerHTML.includes(`value="${today()}"`));
});
test('editar permite cancelar, protege navegação e só persiste após salvar com sucesso',()=>{
 const a=setup();a.click({dataset:{resume:archived}});a.click({id:'edit-record'});a.input('50');assert.equal(a.read().sessions[archived].sets['leg-press:0'].weight,'30');
 a.click({dataset:{view:'inicio'}});assert.match(a.element('#app').innerHTML,/Editando registro/);
 a.click({id:'cancel-edit'});assert.match(a.element('#app').innerHTML,/value="30"/);
 a.click({id:'edit-record'});a.input('55');a.fail(true);a.click({id:'save-edit'});assert.equal(a.read().sessions[archived].sets['leg-press:0'].weight,'30');assert.match(a.element('#save-workout-message').textContent,/Não foi possível salvar/);
 a.fail(false);a.click({id:'save-edit'});assert.equal(a.read().sessions[archived].sets['leg-press:0'].weight,'55');assert.equal(a.read().sessions[archived].savedAt,'2026-10-20T22:00:00Z');assert.equal(Object.keys(a.read().sessions).length,2);assert.match(a.element('#app').innerHTML,/somente leitura/);
});
