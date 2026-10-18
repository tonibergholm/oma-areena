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
async function bounds() {
  return ev(
    `(()=>{var c=document.querySelector('.home-cards .card.selected'),r=c.parentNode.parentNode,h=r.querySelector('h2').getBoundingClientRect(),b=c.getBoundingClientRect(),v=document.getElementById('home-shelves').getBoundingClientRect(),rail=c.parentNode.getBoundingClientRect();return {row:r.dataset.row,headingTop:h.top,headingBottom:h.bottom,cardTop:b.top,cardBottom:b.bottom,shelfTop:v.top,shelfBottom:v.bottom,cardLeft:b.left,cardRight:b.right,railLeft:rail.left,railRight:rail.right,vertical:document.getElementById('home-shelves').scrollTop,horizontal:c.parentNode.scrollLeft,hero:document.getElementById('hero').getBoundingClientRect().top,documentScroll:document.scrollingElement.scrollTop};})()`,
  );
}
async function visible(name) {
  const b = await bounds();
  assert(
    b.headingTop >= b.shelfTop + 4 && b.cardBottom <= b.shelfBottom - 4,
    JSON.stringify(b),
  );
  assert(b.headingBottom < b.cardTop);
  assert.equal(b.hero, 0);
  assert.equal(b.documentScroll, 0);
  pass(name, b);
  return b;
}
try {
  assert.equal(await ev("pocState.version"), "0.3.8");
  await until(
    `document.querySelectorAll('.home-cards .card').length`,
    (n) => n > 0,
  );
  await ev(`document.getElementById('nav-library').click();true`);
  await visible("Initial row heading and card are visible");
  const count = await ev(`document.querySelectorAll('.home-row').length`);
  for (let i = 1; i < count; i++) {
    await key(40);
    await visible("Down keeps row " + (i + 1) + " heading with its cards");
  }
  for (let i = count - 1; i > 0; i--) {
    await key(38);
    await visible("Up keeps row " + i + " heading with its cards");
  }
  const first = await bounds();
  assert.equal(first.row, "continue");
  assert.equal(first.vertical, 0);
  pass("Continue Watching returns fully to the top", {
    scroll: first.vertical,
  });
  await key(38);
  await key(40);
  await visible("Hero actions return without clipping the heading");
  await ev(`homeScreen.refresh();true`);
  await visible("Library refresh keeps the selected heading visible");
  const original = await ev(`areenaLibrary.continuing()`);
  // In-memory fixture only, to exercise a long horizontal rail without changing history.
  await ev(
    `window.__homeRowsLibrary=areenaLibrary;window.areenaLibrary=Object.assign({},areenaLibrary,{continuing:()=>Array.from({length:8},(_,i)=>(${JSON.stringify(original)})[i%${original.length}]),favourites:()=>[]});document.getElementById('nav-library').click();true`,
  );
  for (let i = 0; i < 7; i++) await key(39);
  const last = await visible(
    "Horizontal navigation keeps the whole selected row visible",
  );
  assert(last.horizontal > 0);
  assert(
    last.cardLeft >= last.railLeft + 4 && last.cardRight <= last.railRight - 4,
  );
  await key(39);
  const wrapped = await visible("Horizontal wrap returns to the first card");
  assert.equal(wrapped.horizontal, 0);
  await ev(
    `window.areenaLibrary=window.__homeRowsLibrary;delete window.__homeRowsLibrary;document.getElementById('nav-library').click();true`,
  );
  await visible("Original home rows restored");
  assert.equal(
    await ev(
      `Array.from(document.querySelectorAll('.home-row')).every(r=>r.dataset.row==='continue'||r.dataset.row==='favourites')`,
    ),
    true,
  );
  await ev(
    `window.__homeRowsLibrary=areenaLibrary;window.areenaLibrary=Object.assign({},areenaLibrary,{continuing:()=>[],favourites:()=>[]});homeScreen.show();true`,
  );
  assert.equal(await ev(`document.querySelectorAll('.home-row').length`), 0);
  assert.equal(
    await ev(`document.querySelectorAll('#hero button:not(.hidden)').length`),
    0,
  );
  assert.equal(
    await ev(
      `document.getElementById('nav-browse').classList.contains('nav-selected')`,
    ),
    true,
  );
  await key(39);
  await key(13);
  assert.equal(
    await ev(
      `document.getElementById('search-panel').classList.contains('hidden')`,
    ),
    false,
  );
  await key(10009);
  await ev(
    `window.areenaLibrary=window.__homeRowsLibrary;delete window.__homeRowsLibrary;homeScreen.show();true`,
  );
  pass(
    "Empty library guides remote navigation to search without test shortcuts",
    { ok: true },
  );
  await visible("Real library restored after empty-state fixture");
  const errors = await ev(
    `pocEvents.filter(e=>e.event==='error'||e.event==='js-error')`,
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report.complete = true;
} catch (e) {
  report.complete = false;
  report.error = String(e);
  console.error(e);
  process.exitCode = 1;
} finally {
  await ev(
    `if(window.__homeRowsLibrary){window.areenaLibrary=window.__homeRowsLibrary;delete window.__homeRowsLibrary;homeScreen.show();}true`,
  ).catch(() => {});
  fs.writeFileSync(
    new URL("../data/home-rows-verification.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  tv.close();
}
