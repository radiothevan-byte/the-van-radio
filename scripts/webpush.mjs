// Minimal Web Push (RFC 8030 + RFC 8291 aes128gcm + RFC 8292 VAPID) using only node:crypto and fetch.
// No npm dependency. Used by scripts/send-push.mjs (GitHub Action) — never bundled into the app.
import crypto from "node:crypto";

export const b64u = {
  enc: (buf) => Buffer.from(buf).toString("base64url"),
  dec: (s) => Buffer.from(String(s), "base64url"),
};

// Push services we are willing to talk to. Subscriptions are supplied by browsers via a public
// form, so the endpoint host MUST be checked before the server POSTs anything to it (SSRF guard).
const ALLOWED_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^updates-autopush\.(stage|dev)\.mozaws\.net$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9.-]+\.notify\.windows\.com$/,
];
export function isAllowedEndpoint(endpoint) {
  try {
    const u = new URL(String(endpoint));
    return u.protocol === "https:" && !u.port && !u.username && !u.password && ALLOWED_HOSTS.some((re) => re.test(u.hostname));
  } catch { return false; }
}

export function generateVapidKeys() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const pub = publicKey.export({ format: "jwk" });
  const raw = Buffer.concat([Buffer.from([4]), b64u.dec(pub.x), b64u.dec(pub.y)]);
  return { publicKey: b64u.enc(raw), privateKey: jwk.d };
}

function privateKeyObject(publicB64u, privateB64u) {
  const raw = b64u.dec(publicB64u);
  if (raw.length !== 65 || raw[0] !== 4) throw new Error("bad VAPID public key");
  return crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", x: b64u.enc(raw.subarray(1, 33)), y: b64u.enc(raw.subarray(33, 65)), d: privateB64u },
    format: "jwk",
  });
}

export function vapidHeader(endpoint, subject, publicKey, privateKey, nowSec = Math.floor(Date.now() / 1000)) {
  const aud = new URL(endpoint).origin;
  const head = b64u.enc(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u.enc(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: subject }));
  const data = `${head}.${claims}`;
  const sig = crypto.sign("sha256", Buffer.from(data), { key: privateKeyObject(publicKey, privateKey), dsaEncoding: "ieee-p1363" });
  return `vapid t=${data}.${b64u.enc(sig)}, k=${publicKey}`;
}

// RFC 8291 §3.4 — returns the full aes128gcm request body (header + one record).
// `overrides` (as ephemeral private key + salt) exists only so the test can use the RFC's vector.
export function encryptPayload(payload, uaPublicB64u, authSecretB64u, overrides = {}) {
  const plaintext = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), "utf8");
  if (plaintext.length > 3993) throw new Error("payload too large for one record");
  const uaPublic = b64u.dec(uaPublicB64u);
  const authSecret = b64u.dec(authSecretB64u);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("bad p256dh");
  if (authSecret.length !== 16) throw new Error("bad auth");

  const ecdh = crypto.createECDH("prime256v1");
  if (overrides.asPrivate) ecdh.setPrivateKey(b64u.dec(overrides.asPrivate)); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = overrides.salt ? b64u.dec(overrides.salt) : crypto.randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// Test helper: the user agent's side of RFC 8291 (decrypt).
export function decryptPayload(message, uaPrivateB64u, uaPublicB64u, authSecretB64u) {
  const salt = message.subarray(0, 16);
  const idLen = message[20];
  const asPublic = message.subarray(21, 21 + idLen);
  const data = message.subarray(21 + idLen);
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(b64u.dec(uaPrivateB64u));
  const shared = ecdh.computeSecret(asPublic);
  const uaPublic = b64u.dec(uaPublicB64u);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, b64u.dec(authSecretB64u), keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error("bad padding delimiter");
  return plain.subarray(0, end);
}

// Returns { status, ok, gone }. gone = the subscription is dead (404/410) and should be dropped.
export async function sendWebPush(sub, payload, { subject, publicKey, privateKey, ttl = 3600, urgency = "normal", topic, fetchImpl = fetch } = {}) {
  if (!isAllowedEndpoint(sub.endpoint)) return { status: 0, ok: false, gone: true, reason: "endpoint-not-allowed" };
  const body = encryptPayload(payload, sub.p256dh, sub.auth);
  const headers = {
    Authorization: vapidHeader(sub.endpoint, subject, publicKey, privateKey),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(ttl),
    Urgency: urgency,
  };
  if (topic && /^[A-Za-z0-9_-]{1,32}$/.test(topic)) headers.Topic = topic;
  const res = await fetchImpl(sub.endpoint, { method: "POST", headers, body });
  return { status: res.status, ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410 };
}
