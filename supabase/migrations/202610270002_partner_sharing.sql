-- Compartilhamento bilateral por convite; leitura do parceiro, edição só do próprio dono.
begin;
create table public.nt_partner_invites (
 user_id uuid primary key references public.nt_profiles(user_id) on delete cascade,
 code_hash text not null unique,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create table public.nt_partner_memberships (
 user_id uuid primary key references public.nt_profiles(user_id) on delete cascade,
 partner_user_id uuid not null unique references public.nt_profiles(user_id) on delete cascade,
 accepted_at timestamptz not null default now(),
 check(user_id<>partner_user_id)
);
alter table public.nt_partner_invites enable row level security;
alter table public.nt_partner_memberships enable row level security;
revoke all on public.nt_partner_invites,public.nt_partner_memberships from anon,authenticated;
grant select on public.nt_partner_invites,public.nt_partner_memberships to authenticated;
create policy own_invitation on public.nt_partner_invites for select to authenticated using(user_id=(select auth.uid()));
create policy own_membership on public.nt_partner_memberships for select to authenticated using(user_id=(select auth.uid()));

create function public.nt_sharing_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_partner uuid; v_name text; v_expires timestamptz;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 select m.partner_user_id,p.display_name into v_partner,v_name from public.nt_partner_memberships m join public.nt_profiles p on p.user_id=m.partner_user_id where m.user_id=v_uid;
 select expires_at into v_expires from public.nt_partner_invites where user_id=v_uid and expires_at>now();
 return jsonb_build_object('linked',v_partner is not null,'partnerName',v_name,'inviteExpiresAt',v_expires);
end $$;

create function public.nt_create_partner_invite() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_code text:=replace(gen_random_uuid()::text,'-',''); v_expires timestamptz:=now()+interval '24 hours';
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 perform 1 from public.nt_profiles where user_id=v_uid for update;
 if not found then raise exception 'PROFILE_REQUIRED'; end if;
 if exists(select 1 from public.nt_partner_memberships where user_id=v_uid) then raise exception 'ALREADY_LINKED'; end if;
 insert into public.nt_partner_invites(user_id,code_hash,expires_at) values(v_uid,encode(sha256(convert_to(v_code,'UTF8')),'hex'),v_expires)
 on conflict(user_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at,created_at=now();
 return jsonb_build_object('code',v_code,'expiresAt',v_expires);
end $$;

create function public.nt_preview_partner_invite(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_invite public.nt_partner_invites; v_name text;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 if p_code is null or p_code!~'^[a-f0-9]{32}$' then raise exception 'INVALID_INVITE'; end if;
 select * into v_invite from public.nt_partner_invites where code_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex') and expires_at>now();
 if not found then raise exception 'INVALID_INVITE'; end if;
 if v_invite.user_id=v_uid then raise exception 'OWN_INVITE'; end if;
 select display_name into v_name from public.nt_profiles where user_id=v_invite.user_id;
 return jsonb_build_object('name',v_name,'expiresAt',v_invite.expires_at);
end $$;

create function public.nt_accept_partner_invite(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_inviter uuid; v_expires timestamptz;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 if p_code is null or p_code!~'^[a-f0-9]{32}$' then raise exception 'INVALID_INVITE'; end if;
 select user_id into v_inviter from public.nt_partner_invites where code_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex');
 if v_inviter is null then raise exception 'INVALID_INVITE'; end if;
 if v_inviter=v_uid then raise exception 'OWN_INVITE'; end if;
 -- Ordem de bloqueio consistente entre aceite, criação e revogação.
 perform 1 from public.nt_profiles where user_id in(v_uid,v_inviter) order by user_id for update;
 if not exists(select 1 from public.nt_profiles where user_id=v_uid) then raise exception 'PROFILE_REQUIRED'; end if;
 select expires_at into v_expires from public.nt_partner_invites where user_id=v_inviter and code_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex') for update;
 if v_expires is null or v_expires<=now() then raise exception 'INVALID_INVITE'; end if;
 if exists(select 1 from public.nt_partner_memberships where user_id in(v_uid,v_inviter)) then raise exception 'ALREADY_LINKED'; end if;
 insert into public.nt_partner_memberships(user_id,partner_user_id) values(v_uid,v_inviter),(v_inviter,v_uid);
 delete from public.nt_partner_invites where user_id in(v_uid,v_inviter);
 return public.nt_sharing_status();
end $$;

create function public.nt_cancel_partner_invite() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 delete from public.nt_partner_invites where user_id=auth.uid();
end $$;

create function public.nt_stop_sharing() returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_partner uuid;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 select partner_user_id into v_partner from public.nt_partner_memberships where user_id=v_uid;
 perform 1 from public.nt_profiles where user_id in(v_uid,v_partner) order by user_id for update;
 delete from public.nt_partner_memberships where user_id=v_uid or partner_user_id=v_uid;
 delete from public.nt_partner_invites where user_id=v_uid;
end $$;

create function public.nt_read_partner() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_partner uuid;v_name text;v_sessions jsonb;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 select m.partner_user_id,p.display_name into v_partner,v_name from public.nt_partner_memberships m join public.nt_profiles p on p.user_id=m.partner_user_id where m.user_id=v_uid;
 if v_partner is null then return null; end if;
 select coalesce(jsonb_object_agg(s.local_key,jsonb_build_object(
 'profile',v_name,'date',s.workout_date::text,'workout',s.workout_id,'savedAt',s.saved_at,'updatedAt',s.updated_at,
 'sets',coalesce((select jsonb_object_agg(t.exercise_id||':'||t.set_index,jsonb_build_object('weight',coalesce(t.weight::text,''),'reps',coalesce(t.reps::text,''),'done',t.done)) from public.nt_sets t where t.session_id=s.id and t.user_id=v_partner),'{}'::jsonb))), '{}')
 into v_sessions from public.nt_sessions s where s.user_id=v_partner and s.deleted_at is null;
 return jsonb_build_object('profile',v_name,'sessions',v_sessions,'fetchedAt',now());
end $$;

revoke all on function public.nt_sharing_status(),public.nt_create_partner_invite(),public.nt_preview_partner_invite(text),public.nt_accept_partner_invite(text),public.nt_cancel_partner_invite(),public.nt_stop_sharing(),public.nt_read_partner() from public,anon;
grant execute on function public.nt_sharing_status(),public.nt_create_partner_invite(),public.nt_preview_partner_invite(text),public.nt_accept_partner_invite(text),public.nt_cancel_partner_invite(),public.nt_stop_sharing(),public.nt_read_partner() to authenticated;
commit;
