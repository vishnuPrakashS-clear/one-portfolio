# Contributing

## Getting started

```bash
npx -y npm@11.6.2 install   # npm 11; npm 10 trips over the eslint/vitest peer dependencies
npm run dev                 # http://localhost:3000/one-portfolio/
```

Node 20.9 or newer (CI uses Node 22).

## Before you open a pull request

```bash
npm run check   # types, lint, tests
npm run build   # static export into out/
```

Then look at every screen you touched at a phone width (390 px) and a desktop width, with motion on and with "reduce motion" turned on.

## Ground rules

- **No manual data entry.** Every figure comes from an uploaded statement or a price feed. New features should read from statements, not ask people to type numbers.
- **Plain words.** Many people using this are new to investing: "bought for", "worth now", "gain" — not "cost basis", "MTM", "unrealised P&L".
- **Free tiers only.** Don't add a paid service or anything that needs a server beyond Supabase's free plan.
- **No personal data.** Synthetic data in tests and screenshots only. Files named `tests/*.local.test.ts` are ignored by git for checks against your own real statements.
- **Logic stays pure.** Parsing, tax and projection code lives in `lib/` with no React imports, and gets a unit test in `tests/`.

## Where things go

| Folder                            | What lives there                                                      |
| --------------------------------- | --------------------------------------------------------------------- |
| `app/`                            | routes (one folder per screen), layout, global styles, fonts          |
| `components/main/`                | app-wide pieces: navbar, footer, the 3D space background              |
| `components/screens/`             | one component per screen                                              |
| `components/sub/`                 | small reusable UI: cards, charts, chips, dialogs                      |
| `components/providers/`           | portfolio data and UI state                                           |
| `lib/core/`                       | statement readers, tax rules, XIRR                                    |
| `lib/`                            | the growth model, game layer, Supabase, uploads, dates and formatting |
| `constants/`, `config/`, `types/` | shared constants, site config, data types                             |
| `supabase/`                       | database migration, SQL functions, edge functions                     |

## Commits

Short, imperative subject ("Add Zerodha tradebook reader"), with a body explaining why when it isn't obvious.
