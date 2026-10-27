export const STORAGE_KEY='nosso-treino:v1';
export function load(storage=localStorage){const raw=storage.getItem(STORAGE_KEY); if(!raw)return {sessions:{}};const data=JSON.parse(raw);if(!data || typeof data.sessions!=='object' || Array.isArray(data.sessions))throw new Error('Backup inválido');return data;}
export function save(data,storage=localStorage){storage.setItem(STORAGE_KEY,JSON.stringify(data));}
export function validateBackup(data){if(data?.version!==1 || !data.sessions || typeof data.sessions!=='object'||Array.isArray(data.sessions))throw new Error('Formato de backup não reconhecido.');for(const [key,s] of Object.entries(data.sessions)){if(!['Caio','Nicolli'].includes(s.profile)||!['A','B','C'].includes(s.workout)||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!(key===`${s.profile}:${s.date}:${s.workout}` || (key.startsWith(`${s.profile}:${s.date}:${s.workout}:`) && /^[1-9]\d*$/.test(key.slice(`${s.profile}:${s.date}:${s.workout}:`.length))))||!s.sets||typeof s.sets!=='object')throw new Error('Registro inválido.');for(const v of Object.values(s.sets)){if(typeof v.done!=='boolean'||!['weight','reps'].every(f=>v[f]===''||(Number.isFinite(Number(v[f]))&&Number(v[f])>=0&&Number(v[f])<=999)))throw new Error('Série inválida.');}}return data.sessions;}

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
