import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";
const require = createRequire(import.meta.url),
  model = require("../app/preview-model.js");
const episode = (id, updatedAt = 1) => ({
  id,
  series: "Pasila",
  episode: "K1, J1",
  image: "https://images.cdn.yle.fi/example.jpg",
  position: 65000,
  updatedAt,
});
test("preview contains only recent unfinished episodes with safe resume actions", () => {
  const tiles = model.build([
    episode("1-1"),
    episode("1-2", 2),
    { ...episode("1-3"), completed: true },
    { ...episode("1-4"), position: 9000 },
    { ...episode("1-5"), image: "javascript:bad" },
    episode("bad"),
  ]).sections[0].tiles;
  assert.equal(tiles.length, 2);
  assert.equal(JSON.parse(tiles[0].action_data).programId, "1-2");
  assert.equal(tiles[0].image_ratio, "16by9");
  assert.equal(tiles[0].is_playable, true);
  assert(tiles[0].subtitle.includes("Jatka 1 min"));
  assert(!JSON.stringify(tiles).includes("manifest"));
});
test("empty history clears the shelf; long history keeps the newest twenty", () => {
  assert.deepEqual(model.build([]), { sections: [] });
  const tiles = model.build(
    Array.from({ length: 30 }, (_, i) => episode("1-" + i, i)),
  ).sections[0].tiles;
  assert.equal(tiles.length, 20);
  assert.equal(JSON.parse(tiles[0].action_data).programId, "1-29");
});
test("deep links accept Samsung wrappers and reject malformed or unrelated payloads", () => {
  const action = { action: "resume", programId: "1-123" };
  for (const payload of [
    action,
    { values: JSON.stringify(action) },
    { values: action },
  ])
    assert.equal(
      model.action([{ key: "PAYLOAD", value: [JSON.stringify(payload)] }]),
      "1-123",
    );
  for (const payload of [
    "broken",
    JSON.stringify({ action: "resume", programId: "https://bad" }),
    JSON.stringify({ action: "delete", programId: "1-1" }),
  ])
    assert.equal(model.action([{ key: "PAYLOAD", value: [payload] }]), null);
  assert.equal(model.action([]), null);
});
function service(saved, preview, error) {
  let contents = saved && JSON.stringify(saved),
    exits = 0,
    calls = 0;
  const file = {
    readAsText(cb) {
      cb(contents);
    },
    openStream(mode, cb) {
      cb({
        write(text) {
          contents = text;
        },
        close() {},
      });
    },
  };
  const dir = {
    resolve() {
      if (!contents) throw Error("missing");
      return file;
    },
    createFile() {
      return file;
    },
  };
  const context = {
    module: { exports: {} },
    Date: { now: () => 1000000 },
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    tizen: {
      filesystem: {
        resolve(path, cb) {
          cb(dir);
        },
      },
      application: {
        getCurrentApplication: () => ({
          exit() {
            exits++;
          },
          getRequestedAppControl: () => ({
            appControl: {
              data: preview
                ? [{ key: "oma-preview", value: [JSON.stringify(preview)] }]
                : [],
            },
          }),
        }),
      },
    },
    webapis: {
      preview: {
        setPreviewData(data, ok, fail) {
          calls++;
          error ? fail({ name: "UnknownError", message: "failed" }) : ok();
        },
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      new URL("../app/service/preview.js", import.meta.url),
      "utf8",
    ),
    context,
  );
  context.module.exports.onRequest();
  return { state: JSON.parse(contents || "{}"), exits, calls };
}
test("service publishes and exits, then preserves newer history during the ten minute limit", () => {
  const preview = model.build([episode("1-1")]);
  const first = service(null, preview);
  assert.equal(first.calls, 1);
  assert.equal(first.exits, 1);
  assert.equal(first.state.publishedAt, 1000000);
  const next = service(first.state, model.build([episode("1-2")]));
  assert.equal(next.calls, 0);
  assert.equal(next.exits, 1);
  assert.equal(
    JSON.parse(next.state.preview.sections[0].tiles[0].action_data).programId,
    "1-2",
  );
});
test("scheduled service reads cached history; API failures exit without advancing the timestamp", () => {
  const old = { preview: model.build([]), publishedAt: 1 };
  const result = service(old);
  assert.equal(result.calls, 1);
  assert.equal(result.exits, 1);
  const failed = service(old, null, true);
  assert.equal(failed.exits, 1);
  assert.equal(failed.state.publishedAt, 1);
  assert.match(failed.state.error, /UnknownError/);
});
