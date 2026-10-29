---
name: One Portfolio
description: Everything you've invested, as a clean dark dashboard with a 3D scene of its own on every screen, built only from your own statements.
colors:
  page: "#121513"
  card: "#1b1f1d"
  tint: "#232825"
  tint-2: "#2c322e"
  line: "#2f3531"
  ink: "#f3f6f1"
  body: "#c8d0c9"
  muted: "#939d95"
  lime: "#c4f25a"
  lime-2: "#5fe37a"
  on-lime: "#0d1a07"
  funds: "#a78bfa"
  stocks: "#22d3ee"
  bonds: "#fbbf24"
  abroad: "#f472b6"
  gain: "#4ade80"
  gain-ink: "#86efac"
  loss: "#f87171"
  loss-ink: "#fca5a5"
  warn: "#fbbf24"
typography:
  display:
    fontFamily: "Sora, Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(40px, 6.4vw, 76px)"
    fontWeight: 700
    letterSpacing: "-0.04em"
    fontFeature: '"tnum"'
  title:
    fontFamily: "Sora, Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
  body:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    lineHeight: 1.55
  note:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "13.5px"
rounded:
  hero: "32px"
  card: "24px"
  pill: "999px"
spacing:
  card-pad: "24px"
  card-pad-phone: "18px"
  content-max: "1200px"
  phone-gutter: "16px"
---

# Design

## The idea

A clean, dark dashboard in the style of modern gradient UI/UX landing pages: charcoal pages, a neon lime gradient for the
brand and every primary action, solid cards, and a 3D illustration at the top of every screen. The illustration is never
decoration for its own sake. Each screen's scene shows what that screen is about, drawn from your own numbers:

| Screen       | 3D scene                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| Home         | a dashboard: monitor with 12 months of worth and the split, a phone with the goal ring, floating cards |
| Mutual funds | twelve month-end values as 3D bars, this month glowing                                                 |
| Stocks       | the 12-month line as a glowing tube, with your biggest stocks as tiles                                 |
| Bonds        | a coin stack for each coming month's payouts, and the payout calendar                                  |
| Abroad       | a spinning globe with a pin on the US, Japan and London, sized by how much is there                    |
| Goals        | a staircase to the goal's flag, lit as far as your likely path gets you                                |
| Monthly plan | the abroad split as a 3D donut, each slice raised by how full it is against its target                 |
| Sell & tax   | the next long-term date's month as a calendar block, with an hourglass                                 |
| Checklist    | a clipboard with this year's jobs ticked off                                                           |
| Ask          | your question and an answer from your numbers as chat bubbles                                          |
| Upload       | a folder with your latest statement files floating into it                                             |

Every scene stands on the same round podium in front of a glowing disc in the screen's accent colour (lime on Home, the
category colour on category screens).

## Colour

- **Lime gradient** (`#c4f25a → #5fe37a`, dark text on it) for the logo, the active tab, primary buttons and highlights.
- **One colour per category**, used the same way on tabs, chart lines, dots and its 3D scene: funds violet, stocks
  cyan, bonds amber, abroad pink.
- **Gains green, losses red**, always with a + or − so colour is never the only signal.
- Text: ink `#f3f6f1` on cards (15:1), body `#c8d0c9` (10:1), muted `#939d95` (5.6:1).

## Speed

- No backdrop blur anywhere; the page background is a fixed CSS gradient painted once.
- One WebGL canvas per screen, inside the hero only. It holds still while you scroll, stops when it's off screen or
  when "reduce motion" is on, has no post-processing, and caps the pixel ratio at 1.5.
- The screens and cards inside the scenes are canvas textures, redrawn only when the numbers change.
- Without WebGL, a flat card with the glow disc and the headline figure is shown instead.

## Type

Sora for big figures and headings (tabular numbers, tight tracking); Inter for everything you read, with a separate subset
for the ₹ sign. Both are self-hosted under `app/fonts/` (SIL Open Font License). Amounts use the Indian short form
(₹6.75 L, ₹1.2 Cr) in headlines and the full figure in tables.

## Layout

- Content max 1200 px; phone gutter 16 px; no horizontal scroll at 390 px. Wide tables become labelled blocks on phones.
- Desktop: top bar with category-coloured dots, the ₹/$ toggle, lock and sign out. Phones: a bottom bar of six plus _More_.
- Hero: text and figures on the left, the 3D scene on the right (above the text on phones).
- Category screens: hero → four stats → 12-month growth chart → "if you keep going" projection → holdings.

## Motion

Framer Motion variants in `lib/motion.ts` (slide in, rise in, stagger), triggered once when scrolled into view; figures
count up; the 3D scenes float gently and lean towards the pointer. Everything respects `prefers-reduced-motion`.

## Game layer

Kept in full: levels and XP, monthly missions, achievements and a buying streak, rewarding steady investing and good habits.
