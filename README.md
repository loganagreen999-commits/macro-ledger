# Macro Ledger

A private nutrition tracker that runs entirely in the browser. Type in a food,
it logs calories, protein, carbs, fat and 14 micronutrients for that day.

No account, no server, no network. Your log never leaves your device — it lives
in the browser's own storage, and the app itself is cached on first visit so it
keeps working with the network off.

## Install it on an iPhone

Open the site in **Safari**, tap **Share → Add to Home Screen**. It launches
full-screen with its own icon and behaves like any other app.

## What's in it

- **646 foods built in**, including 117 brands (Chobani, Fage, Fairlife, Quest,
  Premier Protein, Clif, RXBAR, KIND, Larabar, Kodiak, Optimum Nutrition,
  Nabisco, Kellogg's, General Mills, Halo Top, Talenti …) and restaurant items
  (Chipotle, McDonald's, Chick-fil-A, Wendy's, Burger King, Popeyes, Starbucks,
  Dunkin', Taco Bell, In-N-Out, Panda Express, Panera, Cava, Sweetgreen …), plus a
  store-brand section for the three shops that matter here: **Sam's Club**
  (Member's Mark, the café), **Aldi** (Friendly Farms, Happy Farms, Kirkwood,
  Never Any!, Simply Nature, Millville, Clancy's, L'oven Fresh, Southern Grove,
  Appleton Farms, Mama Cozzi's, Priano, Reggano, Park Street Deli …) and
  **Publix** (Publix, GreenWise, Publix Deli including the Pub Subs, Publix Bakery).
- **Pasta Pass tab**: an Olive Garden Never Ending Pasta Bowl builder. Add a bowl at a
  time (pasta, sauce, topping), count breadsticks, split the salad by plates *or* by
  shares of the family bowl with a dressed/undressed toggle, pick a soup and a drink.
  It totals as you go and logs each line to the day.
- **Water** on the Day tab: pour sizes, a glass-by-glass strip, an editable daily
  target, and per-pour undo. Tracked separately from calories.
- **Add your own foods and brands** — name, serving, macros, and optionally all
  14 micronutrients. Saved foods are searchable forever. Both ways in sit at the
  top of the search sheet: **Scan a barcode** and **Add by hand**.
- **Barcode scanner**: point the camera at a UPC/EAN and the panel is filled in
  from Open Food Facts — a free, public, no-account database. Chrome and Android
  use the browser's own decoder; Safari falls back to a locally bundled ZXing, so
  no third-party script is ever fetched. Whatever you save keeps its barcode, so
  the second scan of the same product is instant and works offline. Open Food
  Facts is crowd-sourced, so the form shows you the numbers before you save.
- **Goals tab**: a target for calories, each macro and all 14 micronutrients, with an
  autofill that works them out from your height, weight, age, sex and activity.
- **Meals tab**: cook a batch, list what went in, say how much it made (six cups,
  say), and logging "1.5 cups" later works out the rest. Each meal carries a
  freshness countdown from the day you cooked it.
- **Micronutrients**: fiber, sugars, saturated fat, cholesterol, sodium,
  potassium, calcium, iron, magnesium, zinc, vitamins A, C, D and B12 — each as
  a percentage of the FDA Daily Value. Limit-type nutrients turn red past 100%.
- **Tap any nutrient** — the calorie figure, a macro tile, or any micronutrient
  row — to see every food that contributed to it, ranked, with each one's share.
  Tap a line to change how much of it you logged.
- **Progress**: tap the date to open week, month or year. Bars per day against
  your calorie goal, averages over days you actually logged, and tapping any bar
  jumps straight to that day.
- **Recipes**: save a meal's ingredient list, then cook it again later — every
  ingredient comes back on a slider so you can nudge what you used more or less
  of, with per-serving numbers updating as you slide.
- Day-by-day navigation, meals split into breakfast / lunch / dinner / snacks,
  and a JSON backup you can download and restore.

## Skins

A static site cannot tell who is loading it, so a skin is not detected, it is
handed out. Give one person a link with `?skin=<name>` and their copy looks
different from everyone else's:

    ?skin=gator     Florida orange on navy, Impact headings, a crocodile
    ?skin=comic     Comic Sans, pink, cards slightly askew
    ?skin=bee       black and yellow, striped top bar
    ?skin=barbie    hot pink
    ?skin=matrix    black and green monospace
    ?skin=off       back to normal

For a permanent install, hand over `shamu.html` (or `gator.html`, …) rather than
the query-string form.

`?skin=` is only the preview. **The install link is the skin's own page** —
`gator.html`, `shamu.html` and so on — because Safari fetches the manifest the
moment it parses `<link rel="manifest">` in the head, so swapping that href from
script is far too late: Add to Home Screen has already taken `start_url` from
the default manifest. A home-screen app on iOS also gets its own storage,
separate from Safari, so the flag cannot ride in `localStorage` either.

Each generated page sits beside `index.html` — same directory, so every relative
path still resolves — with the right manifest link in the head from the start
and the skin forced before any script runs. Its manifest's `start_url` points
back at that page, so every launch is skinned.

**Run `./build-skins.py` after any edit to `index.html`**, or the skin pages
drift from the app.

Most skins are pure CSS variable overrides. `shamu` also loads `shamu/shamu.css`
and `shamu/shamu.js` from its own folder, so its art and code are downloaded
only by the person holding that link. None of them touch the data or the
numbers.

## Running it locally

    ~/nutrition/serve.py            # then open the printed phone URL

Requires the port open in both Windows firewalls; `~/castbox/open-port.sh 8099`
does that. Port 8099 is already open.

## Editing the food database

Foods live in the `FOODS` array in `index.html`. Each row is:

    [name, brand, serving, grams, kcal, protein, carbs, fat, fiber, sugar,
     satfat, sodium, potassium, calcium, iron, vitA, vitC, vitD, B12,
     magnesium, zinc, cholesterol]

Units: grams for macros and fiber/sugar/satfat, mg for minerals and
cholesterol, mcg for vitamins A, D and B12, mg for vitamins C. Values are
USDA-style reference figures and brand label panels.

After editing, bump `V` in `sw.js` so installed copies pick up the new version.
