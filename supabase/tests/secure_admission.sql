begin;
do $$ declare target text; actor text; op text; definition text; begin
 foreach target in array array['admission_tokens','event_checkins','admission_rate_limits'] loop
  if not exists(select 1 from pg_class where oid=('public.'||target)::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'Missing forced RLS: %',target; end if;
  foreach actor in array array['anon','authenticated','service_role'] loop
   foreach op in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if has_table_privilege(actor,'public.'||target,op) then raise exception 'Unexpected raw table privilege'; end if;
   end loop;
  end loop;
 end loop;
 raise notice 'PASS: admission tables force RLS and deny all direct API/service-role reads and writes';
 foreach target in array array['get_campus_pass(uuid)','issue_campus_pass(uuid)','check_in_campus_pass(uuid,text)','get_campus_checkins(uuid,timestamp with time zone)'] loop
  if has_function_privilege('anon','public.'||target,'EXECUTE') or has_function_privilege('service_role','public.'||target,'EXECUTE')
  or not has_function_privilege('authenticated','public.'||target,'EXECUTE') then raise exception 'Unexpected RPC grant: %',target; end if;
 end loop;
 raise notice 'PASS: only authenticated accounts may invoke admission RPCs';
 if has_function_privilege('authenticated','campuspass_private.admission_limit(uuid,text)','EXECUTE') or
 has_function_privilege('authenticated','campuspass_private.admission_student(uuid,uuid)','EXECUTE') then raise exception 'Private helper exposed'; end if;
 raise notice 'PASS: clients cannot call private eligibility or rate-limit helpers';
 if not exists(select 1 from pg_constraint where conrelid='public.event_checkins'::regclass and contype='u' and conkey=array[2]::smallint[]) then raise exception 'Missing unique booking check-in'; end if;
 raise notice 'PASS: unique check-in per booking is enforced by PostgreSQL';
 if (select count(*) from pg_constraint where conrelid in ('public.event_checkins'::regclass,'public.admission_tokens'::regclass) and confrelid='public.bookings'::regclass and cardinality(conkey)=2)<>2 then raise exception 'Missing booking/event relational integrity'; end if;
 raise notice 'PASS: both credentials and admissions have composite booking/event foreign keys';
end $$;
set local role authenticated;
do $$ begin
 begin perform public.get_campus_pass(gen_random_uuid()); raise exception 'Unauthenticated pass read allowed'; exception when insufficient_privilege then null; end;
 begin perform public.issue_campus_pass(gen_random_uuid()); raise exception 'Unauthenticated issue allowed'; exception when insufficient_privilege then null; end;
 begin perform public.check_in_campus_pass(gen_random_uuid(),'not-a-credential'); raise exception 'Unauthenticated scan allowed'; exception when insufficient_privilege then null; end;
 begin perform public.get_campus_checkins(gen_random_uuid()); raise exception 'Unauthenticated history allowed'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: missing/revoked sessions cannot read or mutate admission records';
end $$;
rollback;
