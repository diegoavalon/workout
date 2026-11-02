import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { auth } from "void/client";
import { BrandLogo } from "./components/BrandLogo";
import { Button } from "./components/ui/button";
import { Field, FieldLabel } from "./components/ui/field";
import { Input } from "./components/ui/input";

// Remembers that this device has signed in, so the installed PWA keeps working with no connection.
// The server is still the gate for anything that matters: the corpus route and /api/auth require a session.
const SEEN_KEY = "workout-signed-in";
const remember = (on: boolean) => { try { on ? localStorage.setItem(SEEN_KEY, "1") : localStorage.removeItem(SEEN_KEY); } catch { /* private mode */ } };
const remembered = () => { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; } };

type State = "checking" | "in" | "out";

export async function signOut() {
  remember(false);
  try { await auth.signOut(); } catch { /* offline: the local flag is already cleared */ }
  window.location.assign("/");
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>("checking");
  useEffect(() => {
    let live = true;
    auth.getSession().then(
      (res) => {
        if (!live) return;
        if (res.data?.user) { remember(true); setState("in"); }
        // A network failure is reported as an error, a missing session as empty data.
        else if (res.error && (res.error.status === 0 || res.error.status >= 500) && remembered()) setState("in");
        else { remember(false); setState("out"); }
      },
      () => { if (live) setState(remembered() ? "in" : "out"); },
    );
    return () => { live = false; };
  }, []);
  if (state === "checking") return <div className="min-h-dvh bg-background" aria-busy="true" />;
  if (state === "out") return <SignIn onDone={() => { remember(true); setState("in"); }} />;
  return <>{children}</>;
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(undefined);
    try {
      const res = await auth.signIn.email({ email, password });
      if (res.error) setError(res.error.status === 429 ? "Too many attempts. Wait a few seconds and try again." : "Incorrect email or password.");
      else onDone();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally { setBusy(false); }
  }
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border bg-card p-6 shadow-xs/5">
        <BrandLogo />
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Sign in</h1>
        <Field><FieldLabel>Email</FieldLabel><Input type="email" name="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field><FieldLabel>Password</FieldLabel><Input type="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
    </main>
  );
}
