// Creates the single owner account on a deployment. Needs the one-time SETUP_KEY secret to be set there:
//   void secret put SETUP_KEY
//   APP_URL=https://... OWNER_EMAIL=you@example.com OWNER_PASSWORD=... SETUP_KEY=... npm run auth:create-owner
// Afterwards remove it (void secret delete SETUP_KEY) so sign-up stays closed.
import { need, origin } from "./site.ts";

const res = await fetch(`${origin}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin, "x-setup-key": need("SETUP_KEY") },
  body: JSON.stringify({ email: need("OWNER_EMAIL"), password: need("OWNER_PASSWORD"), name: process.env.OWNER_NAME ?? "Owner" }),
});
if (!res.ok) { console.error(`Could not create the account (HTTP ${res.status}): ${await res.text()}`); process.exit(1); }
console.log("Owner account created. Now run: void secret delete SETUP_KEY");
