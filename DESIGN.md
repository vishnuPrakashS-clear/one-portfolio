---
name: One Portfolio
description: Your money as a solar system — everything you've invested, built only from your own statements.
colors:
  space: "#030014"
  deep: "#0a0620"
  surface: "#120c2c"
  raised: "#1d1544"
  ink: "#f6f4ff"
  body: "#d9d3f2"
  muted: "#a99fd0"
  line: "rgb(255 255 255 / 0.12)"
  rule: "rgb(255 255 255 / 0.07)"
  funds: "#c084fc"
  stocks: "#22d3ee"
  bonds: "#fbbf24"
  abroad: "#fb7185"
  goal: "#34d399"
  gain: "#34d399"
  gain-ink: "#6ee7b7"
  loss: "#f87171"
  loss-ink: "#fca5a5"
  warn: "#fbbf24"
  warn-ink: "#fde68a"
  action-from: "#22d3ee"
  action-to: "#a78bfa"
  on-action: "#08051a"
typography:
  display:
    fontFamily: "Sora, Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(40px, 7vw, 72px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: '"tnum"'
  headline:
    fontFamily: "Sora, Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
  title:
    fontFamily: "Sora, Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  note:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  chip:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1
rounded:
  card: "22px"
  card-phone: "18px"
  input: "12px"
  pill: "999px"
spacing:
  card-pad: "24px"
  card-pad-phone: "18px"
  stack: "16px"
  content-max: "1200px"
  phone-gutter: "16px"
---

# Design

## The idea

Your portfolio is a solar system. The **sun** is your total. Each **planet** is a category — Mutual funds, Stocks, Bonds,
Abroad — sized by how much is in it, on its own orbit. Each **moon** is one holding, sized by its value and coloured green
when it's above what you paid or red when it's below. Tap a planet to fly to it; tap a moon to open that holding.

It reads like a student 3D portfolio site (deep space, drifting stars, glowing gradients, things sliding in as you
scroll) but every number on it is yours and every screen answers a plain question: _How much do I have? Is it growing?
Will I reach my goal?_

## Colour

- **One colour per category**, used identically on the planet, its tab, its chart line, its dot and its card accent:
  funds violet `#c084fc`, stocks cyan `#22d3ee`, bonds amber `#fbbf24`, abroad rose `#fb7185`. The goal is emerald `#34d399`.
- **Gains green, losses red**, always paired with a sign or arrow so colour is never the only signal.
- **Text on glass**: content sits on dark glass (`rgb(14 9 34 / 0.72)` with a 16 px blur) over the stars, so body text
  (`#d9d3f2`) and figures (`#f6f4ff`) keep at least 7:1 contrast wherever the scene is behind them. Muted notes
  (`#a99fd0`) stay above 4.5:1.
- **Primary action** is a cyan→violet gradient with near-black text. One primary button per card.

## Type

Sora for big figures and headings (tabular numbers, tight tracking); Inter for everything you read, with a separate
subset for the ₹ sign. Both are self-hosted under `app/fonts/` (SIL Open Font License). Amounts use the Indian short form
(₹6.75 L, ₹1.2 Cr) in headlines and the full figure on tap or in tables.

## Space scene

- Built with React Three Fiber: the sun and planets use small custom shaders; moons are one instanced mesh per planet;
  the nebula is painted once into a texture; stars use a seeded generator so the sky is the same on every visit.
- Bloom and a vignette give the glow. Adaptive resolution and a performance monitor drop quality on slow phones.
- The camera has three views: **home** (the whole system), **focus** (flies to the planet for the screen you're on) and
  **distant** (pulled back behind the non-category screens). Movement is time-based so it feels the same at any frame rate.
- With _reduce motion_ on, orbits stop and the camera cuts instead of flying. Without WebGL, a static star field is shown.
- When there's no data yet, a demo system is shown and clearly labelled.

## Layout

- Content max 1200 px. Phone gutter 16 px; no horizontal scroll at 390 px.
- Desktop: top navbar with category-coloured tabs, the ₹/$ toggle, lock and sign out.
  Phone: a bottom bar of six with a _More_ menu.
- Every category screen has the same order: hero (worth now, gain, since when) → four stats → 12-month growth chart
  (worth vs. put in) → "if you keep going" projection (cautious / likely / strong over 5, 10, 15, 20 years) → holdings.

## Components

| Component                                       | Notes                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `card`                                          | dark glass, 22 px radius (18 px on phones), 24 px padding                                       |
| `btn` / `btn-primary` / `btn-danger`            | pill buttons, 40 px min height, press scales to 0.97                                            |
| `chip` / `chip-good` / `chip-wait` / `chip-act` | status labels; goal and SIP choices are tap chips, never typed                                  |
| `pill`                                          | figures in the hero (gain, XIRR, monthly SIP)                                                   |
| `kicker` / `note`                               | small labels and plain-language help                                                            |
| Charts                                          | hand-built SVG: stacked growth, line with dashed "put in", goal path with three bands           |
| Holding sheet                                   | slides up from the bottom on phones, side panel on desktop: every lot, tax status, bond payouts |

## Motion

Framer Motion variants in `lib/motion.ts`: slide in from left, right or top, rise in, staggered children, triggered once
when scrolled into view. Figures count up. Everything respects `prefers-reduced-motion` through `MotionConfig`.

## Game layer

Kept in full: levels and XP, monthly missions (buy this month, upload a fresh statement, check your goal, sell-and-rebuy
for tax, hold long-term), achievements (First trade, Globe trotter, Four planets, Tax-smart, Patience pays, 3-month
streak, Bullseye, Paperwork pro) and a buying streak. It rewards steady investing and good habits, never trading more.
