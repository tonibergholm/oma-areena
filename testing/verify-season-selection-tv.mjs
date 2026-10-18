import assert from "node:assert/strict";
import fs from "node:fs";
import { connect } from "./tv-client.mjs";
const tv = await connect(),
  { evaluate: ev, until, key } = tv,
  report = { checks: [] };
const pass = (name, evidence) => {
  report.checks.push({ name, evidence });
  console.log("PASS", name, JSON.stringify(evidence));
};
const episodes = () =>
  ev(
    `Array.from(document.querySelectorAll('#season-episodes .episode')).map(b=>({id:b.dataset.programId,title:b.querySelector('strong').textContent}))`,
  );
async function ready(name) {
  await until(
    `document.getElementById('series-status').textContent`,
    (s) => s.includes(name) && s.includes("16 jaksoa"),
  );
  return episodes();
}
try {
  assert.equal(await ev("pocState.version"), "0.3.8");
  await ev(
    `seriesPanel.open('1-66244474',{isSeries:true,seasonId:'1-71260775'});true`,
  );
  const four = await ready("Kausi 4");
  assert(four[0].title.includes("Kääntöpuoli"));
  assert.equal(four[0].id, "1-71260756");
  pass("Season 4 has its own episodes", { count: four.length, first: four[0] });
  await key(39);
  const five = await ready("Kausi 5");
  assert(five[0].title.includes("Vauvakeikka"));
  assert.equal(five[0].id, "1-77571735");
  assert.equal(four.filter((a) => five.some((b) => a.id === b.id)).length, 0);
  pass("Season 5 has a disjoint episode list", {
    count: five.length,
    first: five[0],
  });
  await key(37);
  assert.deepEqual(await ready("Kausi 4"), four);
  pass("Returning to season 4 keeps the correct cached list", { ok: true });
  await key(40);
  await key(13);
  const playing = await until(
    `({state:webapis.avplay.getState(),time:webapis.avplay.getCurrentTime(),title:document.getElementById('playing-title').textContent})`,
    (p) => p.state === "PLAYING" && p.time > 1000,
  );
  assert(playing.title.includes("Kääntöpuoli"));
  pass("Season 4 selection plays the correct episode", playing);
  await key(10009);
  assert(await ev("seriesPanel.isActive()"));
  pass("Back restores the selected season", { ok: true });
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
    new URL("../data/season-selection-verification.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  tv.close();
}
