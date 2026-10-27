-- Nosso Treino: catálogo público e registros privados por usuário.
-- Executar uma vez. Migração transacional: falhas não deixam estrutura parcial.
begin;
create table public.nt_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(display_name in ('Caio','Nicolli')),
 revision bigint not null default 0,
 preferences jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table public.nt_exercises (id text primary key, name text not null, metric text not null check(metric in ('weight','seconds','reps')));
create table public.nt_workouts (id text primary key check(id in ('A','B','C')), name text not null);
create table public.nt_workout_exercises (
 workout_id text references public.nt_workouts(id), exercise_id text references public.nt_exercises(id),
 position smallint not null check(position between 1 and 6), sets smallint not null default 2 check(sets=2), target text not null,
 primary key(workout_id,exercise_id), unique(workout_id,position)
);
create table public.nt_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.nt_profiles(user_id) on delete cascade,
 local_key text not null, workout_id text not null references public.nt_workouts(id), workout_date date not null,
 saved_at timestamptz, updated_at timestamptz not null default now(), deleted_at timestamptz,
 unique(user_id,local_key), unique(id,user_id)
);
create index nt_sessions_user_date on public.nt_sessions(user_id,workout_date);
create table public.nt_sets (
 session_id uuid not null, user_id uuid not null,
 exercise_id text not null references public.nt_exercises(id), set_index smallint not null check(set_index between 0 and 1),
 weight numeric check(weight between 0 and 999), reps integer check(reps between 0 and 999), done boolean not null default false,
 primary key(session_id,exercise_id,set_index),
 foreign key(session_id,user_id) references public.nt_sessions(id,user_id) on delete cascade
);
alter table public.nt_profiles enable row level security;
alter table public.nt_exercises enable row level security;
alter table public.nt_workouts enable row level security;
alter table public.nt_workout_exercises enable row level security;
alter table public.nt_sessions enable row level security;
alter table public.nt_sets enable row level security;
create policy own_profile on public.nt_profiles for select to authenticated using(user_id=(select auth.uid()));
create policy own_sessions on public.nt_sessions for select to authenticated using(user_id=(select auth.uid()));
create policy own_sets on public.nt_sets for select to authenticated using(user_id=(select auth.uid()));
create policy catalog_exercises on public.nt_exercises for select to anon,authenticated using(true);
create policy catalog_workouts on public.nt_workouts for select to anon,authenticated using(true);
create policy catalog_plan on public.nt_workout_exercises for select to anon,authenticated using(true);
revoke all on public.nt_profiles,public.nt_sessions,public.nt_sets from anon,authenticated;
grant select on public.nt_profiles,public.nt_sessions,public.nt_sets to authenticated;
revoke all on public.nt_exercises,public.nt_workouts,public.nt_workout_exercises from anon,authenticated;
grant select on public.nt_exercises,public.nt_workouts,public.nt_workout_exercises to anon,authenticated;

create function public.nt_open_account(p_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 if p_name not in ('Caio','Nicolli') or p_name is null then raise exception 'INVALID_PROFILE'; end if;
 insert into public.nt_profiles(user_id,display_name) values(v_uid,p_name) on conflict(user_id) do nothing;
 return public.nt_read_state();
end $$;

create function public.nt_read_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_profile public.nt_profiles; v_sessions jsonb;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 select * into strict v_profile from public.nt_profiles where user_id=v_uid;
 select coalesce(jsonb_object_agg(s.local_key,jsonb_build_object(
 'profile',v_profile.display_name,'date',s.workout_date::text,'workout',s.workout_id,'savedAt',s.saved_at,'updatedAt',s.updated_at,
 'sets',coalesce((select jsonb_object_agg(t.exercise_id||':'||t.set_index,jsonb_build_object('weight',coalesce(t.weight::text,''),'reps',coalesce(t.reps::text,''),'done',t.done)) from public.nt_sets t where t.session_id=s.id and t.user_id=v_uid),'{}'::jsonb))), '{}')
 into v_sessions from public.nt_sessions s where s.user_id=v_uid and s.deleted_at is null;
 return jsonb_build_object('revision',v_profile.revision,'profile',v_profile.display_name,'state',v_profile.preferences||jsonb_build_object('sessions',v_sessions));
end $$;

-- A revisão esperada impede sobrescrita silenciosa entre aparelhos.
create function public.nt_write_state(p_state jsonb,p_revision bigint) returns bigint language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_profile public.nt_profiles; v_key text; v_session jsonb; v_id uuid; v_setkey text; v_set jsonb; v_exercise text; v_index int; v_reps numeric; v_weight numeric;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 select * into strict v_profile from public.nt_profiles where user_id=v_uid for update;
 if p_revision is distinct from v_profile.revision then raise exception 'SYNC_CONFLICT' using errcode='40001'; end if;
 if p_state is null or jsonb_typeof(p_state->'sessions') is distinct from 'object' or octet_length(p_state::text)>5000000 then raise exception 'INVALID_STATE'; end if;
 for v_key,v_session in select * from jsonb_each(p_state->'sessions') loop
  if v_session->>'profile' is distinct from v_profile.display_name
   or v_session->>'workout' is null or v_session->>'workout' not in ('A','B','C')
   or coalesce(v_session->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
   or v_key !~ ('^'||v_profile.display_name||':'||(v_session->>'date')||':'||(v_session->>'workout')||'(:[1-9][0-9]*)?$')
   or jsonb_typeof(v_session->'sets') is distinct from 'object' then raise exception 'INVALID_SESSION'; end if;
  insert into public.nt_sessions(user_id,local_key,workout_id,workout_date,saved_at)
   values(v_uid,v_key,v_session->>'workout',(v_session->>'date')::date,(v_session->>'savedAt')::timestamptz)
   on conflict(user_id,local_key) do update set workout_id=excluded.workout_id,workout_date=excluded.workout_date,saved_at=excluded.saved_at,updated_at=now(),deleted_at=null returning id into v_id;
  delete from public.nt_sets where session_id=v_id and user_id=v_uid;
  for v_setkey,v_set in select * from jsonb_each(v_session->'sets') loop
   if v_setkey !~ '^[a-z0-9-]+:[01]$' or jsonb_typeof(v_set->'done') is distinct from 'boolean' then raise exception 'INVALID_SET'; end if;
   v_exercise:=split_part(v_setkey,':',1);v_index:=split_part(v_setkey,':',2)::int;
   if not exists(select 1 from public.nt_workout_exercises where workout_id=v_session->>'workout' and exercise_id=v_exercise) then raise exception 'INVALID_EXERCISE'; end if;
   v_reps:=nullif(v_set->>'reps','')::numeric;v_weight:=nullif(v_set->>'weight','')::numeric;
   if (v_reps is not null and (v_reps<0 or v_reps>999 or v_reps<>trunc(v_reps))) or (v_weight is not null and (v_weight<0 or v_weight>999)) then raise exception 'INVALID_VALUE'; end if;
   insert into public.nt_sets values(v_id,v_uid,v_exercise,v_index,v_weight,v_reps,(v_set->>'done')::boolean);
  end loop;
 end loop;
 update public.nt_sessions set deleted_at=now(),updated_at=now() where user_id=v_uid and deleted_at is null and not (p_state->'sessions' ? local_key);
 update public.nt_profiles set revision=revision+1,preferences=p_state-'sessions' where user_id=v_uid returning revision into p_revision;
 return p_revision;
end $$;
revoke all on function public.nt_open_account(text),public.nt_read_state(),public.nt_write_state(jsonb,bigint) from public,anon;
grant execute on function public.nt_open_account(text),public.nt_read_state(),public.nt_write_state(jsonb,bigint) to authenticated;

insert into public.nt_workouts values('A','Superiores');
insert into public.nt_exercises values('supino-maquina','Supino máquina','weight');
insert into public.nt_workout_exercises values('A','supino-maquina',1,2,'10–12');
insert into public.nt_exercises values('puxada-frontal','Puxada frontal','weight');
insert into public.nt_workout_exercises values('A','puxada-frontal',2,2,'10–12');
insert into public.nt_exercises values('remada-baixa','Remada baixa','weight');
insert into public.nt_workout_exercises values('A','remada-baixa',3,2,'10–12');
insert into public.nt_exercises values('desenvolvimento-maquina','Desenvolvimento máquina','weight');
insert into public.nt_workout_exercises values('A','desenvolvimento-maquina',4,2,'10–12');
insert into public.nt_exercises values('triceps-polia','Tríceps polia','weight');
insert into public.nt_workout_exercises values('A','triceps-polia',5,2,'10–12');
insert into public.nt_exercises values('rosca-halteres','Rosca halteres','weight');
insert into public.nt_workout_exercises values('A','rosca-halteres',6,2,'10–12');
insert into public.nt_workouts values('B','Pernas e glúteos');
insert into public.nt_exercises values('leg-press','Leg press 45°','weight');
insert into public.nt_workout_exercises values('B','leg-press',1,2,'10–12');
insert into public.nt_exercises values('elevacao-pelvica','Elevação pélvica','weight');
insert into public.nt_workout_exercises values('B','elevacao-pelvica',2,2,'10–12');
insert into public.nt_exercises values('mesa-flexora','Mesa flexora','weight');
insert into public.nt_workout_exercises values('B','mesa-flexora',3,2,'10–12');
insert into public.nt_exercises values('cadeira-extensora','Cadeira extensora','weight');
insert into public.nt_workout_exercises values('B','cadeira-extensora',4,2,'10–12');
insert into public.nt_exercises values('panturrilha-sentado','Panturrilha sentado','weight');
insert into public.nt_workout_exercises values('B','panturrilha-sentado',5,2,'12–15');
insert into public.nt_exercises values('prancha','Prancha','seconds');
insert into public.nt_workout_exercises values('B','prancha',6,2,'20–30 segundos');
insert into public.nt_workouts values('C','Corpo inteiro');
insert into public.nt_exercises values('agachamento-halter','Agachamento com halter','weight');
insert into public.nt_workout_exercises values('C','agachamento-halter',1,2,'10–12');
insert into public.nt_exercises values('remada-articulada','Remada articulada','weight');
insert into public.nt_workout_exercises values('C','remada-articulada',2,2,'10–12');
insert into public.nt_exercises values('supino-inclinado','Supino inclinado','weight');
insert into public.nt_workout_exercises values('C','supino-inclinado',3,2,'10–12');
insert into public.nt_exercises values('cadeira-abdutora','Cadeira abdutora','weight');
insert into public.nt_workout_exercises values('C','cadeira-abdutora',4,2,'12–15');
insert into public.nt_exercises values('terra-romeno','Levantamento terra romeno com halteres','weight');
insert into public.nt_workout_exercises values('C','terra-romeno',5,2,'8–10');
insert into public.nt_exercises values('dead-bug','Dead bug','reps');
insert into public.nt_workout_exercises values('C','dead-bug',6,2,'8–10 por lado');

commit;
