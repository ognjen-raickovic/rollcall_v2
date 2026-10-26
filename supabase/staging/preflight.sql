-- READ ONLY. Run as the reviewed operator before migration and again afterward.
-- These queries return schema/capability metadata, never keys, hashes or account rows.
select current_user,current_setting('server_version') as postgres_version;
select rolcreaterole,rolbypassrls,rolsuper from pg_roles where rolname=current_user;
select extname,extversion,n.nspname as schema from pg_extension e
 join pg_namespace n on n.oid=e.extnamespace where extname in ('unaccent','pg_trgm','pgcrypto');
select to_regclass('auth.users') is not null as auth_present,
 to_regprocedure('auth.uid()') is not null as auth_subject_helper,
 to_regclass('storage.buckets') is not null as storage_present,
 to_regprocedure('storage.allow_only_operation(text)') is not null as storage_operation_helper,
 to_regprocedure('extensions.digest(text,text)') is not null as crypto_digest;
select n.nspname as schema,c.relname,c.relrowsecurity,c.relforcerowsecurity,
 pg_get_userbyid(c.relowner) as owner from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind='r' and (n.nspname='private' or n.nspname='public' and c.relname in
 ('countries','cities','games','profiles','user_game_experience','events','event_participants')) order by 1,2;
select rolname,rolcanlogin,rolbypassrls,rolsuper,rolcreaterole,rolinherit from pg_roles
 where rolname like 'rollcall_%' order by rolname;
select r.rolname as executor,pg_has_role('anon',r.oid,'MEMBER') as anon_member,
 pg_has_role('authenticated',r.oid,'MEMBER') as authenticated_member from pg_roles r where rolname like 'rollcall_%';
select n.nspname as schema,p.proname as function,pg_get_function_identity_arguments(p.oid) as arguments,
 p.prosecdef as security_definer,pg_get_userbyid(p.proowner) as owner,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('search_cities','public_profile','my_profile',
 'update_my_profile','discover_events','get_event','create_event','join_event','get_event_cover',
 'my_permissions','change_admin_role','my_account_status') order by p.proname;
select evtname,evtenabled,evtevent from pg_event_trigger order by evtname;
-- Must remain private, 3 MiB, restricted MIME types. No object listing or mutation.
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='event-covers';
