// Fila durável por usuário. O servidor aceita apenas a revisão esperada.
export class SyncEngine {
  constructor({owner, remote, storage, writeRemote, onStatus=()=>{}}) {
    this.owner=owner; this.storage=storage; this.key='nosso-treino:cloud:'+owner;
    this.writeRemote=writeRemote; this.onStatus=onStatus;this.closed=false;this.sequence=0;
    const raw=storage.getItem(this.key), cached=raw?JSON.parse(raw):null;
    this.revision=cached?.pending?cached.revision:remote.revision;
    this.conflict=Boolean(cached?.pending && cached.revision!==remote.revision);
    this.pending=Boolean(cached?.pending);
    this.state=structuredClone(this.pending?cached.state:remote.state);
    this.persist();
  }
  persist(){this.storage.setItem(this.key,JSON.stringify({revision:this.revision,state:this.state,pending:this.pending}));}
  queue(state){
    if(this.closed)throw Error('Conta desconectada.');
    const previous=this.state, pending=this.pending;
    this.state=structuredClone(state);this.pending=true;
    try{this.persist();}catch(error){this.state=previous;this.pending=pending;throw error;}
    this.sequence++;this.onStatus(this.conflict?'conflict':'pending');
  }
  async flush(){
    if(this.closed||this.conflict)return;
    if(this.inFlight)return this.inFlight;
    this.inFlight=this.drain().finally(()=>{this.inFlight=null;});
    return this.inFlight;
  }
  async drain(){
    while(this.pending&&!this.closed&&!this.conflict){
      const sequence=this.sequence, state=structuredClone(this.state), revision=this.revision;
      this.onStatus('syncing');
      try {
        const next=await this.writeRemote(state,revision);
        if(this.closed)return;
        if(!Number.isSafeInteger(next)||next<=revision)throw Error('Resposta de sincronização inválida.');
        this.revision=next;this.pending=this.sequence!==sequence;this.persist();
      }catch(error){
        if(this.closed)return;
        this.pending=true;
        this.conflict=String(error.message).includes('SYNC_CONFLICT')||error.code==='40001';
        this.onStatus(this.conflict?'conflict':'error',error);
        return;
      }
    }
    if(!this.closed)this.onStatus(this.pending?'pending':'synced');
  }
  close(){this.closed=true;}
}
