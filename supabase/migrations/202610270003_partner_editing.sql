-- Edição bilateral para contas vinculadas. Execute após as migrações 001 e 002.
begin;
create function public.nt_profile_target(p_profile text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_target uuid;
begin
 if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 select user_id into v_target from public.nt_profiles where user_id=v_actor and display_name=p_profile;
 if v_target is not null then return v_target; end if;
 select p.user_id into v_target from public.nt_partner_memberships m join public.nt_profiles p on p.user_id=m.partner_user_id
 where m.user_id=v_actor and p.display_name=p_profile and exists(select 1 from public.nt_partner_memberships back where back.user_id=p.user_id and back.partner_user_id=v_actor);
 if v_target is null then raise exception 'PARTNER_ACCESS_REQUIRED' using errcode='42501'; end if;
 -- Mesmo ordenamento usado ao revogar o vínculo; revalida depois de obter os bloqueios.
 perform 1 from public.nt_profiles where user_id in(v_actor,v_target) order by user_id for update;
 if not exists(select 1 from public.nt_partner_memberships where user_id=v_actor and partner_user_id=v_target)
 or not exists(select 1 from public.nt_partner_memberships where user_id=v_target and partner_user_id=v_actor) then raise exception 'PARTNER_ACCESS_REQUIRED' using errcode='42501'; end if;
 return v_target;
end $$;
create function public.nt_read_profile(p_profile text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=public.nt_profile_target(p_profile); v_profile public.nt_profiles; v_sessions jsonb;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 select * into strict v_profile from public.nt_profiles where user_id=v_uid;
 select coalesce(jsonb_object_agg(s.local_key,jsonb_build_object(
 'profile',v_profile.display_name,'date',s.workout_date::text,'workout',s.workout_id,'savedAt',s.saved_at,'updatedAt',s.updated_at,
 'sets',coalesce((select jsonb_object_agg(t.exercise_id||':'||t.set_index,jsonb_build_object('weight',coalesce(t.weight::text,''),'reps',coalesce(t.reps::text,''),'done',t.done)) from public.nt_sets t where t.session_id=s.id and t.user_id=v_uid),'{}'::jsonb))), '{}')
 into v_sessions from public.nt_sessions s where s.user_id=v_uid and s.deleted_at is null;
 return jsonb_build_object('owner',v_uid,'revision',v_profile.revision,'profile',v_profile.display_name,'state',v_profile.preferences||jsonb_build_object('sessions',v_sessions));
end $$;

create function public.nt_write_profile(p_profile text,p_owner uuid,p_state jsonb,p_revision bigint) returns bigint language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=public.nt_profile_target(p_profile); v_profile public.nt_profiles; v_key text; v_session jsonb; v_id uuid; v_setkey text; v_set jsonb; v_exercise text; v_index int; v_reps numeric; v_weight numeric;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 if v_uid is distinct from p_owner then raise exception 'PARTNER_ACCESS_REQUIRED' using errcode='42501'; end if;
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
revoke all on function public.nt_profile_target(text),public.nt_read_profile(text),public.nt_write_profile(text,uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.nt_read_profile(text),public.nt_write_profile(text,uuid,jsonb,bigint) to authenticated;
commit;
