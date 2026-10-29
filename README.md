# One Portfolio

**All your money, in one clear picture.** A private, multi-user investment tracker for India, the US and Japan. Upload
your statements (CDSL/NSDL CAS, Groww, Zerodha, Wint Wealth, IndiaBonds, INDmoney) and see everything you own on a clean
dark dashboard. Every screen opens with a 3D scene of its own, drawn from your numbers: a dashboard on Home, 3D bars for
mutual funds, a growth line for stocks, coin stacks of coming bond payouts, a globe for money abroad, a staircase to your
goal and more.

You never type numbers in. The app reads holdings, buy prices, purchase dates and your monthly SIP from the statements,
and answers the questions people actually have:

- **How much do I have, and is it growing?** Worth vs. what you put in, month by month for the last 12 months, per category.
- **Where will this SIP take me?** A cautious / likely / strong range for 5, 10, 15 and 20 years, next to your own XIRR.
- **Will I reach my goal?** Tap a goal amount and year; it says _on track_, _close_ or _not yet_, and how much more a month would close the gap.
- **What about tax?** Long-term dates, tax if sold today, and when to sell-and-rebuy to use the yearly exemption.

A game layer (levels, XP, monthly missions, achievements, a buying streak) rewards steady investing.

> Planning aid, not SEBI-registered advice. Projections are estimates, not promises; tax figures are estimates for your CA to confirm.

## Tech stack

|            |                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Framework  | [Next.js 16](https://nextjs.org) (App Router, static export) · React 19 · TypeScript (strict)                      |
| Styling    | [Tailwind CSS v4](https://tailwindcss.com) (CSS-first `@theme` tokens)                                             |
| Motion     | [Framer Motion](https://motion.dev) — scroll-in variants, count-ups, reduced-motion aware                          |
| 3D         | [React Three Fiber](https://r3f.docs.pmnd.rs) · drei, with canvas textures of your numbers; paused while scrolling |
| Data       | [Supabase](https://supabase.com) — Auth, Postgres with row-level security, Edge Functions, pg_cron                 |
| Statements | pdf.js and SheetJS, loaded on demand; files are read in the browser                                                |
| Quality    | ESLint (Next + React Compiler rules) · Prettier with the Tailwind plugin · Vitest · GitHub Actions · Dependabot    |
| Hosting    | GitHub Pages                                                                                                       |

## Project structure

```
app/                    one folder per route: / funds stocks bonds abroad goals plan tax checklist ask upload
  fonts/                Sora and Inter, self-hosted (SIL Open Font License)
  globals.css           design tokens (@theme), surfaces, buttons, chips, charts
components/
  main/                 navbar, footer, status row, dialogs, page backdrop
    art/                the 3D heroes: scenes.tsx (one scene per screen), textures.ts, hero-art.tsx (data + fallback)
  screens/              one component per screen
  sub/                  cards, charts, chips, count-up, holding sheet, game layer
  providers/            portfolio data (load, save, lock) and UI state
  auth/                 sign-in, sign-up, password reset, PIN lock
lib/
  core/                 statement readers (CAS, broker sheets, INDmoney), Indian tax rules, XIRR
  model.ts              monthly growth series, SIP detection, projections, goal check
  game.ts               missions, achievements, streak, level
  supabase.ts           cloud load/save, refresh now, AI helper
  upload.ts             reads uploaded files and routes them to the right reader
constants/  config/  types/
supabase/
  migrations/           tables, row-level security, sign-up cap, history, schedule
  sql/                  database functions the price refresh uses
  functions/            refresh-prices (daily), price-history (month-end prices), ai (optional)
tests/                  unit tests on synthetic data
```

## Getting started

```bash
npx -y npm@11.6.2 install   # npm 11 (npm 10 trips over a peer-dependency resolution)
npm run dev                 # http://localhost:3000/one-portfolio/
```

| Script           | Does                                   |
| ---------------- | -------------------------------------- |
| `npm run dev`    | local dev server                       |
| `npm run build`  | static export into `out/`              |
| `npm start`      | serves `out/` locally                  |
| `npm run check`  | types, lint and tests (what CI runs)   |
| `npm run format` | Prettier, with Tailwind classes sorted |

Copy `.env.example` to `.env.local` to point at your own Supabase project.

## How it fits together

```
Browser (GitHub Pages)  ──sign in──▶  Supabase Auth
        │                                  │ access token
        └──read / save your row──▶  Postgres (row-level security: only your own row)
                                           ▲
   pg_cron 07:10 IST Tue–Sat ──▶ refresh-prices ──▶ Yahoo Finance · mfapi.in · INDmoney · screener.in
   pg_cron nightly           ──▶ price-history  ──▶ month-end prices for the growth charts
```

Everything runs on free tiers:

| Part                 | Free tier                              | What it does                                                                                                                                             |
| -------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website              | GitHub Pages                           | the static export, rebuilt by CI on every push to `main`                                                                                                 |
| Login                | Supabase Auth                          | email + password for anyone with the link (capped at 100 accounts)                                                                                       |
| Data                 | Supabase Postgres                      | one JSON document per person; every change keeps the previous version (newest 30)                                                                        |
| Daily prices         | Edge Function + pg_cron                | US/London closes, Indian share prices and fund NAVs, the ₹/$ rate; each symbol fetched once for everyone, with a per-portfolio limit on new code lookups |
| Price history        | Edge Function + pg_cron                | month-end prices for each holding, so growth charts show real history                                                                                    |
| AI helper (optional) | Edge Function + Google Gemini free API | reads screenshots and image-only PDFs, answers questions; off until a key is added                                                                       |

## Privacy

- Each person signs in with their own account. **Row-level security** lets a signed-in person read, change or delete only their own row; the publishable key in the page can read nothing by itself.
- Statements are opened in the browser. A CAS password is used only to open the file there and is never saved or sent.
- The app never stores or shows PAN, address, client IDs, folio or account numbers.
- The person running the Supabase project can see all rows in its dashboard, so only invite people who are comfortable with that.
- Anyone can delete their own data from **Upload → Security → Delete all my data**.

See [SECURITY.md](SECURITY.md) to report a problem.

## Setting up your own copy

1. **Database**: run `supabase/migrations/0001_one_portfolio.sql` and `supabase/sql/price_refresh.sql` in the Supabase SQL editor.
2. **Functions**: deploy `supabase/functions/*` with the JWT check off — each function checks the caller itself (a signed-in person refreshes only their own row; refreshing everyone needs the job key in `public.job_keys` that only the schedule sends).
3. **Auth**: set the Site URL to your Pages address, and turn off "Confirm email" (Supabase's built-in email only reaches the project's own team unless you add SMTP).
4. **Website**: Settings → Pages → Source: GitHub Actions, then push to `main`.
5. **AI helper (optional)**: add a free Google AI Studio key as the `GEMINI_API_KEY` function secret. Free-tier requests may be used by Google to improve its models, so leave it off if you'd rather not send screenshots there.

**Free-tier notes:** a Supabase project pauses after about a week without activity (the daily refresh keeps it awake; restoring loses nothing). Each portfolio is roughly 150 KB plus history, far inside the free 500 MB.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Design and product notes live in [DESIGN.md](DESIGN.md) and [PRODUCT.md](PRODUCT.md).

## Credits

Layout, motion patterns and project structure inspired by [sanidhyy/space-portfolio](https://github.com/sanidhyy/space-portfolio) (MIT).

## License

[MIT](LICENSE)
