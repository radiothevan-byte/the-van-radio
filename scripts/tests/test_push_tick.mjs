// Test of the Vercel endpoint api/push-tick.js (stubbed network). Run: node scripts/tests/test_push_tick.mjs
import assert from "assert"; import crypto from "crypto";
import { generateVapidKeys } from "../webpush.mjs";
const b64u = (b) => Buffer.from(b).toString("base64url");
const vapid = generateVapidKeys();
function ua() { const e = crypto.createECDH("prime256v1"); e.generateKeys(); return { p256dh: b64u(e.getPublicKey()), auth: b64u(crypto.randomBytes(16)) }; }
const subs = [0, 1, 2].map((i) => ({ endpoint: "https://fcm.googleapis.com/fcm/send/test" + i, ...ua(), topics: ["shows", "news"], lang: "el" }));
let calls = [], dueNotes;
globalThis.fetch = async (url, init) => {
  calls.push(String(url));
  if (String(url).startsWith("https://script.google.com")) {
    const b = JSON.parse(init.body);
    if (b.form_type === "push_due") return new Response(JSON.stringify({ ok: true, notifications: dueNotes, subscriptions: subs }));
    if (b.form_type === "push_report") { calls.push("REPORT " + JSON.stringify(b.sent)); return new Response(JSON.stringify({ ok: true })); }
  }
  return new Response("", { status: 201 });                       // push service
};
const KEY = "tick-key-123";
Object.assign(process.env, { PUSH_TICK_KEY: KEY, PUSH_SENDER_SECRET: "s", VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey });
const { default: handler, authorised } = await import("../../api/push-tick.js");
function call(url, headers = {}) {
  return new Promise((resolve) => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, body: JSON.parse(b) }); } };
    handler({ url, headers }, res);
  });
}
let n = 0; const ok = async (name, fn) => { calls = []; await fn(); n++; console.log("ok -", name); };
dueNotes = [{ id: "a1", topic: "news", titleEl: "Τίτλος", titleEn: "Title", bodyEl: "x", bodyEn: "x", url: "/" }];
await ok("no key -> 401, nothing is called", async () => { const r = await call("/api/push-tick"); assert.equal(r.status, 401); assert.equal(calls.length, 0); });
await ok("wrong key -> 401", async () => { const r = await call("/api/push-tick", { authorization: "Bearer nope" }); assert.equal(r.status, 401); assert.equal(calls.length, 0); });
await ok("correct bearer -> sends to ALL 3 subscribers and reports back", async () => {
  const r = await call("/api/push-tick", { authorization: "Bearer " + KEY });
  assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.due, 1); assert.equal(r.body.subscriptions, 3);
  assert.deepEqual(r.body.sent, [{ id: "a1", recipients: 3, failed: 0 }]);
  assert.equal(calls.filter((c) => c.startsWith("https://fcm.googleapis.com")).length, 3);
  assert.ok(calls.some((c) => c.startsWith("REPORT")));
  assert.ok(!JSON.stringify(r.body).includes("fcm.googleapis"), "no endpoints in the response");
});
await ok("?key= works too", async () => { const r = await call("/api/push-tick?key=" + KEY); assert.equal(r.status, 200); });
await ok("dry=1 sends nothing and reports nothing", async () => {
  const r = await call("/api/push-tick?dry=1", { authorization: "Bearer " + KEY });
  assert.equal(r.body.dry, true); assert.equal(calls.filter((c) => c.startsWith("https://fcm")).length, 0); assert.ok(!calls.some((c) => c.startsWith("REPORT")));
});
await ok("nothing due -> ok, no push, no report", async () => {
  dueNotes = []; const r = await call("/api/push-tick", { authorization: "Bearer " + KEY });
  assert.equal(r.status, 200); assert.equal(r.body.due, 0); assert.ok(!calls.some((c) => c.startsWith("REPORT")));
});
await ok("missing env -> 503 not-configured", async () => {
  const k = process.env.VAPID_PRIVATE_KEY; delete process.env.VAPID_PRIVATE_KEY;
  const r = await call("/api/push-tick", { authorization: "Bearer " + KEY }); process.env.VAPID_PRIVATE_KEY = k;
  assert.equal(r.status, 503); assert.equal(r.body.error, "not-configured");
});
await ok("authorised(): empty key never matches", async () => assert.equal(authorised({ headers: { authorization: "Bearer " }, url: "/x?key=" }, ""), false));
console.log(n + " passed");
