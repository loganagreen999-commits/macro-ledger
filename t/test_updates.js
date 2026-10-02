// Tests for the 2026-10-02 batch of Macro Ledger updates.
const { boot, sleep, ready, ok, done, type } = require("./harness");

const started = (extra = {}) => Object.assign({ v: 1, started: true, player: { lvl: 4, xp: 5 }, party: [1], box: [],
  items: { pokeball: 5, potion: 2 }, seen: {}, caught: {}, nextUid: 2, day: null, streak: 0, mult: 1, spent: {},
  goalsHit: {}, missions: [], week: null, theme: "modern", enc: null, log: [] }, extra);

async function withApp(storage, fn, opts = {}) {
  const app = boot(Object.assign({ storage }, opts));
  await ready(app.w);
  // a real starter in the box (dex is loaded now)
  const G = app.w.MLGame.state();
  if (!G.box.length) { const m = app.w.MLGame.makeMon("squirtle", 8); m.u = 1; G.box.push(m); G.party = [1]; app.w.MLGame.save(); }
  await sleep(50);
  try { await fn(app); } finally { app.w.close(); }
  return app.errors;
}

(async () => {
  // ---------- 1. encounters wait while a sheet is open; recipes never start one
  let errs = await withApp({ "ml.game": started() }, async ({ w, d }) => {
    const MG = w.MLGame;
    w.openSheet("Something", "<p>typing a recipe</p>");
    MG.maybeEncounter(null, 1);
    ok(!d.querySelector(".gbattle"), "no battle while a sheet is open");
    ok(!!MG.state().pendingEnc, "the encounter is owed, not lost");
    w.closeSheet();
    await sleep(700);
    ok(!!d.querySelector(".gbattle"), "the owed battle starts once the sheet closes");
    ok(!MG.state().pendingEnc, "and is no longer owed");
    for (let i = 0; i < 4; i++) { d.getElementById("bTextBox").click(); await sleep(30); }   // through the intro
    await sleep(80);
    ok(MG.fx().busy === false, "intro done, menu free");
    MG.flee(); await sleep(150); d.getElementById("bTextBox").click(); d.getElementById("bTextBox").click(); await sleep(200);
    ok(!d.querySelector(".gbattle"), "running away closes the battle");
    const before = MG.state().player.xp + MG.state().player.lvl * 1000;
    MG.hookRecipe("r1");
    await sleep(100);
    ok(!d.querySelector(".gbattle") && !MG.state().pendingEnc, "saving a recipe never starts a fight");
    ok(MG.state().player.xp + MG.state().player.lvl * 1000 > before, "but it pays trainer xp");
    const xp1 = MG.state().player.xp; MG.hookRecipe("r1");
    ok(MG.state().player.xp === xp1, "and only once per recipe");
  });
  ok(errs.length === 0, "no runtime errors (encounters): " + errs.slice(0, 2).join(" | "));

  // ---------- 2. recipe editor draft survives an interruption
  errs = await withApp({ "ml.game": started() }, async ({ w, d }) => {
    w.MLGame.tracker().view = "meals"; w.localStorage.setItem("ml.k.seg", JSON.stringify("book")); w.render();
    ok(!!d.querySelector('[data-kseg="book"][aria-selected="true"]'), "Meals tab shows the three-part kitchen");
    w.MLKitchen.openRecipeEditor();
    type(d.getElementById("kName"), "Chili", w);
    type(d.getElementById("kYield"), "8", w);
    w.closeSheet();                                         // a battle / accidental close
    const dr = JSON.parse(w.localStorage.getItem("ml.k.recipeDraft"));
    ok(dr && dr.r.name === "Chili" && dr.r.yieldQty === 8, "draft saved as you type");
    w.render();
    ok(/Unsaved recipe/.test(d.getElementById("screen").textContent), "recipe book offers to continue");
    d.getElementById("kResume").click();
    ok(d.getElementById("kName").value === "Chili", "continuing restores what was typed");
    // add two ingredients through the normal search -> detail path
    d.getElementById("kAddIng").click();
    ok(/Add to Chili/.test(d.querySelector(".shead h3").textContent), "ingredient search is titled for the recipe");
    d.querySelector("[data-pick]").click();               // first food in the list
    d.getElementById("save").click();                     // "Add ingredient"
    ok(d.getElementById("kName") && d.getElementById("kName").value === "Chili", "back in the editor with the name intact");
    ok(d.querySelectorAll("#kIngs .ing").length === 1, "the ingredient landed in the recipe");
    type(d.getElementById("kUnit"), "bowls", w);
    d.getElementById("kSave").click();
    ok(w.MLGame.tracker().recipes.length === 1 && w.MLGame.tracker().recipes[0].name === "Chili" && w.MLGame.tracker().recipes[0].yieldQty === 8, "saved to the recipe book");
    ok(w.localStorage.getItem("ml.k.recipeDraft") === "null", "and the draft is cleared");
    ok(!d.querySelector(".gbattle") && !w.MLGame.state().pendingEnc, "no battle from saving it");
  });
  ok(errs.length === 0, "no runtime errors (draft): " + errs.slice(0, 2).join(" | "));

  // ---------- 3. full recipe -> cook at 1.5x with a one-off change -> choices
  errs = await withApp({ "ml.game": started() }, async ({ w, d }) => {
    const K = w.MLKitchen;
    const beef = { name: "Ground beef", brand: "", serving: "4 oz", grams: 112, qty: 2, n: new Array(18).fill(0).map((_, i) => i === 0 ? 280 : i === 1 ? 20 : 0) };
    const beans = { name: "Kidney beans", brand: "", serving: "1 can", grams: 425, qty: 1, n: new Array(18).fill(0).map((_, i) => i === 0 ? 300 : i === 1 ? 20 : 0) };
    w.MLGame.tracker().recipes.push({ id: "rc1", name: "Chili", yieldQty: 4, yieldUnit: "bowls", shelfDays: 5, ing: [beef, beans], saved: 1, used: 0 });
    w.saveRecipes();
    w.MLGame.tracker().view = "meals"; w.localStorage.setItem("ml.k.seg", JSON.stringify("book")); w.render();
    d.querySelector('[data-cook="rc1"]').click();
    d.querySelector('[data-mult="1.5"]').click();
    const qs = [...d.querySelectorAll("#kRows [data-cq]")].map(i => +i.value);
    ok(qs[0] === 3 && qs[1] === 1.5, "1.5× scales every ingredient (" + qs + ")");
    ok(+d.getElementById("kCY").value === 6, "and what it makes");
    // interrupt, then come back: the cook draft holds the 1.5x
    w.closeSheet(); w.render();
    ok(/Cooking in progress/.test(d.getElementById("screen").textContent), "an interrupted cook can be continued");
    d.getElementById("kResumeCook").click();
    ok(d.querySelector('[data-mult="1.5"]').getAttribute("aria-pressed") === "true", "and comes back at 1.5×");
    // out of beans this time
    const cb = d.querySelector('#kRows [data-on="1"]'); cb.checked = false; cb.dispatchEvent(new w.Event("change"));
    d.getElementById("kCookGo").click();
    ok(/Keep these changes/.test(d.querySelector(".shead h3").textContent), "a changed batch asks what to keep");
    ok(/left out Kidney beans/.test(d.querySelector(".sbody").textContent), "and says what changed");
    d.getElementById("kOnce").click();
    ok(w.MLGame.tracker().batches.length === 1 && w.MLGame.tracker().batches[0].mult === 1.5, "just-this-once cooks a 1.5× batch");
    ok(w.MLGame.tracker().batches[0].ing.length === 1, "without the ingredient left out");
    ok(w.MLGame.tracker().recipes.length === 1 && w.MLGame.tracker().recipes[0].ing.length === 2, "and leaves the recipe alone");
    ok(w.MLGame.tracker().recipes[0].used === 1, "the recipe counts the cook");
    // cook again, change amount, save as new
    w.render(); w.localStorage.setItem("ml.k.seg", JSON.stringify("book")); w.render();
    d.querySelector('[data-cook="rc1"]').click();
    const q0 = d.querySelector('#kRows [data-cq="0"]'); type(q0, "3", w);
    d.getElementById("kCookGo").click();
    type(d.getElementById("kNewName"), "Beefy chili", w);
    d.getElementById("kAsNew").click();
    ok(w.MLGame.tracker().recipes.some(r => r.name === "Beefy chili" && r.ing[0].qty === 3), "save-as-new keeps the changed amounts");
    ok(w.MLGame.tracker().batches.length === 2, "and cooks it");
    // throw out a cooked batch
    w.localStorage.setItem("ml.k.seg", JSON.stringify("cooked")); w.render();
    const xs = d.querySelectorAll("[data-toss]");
    ok(xs.length === 2, "every cooked batch has an X");
    xs[0].click(); d.getElementById("kTossYes").click();
    ok(w.MLGame.tracker().batches.length === 1, "X then confirm clears it");
  });
  ok(errs.length === 0, "no runtime errors (cook): " + errs.slice(0, 2).join(" | "));

  // ---------- 4. pantry: groups, sorting, the shopping trip
  errs = await withApp({ "ml.game": started() }, async ({ w, d }) => {
    const K = w.MLKitchen;
    ok(K.guessGroup("Fage Greek yogurt") === "dairy", "yogurt → dairy");
    ok(K.guessGroup("Chicken breast") === "meat", "chicken → meat");
    ok(K.guessGroup("Baby spinach") === "produce", "spinach → produce");
    ok(K.guessGroup("frozen peas") === "frozen", "frozen wins over produce");
    K.tripAdd({ name: "Milk", barcode: "111" }); K.tripAdd({ name: "Milk", barcode: "111" }); K.tripAdd({ name: "Bagels", barcode: "222" });
    const trip = JSON.parse(w.localStorage.getItem("ml.k.trip"));
    ok(trip.length === 2 && trip.find(t => t.barcode === "111").qty === 2, "scanning the same thing twice counts it");
    w.MLGame.tracker().view = "meals"; w.localStorage.setItem("ml.k.seg", JSON.stringify("pantry")); w.render();
    ok(/Shopping trip in progress/.test(d.getElementById("screen").textContent), "an unfinished trip waits to be reviewed");
    d.getElementById("kTripResume").click();
    d.getElementById("kPutAway").click();
    let p = K.pantry();
    ok(p.length === 2, "put away adds the whole trip");
    // add one by hand that expires tomorrow
    K.putAway([{ name: "Strawberries", group: "produce", days: 1, qty: 1 }]);
    w.render();
    let names = [...d.querySelectorAll(".kin")].map(e => e.textContent);
    ok(names[0].startsWith("Strawberries"), "goes-off-first sort puts tomorrow at the top (" + names.join(",") + ")");
    ok(/Use these first/.test(d.getElementById("screen").textContent), "and calls it out");
    d.querySelector('[data-psort="group"]').click();
    const heads = [...d.querySelectorAll(".kplist .sectlab")].map(e => e.textContent.split(" ·")[0]);
    ok(heads.join("|") === "Produce|Dairy & eggs|Bread & bakery", "group sort sections by kind of food (" + heads.join("|") + ")");
    ok(!!d.querySelector('[data-kseg="pantry"] .kdot'), "the tab shows how many things are about to go off");
    d.querySelector("[data-used]").click(); d.getElementById("kqToss").click();
    ok(K.pantry().length === 2, "X → threw it out removes it");
  });
  ok(errs.length === 0, "no runtime errors (pantry): " + errs.slice(0, 2).join(" | "));

  // ---------- 4b. trip lookup through Open Food Facts makes a reusable food
  errs = await withApp({ "ml.game": started() }, async ({ w, d }) => {
    w.MLKitchen.openTrip();
    await sleep(50);
    d.getElementById("kTypeCode").click();             // prompt answers with the code
    await sleep(150);
    const trip = JSON.parse(w.localStorage.getItem("ml.k.trip") || "[]");
    ok(trip.length === 1 && trip[0].name === "Oikos Pro Yogurt" && trip[0].group === "dairy", "a scanned code is looked up and grouped (" + JSON.stringify(trip[0]) + ")");
    ok(w.MLGame.tracker().foods.some(f => f.barcode === "0123456789012"), "and saved as one of your foods for logging later");
    ok(!d.querySelector(".gbattle") && !w.MLGame.state().pendingEnc, "scanning groceries never starts a fight");
  }, { promptAnswer: "0123456789012", off: () => ({ status: 1, product: { product_name: "Oikos Pro Yogurt", brands: "Dannon",
      serving_size: "150 g", categories_tags: ["en:dairies", "en:yogurts"], nutriments: { "energy-kcal_serving": 140, proteins_serving: 20 } } }) });
  ok(errs.length === 0, "no runtime errors (trip lookup): " + errs.slice(0, 2).join(" | "));

  // ---------- 5. lift: pick any workout, past exercises, max + last time with dates
  const day = (n) => Date.parse("2026-09-" + String(n).padStart(2, "0") + "T18:00:00");
  const lift = { v: 1, split: "ppl", unit: "lb", schedule: { [new Date().getDay()]: "dLegs" }, prs: {}, draft: null,
    days: [{ id: "dPush", name: "Push" }, { id: "dPull", name: "Pull" }, { id: "dLegs", name: "Legs" }],
    sessions: [
      { id: "s3", dayId: "dPush", dayName: "Push", at: day(28), sets: [{ ex: "Bench press", reps: 8, weight: 165 }, { ex: "Bench press", reps: 7, weight: 165 }, { ex: "Dips", reps: 12, weight: 0 }] },
      { id: "s2", dayId: "dLegs", dayName: "Legs", at: day(24), sets: [{ ex: "Squat", reps: 5, weight: 225 }] },
      { id: "s1", dayId: "dPush", dayName: "Push", at: day(21), sets: [{ ex: "Bench press", reps: 5, weight: 185 }, { ex: "Bench press", reps: 3, weight: 185 }, { ex: "OHP", reps: 8, weight: 95 }] }] };
  errs = await withApp({ "ml.game": started(), "ml.lift": lift }, async ({ w, d }) => {
    const L = w.MLLift;
    const h = L.heaviest("Bench press");
    ok(h.weight === 185 && h.reps === 5 && new Date(h.at).getDate() === 21, "max = heaviest weight, best reps at it, its date");
    const lt = L.lastTime("bench press");
    ok(lt.sets.length === 2 && new Date(lt.at).getDate() === 28, "last time = most recent session's sets and date");
    ok(L.exForDay("dPush").join("|") === "Bench press|Dips|OHP", "Push pulls up every exercise done on Push before");
    w.MLGame.tracker().view = "lift"; w.render();
    const starts = [...d.querySelectorAll("[data-start]")].map(b => b.textContent);
    ok(starts.length === 4 && /Legstoday/.test(starts.join("")), "every workout can be started, today's highlighted (" + starts.join(",") + ")");
    d.querySelector('[data-start="dPush"]').click();          // legs day, but doing push
    ok(d.querySelector(".shead h3").textContent === "Push", "choosing Push on a legs day works");
    const chips = [...d.querySelectorAll("[data-ex]")].map(b => b.dataset.ex);
    ok(chips.join("|") === "Bench press|Dips|OHP", "Push's past exercises are one tap away");
    d.querySelector('[data-ex="Bench press"]').click();
    const stats = d.querySelector(".lstats").textContent;
    ok(/185 lb × 5/.test(stats) && /Sep 21/.test(stats), "shows the max with its date (" + stats + ")");
    ok(/8×165, 7×165/.test(stats) && /Sep 28/.test(stats), "and last time with its date");
    ok(d.getElementById("lReps").value === "8" && d.getElementById("lWt").value === "165", "steppers start from last time");
    d.querySelector('[data-adj="weight"][data-d="1"]').click();
    ok(d.getElementById("lWt").value === "170", "+ adds one plate step");
    d.getElementById("lLog").click();
    ok(L.state().draft.sets.length === 1 && L.state().draft.sets[0].weight === 170, "Log set records it");
    ok(/Log set 2/.test(d.getElementById("lLog").textContent), "and the button counts on");
    d.querySelector('[data-wk="dLegs"]').click();
    ok([...d.querySelectorAll("[data-ex]")].map(b => b.dataset.ex).includes("Squat"), "switching workout swaps the exercise list");
  });
  ok(errs.length === 0, "no runtime errors (lift): " + errs.slice(0, 2).join(" | "));

  // ---------- 6. battle: bars drain over time, text types out, xp fills
  errs = await withApp({ "ml.game": started() }, async ({ w, d }) => {
    const MG = w.MLGame, G = MG.state();
    MG.startEncounter("rattata", 3);
    await sleep(60);
    ok(!!d.getElementById("bFoeBar") && !!d.getElementById("bMeBar") && !!d.getElementById("bMeXp"), "modern battle has both hp bars and an xp bar");
    // skip the intro text
    for (let i = 0; i < 4; i++) { d.getElementById("bTextBox").click(); await sleep(30); }
    await sleep(100);
    ok(!d.getElementById("bMenu").classList.contains("busy"), "menu unlocks after the intro");
    const foe = G.enc.mon; foe.hp = foe.max; MG.save();
    const fakeDamage = MG.damage; // force a clean hit for a deterministic drain
    w.Math.random = () => 0.5;
    d.querySelector("[data-mv]").click();
    ok(d.getElementById("bMenu").classList.contains("busy"), "menu locks while the turn plays");
    await sleep(90);
    const t0 = d.getElementById("bText").textContent;
    await sleep(150);
    const t1 = d.getElementById("bText").textContent;
    ok(t1.length > t0.length && t1.length > 0, "text types out a character at a time ('" + t0 + "' → '" + t1 + "')");
    d.getElementById("bTextBox").click();                   // finish the line instantly
    const full = d.getElementById("bText").textContent;
    ok(/used/.test(full) && full.endsWith("!"), "a tap finishes the line (" + full + ")");
    d.getElementById("bTextBox").click();                   // advance to the drain
    const widths = [];
    let sawPulse = false;
    for (let i = 0; i < 40; i++) { await sleep(60); const b = d.getElementById("bFoeBar"); if (b) widths.push(parseFloat(b.style.width)); if (d.querySelector(".binfo.foe.draining")) sawPulse = true; }
    const distinct = [...new Set(widths)];
    ok(distinct.length >= 4, "the foe's hp bar drains in steps, not at once (" + distinct.join(",") + ")");
    ok(sawPulse, "the foe box pulses while it drains");
  });
  ok(errs.length === 0, "no runtime errors (battle): " + errs.slice(0, 2).join(" | "));

  // ---------- 7. items: popup with an icon and an OK button
  errs = await withApp({ "ml.game": started() }, async ({ w, d }) => {
    const MG = w.MLGame;
    MG.award("greatball", 2, "Protein goal met");
    MG.award("rarecandy", 1, "A personal record");
    await sleep(400);
    const pop = d.querySelector(".gitem");
    ok(!!pop, "earning items shows a popup");
    ok(pop.querySelectorAll("svg.gicon").length === 2, "with an icon for each item");
    ok(/Great Ball ×2/.test(pop.textContent) && /Protein goal met/.test(pop.textContent), "naming what and why");
    ok(MG.state().items.greatball === 2, "and the items are in the bag");
    d.getElementById("gItemOk").click();
    ok(!d.querySelector(".gitem"), "OK closes it");
    // while a sheet is open the popup waits
    w.openSheet("Busy", "<p>x</p>");
    MG.award("potion", 1, "test");
    await sleep(500);
    ok(!d.querySelector(".gitem"), "no popup over an open sheet");
    w.closeSheet(); await sleep(1500);
    ok(!!d.querySelector(".gitem"), "it appears once the sheet closes");
    Object.keys(MG.items).forEach(k => ok(MG.itemIcon(k).includes("<svg"), "icon for " + k));
  });
  ok(errs.length === 0, "no runtime errors (items): " + errs.slice(0, 2).join(" | "));

  // ---------- 8. sheets: page locked, focused field revealed, batch form keeps focus
  errs = await withApp({ "ml.game": started() }, async ({ w, d }) => {
    w.openSheet("Form", '<div class="field"><input id="a"></div>');
    ok(d.body.classList.contains("locked"), "the page behind a sheet is pinned");
    d.getElementById("a").focus();
    await sleep(80);
    ok(d.querySelector(".sheet").classList.contains("kbopen"), "focusing a field gives the sheet room above the keyboard");
    w.closeSheet();
    ok(!d.body.classList.contains("locked"), "and released when it closes");
    w.draft = null; w.openBatchForm();
    const nm = d.getElementById("mName"); nm.focus(); type(nm, "Soup", w);
    ok(d.activeElement === d.getElementById("mName") && d.getElementById("mName") === nm, "typing in the meal form no longer rebuilds the sheet");
  });
  ok(errs.length === 0, "no runtime errors (sheets): " + errs.slice(0, 2).join(" | "));

  process.exit(done("updates") ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(2); });
