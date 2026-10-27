import {workouts} from './data.js';
export const STORAGE_KEY='nosso-treino:v1';
let workspaceAdapter=null;
export function useWorkspace(adapter){workspaceAdapter=adapter;}
export function load(storage=localStorage){if(workspaceAdapter)return workspaceAdapter.load();const raw=storage.getItem(STORAGE_KEY); if(!raw)return {sessions:{}};const data=JSON.parse(raw);if(!data || !data.sessions || typeof data.sessions!=='object' || Array.isArray(data.sessions))throw new Error('Backup inválido');return data;}
export function save(data,storage=localStorage){if(workspaceAdapter){workspaceAdapter.save(data);return;}storage.setItem(STORAGE_KEY,JSON.stringify(data));}
export function validateBackup(data){
 if(data?.version!==1||!data.sessions||typeof data.sessions!=='object'||Array.isArray(data.sessions))throw Error('Formato de backup não reconhecido.');
 for(const [key,s] of Object.entries(data.sessions)){
  const base=s&&s.profile+':'+s.date+':'+s.workout;
  if(!s||!['Caio','Nicolli'].includes(s.profile)||!Object.hasOwn(workouts,s.workout)||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!Number.isFinite(Date.parse(s.date))||new Date(s.date).toISOString().slice(0,10)!==s.date||!(key===base||key.startsWith(base+':')&&/^[1-9]\d*$/.test(key.slice(base.length+1)))||!s.sets||typeof s.sets!=='object'||Array.isArray(s.sets))throw Error('Registro inválido.');
  for(const [id,v] of Object.entries(s.sets)){
   const [exercise,index]=id.split(':');
   if(!workouts[s.workout].exercises.some(e=>e[0]===exercise)||!['0','1'].includes(index)||id!==exercise+':'+index||!v||typeof v.done!=='boolean')throw Error('Série inválida.');
   for(const f of ['weight','reps'])if(v[f]!==''&&(!['string','number'].includes(typeof v[f])||!Number.isFinite(Number(v[f]))||Number(v[f])<0||Number(v[f])>999||f==='reps'&&!Number.isInteger(Number(v[f]))))throw Error('Valor inválido na série.');
  }
 }
 return data.sessions;
}

export const PROFILE_KEY='nosso-treino:perfil';
export function loadProfile(storage=localStorage) {
  try {
    const profile=storage.getItem(PROFILE_KEY);
    return ['Caio','Nicolli'].includes(profile)?profile:'Caio';
  } catch { return 'Caio'; }
}
export function saveProfile(profile,storage=localStorage) {
  if (!['Caio','Nicolli'].includes(profile)) throw new Error('Perfil inválido.');
  storage.setItem(PROFILE_KEY,profile);
}
