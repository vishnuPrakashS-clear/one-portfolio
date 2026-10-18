# One Portfolio

A private dashboard for investments in **India, the US and Japan**: Indian shares, mutual funds, ETFs, bonds and InvITs (from CDSL/NSDL statements and Groww, Zerodha, Wint Wealth and IndiaBonds reports) and a US/London sleeve bought through INDmoney.

You never type numbers in: everything comes from uploaded reports (Excel, CSV or PDF). The app works out holdings, buy prices, purchase dates, long-term and short-term tax status, bond payouts and the monthly ₹10,000 buy plan.

Everything runs on free tiers:

| Part | Service (free tier) | What it does |
|---|---|---|
| Website | **GitHub Pages** | serves `index.html` and `src/` (static files, no build step) |
| Login | **Supabase Auth** | email + password; sign-up is refused for any email not on the allow-list |
| Data | **Supabase Postgres** | one JSON document per user in `public.portfolio`, protected by row-level security; every change keeps the previous version in `public.portfolio_history` |
| Daily prices | **Supabase Edge Function + pg_cron** | `refresh-prices` runs 07:10 IST Tuesday–Saturday: US/London closes, Indian share prices and fund NAVs, the INDmoney ₹/$ rate and the copper value check |
| AI helper (optional) | **Supabase Edge Function + Google Gemini free API** | reads screenshots and image-only PDFs, answers questions; off until you add a key |

## How it fits together

```
Browser (GitHub Pages)  ──sign in──▶  Supabase Auth
        │                                  │ access token
        └──read / save your row──▶  Postgres (row-level security: only your own row)
                                           ▲
   pg_cron 01:40 UTC ──▶ Edge Function refresh-prices ──▶ Yahoo Finance · mfapi.in · INDmoney · screener.in
```

## Files

```
index.html                         page markup and script order
src/styles.css                     all styles
src/core.js                        report parsing, holdings, tax rules, monthly split
src/app.js                         screens: overview, India, holdings, plan, tax, calendar, upload
src/cloud.js                       Supabase: sign-in screen, load/save, "refresh now", AI helper
src/vendor/                        supabase-js 2.118.0 and topojson-client 3.1.0 (pinned copies)
supabase/migrations/               tables, row-level security, sign-up allow-list, history, schedule
supabase/sql/price_refresh.sql     the two database functions the price refresh uses
supabase/functions/refresh-prices  the daily price refresh
supabase/functions/ai              the optional AI helper
.github/workflows/pages.yml        publishes the site on every push to main
```

## Setup (already done for the owner's project)

1. **Database**: run `supabase/migrations/0001_one_portfolio.sql` and `supabase/sql/price_refresh.sql` in the Supabase SQL editor, and add your email to `public.allowed_users`.
2. **Functions**: deploy `supabase/functions/refresh-prices` (JWT check off; it rate-limits itself to one run every 3 hours) and `supabase/functions/ai` (it checks the caller's sign-in itself).
3. **Auth settings** (Supabase dashboard → Authentication → URL Configuration): set **Site URL** to your GitHub Pages address, e.g. `https://<user>.github.io/<repo>/`, so confirmation and password-reset emails come back to the app.
4. **Website**: push to `main`; the workflow publishes to GitHub Pages (Settings → Pages → Source: GitHub Actions).
5. **Optional AI helper**: create a free key at Google AI Studio, then Supabase dashboard → Edge Functions → Secrets → add `GEMINI_API_KEY`. Google may use free-tier requests to improve its models, so leave it off if you'd rather not send screenshots there.

The publishable key in `src/cloud.js` is safe to commit: it only identifies the project. What anyone can read or change is decided by row-level security in the database, and the anonymous role can read nothing.

## Free-tier notes

- A free Supabase project pauses after about a week without activity; the daily refresh keeps it active. If it ever pauses, restore it from the dashboard. Nothing is lost.
- Supabase's built-in email sender allows only a few emails an hour. That's plenty for one person's sign-up and password resets.
- GitHub Pages is free for **public** repositories. The repo holds only code; your portfolio data stays in Supabase behind your login.

Planning aid, not SEBI-registered advice. Tax figures are estimates.
