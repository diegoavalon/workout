import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpFromLineIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DownloadIcon,
  MoonIcon,
  PlayIcon,
  SunIcon,
  Trash2Icon,
} from "lucide-react";
import { Badge } from "../src/components/ui/badge";
import { Button } from "../src/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "../src/components/ui/dialog";
import { Progress } from "../src/components/ui/progress";
import { toastManager } from "../src/components/ui/toast";
import { cn } from "../src/lib/utils";
import {
  BASE_PROGRAMS,
  EXL,
  GROUP_COPY,
  IMPORTED_PROGRAM,
  SUGGESTED_DAYS,
  WEEK_TITLES,
  PHASE_COPY,
  fmtSeconds,
  letter,
  mediaTotals,
  parseDelta,
  rawWorkout,
  sessionsOf,
  workoutId,
  type ExerciseAssignment,
  type Program,
  type WorkoutDoc,
} from "../src/lib/workout-data";

type Screen = "groups" | "programs" | "program" | "week" | "workout";
type Media = { img: number; vid: number };
type Saved = { completed: Record<string, string>; activeId: string | null; imported: boolean; media: Record<string, Media> };

const KEY = "logbook-progress-v1";
const MEDIA_ZERO: Media = { img: 0, vid: 0 };

const IMPORT_STEPS = [
  { label: "Program metadata", detail: "Hill Sprint Block · v1.2" },
  { label: "Training frequency", detail: "daysPerWeek: 3 → added to 3× per week" },
  { label: "Weeks & sessions", detail: "6 weeks · 18 ordered workouts" },
  { label: "Workout JSON stored", detail: "18 documents saved as-is" },
  { label: "Exercise references", detail: "41 resolved · 1 missing (ex-sled-drag)", warn: true },
  { label: "Available offline", detail: "Media can be downloaded from the program page" },
];

const fade = (cls: string) => cn("rounded-2xl border bg-card shadow-xs/5", cls);

export default function WorkoutApp() {
  const [screen, setScreen] = useState<Screen>("groups");
  const [freq, setFreq] = useState(4);
  const [pid, setPid] = useState<string | null>(null);
  const [week, setWeek] = useState(1);
  const [sess, setSess] = useState(1);
  const [saved, setSaved] = useState<Saved>({ completed: {}, activeId: null, imported: false, media: {} });
  const [dl, setDl] = useState<string | null>(null);
  const [video, setVideo] = useState<Record<string, boolean>>({});
  const [dark, setDark] = useState(false);
  const [offline, setOffline] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importStage, setImportStage] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "{}");
      setSaved({ completed: s.completed || {}, activeId: s.activeId || null, imported: !!s.imported, media: s.media || {} });
    } catch {}
    hydrated.current = true;
    setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    setOffline(!navigator.onLine);
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {}
  }, [saved]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const flash = (title: string) => toastManager.add({ title });

  const go = useCallback((patch: { screen?: Screen; freq?: number; pid?: string | null; week?: number; sess?: number }) => {
    if (patch.screen) setScreen(patch.screen);
    if (patch.freq !== undefined) setFreq(patch.freq);
    if (patch.pid !== undefined) setPid(patch.pid);
    if (patch.week !== undefined) setWeek(patch.week);
    if (patch.sess !== undefined) setSess(patch.sess);
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

  const programs = useMemo(() => (saved.imported ? [...BASE_PROGRAMS, IMPORTED_PROGRAM] : BASE_PROGRAMS), [saved.imported]);
  const prog = (id: string | null) => programs.find((p) => p.id === id);
  const freqs = [...new Set(programs.map((p) => p.daysPerWeek))].sort();
  const count = (f: number) => programs.filter((p) => p.daysPerWeek === f).length;

  const progressOf = (p: Program) => {
    const n = sessionsOf(p).length;
    let done = 0;
    let next: { w: number; s: number } | null = null;
    for (let w = 1; w <= p.totalWeeks; w++)
      for (let s = 1; s <= n; s++) {
        if (saved.completed[workoutId(p, w, s)]) done++;
        else if (!next) next = { w, s };
      }
    return { done, total: n * p.totalWeeks, next };
  };
  const weekDone = (p: Program, w: number) => {
    let d = 0;
    for (let s = 1; s <= sessionsOf(p).length; s++) if (saved.completed[workoutId(p, w, s)]) d++;
    return d;
  };

  const activeProg = prog(saved.activeId);
  const p = prog(pid);
  const patchSaved = (f: (s: Saved) => Saved) => setSaved(f);

  const startDownload = (target: Program) => {
    if (offline) return;
    const tot = mediaTotals(target);
    if (timer.current) clearInterval(timer.current);
    setDl(target.id);
    let m = { ...(saved.media[target.id] || MEDIA_ZERO) };
    timer.current = setInterval(() => {
      if (m.img < tot.img) m = { ...m, img: m.img + 1 };
      else if (m.vid < tot.vid) m = { ...m, vid: m.vid + 1 };
      const done = m.img >= tot.img && m.vid >= tot.vid;
      const snap = m;
      patchSaved((s) => ({ ...s, media: { ...s.media, [target.id]: snap } }));
      if (done) {
        if (timer.current) clearInterval(timer.current);
        setDl(null);
        flash("Media saved for offline use");
      }
    }, 140);
  };

  const runImport = () => {
    let k = 0;
    const t = setInterval(() => {
      k++;
      setImportStage(k);
      if (k >= IMPORT_STEPS.length) {
        clearInterval(t);
        patchSaved((s) => ({ ...s, imported: true }));
      }
    }, 260);
  };

  const back = () => {
    const map: Partial<Record<Screen, Screen>> = { programs: "groups", program: "programs", week: "program", workout: "week" };
    const next = map[screen];
    if (!next) return;
    go(next === "programs" && p ? { screen: next, freq: p.daysPerWeek } : { screen: next });
  };

  /* ---- header text ---- */
  let crumb = "";
  let barTitle = "";
  if (screen === "groups") crumb = "Library";
  if (screen === "programs") { crumb = "Library"; barTitle = `${freq}× per week`; }
  if (p && screen === "program") { crumb = `${p.daysPerWeek}× per week`; barTitle = p.title; }
  if (p && screen === "week") { crumb = p.title; barTitle = `Week ${week}`; }
  if (p && screen === "workout") { crumb = `${p.title} · Week ${week}`; barTitle = `Workout ${sess} · ${sessionsOf(p)[sess - 1][0]}`; }

  return (
    <div className="relative flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside className="hidden h-dvh w-70 shrink-0 flex-col overflow-auto border-e bg-sidebar lg:flex">
        <Brand className="h-15 border-b px-5" />
        <div className="flex flex-col gap-0.5 p-3">
          <SideLabel>Library</SideLabel>
          {freqs.map((f) => (
            <SideRow key={f} active={screen === "programs" && freq === f} onClick={() => go({ screen: "programs", freq: f })}>
              <span>{f}× per week</span>
              <span className="font-mono text-xs text-muted-foreground">{count(f)}</span>
            </SideRow>
          ))}
        </div>
        <div className="mx-5 h-px bg-border" />
        <div className="flex flex-col gap-0.5 p-3">
          <SideLabel>Active program</SideLabel>
          {activeProg ? (
            <>
              <button
                type="button"
                onClick={() => go({ screen: "program", pid: activeProg.id })}
                className="flex flex-col gap-2 rounded-lg p-2.5 text-left hover:bg-muted"
              >
                <span className="text-sm font-semibold">{activeProg.title}</span>
                <Progress value={(progressOf(activeProg).done / progressOf(activeProg).total) * 100} />
                <span className="text-xs text-muted-foreground">
                  {progressOf(activeProg).done} of {progressOf(activeProg).total} workouts complete
                </span>
              </button>
              {Array.from({ length: activeProg.totalWeeks }, (_, i) => {
                const w = i + 1;
                const n = sessionsOf(activeProg).length;
                const d = weekDone(activeProg, w);
                const sel = screen !== "groups" && screen !== "programs" && pid === activeProg.id && week === w;
                return (
                  <SideRow key={w} active={sel} small onClick={() => go({ screen: "week", pid: activeProg.id, week: w })}>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">Week {w}</span>
                      <span className="text-muted-foreground">{WEEK_TITLES[i % 4]}</span>
                    </span>
                    <span className={cn("font-mono text-xs", d === n ? "text-success-foreground" : "text-muted-foreground")}>{d}/{n}</span>
                  </SideRow>
                );
              })}
            </>
          ) : (
            <p className="px-2.5 text-[13px] leading-normal text-muted-foreground text-pretty">
              No active program. Open any program and choose Start Program.
            </p>
          )}
        </div>
        <div className="mt-auto flex items-center gap-2 border-t px-5 py-4 text-xs text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", offline ? "bg-muted-foreground" : "bg-success")} />
          <span>{offline ? "Offline · using saved content" : "Online · content saved on device"}</span>
        </div>
      </aside>

      <div className="flex h-dvh min-w-0 flex-1 flex-col">
        <header className="flex h-15 shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-6">
          {screen !== "groups" && (
            <Button variant="ghost" size="icon-lg" aria-label="Back" onClick={back}>
              <ChevronLeftIcon />
            </Button>
          )}
          {screen === "groups" && <Brand className="pl-1 lg:hidden" />}
          <div className="flex min-w-0 flex-1 flex-col gap-px">
            <span className={cn("truncate text-xs text-muted-foreground", screen === "groups" && "max-lg:hidden")}>{crumb}</span>
            <span className="truncate text-[15px] font-semibold">{screen === "groups" ? <span className="max-lg:hidden">Program groups</span> : barTitle}</span>
          </div>
          {offline && <Badge variant="secondary" size="lg">Offline</Badge>}
          <Button variant="ghost" size="icon-lg" aria-label="Toggle theme" onClick={() => setDark((d) => !d)}>
            {dark ? <SunIcon /> : <MoonIcon />}
          </Button>
        </header>

        <main ref={mainRef} className="relative flex-1 overflow-auto">
          <div className="mx-auto flex max-w-190 flex-col gap-7 px-4 pt-7 pb-12 sm:px-8">
            {screen === "groups" && (
              <GroupsScreen
                freqs={freqs}
                count={count}
                activeProg={activeProg}
                progress={activeProg ? progressOf(activeProg) : null}
                onOpenFreq={(f) => go({ screen: "programs", freq: f })}
                onContinue={() => {
                  if (!activeProg) return;
                  const nx = progressOf(activeProg).next;
                  if (nx) go({ screen: "workout", pid: activeProg.id, week: nx.w, sess: nx.s });
                  else go({ screen: "program", pid: activeProg.id });
                }}
                onImport={() => { setImportStage(0); setImportOpen(true); }}
              />
            )}

            {screen === "programs" && (
              <>
                <Heading title={`${freq}× per week`} sub={GROUP_COPY[freq] || `${freq} sessions a week.`} />
                <div className="flex flex-col gap-3">
                  {programs.filter((x) => x.daysPerWeek === freq).map((x) => {
                    const tot = mediaTotals(x);
                    const m = saved.media[x.id];
                    return (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => go({ screen: "program", pid: x.id })}
                        className={fade("flex flex-wrap overflow-hidden text-left transition-colors hover:border-input")}
                      >
                        <Placeholder className="min-h-35 flex-[1_1_180px]">cover image</Placeholder>
                        <span className="flex flex-[999_1_300px] flex-col gap-2.5 p-5">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" size="lg">{x.totalWeeks} weeks</Badge>
                            <Badge variant="outline" size="lg">{x.daysPerWeek}×/week</Badge>
                            <Badge variant="secondary" size="lg">{x.category}</Badge>
                            {x.id === saved.activeId && <Badge size="lg">Active</Badge>}
                            {m && m.img >= tot.img && m.vid >= tot.vid && <Badge variant="success" size="lg">Media offline</Badge>}
                          </span>
                          <span className="text-xl font-semibold tracking-tight">{x.title}</span>
                          <span className="text-[15px] leading-normal text-muted-foreground text-pretty">{x.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {screen === "program" && p && (
              <ProgramScreen
                p={p}
                isActive={p.id === saved.activeId}
                progress={progressOf(p)}
                media={saved.media[p.id] || MEDIA_ZERO}
                downloading={dl === p.id}
                offline={offline}
                weekDone={(w) => sessionsOf(p).map((_, i) => !!saved.completed[workoutId(p, w, i + 1)])}
                onPrimary={() => {
                  const pr = progressOf(p);
                  const nx = pr.next || { w: 1, s: 1 };
                  if (p.id !== saved.activeId) {
                    patchSaved((s) => ({ ...s, activeId: p.id }));
                    flash(`${p.title} is now your active program`);
                    go({ screen: "week", week: nx.w });
                  } else go({ screen: "workout", week: nx.w, sess: nx.s });
                }}
                onWeek={(w) => go({ screen: "week", week: w })}
                onDownload={() => startDownload(p)}
                onRemove={() => {
                  patchSaved((s) => ({ ...s, media: { ...s.media, [p.id]: MEDIA_ZERO } }));
                  flash("Media removed · progress kept");
                }}
              />
            )}

            {screen === "week" && p && (
              <WeekScreen
                p={p}
                week={week}
                isActive={p.id === saved.activeId}
                next={progressOf(p).next}
                completed={saved.completed}
                onWeek={setWeek}
                onOpen={(s) => go({ screen: "workout", sess: s })}
              />
            )}

            {screen === "workout" && p && (
              <WorkoutScreen
                p={p}
                week={week}
                sess={sess}
                isActive={p.id === saved.activeId}
                completedAt={saved.completed[workoutId(p, week, sess)]}
                media={saved.media[p.id] || MEDIA_ZERO}
                offline={offline}
                video={video}
                onToggleVideo={(k) => setVideo((v) => ({ ...v, [k]: !v[k] }))}
                onGo={(w, s) => go({ week: w, sess: s })}
                onToggleDone={(hasNext) => {
                  const id = workoutId(p, week, sess);
                  const was = !!saved.completed[id];
                  patchSaved((s) => {
                    const c = { ...s.completed };
                    if (c[id]) delete c[id];
                    else c[id] = new Date().toISOString();
                    return { ...s, completed: c };
                  });
                  if (!was) flash(hasNext ? "Workout complete · next one is ready" : "Program complete");
                }}
              />
            )}
          </div>
        </main>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Import program</DialogTitle>
            <DialogDescription>Program, week, and frequency metadata come from the file — never inferred from exercises.</DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-3">
            {importStage === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted px-5 py-7 text-center">
                <span className="font-mono text-xs text-muted-foreground">drop program .json here</span>
                <Button onClick={runImport}>Use sample file</Button>
              </div>
            )}
            {IMPORT_STEPS.slice(0, importStage).map((st) => (
              <div key={st.label} className="flex items-start gap-3">
                <span className={cn("mt-px flex size-4.5 shrink-0 items-center justify-center rounded-[5px]", st.warn ? "bg-warning/8 text-warning-foreground" : "bg-success/8 text-success-foreground")}>
                  {st.warn ? <span className="text-[11px] font-bold leading-none">!</span> : <CheckIcon className="size-3" strokeWidth={3} />}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{st.label}</span>
                  <span className={cn("text-[13px]", st.warn ? "text-warning-foreground" : "text-muted-foreground")}>{st.detail}</span>
                </span>
              </div>
            ))}
          </DialogPanel>
          {importStage >= IMPORT_STEPS.length && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportOpen(false)}>Close</Button>
              <Button onClick={() => { setImportOpen(false); go({ screen: "program", pid: IMPORTED_PROGRAM.id }); }}>Open program</Button>
            </DialogFooter>
          )}
        </DialogPopup>
      </Dialog>
    </div>
  );
}

/* ---------------- shared bits ---------------- */

function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="size-5.5 rounded-md bg-primary" />
      <span className="text-[15px] font-semibold tracking-tight">Logbook</span>
    </div>
  );
}

const SideLabel = ({ children }: { children: ReactNode }) => (
  <div className="px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">{children}</div>
);

function SideRow({ children, active, small, onClick }: { children: ReactNode; active?: boolean; small?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex items-center justify-between rounded-lg px-2.5 text-left font-medium hover:bg-muted", small ? "h-8.5 text-[13px]" : "h-9 text-sm", active && "bg-muted")}
    >
      {children}
    </button>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-heading text-[clamp(26px,4vw,32px)] leading-[1.15] font-semibold tracking-tight text-balance">{title}</h1>
      <p className="text-base leading-normal text-muted-foreground">{sub}</p>
    </div>
  );
}

function Placeholder({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "flex items-end bg-muted p-3 font-mono text-[11px] text-muted-foreground [background-image:repeating-linear-gradient(135deg,color-mix(in_oklab,var(--foreground)_4%,transparent)_0_8px,transparent_8px_16px)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------------- screens ---------------- */

function GroupsScreen(props: {
  freqs: number[];
  count: (f: number) => number;
  activeProg?: Program;
  progress: { done: number; total: number; next: { w: number; s: number } | null } | null;
  onOpenFreq: (f: number) => void;
  onContinue: () => void;
  onImport: () => void;
}) {
  const { activeProg, progress } = props;
  const nx = progress?.next;
  return (
    <>
      {activeProg && progress && (
        <div className={fade("flex flex-col gap-4 p-5")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[13px] font-medium text-muted-foreground">Continue · {activeProg.title}</span>
              <span className="text-xl font-semibold tracking-tight">
                {nx ? `Workout ${nx.s} — ${sessionsOf(activeProg)[nx.s - 1][0]}` : "Program complete"}
              </span>
              <span className="text-sm text-muted-foreground">
                {nx ? `Week ${nx.w} of ${activeProg.totalWeeks} · ${sessionsOf(activeProg)[nx.s - 1][3]} min` : "Every session is done. Nice work."}
              </span>
            </div>
            <Button size="xl" onClick={props.onContinue}>
              {nx ? "Continue" : "Review"}
              <ChevronRightIcon />
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <Progress value={(progress.done / progress.total) * 100} />
            <span className="text-[13px] text-muted-foreground">{progress.done} of {progress.total} workouts complete</span>
          </div>
        </div>
      )}
      <Heading title="How many days per week do you want to train?" sub="Pick a frequency to see programs built around it." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {props.freqs.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => props.onOpenFreq(f)}
            className={fade("flex min-h-50 flex-col gap-3.5 p-5 text-left transition-colors hover:border-input hover:bg-muted")}
          >
            <span className="flex items-baseline gap-1.5">
              <span className="font-heading text-[52px] leading-none font-semibold tracking-tighter tabular-nums">{f}×</span>
              <span className="text-[15px] font-medium text-muted-foreground">per week</span>
            </span>
            <span className="text-[15px] leading-snug text-muted-foreground text-pretty">{GROUP_COPY[f] || `${f} sessions a week.`}</span>
            <span className="mt-auto flex items-center justify-between text-sm font-medium">
              <span>{props.count(f)} program{props.count(f) > 1 ? "s" : ""}</span>
              <ChevronRightIcon className="size-4.5" />
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <span className="text-[13px] text-muted-foreground">Programs and progress are stored on this device.</span>
        <Button variant="outline" onClick={props.onImport}>
          <ArrowUpFromLineIcon />
          Import program
        </Button>
      </div>
    </>
  );
}

function ProgramScreen(props: {
  p: Program;
  isActive: boolean;
  progress: { done: number; total: number; next: { w: number; s: number } | null };
  media: Media;
  downloading: boolean;
  offline: boolean;
  weekDone: (w: number) => boolean[];
  onPrimary: () => void;
  onWeek: (w: number) => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const { p, isActive, progress: pr, media: m } = props;
  const tot = mediaTotals(p);
  const complete = m.img >= tot.img && m.vid >= tot.vid;
  const hasAny = m.img > 0 || m.vid > 0;
  const curW = isActive && pr.next ? pr.next.w : 0;
  const row = (label: string, a: number, b: number) => ({ label, a, b });
  const rows = [row("Exercise images", m.img, tot.img), row("Exercise videos", m.vid, tot.vid)];
  return (
    <>
      <Placeholder className="aspect-[16/6] rounded-2xl border">program cover image</Placeholder>
      <div className="flex flex-col gap-2.5">
        <h1 className="font-heading text-[clamp(28px,4.5vw,36px)] leading-[1.1] font-semibold tracking-tight">{p.title}</h1>
        <p className="text-base leading-relaxed text-muted-foreground text-pretty">{p.description}</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] overflow-hidden rounded-2xl border bg-card">
        {[["Days per week", String(p.daysPerWeek)], ["Weeks", String(p.totalWeeks)], ["Focus", p.category], ["Level", p.difficulty || "—"]].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 px-4.5 py-4 shadow-[-1px_0_0_var(--border),0_-1px_0_var(--border)]">
            <span className="text-xs font-medium text-muted-foreground">{k}</span>
            <span className="text-lg font-semibold">{v}</span>
          </div>
        ))}
      </div>
      {p.equipment.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-medium text-muted-foreground">Equipment</span>
          <div className="flex flex-wrap gap-1.5">
            {p.equipment.map((e) => <Badge key={e} variant="outline" size="lg" className="h-7 px-2.5 text-sm">{e}</Badge>)}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        <Button size="xl" className="h-13 text-base font-semibold" onClick={props.onPrimary}>
          {isActive ? (pr.next ? `Continue · Week ${pr.next.w}, Workout ${pr.next.s}` : "Program complete") : "Start Program"}
        </Button>
        <span className="text-center text-[13px] text-muted-foreground">
          {isActive ? `${pr.done} of ${pr.total} workouts complete` : "You can preview any workout without starting."}
        </span>
      </div>

      <div className={fade("flex flex-col")}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold">Offline availability</span>
            <span className="text-[13px] text-muted-foreground">
              {complete ? "Everything in this program works without a connection." : props.downloading ? "Downloading…" : "Workouts are saved. Images and videos stream until downloaded."}
            </span>
          </div>
          {!complete && !props.downloading && !props.offline && (
            <Button variant="outline" onClick={props.onDownload}>
              <DownloadIcon />
              Download media · {(tot.img * 0.3 + tot.vid * 6).toFixed(0)} MB
            </Button>
          )}
          {hasAny && !props.downloading && (
            <Button variant="outline" onClick={props.onRemove}>
              <Trash2Icon />
              Remove media
            </Button>
          )}
          {!complete && props.offline && <span className="text-[13px] text-warning-foreground">Connect to download</span>}
        </div>
        <MediaRow label="Program content" status="Saved" pct={100} ok />
        {rows.map((r) => (
          <MediaRow key={r.label} label={r.label} status={`${r.a}/${r.b}`} pct={r.b ? (r.a / r.b) * 100 : 100} ok={r.a >= r.b} />
        ))}
        <div className="border-t px-5 py-3 text-[13px] text-muted-foreground">Removing media keeps your workout progress.</div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-xl font-semibold tracking-tight">Weeks</h2>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xs/5">
          {Array.from({ length: p.totalWeeks }, (_, i) => {
            const w = i + 1;
            const segs = props.weekDone(w);
            const d = segs.filter(Boolean).length;
            return (
              <button
                key={w}
                type="button"
                onClick={() => props.onWeek(w)}
                className="flex min-h-16 w-full items-center gap-4 border-t px-5 py-3.5 text-left first:border-t-0 hover:bg-muted"
              >
                <span className="w-16 shrink-0 text-sm font-semibold">Week {w}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-[15px] font-medium">{WEEK_TITLES[i % 4]}</span>
                  <span className="flex gap-1">
                    {segs.map((c, j) => <span key={j} className={cn("h-1 w-5.5 rounded-full", c ? "bg-primary" : "bg-input")} />)}
                  </span>
                </span>
                {w === curW && <Badge size="lg">Current</Badge>}
                <span className="font-mono text-[13px] text-muted-foreground">{d}/{segs.length}</span>
                <ChevronRightIcon className="size-4.5 shrink-0 opacity-50" />
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function MediaRow({ label, status, pct, ok }: { label: string; status: string; pct: number; ok: boolean }) {
  return (
    <div className="flex flex-col gap-2 border-t px-5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <Badge variant={ok ? "success" : "secondary"} size="lg" className="tabular-nums">{status}</Badge>
      </div>
      <Progress value={pct} />
    </div>
  );
}

function WeekScreen(props: {
  p: Program;
  week: number;
  isActive: boolean;
  next: { w: number; s: number } | null;
  completed: Record<string, string>;
  onWeek: (w: number) => void;
  onOpen: (s: number) => void;
}) {
  const { p, week, completed } = props;
  const sessions = sessionsOf(p);
  const n = sessions.length;
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted-foreground">{p.title} · {n} workouts this week</span>
        <h1 className="font-heading text-[clamp(26px,4vw,32px)] leading-[1.15] font-semibold tracking-tight">Week {week} — {WEEK_TITLES[(week - 1) % 4]}</h1>
        <p className="text-base leading-normal text-muted-foreground text-pretty">{PHASE_COPY[(week - 1) % 4]}</p>
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex w-max gap-0.5 rounded-[10px] bg-muted p-0.5">
          {Array.from({ length: p.totalWeeks }, (_, i) => {
            const w = i + 1;
            const sel = w === week;
            const done = sessions.every((_, s) => completed[workoutId(p, w, s + 1)]);
            return (
              <button
                key={w}
                type="button"
                onClick={() => props.onWeek(w)}
                className={cn("inline-flex h-8.5 min-w-11 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-sm font-medium", sel ? "bg-background text-foreground shadow-xs" : "text-muted-foreground")}
              >
                W{w}
                {done && <span className="size-1.5 rounded-full bg-success" />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {sessions.map(([title, focus, , dur], i) => {
          const s = i + 1;
          const done = !!completed[workoutId(p, week, s)];
          const isNext = props.isActive && props.next?.w === week && props.next?.s === s;
          const day = !p.custom ? (SUGGESTED_DAYS[p.daysPerWeek] || [])[i] : "";
          return (
            <button
              key={s}
              type="button"
              onClick={() => props.onOpen(s)}
              className={cn(fade("flex min-h-21 w-full items-center gap-4 p-4 text-left hover:bg-muted"), isNext && "border-foreground")}
            >
              <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl text-xl font-semibold tabular-nums", done ? "bg-success/8 text-success-foreground" : "bg-muted")}>
                {done ? <CheckIcon className="size-5.5" strokeWidth={2.5} /> : s}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[13px] font-medium text-muted-foreground">Workout {s}</span>
                <span className="text-[17px] font-semibold tracking-tight">{title}</span>
                <span className="text-[13px] text-muted-foreground">{focus} · {dur} min</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge variant={done ? "success" : isNext ? "default" : "secondary"} size="lg">{done ? "Done" : isNext ? "Up next" : "To do"}</Badge>
                {day && <span className="text-xs text-muted-foreground">Suggested {day}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-sm leading-normal text-muted-foreground text-pretty">
        Train these in order on whichever days suit you. A missed day never skips a workout — the next incomplete one waits for you.
      </p>
    </>
  );
}

function WorkoutScreen(props: {
  p: Program;
  week: number;
  sess: number;
  isActive: boolean;
  completedAt?: string;
  media: Media;
  offline: boolean;
  video: Record<string, boolean>;
  onToggleVideo: (key: string) => void;
  onGo: (w: number, s: number) => void;
  onToggleDone: (hasNext: boolean) => void;
}) {
  const { p, week: w, sess: s, completedAt } = props;
  const n = sessionsOf(p).length;
  const meta = sessionsOf(p)[s - 1];
  const raw: WorkoutDoc = useMemo(() => rawWorkout(p, w, s), [p, w, s]);
  const tot = mediaTotals(p);
  const vidOffline = props.media.vid >= tot.vid;
  const items = [...raw.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const prev = s > 1 ? [w, s - 1] : w > 1 ? [w - 1, n] : null;
  const next = s < n ? [w, s + 1] : w < p.totalWeeks ? [w + 1, 1] : null;

  const exCount = items.reduce((c, it) => c + (it.type === "groupedAssignment" ? it.subAssignments.length : it.type === "exerciseAssignment" ? 1 : 0), 0);

  const ExerciseCard = ({ it, label, nested }: { it: ExerciseAssignment; label: string; nested?: boolean }) => {
    const e = it.child || EXL[it.exerciseId];
    const key = it.itemId || it.exerciseId;
    const open = !!props.video[key];
    const name = e ? e.name : "Missing exercise";
    const presc: [string, string][] = [];
    if (it.sets) presc.push(["Sets", String(it.sets)]);
    if (it.reps) presc.push(["Reps", String(it.reps)]);
    if (it.times) presc.push(["Time", fmtSeconds(it.times)]);
    if (it.rest) presc.push(["Rest", fmtSeconds(it.rest)]);
    return (
      <div className={cn("flex flex-wrap overflow-hidden border bg-card", nested ? "rounded-2xl" : "rounded-2xl shadow-xs/5")}>
        <div className={cn("relative flex flex-[1_1_220px] flex-col items-start justify-between gap-2 bg-muted p-3 [background-image:repeating-linear-gradient(135deg,color-mix(in_oklab,var(--foreground)_4%,transparent)_0_8px,transparent_8px_16px)]", nested ? "min-h-42" : "min-h-50")}>
          <span className="font-mono text-[11px] text-muted-foreground">
            {!e ? "image unavailable" : `${open ? "instructional video" : "exercise image"} · ${name.toLowerCase()}`}
          </span>
          {e?.video && (
            <Button variant="outline" size="sm" onClick={() => props.onToggleVideo(key)}>
              <PlayIcon className="size-3 fill-current" />
              {open ? "Show image" : vidOffline ? "Video · offline" : props.offline ? "Video · not downloaded" : "Watch video"}
            </Button>
          )}
        </div>
        <div className={cn("flex flex-[999_1_280px] flex-col", nested ? "gap-3 p-4.5" : "gap-3.5 p-5")}>
          <div className="flex items-center gap-2.5">
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px] font-medium text-muted-foreground">{label}</span>
            <h3 className={cn("font-heading font-semibold tracking-tight", nested ? "text-[19px]" : "text-[21px]")}>{name}</h3>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(84px,1fr))] gap-2">
            {presc.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 rounded-[10px] bg-muted px-3 py-2.5">
                <span className="text-xs font-medium text-muted-foreground">{k}</span>
                <span className={cn("font-semibold tracking-tight tabular-nums", nested ? "text-[22px]" : "text-2xl")}>{v}</span>
              </div>
            ))}
          </div>
          {it.notes && <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">{it.notes}</p>}
          {!e && <p className="text-sm leading-normal text-warning-foreground">Exercise record {it.exerciseId || "—"} wasn't found in the library. Prescription is shown as written.</p>}
        </div>
      </div>
    );
  };

  let letterIdx = 0;
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <span className="text-sm font-medium text-muted-foreground">{p.title} · Week {w} of {p.totalWeeks}</span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-muted-foreground">Workout {s}</span>
          <h1 className="font-heading text-[clamp(30px,5vw,40px)] leading-[1.08] font-bold tracking-tight text-balance">{meta[0]}</h1>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Badge variant="outline" size="lg"><ClockIcon />{meta[3]} min</Badge>
          <Badge variant="outline" size="lg">{exCount} exercises</Badge>
          {completedAt && <Badge variant="success" size="lg">Completed {new Date(completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Badge>}
          {!props.isActive && !completedAt && <Badge variant="secondary" size="lg">Preview</Badge>}
        </div>
      </div>

      {items.map((it, i) => {
        const key = it.itemId || i;
        if (it.type === "richText") {
          return (
            <div key={key} className="flex flex-col gap-2">
              {parseDelta(it.child?.content).map((ln, j) => {
                const h = ln.header;
                const cls = h === 1 ? "mt-2 font-heading text-[26px] font-bold leading-tight tracking-tight" : h === 2 ? "mt-2 font-heading text-[22px] font-semibold leading-tight tracking-tight" : h === 3 ? "mt-2 text-lg font-semibold leading-tight" : "text-[17px] leading-relaxed";
                return (
                  <p key={j} className={cn(cls, "text-pretty")}>
                    {ln.list === "bullet" ? "•  " : ln.list === "ordered" ? `${ln.n}.  ` : ""}
                    {ln.segs.map((sg, k) => (
                      <span key={k} className={cn(sg.bold && "font-semibold", sg.italic && "italic", sg.highlight && "text-warning-foreground", sg.underline && "underline", sg.strike && "line-through", sg.large && "text-[1.1em]", sg.small && "text-[0.9em]")}>
                        {sg.text}
                      </span>
                    ))}
                  </p>
                );
              })}
            </div>
          );
        }
        if (it.type === "exerciseAssignment") {
          letterIdx++;
          return <ExerciseCard key={key} it={it} label={letter(letterIdx)} />;
        }
        const subs = [...it.subAssignments].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        if (it.isSection) {
          return (
            <div key={key} className={fade("overflow-hidden")}>
              <div className="flex flex-wrap items-baseline justify-between gap-3 bg-muted px-5 py-3.5">
                <span className="text-base font-semibold">{it.title || "Section"}</span>
                <span className="text-[13px] text-muted-foreground">{subs.length} exercises · in order</span>
              </div>
              {subs.map((sa, j) => {
                const e = sa.child || EXL[sa.exerciseId];
                const amt = sa.times ? fmtSeconds(sa.times) : sa.reps ? (/^\d+$/.test(sa.reps) ? `${sa.reps} reps` : sa.reps) : "";
                return (
                  <div key={j} className="flex min-h-14 items-start gap-3.5 border-t px-5 py-3.5">
                    <span className="w-5 shrink-0 pt-0.5 font-mono text-[13px] text-muted-foreground">{j + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-base font-medium">{e ? e.name : `Missing exercise (${sa.exerciseId})`}</span>
                      {sa.notes && <span className="text-sm leading-snug text-muted-foreground">{sa.notes}</span>}
                    </span>
                    <span className="pt-px text-[15px] font-semibold whitespace-nowrap tabular-nums">{(sa.sets ?? 0) > 1 ? `${sa.sets} × ` : ""}{amt}</span>
                  </div>
                );
              })}
            </div>
          );
        }
        letterIdx++;
        const lt = letter(letterIdx);
        return (
          <div key={key} className="flex flex-col gap-1.5 rounded-3xl border bg-muted p-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-3 px-3.5 pt-2.5 pb-1.5">
              <span className="text-base font-semibold">{it.isSuperset ? `Superset ${lt}` : it.title || `Group ${lt}`}</span>
              <span className="text-[13px] text-muted-foreground">
                {it.isSuperset ? `Alternate exercises${it.rest ? ` · rest ${fmtSeconds(it.rest)} after each round` : ""}` : "Complete in order"}
              </span>
            </div>
            {subs.map((sa, j) => <ExerciseCard key={j} it={sa} label={lt + (j + 1)} nested />)}
          </div>
        );
      })}

      <div className="sticky bottom-0 -mx-4 -mb-12 flex items-center gap-2 border-t bg-background px-4 pt-3 pb-4 sm:-mx-8 sm:px-8">
        <Button variant="outline" size="icon-xl" aria-label="Previous workout" disabled={!prev} onClick={() => prev && props.onGo(prev[0], prev[1])}>
          <ChevronLeftIcon />
        </Button>
        <Button
          size="xl"
          variant={completedAt ? "secondary" : "default"}
          className={cn("h-13 flex-1 text-base font-semibold", completedAt && "bg-success/8 text-success-foreground hover:bg-success/12")}
          onClick={() => props.onToggleDone(!!next)}
        >
          <CheckIcon strokeWidth={2.5} />
          {completedAt ? "Completed" : "Mark complete"}
        </Button>
        <Button variant="outline" size="icon-xl" aria-label="Next workout" disabled={!next} onClick={() => next && props.onGo(next[0], next[1])}>
          <ChevronRightIcon />
        </Button>
      </div>
    </>
  );
}
