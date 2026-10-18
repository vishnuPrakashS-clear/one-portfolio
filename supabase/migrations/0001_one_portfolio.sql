-- One Portfolio: database setup (already applied to the "one-portfolio" project; kept here so it can be recreated).
-- The whole app state is one JSON document per user. Every change keeps the previous version in portfolio_history.

create table if not exists public.portfolio (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create unique index if not exists portfolio_user_id_key on public.portfolio (user_id);
create table if not exists public.portfolio_history (
  id bigserial primary key,
  portfolio_id text not null references public.portfolio(id) on delete cascade,
  user_id uuid,
  data jsonb not null,
  saved_at timestamptz not null default now()
);
create index if not exists portfolio_history_pid_saved on public.portfolio_history (portfolio_id, saved_at desc);

-- helper functions live in a schema the public API doesn't expose
create schema if not exists app_private;
grant usage on schema app_private to authenticated;

-- who may use the app; sign-up is refused for any other email
create table if not exists public.allowed_users (email text primary key);
-- insert into public.allowed_users (email) values ('you@example.com');

create or replace function app_private.is_allowed() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users a where lower(a.email) = lower(coalesce(auth.jwt()->>'email', '')));
$$;
create or replace function app_private.guard_signup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.allowed_users a where lower(a.email) = lower(new.email)) then raise exception 'Sign-up is closed for this app'; end if;
  return new;
end $$;
create trigger guard_signup_trg before insert on auth.users for each row execute function app_private.guard_signup();
-- the first allowed account to sign up takes over the existing portfolio row (id 'main')
create or replace function app_private.claim_portfolio() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.portfolio set user_id = new.id where id = 'main' and user_id is null;
  return new;
end $$;
create trigger claim_portfolio_trg after insert on auth.users for each row execute function app_private.claim_portfolio();

create or replace function app_private.portfolio_keep_history() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.data is distinct from new.data then
    insert into public.portfolio_history (portfolio_id, user_id, data, saved_at) values (old.id, old.user_id, old.data, old.updated_at);
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger portfolio_history_trg before update on public.portfolio for each row execute function app_private.portfolio_keep_history();

-- row-level security: each signed-in, allowed user reaches only their own row; the public (anon) role reaches nothing
alter table public.portfolio enable row level security;
alter table public.portfolio_history enable row level security;
alter table public.allowed_users enable row level security;
create policy "owner reads own portfolio" on public.portfolio for select to authenticated using (user_id = auth.uid() and app_private.is_allowed());
create policy "owner adds own portfolio" on public.portfolio for insert to authenticated with check (user_id = auth.uid() and app_private.is_allowed());
create policy "owner changes own portfolio" on public.portfolio for update to authenticated using (user_id = auth.uid() and app_private.is_allowed()) with check (user_id = auth.uid() and app_private.is_allowed());
create policy "owner reads own history" on public.portfolio_history for select to authenticated using (user_id = auth.uid() and app_private.is_allowed());
grant select, insert, update on public.portfolio to authenticated;
grant select on public.portfolio_history to authenticated;

-- price refresh helpers used by the refresh-prices Edge Function (run with the service role)
-- (full bodies: see supabase/sql/price_refresh.sql)

-- daily schedule: 01:40 UTC = 07:10 IST, Tuesday–Saturday (after US and London close)
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('one-portfolio-daily-prices', '40 1 * * 2-6',
  $$select net.http_post(url := 'https://iyzxzurxeddznihyrhfw.supabase.co/functions/v1/refresh-prices', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 120000);$$);
