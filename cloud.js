import {createClient} from '@supabase/supabase-js';
import {SyncEngine} from './sync-engine.js';
import {supabaseConfig} from './supabase-config.js';
import {validateBackup} from './store.js';

const client=createClient(supabaseConfig.url,supabaseConfig.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const messages={pending:'Salvo neste dispositivo · aguardando envio',syncing:'Sincronizando…',synced:'Sincronizado · confirmado pelo servidor',error:'Salvo neste dispositivo · envio pendente, tente novamente',conflict:'Há alterações em outro aparelho. Abra Conta para resolver.'};
let callbacks={}, engine=null, user=null, accountProfile=null, timer=null, epoch=0, authSession=null;
let notice='Modo local · sem sincronização',busy=false,releaseLock=null;
async function claimWorkspace(owner){
 if(!navigator.locks)throw Error('Use um navegador atualizado com suporte a sessões seguras.');
 let resolve;const acquired=new Promise(done=>resolve=done);
 navigator.locks.request('nosso-treino:sync:'+owner,{ifAvailable:true},async lock=>{if(!lock){resolve(false);return;}await new Promise(done=>{releaseLock=done;resolve(true);});}).catch(()=>resolve(false));
 if(!await acquired)throw Error('Esta conta já está aberta em outra aba. Feche a outra aba antes de continuar.');
}
function releaseWorkspace(){releaseLock?.();releaseLock=null;}
function announce(code){notice=messages[code]||code;callbacks.status?.(notice,['error','conflict'].includes(code));}
function validateState(state,name){
 validateBackup({version:1,sessions:state.sessions});
 if(Object.values(state.sessions).some(s=>s.profile!==name))throw Error('O backup contém registros de outro perfil. Importe apenas os registros da sua conta.');
 return state;
}
async function rpc(name,args,expectedOwner){
 const {data:auth,error:authError}=await client.auth.getSession();if(authError)throw authError;
 const session=auth.session;if(!session||expectedOwner&&session.user.id!==expectedOwner)throw Error('A conta mudou. Entre novamente.');
 const {data,error}=await client.rpc(name,args).setHeader('Authorization','Bearer '+session.access_token);if(error)throw error;return data;
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>engine?.flush(),700);}
function reset(){epoch++;busy=false;releaseWorkspace();clearTimeout(timer);engine?.close();engine=null;user=null;accountProfile=null;notice='Modo local · sem sincronização';callbacks.workspace?.(null);announce(notice);}
async function activate(session,name){
 const token=++epoch;busy=true;authSession=session;
 engine?.close();releaseWorkspace();engine=null;user=null;accountProfile=null;callbacks.workspace?.(null);
 announce('Carregando sua conta…');
 try {
  await claimWorkspace(session.user.id);
  const remote=await rpc('nt_open_account',{p_name:['Caio','Nicolli'].includes(name)?name:'Caio'},session.user.id);
  if(token!==epoch)return;
  validateState(remote.state,remote.profile);
  const candidate=new SyncEngine({owner:session.user.id,remote,storage:localStorage,writeRemote:(state,revision)=>rpc('nt_write_state',{p_state:state,p_revision:revision},session.user.id),onStatus:announce});
  validateState(candidate.state,remote.profile);
  engine=candidate;user=session.user;accountProfile=remote.profile;
  callbacks.workspace?.({owner:user.id,profile:accountProfile,state:structuredClone(engine.state)});
  announce(engine.conflict?'conflict':engine.pending?'pending':'synced');
  if(engine.pending&&!engine.conflict)schedule();
 } catch(error){if(token===epoch){releaseWorkspace();announce('Não foi possível abrir a conta. '+friendly(error));throw error;}}
 finally{if(token===epoch)busy=false;}
}
function friendly(error){
 if(error.message?.includes('Invalid login credentials'))return 'Confira seu e-mail e senha.';
 if(error.message?.includes('Email not confirmed'))return 'Confirme seu e-mail antes de entrar.';
 if(error.message?.includes('Failed to fetch'))return 'Não foi possível conectar. Verifique sua internet.';
 if(error.message?.includes('rate limit'))return 'Muitas tentativas. Aguarde alguns minutos.';
 return error.message||'Tente novamente.';
}
const cloud={
 get active(){return Boolean(engine);},get busy(){return busy;},get profile(){return accountProfile;},get email(){return user?.email||authSession?.user?.email||'';},
 get hasSession(){return Boolean(authSession);},get pending(){return Boolean(engine?.pending);},get conflict(){return Boolean(engine?.conflict);},get notice(){return notice;},friendly,
 async start(options){callbacks=options;busy=true;
  client.auth.onAuthStateChange((event,session)=>{
   if(event==='SIGNED_OUT'){authSession=null;reset();}
   else if(event==='SIGNED_IN'&&!busy&&session?.user.id!==authSession?.user?.id){setTimeout(()=>activate(session,session.user.user_metadata?.display_name).catch(()=>{}),0);}
  });
  const {data,error}=await client.auth.getSession();if(error){busy=false;announce('Sessão indisponível. Entre novamente.');return;}
  try{if(data.session&&!authSession)await activate(data.session,data.session.user.user_metadata?.display_name);}finally{busy=false;}
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
 save(state){if(!engine)throw Error('Sua conta está desconectada.');validateState(state,accountProfile);engine.queue(state);schedule();},
 async retry(){if(!engine&&authSession)return activate(authSession,authSession.user.user_metadata?.display_name);await engine?.flush();},
 async refresh(){
  if(!authSession)throw Error('Entre na sua conta.');
  // Preserva uma cópia de recuperação antes de adotar a versão do servidor.
  if(engine?.pending)localStorage.setItem(engine.key+':recovery:'+Date.now(),JSON.stringify(engine.state));
  if(engine?.inFlight)await engine.inFlight;
  const remote=await rpc('nt_read_state',undefined,authSession.user.id);validateState(remote.state,accountProfile);
  if(engine)localStorage.removeItem(engine.key);
  await activate(authSession,remote.profile);
 },
 async logout(){
  const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;
  authSession=null;reset();
 }
};
globalThis.NossoCloud=cloud;
window.addEventListener('online',()=>engine?.flush());
