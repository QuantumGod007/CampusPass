-- Real account data only. No demo events, registrations, or localStorage imports.
create schema if not exists campuspass_private;
revoke all on schema campuspass_private from public, anon, authenticated;
grant usage on schema campuspass_private to authenticated;

create type public.student_department as enum (
 'Computer Science', 'Information Technology', 'Electronics & Telecommunication',
 'Mechanical Engineering', 'Civil Engineering', 'Business & Management', 'Design & Arts', 'Other'
);
create type public.academic_year as enum ('First year', 'Second year', 'Third year', 'Fourth year');
create type public.membership_status as enum ('pending', 'active', 'revoked');
create type public.account_role as enum ('student', 'organizer', 'admin');

create table public.institutions (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(btrim(name)) between 2 and 160 and name = btrim(name)),
 slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
 public_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(public_metadata) = 'object' and octet_length(public_metadata::text) <= 4096),
 membership_policy text not null default 'trusted_provisioning' check (membership_policy = 'trusted_provisioning'),
 is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.institution_memberships (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 institution_id uuid not null references public.institutions(id) on delete restrict,
 status public.membership_status not null default 'pending',
 role public.account_role not null default 'student',
 -- Future privileged roles exist in the model, but no assignment pathway is
 -- enabled in Phase 5, including through the service API. A reviewed migration
 -- and authenticated administrative workflow are required before enabling them.
 constraint privileged_roles_unavailable check (role = 'student'),
 provisioned_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz, revoked_at timestamptz, expires_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (user_id, institution_id),
 check (status <> 'active' or approved_at is not null),
 check (status <> 'revoked' or revoked_at is not null)
);
create unique index one_active_institution_per_student on public.institution_memberships(user_id) where status = 'active';
create index institution_memberships_institution_idx on public.institution_memberships(institution_id);
create table public.student_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (display_name = btrim(display_name) and char_length(display_name) between 2 and 80
   and char_length(regexp_replace(display_name, '[^[:alpha:]]', '', 'g')) >= 2 and display_name !~ '[[:cntrl:]]'),
 prn text not null check (prn ~ '^[0-9]{12}$'),
 department public.student_department not null,
 academic_year public.academic_year not null,
 institution_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (user_id, institution_id) references public.institution_memberships(user_id, institution_id) on delete restrict,
 constraint institution_prn_unique unique (institution_id, prn)
);
comment on column public.student_profiles.prn is 'Self-declared text, never evidence of enrollment. Uniqueness is claimed only within a trusted institution association; unprovisioned profiles have NULL institution_id.';

-- PostgREST verifies JWT signatures. Checking the backing Auth session also
-- denies revoked tokens before their JWT expiry (and rejects anonymous Auth).
create function campuspass_private.current_student_id() returns uuid
language sql stable security definer set search_path = '' as $$
 select s.user_id from auth.sessions s join auth.users u on u.id = s.user_id
 where s.user_id = (select auth.uid()) and s.id::text = (select auth.jwt()->>'session_id')
 and (select auth.jwt()->>'role') = 'authenticated'
 and case when jsonb_typeof((select auth.jwt()->'exp')) = 'number'
     then ((select auth.jwt()->>'exp'))::numeric > extract(epoch from now()) else false end
 and (s.not_after is null or s.not_after > now())
 and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
 and not coalesce(u.is_anonymous, false)
 limit 1;
$$;
revoke all on function campuspass_private.current_student_id() from public, anon, authenticated;
grant execute on function campuspass_private.current_student_id() to authenticated;

create function campuspass_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
revoke all on function campuspass_private.touch_updated_at() from public, anon, authenticated;
create trigger institutions_updated before update on public.institutions for each row execute function campuspass_private.touch_updated_at();
create trigger memberships_updated before update on public.institution_memberships for each row execute function campuspass_private.touch_updated_at();
create trigger profiles_updated before update on public.student_profiles for each row execute function campuspass_private.touch_updated_at();

-- Serialize profile writes and membership changes on the Auth user row.
-- Student saves read membership through MVCC (without locking that row), so
-- revocation cannot invert the user/membership lock order.
create function campuspass_private.membership_before_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.institution_id <> old.institution_id) then
   raise exception 'Membership identity is immutable' using errcode = '23514';
 end if;
 perform 1 from auth.users where id = case when tg_op = 'DELETE' then old.user_id else new.user_id end for update;
 if tg_op = 'DELETE' then
   update public.student_profiles set institution_id = null where user_id = old.user_id and institution_id = old.institution_id;
   return old;
 end if;
 return new;
end $$;
revoke all on function campuspass_private.membership_before_change() from public, anon, authenticated;
create trigger membership_before_change before insert or update or delete on public.institution_memberships for each row execute function campuspass_private.membership_before_change();

create function campuspass_private.membership_after_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 -- Lock institution state before touching the profile, including when activation races deactivation.
 perform 1 from public.institutions where id = new.institution_id and is_active for share;
 if found and new.status = 'active' and (new.expires_at is null or new.expires_at > now()) then
   update public.student_profiles set institution_id = new.institution_id where user_id = new.user_id;
 else
   update public.student_profiles set institution_id = null where user_id = new.user_id and institution_id = new.institution_id;
 end if;
 return new;
end $$;
revoke all on function campuspass_private.membership_after_change() from public, anon, authenticated;
create trigger membership_after_change after insert or update on public.institution_memberships for each row execute function campuspass_private.membership_after_change();

create function campuspass_private.institution_state_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.is_active is distinct from old.is_active then
   if not new.is_active then
     update public.student_profiles set institution_id = null where institution_id = new.id;
   else
     update public.student_profiles p set institution_id = new.id from public.institution_memberships m
      where m.user_id = p.user_id and m.institution_id = new.id and m.status = 'active'
      and (m.expires_at is null or m.expires_at > now());
   end if;
 end if;
 return new;
end $$;
revoke all on function campuspass_private.institution_state_changed() from public, anon, authenticated;
create trigger institution_state_changed after update of is_active on public.institutions for each row execute function campuspass_private.institution_state_changed();

alter table public.institutions enable row level security;
alter table public.institution_memberships enable row level security;
alter table public.student_profiles enable row level security;
revoke all on public.institutions, public.institution_memberships, public.student_profiles from public, anon, authenticated;
grant select on public.institutions, public.institution_memberships, public.student_profiles to authenticated;
grant all on public.institutions, public.institution_memberships, public.student_profiles to service_role;
create policy own_student_profile on public.student_profiles for select to authenticated
 using (user_id = (select campuspass_private.current_student_id()));
create policy own_institution_memberships on public.institution_memberships for select to authenticated
 using (user_id = (select campuspass_private.current_student_id()));
create policy associated_institution_metadata on public.institutions for select to authenticated
 using (exists (select 1 from public.institution_memberships m where m.institution_id = institutions.id and m.user_id = (select campuspass_private.current_student_id())));

create function public.get_student_account() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare student_id uuid := campuspass_private.current_student_id(); result jsonb; member jsonb;
begin
 if student_id is null then raise exception 'A current authenticated student session is required' using errcode = '42501'; end if;
 select jsonb_build_object('id', m.id, 'institution_id', i.id, 'institution_name', i.name,
   'status', case when not i.is_active then 'inactive' when m.status = 'active' and m.expires_at <= now() then 'expired' else m.status::text end,
   'role', m.role, 'expires_at', m.expires_at)
 into member from public.institution_memberships m join public.institutions i on i.id = m.institution_id
 where m.user_id = student_id order by (m.status = 'active') desc, m.updated_at desc, m.id limit 1;
 select jsonb_build_object('user_id', student_id, 'profile', to_jsonb(p), 'membership', member)
 into result from (select 1) as singleton left join public.student_profiles p on p.user_id = student_id;
 return result;
end $$;
revoke all on function public.get_student_account() from public, anon, authenticated;
grant execute on function public.get_student_account() to authenticated;

create function public.save_student_profile(p_display_name text, p_prn text, p_department public.student_department, p_academic_year public.academic_year) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare student_id uuid := campuspass_private.current_student_id(); approved_institution uuid;
begin
 if student_id is null then raise exception 'A current authenticated student session is required' using errcode = '42501'; end if;
 perform 1 from auth.users where id = student_id for update;
 select m.institution_id into approved_institution from public.institution_memberships m
 join public.institutions i on i.id = m.institution_id and i.is_active
 where m.user_id = student_id and m.status = 'active' and (m.expires_at is null or m.expires_at > now()) for share of i;
 insert into public.student_profiles (user_id, display_name, prn, department, academic_year, institution_id)
 values (student_id, btrim(p_display_name), btrim(p_prn), p_department, p_academic_year, approved_institution)
 on conflict (user_id) do update set display_name = excluded.display_name, prn = excluded.prn,
   department = excluded.department, academic_year = excluded.academic_year, institution_id = excluded.institution_id;
 return public.get_student_account();
end $$;
revoke all on function public.save_student_profile(text,text,public.student_department,public.academic_year) from public, anon, authenticated;
grant execute on function public.save_student_profile(text,text,public.student_department,public.academic_year) to authenticated;
