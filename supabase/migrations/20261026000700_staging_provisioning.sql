-- Operator-only staging provisioning identity. No runtime/API client uses this table.
begin;
create table private.staging_provisioning (
 singleton boolean primary key default true check(singleton),
 environment text not null check(environment='staging'),
 cover_key_fingerprint text not null check(cover_key_fingerprint ~ '^[0-9a-f]{64}$'),
 invitation_key_fingerprint text not null check(invitation_key_fingerprint ~ '^[0-9a-f]{64}$'),
 provisioned_at timestamptz not null default clock_timestamp()
);
alter table private.staging_provisioning enable row level security;
revoke all on private.staging_provisioning from public,anon,authenticated,service_role;
commit;
