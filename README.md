# One Portfolio

A private, multi-user dashboard for investments in **India, the US and Japan**: Indian shares, mutual funds, ETFs, bonds and InvITs (from CDSL/NSDL statements and Groww, Zerodha, Wint Wealth and IndiaBonds reports) and a US/London sleeve bought through INDmoney.

You never type numbers in: everything comes from uploaded reports (Excel, CSV or PDF). The app works out holdings, buy prices, purchase dates, long-term and short-term tax status, bond payouts and the monthly ₹10,000 buy plan.

Everything runs on free tiers:

| Part | Service (free tier) | What it does |
|---|---|---|
| Website | **GitHub Pages** | serves `index.html` and `src/` (static files, no build step) |
| Login | **Supabase Auth** | email + password; anyone with the link can create an account (capped at 100 accounts) |
| Data | **Supabase Postgres** | one JSON document per person in `public.portfolio`; row-level security lets each signed-in person read, change or delete only their own row; every change keeps the previous version in `public.portfolio_history` (newest 30 per person) |
| Daily prices | **Supabase Edge Function + pg_cron** | `refresh-prices` runs 07:10 IST Tuesday–Saturday for every person's portfolio (each symbol fetched once): US/London closes, Indian share prices and fund NAVs, the INDmoney ₹/$ rate and the copper value check. "Refresh now" in the app refreshes only your own |
| AI helper (optional) | **Supabase Edge Function + Google Gemini free API** | reads screenshots and image-only PDFs, answers questions; off until a key is added; 40 requests per person per day |

## How it fits together

```
Browser (GitHub Pages)  ──sign in──▶  Supabase Auth
        │                                  │ access token
        └──read / save your row──▶  Postgres (row-level security: only your own row)
                                           ▲
   pg_cron 01:40 UTC ──▶ Edge Function refresh-prices ──▶ Yahoo Finance · mfapi.in · INDmoney · screener.in
```

## Privacy between people

Everyone signs in with their own email and password. The database itself enforces that a signed-in person can only read, change or delete the row whose `user_id` is theirs; the public key in the page can read nothing on its own. The person running the Supabase project can see all rows in the dashboard, so only invite people who are comfortable with that. Anyone can delete their own data from **Upload → Security → Delete all my data**.

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

1. **Database**: run `supabase/migrations/0001_one_portfolio.sql` and `supabase/sql/price_refresh.sql` in the Supabase SQL editor.
2. **Functions**: deploy `supabase/functions/refresh-prices` and `supabase/functions/ai` with the JWT check off. Both check the caller themselves: a signed-in person can only refresh their own row, and refreshing everyone needs the job key the schedule sends (`public.job_keys`).
3. **Auth settings** (Supabase dashboard → Authentication):
   - **URL Configuration** → **Site URL** = your GitHub Pages address, e.g. `https://<user>.github.io/<repo>/`.
   - **Sign In / Providers → Email** → turn **off "Confirm email"**, so new people can sign in straight after creating an account. (Supabase's free built-in email only delivers to the project's own team; add your own SMTP under Emails → SMTP Settings if you want confirmation and password-reset emails for everyone.)
4. **Website**: push to `main`; the workflow publishes to GitHub Pages (Settings → Pages → Source: GitHub Actions).
5. **Optional AI helper**: create a free key at Google AI Studio, then Supabase dashboard → Edge Functions → Secrets → add `GEMINI_API_KEY`. Google may use free-tier requests to improve its models, so leave it off if you'd rather not send screenshots there.

The publishable key in `src/cloud.js` is safe to commit: it only identifies the project. What anyone can read or change is decided by row-level security in the database, and the anonymous role can read nothing.

## Free-tier notes

- A free Supabase project pauses after about a week without activity; the daily refresh keeps it active. If it ever pauses, restore it from the dashboard. Nothing is lost.
- Supabase's built-in email sender only delivers to the project's team members and a few emails an hour. Other people can't receive password-reset emails unless you add an SMTP provider; the owner can reset a password from the Supabase dashboard (Authentication → Users).
- Each person's data is about 150 KB plus up to 30 saved versions, so the free 500 MB database holds well over the 100-account cap.
- GitHub Pages is free for **public** repositories. The repo holds only code; your portfolio data stays in Supabase behind your login.

Planning aid, not SEBI-registered advice. Tax figures are estimates.
