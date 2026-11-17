// Offline checks for scripts/webpush.mjs: RFC 8291 Appendix A vector, round trip, VAPID signature, SSRF guard.
import crypto from "node:crypto";
import { b64u, encryptPayload, decryptPayload, vapidHeader, generateVapidKeys, isAllowedEndpoint, sendWebPush } from "./webpush.mjs";
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

// RFC 8291 Appendix A
const V = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};
const enc = encryptPayload(V.plaintext, V.uaPublic, V.auth, { asPrivate: V.asPrivate, salt: V.salt });
ok(b64u.enc(enc) === V.body, "RFC 8291 Appendix A vector: encrypted body matches");
ok(decryptPayload(b64u.dec(V.body), V.uaPrivate, V.uaPublic, V.auth).toString() === V.plaintext, "RFC 8291 vector decrypts to the plaintext");

// round trip with random keys + unicode (Greek) payload
const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
const auth = crypto.randomBytes(16);
const msg = JSON.stringify({ title: "Εκπομπή Σαββάτου", body: "Ξεκινάμε σε 30 λεπτά 🎙", url: "/journeys" });
const e2 = encryptPayload(msg, b64u.enc(ua.getPublicKey()), b64u.enc(auth));
ok(decryptPayload(e2, b64u.enc(ua.getPrivateKey()), b64u.enc(ua.getPublicKey()), b64u.enc(auth)).toString() === msg, "round trip (Greek + emoji)");
ok(e2.length < 4096 + 100, "single record");
let threw = false; try { encryptPayload("x".repeat(4000), b64u.enc(ua.getPublicKey()), b64u.enc(auth)); } catch { threw = true; }
ok(threw, "oversized payload is refused");

// VAPID
const k = generateVapidKeys();
ok(b64u.dec(k.publicKey).length === 65, "VAPID public key is 65 bytes");
const h = vapidHeader("https://fcm.googleapis.com/fcm/send/abc", "mailto:test@example.com", k.publicKey, k.privateKey, 1_800_000_000);
const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
ok(!!m && m[4] === k.publicKey, "VAPID header shape");
const pubRaw = b64u.dec(k.publicKey);
const pubKey = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u.enc(pubRaw.subarray(1, 33)), y: b64u.enc(pubRaw.subarray(33)) }, format: "jwk" });
ok(crypto.verify("sha256", Buffer.from(`${m[1]}.${m[2]}`), { key: pubKey, dsaEncoding: "ieee-p1363" }, b64u.dec(m[3])), "VAPID JWT signature verifies (ES256, raw r||s)");
const claims = JSON.parse(b64u.dec(m[2]).toString());
ok(claims.aud === "https://fcm.googleapis.com" && claims.sub === "mailto:test@example.com" && claims.exp === 1_800_000_000 + 43200, "VAPID claims (aud origin, sub, exp 12h)");

// SSRF guard
for (const [u, want] of [["https://fcm.googleapis.com/fcm/send/x", true], ["https://updates.push.services.mozilla.com/wpush/v2/x", true], ["https://web.push.apple.com/x", true],
  ["https://evil.example.com/x", false], ["http://fcm.googleapis.com/x", false], ["https://fcm.googleapis.com.evil.com/x", false], ["https://169.254.169.254/latest", false], ["https://fcm.googleapis.com:8443/x", false], ["not a url", false]])
  ok(isAllowedEndpoint(u) === want, `endpoint guard ${want ? "allows" : "blocks"} ${u}`);

// sendWebPush uses the allowlist and reports gone for 410
let called = 0;
const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: b64u.enc(ua.getPublicKey()), auth: b64u.enc(auth) };
const r1 = await sendWebPush(sub, msg, { subject: "mailto:t@example.com", publicKey: k.publicKey, privateKey: k.privateKey, fetchImpl: async (url, init) => { called++; ok(init.headers["Content-Encoding"] === "aes128gcm" && init.headers.TTL === "3600", "request headers"); return { status: 410 }; } });
ok(called === 1 && r1.gone === true && r1.ok === false, "410 is reported as gone");
const r2 = await sendWebPush({ ...sub, endpoint: "https://evil.example.com/x" }, msg, { subject: "mailto:t@example.com", publicKey: k.publicKey, privateKey: k.privateKey, fetchImpl: async () => { called++; return { status: 201 }; } });
ok(called === 1 && r2.ok === false, "disallowed endpoint is never contacted");
console.log(fails ? `FAILS ${fails}` : "ALL PASS");
process.exit(fails ? 1 : 0);
