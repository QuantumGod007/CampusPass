begin;
do $$ declare target text; actor text; op text; begin
 foreach target in array array['event_report_snapshots','event_report_rows','participation_records'] loop
  if not exists(select 1 from pg_class where oid=('public.'||target)::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'Missing forced reporting RLS'; end if;
  foreach actor in array array['anon','authenticated','service_role'] loop
   foreach op in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if has_table_privilege(actor,'public.'||target,op) then raise exception 'Unexpected raw reporting privilege'; end if;
   end loop;
  end loop;
 end loop;
 raise notice 'PASS: report snapshots, pages and participation records force RLS and deny raw API access';
 foreach target in array array['get_campus_event_analytics(uuid)','start_campus_event_report(uuid,uuid)','get_campus_event_report_page(uuid,integer)','get_campus_participation(uuid)'] loop
  if has_function_privilege('anon','public.'||target,'EXECUTE') or has_function_privilege('service_role','public.'||target,'EXECUTE') or not has_function_privilege('authenticated','public.'||target,'EXECUTE') then raise exception 'Unexpected reporting RPC grant'; end if;
 end loop;
 if has_function_privilege('authenticated','campuspass_private.event_analytics(uuid,timestamp with time zone)','EXECUTE') or has_function_privilege('authenticated','campuspass_private.report_header(uuid)','EXECUTE') then raise exception 'Private reporting helper exposed'; end if;
 raise notice 'PASS: only restricted authenticated reporting RPCs are callable; private helpers cannot bypass ownership';
end $$;
set local role authenticated;
do $$ begin
 begin perform public.get_campus_event_analytics(gen_random_uuid()); raise exception 'No-session analytics allowed'; exception when insufficient_privilege then null; end;
 begin perform public.get_campus_participation(gen_random_uuid()); raise exception 'No-session participation allowed'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: reporting and participation reject absent/revoked sessions';
end $$;
rollback;
