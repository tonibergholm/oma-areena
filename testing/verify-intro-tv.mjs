import fs from "node:fs";
import assert from "node:assert/strict";
import { connect, delay } from "./tv-client.mjs";
const tv = await connect(),
  { evaluate: ev, until, key } = tv,
  report = { checks: [] };
function pass(name, evidence) {
  report.checks.push({ name, evidence });
  console.log("PASS", name, JSON.stringify(evidence));
}
async function choose(id) {
  await key(38);
  for (let i = 0; i < 10; i++) {
    if (
      (await ev(
        `(document.querySelector('#player-actions .action-selected') || {}).id`,
      )) === id
    ) {
      await key(13);
      return;
    }
    await key(39);
  }
  throw Error("Remote action unreachable: " + id);
}
const playing = () =>
  until(
    `({state:webapis.avplay.getState(),time:webapis.avplay.getCurrentTime()})`,
    (v) => v.state === "PLAYING" && v.time > 1000,
  );
try {
  assert.equal(await ev("pocState.version"), "0.3.8");
  await ev(
    `areenaLibrary.intro('1-3822119',null);openAreenaProgram('1-41272',{restart:true});true`,
  );
  await playing();
  await choose("learn-intro");
  assert.equal(
    await ev(`document.getElementById('learn-intro').textContent`),
    "Tunnari päättyy tähän",
  );
  await key(40);
  await key(39);
  await until(`pocEvents.some(e=>e.event==='seek')`, Boolean);
  await choose("learn-intro");
  const range = await ev(`areenaLibrary.intro('1-3822119')`);
  assert(range.end - range.start > 9000);
  pass("Remote teaches intro start and end", range);
  await choose("learn-intro");
  await choose("clear-intro");
  assert.deepEqual(await ev(`areenaLibrary.intro('1-3822119')`), range);
  pass("Cancel teaching preserves saved timing", { ok: true });
  await key(10009);
  await ev(`openAreenaProgram('1-52702',{restart:true});true`);
  await playing();
  await until(
    `!document.getElementById('intro-prompt').classList.contains('hidden')`,
    Boolean,
  );
  await key(38);
  assert.equal(
    await ev(`document.querySelector('#player-actions .action-selected').id`),
    "skip-intro",
  );
  await key(13);
  const jumped = await until(
    "webapis.avplay.getCurrentTime()",
    (t) => t >= range.end - 500,
  );
  await until(
    `document.getElementById('intro-prompt').classList.contains('hidden')`,
    Boolean,
  );
  pass("Next episode offers skip and jumps to saved intro end", {
    end: range.end,
    time: jumped,
  });
  await key(13);
  assert.equal(await ev("webapis.avplay.getState()"), "PAUSED");
  await key(13);
  pass("Pause remains available after skipping", { ok: true });
  await key(38);
  const bounds = await ev(
    `({promptRight:document.getElementById('intro-prompt').getBoundingClientRect().right,buttons:Array.from(document.querySelectorAll('#player-actions button')).filter(b=>!b.classList.contains('hidden')).every(b=>b.getBoundingClientRect().right<=innerWidth)})`,
  );
  assert(bounds.buttons);
  pass("Playback controls fit TV", bounds);
  await key(10009);
  await ev(`setTimeout(()=>location.reload(),300);true`);
  await delay(1100);
  await until(`pocState.version`, (v) => v === "0.3.8");
  assert.deepEqual(await ev(`areenaLibrary.intro('1-3822119')`), range);
  pass("Intro timing survives app reload", { ok: true });
  await ev(`openAreenaProgram('1-41272',{restart:true});true`);
  await playing();
  await choose("clear-intro");
  assert.equal(await ev(`areenaLibrary.intro('1-3822119')`), null);
  assert.equal(
    await ev(
      `document.getElementById('intro-prompt').classList.contains('hidden')`,
    ),
    true,
  );
  pass("Remote removes saved intro", { ok: true });
  await key(10009);
  const errors = await ev(
    `pocEvents.filter(e=>e.event==='error'||e.event==='js-error')`,
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  pass("No runtime errors", { count: errors.length });
  report.complete = true;
} catch (e) {
  report.complete = false;
  report.error = String(e);
  console.error(e);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    new URL("../data/intro-verification.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  tv.close();
}
