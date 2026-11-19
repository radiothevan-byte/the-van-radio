// Node (vm) test of automatic push notifications (Saturday show, new Journey, song/poll) in the Apps Script.
// Run: node scripts/tests/test_auto_push.mjs
import fs from "fs"; import vm from "vm"; import assert from "assert";
const src = fs.readFileSync(new URL("../../apps-script/AppWebhookScript.gs.txt", import.meta.url), "utf8");

function sheet(rows) {  // rows[0] = header
  return {
    rows,
    getLastRow: () => rows.length, getLastColumn: () => (rows[0] || []).length,
    getRange(r, c, nr, nc) {
      return {
        getValues: () => rows.slice(r - 1, r - 1 + (nr || 1)).map((x) => { const o = []; for (let k = c - 1; k < c - 1 + (nc || x.length); k++) o.push(x[k] === undefined ? "" : x[k]); return o; }),
        setValue: (v) => { while (rows[r - 1].length < c) rows[r - 1].push(""); rows[r - 1][c - 1] = v; },
        setNumberFormat() {},
      };
    },
    appendRow(x) { rows.push(x); },
  };
}
function run({ now, journeys, props = {}, outbox = [], song = null, poll = null, flags = "" }) {
  const P = { ...props };
  const FakeDate = class extends Date { constructor(...a) { if (a.length === 0) super(now); else super(...a); } static now() { return new Date(now).getTime(); } };
  const outH = ["ID", "Topic", "Title EL", "Title EN", "Body EL", "Body EN", "URL", "Send At", "Status", "Source", "Ref", "Created At", "Sent At", "Recipients"];
  const sheets = { "Push Outbox": sheet([outH, ...outbox]) };
  if (journeys) sheets["Journey"] = sheet(journeys);
  if (song) sheets["Song of the Day"] = sheet(song);
  if (poll) sheets["Van Poll"] = sheet(poll);
  const ctx = {
    console, Date: FakeDate, JSON, Math, Object, Array, String, parseInt, isFinite, RegExp, Error,
    Utilities: { sleep() {}, formatDate: (d, tz, f) => { const z = (x) => String(x).padStart(2, "0"); const L = d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); return f === "yyyy-MM-dd" ? L : d.toISOString().replace(/[-:T]/g, "").slice(0, 14); } },
    Session: { getScriptTimeZone: () => "UTC" },
    CacheService: { getScriptCache: () => ({ remove() {}, get: () => null, put() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in P ? P[k] : null), setProperty: (k, v) => { P[k] = v; } }) },
    Logger: { log() {} },
  };
  vm.createContext(ctx); vm.runInContext(src + "\n" + flags, ctx);
  ctx.pushCollectNews_({ getSheetByName: (n) => sheets[n] || null });
  return { out: sheets["Push Outbox"].rows.slice(1), props: P };
}
let n = 0; const ok = (name, fn) => { fn(); n++; console.log("ok -", name); };
const SAT = (h, m = 0) => new Date(2026, 10, 21, h, m);   // Saturday 21 Nov 2026 (local time)
const FRI = new Date(2026, 10, 20, 12, 0);
const J = (...t) => [["Title", "Date", "Description", "Audio URL", "Image URL"], ...t.map((x, i) => [x, "2026-11-0" + (i + 1), "", "https://a/" + x + ".mp3", ""])];

ok("Saturday morning: show row created for 18:00, topic shows, Approved", () => {
  const { out } = run({ now: SAT(9) });
  assert.equal(out.length, 1);
  const r = out[0];
  assert.equal(r[1], "shows"); assert.equal(r[8], "Approved"); assert.equal(r[10], "show:2026-11-21");
  assert.equal(new Date(r[7]).getTime(), SAT(18).getTime());
  assert.equal(r[2], "Η εκπομπή ξεκινά τώρα");
});
ok("Saturday: idempotent (no second row)", () => {
  const first = run({ now: SAT(9) });
  const second = run({ now: SAT(17), outbox: first.out });
  assert.equal(second.out.length, 1);
});
ok("Saturday 18:20 (within grace): still created", () => assert.equal(run({ now: SAT(18, 20) }).out.length, 1));
ok("Saturday 19:00 (too late): no stale notice", () => assert.equal(run({ now: SAT(19) }).out.length, 0));
ok("Friday: no show row", () => assert.equal(run({ now: FRI }).out.length, 0));
ok("Cancelled show is not recreated", () => {
  const cancelled = ["x", "shows", "", "", "", "", "/", SAT(18), "Cancelled", "Auto", "show:2026-11-21", "", "", ""];
  assert.equal(run({ now: SAT(12), outbox: [cancelled] }).out.length, 1);
});
ok("PUSH_AUTO_SHOWS=false disables it", () => assert.equal(run({ now: SAT(9), flags: "PUSH_AUTO_SHOWS = false;" }).out.length, 0));
ok("Lead time works (30 min before)", () => {
  const r = run({ now: SAT(9), flags: "PUSH_SHOW_LEAD_MIN = 30;" }).out[0];
  assert.equal(new Date(r[7]).getTime(), SAT(17, 30).getTime()); assert.equal(r[2], "Η εκπομπή ξεκινά σύντομα");
});

const DAY = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const PD = (rows) => rows[0].indexOf("Publish Date");
ok("Journey: first run = baseline: column created, nothing stamped, nothing notified", () => {
  const rows = J("A", "B");
  const { out, props } = run({ now: FRI, journeys: rows });
  assert.equal(out.length, 0); assert.equal(JSON.parse(props.PUSH_JOURNEYS_SEEN).length, 2);
  assert.equal(PD(rows), 5); assert.ok(rows.slice(1).every((r) => !r[5]), "existing journeys stay live (no date)");
});
ok("Journey: new row after baseline is stamped with TOMORROW, no notification yet", () => {
  const rows = J("A", "B");
  const b = run({ now: FRI, journeys: rows });
  rows.push(["C", "2026-11-20", "", "https://a/C.mp3", ""]);
  const r1 = run({ now: FRI, journeys: rows, props: b.props });
  assert.equal(r1.out.length, 0);
  assert.equal(DAY(rows[3][5]), "2026-11-21");
  assert.ok(!rows[1][5] && !rows[2][5]);
});
ok("Journey: next day it is due -> ONE news notification (once only)", () => {
  const rows = J("A"); const b = run({ now: FRI, journeys: rows });
  rows.push(["C", "", "", "https://a/C.mp3", ""]);
  const r1 = run({ now: FRI, journeys: rows, props: b.props });
  const sat9 = SAT(9);
  const r2 = run({ now: sat9, journeys: rows, props: r1.props });
  const j = r2.out.filter((r) => r[10].startsWith("journey:"));
  assert.equal(j.length, 1); assert.equal(j[0][1], "news"); assert.equal(j[0][2], "Νέο Journey"); assert.equal(j[0][4], "C"); assert.equal(j[0][8], "Approved");
  assert.equal(new Date(j[0][7]).getTime(), SAT(10).getTime());          // goes out at 10:00
  const r3 = run({ now: SAT(11), journeys: rows, props: r2.props, outbox: r2.out });
  assert.equal(r3.out.filter((r) => r[10].startsWith("journey:")).length, 1);
});
ok("Journey: manual Publish Date = today is respected and notified", () => {
  const rows = J("A"); const b = run({ now: FRI, journeys: rows });
  rows.push(["Z", "", "", "https://a/Z.mp3", "", new Date(2026, 10, 20)]);
  const r = run({ now: FRI, journeys: rows, props: b.props });
  assert.equal(r.out.filter((x) => x[10].startsWith("journey:")).length, 1);
});
ok("Journey: manual FUTURE Publish Date is left alone (not overwritten, not notified)", () => {
  const rows = J("A"); const b = run({ now: FRI, journeys: rows });
  const future = new Date(2026, 11, 5);
  rows.push(["F", "", "", "https://a/F.mp3", "", future]);
  const r = run({ now: FRI, journeys: rows, props: b.props });
  assert.equal(r.out.length, 0); assert.equal(rows[2][5], future);
});
ok("Journey: row without audio is ignored until audio is added", () => {
  const rows = J("A"); const b = run({ now: FRI, journeys: rows });
  rows.push(["B", "", "", "", ""]);
  const r1 = run({ now: FRI, journeys: rows, props: b.props });
  assert.ok(!rows[2][5], "not stamped yet");
  rows[2][3] = "https://a/B.mp3";
  run({ now: FRI, journeys: rows, props: r1.props });
  assert.equal(DAY(rows[2][5]), "2026-11-21");
});
ok("Journey: at most 3 stamped per run", () => {
  const rows = J("A"); const b = run({ now: FRI, journeys: rows });
  ["B", "C", "D", "E"].forEach((t) => rows.push([t, "", "", "https://a/" + t, ""]));
  run({ now: FRI, journeys: rows, props: b.props });
  assert.equal(rows.slice(2).filter((r) => r[5]).length, 3);
});
ok("Journey: corrupt property -> safe re-baseline, nothing stamped", () => {
  const rows = J("A", "B");
  assert.equal(run({ now: FRI, journeys: rows, props: { PUSH_JOURNEYS_SEEN: "{oops" } }).out.length, 0);
  assert.ok(rows.slice(1).every((r) => !r[5]));
});
ok("Journey: missing sheet doesn't break song/poll", () => {
  const song = [["ID", "Title", "Artist", "Status", "Publish Date"], ["s1", "Hello", "Adele", "Published", new Date(2026, 10, 20)]];
  const r = run({ now: FRI, song });
  assert.equal(r.out.length, 1); assert.equal(r.out[0][10], "song:s1");
});
console.log(n + " passed");
