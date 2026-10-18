import fs from "node:fs";
import assert from "node:assert/strict";
import { connect } from "./tv-client.mjs";
const tv = await connect(),
  { evaluate: ev, until, key } = tv,
  report = { checks: [] };
const pass = (name, evidence) => {
  report.checks.push({ name, evidence });
  console.log("PASS", name, JSON.stringify(evidence));
};
try {
  assert.equal(await ev("pocState.version"), "0.3.6");
  const results = await ev(`areenaBrowse.search('Vakooja joukossamme',0)`),
    series = results.items.find(
      (p) => p.kind === "series" && p.title.includes("Vakooja joukossamme"),
    );
  assert(series);
  await ev(
    `seriesPanel.open(${JSON.stringify(series.id)},{isSeries:true});true`,
  );
  await until(
    `document.querySelectorAll('#season-episodes .episode').length`,
    (n) => n > 0,
  );
  const info = await ev(`areenaSeries.info(${JSON.stringify(series.id)},true)`);
  assert(info.description.length > 100);
  await key(38);
  await key(37);
  assert.equal(
    await ev(
      `document.getElementById('read-description').classList.contains('series-selected')`,
    ),
    true,
  );
  await key(13);
  assert.equal(
    await ev(`document.getElementById('description-text').textContent`),
    info.description,
  );
  pass("Remote opens the complete series description", {
    title: info.title,
    characters: info.description.length,
  });
  const bounds = await ev(
    `({height:innerHeight,closeBottom:document.getElementById('description-close').getBoundingClientRect().bottom,sheetBottom:document.querySelector('.description-sheet').getBoundingClientRect().bottom,bodyHeight:document.getElementById('description-body').clientHeight})`,
  );
  assert(
    bounds.closeBottom < bounds.height &&
      bounds.sheetBottom <= bounds.height &&
      bounds.bodyHeight > 300,
  );
  pass("Full description and close control fit TV", bounds);
  // Exercise overflow with a long local text fixture, without changing metadata or library state.
  await ev(
    `document.getElementById('description-text').textContent=${JSON.stringify((info.description+'\n\n').repeat(20)+'END OF DESCRIPTION')};true`,
  );
  await key(40);
  let scroll = await ev(
    `document.getElementById('description-body').scrollTop`,
  );
  assert(scroll > 0);
  await key(38);
  assert(
    (await ev(`document.getElementById('description-body').scrollTop`)) <
      scroll,
  );
  for (let i = 0; i < 70; i++) {
    if (
      await ev(
        `(()=>{var b=document.getElementById('description-body');return b.scrollTop+b.clientHeight>=b.scrollHeight-1;})()`,
      )
    )
      break;
    await key(40);
  }
  assert.equal(
    await ev(
      `(()=>{var b=document.getElementById('description-body');return b.scrollTop+b.clientHeight>=b.scrollHeight-1;})()`,
    ),
    true,
  );
  pass("Remote scrolling reaches the end of long descriptions", { ok: true });
  await key(10009);
  assert.equal(await ev("seriesPanel.isActive()"), true);
  assert.equal(
    await ev(
      `document.getElementById('read-description').classList.contains('series-selected')`,
    ),
    true,
  );
  pass("Back returns to the description action", { ok: true });
  await key(40);
  await key(40);
  await key(40);
  const selected = await ev(
      `document.querySelector('#season-episodes .series-selected').dataset.programId`,
    ),
    description = await ev(
      `document.querySelector('#season-episodes .series-selected span').textContent`,
    );
  assert(description);
  await key(37);
  assert.equal(
    await ev(`document.getElementById('description-text').textContent`),
    description,
  );
  await key(13);
  assert.equal(
    await ev(
      `document.querySelector('#season-episodes .series-selected').dataset.programId`,
    ),
    selected,
  );
  pass("Episode description returns to the same selected episode", {
    ok: true,
  });
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
    new URL("../data/description-verification.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  tv.close();
}
