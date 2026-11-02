// Shared by the deploy helper scripts: talks to a running deployment as the owner.
export const origin = (process.env.APP_URL ?? process.argv[2] ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(origin)) {
  console.error("Set APP_URL (or pass it as the first argument), e.g. APP_URL=https://workout.example.workers.dev");
  process.exit(1);
}

export function need(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`Set ${name} in the environment.`); process.exit(1); }
  return v;
}

/** Signs in and returns the session cookie header value. */
export async function signIn(): Promise<string> {
  const res = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email: need("OWNER_EMAIL"), password: need("OWNER_PASSWORD") }),
  });
  if (!res.ok) { console.error(`Sign-in failed (HTTP ${res.status}): ${await res.text()}`); process.exit(1); }
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  if (!cookies.length) { console.error("Sign-in returned no session cookie."); process.exit(1); }
  return cookies.join("; ");
}
