import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('interface troca dados locais por workspace da conta e volta sem misturar os registros',()=>{
 const elements=new Map(),handlers={},writes=[];let callbacks;
 const guest=JSON.stringify({sessions:{'Caio:2026-10-20:A:1':{profile:'Caio',date:'2026-10-20',workout:'A',sets:{}}}});
 const cloud={active:false,profile:'Nicolli',notice:'Aguardando envio',start:options=>{callbacks=options;return Promise.resolve();},save:data=>writes.push(JSON.parse(JSON.stringify(data)))};
 const element=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',querySelectorAll:()=>[],classList:{add(){},remove(){},toggle(){}},style:{}});return elements.get(k);};
 vm.runInNewContext(readFileSync(new URL('../bundle.js',import.meta.url),'utf8'),{Intl,Date,console,NossoCloud:cloud,localStorage:{getItem:k=>k==='nosso-treino:v1'?guest:null,setItem:()=>assert.fail('Dados online não podem alterar o cache compartilhado')},document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(n,f)=>handlers[n]=f},window:{scrollTo(){}}});
 cloud.active=true;callbacks.workspace({owner:'owner-n',profile:'Nicolli',state:{sessions:{}}});
 assert.match(element('#app').innerHTML,/Vamos nessa, Nicolli/);
 handlers.click({target:{closest:()=>({dataset:{workout:'A'}})}});
 handlers.input({target:{dataset:{set:'supino-maquina:0',field:'weight'},type:'number',value:'10',checkValidity:()=>true}});
 assert.equal(Object.values(writes[0].sessions)[0].profile,'Nicolli');assert.equal(Object.keys(writes[0].sessions).length,1);
 cloud.active=false;callbacks.workspace(null);assert.match(element('#app').innerHTML,/Vamos nessa, Caio/);
 handlers.click({target:{closest:()=>({dataset:{view:'historico'}})}});assert.match(element('#app').innerHTML,/2026-10-20:A:1/);assert.doesNotMatch(element('#app').innerHTML,/Nicolli:.*:A/);
});
