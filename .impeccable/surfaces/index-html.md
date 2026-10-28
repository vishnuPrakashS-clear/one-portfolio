---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["src/app.js","src/styles.css"]
---

# Surface brief: One Portfolio app (index.html, all tabs)

Scope: the whole signed-in app (overview, India, upload, global holdings, plan, tax, growth, checklist, ask), the sign-in and PIN screens, the holding detail sheet. Mode: Operate.
Audience and job: the owner and friends who signed up; first job is "what is everything worth and how did it change", then this month's buy, tax timing, holding details. Short by default, explanations a tap away.
Constraints: brief pins a vibrant 3D look throughout and the full game layer (levels, XP, quests, badges, streaks). Static HTML/CSS/JS, free tiers, no build step. No invented figures.
Benchmarks: Groww and INDmoney polish.

## Direction contract

THESIS: The familiar money app played straight, at Groww/INDmoney polish: one total leads the first screen, India and abroad split beneath it, and every other job is one tab or tap away. It refuses the old emerald glass trading desk (blobs, glass, gradients, ghost word, icon-only tabs) and the mono-heavy dashboard look.
OWN-WORLD: From the Awesome DESIGN.md "wise" analysis, made One Portfolio's own: sage canvas #e8ebe6 with white cards in light, warm ink #0e0f0c ground with #1a1c18 cards in dark; 24px card radius, pill controls; a heavy geometric display face for the total and headings, Inter for all UI and figures (tabular); lime #9fe870 only on the primary action, the selected tab and the brand mark; data hues cyan, teal, coral, copper, yellow and sage carry buckets and asset classes; positive and negative greens and reds for change only.
STORY: The visitor opens the app, reads the total and its change, sees how much is in India and abroad, checks this month's quest and buy, and taps into India or a holding when they need detail.
FIRST VIEWPORT: Sticky top bar: mark and name left, labelled tabs centre, rupee/dollar switch, lock and sign out right. Left 7 of 12 columns: an ink polarity card with "All investments", the total at 44px in the display face, its change line, and a split bar of India against abroad with amounts; Upload reports as the one lime button. Right 5 columns: the player card (3D level medal, XP bar, streak, badge count) above the AI take. Next row: India's month-end chart beside the 3D globe and allocation ring of the abroad sleeve.
FORM: The standing exit (category canon), chosen by the user over two dealt directions; executed from the wise DESIGN.md at full fidelity with the 3D and game layer kept. seed:d652f468fb230d24 (roll ran degraded, no challengers).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: the 3D stage (globe with country pins inside an extruded allocation ring; hover lifts a slice, click opens the bucket). Depth elsewhere: tilt on raised cards, 3D flip buy cards, 3D medal badges.
Unresolved: none.
