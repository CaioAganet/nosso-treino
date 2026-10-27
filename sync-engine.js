// Comparação sem metadados gerados pelo servidor e sem depender da ordem JSON.
function normalized(value) {
 if(Array.isArray(value))return value.map(normalized);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(k=>k!=='updatedAt'&&!(k==='savedAt'&&!value[k])).sort().map(k=>[k,k==='savedAt'?(Number.isFinite(Date.parse(value[k]))?new Date(value[k]).toISOString():value[k]):['weight','reps'].includes(k)&&value[k]!==''?Number(value[k]):normalized(value[k])]));
 return value;
}
const equal=(a,b)=>JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
const clone=value=>structuredClone(value);

// Cada registro é uma unidade: editar/excluir o mesmo treino exige resolução humana.
export function mergeStates(base,local,remote) {
 const result=clone(remote),conflicts=[];
 function mergeMap(before={},ours={},theirs={},path='') {
  const merged=clone(theirs);
  for(const key of new Set([...Object.keys(before),...Object.keys(ours)])) {
   if(equal(ours[key],before[key]))continue;
   if(!equal(theirs[key],before[key])&&!equal(theirs[key],ours[key])){conflicts.push(path+key);continue;}
   if(Object.hasOwn(ours,key))merged[key]=clone(ours[key]);else delete merged[key];
  }
  return merged;
 }
 result.sessions=mergeMap(base.sessions,local.sessions,remote.sessions,'sessions:');
 result.drafts=mergeMap(base.drafts,local.drafts,remote.drafts,'drafts:');
 for(const key of new Set([...Object.keys(base),...Object.keys(local)])) {
  if(['sessions','drafts'].includes(key)||equal(base[key],local[key]))continue;
  // A data do último backup não interfere nos treinos.
  if(key==='lastBackupAt'){result[key]=[local[key],remote[key]].filter(Boolean).sort().at(-1);continue;}
  if(!equal(remote[key],base[key])&&!equal(remote[key],local[key])){conflicts.push(key);continue;}
  if(Object.hasOwn(local,key))result[key]=clone(local[key]);else delete result[key];
 }
 return {state:result,conflicts};
}

export class SyncEngine {
 constructor({owner,remote,storage,writeRemote,readRemote,onStatus=()=>{},onState=()=>{},validate=()=>{},ignoreJournals=new Set()}) {
  Object.assign(this,{owner,storage,writeRemote,readRemote,onStatus,onState,validate});
  this.root='nosso-treino:cloud:'+owner;this.key=null;this.sequence=0;this.closed=false;this.pending=false;this.conflict=false;this.conflicts=[];this.journals=new Set();
  this.base=clone(remote.state);this.state=clone(remote.state);this.revision=remote.revision;
  validate(remote.state);
  const keys=[this.root];
  for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(this.root+':queue:')&&!key.includes(':recovery:'))keys.push(key);}
  for(const key of keys) {
   if(ignoreJournals.has(key))continue;
   const raw=storage.getItem(key);if(!raw)continue;
   const cached=JSON.parse(raw);if(!cached.pending)continue;
   validate(cached.state);if(cached.base)validate(cached.base);
   this.journals.add(key);this.pending=true;
   if(!cached.base&&(Object.hasOwn(cached,'base')||cached.revision!==remote.revision)){this.conflict=true;this.state=clone(cached.state);continue;}
   const merged=mergeStates(cached.base||remote.state,cached.state,this.state);
   if(merged.conflicts.length){this.conflict=true;this.conflicts.push(...merged.conflicts);this.state=clone(cached.state);}
   else this.state=merged.state;
  }
  // Sem uma base antiga confiável, nunca deduzimos quais exclusões eram intencionais.
  if(this.conflict)this.base=null;
 }
 persist() {
  // Uma chave nova por gravação: nenhuma aba altera ou apaga uma fila mutável de outra.
  const key=this.root+':queue:'+globalThis.crypto.randomUUID();
  this.storage.setItem(key,JSON.stringify({revision:this.revision,base:this.base,state:this.state,pending:true}));
  const previous=this.key;this.key=key;this.journals.add(key);
  if(previous){this.storage.removeItem(previous);this.journals.delete(previous);}
 }
 queue(state,visibleBase=this.state) {
  if(this.closed)throw Error('Conta desconectada.');
  this.validate(state);
  const previous={state:this.state,pending:this.pending,base:this.base,conflict:this.conflict};
  const merged=mergeStates(visibleBase,state,this.state);
  this.state=merged.conflicts.length?clone(state):merged.state;this.pending=true;
  if(merged.conflicts.length){this.base=null;this.conflict=true;}
  try{this.persist();}catch(error){Object.assign(this,previous);throw error;}
  this.sequence++;this.onStatus(this.conflict?'conflict':'pending');
 }
 async flush() {
  if(this.closed)return;
  if(this.inFlight)return this.inFlight;
  this.inFlight=this.drain().finally(()=>{this.inFlight=null;});return this.inFlight;
 }
 async drain() {
  let attempts=0;
  while(!this.closed) {
   try {
    if(this.readRemote) {
     const remote=await this.readRemote();if(this.closed)return;
     this.validate(remote.state);
     if(this.pending) {
      if(!this.base){this.conflict=true;this.onStatus('conflict');return;}
      const merged=mergeStates(this.base,this.state,remote.state);
      if(merged.conflicts.length){this.conflict=true;this.conflicts=merged.conflicts;this.onStatus('conflict');return;}
      const changed=!equal(this.state,merged.state);
      // Persiste a nova base antes de exibir dados recebidos ou enviá-los.
      const previous={state:this.state,base:this.base,revision:this.revision};
      this.state=merged.state;this.base=clone(remote.state);this.revision=remote.revision;
      try{this.persist();}catch(error){Object.assign(this,previous);throw error;}
      this.conflict=false;this.conflicts=[];if(changed)this.onState(clone(this.state));
     } else {
      const changed=!equal(this.state,remote.state);
      this.base=clone(remote.state);this.state=clone(remote.state);this.revision=remote.revision;
      if(changed)this.onState(clone(this.state));
     }
    }
    if(this.conflict){this.onStatus('conflict');return;}
    if(!this.pending){this.onStatus('synced');return;}
    const sequence=this.sequence,state=clone(this.state),revision=this.revision,acknowledged=[...this.journals];
    this.onStatus('syncing');
    const next=await this.writeRemote(state,revision);if(this.closed)return;
    if(!Number.isSafeInteger(next)||next<=revision)throw Error('Resposta de sincronização inválida.');
    this.revision=next;if(this.base!==null)this.base=state;this.pending=this.sequence!==sequence;
    if(this.pending)this.persist();
    for(const key of acknowledged){this.storage.removeItem(key);this.journals.delete(key);if(this.key===key)this.key=null;}
    if(!this.pending){this.onStatus('synced');return;}
    attempts=0;
   } catch(error) {
    if(this.closed)return;
    const collision=String(error.message).includes('SYNC_CONFLICT')||error.code==='40001';
    if(collision&&this.readRemote&&++attempts<3)continue;
    this.conflict=collision;
    this.onStatus(collision?'conflict':'error',error);return;
   }
  }
 }
 discard() {
  // Arquiva somente as filas vistas por esta instância; novas filas de outras abas ficam intactas.
  for(const key of this.journals){const raw=this.storage.getItem(key);if(raw){this.storage.setItem(key+':recovery:'+Date.now(),raw);this.storage.removeItem(key);}}
  this.journals.clear();this.pending=false;
 }
 close(){this.closed=true;}
}
