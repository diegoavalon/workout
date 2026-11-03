import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { auth } from "void/client";
import { BrandLogo } from "./components/BrandLogo";
import { CircleAlertIcon, ClockIcon, EyeIcon, EyeOffIcon, WifiOffIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./components/ui/input-group";
import { Field, FieldLabel } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { Setup } from "./setup";

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
  if (state === "out" && window.location.pathname === "/setup") return <Setup onDone={() => { remember(true); window.location.assign("/"); }} />;
  if (state === "out") return <SignIn onDone={() => { remember(true); setState("in"); }} />;
  return <>{children}</>;
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (offline || wait > 0) return;
    setBusy(true); setError(undefined);
    let retryAfter = 0;
    try {
      const res = await auth.signIn.email({
        email,
        password,
        fetchOptions: { onError: (ctx) => { retryAfter = Number(ctx.response.headers.get("X-Retry-After")) || 0; } },
      });
      if (!res.error) return onDone();
      if (res.error.status === 429) setWait(Math.max(1, Math.ceil(retryAfter)) || 8);
      else if (res.error.status === 0 || res.error.status >= 500) setOffline(!navigator.onLine);
      else { setError("That email and password don’t match. Check both and try again."); setPassword(""); setTimeout(() => passwordRef.current?.focus(), 0); }
    } catch {
      setOffline(true);
    } finally { setBusy(false); }
  }

  const label = offline ? "Waiting for connection\u2026" : wait > 0 ? `Try again in ${wait}s` : "Sign in";
  return (
    <main className="flex min-h-dvh items-start justify-center bg-background px-5 pt-[max(3rem,env(safe-area-inset-top))] text-foreground sm:items-center sm:bg-muted/40 sm:pt-0">
      <div className="flex w-full max-w-sm flex-col gap-6 sm:rounded-2xl sm:border sm:bg-card sm:p-6 sm:shadow-xs/5">
        <BrandLogo />
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground">Once you’re in, this device stays signed in and works without a connection.</p>
        </div>
        {wait > 0 && (
          <Alert variant="warning"><ClockIcon /><AlertDescription>Too many attempts. Sign-in is paused for a few seconds to protect your account.</AlertDescription></Alert>
        )}
        {offline && (
          <Alert variant="warning"><WifiOffIcon /><AlertTitle>You’re offline</AlertTitle><AlertDescription>Signing in needs a connection the first time on this device. After that, Tempo opens offline.</AlertDescription></Alert>
        )}
        <form onSubmit={submit} className="flex flex-col gap-4">
          <fieldset disabled={busy} className="flex flex-col gap-4">
            <Field invalid={!!error}>
              <FieldLabel>Email</FieldLabel>
              <Input size="lg" type="email" name="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error || undefined} />
            </Field>
            <Field invalid={!!error}>
              <FieldLabel>Password</FieldLabel>
              <InputGroup>
                <InputGroupInput ref={passwordRef} size="lg" type={show ? "text" : "password"} name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error || undefined} />
                <InputGroupAddon align="inline-end">
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow((v) => !v)}>
                    {show ? <EyeOffIcon /> : <EyeIcon />}
                  </Button>
                </InputGroupAddon>
              </InputGroup>
              {error && <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive-foreground"><CircleAlertIcon className="mt-0.5 size-4 shrink-0" />{error}</p>}
            </Field>
            <Button type="submit" size="xl" loading={busy} disabled={offline || wait > 0}>{label}</Button>
          </fieldset>
        </form>
        <p className="text-xs text-muted-foreground">Tempo has one owner account. Forgot your password? Reset it from the server with <code>void</code> CLI access.</p>
      </div>
    </main>
  );
}
