-- Include only inside rolled-back legacy-domain fixture transactions, never migrations.
-- Emulate accounts that existed before DOB onboarding; new registration tests do NOT
-- include this helper. No production permissions/policies/triggers are disabled.
create function pg_temp.prepare_legacy_registration() returns trigger language plpgsql as $$
declare ticket uuid:=gen_random_uuid();
begin
 new.email:=coalesce(new.email,'fixture-'||new.id::text||'@example.test');
 insert into private.registration_intents(token,username,email_hash,date_of_birth)
 values(ticket,'u'||substr(md5(new.id::text),1,23),encode(extensions.digest(lower(btrim(new.email)),'sha256'),'hex'),'2000-01-01');
 new.raw_user_meta_data:=coalesce(new.raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('rollcall_registration_token',ticket);
 return new;
end; $$;
create trigger aaa_legacy_registration_fixture before insert on auth.users for each row execute function pg_temp.prepare_legacy_registration();
create function pg_temp.restore_legacy_profile_fixture() returns trigger language plpgsql as $$
begin
 delete from private.profile_private where profile_id=new.id;
 update public.profiles set display_name='RollCall player' where id=new.id;
 return new;
end; $$;
create trigger zzz_legacy_registration_fixture after insert on auth.users for each row execute function pg_temp.restore_legacy_profile_fixture();
