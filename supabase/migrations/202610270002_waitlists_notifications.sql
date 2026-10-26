-- FIFO queues are capped at 100 active entries per event. Every seat-changing
-- operation locks the event first and can reconcile the whole queue in one tx.
create table public.event_waitlist (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id) on delete cascade,
 student_id uuid not null references auth.users(id) on delete cascade,
 queue_order bigint generated always as identity unique,
 status text not null default 'waiting' check(status in ('waiting','promoted','withdrawn','expired')),
 booking_id uuid unique,
 reason text check(reason in ('ineligible','already_booked','event_cancelled','registration_closed')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 foreign key(booking_id,event_id) references public.bookings(id,event_id) on delete restrict deferrable initially deferred,
 check((status='promoted')=(booking_id is not null)),
 check((status='expired')=(reason is not null))
);
create unique index one_active_waitlist on public.event_waitlist(event_id,student_id) where status='waiting';
create index waitlist_fifo on public.event_waitlist(event_id,queue_order) where status='waiting';
create index waitlist_own_history on public.event_waitlist(student_id,event_id,queue_order desc);
create table public.waitlist_requests (
 student_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 event_id uuid not null references public.events(id) on delete cascade,
 entry_id uuid not null references public.event_waitlist(id) on delete cascade,
 primary key(student_id,request_id)
);
create index waitlist_requests_entry on public.waitlist_requests(entry_id);
create table public.campus_notifications (
 id bigint generated always as identity primary key,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 institution_id uuid not null references public.institutions(id) on delete cascade,
 event_id uuid not null references public.events(id) on delete cascade,
 booking_id uuid,
 kind text not null check(kind in ('waitlist_joined','waitlist_promoted','booking_cancelled','event_cancelled','schedule_changed')),
 identity_key text not null unique,
 title text not null check(char_length(title) between 1 and 120),
 body text not null check(char_length(body) between 1 and 500),
 created_at timestamptz not null default clock_timestamp(), read_at timestamptz,
 foreign key(booking_id,event_id) references public.bookings(id,event_id) on delete cascade
);
create index notifications_inbox on public.campus_notifications(recipient_id,institution_id,id desc);
create index notifications_unread on public.campus_notifications(recipient_id,institution_id) where read_at is null;
alter table public.event_waitlist enable row level security;
alter table public.event_waitlist force row level security;
alter table public.waitlist_requests enable row level security;
alter table public.waitlist_requests force row level security;
alter table public.campus_notifications enable row level security;
alter table public.campus_notifications force row level security;
revoke all on public.event_waitlist,public.waitlist_requests,public.campus_notifications from public,anon,authenticated,service_role;
revoke all on sequence public.event_waitlist_queue_order_seq,public.campus_notifications_id_seq from public,anon,authenticated,service_role;
create policy own_waitlist on public.event_waitlist for select to authenticated using(
 student_id=(select campuspass_private.current_student_id()) and exists(select 1 from public.events e where e.id=event_id and e.institution_id=(select campuspass_private.current_institution())));
create policy own_notifications on public.campus_notifications for select to authenticated using(
 recipient_id=(select campuspass_private.current_student_id()) and institution_id=(select campuspass_private.current_institution()));

create function campuspass_private.waitlist_integrity() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then
  if new.id<>old.id or new.event_id<>old.event_id or new.student_id<>old.student_id or new.queue_order<>old.queue_order or new.created_at<>old.created_at or old.status<>'waiting' or new.status='waiting' then
   raise exception 'Waitlist ownership, order and terminal history are immutable' using errcode='23514'; end if;
  new.updated_at:=clock_timestamp();
 end if;
 if new.status='waiting' and exists(select 1 from public.bookings where event_id=new.event_id and student_id=new.student_id and status='confirmed') then
  raise exception 'An active booking already exists' using errcode='P1032'; end if;
 return new;
end $$;
create trigger waitlist_integrity before insert or update on public.event_waitlist for each row execute function campuspass_private.waitlist_integrity();
-- Cross-table invariant: no normal booking can coexist with a waiting row.
-- The promotion FK is deferred so it can end waiting before inserting booking.
create function campuspass_private.booking_waitlist_guard() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.events where id=new.event_id for update;
 if new.status='confirmed' and exists(select 1 from public.event_waitlist where event_id=new.event_id and student_id=new.student_id and status='waiting') then
 raise exception 'Waiting entry must be promoted first' using errcode='P1032'; end if;
 return new;
end $$;
create trigger booking_waitlist_guard before insert on public.bookings for each row execute function campuspass_private.booking_waitlist_guard();
revoke all on function campuspass_private.booking_waitlist_guard() from public,anon,authenticated,service_role;

create function campuspass_private.notification_integrity() returns trigger
language plpgsql set search_path='' as $$ begin
 if (to_jsonb(new)-'read_at') is distinct from (to_jsonb(old)-'read_at') or old.read_at is not null or new.read_at is null then
 raise exception 'Notification content and prior read receipt are immutable' using errcode='23514'; end if;
 new.read_at:=clock_timestamp(); return new;
end $$;
create trigger notification_integrity before update on public.campus_notifications for each row execute function campuspass_private.notification_integrity();
revoke all on function campuspass_private.waitlist_integrity(),campuspass_private.notification_integrity() from public,anon,authenticated,service_role;

create function campuspass_private.notify_campus(p_recipient uuid,p_event uuid,p_booking uuid,p_kind text,p_identity text) returns void
language sql security definer set search_path='' as $$
 insert into public.campus_notifications(recipient_id,institution_id,event_id,booking_id,kind,identity_key,title,body)
 select p_recipient,e.institution_id,e.id,p_booking,p_kind,p_identity,
 case p_kind when 'waitlist_joined' then 'You joined the waitlist' when 'waitlist_promoted' then 'Your registration is confirmed'
 when 'booking_cancelled' then 'Your registration was cancelled' when 'event_cancelled' then 'Event cancelled' else 'Event schedule changed' end,
 case p_kind when 'waitlist_joined' then 'A free seat may be automatically confirmed for you before the event starts. Check the event for your current queue position.'
 when 'waitlist_promoted' then 'A seat became available and was automatically confirmed. Open your new booking for details and secure entry.'
 when 'booking_cancelled' then 'Your booking was cancelled. Its history remains in My campus bookings.'
 when 'event_cancelled' then 'The organizer cancelled this event. Registrations and waiting entries are closed.'
 else 'The organizer changed the event time or venue. Review the current event details before attending.' end
 from public.events e where e.id=p_event on conflict(identity_key) do nothing;
$$;
revoke all on function campuspass_private.notify_campus(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function campuspass_private.reconcile_waitlist(p_event uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e public.events; w public.event_waitlist; b uuid; occupied integer; eligible boolean; why text;
begin
 select * into e from public.events where id=p_event for update;
 if not found then return; end if;
 if not coalesce((select is_active from public.institutions where id=e.institution_id for share),false) then
  update public.event_waitlist set status='expired',reason='ineligible' where event_id=e.id and status='waiting'; return;
 end if;
 if e.status<>'published' or e.starts_at<=clock_timestamp() then
  update public.event_waitlist set status='expired',reason=case when e.status='cancelled' then 'event_cancelled' else 'registration_closed' end
  where event_id=e.id and status='waiting';
  return;
 end if;
 select count(*)::integer into occupied from public.bookings where event_id=e.id and status='confirmed';
 for w in select * from public.event_waitlist where event_id=e.id and status='waiting' order by queue_order limit 100 for update loop
  exit when occupied>=e.capacity;
  eligible:=campuspass_private.admission_student(w.student_id,e.institution_id)
    and exists(select 1 from public.student_profiles where user_id=w.student_id);
  -- Both membership locks and database time are rechecked after contention.
  if e.starts_at<=clock_timestamp() then
   update public.event_waitlist set status='expired',reason='registration_closed' where event_id=e.id and status='waiting'; return;
  end if;
  why:=null;
  if not eligible then why:='ineligible';
  elsif exists(select 1 from public.bookings where event_id=e.id and student_id=w.student_id and status='confirmed') then why:='already_booked'; end if;
  if why is not null then
   update public.event_waitlist set status='expired',reason=why where id=w.id;
   insert into public.audit_log(institution_id,actor_user_id,action,subject_id,details)
   values(e.institution_id,campuspass_private.current_student_id(),'waitlist_skipped',w.id,jsonb_build_object('reason',why));
   continue;
  end if;
  -- The queue entry ends before the new booking is inserted, within this tx.
  b:=gen_random_uuid();
  update public.event_waitlist set status='promoted',booking_id=b where id=w.id;
  insert into public.bookings(id,event_id,student_id) values(b,e.id,w.student_id);
  perform campuspass_private.notify_campus(w.student_id,e.id,b,'waitlist_promoted','promotion:'||w.id::text);
  insert into public.audit_log(institution_id,actor_user_id,action,subject_id,details)
  values(e.institution_id,campuspass_private.current_student_id(),'waitlist_promoted',w.id,jsonb_build_object('booking_id',b));
  occupied:=occupied+1;
 end loop;
end $$;
revoke all on function campuspass_private.reconcile_waitlist(uuid) from public,anon,authenticated,service_role;

create function campuspass_private.waitlist_summary(p_entry uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',w.id,'event_id',w.event_id,'status',
 case when w.status='waiting' and (e.status<>'published' or e.starts_at<=clock_timestamp()) then 'expired' else w.status end,
 'booking_id',w.booking_id,'booking_status',(select status from public.bookings where id=w.booking_id),'created_at',w.created_at,'updated_at',w.updated_at,
 'reason',case when w.status='waiting' and e.status='cancelled' then 'event_cancelled'
 when w.status='waiting' and e.starts_at<=clock_timestamp() then 'registration_closed' else w.reason end,
 'position',case when w.status='waiting' and e.status='published' and e.starts_at>clock_timestamp() then
 (select count(*)::integer from public.event_waitlist q where q.event_id=w.event_id and q.status='waiting' and q.queue_order<=w.queue_order) end)
 from public.event_waitlist w join public.events e on e.id=w.event_id where w.id=p_entry;
$$;
revoke all on function campuspass_private.waitlist_summary(uuid) from public,anon,authenticated,service_role;

create function public.get_my_campus_waitlist(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=campuspass_private.current_student_id(); e public.events; entry uuid;
begin
 if actor is null then raise exception 'Current session required' using errcode='42501'; end if;
 select * into e from public.events where id=p_event_id for update;
 if not found or e.status='draft' then raise exception 'Event unavailable' using errcode='P1008'; end if;
 perform campuspass_private.admission_actor(e.institution_id,false);
 perform campuspass_private.reconcile_waitlist(e.id);
 perform campuspass_private.admission_actor(e.institution_id,false);
 select id into entry from public.event_waitlist where event_id=e.id and student_id=actor order by queue_order desc limit 1;
 return jsonb_build_object('entry',campuspass_private.waitlist_summary(entry),'waiting_count',
 (select count(*)::integer from public.event_waitlist where event_id=e.id and status='waiting' and e.starts_at>clock_timestamp() and e.status='published'));
end $$;
create function public.join_campus_waitlist(p_event_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=campuspass_private.current_student_id(); e public.events; entry uuid; prior public.waitlist_requests;
begin
 if actor is null then raise exception 'Current session required' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'Request UUID required' using errcode='23514'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||p_request_id::text,8));
 select * into e from public.events where id=p_event_id for update;
 if not found then raise exception 'Event unavailable' using errcode='P1008'; end if;
 perform campuspass_private.admission_actor(e.institution_id,false);
 select * into prior from public.waitlist_requests where student_id=actor and request_id=p_request_id;
 if found then
  if prior.event_id<>e.id then raise exception 'Request already used' using errcode='P1009'; end if;
  return jsonb_build_object('outcome','existing','entry',campuspass_private.waitlist_summary(prior.entry_id));
 end if;
 if e.status='cancelled' then raise exception 'Event cancelled' using errcode='P1005'; end if;
 if e.status<>'published' then raise exception 'Event unavailable' using errcode='P1008'; end if;
 if e.starts_at<=clock_timestamp() then raise exception 'Registration closed' using errcode='P1004'; end if;
 if not exists(select 1 from public.student_profiles where user_id=actor) then raise exception 'Profile required' using errcode='P1003'; end if;
 perform campuspass_private.reconcile_waitlist(e.id);
 perform campuspass_private.admission_actor(e.institution_id,false);
 if exists(select 1 from public.bookings where event_id=e.id and student_id=actor and status='confirmed') then raise exception 'Already registered' using errcode='P1032'; end if;
 select id into entry from public.event_waitlist where event_id=e.id and student_id=actor and status='waiting';
 if entry is not null then
  insert into public.waitlist_requests values(actor,p_request_id,e.id,entry);
  return jsonb_build_object('outcome','existing','entry',campuspass_private.waitlist_summary(entry));
 end if;
 if (select count(*) from public.bookings where event_id=e.id and status='confirmed')<e.capacity then
  return jsonb_build_object('outcome','available','entry',null); end if;
 if (select count(*) from public.event_waitlist where event_id=e.id and status='waiting')>=100 then raise exception 'Waitlist full' using errcode='P1034'; end if;
 -- Recheck session/expiry after any eligibility locks taken by reconciliation.
 perform campuspass_private.admission_actor(e.institution_id,false);
 if e.starts_at<=clock_timestamp() then raise exception 'Registration closed' using errcode='P1004'; end if;
 insert into public.event_waitlist(event_id,student_id) values(e.id,actor) returning id into entry;
 insert into public.waitlist_requests values(actor,p_request_id,e.id,entry);
 perform campuspass_private.notify_campus(actor,e.id,null,'waitlist_joined','joined:'||entry::text);
 insert into public.audit_log(institution_id,actor_user_id,action,subject_id) values(e.institution_id,actor,'waitlist_joined',entry);
 return jsonb_build_object('outcome','joined','entry',campuspass_private.waitlist_summary(entry));
end $$;
create function public.withdraw_campus_waitlist(p_entry_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=campuspass_private.current_student_id(); w public.event_waitlist; e public.events;
begin
 if actor is null then raise exception 'Current session required' using errcode='42501'; end if;
 select * into w from public.event_waitlist where id=p_entry_id and student_id=actor;
 if not found then raise exception 'Entry unavailable' using errcode='P1008'; end if;
 select * into e from public.events where id=w.event_id for update;
 perform campuspass_private.admission_actor(e.institution_id,false);
 select * into w from public.event_waitlist where id=p_entry_id and student_id=actor for update;
 if w.status='waiting' then
  update public.event_waitlist set status=case when e.status='published' and e.starts_at>clock_timestamp() then 'withdrawn' else 'expired' end,
  reason=case when e.status='cancelled' then 'event_cancelled' when e.starts_at<=clock_timestamp() then 'registration_closed' end where id=w.id;
  insert into public.audit_log(institution_id,actor_user_id,action,subject_id) values(e.institution_id,actor,'waitlist_withdrawn',w.id);
 end if;
 return campuspass_private.waitlist_summary(w.id);
end $$;

-- Preserve the proven Phase 6 implementations behind private, ungranted
-- wrappers. All existing public signatures and historical request IDs survive.
alter function public.book_campus_event(uuid,uuid) set schema campuspass_private;
alter function campuspass_private.book_campus_event(uuid,uuid) rename to book_before_waitlists;
alter function public.cancel_campus_booking(uuid) set schema campuspass_private;
alter function campuspass_private.cancel_campus_booking(uuid) rename to cancel_before_waitlists;
alter function public.save_campus_event(uuid,integer,text,text,public.event_category,text,timestamptz,timestamptz,integer,public.poster_theme) set schema campuspass_private;
alter function campuspass_private.save_campus_event(uuid,integer,text,text,public.event_category,text,timestamptz,timestamptz,integer,public.poster_theme) rename to save_before_waitlists;
alter function public.set_campus_event_status(uuid,integer,public.event_status) set schema campuspass_private;
alter function campuspass_private.set_campus_event_status(uuid,integer,public.event_status) rename to status_before_waitlists;
revoke all on function campuspass_private.book_before_waitlists(uuid,uuid),campuspass_private.cancel_before_waitlists(uuid),
 campuspass_private.save_before_waitlists(uuid,integer,text,text,public.event_category,text,timestamptz,timestamptz,integer,public.poster_theme),
 campuspass_private.status_before_waitlists(uuid,integer,public.event_status) from public,anon,authenticated,service_role;

create function public.book_campus_event(p_event_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events;
begin
 if campuspass_private.current_student_id() is null then raise exception 'Current session required' using errcode='42501'; end if;
 select * into e from public.events where id=p_event_id for update;
 if not found then raise exception 'Event unavailable' using errcode='P1008'; end if;
 perform campuspass_private.admission_actor(e.institution_id,false);
 perform campuspass_private.reconcile_waitlist(e.id);
 return campuspass_private.book_before_waitlists(p_event_id,p_request_id);
end $$;
create function public.cancel_campus_booking(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events; b public.bookings; actor uuid:=campuspass_private.current_student_id();
begin
 if actor is null then raise exception 'Current session required' using errcode='42501'; end if;
 select * into b from public.bookings where id=p_booking_id and student_id=actor;
 if not found then raise exception 'Booking unavailable' using errcode='P1008'; end if;
 select * into e from public.events where id=b.event_id for update;
 perform campuspass_private.admission_actor(e.institution_id,false);
 return campuspass_private.cancel_before_waitlists(p_booking_id);
end $$;
create function public.save_campus_event(p_event_id uuid,p_expected_revision integer,p_title text,p_description text,
 p_category public.event_category,p_venue text,p_starts_at timestamptz,p_ends_at timestamptz,p_capacity integer,p_theme public.poster_theme) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events; institution uuid;
begin
 if p_event_id is not null then
  select * into e from public.events where id=p_event_id and organizer_id=campuspass_private.current_student_id() for update;
  if not found then raise exception 'Not owning organizer' using errcode='P1007'; end if;
  institution:=e.institution_id;
 else institution:=campuspass_private.organizer_institution(); end if;
 perform campuspass_private.admission_actor(institution,true);
 return campuspass_private.save_before_waitlists(p_event_id,p_expected_revision,p_title,p_description,p_category,p_venue,p_starts_at,p_ends_at,p_capacity,p_theme);
end $$;
create function public.set_campus_event_status(p_event_id uuid,p_expected_revision integer,p_status public.event_status) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events;
begin
 select * into e from public.events where id=p_event_id and organizer_id=campuspass_private.current_student_id() for update;
 if not found then raise exception 'Not owning organizer' using errcode='P1007'; end if;
 perform campuspass_private.admission_actor(e.institution_id,true);
 return campuspass_private.status_before_waitlists(p_event_id,p_expected_revision,p_status);
end $$;

create function campuspass_private.waitlist_booking_change() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if old.status='confirmed' and new.status='cancelled' and new.cancellation_reason='student' then
  perform campuspass_private.notify_campus(new.student_id,new.event_id,new.id,'booking_cancelled','cancel:'||new.id::text);
  perform campuspass_private.reconcile_waitlist(new.event_id);
 end if;
 return new;
end $$;
create trigger waitlist_booking_change after update on public.bookings for each row execute function campuspass_private.waitlist_booking_change();
create function campuspass_private.waitlist_event_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 if new.status='cancelled' and old.status<>'cancelled' then
  for recipient in select student_id from public.bookings where event_id=new.id and status='confirmed'
   union select student_id from public.event_waitlist where event_id=new.id and status='waiting' loop
   perform campuspass_private.notify_campus(recipient,new.id,null,'event_cancelled','event-cancel:'||new.id::text||':'||recipient::text);
  end loop;
  perform campuspass_private.reconcile_waitlist(new.id);
 elsif new.status='published' then
  if old.status='published' and (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.venue is distinct from old.venue) then
   for recipient in select student_id from public.bookings where event_id=new.id and status='confirmed'
    union select student_id from public.event_waitlist where event_id=new.id and status='waiting' loop
    perform campuspass_private.notify_campus(recipient,new.id,null,'schedule_changed','schedule:'||new.id::text||':'||new.revision::text||':'||recipient::text);
   end loop;
  end if;
  perform campuspass_private.reconcile_waitlist(new.id);
 end if;
 return new;
end $$;
create trigger waitlist_event_change after update on public.events for each row execute function campuspass_private.waitlist_event_change();
revoke all on function campuspass_private.waitlist_booking_change(),campuspass_private.waitlist_event_change() from public,anon,authenticated,service_role;

create function public.list_campus_notifications(p_before bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; institution uuid:=campuspass_private.current_institution(); items jsonb; unread integer; more boolean;
begin
 actor:=campuspass_private.admission_actor(institution,false);
 select count(*)::integer into unread from public.campus_notifications where recipient_id=actor and institution_id=institution and read_at is null;
 select coalesce(jsonb_agg(to_jsonb(x) order by id::bigint desc),'[]'::jsonb) into items from (
 select id::text as id,event_id,booking_id,kind,title,body,created_at,read_at from public.campus_notifications
 where recipient_id=actor and institution_id=institution and (p_before is null or id<p_before) order by id desc limit 50) x;
 select exists(select 1 from public.campus_notifications where recipient_id=actor and institution_id=institution and id<(select min((v->>'id')::bigint) from jsonb_array_elements(items) v)) into more;
 return jsonb_build_object('items',items,'unread_count',unread,'has_more',more);
end $$;
create function public.mark_campus_notification_read(p_notification_id bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; institution uuid:=campuspass_private.current_institution(); target public.campus_notifications;
begin
 actor:=campuspass_private.admission_actor(institution,false);
 select * into target from public.campus_notifications where id=p_notification_id and recipient_id=actor and institution_id=institution for update;
 if not found then raise exception 'Notification unavailable' using errcode='P1008'; end if;
 if target.read_at is null then update public.campus_notifications set read_at=clock_timestamp() where id=target.id returning * into target; end if;
 return jsonb_build_object('id',target.id::text,'read_at',target.read_at);
end $$;
revoke all on function public.book_campus_event(uuid,uuid),public.cancel_campus_booking(uuid),
 public.save_campus_event(uuid,integer,text,text,public.event_category,text,timestamptz,timestamptz,integer,public.poster_theme),
 public.set_campus_event_status(uuid,integer,public.event_status),public.get_my_campus_waitlist(uuid),public.join_campus_waitlist(uuid,uuid),
 public.withdraw_campus_waitlist(uuid),public.list_campus_notifications(bigint),public.mark_campus_notification_read(bigint) from public,anon,authenticated,service_role;
grant execute on function public.book_campus_event(uuid,uuid),public.cancel_campus_booking(uuid),
 public.save_campus_event(uuid,integer,text,text,public.event_category,text,timestamptz,timestamptz,integer,public.poster_theme),
 public.set_campus_event_status(uuid,integer,public.event_status),public.get_my_campus_waitlist(uuid),public.join_campus_waitlist(uuid,uuid),
 public.withdraw_campus_waitlist(uuid),public.list_campus_notifications(bigint),public.mark_campus_notification_read(bigint) to authenticated;

-- Only aggregate queue counts enter the existing event projection.
create or replace function campuspass_private.event_summary(p_event uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(e)||jsonb_build_object('confirmed_count',c.total,'waiting_count',w.total,
 'registration_open',e.status='published' and e.starts_at>clock_timestamp(),
 'editable',e.status='draft' or (e.status='published' and e.starts_at>clock_timestamp()),
 'available_seats',case when e.status='published' and e.starts_at>clock_timestamp() then e.capacity-c.total else 0 end)
 from public.events e cross join lateral(select count(*)::int total from public.bookings b where b.event_id=e.id and b.status='confirmed') c
 cross join lateral(select count(*)::int total from public.event_waitlist q where q.event_id=e.id and q.status='waiting' and e.starts_at>clock_timestamp() and e.status='published') w
 where e.id=p_event
$$;
