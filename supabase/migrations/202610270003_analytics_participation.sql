-- Private, short-lived reporting snapshots make complete paginated exports
-- consistent while bookings, cancellations, promotions and scans continue.
create table public.event_report_snapshots (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id) on delete cascade,
 organizer_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 row_count integer not null check(row_count between 0 and 50000),
 analytics jsonb not null,
 unique(organizer_id,request_id),
 check(expires_at>created_at and expires_at<=created_at+interval '10 minutes')
);
create index report_snapshots_owner on public.event_report_snapshots(organizer_id,expires_at);
create table public.event_report_rows (
 snapshot_id uuid not null references public.event_report_snapshots(id) on delete cascade,
 position integer not null check(position between 1 and 50000),
 reference text not null,
 display_name text not null,
 booking_status public.booking_status not null,
 checked_in_at timestamptz,
 from_waitlist boolean not null,
 primary key(snapshot_id,position)
);
create unique index checkins_participation_identity on public.event_checkins(id,booking_id,event_id);
create table public.participation_records (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null unique,
 event_id uuid not null references public.events(id) on delete cascade,
 student_id uuid not null references auth.users(id) on delete cascade,
 checkin_id uuid not null unique,
 institution_name text not null,
 event_title text not null,
 venue text not null,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 display_name text not null,
 reference text not null,
 checked_in_at timestamptz not null,
 issued_at timestamptz not null default clock_timestamp(),
 foreign key(booking_id,event_id) references public.bookings(id,event_id) on delete cascade,
 foreign key(checkin_id,booking_id,event_id) references public.event_checkins(id,booking_id,event_id) on delete cascade
);
alter table public.event_report_snapshots enable row level security;
alter table public.event_report_snapshots force row level security;
alter table public.event_report_rows enable row level security;
alter table public.event_report_rows force row level security;
alter table public.participation_records enable row level security;
alter table public.participation_records force row level security;
revoke all on public.event_report_snapshots,public.event_report_rows,public.participation_records from public,anon,authenticated,service_role;
create policy own_report_snapshot on public.event_report_snapshots for select to authenticated using(organizer_id=(select campuspass_private.current_student_id()));
create policy own_participation on public.participation_records for select to authenticated using(student_id=(select campuspass_private.current_student_id()));
create function campuspass_private.immutable_reporting() returns trigger
language plpgsql set search_path='' as $$ begin
 raise exception 'Reporting snapshots and participation acknowledgements are immutable' using errcode='23514';
end $$;
create trigger immutable_report_header before update on public.event_report_snapshots for each row execute function campuspass_private.immutable_reporting();
create trigger immutable_report_rows before update on public.event_report_rows for each row execute function campuspass_private.immutable_reporting();
create trigger immutable_participation before update on public.participation_records for each row execute function campuspass_private.immutable_reporting();
revoke all on function campuspass_private.immutable_reporting() from public,anon,authenticated,service_role;

create function campuspass_private.require_reporting_event(p_event uuid) returns public.events
language plpgsql security definer set search_path='' as $$
declare actor uuid:=campuspass_private.current_student_id(); e public.events;
begin
 if actor is null then raise exception 'Current session required' using errcode='42501'; end if;
 -- Every existing event/booking/queue/check-in mutation locks this row first.
 select * into e from public.events where id=p_event and organizer_id=actor for share;
 if not found then raise exception 'Not the owning organizer' using errcode='P1007'; end if;
 perform campuspass_private.admission_actor(e.institution_id,true);
 return e;
end $$;
revoke all on function campuspass_private.require_reporting_event(uuid) from public,anon,authenticated,service_role;

create function campuspass_private.event_analytics(p_event uuid,p_as_of timestamptz) returns jsonb
language sql stable security definer set search_path='' as $$
 with b as (
 select count(*)::integer booking_records,count(*) filter(where status='confirmed')::integer confirmed,
 count(*) filter(where status='cancelled')::integer cancelled
 from public.bookings where event_id=p_event
 ), c as (
 select count(*)::integer total,count(*) filter(where b.status='confirmed')::integer confirmed_checked
 from public.event_checkins c join public.bookings b on b.id=c.booking_id where c.event_id=p_event
 ), w as (
 select count(*) filter(where status='waiting')::integer waiting,count(*) filter(where status='promoted')::integer promoted
 from public.event_waitlist where event_id=p_event
 ), bounds as (
 select min(checked_in_at) lo,max(checked_in_at) hi from public.event_checkins where event_id=p_event
 ), buckets as (
 select width_bucket(extract(epoch from checked_in_at),extract(epoch from lo),extract(epoch from hi)+0.001,20) bucket,
 min(checked_in_at) as starts_at,max(checked_in_at) as ends_at,count(*)::integer as count
 from public.event_checkins cross join bounds where event_id=p_event group by bucket
 ), timeline as (
 select coalesce(jsonb_agg(jsonb_build_object('starts_at',starts_at,'ends_at',ends_at,'count',count) order by bucket),'[]'::jsonb) data from buckets
 )
 select jsonb_build_object('as_of',p_as_of,'event',jsonb_build_object('id',e.id,'title',e.title,'institution_name',i.name,
 'venue',e.venue,'starts_at',e.starts_at,'ends_at',e.ends_at,'status',e.status,'capacity',e.capacity),
 'lifecycle',case when e.status='draft' then 'draft' when e.status='cancelled' then 'cancelled' when e.starts_at>p_as_of then 'upcoming' when e.ends_at>p_as_of then 'ongoing' else 'ended' end,
 'metrics',jsonb_build_object('capacity',e.capacity,'booking_records',b.booking_records,'confirmed',b.confirmed,'cancelled',b.cancelled,
 'active_waitlist',case when e.status='published' and e.starts_at>p_as_of then w.waiting else 0 end,'promotions',w.promoted,
 'total_checkins',c.total,'confirmed_checked_in',c.confirmed_checked,'confirmed_not_checked_in',b.confirmed-c.confirmed_checked,
 'checkin_percentage',case when b.confirmed=0 then 0 else round(100.0*c.confirmed_checked/b.confirmed,2) end,
 'remaining_seats',greatest(0,e.capacity-b.confirmed)), 'timeline',timeline.data)
 from public.events e join public.institutions i on i.id=e.institution_id cross join b cross join c cross join w cross join timeline where e.id=p_event;
$$;
revoke all on function campuspass_private.event_analytics(uuid,timestamptz) from public,anon,authenticated,service_role;

create function public.get_campus_event_analytics(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events; result jsonb;
begin
 e:=campuspass_private.require_reporting_event(p_event_id);
 result:=campuspass_private.event_analytics(e.id,clock_timestamp());
 perform campuspass_private.admission_actor(e.institution_id,true);
 return result;
end $$;
create function campuspass_private.report_header(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'event_id',event_id,'created_at',created_at,'expires_at',expires_at,'row_count',row_count,'analytics',analytics)
 from public.event_report_snapshots where id=p_id;
$$;
revoke all on function campuspass_private.report_header(uuid) from public,anon,authenticated,service_role;

create function public.start_campus_event_report(p_event_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events; actor uuid; report public.event_report_snapshots; total integer; as_of timestamptz;
begin
 if p_request_id is null then raise exception 'Request UUID required' using errcode='23514'; end if;
 e:=campuspass_private.require_reporting_event(p_event_id);
 actor:=campuspass_private.current_student_id();
 -- A per-organizer lock serializes the active snapshot bound and retry identity.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,9));
 perform campuspass_private.admission_actor(e.institution_id,true);
 select * into report from public.event_report_snapshots where organizer_id=actor and request_id=p_request_id;
 if found then
  if report.event_id<>e.id then raise exception 'Request already used' using errcode='P1009'; end if;
  if report.expires_at<=clock_timestamp() then raise exception 'Report expired' using errcode='P1041'; end if;
  return campuspass_private.report_header(report.id);
 end if;
 delete from public.event_report_snapshots where organizer_id=actor and expires_at<=clock_timestamp();
 if (select count(*) from public.event_report_snapshots where organizer_id=actor)>=10 then raise exception 'Too many active reports; retry after expiry' using errcode='P1043'; end if;
 select count(*)::integer into total from (select 1 from public.bookings where event_id=e.id limit 50001) x;
 if total>50000 then raise exception 'Report exceeds complete-export limit' using errcode='P1042'; end if;
 as_of:=clock_timestamp();
 insert into public.event_report_snapshots(event_id,organizer_id,request_id,created_at,expires_at,row_count,analytics)
 values(e.id,actor,p_request_id,as_of,as_of+interval '10 minutes',total,campuspass_private.event_analytics(e.id,as_of)) returning * into report;
 insert into public.event_report_rows(snapshot_id,position,reference,display_name,booking_status,checked_in_at,from_waitlist)
 select report.id,row_number() over(order by b.created_at,b.id)::integer,b.reference,coalesce(p.display_name,'Deleted profile'),b.status,c.checked_in_at,
 exists(select 1 from public.event_waitlist w where w.booking_id=b.id and w.status='promoted')
 from public.bookings b left join public.student_profiles p on p.user_id=b.student_id left join public.event_checkins c on c.booking_id=b.id where b.event_id=e.id;
 if (select count(*) from public.event_report_rows where snapshot_id=report.id)<>total then raise exception 'Incomplete report snapshot' using errcode='P1042'; end if;
 perform campuspass_private.admission_actor(e.institution_id,true);
 return campuspass_private.report_header(report.id);
end $$;
create function public.get_campus_event_report_page(p_snapshot_id uuid,p_after integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=campuspass_private.current_student_id(); report public.event_report_snapshots; e public.events; items jsonb; last_position integer;
begin
 if actor is null then raise exception 'Current session required' using errcode='42501'; end if;
 if p_after is null or p_after<0 or p_after>50000 then raise exception 'Invalid report cursor' using errcode='23514'; end if;
 select * into report from public.event_report_snapshots where id=p_snapshot_id and organizer_id=actor;
 if not found then raise exception 'Report unavailable' using errcode='P1008'; end if;
 e:=campuspass_private.require_reporting_event(report.event_id);
 -- Snapshot deletion/pruning cannot race a page already authorized for reading.
 perform 1 from public.event_report_snapshots where id=report.id for share;
 if not found or report.expires_at<=clock_timestamp() then raise exception 'Report expired' using errcode='P1041'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by position),'[]'::jsonb),max(position) into items,last_position from (
 select position,reference,display_name,booking_status,checked_in_at,from_waitlist from public.event_report_rows
 where snapshot_id=report.id and position>p_after order by position limit 200) x;
 perform campuspass_private.admission_actor(e.institution_id,true);
 return jsonb_build_object('snapshot_id',report.id,'event_id',report.event_id,'row_count',report.row_count,'rows',items,
 'next_after',case when last_position<report.row_count then last_position end);
end $$;

create function public.get_campus_participation(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=campuspass_private.current_student_id(); b public.bookings; e public.events; p public.student_profiles; c public.event_checkins; record public.participation_records; result jsonb; reason text; institution_name text;
begin
 if actor is null then raise exception 'Current session required' using errcode='42501'; end if;
 select * into b from public.bookings where id=p_booking_id and student_id=actor;
 if not found then raise exception 'Booking unavailable' using errcode='P1008'; end if;
 select * into e from public.events where id=b.event_id for share;
 select * into b from public.bookings where id=p_booking_id and student_id=actor for share;
 perform campuspass_private.admission_actor(e.institution_id,false);
 select * into c from public.event_checkins where booking_id=b.id and event_id=e.id;
 if e.status='cancelled' then reason:='event_cancelled';
 elsif b.status<>'confirmed' then reason:='booking_cancelled';
 elsif e.status<>'published' or e.ends_at>clock_timestamp() then reason:='event_not_ended';
 elsif c.id is null then reason:='not_checked_in'; end if;
 if reason is not null then return jsonb_build_object('booking_id',b.id,'checked_in_at',c.checked_in_at,'reason',reason,'record',null); end if;
 select * into record from public.participation_records where booking_id=b.id;
 if not found then
  select * into p from public.student_profiles where user_id=actor for share;
  if not found then raise exception 'Profile required' using errcode='P1003'; end if;
  select name into institution_name from public.institutions where id=e.institution_id;
  insert into public.participation_records(booking_id,event_id,student_id,checkin_id,institution_name,event_title,venue,starts_at,ends_at,display_name,reference,checked_in_at)
  values(b.id,e.id,actor,c.id,institution_name,e.title,e.venue,e.starts_at,e.ends_at,p.display_name,b.reference,c.checked_in_at)
  on conflict(booking_id) do nothing returning * into record;
  if found then insert into public.audit_log(institution_id,actor_user_id,action,subject_id,details)
   values(e.institution_id,actor,'participation_record_issued',record.id,jsonb_build_object('booking_id',b.id));
  else select * into record from public.participation_records where booking_id=b.id; end if;
 end if;
 perform campuspass_private.admission_actor(e.institution_id,false);
 result:=to_jsonb(record)-'student_id'-'checkin_id';
 return jsonb_build_object('booking_id',b.id,'checked_in_at',c.checked_in_at,'reason',null,'record',result);
end $$;
revoke all on function public.get_campus_event_analytics(uuid),public.start_campus_event_report(uuid,uuid),public.get_campus_event_report_page(uuid,integer),public.get_campus_participation(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_campus_event_analytics(uuid),public.start_campus_event_report(uuid,uuid),public.get_campus_event_report_page(uuid,integer),public.get_campus_participation(uuid) to authenticated;
