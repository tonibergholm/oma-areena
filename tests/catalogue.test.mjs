import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
const source = fs.readFileSync(
  new URL("../app/data.js", import.meta.url),
  "utf8",
);
function adapter(respond) {
  const calls = [];
  let counter = 0;
  const files = new Map();
  const context = {
    window: {},
    console: { log() {} },
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    JSON,
    Error,
  };
  context.tizen = {
    DownloadRequest: function (url) {
      this.url = url;
    },
    download: {
      start(req, callbacks) {
        calls.push(req.url);
        const id = ++counter;
        queueMicrotask(() => {
          try {
            files.set("tmp/" + id, respond(req.url));
            callbacks.oncompleted(id, "tmp/" + id);
          } catch (e) {
            callbacks.onfailed(id, { message: e.message });
          }
        });
        return id;
      },
      cancel() {},
    },
    filesystem: {
      resolve(path, success) {
        success({
          fullPath: path,
          parent: {
            deleteFile(path, ok) {
              files.delete(path);
              ok();
            },
          },
          readAsText(ok) {
            ok(files.get(path));
          },
        });
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return {
    api: context.window.areenaBrowse,
    request: context.window.areenaRequest,
    calls,
    files,
  };
}
const card = (id = "1-123", type = "program") => ({
  title: "Testiohjelma",
  pointer: { uri: "yleareena://items/" + id, type },
  image: { id: "13-test" },
  labels: [],
});
test("categories use fresh page sources and omit authenticated rows", async () => {
  const contents = [
    {
      type: "list",
      title: "Draama",
      source: {
        uri: "https://areena.api.yle.fi/v1/ui/content/list?token=public-source",
      },
    },
    {
      type: "list",
      title: "Jatka",
      audience: { authenticated: true },
      source: { uri: "https://areena.api.yle.fi/v1/ui/content/list?private=1" },
    },
  ];
  const a = adapter(
    () =>
      '<script id="__NEXT_DATA__">' +
      JSON.stringify({
        props: { pageProps: { view: { tabs: [{ content: contents }] } } },
      }) +
      "</script>",
  );
  const cats = await a.api.categories();
  assert.equal(cats.length, 1);
  assert.equal(cats[0].title, "Draama");
  await a.api.categories();
  assert.equal(a.calls.length, 1);
  assert.equal(a.files.size, 0);
});
test("search encodes query, maps playable cards, and honours paging", async () => {
  const a = adapter(() =>
    JSON.stringify({
      meta: { count: 30 },
      data: [card(), card("1-456", "series"), card("30-12", "package")],
    }),
  );
  const page = await a.api.search("ää & ö", 1);
  const url = new URL(a.calls[0]);
  assert.equal(url.searchParams.get("query"), "ää & ö");
  assert.equal(url.searchParams.get("offset"), "12");
  assert.equal(page.items.length, 2);
  assert.equal(page.items[1].kind, "series");
  assert.equal(page.hasMore, true);
  assert.equal(page.total, 30);
  assert.equal(a.files.size, 0);
});
test("empty query does not request the network", async () => {
  const a = adapter(() => {
    throw Error("should not fetch");
  });
  assert.equal((await a.api.search("   ", 0)).items.length, 0);
  assert.equal(a.calls.length, 0);
});
test("server failures propagate instead of reporting empty results", async () => {
  const a = adapter(() => {
    throw Error("Offline");
  });
  await assert.rejects(a.api.search("Pasila", 0), /Offline/);
});
test("series result resolves to its playable programme ID", async () => {
  const a = adapter((url) => {
    if (url.includes("/preview/1-1.")) return JSON.stringify({ data: {} });
    if (url.includes("/players/1-1."))
      return JSON.stringify({ data: { ondemand: { item: { id: "1-2" } } } });
    return JSON.stringify({
      data: {
        ongoing_ondemand: {
          title: { fin: "Jakso" },
          series: { title: { fin: "Sarja" } },
          duration: { duration_in_seconds: 10 },
          image: { id: "13-test" },
          manifest_url: "https://cdn.example/stream.m3u8",
        },
      },
    });
  });
  const p = await a.request("/api/program/1-1");
  assert.equal(p.id, "1-2");
  assert.equal(p.series, "Sarja");
  assert.equal(a.calls.length, 3);
});
