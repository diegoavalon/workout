import { useEffect, useState, type FormEvent } from "react";
import { EyeIcon, EyeOffIcon, KeyRoundIcon, LockIcon } from "lucide-react";
import { auth } from "void/client";
import { BrandLogo } from "./components/BrandLogo";
import { Button } from "./components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./components/ui/input-group";

type Phase = "checking" | "open" | "closed";
const goHome = () => window.location.assign("/");

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-background px-5 pt-[max(3rem,env(safe-area-inset-top))] text-foreground sm:items-center sm:bg-muted/40 sm:pt-0">
      <div className="flex w-full max-w-sm flex-col gap-6 sm:rounded-2xl sm:border sm:bg-card sm:p-6 sm:shadow-xs/5">
        <BrandLogo />
        {children}
      </div>
    </main>
  );
}

/** First-run owner claim. Not linked from sign-in; reached only by typing /setup. */
export function Setup({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [keyError, setKeyError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/setup").then((r) => r.json() as Promise<{ open: boolean }>).then(
      (d) => { if (live) setPhase(d.open ? "open" : "closed"); },
      () => { if (live) setPhase("open"); }, // can't tell (offline): let the server decide on submit
    );
    return () => { live = false; };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setKeyError(undefined); setError(undefined);
    try {
      const res = await auth.signUp.email({ email, password, name: name.trim() || "Owner", fetchOptions: { headers: { "x-setup-key": key.trim() } } });
      if (!res.error) return onDone();
      const msg = res.error.message ?? "";
      if (/already exists/i.test(msg)) setPhase("closed");
      else if (res.error.status === 403) setKeyError("That setup key isn’t right.");
      else if (res.error.status === 429) setError("Too many attempts. Wait a few seconds and try again.");
      else setError(msg || "Could not create the account.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  if (phase === "checking") return <div className="min-h-dvh bg-background" aria-busy="true" />;

  if (phase === "closed") {
    return (
      <Screen>
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><LockIcon className="size-5.5" /></span>
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">This Tempo is already set up</h1>
          <p className="text-sm text-muted-foreground">It has an owner, so new accounts can’t be created. If it’s yours, sign in.</p>
        </div>
        <Button size="xl" onClick={goHome}>Go to sign in</Button>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Set up your account</h1>
        <p className="text-sm text-muted-foreground">This creates the only account on this server. Sign-up closes as soon as you’re done.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <fieldset disabled={busy} className="flex flex-col gap-4">
          <Field invalid={!!keyError}>
            <FieldLabel>Setup key</FieldLabel>
            <InputGroup>
              <InputGroupAddon><KeyRoundIcon /></InputGroupAddon>
              <InputGroupInput size="lg" name="setup-key" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={key} onChange={(e) => setKey(e.target.value)} aria-invalid={!!keyError || undefined} />
            </InputGroup>
            {keyError ? <FieldError match>{keyError}</FieldError> : <FieldDescription>The <code>SETUP_KEY</code> secret set on the Void project.</FieldDescription>}
          </Field>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input size="lg" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input size="lg" type="email" name="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Password</FieldLabel>
            <InputGroup>
              <InputGroupInput size="lg" type={show ? "text" : "password"} name="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
              <InputGroupAddon align="inline-end">
                <Button type="button" variant="ghost" size="icon-xs" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow((v) => !v)}>
                  {show ? <EyeOffIcon /> : <EyeIcon />}
                </Button>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>At least 8 characters.</FieldDescription>
          </Field>
          {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
          <Button type="submit" size="xl" loading={busy}>Create account</Button>
        </fieldset>
      </form>
    </Screen>
  );
}
