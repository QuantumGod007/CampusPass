\set ON_ERROR_STOP on
begin;
create schema campuspass_tests;
create function campuspass_tests.ok(value boolean, label text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function campuspass_tests.denied(statement text, expected text, label text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if sqlstate = expected then raise notice 'PASS: %', label; return; end if;
  raise exception 'FAIL: %, expected %, got %: %', label,expected,sqlstate,sqlerrm;
 end;
 raise exception 'FAIL: %, operation was allowed',label;
end $$;
grant usage on schema campuspass_tests to authenticated, anon;
grant execute on all functions in schema campuspass_tests to authenticated, anon;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','phase5-a@example.test'),
 ('10000000-0000-4000-8000-000000000002','phase5-b@example.test'),
 ('10000000-0000-4000-8000-000000000003','phase5-c@example.test');
insert into auth.sessions(id,user_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003');
insert into public.institutions(id,name,slug) values
 ('30000000-0000-4000-8000-000000000001','Test Institute One','phase5-one'),
 ('30000000-0000-4000-8000-000000000002','Test Institute Two','phase5-two');
select set_config('request.jwt.claims', jsonb_build_object('sub','10000000-0000-4000-8000-000000000001','role','authenticated','session_id','20000000-0000-4000-8000-000000000001','exp',extract(epoch from now())+3600)::text,true);
set local role authenticated;
select campuspass_tests.ok((public.get_student_account()->'profile') = 'null'::jsonb, 'missing profile is explicit');
select public.save_student_profile('Aarya Student','002026123456','Computer Science','Second year');
select public.save_student_profile('Aarya Student','002026123456','Computer Science','Second year');
select campuspass_tests.ok((select count(*) from public.student_profiles)=1, 'repeated saves create exactly one profile');
select campuspass_tests.ok((public.get_student_account()->'profile'->>'prn')='002026123456','leading-zero PRN persisted');
select campuspass_tests.ok((public.get_student_account()->'profile'->>'institution_id') is null,'unprovisioned user cannot claim an institution');
select campuspass_tests.denied($q$select public.save_student_profile('Aarya Student','123','Computer Science','Second year')$q$,'23514','invalid PRN rejected by PostgreSQL');
select campuspass_tests.denied($q$select public.save_student_profile('Aarya Student','002026123456','Invented','Second year')$q$,'22P02','invalid department rejected by PostgreSQL');
select campuspass_tests.denied($q$select public.save_student_profile('1','002026123456','Computer Science','Second year')$q$,'23514','invalid display name rejected by PostgreSQL');
select campuspass_tests.denied($q$update public.student_profiles set user_id='10000000-0000-4000-8000-000000000002'$q$,'42501','forged ownership rejected');
select campuspass_tests.denied($q$update public.student_profiles set institution_id='30000000-0000-4000-8000-000000000002'$q$,'42501','institution cannot be forged');
select campuspass_tests.denied($q$insert into public.institution_memberships(user_id,institution_id,status,role) values ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','active','admin')$q$,'42501','self-assigned membership and role rejected');
reset role;
insert into public.institution_memberships(user_id,institution_id,status,approved_at) values
 ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','active',now()),
 ('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','active',now()),
 ('10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002','active',now());
select campuspass_tests.denied($q$update public.institution_memberships set role='admin'$q$,'23514','administrator roles remain unavailable even to provisioning');
select set_config('request.jwt.claims', jsonb_build_object('sub','10000000-0000-4000-8000-000000000002','role','authenticated','session_id','20000000-0000-4000-8000-000000000002','exp',extract(epoch from now())+3600)::text,true);
set local role authenticated;
select campuspass_tests.ok((select count(*) from public.student_profiles)=0,'cross-user profile reads return no records');
select campuspass_tests.denied($q$select public.save_student_profile('Second Student','002026123456','Computer Science','Second year')$q$,'23505','institution-scoped duplicate PRN rejected');
select public.save_student_profile('Second Student','002026123457','Computer Science','Second year');
select campuspass_tests.ok((select count(*) from public.institution_memberships)=1,'membership privacy enforced');
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub','10000000-0000-4000-8000-000000000003','role','authenticated','session_id','20000000-0000-4000-8000-000000000003','exp',extract(epoch from now())+3600)::text,true);
set local role authenticated;
select public.save_student_profile('Third Student','002026123456','Other','First year');
select campuspass_tests.ok((public.get_student_account()->'profile'->>'institution_id')='30000000-0000-4000-8000-000000000002','same PRN allowed in another authorized institution');
reset role;
update public.institution_memberships set status='revoked',revoked_at=now() where user_id='10000000-0000-4000-8000-000000000003';
set local role authenticated;
select campuspass_tests.ok((public.get_student_account()->'membership'->>'status')='revoked','revoked membership is honest');
select campuspass_tests.ok((public.get_student_account()->'profile'->>'institution_id') is null,'revocation removes institutional PRN claim');
reset role;
delete from public.institution_memberships where user_id='10000000-0000-4000-8000-000000000003';
set local role authenticated;
select campuspass_tests.ok((public.get_student_account()->'membership')='null'::jsonb,'deleted membership cannot be restored by the student');
reset role;
update public.institution_memberships set expires_at=now()-interval '1 minute' where user_id='10000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims', jsonb_build_object('sub','10000000-0000-4000-8000-000000000002','role','authenticated','session_id','20000000-0000-4000-8000-000000000002','exp',extract(epoch from now())+3600)::text,true);
set local role authenticated;
select campuspass_tests.ok((public.get_student_account()->'membership'->>'status')='expired','expired membership cannot confer active association');
reset role;
delete from auth.sessions where user_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
select campuspass_tests.ok((select count(*) from public.student_profiles)=0,'revoked Auth session denies RLS reads before JWT expiry');
select campuspass_tests.denied($q$select public.get_student_account()$q$,'42501','revoked session denies account RPC');
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub','10000000-0000-4000-8000-000000000001','role','authenticated','session_id','20000000-0000-4000-8000-000000000001','exp',extract(epoch from now())-1)::text,true);
set local role authenticated;
select campuspass_tests.denied($q$select public.save_student_profile('Expired Student','002026123456','Other','First year')$q$,'42501','expired JWT denies writes');
reset role;
set local role anon;
select campuspass_tests.denied($q$select * from public.student_profiles$q$,'42501','anonymous private profile access denied');
select campuspass_tests.denied($q$select public.get_student_account()$q$,'42501','anonymous RPC access denied');
reset role;
rollback;
