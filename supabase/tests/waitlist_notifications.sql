begin;
do $$ declare target text; actor text; op text; begin
 foreach target in array array['event_waitlist','waitlist_requests','campus_notifications'] loop
  if not exists(select 1 from pg_class where oid=('public.'||target)::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'Missing forced RLS'; end if;
  foreach actor in array array['anon','authenticated','service_role'] loop
   foreach op in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if has_table_privilege(actor,'public.'||target,op) then raise exception 'Unexpected direct API privilege'; end if;
   end loop;
  end loop;
 end loop;
 raise notice 'PASS: queue, intent and notification tables force RLS and deny raw API writes/reads';
 foreach target in array array['book_before_waitlists(uuid,uuid)','cancel_before_waitlists(uuid)','notify_campus(uuid,uuid,uuid,text,text)','reconcile_waitlist(uuid)'] loop
  if has_function_privilege('authenticated','campuspass_private.'||target,'EXECUTE') then raise exception 'Private bypass exposed'; end if;
 end loop;
 raise notice 'PASS: clients cannot invoke private promotion, notification or prior booking functions';
 foreach target in array array['get_my_campus_waitlist(uuid)','join_campus_waitlist(uuid,uuid)','withdraw_campus_waitlist(uuid)','list_campus_notifications(bigint)','mark_campus_notification_read(bigint)'] loop
  if has_function_privilege('anon','public.'||target,'EXECUTE') or has_function_privilege('service_role','public.'||target,'EXECUTE') or not has_function_privilege('authenticated','public.'||target,'EXECUTE') then raise exception 'Unexpected public RPC grants'; end if;
 end loop;
 raise notice 'PASS: new waitlist/inbox operations require authenticated restricted RPCs';
end $$;
set local role authenticated;
do $$ begin
 begin perform public.join_campus_waitlist(gen_random_uuid(),gen_random_uuid()); raise exception 'No-session join allowed'; exception when insufficient_privilege then null; end;
 begin perform public.list_campus_notifications(); raise exception 'No-session inbox allowed'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: absent sessions cannot join queues or read notification inboxes';
end $$;
rollback;
