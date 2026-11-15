-- One Portfolio: index history for "you vs the Nifty 50" (same money, same days, put in the index instead).
-- Public market data only, nothing about a person. Everyone signed in can read it; only the market-data function
-- (service role) writes it.
create table if not exists public.market_index (
  key text primary key,
  name text not null,
  -- where the numbers come from (an index fund's NAV, which includes dividends and a small yearly cost)
  source text,
  -- [[yyyy-mm-dd, value], ...] oldest first
  points jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.market_index enable row level security;
drop policy if exists "read market_index" on public.market_index;
create policy "read market_index" on public.market_index for select to authenticated using (true);
revoke insert, update, delete on public.market_index from anon, authenticated;
