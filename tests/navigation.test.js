import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(cloud){
 const elements=new Map(),handlers={},writes=[],downloads=[],nav=['inicio','historico','configuracoes'].map(view=>({dataset:{view},active:false,current:null,classList:{toggle(name,value){nav.find(b=>b.dataset.view===view).active=value;}},setAttribute(name,value){nav.find(b=>b.dataset.view===view).current=value;}}));
 const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'supino-maquina',querySelectorAll:()=>[],classList:{add(){},remove(){},toggle(){}},style:{}});return elements.get(id);};
 const context={Intl,Date,console,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout:()=>1,NossoCloud:cloud,localStorage:{getItem:()=>null,setItem:(key,value)=>writes.push({key,value})},document:{createElement:()=>({click(){downloads.push(this.download);}}),querySelector:element,querySelectorAll:selector=>selector==='nav button'?nav:[],addEventListener:(name,fn)=>handlers[name]=fn},window:{scrollTo(){}}};
 vm.runInNewContext(readFileSync(new URL('../bundle.js',import.meta.url),'utf8'),context);
 return {element,writes,downloads,nav,click:button=>handlers.click({target:{closest:()=>({dataset:{},...button})}})};
}

test('três áreas mantêm Progresso ativo nas consultas e concentram backup em Configurações sem gravar dados',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),a=setup();
 const menu=html.match(/<nav[^>]*>(.*?)<\/nav>/s)[1];assert.equal((menu.match(/<button /g)||[]).length,3);
 for(const view of ['historico','evolucao','parceiro']){
  a.click({dataset:{view}});assert.equal(a.nav.find(b=>b.active)?.dataset.view,'historico');assert.match(a.element('#app').innerHTML,/Consultar progresso/);
 }
 a.click({dataset:{view:'configuracoes'}});assert.equal(a.nav.find(b=>b.current==='page')?.dataset.view,'configuracoes');
 const settings=a.element('#app').innerHTML;assert.match(settings,/id="open-account"/);assert.match(settings,/id="export"/);assert.match(settings,/id="import"/);assert.match(settings,/Saúde/);assert.match(settings,/Em breve/);assert.doesNotMatch(settings,/type="number"/);
 a.click({dataset:{view:'historico'}});assert.doesNotMatch(a.element('#app').innerHTML,/id="export"/);assert.match(a.element('#app').innerHTML,/backup em Configurações/);assert.equal(a.writes.length,0);
});

test('ficha tem uma seleção de pessoa e preserva salvar, instruções e séries',()=>{
 const a=setup();a.click({dataset:{workout:'A'}});const html=a.element('#app').innerHTML;
 assert.equal((html.match(/data-profile=/g)||[]).length,2);assert.equal((html.match(/id="save-workout"/g)||[]).length,1);assert.equal((html.match(/data-instruction=/g)||[]).length,6);assert.equal((html.match(/type="checkbox"/g)||[]).length,12);assert.equal(a.nav.find(b=>b.active)?.dataset.view,'inicio');
});

test('exportar cópia online passa pelo menu e baixa a versão local sem alterar registros',()=>{
 const cloud={active:true,profile:'Caio',snapshot:{sessions:{}},start:()=>Promise.resolve(),friendly:error=>error.message};
 const a=setup(cloud);a.click({id:'cloud-export'});assert.deepEqual(a.downloads,['nosso-treino-Caio-'+new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())+'.json']);assert.equal(a.writes.length,0);
});
