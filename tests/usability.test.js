import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const key='Caio:2026-10-20:B:1';
function setup(){
 let stored=JSON.stringify({sessions:{[key]:{profile:'Caio',date:'2026-10-20',workout:'B',sets:{'prancha:0':{weight:'',reps:'30',done:true}}},'Caio:2026-09-20:B:1':{profile:'Caio',date:'2026-09-20',workout:'B',sets:{'prancha:0':{weight:'',reps:'90',done:true}}}}});
 const elements=new Map(),handlers={};let fail=false;
 const element=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',value:'supino-maquina',querySelectorAll:()=>[],classList:{add(){},remove(){},toggle(){}},style:{}});return elements.get(k);};
 vm.runInNewContext(readFileSync(new URL('../bundle.js',import.meta.url),'utf8'),{Intl,Date,console,confirm:()=>true,localStorage:{getItem:k=>k==='nosso-treino:v1'?stored:null,setItem:(k,v)=>{if(fail)throw Error();stored=v;}},document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(n,f)=>handlers[n]=f},window:{scrollTo(){}}});
 return {element,read:()=>JSON.parse(stored),fail:v=>fail=v,click:b=>handlers.click({target:{closest:()=>({dataset:{},...b})}}),input:(field,value,valid=true)=>handlers.input({target:{dataset:{set:'leg-press:0',field},type:field==='done'?'checkbox':'number',checked:value,value,validationMessage:'Valor inválido',checkValidity:()=>valid}}),change:(id,value,files)=>handlers.change({target:{id,value,files}})};
}
test('copiar série mantém destino desmarcado e valores inválidos não são gravados',()=>{
 const a=setup();a.click({dataset:{workout:'B'}});a.input('weight','40');a.input('reps','12');a.input('done',true);a.click({dataset:{copySeries:'leg-press'}});
 const session=Object.values(a.read().sessions).find(s=>s.sets['leg-press:1']);assert.deepEqual(session.sets['leg-press:1'],{weight:'40',reps:'12',done:false});
 a.input('weight','-1',false);assert.equal(a.element('#error-leg-press').textContent,'Valor inválido');assert.equal(Object.values(a.read().sessions).find(s=>s.sets['leg-press:1']).sets['leg-press:0'].weight,'40');
});
test('evolução respeita mês e mostra tempo da prancha',()=>{
 const a=setup();a.change('date','2026-10-27');a.click({dataset:{view:'evolucao'}});assert.match(a.element('#app').innerHTML,/value="prancha"/);assert.match(a.element('#app').innerHTML,/value="dead-bug"/);a.change('exercise-select','prancha');assert.match(a.element('#chart').innerHTML,/30 <small>s/);assert.doesNotMatch(a.element('#chart').innerHTML,/90/);assert.match(a.element('#chart').innerHTML,/10\/2026/);
});
test('desfazer exclusão recupera o registro original',()=>{
 const a=setup();a.click({dataset:{view:'historico'}});a.click({dataset:{deleteSession:key}});assert.equal(a.read().sessions[key],undefined);a.fail(true);a.click({id:'undo-delete'});assert.equal(a.read().sessions[key],undefined);a.fail(false);a.click({id:'undo-delete'});assert.equal(a.read().sessions[key].sets['prancha:0'].reps,'30');
});
test('importação só confirma depois de gravar e reverte falhas',async()=>{
 const a=setup();a.click({dataset:{view:'historico'}});const incomingKey='Caio:2026-10-22:A:1';const backup={version:1,sessions:{[incomingKey]:{profile:'Caio',date:'2026-10-22',workout:'A',sets:{}}}};const files=[{size:100,text:async()=>JSON.stringify(backup)}];
 a.fail(true);await a.change('import','',files);assert.equal(a.read().sessions[incomingKey],undefined);assert.match(a.element('#backup-message').textContent,/não foi salva/);
 a.fail(false);await a.change('import','',files);assert.ok(a.read().sessions[incomingKey]);assert.match(a.element('#backup-message').textContent,/1 registros importados e salvos/);
});
