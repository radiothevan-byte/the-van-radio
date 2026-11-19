// Unit test: scheduled Journeys (Publish Date) on the app side. Run: node scripts/tests/test_journey_schedule.mjs
import assert from "assert";
import { athensToday, normalizeSheetDate, journeyIsLive } from "../../src/journeyschedule.js";
let n = 0; const ok = (name, fn) => { fn(); n++; console.log("ok -", name); };
ok("normalize ISO / ISO datetime", () => { assert.equal(normalizeSheetDate("2026-11-21"), "2026-11-21"); assert.equal(normalizeSheetDate("2026-11-21T00:00:00"), "2026-11-21"); assert.equal(normalizeSheetDate("2026-1-5"), "2026-01-05"); });
ok("normalize US and Greek style", () => { assert.equal(normalizeSheetDate("11/21/2026"), "2026-11-21"); assert.equal(normalizeSheetDate("21/11/2026"), "2026-11-21"); assert.equal(normalizeSheetDate("21.11.2026"), "2026-11-21"); });
ok("empty / garbage -> '' (fail-open)", () => { assert.equal(normalizeSheetDate(""), ""); assert.equal(normalizeSheetDate("αύριο"), ""); assert.equal(normalizeSheetDate(undefined), ""); });
ok("athensToday uses Greek time, not UTC", () => {
  assert.equal(athensToday(new Date("2026-11-20T22:30:00Z")), "2026-11-21");   // 00:30 in Athens already Saturday
  assert.equal(athensToday(new Date("2026-11-20T21:30:00Z")), "2026-11-20");   // 23:30 Friday in Athens
});
ok("live: no date = live (existing Journeys)", () => assert.equal(journeyIsLive("", "2026-11-20"), true));
ok("hidden before its date, live on and after", () => {
  assert.equal(journeyIsLive("2026-11-21", "2026-11-20"), false);
  assert.equal(journeyIsLive("2026-11-21", "2026-11-21"), true);
  assert.equal(journeyIsLive("2026-11-21", "2026-12-01"), true);
});
ok("garbage date does not hide a Journey", () => assert.equal(journeyIsLive("???", "2026-11-20"), true));
console.log(n + " passed");
