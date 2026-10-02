// Boots the real app (index.html + every module) in jsdom, file-backed.
const fs = require("fs"), path = require("path");
const { JSDOM, ResourceLoader, VirtualConsole } = require("jsdom");
const ROOT = require("path").resolve(__dirname, "..");

class Loader extends ResourceLoader {
  fetch(url) {
    const u = new URL(url);
    const f = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!fs.existsSync(f)) return Promise.resolve(Buffer.from(""));
    return Promise.resolve(fs.readFileSync(f));
  }
}
function boot(opts = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on("error", e => errors.push("console.error " + e));
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/index.html", runScripts: "dangerously", resources: new Loader(),
    pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      if (opts.storage) for (const k in opts.storage) w.localStorage.setItem(k, JSON.stringify(opts.storage[k]));
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {} });
      w.fetch = (u) => {
        const s = String(u);
        if (s.includes("dex.json")) {
          const t = fs.readFileSync(path.join(ROOT, "game/dex.json"), "utf8");
          return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(t)) });
        }
        if (opts.off && s.includes("openfoodfacts")) return Promise.resolve({ ok: true, json: () => Promise.resolve(opts.off(s)) });
        return Promise.reject(new Error("offline in tests"));
      };
      w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.confirm = () => true;
      w.prompt = () => opts.promptAnswer || "";
      w.navigator.vibrate = () => true;
    }
  });
  return { dom, w: dom.window, d: dom.window.document, errors };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ready(w, names = ["MLGame", "MLLift", "MLKitchen", "MLPixel"]) {
  for (let i = 0; i < 200; i++) {
    if (names.every(n => w[n]) && w.MLGame.dexReady()) return true;
    await sleep(25);
  }
  throw new Error("modules never loaded: " + names.filter(n => !w[n]).join(","));
}
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log("  FAIL " + msg); } }
function done(label) { console.log(`${label}: ${pass} passed, ${fail} failed`); return fail; }
function type(el, v, w) { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); el.dispatchEvent(new w.Event("change", { bubbles: true })); }
module.exports = { boot, sleep, ready, ok, done, type };
