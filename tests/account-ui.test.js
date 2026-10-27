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

test('login bem-sucedido fecha a janela e abre o treino; mostrar senha não altera seu conteúdo',async()=>{
 const elements=new Map(),handlers={};let callbacks;
 const element=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',value:'',type:'password',open:true,querySelectorAll:()=>[],close(){this.open=false;},classList:{add(){},remove(){},toggle(){}},style:{}});return elements.get(k);};
 const cloud={active:false,notice:'Sincronizado',profile:'Caio',start:options=>{callbacks=options;return Promise.resolve();},login:async(email,password)=>{assert.equal(email,'user@example.test');assert.equal(password,'example-password');cloud.active=true;callbacks.workspace({owner:'owner-a',profile:'Caio',state:{sessions:{}}});},friendly:error=>error.message};
 vm.runInNewContext(readFileSync(new URL('../bundle.js',import.meta.url),'utf8'),{Intl,Date,console,NossoCloud:cloud,localStorage:{getItem:()=>null},document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(name,fn)=>handlers[name]=fn},window:{scrollTo(){}}});
 element('#account-email').value='user@example.test';element('#account-password').value='example-password';
 const toggle={id:'toggle-password',dataset:{},setAttribute(){}};
 handlers.click({target:{closest:()=>toggle}});assert.equal(element('#account-password').type,'text');assert.equal(element('#account-password').value,'example-password');
 await handlers.submit({target:{id:'account-form',reportValidity:()=>true,querySelectorAll:()=>[]},preventDefault(){},submitter:{value:'login'}});
 assert.equal(element('#account-dialog').open,false);assert.match(element('#app').innerHTML,/training-controls/);assert.equal(element('#account-password').value,'');
});

test('recuperação abre formulário e não envia senhas diferentes',async()=>{
 const elements=new Map(),handlers={};let callbacks,updates=0;
 const element=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',value:'',open:false,showModal(){this.open=true;},querySelectorAll:()=>[],classList:{add(){},remove(){},toggle(){}},style:{}});return elements.get(k);};
 const cloud={recovering:true,active:false,start:options=>{callbacks=options;return Promise.resolve();},updatePassword:async()=>{updates++;cloud.recovering=false;},friendly:error=>error.message};
 vm.runInNewContext(readFileSync(new URL('../bundle.js',import.meta.url),'utf8'),{Intl,Date,console,NossoCloud:cloud,localStorage:{getItem:()=>null},document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(n,f)=>handlers[n]=f},window:{scrollTo(){}}});
 callbacks.recovery();assert.match(element('#account-body').innerHTML,/Criar nova senha/);assert.equal(element('#account-dialog').open,true);
 const button={disabled:false},event={target:{id:'password-recovery-form',reportValidity:()=>true,querySelector:()=>button},preventDefault(){}};
 element('#new-password').value='example-password';element('#confirm-password').value='different-password';await handlers.submit(event);assert.equal(updates,0);
 element('#confirm-password').value='example-password';await handlers.submit(event);assert.equal(updates,1);assert.equal(element('#new-password').value,'');assert.equal(button.disabled,false);
});

test('selecionar perfil preenche somente seu e-mail e limpa a senha anterior',()=>{
 const elements=new Map(),handlers={},values=new Map([['nosso-treino:email:Caio','caio@example.test'],['nosso-treino:email:Nicolli','nicolli@example.test']]);
 const element=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',value:'',type:'password',setAttribute(){},querySelectorAll:()=>[],classList:{add(){},remove(){},toggle(){}},style:{}});return elements.get(k);};
 vm.runInNewContext(readFileSync(new URL('../bundle.js',import.meta.url),'utf8'),{Intl,Date,console,localStorage:{getItem:k=>values.get(k)||null},document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(n,f)=>handlers[n]=f},window:{scrollTo(){}}});
 element('#account-profile').value='Nicolli';element('#account-password').value='previous-secret';element('#account-password').type='text';handlers.change({target:{id:'account-profile'}});
 assert.equal(element('#account-email').value,'nicolli@example.test');assert.equal(element('#account-password').value,'');assert.equal(element('#account-password').type,'password');
 element('#account-profile').value='Caio';handlers.change({target:{id:'account-profile'}});assert.equal(element('#account-email').value,'caio@example.test');
});
