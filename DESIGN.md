---
name: One Portfolio
description: Everything you have invested, in India and abroad, built only from your own statements.
colors:
  lime: "#9fe870"
  lime-hi: "#b8f28f"
  lime-pale: "#e2f6d5"
  forest: "#163300"
  coin-rim: "#c7f5a6"
  coin-side: "#7fcf55"
  coin-edge: "#6fbf43"
  data-cyan: "#0a8bcc"
  data-teal: "#0b7078"
  data-coral: "#dc4f36"
  data-copper: "#b8692a"
  data-yellow: "#a37b00"
  data-sage: "#868a82"
  data-sky: "#38c8ff"
  gain: "#1d7436"
  gain-wash: "#e2f6d5"
  gain-ink: "#054d28"
  loss: "#c62f35"
  loss-wash: "#fde7e6"
  loss-ink: "#8f1219"
  loss-on-ink: "#ff9a90"
  caution: "#8a5a00"
  caution-wash: "#fff2bf"
  caution-ink: "#4a3b1c"
  sage-canvas: "#e8ebe6"
  card-white: "#ffffff"
  raised-sage: "#f2f4ef"
  sunk-sage: "#eef1ea"
  hairline: "#dfe3db"
  rule: "#ebeee7"
  control-stroke: "#c3c8bd"
  warm-ink: "#0e0f0c"
  body-ink: "#3f413e"
  muted-ink: "#5b5e58"
  ink-track: "#2a2d26"
  night-card: "#1a1c18"
  night-raised: "#23261f"
typography:
  display:
    fontFamily: "Figtree, Avenir Next, Segoe UI, system-ui, sans-serif"
    fontSize: "46px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontFeature: "\"tnum\""
  headline:
    fontFamily: "Figtree, Avenir Next, Segoe UI, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  figure:
    fontFamily: "Figtree, Avenir Next, Segoe UI, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.015em"
    fontFeature: "\"tnum\""
  title:
    fontFamily: "Figtree, Avenir Next, Segoe UI, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  subtitle:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "\"cv11\", \"calt\""
  body-sm:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "14.5px"
    fontWeight: 600
    lineHeight: 1.2
  label:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  chip:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1
rounded:
  swatch: "4px"
  control: "12px"
  inner: "16px"
  flip: "20px"
  card: "24px"
  pill: "999px"
spacing:
  hairline-gap: "4px"
  tight: "8px"
  inline: "12px"
  stack: "16px"
  gutter: "20px"
  card-pad: "24px"
  hero-pad: "28px"
components:
  button-primary:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.warm-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "9px 18px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.lime-hi}"
  button-secondary:
    backgroundColor: "{colors.raised-sage}"
    textColor: "{colors.warm-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "9px 18px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.loss-wash}"
    textColor: "{colors.loss-ink}"
    rounded: "{rounded.pill}"
    padding: "9px 18px"
  tab:
    textColor: "{colors.body-ink}"
    rounded: "{rounded.pill}"
    padding: "11px 14px"
  tab-selected:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.warm-ink}"
  currency-toggle-on:
    backgroundColor: "{colors.warm-ink}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.pill}"
    height: "32px"
  chip-good:
    backgroundColor: "{colors.gain-wash}"
    textColor: "{colors.gain-ink}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
  chip-wait:
    backgroundColor: "{colors.caution-wash}"
    textColor: "{colors.caution-ink}"
  chip-act:
    backgroundColor: "{colors.loss-wash}"
    textColor: "{colors.loss-ink}"
  chip-neutral:
    backgroundColor: "{colors.raised-sage}"
    textColor: "{colors.body-ink}"
  xp-pill:
    backgroundColor: "{colors.lime-pale}"
    textColor: "{colors.forest}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
  card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  card-total:
    backgroundColor: "{colors.warm-ink}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.card}"
    padding: "28px"
  tile:
    backgroundColor: "{colors.raised-sage}"
    rounded: "{rounded.inner}"
    padding: "14px 16px"
  input:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
    height: "44px"
---

# Design System: One Portfolio

## Overview

**Creative North Star: "The Pocket Ledger, Lit Up"**

One Portfolio is the familiar money app played straight: one total leads, India and abroad split beneath it, and every other job is one tab or tap away. Calm sage paper and white cards by day, warm ink by night; a heavy geometric face for the numbers that matter and Inter for everything you read and compare. The surface is quiet and flat so that the few vivid things (lime where you act, data hues where money sits, and solid 3D objects) carry the eye.

The 3D look and the game layer are part of the system, not decoration bolted on. The allocation ring and globe, the level medal, badge coins, flip cards and isometric icons are built as physical objects in flat tones: a lit top face, a darker side and a soft contact shadow. Levels, XP, quests, badges and streaks use the same cards, pills and type as the money; they are rewarded with lime, never with a separate visual dialect.

The system rejects the earlier emerald glass trading desk (blobs, glass, gradient fills, a ghost word behind the hero, icon-only tabs) and the mono-heavy dashboard look.

**Key Characteristics:**
- Sage canvas, white cards, no card borders and no resting shadows; warm-ink night theme with the same structure.
- One polarity-flipped total card per screen; everything else is a white card.
- Figtree 700–800 for headings and standalone figures, Inter for UI and table figures, tabular numerals everywhere money appears.
- Lime marks action, the current place and earned reward; bucket hues mark data; green and red mark change.
- Pills for every control, 24px cards, 16px inner tiles.
- Depth lives in 3D objects and pointer tilt, and respects reduced motion.

## Colors

A low-chroma sage neutral system with one electric lime and a six-hue data set; every hue has a job.

### Primary
- **Electric Lime** (lime): the primary action (one per card), the selected tab, the brand mark and logo tiles, the XP fill, and text selection. Text on lime is always warm ink, in both themes.
- **Lime Hover** (lime-hi): primary button hover only.
- **Lime Wash** (lime-pale): soft "go" grounds: the upload drop zone, confirmation boxes, tip lines and XP pills. Dark theme `#1f3317`.
- **Forest** (forest): text and icons on lime wash, checkbox and range accent. Dark theme `#c5edab`.
- **Coin Rim / Coin Side / Coin Edge** (coin-rim, coin-side, coin-edge): the three flat tones that make lime objects 3D: the rim ring, the darker side face and the extruded edge of the level medal, unlocked badges and isometric icons.

### Secondary (data hues)
- **Bucket Cyan** (data-cyan): US core bucket; the India chart line and dots. Dark `#38c8ff`.
- **Deep Teal** (data-teal): US tech bucket. Dark `#2cbcc6`.
- **Japan Coral** (data-coral): Japan bucket. Dark `#ff7b5c`.
- **Copper** (data-copper): copper bucket; also the game-stat icons and highlighted words. Dark `#ffad6b`.
- **Satellite Yellow** (data-yellow): satellite bucket and bond payouts. Dark `#ffd11a`.
- **Emerging Sage** (data-sage): emerging bucket and any unassigned slice. Dark `#a4a89f`.
- **Sky on Ink** (data-sky): the abroad series on the ink total card, where lime is the India series.

### Tertiary (change and status)
- **Gain / Gain Wash / Gain Ink** (gain, gain-wash, gain-ink): positive change, done states, "good" chips. Dark `#86dc95` / `#173020` / `#a9eeb4`.
- **Loss / Loss Wash / Loss Ink** (loss, loss-wash, loss-ink): negative change, "act" chips, danger buttons, errors. Dark `#ff8f86` / `#3a1716` / `#ffb3ad`. On the ink card negative change uses loss-on-ink.
- **Caution / Caution Wash / Caution Ink** (caution, caution-wash, caution-ink): "wait" chips, busy status, over-target lines. Dark `#ffd11a` / `#33290a` / `#ffe27a`.

### Neutral
- **Sage Canvas** (sage-canvas): page ground, top bar, dialog grounds. Dark: warm ink `#0e0f0c`.
- **Card White** (card-white): every card, chips on the canvas, the phone tab bar. Dark: night-card.
- **Raised Sage** (raised-sage): tiles inside cards, secondary buttons, hover rows, flip faces, the XP track. Dark: night-raised.
- **Sunk Sage** (sunk-sage): wells for 3D scenes (the stage, growth scenes). Dark `#151713`.
- **Hairline / Rule** (hairline, rule): 1px dividers; hairline for the top-bar scroll edge and table heads, rule for rows. Dark `#2b2e27` / `#252821`.
- **Control Stroke** (control-stroke): input borders, unfilled mission rings, dumbbell lines. Dark `#41463c`.
- **Warm Ink / Body Ink / Muted Ink** (warm-ink, body-ink, muted-ink): headings and figures / running text / secondary text. Dark `#f2f4ef` / `#cfd2ca` / `#a4a89f`.
- **Night Card / Night Raised** (night-card, night-raised): dark-theme card and tile tones; night-raised is also the dark-theme total card.

### Named Rules
**The Lime Means Go Rule.** Lime appears only where the user acts (primary action, selected tab, active gate), on identity (the mark, logo tiles) and on earned reward (XP fill, medal, unlocked badges). One lime button per card. Never use lime as a reading surface or a decorative fill.

**The Hues Are Data Rule.** Bucket and asset-class hues mark money: swatches, slices, pins, bars and chart lines, always the same hue for the same bucket in every view. Outside data they appear only as small icon tints.

**The Change Only Rule.** Green and red mean gain or loss, done or act now. They never decorate, and a figure that is not a change stays ink.

## Typography

**Display Font:** Figtree (with Avenir Next, Segoe UI, system-ui), self-hosted, 700–800
**Body Font:** Inter (with Segoe UI, system-ui, -apple-system), self-hosted, tabular figures

**Character:** A friendly, heavy geometric face that makes totals feel solid, paired with a neutral workhorse sans that keeps tables and help text calm and comparable.

### Hierarchy
- **Display** (800, 46px, 1; 38px on phones): the one total on the total card.
- **Headline** (800, 30px, 1.1; 26px on phones): the page title; also 36px for the India total and 26px for lock-screen titles and the stage centre value.
- **Figure** (700, 28px, 1.1): section totals on cards (India, abroad); 22px for split-row and detail-sheet amounts; 20px (700) for tile figures, tax boxes and flip-card amounts.
- **Title** (700, 20px, 1.2): card headings; 18px inside the total card, the AI take and the detail-sheet header; 22px for result dialogs.
- **Subtitle** (Inter 600, 16px, 1.3): sub-headings inside cards; 14px for h4.
- **Body** (Inter 400, 15px, 1.55, `cv11` and `calt` on): running text, max 70ch.
- **Body small** (Inter 400, 13.5px, 1.5): notes, explanations, status lines, in muted ink.
- **Control** (Inter 600, 14.5px): buttons; tabs are 14px 600.
- **Label** (Inter 500, 13px, sentence case, no tracking): sublines and field labels; table heads 12.5px 500 muted.
- **Chip** (Inter 600, 12.5px, 1): chips and XP pills.

### Named Rules
**The Figures Stand Tall Rule.** A money figure that stands on its own is set in Figtree 700–800 with tabular numerals; a figure inside a table, list or sentence is Inter 600 with tabular numerals. No monospace for numbers.

**The Subline Rule.** A small label belongs under its heading as a muted 13px sentence-case subline, 4px below. Never set a kicker or eyebrow above a heading, never uppercase, never tracked.

## Layout

Content is capped at 1200px (a 1248px wrap with 24px sides; 16px on phones) on a 12-column grid with a 20px gutter (16px on phones). The overview leads with two rows: the total card across 7 columns beside a 5-column stack of the player card and the AI take, then the India summary (7) beside the abroad 3D stage (5). Card grids use spans of 3, 5, 6, 7 and 12; at 1000px and below every span stacks to full width (3-spans go to half, then full at 520px).

The top bar is sticky on the canvas with a hairline that appears only after scrolling. Tabs sit centred as labelled pills; at 1180px they wrap to their own scrolling row with a fade at the right edge; at 640px they become a fixed bottom bar of five 48px-tall places (Overview, India, Abroad, Plan, More), with the rest opening from More. Holding tables turn into stacked label-over-value rows at 760px.

Rhythm: 16px between items inside a card, 20px between cards, 24px card padding (20px on phones), 28px around the title row and the total card. Density is comfortable, not compact: rows are at least 40px tall, touch targets at least 44px.

## Elevation & Depth

Flat surfaces, physical objects. Resting cards carry no shadow and no border; hierarchy comes from tonal layers (canvas, card, raised tile, sunk well) and from the polarity-flipped total card. Depth is concentrated in 3D objects: the three.js stage (an extruded allocation ring around a lit globe with country pins; slices lift on hover and open their bucket on click), CSS-3D medals and coins, flip cards, and isometric icons drawn in flat tones. Raised tiles and badges tilt toward the pointer. Shadows exist only on layers that float above the page.

### Shadow Vocabulary
- **Dialog lift** (`box-shadow: 0 30px 80px -20px rgba(14,15,12,.55)`): the holding detail sheet and result dialogs, over a `rgba(14,15,12,.5)` backdrop.
- **Toast lift** (`box-shadow: 0 18px 30px -12px rgba(14,15,12,.5)`): toasts; the error banner uses `0 20px 50px -15px` at the same alpha with a 1.5px inset loss ring.
- **Pin lift** (`box-shadow: 0 4px 12px -6px rgba(14,15,12,.45)`): labels pinned over 3D scenes; scene bubbles use `0 8px 20px -10px` at .5.
- **Sheet lift** (`box-shadow: 0 -20px 40px -20px rgba(14,15,12,.35)`): the phone More sheet rising from the bottom bar.
- **Contact shadow** (blurred ellipse at `rgba(14,15,12,.16–.18)`): the ground under a medal or 3D icon. It belongs to the object, not the card.

### Motion
One easing, `cubic-bezier(.2,.8,.2,1)`. State changes 150ms; tilt 250ms (perspective 700px, at most 6° and 8°, lifted 4px); flip cards 600ms around Y; the level medal spins once on hover (1.1s); dialogs and toasts rise 10–12px in 300ms. The total counts up once. Reduced motion removes tilt, flips and spins.

### Named Rules
**The Objects Carry Depth Rule.** Depth is a property of things (ring, globe, medal, coin, flip card), never of the card they sit on. A resting card that needs a shadow to separate is on the wrong ground.

**The Flat-Tone 3D Rule.** Every 3D icon, medal and coin is built from two or three flat tones (lit face, darker side, rim) plus a soft contact shadow. No gradient fills.

## Shapes

Soft, friendly geometry. Cards round at 24px (20px on phones), inner tiles at 16px, flip cards and detail-sheet cards at 20px, inputs and small floating labels at 12px. Every control is a pill: buttons, tabs, chips, the currency toggle, XP bars and split bars. Circles are reserved for game and status objects (medals, badges, step counters, mission rings, status dots, the send button). Swatches are 12px squares at 4px radius; flags carry 3–4px corners. Lines are 1px rules inside cards only; inputs take a 1px control stroke.

## Components

### Buttons
Pill, confident, quick to press.
- **Shape:** full pill (999px), at least 40px tall (44px for upload pick, 48px on lock screens).
- **Primary:** lime with warm-ink text, 9px 18px, Inter 600 14.5px; hover to lime-hi. One per card.
- **Secondary:** raised sage with ink text; hover mixes 9% ink in. On the ink card, a 10% white wash (16% on hover).
- **Danger:** loss wash with loss ink.
- **Filter set:** 36px pills; the selected one turns warm ink with card-white text (lime stays reserved for the main action).
- **Press / Focus / Disabled:** press scales to .97; focus is a 2px ink outline (lime in dark) at 2px offset; disabled drops to 55% opacity.
- **Text link button:** underlined at 1.5px, thickening to 2.5px on hover.

### Chips
- **Style:** pill, Inter 600 12.5px, 6px 10px, no border.
- **State:** good (gain wash, gain ink), wait (caution wash, caution ink), act (loss wash, loss ink), neutral (raised sage, body ink). XP pills are lime wash with forest text.
- **Meta chips:** card-white pills on the canvas with a muted 16px line icon and an ink bold value.

### Cards / Containers
- **Corner Style:** 24px.
- **Background:** card white (night card in dark); inner tiles raised sage at 16px; 3D wells sunk sage.
- **Shadow Strategy:** none at rest (see Elevation & Depth).
- **Border:** none; rows inside are split by 1px rules.
- **Internal Padding:** 24px with a 16px stack; empty states 32px.

### Inputs / Fields
- **Style:** card-white fill, 1px control stroke, 12px radius, 10px 14px, 44px tall. The AI ask field is a raised-sage pill with a round ink send button.
- **Focus:** 2px ink outline (lime in dark), border goes transparent.
- **Labels:** muted 13.5px 500 above the field.
- **Disabled:** muted text, not-allowed cursor.

### Navigation
- **Top bar:** lime mark tile (36px, 12px radius) with the name in Figtree 800 18px; labelled tab pills in Inter 600 14px, body ink, hover raised sage, selected lime with ink text; Upload carries a 1.5px control ring when not selected. Right side: the $/₹ toggle (card-white track, selected side ink) and round 38px icon buttons for lock and sign out.
- **Phone:** fixed card-white bottom bar with a hairline top, five places at 48px, 14px radius buttons, short labels; More opens the rest as full-width rows.

### Total Card (signature)
The polarity card: warm ink by day, night-raised by night, 28px padding, white text. "All investments" title with the price dates as a muted subline to the right, the total in Display, the change line (gains in lime, losses in loss-on-ink), a 14px pill split bar (India in lime, abroad in sky, 3px gaps) on an ink track, and two tappable split rows with a 22px figure each. Upload reports is the card's one lime button.

### Player Card (signature)
A white card with the 76px level medal (lime face, coin-rim inset rings, coin-edge side disc 6px behind, tilted 14° and -18°, contact shadow below) beside the rank in Figtree 800 20px, a 28px pill XP bar (lime fill on raised sage, label inside) and a stats line with copper icons for value abroad, month streak and badges.

### Quest and Missions
Numbered steps in 32px ink circles (done turns gain wash with a check), a status chip, a bold title over a muted line, and an XP pill on the right; rows split by rules. Missions use a 28px ring that fills gain wash when done.

### Badges
A grid of 128px-minimum cells. Locked: a 52px card-white circle with a 2px hairline ring and a muted line icon. Unlocked: a lime coin with a coin-rim inset ring and a coin-edge disc 5px below. Name in Figtree 700 14px, how-to-earn in 12.5px muted. Badges tilt toward the pointer.

### Flip Cards (this month's buys)
176px-minimum, 204px-tall raised-sage cards at 20px radius that flip 180° on hover or tap to show the reason on the back. A 26px bucket-coloured coin sits top right; the ticker in Figtree 800 26px, the amount in Figtree 700 20px, and a card-white gap pill at the foot.

### 3D Stage
A sunk-sage well at 16px radius and 1:0.78 aspect holding the globe and extruded ring, bucket-coloured slices, card-white pins with flags, and the centre value in Figtree 800 26px. Beside or below it, bucket capsules (12px swatch, name, value, percent) select a slice. Without WebGL it falls back to a flat ring cut from the same colours.

### Holding Detail Sheet
A canvas-ground dialog (640px max, full screen on phones) with a sticky header, a lime initial tile, white 20px-radius cards for value, tax and lots, and right-aligned tabular definition lists.

## Do's and Don'ts

### Do:
- **Do** lead every screen that has money with one total card, and keep every other container a white card on the sage canvas.
- **Do** keep one lime button per card and use lime for the selected tab, the mark and earned rewards only.
- **Do** use the same bucket hue for the same bucket everywhere: swatch, slice, pin, bar and flip-card coin.
- **Do** set standalone figures in Figtree 700–800 and every number in tabular figures.
- **Do** put small labels under their heading as a 13px muted sentence-case subline.
- **Do** build new 3D icons, medals and coins from flat tones with a contact shadow, and give game elements the same cards, pills and type as the money.
- **Do** keep touch targets at 44px or more, give every tab a word, and turn off tilt, flips and spins under reduced motion.

### Don't:
- **Don't** bring back the emerald glass trading desk: no blobs, glass, backdrop blur, ghost words or gradient fills.
- **Don't** use icon-only tabs or a mono-heavy dashboard look; monospace is only for the literal upload log.
- **Don't** put shadows or borders on resting cards; shadows belong to dialogs, toasts, pins and sheets.
- **Don't** use green or red for anything but change and status.
- **Don't** set kickers or uppercase tracked labels above headings.
- **Don't** add a second accent or put lime behind reading text.
