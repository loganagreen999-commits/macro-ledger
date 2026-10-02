# Tests

    cd t && npm i jsdom@24 --no-save && node test_updates.js

Boots the real app (index.html + every module) in jsdom and drives it:
encounter deferral, recipe/cook/trip drafts, cook-from-book at a multiple,
pantry sorting, lift max/last time, battle animation steps, item popups,
sheet locking. `scene.html` is the headless-Chrome screenshot harness: serve a
folder containing it next to an `app/` symlink to this repo and open
`scene.html?scene=battle|meals|cook|lift|session|item|day&theme=modern|gba|pixel|shamu&seg=cooked|book|pantry`.
