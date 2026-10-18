import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(
  new URL("../app/library.js", import.meta.url),
  "utf8",
);
function library(store = new Map()) {
  let tick = 0;
  const context = {
    window: { dispatchEvent() {} },
    CustomEvent: function (name, args) {
      this.type = name;
      this.detail = args?.detail;
    },
    Date: { now: () => ++tick },
    Promise,
    JSON,
    isFinite,
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      key: (i) => [...store.keys()][i],
      get length() {
        return store.size;
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { api: context.window.areenaLibrary, store };
}
const p = (id = "1-1") => ({
  id,
  seriesId: "1-100",
  seasonId: "1-200",
  series: "Sarja",
  episode: "Jakso",
  duration: 1200,
  image: "image",
  manifest: "https://cdn/expiring?secret=temporary",
});
test("Continue Watching persists after reload and strips expiring playback data", () => {
  const a = library();
  a.api.update(p(), 65000);
  assert.equal(a.api.continuing().length, 1);
  const b = library(a.store);
  assert.equal(b.api.position("1-1"), 65000);
  assert.equal(b.api.continuing()[0].series, "Sarja");
  assert(!a.store.get("oma-areena-library-v1").includes("manifest"));
  assert(!a.store.get("oma-areena-library-v1").includes("secret"));
});
test("completed episodes leave Continue Watching and get watched state", () => {
  const a = library();
  a.api.update(p(), 65000);
  a.api.update(p(), 1200000, true);
  assert.equal(a.api.continuing().length, 0);
  assert(a.api.watched("1-1"));
  assert.equal(a.api.position("1-1"), 0);
  assert(!a.store.has("progress:1-1"));
});
test("favourites are unique per series and can be removed after reload", () => {
  const a = library();
  assert(a.api.toggle(p("1-1")));
  assert.equal(a.api.favourites()[0].id, "1-100");
  assert(a.api.isFavourite(p("1-2")));
  const b = library(a.store);
  assert.equal(b.api.favourites().length, 1);
  assert.equal(b.api.toggle(p("1-2")), false);
  assert.equal(b.api.favourites().length, 0);
});
test("history orders recent entries and removal clears legacy resume", () => {
  const a = library();
  a.api.update(p("1-1"), 100000);
  a.api.update(p("1-2"), 200000);
  assert.equal(a.api.continuing()[0].id, "1-2");
  a.api.remove("1-2");
  assert.equal(a.api.position("1-2"), 0);
  assert.equal(a.api.continuing().length, 1);
});
test("old numeric progress migrates without losing unavailable entries", async () => {
  const a = library(
    new Map([
      ["progress:1-1", "65000"],
      ["progress:1-2", "90000"],
    ]),
  );
  await a.api.migrate(async (id) => {
    if (id === "1-2") throw Error("offline");
    return p(id);
  });
  assert.equal(a.api.continuing().length, 1);
  assert.equal(a.api.position("1-2"), 90000);
  await a.api.migrate(async (id) => p(id));
  assert.equal(a.api.continuing().length, 2);
});
test("season selection persists independently for each series", () => {
  const a = library();
  a.api.season("1-100", "1-6");
  a.api.season("1-101", "1-3");
  const b = library(a.store);
  assert.equal(b.api.season("1-100"), "1-6");
  assert.equal(b.api.season("1-101"), "1-3");
});
