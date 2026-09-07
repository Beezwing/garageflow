-- Read-only diagnostic. Run all three and paste the results back.

-- 1) One seeded user row (shows which columns are NULL)
select to_jsonb(u.*) as user_row
from auth.users u
where u.email = 'admin@kingstonauto.test';

-- 2) Its identity row
select to_jsonb(i.*) as identity_row
from auth.identities i
join auth.users u on u.id = i.user_id
where u.email = 'admin@kingstonauto.test';

-- 3) Which auth.users columns are NOT NULL-constrained but currently hold NULL
--    for that user
select c.column_name, c.data_type, c.is_nullable
from information_schema.columns c
where c.table_schema = 'auth' and c.table_name = 'users'
order by c.ordinal_position;
