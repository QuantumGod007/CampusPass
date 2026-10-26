-- Online admission only. A booking reference is never a credential.
create extension if not exists pgcrypto with schema extensions;
create unique index bookings_id_event on public.bookings(id,event_id);
create table public.admission_tokens (
 booking_id uuid primary key,
 event_id uuid not null,
 token_hash bytea not null unique check(octet_length(token_hash)=32),
 event_revision integer not null,
 issued_at timestamptz not null,
 expires_at timestamptz not null check(expires_at>issued_at and expires_at<=issued_at+interval '90 seconds'),
 consumed_at timestamptz,
 foreign key(booking_id,event_id) references public.bookings(id,event_id) on delete restrict
);
create table public.event_checkins (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null unique,
 event_id uuid not null,
 organizer_id uuid not null references auth.users(id) on delete restrict,
 checked_in_at timestamptz not null default clock_timestamp(),
 foreign key(booking_id,event_id) references public.bookings(id,event_id) on delete restrict
);
create index event_checkins_history on public.event_checkins(event_id,checked_in_at desc,id);
create table public.admission_rate_limits (
 actor_id uuid not null references auth.users(id) on delete cascade,
 operation text not null check(operation in ('issue','scan')),
 minute timestamptz not null,
 attempts integer not null check(attempts>0),
 primary key(actor_id,operation,minute)
);
alter table public.admission_tokens enable row level security;
alter table public.admission_tokens force row level security;
alter table public.event_checkins enable row level security;
alter table public.event_checkins force row level security;
alter table public.admission_rate_limits enable row level security;
alter table public.admission_rate_limits force row level security;
-- No raw token hashes, user IDs, counters or audit rows exposed to API roles.
revoke all on public.admission_tokens,public.event_checkins,public.admission_rate_limits from public,anon,authenticated,service_role;

create function campuspass_private.immutable_checkin() returns trigger
language plpgsql set search_path='' as $$ begin
 raise exception 'Check-in history is immutable' using errcode='23514';
end $$;
create trigger immutable_checkin before update on public.event_checkins for each row execute function campuspass_private.immutable_checkin();
revoke all on function campuspass_private.immutable_checkin() from public,anon,authenticated,service_role;

-- Event -> booking -> current Auth/access rows is the same order as seat writes.
-- Holding these locks makes cancellation/revocation linearize with admission.
create function campuspass_private.admission_actor(p_institution uuid,p_organizer boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid; valid uuid;
begin
 actor:=campuspass_private.require_member(p_institution,p_organizer);
 select s.user_id into valid from auth.sessions s join auth.users u on u.id=s.user_id
 where s.user_id=actor and s.id::text=(auth.jwt()->>'session_id')
 and (s.not_after is null or s.not_after>clock_timestamp())
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
 and not coalesce(u.is_anonymous,false) for share of s,u;
 if valid is null or (auth.jwt()->>'exp')::numeric<=extract(epoch from clock_timestamp())
 or campuspass_private.current_student_id() is distinct from actor then
 raise exception 'Current session required' using errcode='42501'; end if;
 -- Expiry can pass while waiting for locks. Recheck the locked membership.
 if not exists(select 1 from public.institution_memberships m join public.institutions i on i.id=m.institution_id
 where m.user_id=actor and m.institution_id=p_institution and m.status='active' and i.is_active
 and (m.expires_at is null or m.expires_at>clock_timestamp()) and (not p_organizer or m.role='organizer')) then
 raise exception 'Active membership required' using errcode='P1002'; end if;
 return actor;
end $$;
revoke all on function campuspass_private.admission_actor(uuid,boolean) from public,anon,authenticated,service_role;

create function campuspass_private.admission_student(p_student uuid,p_institution uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare eligible uuid;
begin
 select m.user_id into eligible from public.institution_memberships m join auth.users u on u.id=m.user_id
 where m.user_id=p_student and m.institution_id=p_institution and m.status='active'
 and (m.expires_at is null or m.expires_at>clock_timestamp())
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
 and not coalesce(u.is_anonymous,false) for share of m,u;
 return eligible is not null and exists(select 1 from public.institution_memberships m
 where m.user_id=p_student and m.institution_id=p_institution and m.status='active'
 and (m.expires_at is null or m.expires_at>clock_timestamp()));
end $$;
revoke all on function campuspass_private.admission_student(uuid,uuid) from public,anon,authenticated,service_role;

create function campuspass_private.admission_limit(p_actor uuid,p_operation text) returns boolean
language plpgsql security definer set search_path='' as $$
declare attempts integer; bucket timestamptz:=date_trunc('minute',clock_timestamp());
begin
 delete from public.admission_rate_limits where actor_id=p_actor and minute<bucket-interval '2 minutes';
 insert into public.admission_rate_limits as r(actor_id,operation,minute,attempts) values(p_actor,p_operation,bucket,1)
 on conflict(actor_id,operation,minute) do update set attempts=least(r.attempts+1,1000000) returning r.attempts into attempts;
 return attempts<=case when p_operation='issue' then 20 else 120 end;
end $$;
revoke all on function campuspass_private.admission_limit(uuid,text) from public,anon,authenticated,service_role;

create function public.get_campus_pass(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=campuspass_private.current_student_id(); b public.bookings; e public.events; admitted timestamptz; as_of timestamptz;
begin
 if actor is null then raise exception 'Current session required' using errcode='42501'; end if;
 select * into b from public.bookings where id=p_booking_id and student_id=actor;
 if not found then raise exception 'Booking unavailable' using errcode='P1008'; end if;
 select * into e from public.events where id=b.event_id for share;
 select * into b from public.bookings where id=p_booking_id and student_id=actor for share;
 perform campuspass_private.admission_actor(e.institution_id,false);
 select checked_in_at into admitted from public.event_checkins where booking_id=b.id;
 as_of:=clock_timestamp();
 return jsonb_build_object('booking_id',b.id,'checked_in_at',admitted,'server_now',as_of,
 'opens_at',e.starts_at-interval '30 minutes','closes_at',e.ends_at,
 'eligible',admitted is null and b.status='confirmed' and e.status='published'
 and as_of>=e.starts_at-interval '30 minutes' and as_of<e.ends_at);
end $$;

create function public.issue_campus_pass(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=campuspass_private.current_student_id(); b public.bookings; e public.events; raw_token text; as_of timestamptz; expiry timestamptz;
begin
 if actor is null then raise exception 'Current session required' using errcode='42501'; end if;
 select * into b from public.bookings where id=p_booking_id and student_id=actor;
 if not found then raise exception 'Booking unavailable' using errcode='P1008'; end if;
 select * into e from public.events where id=b.event_id for update;
 select * into b from public.bookings where id=p_booking_id and student_id=actor for update;
 perform campuspass_private.admission_actor(e.institution_id,false);
 if exists(select 1 from public.event_checkins where booking_id=b.id) then
 raise exception 'Already checked in' using errcode='P1021'; end if;
 if b.status<>'confirmed' or e.status<>'published' then raise exception 'Cancelled or unavailable' using errcode='P1005'; end if;
 as_of:=clock_timestamp();
 if as_of<e.starts_at-interval '30 minutes' or as_of>=e.ends_at then raise exception 'Outside admission window' using errcode='P1020'; end if;
 if exists(select 1 from public.admission_tokens where booking_id=b.id and issued_at>as_of-interval '3 seconds') then
 raise exception 'Wait before refreshing pass' using errcode='P1022'; end if;
 if not campuspass_private.admission_limit(actor,'issue') then return jsonb_build_object('outcome','rate_limited'); end if;
 -- A rate-bucket lock can also wait behind another issuance. Recheck time and
 -- access after that wait before producing a new credential.
 perform campuspass_private.admission_actor(e.institution_id,false);
 as_of:=clock_timestamp();
 if as_of<e.starts_at-interval '30 minutes' or as_of>=e.ends_at then raise exception 'Outside admission window' using errcode='P1020'; end if;
 raw_token:='cp1_'||encode(extensions.gen_random_bytes(32),'hex');
 expiry:=least(as_of+interval '90 seconds',e.ends_at);
 insert into public.admission_tokens(booking_id,event_id,token_hash,event_revision,issued_at,expires_at)
 values(b.id,e.id,extensions.digest(raw_token,'sha256'),e.revision,as_of,expiry)
 on conflict(booking_id) do update set token_hash=excluded.token_hash,event_revision=excluded.event_revision,
 issued_at=excluded.issued_at,expires_at=excluded.expires_at,consumed_at=null;
 insert into public.audit_log(institution_id,actor_user_id,action,subject_id)
 values(e.institution_id,actor,'admission_pass_issued',b.id);
 -- This is the only response containing the raw secret. It is never recoverable.
 return jsonb_build_object('outcome','issued','booking_id',b.id,'token',raw_token,'expires_at',expiry,'server_now',as_of);
end $$;

create function public.check_in_campus_pass(p_event_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=campuspass_private.current_student_id(); e public.events; t public.admission_tokens; b public.bookings;
 outcome text; admitted timestamptz; as_of timestamptz;
begin
 if actor is null then raise exception 'Current session required' using errcode='42501'; end if;
 select * into e from public.events where id=p_event_id for update;
 if not found or e.organizer_id<>actor then raise exception 'Event not controlled' using errcode='P1007'; end if;
 perform campuspass_private.admission_actor(e.institution_id,true);
 if not campuspass_private.admission_limit(actor,'scan') then return jsonb_build_object('outcome','rate_limited'); end if;
 -- Bound work and return no private information for malformed/cross-event data.
 if p_token is null or octet_length(p_token)<>68 or p_token !~ '^cp1_[0-9a-f]{64}$' then outcome:='invalid';
 else
  select * into t from public.admission_tokens where event_id=e.id and token_hash=extensions.digest(p_token,'sha256');
  if not found then outcome:='invalid';
  else
   select * into b from public.bookings where id=t.booking_id for update;
   select checked_in_at into admitted from public.event_checkins where booking_id=b.id;
   as_of:=clock_timestamp();
   if admitted is not null then outcome:='already_checked_in';
   elsif b.status<>'confirmed' or e.status<>'published' then outcome:='cancelled';
   elsif not campuspass_private.admission_student(b.student_id,e.institution_id) then outcome:='ineligible';
   elsif t.event_revision<>e.revision then outcome:='invalid';
   elsif t.consumed_at is not null then outcome:='invalid';
   elsif t.expires_at<=clock_timestamp() then outcome:='expired';
   elsif clock_timestamp()<e.starts_at-interval '30 minutes' or clock_timestamp()>=e.ends_at then outcome:='outside_window';
   else
    -- Recheck Auth/time after any student-membership lock wait.
    perform campuspass_private.admission_actor(e.institution_id,true);
    as_of:=clock_timestamp();
    if as_of>=t.expires_at then outcome:='expired';
    elsif as_of>=e.ends_at or as_of<e.starts_at-interval '30 minutes' then outcome:='outside_window';
    else
     insert into public.event_checkins(booking_id,event_id,organizer_id,checked_in_at) values(b.id,e.id,actor,as_of);
     update public.admission_tokens set consumed_at=as_of where booking_id=b.id;
     admitted:=as_of; outcome:='admitted';
    end if;
   end if;
  end if;
 end if;
 insert into public.audit_log(institution_id,actor_user_id,action,subject_id,details)
 values(e.institution_id,actor,'admission_scan',e.id,jsonb_build_object('outcome',outcome,
 'booking_id',case when outcome in ('admitted','already_checked_in') then b.id end));
 return jsonb_build_object('outcome',outcome,'checked_in_at',case when outcome in ('admitted','already_checked_in') then admitted end,
 'reference',case when outcome in ('admitted','already_checked_in') then b.reference end);
end $$;

create function public.get_campus_checkins(p_event_id uuid,p_before timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=campuspass_private.current_student_id(); e public.events; history jsonb; confirmed integer; total integer;
begin
 if actor is null then raise exception 'Current session required' using errcode='42501'; end if;
 select * into e from public.events where id=p_event_id for share;
 if not found or e.organizer_id<>actor then raise exception 'Event not controlled' using errcode='P1007'; end if;
 perform campuspass_private.admission_actor(e.institution_id,true);
 select count(*)::integer into confirmed from public.bookings where event_id=e.id and status='confirmed';
 select count(*)::integer into total from public.event_checkins where event_id=e.id;
 select coalesce(jsonb_agg(to_jsonb(x) order by checked_in_at desc),'[]'::jsonb) into history from (
 select c.checked_in_at,b.reference,coalesce(p.display_name,'Deleted profile') as display_name
 from public.event_checkins c join public.bookings b on b.id=c.booking_id left join public.student_profiles p on p.user_id=b.student_id
 where c.event_id=e.id and (p_before is null or c.checked_in_at<p_before) order by c.checked_in_at desc,c.id limit 50
 ) x;
 return jsonb_build_object('event_id',e.id,'confirmed_count',confirmed,'admitted_count',total,'history',history,
 'server_now',clock_timestamp(),'opens_at',e.starts_at-interval '30 minutes','closes_at',e.ends_at,'event_status',e.status);
end $$;

revoke all on function public.get_campus_pass(uuid),public.issue_campus_pass(uuid),public.check_in_campus_pass(uuid,text),public.get_campus_checkins(uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.get_campus_pass(uuid),public.issue_campus_pass(uuid),public.check_in_campus_pass(uuid,text),public.get_campus_checkins(uuid,timestamptz) to authenticated;
