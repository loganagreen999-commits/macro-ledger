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
  14 micronutrients. Saved foods are searchable forever.
- **Goals tab**: a target for calories, each macro and all 14 micronutrients, with an
  autofill that works them out from your height, weight, age, sex and activity.
- **Meals tab**: cook a batch, list what went in, say how much it made (six cups,
  say), and logging "1.5 cups" later works out the rest. Each meal carries a
  freshness countdown from the day you cooked it.
- **Micronutrients**: fiber, sugars, saturated fat, cholesterol, sodium,
  potassium, calcium, iron, magnesium, zinc, vitamins A, C, D and B12 — each as
  a percentage of the FDA Daily Value. Limit-type nutrients turn red past 100%.
- Day-by-day navigation, meals split into breakfast / lunch / dinner / snacks,
  and a JSON backup you can download and restore.

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
