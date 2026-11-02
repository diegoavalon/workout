import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRightIcon, CalendarIcon, CheckIcon, ChevronDownIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Calendar } from "./components/ui/calendar";
import { Checkbox } from "./components/ui/checkbox";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "./components/ui/collapsible";
import { Field, FieldDescription, FieldLabel } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "./components/ui/popover";
import { Progress } from "./components/ui/progress";
import { toastManager } from "./components/ui/toast";
import { repo } from "./data/db";
import type { GeneratedSnapshot } from "./domain/generated-program";
import { corpusCached, generateProgram, GenerateError, loadManifest, type CorpusManifest, type GenerateProgress } from "./generate/client";
import { MAX_SEED, STYLES, WEEKS, buildOptions, daysFor, defaultInput, equipmentLabel, parseSeed, randomSeed, validateInput, type ProgramInput, type Style } from "./generate/options";
import type { GeneratedProgram } from "./domain/generated";
import { cn } from "./lib/utils";

const FALLBACK_EQUIPMENT = ["band", "barbell", "bench", "bike", "box", "cable", "dumbbell", "jump-rope", "kettlebell", "landmine", "machine", "medicine-ball", "plate", "pull-up-bar", "pvc", "rings", "rower", "ski-erg"];
const mb = (n: number) => (n / 1e6).toFixed(1);

/** Inputs that reproduce a saved block, for "Edit inputs" and "Generate another". */
export function inputFromOptions(o: GeneratedProgram["options"]): ProgramInput {
  const m = /^(pump-lift|pump-condition)-(\d)x$/.exec(o.track);
  const style = (m ? m[1] : o.track) as Style;
  const startDate = o.startDate ?? defaultInput().startDate;
  const days = m ? Number(m[2]) : daysFor(style)[0];
  return { style, days, restrictEquipment: o.equipment !== undefined, equipment: o.equipment ?? [], startDate, seed: o.seed === undefined ? "" : String(o.seed), allowRecent: o.avoidRecent === false };
}

type GenState = { status: "idle" } | { status: "running"; progress?: GenerateProgress } | { status: "error"; message: string; offline?: boolean };

/** Runs one generation at a time and registers the result through the normal validation/snapshot path. */
export function useGeneration() {
  const [state, setState] = useState<GenState>({ status: "idle" });
  const busy = useRef(false);
  const run = useCallback(async (input: ProgramInput, opts: { avoidSeed?: number } = {}): Promise<{ snapshot: GeneratedSnapshot; duplicate: boolean } | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    setState({ status: "running" });
    try {
      const parsed = parseSeed(input.seed);
      let seed = parsed.seed ?? randomSeed();
      if (opts.avoidSeed !== undefined) while (seed === opts.avoidSeed) seed = randomSeed();
      const options = buildOptions(input, seed);
      const manifest = await loadManifest();
      const result = await generateProgram(manifest, options, (progress) => setState({ status: "running", progress }));
      const saved = await repo.importGenerated(result);
      if (!saved.snapshot) throw new Error(`The generated program did not pass validation: ${saved.errors.join(" ")}`);
      setState({ status: "idle" });
      return { snapshot: saved.snapshot, duplicate: saved.duplicate };
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : String(e), offline: e instanceof GenerateError && e.kind === "download" });
      return undefined;
    } finally { busy.current = false; }
  }, []);
  return { state, run };
}

export function GenerationStatus({ state }: { state: GenState }) {
  if (state.status === "running") {
    const p = state.progress;
    const text = !p ? "Starting…" : p.phase === "download" ? `Downloading source programs · ${mb(p.loaded ?? 0)} of ${mb(p.total ?? 0)} MB` : p.phase === "parse" ? "Preparing source programs…" : "Building your six weeks…";
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
        <span className="flex items-center gap-2"><LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />{text}</span>
        {p?.phase === "download" && p.total ? <Progress value={((p.loaded ?? 0) / p.total) * 100} aria-label="Download progress" /> : null}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <Alert variant="error"><TriangleAlertIcon /><AlertTitle>{state.offline ? "Can’t download yet" : "Couldn’t generate a program"}</AlertTitle><AlertDescription>{state.message} Your choices are kept.</AlertDescription></Alert>
    );
  }
  return null;
}

function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-sm font-semibold">{label}</legend>
      <div className="flex flex-col gap-3">
        {children}
        {hint && <p className="text-[13px] leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
    </fieldset>
  );
}
const choice = (on: boolean) => cn(
  "min-h-11 justify-start shadow-none transition-colors",
  on && "border-foreground/60 bg-accent/60 dark:bg-accent/60",
);

export function NewProgram({ from }: { from?: GeneratedSnapshot }) {
  const nav = useNavigate();
  const [input, setInput] = useState<ProgramInput>(() => (from ? inputFromOptions(from.file.options) : defaultInput()));
  const [manifest, setManifest] = useState<CorpusManifest | null>(null);
  const [cached, setCached] = useState<boolean | null>(null);
  const [touched, setTouched] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { state, run } = useGeneration();
  const running = state.status === "running";
  useEffect(() => { loadManifest().then((m) => { setManifest(m); corpusCached(m).then(setCached); }).catch(() => setCached(false)); }, []);
  const set = (p: Partial<ProgramInput>) => setInput((i) => ({ ...i, ...p }));
  const errors = validateInput(input);
  const seedError = parseSeed(input.seed).error;
  const dateError = errors.find((e) => e.startsWith("Start"));
  const selectedDate = input.startDate ? new Date(`${input.startDate}T00:00:00`) : undefined;
  const tags = manifest?.equipment ?? FALLBACK_EQUIPMENT;
  const days = daysFor(input.style);
  const pickStyle = (style: Style) => set({ style, days: daysFor(style).includes(input.days) ? input.days : daysFor(style)[0] });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true);
    if (errors.length || running) return;
    const r = await run(input);
    if (!r) return;
    toastManager.add({ title: r.duplicate ? "Already saved — opened the existing program" : "Program saved on this device" });
    nav({ to: "/generated/$id", params: { id: r.snapshot.id } });
  };
  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-[clamp(26px,4vw,32px)] leading-[1.15] font-semibold tracking-tight text-balance">New program</h1>
        <p className="max-w-120 text-[15px] leading-relaxed text-muted-foreground">Choose how you want to train. Preview your six-week program before you start.</p>
      </div>
      <form onSubmit={submit} noValidate className="flex flex-col gap-7 sm:gap-8" aria-busy={running}>
        <Group label="Training style">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {STYLES.map((s) => (
              <Button key={s.id} type="button" variant="outline" aria-pressed={input.style === s.id} disabled={running} className={cn(choice(input.style === s.id), "h-auto items-start gap-4 rounded-xl p-4 text-start whitespace-normal sm:h-auto sm:min-h-27")} onClick={() => pickStyle(s.id)}>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-[15px] leading-5 font-semibold">{s.label}</span>
                  <span className="text-[13px] leading-5 font-normal text-muted-foreground">{s.blurb}</span>
                </span>
                <span aria-hidden="true" className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", input.style === s.id ? "border-foreground bg-foreground text-background" : "border-input")}>
                  <CheckIcon className={cn("size-3", input.style !== s.id && "invisible")} />
                </span>
              </Button>
            ))}
          </div>
        </Group>
        <div className="grid gap-6 border-y py-6 sm:grid-cols-2 sm:gap-8">
          <Group label="Days per week" hint={days.length === 1 ? `${STYLES.find((s) => s.id === input.style)!.label} is always ${days[0]} days a week.` : "Choose a frequency that fits your week."}>
            <div className="flex gap-2">
              {days.map((d) => <Button key={d} type="button" variant="outline" aria-pressed={input.days === d} disabled={running || days.length === 1} className={cn(choice(input.days === d), "min-w-16 justify-center text-base tabular-nums sm:text-base")} onClick={() => set({ days: d })}>{d}</Button>)}
            </div>
          </Group>
          <Field invalid={touched && !!dateError} disabled={running} className="gap-3">
            <FieldLabel htmlFor="program-start" className="text-sm leading-5 font-semibold">Suggested start (a Monday)</FieldLabel>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger
                id="program-start"
                disabled={running}
                aria-invalid={touched && !!dateError}
                aria-describedby={dateError && (touched || input.startDate) ? "start-date-hint start-date-error" : "start-date-hint"}
                render={<Button type="button" variant="outline" className="min-h-11 w-full max-w-64 justify-between gap-3 px-3 font-normal" />}
              >
                {selectedDate ? selectedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Choose a Monday"}
                <CalendarIcon aria-hidden="true" className="text-muted-foreground" />
              </PopoverTrigger>
              <PopoverPopup align="start" aria-label="Choose a Monday">
                <Calendar
                  mode="single"
                  required
                  autoFocus
                  weekStartsOn={1}
                  defaultMonth={selectedDate}
                  selected={selectedDate}
                  disabled={(date) => running || date.getDay() !== 1}
                  onSelect={(date) => {
                    set({ startDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` });
                    setCalendarOpen(false);
                  }}
                />
              </PopoverPopup>
            </Popover>
            <FieldDescription id="start-date-hint" className="text-[13px] leading-relaxed">Go at your own pace. Missed dates never skip a session.</FieldDescription>
            {dateError && (touched || input.startDate) && <p id="start-date-error" role="alert" className="text-[13px] text-destructive-foreground">{dateError}</p>}
          </Field>
        </div>
        <Group label="Equipment" hint="Bodyweight exercises are always included.">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button type="button" variant="outline" aria-pressed={!input.restrictEquipment} disabled={running} className={cn(choice(!input.restrictEquipment), "justify-center px-3 text-sm")} onClick={() => set({ restrictEquipment: false })}>No restriction</Button>
            <Button type="button" variant="outline" aria-pressed={input.restrictEquipment} disabled={running} className={cn(choice(input.restrictEquipment), "justify-center px-3 text-sm")} onClick={() => set({ restrictEquipment: true })}>Choose what I have</Button>
          </div>
          {input.restrictEquipment && (
            <div className="grid grid-cols-2 gap-1 rounded-xl border p-2 sm:grid-cols-3" role="group" aria-label="Available equipment">
              {tags.map((t) => (
                <label key={t} className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] leading-5 transition-colors hover:bg-muted has-focus-visible:bg-muted", input.equipment.includes(t) && "bg-muted/60")}>
                  <Checkbox checked={input.equipment.includes(t)} disabled={running} onCheckedChange={(on) => set({ equipment: on ? [...input.equipment, t] : input.equipment.filter((x) => x !== t) })} />
                  {equipmentLabel(t)}
                </label>
              ))}
            </div>
          )}
          {input.restrictEquipment && input.equipment.length === 0 && <p className="text-[13px] text-muted-foreground">Nothing selected: only bodyweight exercises will be used.</p>}
        </Group>
        <Collapsible className="rounded-xl border">
          <CollapsibleTrigger type="button" className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-4 py-3 text-start text-sm font-medium transition-colors hover:bg-muted/50">
            Advanced
            <ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground transition-transform in-[[data-panel-open]]:rotate-180 motion-reduce:transition-none" />
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <div className="flex flex-col gap-5 border-t px-4 py-5">
              <Field invalid={!!seedError} disabled={running}>
                <FieldLabel>Seed (optional)</FieldLabel>
                <Input type="text" inputMode="numeric" size="lg" value={input.seed} disabled={running} placeholder="Pick one for me" aria-invalid={!!seedError} aria-describedby={seedError ? "seed-error" : undefined} onChange={(e) => set({ seed: e.target.value })} className="min-h-11 max-w-56" />
                <FieldDescription className="text-[13px] leading-relaxed">A whole number from 0 to {MAX_SEED}. The same inputs and seed give the same program.</FieldDescription>
                {seedError && <p id="seed-error" role="alert" className="text-[13px] text-destructive-foreground">{seedError}</p>}
              </Field>
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox className="mt-0.5" checked={input.allowRecent} disabled={running} onCheckedChange={(on) => set({ allowRecent: !!on })} />
                <span className="flex flex-col gap-0.5"><span className="font-medium">Allow lifts from the latest source block</span>
                  <span className="text-[13px] leading-relaxed text-muted-foreground">Off by default, so main lifts come from earlier published training than the most recent block. This is about the source material, not your own workout history.</span></span>
              </label>
            </div>
          </CollapsiblePanel>
        </Collapsible>
        <div className="flex flex-col gap-4 border-t pt-6">
          <GenerationStatus state={state} />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">{WEEKS} weeks · {input.days * WEEKS} training sessions</p>
              <p className="text-[13px] text-muted-foreground">Review your program before making it active.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {from && <Button type="button" size="xl" variant="outline" disabled={running} className="min-h-11" render={<Link to="/generated/$id" params={{ id: from.id }} />}>Back to review</Button>}
              <Button type="submit" size="xl" disabled={running} className="min-h-11 gap-3 text-sm sm:text-sm">
                {running ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : null}
                {running ? "Generating…" : state.status === "error" ? "Try again" : "Generate program"}
                {!running && <ArrowRightIcon aria-hidden="true" />}
              </Button>
            </div>
          </div>
          <p className="max-w-128 text-xs leading-relaxed text-muted-foreground">{cached ? "Source programs are saved on this device, so you can generate offline." : "The first generation downloads about 17 MB of source programs and keeps them for offline use."}</p>
        </div>
      </form>
    </>
  );
}
