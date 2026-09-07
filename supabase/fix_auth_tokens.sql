-- ============================================================================
-- GarageFlow — repair seeded auth users (v3, plain statements)
--
-- "Database error querying schema" on login = GoTrue can't scan NULL token
-- columns left by the seed's direct INSERT into auth.users. Set them to ''.
-- (Do NOT touch `phone` — it stays NULL and is UNIQUE.)
-- Safe to run repeatedly.
-- ============================================================================

update auth.users set confirmation_token         = '' where confirmation_token is null;
update auth.users set recovery_token             = '' where recovery_token is null;
update auth.users set email_change_token_new     = '' where email_change_token_new is null;
update auth.users set email_change               = '' where email_change is null;
update auth.users set email_change_token_current = '' where email_change_token_current is null;
update auth.users set phone_change               = '' where phone_change is null;
update auth.users set phone_change_token         = '' where phone_change_token is null;
update auth.users set reauthentication_token     = '' where reauthentication_token is null;

-- normalise identity_data verification flags
update auth.identities
set identity_data = coalesce(identity_data, '{}'::jsonb)
                    || jsonb_build_object('email_verified', true, 'phone_verified', false)
where provider = 'email'
  and (identity_data ? 'email_verified') is not true;

-- drop the throwaway probe account from diagnosis
delete from auth.users where email = 'gftest001@gmail.com';

-- verification — should list the 15 demo users, no error
select email, (email_confirmed_at is not null) as confirmed, created_at
from auth.users
order by created_at;
