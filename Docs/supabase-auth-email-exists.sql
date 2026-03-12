-- Creates a public RPC to check if an email exists in auth.users.
-- This enables email enumeration; use only if you accept that tradeoff.

create or replace function public.auth_email_exists(email_to_check text)
returns boolean
language sql
security definer
set search_path = auth, public
as $$
  select exists(
    select 1
    from auth.users
    where lower(email) = lower(email_to_check)
  );
$$;

revoke all on function public.auth_email_exists(text) from public;
grant execute on function public.auth_email_exists(text) to anon, authenticated;
