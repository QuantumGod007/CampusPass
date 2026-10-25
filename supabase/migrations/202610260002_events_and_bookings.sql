create type public.event_status as enum ('draft','published','cancelled');
create type public.booking_status as enum ('confirmed','cancelled');
create type public.event_category as enum ('Technology','Hackathons','Workshops','Cultural','Sports','Entrepreneurship','Design');
create type public.poster_theme as enum ('build','design','ai','startup','coffee','film','robot','photo','source','music','product','sport');

create table public.events (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete restrict,
 organizer_id uuid not null references auth.users(id) on delete restrict,
 title text not null check(title=btrim(title) and char_length(title) between 5 and 80),
 description text not null check(description=btrim(description) and char_length(description) between 40 and 5000),
 category public.event_category not null,
 venue text not null check(venue=btrim(venue) and char_length(venue) between 3 and 120),
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 capacity integer not null check(capacity between 1 and 10000),
 status public.event_status not null default 'draft', theme public.poster_theme not null default 'build',
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create index events_institution_schedule on public.events(institution_id,starts_at) where status='published';
create index events_organizer on public.events(organizer_id,created_at);
create table public.bookings (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id) on delete restrict,
 student_id uuid not null references auth.users(id) on delete cascade,
 status public.booking_status not null default 'confirmed',
 reference text not null unique default ('CP-'||upper(gen_random_uuid()::text)),
 created_at timestamptz not null default clock_timestamp(), cancelled_at timestamptz,
 cancellation_reason text check(cancellation_reason in ('student','event_cancelled')),
 check((status='confirmed' and cancelled_at is null and cancellation_reason is null)
 or(status='cancelled' and cancelled_at is not null and cancellation_reason is not null))
);
create unique index one_confirmed_booking on public.bookings(event_id,student_id) where status='confirmed';
create index bookings_student_history on public.bookings(student_id,created_at);
-- A ledger remembers every successful request, including requests that resolved
-- to an already existing booking. Replaying a pre-cancellation request can never
-- acquire another seat. Rebooking requires a new request UUID and creates history.
create table public.booking_requests (
 student_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 event_id uuid not null references public.events(id) on delete restrict,
 booking_id uuid not null references public.bookings(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 primary key(student_id,request_id)
);
create index booking_requests_booking on public.booking_requests(booking_id);

create function campuspass_private.current_institution() returns uuid
language sql stable security definer set search_path='' as $$
 select m.institution_id from public.institution_memberships m join public.institutions i on i.id=m.institution_id
 where m.user_id=(select campuspass_private.current_student_id()) and m.status='active'
 and (m.expires_at is null or m.expires_at>clock_timestamp()) and i.is_active limit 1
$$;
create function campuspass_private.organizer_institution() returns uuid
language sql stable security definer set search_path='' as $$
 select m.institution_id from public.institution_memberships m join public.institutions i on i.id=m.institution_id
 where m.user_id=(select campuspass_private.current_student_id()) and m.status='active' and m.role='organizer'
 and (m.expires_at is null or m.expires_at>clock_timestamp()) and i.is_active limit 1
$$;
revoke all on function campuspass_private.current_institution(),campuspass_private.organizer_institution() from public,anon,authenticated,service_role;
grant execute on function campuspass_private.current_institution(),campuspass_private.organizer_institution() to authenticated;

alter table public.events enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_requests enable row level security;
revoke all on public.events,public.bookings,public.booking_requests from public,anon,authenticated,service_role;
grant select on public.events,public.bookings to authenticated;
create policy own_bookings on public.bookings for select to authenticated
 using(student_id=(select campuspass_private.current_student_id()));
create policy eligible_event_metadata on public.events for select to authenticated using (
 (institution_id=(select campuspass_private.current_institution()) and status in ('published','cancelled'))
 or(organizer_id=(select campuspass_private.current_student_id()) and institution_id=(select campuspass_private.organizer_institution()))
 or exists(select 1 from public.bookings b where b.event_id=events.id and b.student_id=(select campuspass_private.current_student_id()))
);

-- Lock the current institution membership for each write. Revocation and
-- institution deactivation must serialize with an in-flight authorized action.
create function campuspass_private.require_member(p_institution uuid,p_organizer boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare student uuid:=campuspass_private.current_student_id(); found_member uuid;
begin
 if student is null then raise exception 'Current session required' using errcode='42501'; end if;
 select m.id into found_member from public.institution_memberships m join public.institutions i on i.id=m.institution_id
 where m.user_id=student and m.institution_id=p_institution and m.status='active'
 and (m.expires_at is null or m.expires_at>clock_timestamp()) and i.is_active
 and (not p_organizer or m.role='organizer') for share of m,i;
 if found_member is null then
  if p_organizer then raise exception 'Organizer permission required' using errcode='P1007'; end if;
  raise exception 'Active institution membership required' using errcode='P1002';
 end if;
 return student;
end $$;
revoke all on function campuspass_private.require_member(uuid,boolean) from public,anon,authenticated,service_role;

create function campuspass_private.event_summary(p_event uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(e)||jsonb_build_object('confirmed_count',c.total,
 'registration_open',e.status='published' and e.starts_at>clock_timestamp(),
 'editable',e.status='draft' or (e.status='published' and e.starts_at>clock_timestamp()),
 'available_seats',case when e.status='published' and e.starts_at>clock_timestamp() then e.capacity-c.total else 0 end)
 from public.events e cross join lateral(select count(*)::int total from public.bookings b where b.event_id=e.id and b.status='confirmed') c
 where e.id=p_event
$$;
revoke all on function campuspass_private.event_summary(uuid) from public,anon,authenticated,service_role;

create function public.get_campus_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare student uuid:=campuspass_private.current_student_id(); result jsonb;
begin
 if student is null then raise exception 'Current session required' using errcode='42501'; end if;
 select jsonb_build_object('institution_id',i.id,'institution_name',i.name,'role',m.role,
 'profile_complete',exists(select 1 from public.student_profiles where user_id=student)) into result
 from public.institution_memberships m join public.institutions i on i.id=m.institution_id
 where m.user_id=student and m.status='active' and (m.expires_at is null or m.expires_at>clock_timestamp()) and i.is_active;
 return coalesce(result,jsonb_build_object('institution_id',null,'institution_name',null,'role',null,
 'profile_complete',exists(select 1 from public.student_profiles where user_id=student)));
end $$;

create function public.list_campus_events(p_owned boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare institution uuid:=case when p_owned then campuspass_private.organizer_institution() else campuspass_private.current_institution() end;
 student uuid:=campuspass_private.current_student_id(); result jsonb;
begin
 if student is null then raise exception 'Current session required' using errcode='42501'; end if;
 if institution is null then raise exception 'Active institution membership required' using errcode='P1002'; end if;
 select coalesce(jsonb_agg(campuspass_private.event_summary(e.id) order by e.starts_at,e.id),'[]'::jsonb) into result
 from public.events e where e.institution_id=institution and
 case when p_owned then e.organizer_id=student else e.status in ('published','cancelled') end;
 return result;
end $$;
create function public.get_campus_event(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare student uuid:=campuspass_private.current_student_id(); result jsonb;
begin
 if student is null then raise exception 'Current session required' using errcode='42501'; end if;
 select campuspass_private.event_summary(e.id) into result from public.events e where e.id=p_event_id and (
 (e.institution_id=campuspass_private.current_institution() and e.status in ('published','cancelled'))
 or(e.organizer_id=student and e.institution_id=campuspass_private.organizer_institution())
 or exists(select 1 from public.bookings b where b.event_id=e.id and b.student_id=student));
 return result;
end $$;

create function campuspass_private.event_integrity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.id<>old.id or new.institution_id<>old.institution_id or new.organizer_id<>old.organizer_id or new.created_at<>old.created_at then
   raise exception 'Event ownership is immutable' using errcode='23514'; end if;
  if new.capacity<(select count(*) from public.bookings where event_id=old.id and status='confirmed') then
   raise exception 'Capacity below confirmed bookings' using errcode='P1011'; end if;
  if old.status='cancelled' or (old.status='published' and new.status='draft') then
   raise exception 'Invalid event state transition' using errcode='P1012'; end if;
  new.revision:=old.revision+1; new.updated_at:=clock_timestamp();
 end if;
 if new.status='published' and (tg_op='INSERT' or old.status='draft' or new.starts_at is distinct from old.starts_at) and new.starts_at<=clock_timestamp() then
  raise exception 'Only future events can be published' using errcode='P1004'; end if;
 return new;
end $$;
revoke all on function campuspass_private.event_integrity() from public,anon,authenticated,service_role;
create trigger event_integrity before insert or update on public.events for each row execute function campuspass_private.event_integrity();
create function campuspass_private.audit_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(institution_id,actor_user_id,action,subject_id,details)
 values(new.institution_id,campuspass_private.current_student_id(),
 case when tg_op='INSERT' then 'event_created' when new.status='cancelled' and old.status<>'cancelled' then 'event_cancelled'
 when new.status='published' and old.status='draft' then 'event_published' else 'event_updated' end,new.id,
 jsonb_build_object('status',new.status,'capacity',new.capacity,'revision',new.revision));
 return new;
end $$;
revoke all on function campuspass_private.audit_event() from public,anon,authenticated,service_role;
create trigger event_audit after insert or update on public.events for each row execute function campuspass_private.audit_event();

create function public.save_campus_event(p_event_id uuid,p_expected_revision integer,p_title text,p_description text,
 p_category public.event_category,p_venue text,p_starts_at timestamptz,p_ends_at timestamptz,p_capacity integer,p_theme public.poster_theme) returns jsonb
language plpgsql security definer set search_path='' as $$
declare student uuid:=campuspass_private.current_student_id(); institution uuid; target public.events;
begin
 if student is null then raise exception 'Current session required' using errcode='42501'; end if;
 if p_event_id is null then
  institution:=campuspass_private.organizer_institution();
  perform campuspass_private.require_member(institution,true);
  insert into public.events(institution_id,organizer_id,title,description,category,venue,starts_at,ends_at,capacity,theme)
  values(institution,student,btrim(p_title),btrim(p_description),p_category,btrim(p_venue),p_starts_at,p_ends_at,p_capacity,p_theme) returning * into target;
 else
  select * into target from public.events where id=p_event_id for update;
  if not found or target.organizer_id<>student then raise exception 'Event not controlled by this organizer' using errcode='P1007'; end if;
  perform campuspass_private.require_member(target.institution_id,true);
  if target.status='cancelled' then raise exception 'Event cancelled' using errcode='P1005'; end if;
  if target.status='published' and target.starts_at<=clock_timestamp() then raise exception 'Event already started' using errcode='P1004'; end if;
  if p_expected_revision is distinct from target.revision then raise exception 'Stale event revision' using errcode='P1010'; end if;
  update public.events set title=btrim(p_title),description=btrim(p_description),category=p_category,venue=btrim(p_venue),
  starts_at=p_starts_at,ends_at=p_ends_at,capacity=p_capacity,theme=p_theme where id=target.id returning * into target;
 end if;
 return campuspass_private.event_summary(target.id);
end $$;

create function public.set_campus_event_status(p_event_id uuid,p_expected_revision integer,p_status public.event_status) returns jsonb
language plpgsql security definer set search_path='' as $$
declare student uuid:=campuspass_private.current_student_id(); target public.events;
begin
 if student is null then raise exception 'Current session required' using errcode='42501'; end if;
 select * into target from public.events where id=p_event_id for update;
 if not found or target.organizer_id<>student then raise exception 'Event not controlled by this organizer' using errcode='P1007'; end if;
 perform campuspass_private.require_member(target.institution_id,true);
 if p_status=target.status and p_status in ('published','cancelled') then return campuspass_private.event_summary(target.id); end if;
 if p_expected_revision is distinct from target.revision then raise exception 'Stale event revision' using errcode='P1010'; end if;
 if p_status is null or p_status='draft' or target.status='cancelled' then raise exception 'Invalid event state transition' using errcode='P1012'; end if;
 if target.starts_at<=clock_timestamp() then raise exception 'Event already started' using errcode='P1004'; end if;
 update public.events set status=p_status where id=target.id;
 if p_status='cancelled' then
  update public.bookings set status='cancelled',cancelled_at=clock_timestamp(),cancellation_reason='event_cancelled'
  where event_id=target.id and status='confirmed';
 end if;
 return campuspass_private.event_summary(target.id);
end $$;

create function public.book_campus_event(p_event_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare student uuid:=campuspass_private.current_student_id(); target public.events; booking public.bookings; prior public.booking_requests;
begin
 if student is null then raise exception 'Current session required' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'A request UUID is required' using errcode='23514'; end if;
 -- Serialize a request UUID even when a client accidentally reuses it for two events.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(student::text||p_request_id::text, 7));
 select * into target from public.events where id=p_event_id for update;
 if not found then raise exception 'Event not available' using errcode='P1008'; end if;
 select * into prior from public.booking_requests where student_id=student and request_id=p_request_id;
 if found then
  if prior.event_id<>p_event_id then raise exception 'Request UUID already used' using errcode='P1009'; end if;
  select * into booking from public.bookings where id=prior.booking_id;
  return to_jsonb(booking);
 end if;
 perform campuspass_private.require_member(target.institution_id);
 if not exists(select 1 from public.student_profiles where user_id=student) then raise exception 'Student profile required' using errcode='P1003'; end if;
 if target.status='cancelled' then raise exception 'Event cancelled' using errcode='P1005'; end if;
 if target.status<>'published' then raise exception 'Event not available' using errcode='P1008'; end if;
 if target.starts_at<=clock_timestamp() then raise exception 'Event already started' using errcode='P1004'; end if;
 select * into booking from public.bookings where event_id=target.id and student_id=student and status='confirmed';
 if not found then
  if (select count(*) from public.bookings where event_id=target.id and status='confirmed')>=target.capacity then
   raise exception 'Event sold out' using errcode='P1006'; end if;
  insert into public.bookings(event_id,student_id) values(target.id,student) returning * into booking;
 end if;
 insert into public.booking_requests(student_id,request_id,event_id,booking_id) values(student,p_request_id,target.id,booking.id);
 return to_jsonb(booking);
end $$;

create function public.cancel_campus_booking(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare student uuid:=campuspass_private.current_student_id(); booking public.bookings; target public.events;
begin
 if student is null then raise exception 'Current session required' using errcode='42501'; end if;
 select * into booking from public.bookings where id=p_booking_id and student_id=student;
 if not found then raise exception 'Booking not available' using errcode='P1008'; end if;
 -- All seat-changing operations lock the event first, then the booking.
 select * into target from public.events where id=booking.event_id for update;
 select * into booking from public.bookings where id=p_booking_id and student_id=student for update;
 if booking.status='cancelled' then return to_jsonb(booking); end if;
 perform campuspass_private.require_member(target.institution_id);
 if target.starts_at<=clock_timestamp() then raise exception 'Cancellation cutoff passed' using errcode='P1004'; end if;
 update public.bookings set status='cancelled',cancelled_at=clock_timestamp(),cancellation_reason='student' where id=booking.id returning * into booking;
 return to_jsonb(booking);
end $$;

create function public.list_my_campus_bookings() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare student uuid:=campuspass_private.current_student_id(); result jsonb;
begin
 if student is null then raise exception 'Current session required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('event',campuspass_private.event_summary(b.event_id)) order by b.created_at desc,b.id),'[]'::jsonb)
 into result from public.bookings b where b.student_id=student;
 return result;
end $$;
create function public.list_campus_attendees(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare student uuid:=campuspass_private.current_student_id(); target public.events; result jsonb;
begin
 if student is null then raise exception 'Current session required' using errcode='42501'; end if;
 select * into target from public.events where id=p_event_id;
 if not found or target.organizer_id<>student then raise exception 'Event not controlled by this organizer' using errcode='P1007'; end if;
 perform campuspass_private.require_member(target.institution_id,true);
 select coalesce(jsonb_agg(jsonb_build_object('booking_id',b.id,'reference',b.reference,'status',b.status,'created_at',b.created_at,
 'display_name',coalesce(p.display_name,'Deleted profile'),'department',p.department,'academic_year',p.academic_year)
 order by b.created_at,b.id),'[]'::jsonb) into result from public.bookings b left join public.student_profiles p on p.user_id=b.student_id where b.event_id=target.id;
 return result;
end $$;

revoke all on function public.get_campus_access(),public.list_campus_events(boolean),public.get_campus_event(uuid),
 public.save_campus_event(uuid,integer,text,text,public.event_category,text,timestamptz,timestamptz,integer,public.poster_theme),
 public.set_campus_event_status(uuid,integer,public.event_status),public.book_campus_event(uuid,uuid),
 public.cancel_campus_booking(uuid),public.list_my_campus_bookings(),public.list_campus_attendees(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_campus_access(),public.list_campus_events(boolean),public.get_campus_event(uuid),
 public.save_campus_event(uuid,integer,text,text,public.event_category,text,timestamptz,timestamptz,integer,public.poster_theme),
 public.set_campus_event_status(uuid,integer,public.event_status),public.book_campus_event(uuid,uuid),
 public.cancel_campus_booking(uuid),public.list_my_campus_bookings(),public.list_campus_attendees(uuid) to authenticated;

-- A separate create contract keeps generated client arguments non-nullable.
create function public.create_campus_event(p_title text,p_description text,p_category public.event_category,
 p_venue text,p_starts_at timestamptz,p_ends_at timestamptz,p_capacity integer,p_theme public.poster_theme) returns jsonb
language sql set search_path='' as $$
 select public.save_campus_event(null,null,p_title,p_description,p_category,p_venue,p_starts_at,p_ends_at,p_capacity,p_theme)
$$;
revoke all on function public.create_campus_event(text,text,public.event_category,text,timestamptz,timestamptz,integer,public.poster_theme) from public,anon,authenticated,service_role;
grant execute on function public.create_campus_event(text,text,public.event_category,text,timestamptz,timestamptz,integer,public.poster_theme) to authenticated;
