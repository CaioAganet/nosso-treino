import {createClient} from '@supabase/supabase-js';
import {SyncEngine} from './sync-engine.js';
import {supabaseConfig} from './supabase-config.js';
import {validateBackup} from './store.js';

const client=createClient(supabaseConfig.url,supabaseConfig.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const messages={pending:'Salvo neste dispositivo · aguardando envio',syncing:'Sincronizando…',synced:'Sincronizado · confirmado pelo servidor',error:'Salvo neste dispositivo · envio pendente, tente novamente',conflict:'O mesmo registro foi alterado em outra aba ou aparelho. Sua versão está preservada. Abra Conta para resolver.'};
let recovering=new URL(location.href).searchParams.get('recovery')==='1'||new URLSearchParams(new URL(location.href).hash.slice(1)).get('type')==='recovery';
let loginProfile=null;
let callbacks={}, engine=null, user=null, accountProfile=null, timer=null, epoch=0, authSession=null;
let notice='Modo local · sem sincronização',busy=false,pollTimer=null,displayedState=null;
function publishState(local=false){
 if(!engine||!local&&callbacks.editing?.())return;
 const state=structuredClone(engine.state);
 if(JSON.stringify(state)===JSON.stringify(displayedState))return;
 displayedState=state;callbacks.update?.(structuredClone(state),local);
}
function watch(){
 clearTimeout(pollTimer);
 if(!engine)return;
 pollTimer=setTimeout(async()=>{try{if(!busy)await cloud.retry();}finally{watch();}},10000);
}
function makeEngine(actor,remote,name,own=true,ignoreJournals=new Set()){
 const target=own?actor:remote.owner;
 if(!target)throw Error('Perfil sem identificação.');
 let candidate;
 candidate=new SyncEngine({owner:own?actor:actor+':partner:'+target,remote,storage:localStorage,
  ignoreJournals,validate:state=>validateState(state,name),
  readRemote:async()=>{
   const value=await rpc(own?'nt_read_state':'nt_read_profile',own?undefined:{p_profile:name},actor);
   if(value.profile!==name||!own&&value.owner!==target)throw Error('PARTNER_ACCESS_REQUIRED');
   return value;
  },
  writeRemote:(state,revision)=>rpc(own?'nt_write_state':'nt_write_profile',own?{p_state:state,p_revision:revision}:{p_profile:name,p_owner:target,p_state:state,p_revision:revision},actor),
  onStatus:(code,error)=>{if(engine===candidate)announce(code,error);},
  onState:()=>{if(engine===candidate)publishState();}
 });
 return candidate;
}
function announce(code,error){notice=error?.message?.includes('PARTNER_ACCESS_REQUIRED')?'Compartilhamento encerrado. Alterações pendentes preservadas neste aparelho.':messages[code]||code;callbacks.status?.(notice,['error','conflict'].includes(code));}
function validateState(state,name){
 validateBackup({version:1,sessions:state.sessions});
 if(state.drafts)validateBackup({version:1,sessions:state.drafts});
 if(Object.values({...state.sessions,...state.drafts}).some(s=>s.profile!==name))throw Error('O backup contém registros de outro perfil. Importe apenas os registros da sua conta.');
 return state;
}
async function rpc(name,args,expectedOwner){
 const {data:auth,error:authError}=await client.auth.getSession();if(authError)throw authError;
 const session=auth.session;if(!session||expectedOwner&&session.user.id!==expectedOwner)throw Error('A conta mudou. Entre novamente.');
 const {data,error}=await client.rpc(name,args).setHeader('Authorization','Bearer '+session.access_token);if(error)throw error;return data;
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>cloud.retry().catch(()=>{}),700);}
function reset(){epoch++;busy=false;clearTimeout(pollTimer);clearTimeout(timer);engine?.close();engine=null;user=null;accountProfile=null;notice='Modo local · sem sincronização';callbacks.workspace?.(null);announce(notice);}
async function activate(session,name){
 const token=++epoch;busy=true;authSession=session;
 engine?.close();clearTimeout(pollTimer);engine=null;user=null;accountProfile=null;callbacks.workspace?.(null);
 announce('Carregando sua conta…');
 try {
  const remote=await rpc('nt_open_account',{p_name:['Caio','Nicolli'].includes(name)?name:'Caio'},session.user.id);
  if(token!==epoch)return;
  validateState(remote.state,remote.profile);
  const candidate=makeEngine(session.user.id,remote,remote.profile);
  validateState(candidate.state,remote.profile);
  engine=candidate;user=session.user;accountProfile=remote.profile;loginProfile=remote.profile;
  displayedState=structuredClone(engine.state);callbacks.workspace?.({owner:user.id,profile:accountProfile,state:structuredClone(engine.state)});
  announce(engine.conflict?'conflict':engine.pending?'pending':'synced');
  if(engine.pending&&!engine.conflict)schedule();watch();
 } catch(error){if(token===epoch){clearTimeout(pollTimer);announce('Não foi possível abrir a conta. '+friendly(error));throw error;}}
 finally{if(token===epoch)busy=false;}
}
function friendly(error){
 if(error.code==='PGRST202')return 'Atualize o banco com a migração de compartilhamento indicada para esta versão do aplicativo.';
 if(error.message?.includes('PARTNER_ACCESS_REQUIRED'))return 'Vinculem as contas em Compartilhamento do casal para registrar os treinos um do outro. Se já estavam vinculadas, o vínculo pode ter sido encerrado.';
 const sharingErrors={INVALID_INVITE:'Convite inválido, expirado ou já utilizado.',OWN_INVITE:'Entre na outra conta para aceitar este convite.',ALREADY_LINKED:'Uma das contas já está vinculada. Desvincule antes de formar outro casal.',PROFILE_REQUIRED:'Entre no aplicativo e abra seu perfil antes de aceitar.'};
 for(const [code,message]of Object.entries(sharingErrors))if(error.message?.includes(code))return message;
 if(error.code==='invalid_credentials'||error.message?.includes('Invalid login credentials'))return 'E-mail ou senha não conferem. Use a senha criada para o Nosso Treino.';
 if(error.code==='email_not_confirmed'||error.message?.includes('Email not confirmed'))return 'Esta conta ainda exige confirmação no Supabase. Para usar sem confirmação por e-mail, ajuste essa opção no painel.';
 if(error.code==='user_already_exists'||error.message?.includes('User already registered'))return 'Esta conta já existe. Clique em Entrar e use a senha cadastrada.';
 if(error.message?.includes('Failed to fetch'))return 'Não foi possível conectar. Verifique sua internet.';
 if(error.message?.includes('rate limit'))return 'Muitas tentativas. Aguarde alguns minutos.';
 return error.message||'Tente novamente.';
}
const cloud={
 get snapshot(){return engine?structuredClone(engine.state):null;},
 get loginProfile(){return loginProfile;},
 get recovering(){return recovering;},
 get owner(){return user?.id;},get active(){return Boolean(engine);},get busy(){return busy;},get profile(){return accountProfile;},get email(){return user?.email||authSession?.user?.email||'';},
 get hasSession(){return Boolean(authSession);},get pending(){return Boolean(engine?.pending);},get conflict(){return Boolean(engine?.conflict);},get notice(){return notice;},friendly,
 async start(options){callbacks=options;busy=true;
  client.auth.onAuthStateChange((event,session)=>{
   if(event==='PASSWORD_RECOVERY'){recovering=true;authSession=session;const url=new URL(location.href);url.searchParams.set('recovery','1');url.hash='';history.replaceState(null,'',url.href);callbacks.recovery?.();}
   if(event==='SIGNED_OUT'){authSession=null;reset();}
   else if(event==='SIGNED_IN'&&!busy&&session?.user.id!==authSession?.user?.id){setTimeout(()=>activate(session,session.user.user_metadata?.display_name).catch(()=>{}),0);}
  });
  if(recovering)callbacks.recovery?.();
  const {data,error}=await client.auth.getSession();if(error){busy=false;announce('Sessão indisponível. Entre novamente.');return;}
  try{if(data.session&&!authSession)await activate(data.session,data.session.user.user_metadata?.display_name);}finally{busy=false;}
 },
 async requestPasswordReset(email){
  const redirect=new URL('./',location.href);
  const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:redirect.href});if(error)throw error;
 },
 async updatePassword(password){
  const {data,error:sessionError}=await client.auth.getSession();if(sessionError)throw sessionError;
  if(!recovering||!data.session)throw Error('Link expirado ou inválido. Solicite outro link em Esqueci minha senha.');
  const {error}=await client.auth.updateUser({password});if(error)throw error;
  recovering=false;const url=new URL(location.href);url.searchParams.delete('recovery');url.hash='';history.replaceState(null,'',url.href);
 },
 async login(email,password,name){
  busy=true;try{const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;await activate(data.session,data.session.user.user_metadata?.display_name||name);}finally{busy=false;}
 },
 async signup(email,password,name){busy=true;try{
  const options={data:{display_name:name}};if(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')options.emailRedirectTo=new URL('./',location.href).href;
  const {data,error}=await client.auth.signUp({email,password,options});if(error)throw error;
  if(data.session){await activate(data.session,name);return 'Conta criada e conectada.';}
  return 'Confira seu e-mail e confirme o cadastro. Depois volte e clique em Entrar.';
 }finally{busy=false;}},
 async switchProfile(name,{discardPending=false}={}){
  if(!user||!engine)throw Error('Entre na sua conta.');
  if(busy)throw Error('Aguarde o carregamento da conta.');
  const actor=user.id,token=epoch,previous=engine;busy=true;clearTimeout(timer);
  try{
   if(!discardPending){await previous.flush();if(previous.pending)throw Error('Antes de trocar de pessoa, sincronize as alterações pendentes. Seus registros continuam neste aparelho.');}
   const own=name===loginProfile;
   const remote=await rpc(own?'nt_read_state':'nt_read_profile',own?undefined:{p_profile:name},actor);
   if(token!==epoch)throw Error('A conta mudou. Entre novamente.');
   if(remote.profile!==name)throw Error('Perfil recebido diferente do solicitado.');
   validateState(remote.state,name);
   const target=own?actor:remote.owner;if(!target)throw Error('Perfil sem identificação.');
   const candidate=makeEngine(actor,remote,name,own,discardPending?previous.journals:new Set());
   if(discardPending)previous.discard();
   validateState(candidate.state,name);previous.close();engine=candidate;accountProfile=name;
   displayedState=structuredClone(engine.state);callbacks.workspace?.({owner:target,profile:name,state:structuredClone(engine.state)});
   announce(engine.conflict?'conflict':engine.pending?'pending':'synced');if(engine.pending&&!engine.conflict)schedule();watch();
  }finally{if(token===epoch)busy=false;}
 },
 save(state){if(!engine)throw Error('Sua conta está desconectada.');validateState(state,accountProfile);engine.queue(state,displayedState);publishState(true);schedule();},
 async retry(){if(busy)return;if(!engine&&authSession)return activate(authSession,authSession.user.user_metadata?.display_name);await engine?.flush();publishState();},
 async refresh(){
  if(!authSession)throw Error('Entre na sua conta.');
  // Preserva uma cópia de recuperação antes de adotar a versão do servidor.
  if(engine?.inFlight)await engine.inFlight;
  await cloud.switchProfile(accountProfile||loginProfile,{discardPending:true});
 },
 async sharing(){if(!user)throw Error('Entre na sua conta.');return rpc('nt_sharing_status',undefined,user.id);},
 async createInvite(){if(!user)throw Error('Entre na sua conta.');return rpc('nt_create_partner_invite',undefined,user.id);},
 async previewInvite(code){if(!user)throw Error('Entre na sua conta.');return rpc('nt_preview_partner_invite',{p_code:code},user.id);},
 async acceptInvite(code){if(!user)throw Error('Entre na sua conta.');return rpc('nt_accept_partner_invite',{p_code:code},user.id);},
 async cancelInvite(){if(!user)throw Error('Entre na sua conta.');return rpc('nt_cancel_partner_invite',undefined,user.id);},
 async stopSharing(){if(!user)throw Error('Entre na sua conta.');if(accountProfile!==loginProfile)await cloud.switchProfile(loginProfile);return rpc('nt_stop_sharing',undefined,user.id);},
 async readPartner(){if(!user)throw Error('Entre na sua conta.');const value=await rpc('nt_read_partner',undefined,user.id);if(value)validateState({sessions:value.sessions},value.profile);return value;},
 async logout(){
  const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;
  authSession=null;reset();
 }
};
globalThis.NossoCloud=cloud;
window.addEventListener('online',()=>cloud.retry().catch(()=>{}));
window.addEventListener('focus',()=>cloud.retry().catch(()=>{}));
