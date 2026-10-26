-- Phase 6: only the database operator can provision memberships/organizers.
-- No public role signup or browser service credential is introduced.
alter table public.institution_memberships drop constraint privileged_roles_unavailable;
alter table public.institution_memberships add constraint administrator_role_unavailable check (role in ('student','organizer'));

create table public.audit_log (
 id bigint generated always as identity primary key,
 institution_id uuid references public.institutions(id) on delete set null,
 actor_user_id uuid references auth.users(id) on delete set null,
 database_actor text not null default session_user,
 operator_label text,
 action text not null,
 subject_id uuid not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from public,anon,authenticated,service_role;
revoke all on sequence public.audit_log_id_seq from public,anon,authenticated,service_role;

create function campuspass_private.audit_membership() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; label text := nullif(current_setting('campuspass.operator',true),'');
begin
 if tg_op <> 'INSERT' then before_row := to_jsonb(old); end if;
 if tg_op <> 'DELETE' then after_row := to_jsonb(new); end if;
 insert into public.audit_log(institution_id,actor_user_id,operator_label,action,subject_id,details)
 values (coalesce(new.institution_id,old.institution_id),
 case when label is null then campuspass_private.current_student_id() else null end,label,
 case when after_row->>'role'='organizer' and after_row->>'status'='active' and
   (before_row is null or before_row->>'role' is distinct from 'organizer' or before_row->>'status' is distinct from 'active') then 'organizer_granted'
 when before_row->>'role'='organizer' and (after_row is null or after_row->>'role' is distinct from 'organizer' or after_row->>'status' is distinct from 'active') then 'organizer_revoked'
 else 'membership_changed' end,
 coalesce(new.user_id,old.user_id),
 jsonb_build_object('old_role',before_row->>'role','new_role',after_row->>'role',
 'old_status',before_row->>'status','new_status',after_row->>'status',
 'old_expires_at',before_row->>'expires_at','new_expires_at',after_row->>'expires_at',
 'reason',nullif(current_setting('campuspass.reason',true),'')));
 return coalesce(new,old);
end $$;
revoke all on function campuspass_private.audit_membership() from public,anon,authenticated,service_role;
create trigger membership_audit after insert or update or delete on public.institution_memberships
 for each row execute function campuspass_private.audit_membership();

-- Clear stale reservations before another approved student claims a PRN. The
-- institution advisory lock serializes competing reconciliation/claim attempts.
-- No privileges are ever derived from the cached profile association.
create function campuspass_private.reconcile_institution(p_institution uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_institution is null then return; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_institution::text, 6));
 update public.student_profiles p set institution_id=null
 where p.institution_id=p_institution and not exists (
  select 1 from public.institution_memberships m join public.institutions i on i.id=m.institution_id
  where m.user_id=p.user_id and m.institution_id=p_institution and m.status='active'
  and (m.expires_at is null or m.expires_at>clock_timestamp()) and i.is_active
 );
end $$;
revoke all on function campuspass_private.reconcile_institution(uuid) from public,anon,authenticated,service_role;

create function campuspass_private.provision_membership(
 p_user_id uuid,p_institution_id uuid,p_role public.account_role,p_status public.membership_status,
 p_expires_at timestamptz,p_operator text,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if p_role not in ('student','organizer') or char_length(btrim(p_operator)) not between 2 and 120
 or char_length(btrim(p_reason)) not between 8 and 500 or p_operator is null or p_reason is null
 or p_role is null or p_status is null then
   raise exception 'An operator label, meaningful reason and supported role/status are required' using errcode='23514';
 end if;
 if p_status='active' and p_expires_at<=clock_timestamp() then
   raise exception 'Active membership expiry must be in the future' using errcode='23514'; end if;
 if not exists(select 1 from auth.users where id=p_user_id and deleted_at is null and not coalesce(is_anonymous,false)) then
   raise exception 'A registered account is required' using errcode='23514'; end if;
 if not exists(select 1 from public.institutions where id=p_institution_id and (p_status<>'active' or is_active)) then
   raise exception 'An active institution is required' using errcode='23514'; end if;
 if p_role='organizer' and not exists(select 1 from public.student_profiles where user_id=p_user_id) then
   raise exception 'Create the student profile before granting organizer access' using errcode='23514'; end if;
 perform set_config('campuspass.operator',btrim(p_operator),true);
 perform set_config('campuspass.reason',btrim(p_reason),true);
 perform campuspass_private.reconcile_institution(p_institution_id);
 -- Expired active rows must not block a trusted transfer to another institution.
 update public.institution_memberships m set status='revoked',revoked_at=clock_timestamp()
 where m.user_id=p_user_id and m.status='active' and (m.expires_at<=clock_timestamp()
 or not exists(select 1 from public.institutions i where i.id=m.institution_id and i.is_active));
 insert into public.institution_memberships(user_id,institution_id,role,status,approved_at,revoked_at,expires_at)
 values(p_user_id,p_institution_id,p_role,p_status,
 case when p_status='active' then clock_timestamp() end,
 case when p_status='revoked' then clock_timestamp() end,p_expires_at)
 on conflict(user_id,institution_id) do update set role=excluded.role,status=excluded.status,
 approved_at=excluded.approved_at,revoked_at=excluded.revoked_at,expires_at=excluded.expires_at
 returning id into result;
 return result;
end $$;
-- Only the owning database operator can execute this private function. A
-- deployment DBA may explicitly grant it to a dedicated trusted operator role.
revoke all on function campuspass_private.provision_membership(uuid,uuid,public.account_role,public.membership_status,timestamptz,text,text) from public,anon,authenticated,service_role;

create or replace function public.save_student_profile(p_display_name text,p_prn text,p_department public.student_department,p_academic_year public.academic_year) returns jsonb
language plpgsql security definer set search_path='' as $$
declare student_id uuid := campuspass_private.current_student_id(); approved_institution uuid;
begin
 if student_id is null then raise exception 'A current authenticated student session is required' using errcode='42501'; end if;
 select m.institution_id into approved_institution from public.institution_memberships m
 join public.institutions i on i.id=m.institution_id and i.is_active
 where m.user_id=student_id and m.status='active' and (m.expires_at is null or m.expires_at>clock_timestamp());
 perform campuspass_private.reconcile_institution(approved_institution);
 perform 1 from auth.users where id=student_id for update;
 -- Recheck after waiting for membership changes; the first read only chose the
 -- reconciliation scope, never authorizes the persisted association.
 select m.institution_id into approved_institution from public.institution_memberships m
 join public.institutions i on i.id=m.institution_id and i.is_active
 where m.user_id=student_id and m.status='active' and (m.expires_at is null or m.expires_at>clock_timestamp()) for share of i;
 insert into public.student_profiles(user_id,display_name,prn,department,academic_year,institution_id)
 values(student_id,btrim(p_display_name),btrim(p_prn),p_department,p_academic_year,approved_institution)
 on conflict(user_id) do update set display_name=excluded.display_name,prn=excluded.prn,
 department=excluded.department,academic_year=excluded.academic_year,institution_id=excluded.institution_id;
 return public.get_student_account();
end $$;
