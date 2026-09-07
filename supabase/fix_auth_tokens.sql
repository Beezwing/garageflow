-- ============================================================================
-- GarageFlow — repair seeded auth rows so GoTrue can read them
--
-- Symptom: every seeded user login fails with "Database error querying schema"
-- and "Database error finding users". Cause: a direct INSERT into auth.users
-- leaves nullable varchar columns (confirmation_token, email_change, ...) NULL,
-- and GoTrue scans them into non-nullable Go strings -> the whole query errors.
--
-- This coalesces EVERY text/varchar column in auth.users (and the token-ish
-- columns in auth.identities) from NULL to ''. Safe to run repeatedly.
-- ============================================================================
do $$
declare
  col text;
  n   int;
begin
  for col in
    select column_name
    from information_schema.columns
    where table_schema = 'auth' and table_name = 'users'
      and data_type in ('character varying', 'text')
  loop
    execute format('update auth.users set %I = '''' where %I is null', col, col);
  end loop;

  get diagnostics n = row_count;
  raise notice 'auth.users varchar NULLs coalesced.';
end $$;

-- identity_data should carry the standard verification flags
update auth.identities
set identity_data = coalesce(identity_data, '{}'::jsonb)
                    || jsonb_build_object(
                         'email_verified',
                         coalesce((identity_data->>'email_verified')::boolean, true),
                         'phone_verified',
                         coalesce((identity_data->>'phone_verified')::boolean, false))
where provider = 'email';

-- remove the throwaway probe account created while diagnosing
delete from auth.users where email = 'gftest001@gmail.com';

-- quick check: should return the 15 demo users with no error
select email, email_confirmed_at is not null as confirmed
from auth.users
order by created_at
limit 20;
