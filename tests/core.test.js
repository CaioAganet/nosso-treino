import test from 'node:test';
import assert from 'node:assert/strict';
import {workouts,recommended,sessionKey,progress,today} from '../data.js';
import {load,save,validateBackup} from '../store.js';
test('18 exercícios únicos, duas séries por exercício e ficha oficial',()=>{const all=Object.values(workouts).flatMap(w=>w.exercises);assert.equal(all.length,18);assert.equal(new Set(all.map(e=>e[0])).size,18);assert.equal(workouts.A.exercises[0][1],'Supino máquina');assert.equal(workouts.B.exercises[5][6],'tempo');assert.equal(workouts.C.exercises[5][6],'repeticoes');});
test('agenda e datas de São Paulo',()=>{assert.equal(recommended('2026-10-26'),'B');assert.equal(recommended('2026-10-28'),'A');assert.equal(recommended('2026-10-30'),'C');assert.match(today(),/^\d{4}-\d{2}-\d{2}$/);});
test('persistência preserva perfis e datas independentes',()=>{const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};const data={sessions:{}};for(const profile of ['Caio','Nicolli']){const date='2026-10-27',workout='A';data.sessions[sessionKey(profile,date,workout)]={profile,date,workout,sets:{'supino-maquina:0':{weight:profile==='Caio'?'30':'10',reps:'12',done:true}}};}save(data,storage);assert.deepEqual(load(storage),data);assert.equal(Object.keys(load(storage).sessions).length,2);assert.equal(load(storage).sessions['Caio:2026-10-27:A'].sets['supino-maquina:0'].weight,'30');});
test('progresso parcial e total',()=>{assert.equal(progress(undefined),0);assert.equal(progress({sets:{one:{done:true}}}),8);assert.equal(progress({sets:Object.fromEntries(Array.from({length:12},(_,i)=>[i,{done:true}]))}),100);});
test('backup validado rejeita perfil, carga e chave inválidos',()=>{const s={profile:'Caio',date:'2026-10-27',workout:'A',sets:{'supino-maquina:0':{weight:'30',reps:'12',done:true}}};assert.equal(Object.keys(validateBackup({version:1,sessions:{'Caio:2026-10-27:A':s}})).length,1);assert.throws(()=>validateBackup({version:1,sessions:{bad:s}}));assert.throws(()=>validateBackup({version:1,sessions:{'Caio:2026-10-27:A':{...s,sets:{x:{weight:'<script>',reps:1,done:true}}}}}));});

import {lastExerciseSession} from '../data.js';
test('última execução separa perfis, ignora treino atual e séries pendentes e ordena o mesmo dia',()=>{
 const session=(profile,date,weight,done=true)=>({profile,date,workout:'B',sets:{'leg-press:0':{weight,reps:'12',done}}});
 const sessions={
 'Caio:2026-10-26:B:1':session('Caio','2026-10-26','30'),
 'Caio:2026-10-26:B:2':session('Caio','2026-10-26','40'),
 'Caio:2026-10-27:B':session('Caio','2026-10-27','99'),
 'Caio:2026-10-27:B:1':session('Caio','2026-10-27','70',false),
 'Nicolli:2026-10-27:B:1':session('Nicolli','2026-10-27','10'),
 'Caio:2026-10-30:B:1':session('Caio','2026-10-30','80')
 };
 assert.equal(lastExerciseSession(sessions,'Caio','2026-10-27','leg-press','Caio:2026-10-27:B').sets[0].weight,'40');
 assert.equal(lastExerciseSession(sessions,'Nicolli','2026-10-27','leg-press').sets[0].weight,'10');
 assert.equal(lastExerciseSession(sessions,'Caio','2026-10-27','prancha'),null);
 assert.equal(lastExerciseSession(sessions,'Caio','2026-10-25','leg-press'),null);
});

import {workoutSummary} from '../data.js';
test('indicadores contam salvos completos e parciais, separando andamento, período e perfil',()=>{
 const session=(profile,date,done)=>({profile,date,workout:'B',sets:Object.fromEntries(Array.from({length:done},(_,i)=>[i,{done:true}]))});
 const sessions={
 'Caio:2026-10-26:B:1':session('Caio','2026-10-26',12),
 'Caio:2026-10-26:B:2':session('Caio','2026-10-26',3),
 'Caio:2026-10-27:B:1':session('Caio','2026-10-27',0),
 'Caio:2026-10-27:B':session('Caio','2026-10-27',12),
 'Nicolli:2026-10-27:B:1':session('Nicolli','2026-10-27',12),
 'Caio:2026-10-25:B:1':session('Caio','2026-10-25',12),
 'Caio:2026-11-02:B:1':session('Caio','2026-11-02',12)
 };
 assert.deepEqual(workoutSummary(sessions,'Caio','2026-10-26','2026-11-02'),{registered:3,complete:1,partial:2,ongoing:1});
 assert.deepEqual(workoutSummary(sessions,'Caio','2026-10-01','2026-11-01'),{registered:4,complete:2,partial:2,ongoing:1});
 assert.deepEqual(workoutSummary({},'Caio','2026-10-01','2026-11-01'),{registered:0,complete:0,partial:0,ongoing:0});
 delete sessions['Caio:2026-10-26:B:2'];
 assert.equal(workoutSummary(sessions,'Caio','2026-10-26','2026-11-02').registered,2);
});
