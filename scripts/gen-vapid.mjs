// One-off: prints a new VAPID key pair. The PUBLIC key goes in src/push.jsx; the PRIVATE key only in the
// GitHub secret VAPID_PRIVATE_KEY. Never commit the private key.
import { generateVapidKeys } from "./webpush.mjs";
const k = generateVapidKeys();
console.log("VAPID_PUBLIC_KEY=" + k.publicKey);
console.log("VAPID_PRIVATE_KEY=" + k.privateKey);
