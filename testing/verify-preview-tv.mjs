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
  const status = await ev(
    `new Promise((resolve,reject)=>tizen.filesystem.resolve('wgt-private',d=>d.resolve('oma-preview-state.json').readAsText(s=>resolve(JSON.parse(s)),reject,'UTF-8'),reject,'r'))`,
  );
  assert(status.publishedAt > 0);
  assert.equal(status.error, null);
  const expected = await ev(
    `areenaPreviewModel.build(areenaLibrary.continuing())`,
  );
  assert.deepEqual(
    status.preview.sections.map((s) =>
      s.tiles.map((t) => JSON.parse(t.action_data).programId),
    ),
    expected.sections.map((s) =>
      s.tiles.map((t) => JSON.parse(t.action_data).programId),
    ),
  );
  pass("TV accepted Continue Watching shelf", {
    sections: status.preview.sections.length,
    tiles: status.preview.sections[0].tiles.length,
  });
  const original = await ev(
    `areenaLibrary.continuing().find(p=>p.id==='1-77565920') || areenaLibrary.continuing()[0]`,
  );
  assert(original);
  await ev(`catalogBrowser.open('search');true`);
  await ev(
    `new Promise((resolve,reject)=>tizen.application.launchAppControl(new tizen.ApplicationControl('http://samsung.com/appcontrol/operation/eden_resume',null,null,null,[new tizen.ApplicationControlData('PAYLOAD',[JSON.stringify({values:JSON.stringify({action:'resume',programId:${JSON.stringify(original.id)}})})])]),'AreenaPoC1.Areena',()=>resolve(true),reject))`,
  );
  const playback = await until(
    `({state:webapis.avplay.getState(),time:webapis.avplay.getCurrentTime(),event:pocEvents.filter(e=>e.event==='preview-resume').slice(-1)[0],browserHidden:document.getElementById('browser').classList.contains('hidden')})`,
    (v) =>
      v.state === "PLAYING" &&
      v.time > Math.max(1000, original.position - 2000) &&
      v.event,
  );
  assert.equal(playback.event.data.program, original.id);
  assert.equal(playback.browserHidden, true);
  pass("Real app-control request resumes saved episode", {
    id: original.id,
    saved: original.position,
    resumed: playback.time,
  });
  await key(10009);
  assert.equal(
    await ev(`document.getElementById('browser').classList.contains('hidden')`),
    true,
  );
  pass("Back returns home without stale search overlay", { ok: true });
  const errors = await ev(
    `pocEvents.filter(e=>e.event==='error'||e.event==='js-error'||e.event==='preview-unavailable'||e.event==='preview-link-error')`,
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  pass("No runtime or service-launch errors", { count: errors.length });
  report.complete = true;
} catch (e) {
  report.complete = false;
  report.error = String(e);
  console.error(e);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    new URL("../data/preview-verification.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  tv.close();
}
