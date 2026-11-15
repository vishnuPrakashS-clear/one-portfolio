-- One Portfolio: shared market data for the Portfolio health screen (diversification, overlap, fund and stock checks).
-- These tables hold only public market data (what each fund holds, fund costs and returns, stock fundamentals, NSE
-- sector and market-cap lists), never anything about a person. Everyone signed in can read them; only the
-- market-data function (service role) writes them.

-- NSE index lists: sector (NSE industry) and market-cap band for about 750 listed companies
-- cap: L = Nifty 100 (large), M = Nifty Midcap 150 (mid), S = the rest of the Nifty Total Market (small)
create table if not exists public.market_class (
  isin text primary key,
  symbol text,
  name text not null,
  industry text,
  cap text check (cap in ('L', 'M', 'S')),
  updated_at timestamptz not null default now()
);

-- one row per fund or ETF held by anyone (keyed by the ISIN in their statement)
create table if not exists public.market_fund (
  isin text primary key,
  search_id text,
  scheme_code text,
  name text,
  -- category, plan, expense ratio, fund size, risk, benchmark, 1/3/5-year returns vs category, rank, alpha, beta, sharpe
  info jsonb,
  -- what the fund holds: [{n: name, i: isin|null, g: groww stock id, s: sector, w: % of fund, t: E|D|C|G|F|O, c: L|M|S|F|null}]
  holdings jsonb,
  as_of date,
  fetched_at timestamptz,
  miss date
);

-- one row per listed stock held directly by anyone
create table if not exists public.market_stock (
  isin text primary key,
  search_id text,
  nse text,
  name text,
  industry text,
  -- market cap (Cr), P/E, industry P/E, P/B, ROE, debt/equity, dividend yield, revenue and profit growth, margin, promoter %
  info jsonb,
  fetched_at timestamptz,
  miss date
);

alter table public.market_class enable row level security;
alter table public.market_fund enable row level security;
alter table public.market_stock enable row level security;
drop policy if exists "read market_class" on public.market_class;
drop policy if exists "read market_fund" on public.market_fund;
drop policy if exists "read market_stock" on public.market_stock;
create policy "read market_class" on public.market_class for select to authenticated using (true);
create policy "read market_fund" on public.market_fund for select to authenticated using (true);
create policy "read market_stock" on public.market_stock for select to authenticated using (true);
revoke insert, update, delete on public.market_class, public.market_fund, public.market_stock from anon, authenticated;

-- nightly fill (live schedule): every 10 minutes between 03:30 and 05:20 IST; each run does a small batch and does
-- nothing once all is fresh. Run once with your own project URL; the job key comes from public.job_keys, as for the
-- daily price refresh. A fresh project fills faster with a temporary '*/2 * * * *' job, unscheduled once done.
-- select cron.schedule('one-portfolio-market-data', '*/10 22-23 * * *', $$select net.http_post(
--   url := 'https://iyzxzurxeddznihyrhfw.supabase.co/functions/v1/market-data',
--   headers := jsonb_build_object('Content-Type', 'application/json', 'x-job-key', (select secret from public.job_keys where name = 'market-data')),
--   body := '{}'::jsonb, timeout_milliseconds := 140000);$$);
