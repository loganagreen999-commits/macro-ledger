// Freezer: freeze a portion of a cooked batch, its own timer, thaw it back.
const { boot, sleep, ready, ok, done, type } = require("./harness");
const N = (k, p) => { const n = new Array(18).fill(0); n[0] = k; n[1] = p; n[7] = 300; return n; };
const game = { v: 1, started: false, player: { lvl: 1, xp: 0 }, party: [], box: [], items: {}, seen: {}, caught: {},
  nextUid: 1, day: null, streak: 0, mult: 1, spent: {}, goalsHit: {}, missions: [], week: null, theme: "modern", enc: null, log: [] };
(async () => {
  const today = new Date(); const dk = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  const batch = { id: "b1", name: "Chili", cookedAt: Date.now() - 864e5, shelfDays: 5, yieldQty: 6, yieldUnit: "cups",
    ing: [{ name: "Beef", brand: "", serving: "4 oz", grams: 0, qty: 3, n: N(280, 20) }, { name: "Beans", brand: "", serving: "1 can", grams: 0, qty: 2, n: N(300, 20) }] };
  const app = boot({ storage: { "ml.game": game, "ml.batches": [batch],
    "ml.days": { [dk]: [{ id: "e1", name: "Chili", brand: "Meal prep", serving: "cup", grams: 0, qty: 1, meal: "Lunch", n: N(240, 16.7), batchId: "b1", unitPlural: "cups" }] } } });
  const { w, d } = app;
  await ready(w, ["MLKitchen", "MLGame"]);
  const S = w.MLGame.tracker(), K = w.MLKitchen;
  const tot = b => w.batchTotals(b)[0];
  const per = b => w.batchPerUnit(b)[0];
  const before = tot(S.batches[0]), perBefore = per(S.batches[0]);

  // freeze 2 of the 5 cups left
  const fz = K.freezeBatch("b1", 2, 60);
  const orig = S.batches.find(b => b.id === "b1");
  ok(fz && fz.id !== "b1" && fz.frozen && fz.yieldQty === 2, "freezing part makes a new frozen portion of 2");
  ok(orig.yieldQty === 4 && !orig.frozen, "the rest stays in the fridge");
  ok(w.batchUsed("b1") === 1 && orig.yieldQty - w.batchUsed("b1") === 3, "the cup already eaten still counts against the fridge part (3 left)");
  ok(Math.abs(per(fz) - perBefore) < 1e-9 && Math.abs(per(orig) - perBefore) < 1e-9, "same kcal per cup in both parts");
  ok(Math.abs(tot(fz) + tot(orig) - before) < 1e-6, "no calories created or lost by splitting");
  const fr = w.freshness(fz);
  ok(fr.cls === "frozen" && /Frozen · 2 mo left/.test(fr.label) && fr.frac > 0.99, "frozen portion runs on its own freezer clock (" + fr.label + ")");

  // the old fridge clock is untouched, the freezer clock runs down
  fz.frozenAt = Date.now() - 45 * 864e5;
  ok(Math.abs(w.freshness(fz).frac - 0.25) < 0.01, "freezer bar is the share of freezer time left");
  fz.frozenAt = Date.now() - 61 * 864e5;
  ok(w.freshness(fz).over && /burn/.test(w.freshness(fz).label), "past its freezer time it is flagged");
  fz.frozenAt = Date.now();

  // UI: fridge list hides frozen, freezer view shows the icy bar
  S.view = "meals"; w.localStorage.setItem("ml.k.seg", JSON.stringify("cooked")); w.localStorage.setItem("ml.k.cseg", JSON.stringify("fridge")); w.render();
  ok(d.querySelectorAll(".kcard").length === 1 && !d.querySelector(".icebar"), "the fridge shows only fridge food");
  ok(/Freezer · 1/.test(d.querySelector('[data-cseg="freezer"]').textContent), "the freezer tab counts what is in it");
  d.querySelector('[data-cseg="freezer"]').click();
  ok(d.querySelectorAll(".kcard.frozen").length === 1 && !!d.querySelector(".icebar .iceshine") && !!d.querySelector(".icebar .icesnow"), "the freezer shows an icy bar with glint and snowflake");
  ok(parseFloat(d.querySelector(".icebar>i").style.width) >= 99, "a freshly frozen bar is full");

  // UI freeze flow from the fridge: snowflake -> half -> 3 mo -> freeze
  d.querySelector('[data-cseg="fridge"]').click();
  d.querySelector("[data-freeze]").click();
  ok(/Freeze Chili/.test(d.querySelector(".shead h3").textContent), "the snowflake opens a freeze sheet");
  ok(d.getElementById("kFrQ").value === "3", "it starts at everything that is left (3)");
  d.querySelector('[data-pset="1.5"]').click();
  d.querySelector('[data-fd="90"]').click();
  d.getElementById("kFrGo").click();
  const frozen = S.batches.filter(b => b.frozen);
  ok(frozen.length === 2 && frozen.some(b => b.yieldQty === 1.5 && b.freezerDays === 90), "half of what was left went in for 3 months");
  ok(JSON.parse(w.localStorage.getItem("ml.k.cseg")) === "freezer", "and the view follows it to the freezer");

  // thaw one cup of the 2-cup portion
  const two = S.batches.find(b => b.frozen && b.yieldQty === 2);
  w.render();
  d.querySelector('[data-thaw="' + two.id + '"]').click();
  type(d.getElementById("kThQ"), "1", w);
  d.getElementById("kThGo").click();
  const thawed = S.batches.find(b => b.thawedAt && !b.frozen);
  ok(thawed && thawed.yieldQty === 1 && thawed.shelfDays === 3 && Date.now() - thawed.cookedAt < 5000, "thawing 1 cup puts it back in the fridge on a fresh 3-day clock");
  ok(two.yieldQty === 1 && two.frozen, "the other cup stays frozen");
  ok(Math.abs(S.batches.reduce((a, b) => a + tot(b), 0) - before) < 1e-6, "calories still add up after freeze, freeze and thaw");

  // freezing everything left moves the whole batch, not a copy
  const fridgeOnes = S.batches.filter(b => !b.frozen && b.id !== thawed.id);
  const whole = fridgeOnes[0], wid = whole.id, left = whole.yieldQty - w.batchUsed(wid);
  K.freezeBatch(wid, left, 30);
  ok(S.batches.find(b => b.id === wid).frozen, "freezing all of what is left freezes the batch itself");

  // the add-food sheet lists fridge meals only
  w.openSearch({ mode: "log" });
  const fridgeRows = [...d.querySelectorAll("#results .sectlab")].map(x => x.textContent);
  const shown = [...d.querySelectorAll("#results [data-food]")].map(x => JSON.parse(x.dataset.food)).filter(f => f.isBatch).map(f => f.batchId);
  ok(shown.every(id => !S.batches.find(b => b.id === id).frozen), "frozen food is not offered as a fridge meal to log");
  w.closeSheet();
  ok(app.errors.length === 0, "no runtime errors: " + app.errors.slice(0, 2).join(" | "));
  w.close();
  process.exit(done("freezer") ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(2); });
