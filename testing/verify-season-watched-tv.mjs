import fs from "node:fs";
import assert from "node:assert/strict";
import { connect } from "./tv-client.mjs";
const tv = await connect(),
  { evaluate: ev, until, key } = tv,
  report = { checks: [] };
function pass(name, evidence) {
  report.checks.push({ name, evidence });
  console.log("PASS", name, JSON.stringify(evidence));
}
try {
  assert.equal(await ev("pocState.version"), "0.3.7");
  await ev(
    `seriesPanel.open('1-3822119',{isSeries:true,seasonId:'1-41273'});true`,
  );
  await until(
    `document.querySelectorAll('#season-episodes .episode').length`,
    (n) => n === 12,
  );
  const original = await ev(
    `JSON.stringify(Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>{var k=localStorage.key(i);return [k,localStorage.getItem(k)];})))`,
  );
  // Ensure this acceptance run starts with a partially watched season.
  await ev(`areenaLibrary.remove('1-41272');true`);
  await key(38);
  await key(39);
  assert.equal(
    await ev(
      `document.getElementById('season-watched').classList.contains('series-selected')`,
    ),
    true,
  );
  await key(13);
  const marked = await ev(
    `({season:areenaLibrary.seasonWatched('1-3822119','1-41273'),gray:document.querySelector('#season-tabs button').classList.contains('watched-season'),label:document.querySelector('#season-tabs button').textContent,status:document.getElementById('series-status').textContent,episodes:document.querySelectorAll('.watched-episode').length,undo:document.getElementById('season-watched').textContent})`,
  );
  assert(marked.season && marked.gray);
  assert.equal(marked.episodes, 12);
  assert(marked.status.includes("12/12"));
  assert(marked.label.endsWith(" ✓"));
  assert(marked.undo.includes("Peru"));
  pass("Remote bulk marking updates season and every episode", marked);
  const bounds = await ev(
    `({button:document.getElementById('season-watched').getBoundingClientRect().right,pager:document.getElementById('series-pager').getBoundingClientRect().bottom,color:getComputedStyle(document.querySelector('#season-tabs button')).color})`,
  );
  assert(bounds.button <= 1920 && bounds.pager <= 1040);
  pass("Muted season tab and actions fit TV", bounds);
  await key(13);
  assert.equal(
    await ev(`areenaLibrary.seasonWatched('1-3822119','1-41273')`),
    false,
  );
  assert.equal(
    await ev(
      `document.querySelector('#season-tabs button').classList.contains('watched-season')`,
    ),
    false,
  );
  pass("Remote undo removes season completion", { ok: true });
  await key(13);
  await key(40);
  await key(39);
  await until(
    `document.getElementById('series-status').textContent`,
    (s) => s.includes("Kausi 2") && s.includes("12 jaksoa"),
  );
  assert.equal(
    await ev(
      `document.querySelector('#season-tabs button').classList.contains('watched-season')`,
    ),
    true,
  );
  pass("Watched season stays gray while browsing another season", { ok: true });
  // Restore test setup before leaving; the outer personal backup is also restored after checks.
  await ev(
    `localStorage.clear();Object.entries(${original}).forEach(([k,v])=>localStorage.setItem(k,v));setTimeout(()=>location.reload(),500);true`,
  );
  report.complete = true;
} catch (e) {
  report.complete = false;
  report.error = String(e);
  console.error(e);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    new URL("../data/season-watched-verification.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  tv.close();
}
