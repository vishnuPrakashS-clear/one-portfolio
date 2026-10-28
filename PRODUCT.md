# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- The owner: a young Indian investor who holds most of their money in India (mutual funds, shares, ETFs, bonds and NCDs through Groww, Zerodha, Wint Wealth, IndiaBonds and INDstocks) and invests a monthly amount in a US, Japan and London sleeve through INDmoney under the Liberalised Remittance Scheme. Opens the app mostly to see the total across everything and how it changed.
- Friends and family who sign up with the same link. Some are new to investing. They see only their own data.

## Product Purpose

One place that shows everything a person has invested, in India and abroad, built only from the statements they upload: no field is ever typed in by hand. Success means the total and its change are clear at a glance, and the monthly buy, the tax position and every holding's details are one step away.

## Positioning

It is built from the user's own statements (CDSL/NSDL CAS, Groww, Zerodha, Wint Wealth, IndiaBonds and INDmoney reports), reconciles them against each other, and turns them into a monthly buy plan for the overseas sleeve, Indian tax timing (long-term dates, tax if sold today) and bond payout calendars. A broker app only shows its own accounts; this shows all of them together, privately.

## Operating Context

- Statements are downloaded from each broker or depository and uploaded in the Upload tab; the app tells the user which report to fetch and from where.
- Prices refresh automatically every weekday morning (07:10 IST); the user can also refresh on demand.
- Money can be shown in US dollars or rupees; the rupee rate is the one INDmoney applies.
- Used on a phone as often as on a laptop.

## Capabilities and Constraints

- Sections: this month (overview and monthly plan), India, Upload, global holdings, monthly plan, sell and tax, growth plan, yearly checklist, ask (AI helper).
- Per-holding detail sheet: every purchase lot, returns, tax, bond maturity and payouts.
- A game layer that stays a main feature: levels, XP, quests, badges and streaks that reward investing steadily and following the plan.
- Accounts: email and password sign-up for anyone with the link (capped at 100), optional PIN lock, sign out, delete all my data. Data is private per account.
- Everything must stay on free tiers (GitHub Pages, Supabase free). Static site: plain HTML, CSS and JavaScript, no build step.
- Never store or show PAN, address, client IDs or folio/account numbers.

## Brand Commitments

- Name: One Portfolio.
- The user asked for a vibrant 3D interface: the 3D look stays throughout (an interactive 3D allocation chart and globe, depth on cards).
- The game layer (levels, XP, quests, badges, streaks) stays fully.

## Evidence on Hand

- The user's own uploaded statements are the only source of numbers. No invented returns, ratings, testimonials or market data.
- Market prices come from public sources in the daily refresh (Yahoo Finance chart data, mfapi.in, INDmoney's rupee rate).

## Product Principles

1. Nothing typed by hand: every number traces back to an uploaded statement or a public price.
2. The total and its change come first; detail is one tap away, never in the way.
3. Short by default, explained on demand: plain-language help is always reachable for new investors.
4. Private by construction: each person sees only their own data.
5. Planning aid, not advice: estimates are labelled, and the user's CA computes the real tax.

## Accessibility & Inclusion

Works one-handed on a phone; every control reachable by keyboard; amounts readable in both themes; motion respects reduced-motion settings.
