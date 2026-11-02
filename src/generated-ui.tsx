import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowUpFromLineIcon, CheckIcon, ChevronRightIcon, CircleDashedIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "./components/ui/dialog";
import { Progress } from "./components/ui/progress";
import { toastManager } from "./components/ui/toast";
import { WorkoutBlocks } from "./components/WorkoutRenderer";
import { repo } from "./data/db";
import { buildGeneratedDayView } from "./domain/generated";
import {
  caveatsOf, dateShort, dayOf, equipmentOf, mainLiftSets, noteText, positionOf, previewView, sessionRef, statesFor, statusOf, trainingSessions,
  uncheckedOf, validateGeneratedFile, weekCounts, weekSessions, weekdayShort,
  type GeneratedSnapshot, type SessionRef, type StateMap,
} from "./domain/generated-program";
import type { ProgramRun, SessionProgress } from "./domain/types";
import { cn } from "./lib/utils";

export type GenData = { snaps: GeneratedSnapshot[]; runs: ProgramRun[]; progress: SessionProgress[] };
const flash = (title: string) => toastManager.add({ title });
const card = (cls?: string) => cn("rounded-2xl border bg-card shadow-xs/5", cls);
const activeRun = (runs: ProgramRun[], id: string) => runs.filter((r) => r.programId === id && !r.endedAt).sort((a, b) => (b.promotedAt ?? b.startedAt).localeCompare(a.promotedAt ?? a.startedAt))[0];
const sessionPath = { to: "/generated/$id/session/$sid" } as const;

function Heading({ title, sub }: { title: string; sub?: string }) {
  return <div className="flex flex-col gap-2"><h1 className="font-heading text-[clamp(26px,4vw,32px)] leading-[1.15] font-semibold tracking-tight text-balance">{title}</h1>{sub && <p className="text-base text-muted-foreground">{sub}</p>}</div>;
}
const StatusBadge = ({ status, next }: { status: ReturnType<typeof statusOf>; next?: boolean }) =>
  status === "complete" ? <Badge variant="success" size="lg">Complete</Badge>
    : status === "in-progress" ? <Badge variant="secondary" size="lg">In progress</Badge>
    : next ? <Badge size="lg">Next</Badge> : <Badge variant="outline" size="lg">Not started</Badge>;

/** The promoted program: the active generated run most recently started or promoted. */
export function promotedOf({ snaps, runs }: GenData) {
  const picks = snaps.map((snap) => ({ snap, run: activeRun(runs, snap.id) })).filter((p): p is { snap: GeneratedSnapshot; run: ProgramRun } => !!p.run);
  return picks.sort((a, b) => (b.run.promotedAt ?? b.run.startedAt).localeCompare(a.run.promotedAt ?? a.run.startedAt))[0];
}

/* ---------------- Import ---------------- */
export function isGeneratedFile(v: unknown) {
  const o = v as { weeks?: unknown; options?: unknown; manifest?: unknown } | null;
  return !!o && typeof o === "object" && Array.isArray(o.weeks) && !!o.options && !o.manifest;
}
export function ImportGeneratedButton({ variant = "outline", label = "Import generated block" }: { variant?: "outline" | "default"; label?: string }) {
  const navigate = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      const r = await repo.importGenerated(JSON.parse(await f.text()));
      if (!r.snapshot) { setError(r.errors.join(" ")); return; }
      setError(null); flash(r.duplicate ? "Already saved — opened the existing block" : "Block saved on this device");
      navigate({ to: "/generated/$id", params: { id: r.snapshot.id } });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="flex flex-col items-start gap-2">
      <input ref={ref} type="file" accept="application/json" className="hidden" aria-label="Generated program file" onChange={(e) => pick(e.target.files?.[0])} />
      <Button variant={variant} onClick={() => ref.current?.click()}><ArrowUpFromLineIcon />{label}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/* ---------------- Train home ---------------- */
export function TrainHome({ data }: { data: GenData }) {
  const nav = useNavigate();
  const router = useRouter();
  const pick = promotedOf(data);
  if (!pick) {
    return (
      <>
        <Heading title="Train" sub="Save a generated six-week block once, then train from it in order." />
        <section className={card("flex flex-col gap-4 p-5")}>
          <p className="text-[15px] text-muted-foreground">{data.snaps.length ? "You have saved blocks, but none is active. Pick one to use." : "No block yet. Import a generated program file to get started."}</p>
          {data.snaps.map((s) => <Link key={s.id} to="/generated/$id" params={{ id: s.id }} className="flex min-h-11 items-center justify-between rounded-lg border px-3 text-sm font-medium hover:bg-muted">{s.title}<ChevronRightIcon className="size-4" /></Link>)}
          <ImportGeneratedButton variant="default" label="Import generated block" />
        </section>
      </>
    );
  }
  const { snap, run } = pick;
  const states = statesFor(snap, data.progress, run.id);
  const pos = positionOf(snap, states);
  const target = pos.inProgress ?? pos.next;
  const week = weekSessions(snap, pos.week).filter((s) => s.kind === "training");
  const recovery = weekSessions(snap, pos.week).filter((s) => s.kind === "recovery");
  const st = target ? states.get(target.id) : undefined;
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Heading title={snap.title} sub={pos.complete ? `${pos.done} of ${pos.total} training sessions complete` : `Week ${pos.week} of ${snap.weekCount} · ${pos.done} of ${pos.total} training sessions complete`} />
        <Link to="/generated/$id" params={{ id: snap.id }} className="min-h-11 content-center text-sm font-medium underline">View program</Link>
      </div>
      <Progress value={(pos.done / Math.max(1, pos.total)) * 100} aria-label="Block progress" />
      {pos.complete ? <BlockSummary snap={snap} run={run} states={states} /> : target && (
        <section className={card("flex flex-col gap-4 p-5")} aria-label={pos.inProgress ? "Resume session" : "Next session"}>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">{pos.inProgress ? "Resume session" : "Next session"}{pos.inProgress && <Badge variant="secondary">In progress</Badge>}</span>
            <span className="text-xl font-semibold tracking-tight">Week {target.week} · Session {target.order}</span>
            <span className="text-[17px]">{target.title}</span>
            {pos.inProgress
              ? <span className="text-[13px] text-muted-foreground">{st?.lastSection ? `Last saved in ${st.lastSection}` : "Started"}{st?.savedAt ? ` · saved ${new Date(st.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}</span>
              : <span className="text-[13px] text-muted-foreground">Suggested {dateShort(target.date)}{target.date < new Date().toISOString().slice(0, 10) ? " — still next. Dates are suggestions; nothing is skipped." : ""}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="xl" className="flex-[1_1_220px]" onClick={async () => {
              if (!pos.inProgress) await repo.patchProgress(run.id, snap.id, target.id, { startedAt: new Date().toISOString() });
              await router.invalidate(); nav({ ...sessionPath, params: { id: snap.id, sid: target.id } });
            }}>{pos.inProgress ? "Resume session" : "Start session"}</Button>
            {!pos.inProgress && <Link {...sessionPath} params={{ id: snap.id, sid: target.id }}><Button size="xl" variant="outline">Preview first</Button></Link>}
          </div>
        </section>
      )}
      {!pos.complete && (
        <section className="flex flex-col gap-2.5" aria-label="This program week">
          <h2 className="text-[15px] font-semibold">This program week</h2>
          <div className="grid grid-cols-3 gap-2">
            {week.map((s) => (
              <Link key={s.id} {...sessionPath} params={{ id: snap.id, sid: s.id }} className={card("flex min-h-24 flex-col gap-1.5 p-3 hover:bg-muted")}>
                <span className="text-[13px] font-semibold">Session {s.order}</span>
                <StatusBadge status={statusOf(states.get(s.id))} next={s.id === pos.next?.id && !pos.inProgress} />
              </Link>
            ))}
          </div>
        </section>
      )}
      {recovery.length > 0 && (
        <Link to="/generated/$id/week/$week" params={{ id: snap.id, week: String(pos.week) }} className={card("flex min-h-16 items-center justify-between gap-3 px-5 py-3 hover:bg-muted")}>
          <span className="flex flex-col"><span className="text-[15px] font-semibold">Optional recovery</span><span className="text-[13px] text-muted-foreground">{recovery.length} this week · not counted toward progress</span></span>
          <span className="text-sm font-medium">View recovery</span>
        </Link>
      )}
    </>
  );
}

/* ---------------- Block summary ---------------- */
export function BlockSummary({ snap, run, states }: { snap: GeneratedSnapshot; run: ProgramRun; states: StateMap }) {
  const router = useRouter();
  const pos = positionOf(snap, states);
  const weeks = Array.from({ length: snap.weekCount }, (_, i) => ({ week: i + 1, ...weekCounts(snap, states, i + 1) }));
  return (
    <section className={card("flex flex-col gap-4 p-5")} aria-label="Block complete">
      <div className="flex flex-col gap-1">
        <Badge variant="success" size="lg" className="self-start">Block complete</Badge>
        <span className="text-xl font-semibold">{pos.done} of {pos.total} training sessions</span>
        <span className="text-[13px] text-muted-foreground">{pos.recoveryDone} of {pos.recoveryTotal} optional recovery done. This tracks adherence only.</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {weeks.map((w) => <Link key={w.week} to="/generated/$id/week/$week" params={{ id: snap.id, week: String(w.week) }} className="flex flex-col rounded-lg border px-2 py-1.5 text-center text-[13px] hover:bg-muted"><span className="font-medium">Week {w.week}</span><span className="text-muted-foreground tabular-nums">{w.done}/{w.total}</span></Link>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/"><Button size="xl">Choose next program</Button></Link>
        <Button size="xl" variant="outline" onClick={async () => { await repo.endRun(run.id); await repo.startRun(snap.id); flash("New run started — previous history kept"); await router.invalidate(); }}>Run this block again</Button>
      </div>
      <p className="text-[13px] text-muted-foreground">A new run starts empty. This run’s history stays.</p>
    </section>
  );
}

/* ---------------- Review / overview ---------------- */
export function GeneratedOverview({ snap, data }: { snap: GeneratedSnapshot; data: GenData }) {
  const router = useRouter();
  const nav = useNavigate();
  const run = activeRun(data.runs, snap.id);
  const states = statesFor(snap, data.progress, run?.id);
  const pos = positionOf(snap, states);
  const errors = useMemo(() => validateGeneratedFile(snap.file), [snap]);
  const caveats = caveatsOf(snap.file, errors);
  const equipment = equipmentOf(snap.file);
  const [week, setWeek] = useState(1);
  const [view, setView] = useState<"week" | "progression">("week");
  const training = trainingSessions(snap);
  const recovery = snap.sessions.filter((s) => s.kind === "recovery").length;
  const rest = weekSessions(snap, week).filter((s) => s.kind === "rest").length;
  const use = async () => {
    const r = run ?? (await repo.startRun(snap.id));
    if (run) await repo.promoteRun(run.id);
    flash(`${snap.title} is now on Train`); await router.invalidate(); nav({ to: "/train" }); void r;
  };
  const promoted = promotedOf(data)?.snap.id === snap.id;
  return (
    <>
      <section className={card("overflow-hidden")} aria-label="Program summary">
        <div className="flex flex-col gap-3 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">{run ? "Training program" : "Review program"}</span>
            <Badge variant={pos.complete ? "success" : run ? "secondary" : "outline"} size="lg">{pos.complete ? "Completed" : run ? "In progress" : "Not active"}</Badge>
          </div>
          <h1 className="font-heading text-[clamp(28px,4.5vw,36px)] leading-[1.1] font-semibold tracking-tight">{snap.title}</h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">{snap.weekCount} weeks · {training.length} training sessions. Train in order on days that suit you; it can take longer than {snap.weekCount} calendar weeks.</p>
        </div>
        <dl className="grid grid-cols-3 gap-px border-y bg-border">
          {[["Days per week", snap.daysPerWeek], ["Weeks", snap.weekCount], ["Training sessions", training.length]].map(([l, v]) => (
            <div key={l} className="flex flex-col gap-1.5 bg-card p-4 sm:px-6 sm:py-5"><dt className="text-xs font-medium text-muted-foreground">{l}</dt><dd className="order-first font-heading text-[28px] leading-none font-semibold tabular-nums">{v}</dd>{l === "Training sessions" && recovery > 0 && <dd className="text-[11px] text-muted-foreground">+{recovery} optional recovery</dd>}</div>
          ))}
        </dl>
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          {run && <div className="flex flex-col gap-2"><div className="flex justify-between text-[13px]"><span className="font-medium">Your progress</span><span className="text-muted-foreground tabular-nums">{pos.done} of {pos.total} training sessions complete</span></div><Progress value={(pos.done / Math.max(1, pos.total)) * 100} aria-label="Block progress" /></div>}
          {snap.startDate && <div className="flex flex-col gap-0.5 text-[15px]"><span className="text-[13px] font-medium text-muted-foreground">Suggested start</span><span>{dateShort(snap.startDate)} · {training.filter((s) => s.week === 1).map((s) => weekdayShort(s.weekday)).join(" / ")}</span></div>}
          {equipment.length > 0 && <div className="flex flex-col gap-0.5 text-[15px]"><span className="text-[13px] font-medium text-muted-foreground">Equipment</span><span className="capitalize">{equipment.join(", ")}</span></div>}
          {caveats.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="Before you start">
              {caveats.map((c, i) => (
                <li key={i} className={cn("flex gap-2.5 rounded-xl border p-3 text-sm", c.kind === "blocking" && "border-destructive/40 bg-destructive/5", c.kind === "unknown" && "border-dashed")}>
                  {c.kind === "blocking" || c.kind === "action" ? <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning-foreground" /> : c.kind === "unknown" ? <CircleDashedIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                  <span><strong className="font-semibold">{c.title}.</strong> <span className="text-muted-foreground">{c.detail}</span></span>
                </li>
              ))}
            </ul>
          )}
          {!pos.complete && (
            <div className="flex flex-col gap-2">
              {errors.length ? <Button size="xl" disabled>Can’t activate — fix structure</Button>
                : promoted ? <Link to="/train"><Button size="xl" className="w-full">Open Train</Button></Link>
                : <Button size="xl" onClick={use}>{run ? "Make this the Train program" : "Use this program"}</Button>}
              {!run && <p className="text-[13px] text-muted-foreground">Saves all {snap.weekCount} weeks to this device. Doesn’t start a workout.</p>}
            </div>
          )}
        </div>
      </section>
      {run && pos.complete && <BlockSummary snap={snap} run={run} states={states} />}
      <section className="flex flex-col gap-3" aria-label="What you’ll do">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-xl font-semibold">What you’ll do</h2>
          <div className="flex gap-1" role="group" aria-label="View">
            {(["week", "progression"] as const).map((v) => <Button key={v} size="sm" variant={view === v ? "default" : "outline"} onClick={() => setView(v)}>{v === "week" ? "By week" : "Progression"}</Button>)}
          </div>
        </div>
        {view === "week" ? (
          <>
            <WeekTabs snap={snap} states={states} selected={week} onSelect={setWeek} />
            <SessionList snap={snap} states={states} week={week} next={pos.next?.id} />
            <p className="text-[13px] text-muted-foreground">{recovery > 0 ? `+ ${weekSessions(snap, week).filter((s) => s.kind === "recovery").length} optional recovery` : ""}{rest ? ` · ${rest} rest day` : ""} · <Link to="/generated/$id/week/$week" params={{ id: snap.id, week: String(week) }} className="underline">Open Week {week}</Link></p>
          </>
        ) : <Progression snap={snap} />}
      </section>
      <details className={card("p-5 text-sm")}>
        <summary className="cursor-pointer font-semibold">Program details</summary>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-muted-foreground">
          <dt>Track</dt><dd>{snap.track}</dd>
          {snap.file.options.seed !== undefined && <><dt>Seed</dt><dd>{snap.file.options.seed}</dd></>}
          <dt>Fingerprint</dt><dd className="font-mono">{snap.fingerprint.slice(0, 12)}</dd>
          <dt>Saved</dt><dd>{new Date(snap.importedAt).toLocaleString()}</dd>
          {snap.file.checks?.map((c) => <><dt key={c.name + "k"}>{c.name}</dt><dd key={c.name + "v"}>{c.status}{c.detail ? ` — ${c.detail}` : ""}</dd></>)}
        </dl>
      </details>
    </>
  );
}

function Progression({ snap }: { snap: GeneratedSnapshot }) {
  const orders = [...new Set(trainingSessions(snap).map((s) => s.order))];
  return (
    <div className="flex flex-col gap-4">
      {orders.map((o) => (
        <div key={o} className={card("overflow-hidden")}>
          <div className="border-b px-4 py-2.5 text-[13px] font-semibold">Session {o}</div>
          {trainingSessions(snap).filter((s) => s.order === o).map((s) => {
            const m = mainLiftSets(dayOf(snap, s));
            return <div key={s.id} className="flex items-baseline gap-3 border-t px-4 py-2.5 text-sm first:border-t-0"><span className="w-12 shrink-0 text-muted-foreground">Wk {s.week}</span><span className="min-w-0 flex-1 truncate font-medium">{m?.name ?? s.title}</span><span className="tabular-nums">{m?.reps}</span><span className="w-20 text-end text-muted-foreground tabular-nums">{m?.rpe ? `RPE ${m.rpe}` : ""}</span></div>;
          })}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Week browser ---------------- */
function WeekTabs({ snap, states, selected, onSelect, current }: { snap: GeneratedSnapshot; states: StateMap; selected: number; onSelect: (w: number) => void; current?: number }) {
  return (
    <div className="grid grid-cols-6 gap-1.5" role="tablist" aria-label="Program weeks">
      {Array.from({ length: snap.weekCount }, (_, i) => i + 1).map((w) => {
        const c = weekCounts(snap, states, w);
        return (
          <button key={w} role="tab" aria-selected={w === selected} onClick={() => onSelect(w)}
            className={cn("flex min-h-14 flex-col items-center justify-center rounded-xl border text-sm font-semibold", w === selected ? "bg-primary text-primary-foreground" : c.done === c.total && c.total > 0 ? "border-success/40 bg-success/8 text-success-foreground" : "bg-card", w === current && w !== selected && "border-foreground")}>
            <span>{w}</span><span className="text-[11px] font-normal tabular-nums opacity-80">{c.done}/{c.total}{c.done === c.total && c.total > 0 ? " ✓" : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

function SessionList({ snap, states, week, next }: { snap: GeneratedSnapshot; states: StateMap; week: number; next?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {weekSessions(snap, week).map((s) => {
        const status = statusOf(states.get(s.id));
        if (s.kind === "rest") {
          const text = noteText(dayOf(snap, s));
          return text
            ? <details key={s.id} className="rounded-xl border px-4 py-3 text-sm"><summary className="cursor-pointer text-muted-foreground">{weekdayShort(s.weekday)} · Note</summary><p className="mt-2 whitespace-pre-line">{text}</p></details>
            : <div key={s.id} className="px-4 py-2 text-sm text-muted-foreground">{weekdayShort(s.weekday)} · Rest day</div>;
        }
        if (s.kind === "recovery") {
          return (
            <Link key={s.id} {...sessionPath} params={{ id: snap.id, sid: s.id }} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-2 text-sm hover:bg-muted">
              <span className="text-muted-foreground">{weekdayShort(s.weekday)} · Optional recovery</span>
              <span className="flex items-center gap-2">{status === "complete" && <span className="text-xs text-success-foreground">done</span>}<span className="font-medium">Open</span></span>
            </Link>
          );
        }
        return (
          <Link key={s.id} {...sessionPath} params={{ id: snap.id, sid: s.id }} className={card("flex min-h-20 items-center gap-4 p-4 hover:bg-muted")}>
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-semibold", status === "complete" ? "bg-success/8 text-success-foreground" : "bg-muted")}>{status === "complete" ? <CheckIcon className="size-5" /> : s.order}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[13px] text-muted-foreground">Session {s.order} · {weekdayShort(s.weekday)}</span><span className="text-[17px] leading-snug font-semibold tracking-tight">{s.title}</span></span>
            <StatusBadge status={status} next={s.id === next} />
          </Link>
        );
      })}
    </div>
  );
}

export function GeneratedWeek({ snap, week, data }: { snap: GeneratedSnapshot; week: number; data: GenData }) {
  const nav = useNavigate();
  const run = activeRun(data.runs, snap.id);
  const states = statesFor(snap, data.progress, run?.id);
  const pos = positionOf(snap, states);
  const counts = weekCounts(snap, states, week);
  const first = weekSessions(snap, week)[0];
  const weekRows = [...new Set(trainingSessions(snap).map((s) => s.order))];
  return (
    <>
      <p className="text-sm font-medium text-muted-foreground"><Link to="/generated/$id" params={{ id: snap.id }} className="underline">{snap.title}</Link></p>
      <WeekTabs snap={snap} states={states} selected={week} current={run ? pos.week : undefined} onSelect={(w) => nav({ to: "/generated/$id/week/$week", params: { id: snap.id, week: String(w) } })} />
      <Heading title={`Week ${week}`} sub={`${counts.done} of ${counts.total} sessions${first ? ` · suggested ${dateShort(first.date)}` : ""}. Dates are suggestions; a missed day never skips a session.`} />
      <SessionList snap={snap} states={states} week={week} next={pos.next?.id} />
      <section className="hidden flex-col gap-2 lg:flex" aria-label="Block overview">
        <h2 className="font-heading text-xl font-semibold">Block overview</h2>
        <div className={card("overflow-x-auto")}>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2.5 font-medium" />{Array.from({ length: snap.weekCount }, (_, i) => <th key={i} className="p-2.5 font-medium">Week {i + 1}</th>)}</tr></thead>
            <tbody>
              {weekRows.map((o) => (
                <tr key={o} className="border-t"><th className="p-2.5 text-left font-medium">Session {o}</th>
                  {Array.from({ length: snap.weekCount }, (_, i) => {
                    const s = trainingSessions(snap).find((x) => x.week === i + 1 && x.order === o);
                    const status = statusOf(s && states.get(s.id));
                    return <td key={i} className="p-1.5">{s && <Link {...sessionPath} params={{ id: snap.id, sid: s.id }} className={cn("flex min-h-12 flex-col rounded-lg border px-2 py-1 hover:bg-muted", status === "complete" && "border-success/40 bg-success/8", s.id === pos.next?.id && "border-foreground")}><span className="truncate">{s.title.split(" + ")[0]}</span><span className="text-xs text-muted-foreground">{status === "complete" ? "Complete" : s.id === pos.next?.id ? "Next" : status === "in-progress" ? "In progress" : "Not started"}</span></Link>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ---------------- Session ---------------- */
export function GeneratedSession({ snap, sid, data }: { snap: GeneratedSnapshot; sid: string; data: GenData }) {
  const router = useRouter();
  const nav = useNavigate();
  const ref = sessionRef(snap, sid);
  const day = ref ? dayOf(snap, ref) : undefined;
  const run = activeRun(data.runs, snap.id);
  const saved = statesFor(snap, data.progress, run?.id).get(sid);
  const [state, setState] = useState(saved);
  const [confirm, setConfirm] = useState(false);
  const checksRef = useRef(saved?.checks ?? {});
  useEffect(() => { setState(saved); checksRef.current = saved?.checks ?? {}; }, [sid, run?.id]);
  // Navigation re-reads progress for Train/week screens when leaving.
  useEffect(() => () => { void router.invalidate(); }, []);
  const view = useMemo(() => (day && ref ? buildGeneratedDayView(day, new Map(), `${snap.id}-${ref.id}`) : undefined), [day, ref, snap.id]);
  const status = statusOf(state);
  const patch = useCallback(async (p: Partial<SessionProgress>) => {
    if (!run) return;
    const next = await repo.patchProgress(run.id, snap.id, sid, { savedAt: new Date().toISOString(), ...p });
    setState(next);
  }, [run, snap.id, sid]);
  const [tracking, setTracking] = useState<Record<string, string[]>>(saved?.checks ?? {});
  useEffect(() => { setTracking(saved?.checks ?? {}); }, [sid, run?.id]);
  const onTrackingChange = useCallback((key: string, value: string[]) => {
    const checks = { ...checksRef.current, [key]: value };
    checksRef.current = checks; setTracking(checks);
    const block = view?.blocks.find((b) => b.key === key || ("exercises" in b && b.exercises.some((e) => e.key === key)));
    const lastSection = block && "title" in block && block.title ? `${("label" in block && block.label ? block.label + " · " : "")}${block.title}` : undefined;
    void patch({ checks, ...(lastSection ? { lastSection } : {}) });
  }, [patch, view]);
  if (!ref || !day || !view) return <Heading title="Session not found" sub="It may not be part of this block." />;
  const unchecked = uncheckedOf(view, tracking);
  const title = ref.kind === "training" ? `Session ${ref.order}` : "Optional recovery";
  const crumb = <p className="text-sm font-medium text-muted-foreground"><Link to="/generated/$id" params={{ id: snap.id }} className="underline">{snap.title}</Link> · <Link to="/generated/$id/week/$week" params={{ id: snap.id, week: String(ref.week) }} className="underline">Week {ref.week}</Link> · {title}</p>;
  const finish = async () => {
    await patch({ completedAt: new Date().toISOString() }); setConfirm(false); await router.invalidate();
    flash("Session complete");
  };
  const states = statesFor(snap, data.progress, run?.id);
  const upcoming = positionOf(snap, new Map(states).set(sid, { ...(state ?? {}), completedAt: state?.completedAt ?? "x" })).next;
  const mode = !run ? "inert" : status === "not-started" ? "preview" : status === "in-progress" ? "active" : "complete";
  const start = async () => { await patch({ startedAt: new Date().toISOString() }); await router.invalidate(); };
  let bar: ReactNode = null;
  if (mode === "inert") bar = <p className="flex-1 text-sm text-muted-foreground">Activate the program to start sessions.</p>;
  if (mode === "preview") bar = <Button size="xl" className="flex-1" onClick={start}>Start session</Button>;
  if (mode === "active") bar = <><span className="flex-1 text-[13px] text-muted-foreground" role="status" data-testid="saved-state">Saved on this device · {unchecked.checked} of {unchecked.total} checked</span><Button size="xl" onClick={() => (unchecked.items.length ? setConfirm(true) : finish())}>Finish session</Button></>;
  return (
    <>
      {crumb}
      {mode === "inert" || mode === "preview" ? <div className="rounded-lg bg-muted px-3 py-2 text-[13px] font-medium text-muted-foreground">Preview — doesn’t change progress</div> : mode === "active" ? <Badge variant="secondary" size="lg" className="self-start">In progress · saved</Badge> : null}
      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold text-muted-foreground">{title} · suggested {dateShort(ref.date)}</span>
        <h1 className="font-heading text-[clamp(28px,5vw,38px)] leading-[1.08] font-bold tracking-tight text-balance">{ref.title}</h1>
        {view.badges.filter((b) => b.startsWith("Short")).map((b) => <span key={b} className="text-sm text-muted-foreground">{b}</span>)}
        <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Sections">
          {view.blocks.filter((b) => "title" in b && b.title).map((b) => <button key={b.key} type="button" className="min-h-9 rounded-full border px-3 text-[13px] hover:bg-muted" onClick={() => document.getElementById(b.key)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{"label" in b && b.label ? `${b.label} · ` : ""}{"title" in b ? b.title : ""}</button>)}
        </div>
      </div>
      {mode === "complete" && (
        <section className={card("flex flex-col gap-3 p-5")} aria-label="Session complete">
          <span className="text-xl font-semibold">Session complete</span>
          <span className="text-sm text-muted-foreground">Saved {state?.completedAt ? new Date(state.completedAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""} · {unchecked.checked} of {unchecked.total} checked{unchecked.items.length ? ` · ${unchecked.items.length} left unchecked` : ""}</span>
          <label className="flex flex-col gap-1.5 text-sm font-medium">Note (optional)
            <textarea defaultValue={state?.note ?? ""} placeholder="How did it go? Only you see this." className="min-h-20 rounded-lg border bg-background p-3 text-[15px] font-normal" onBlur={(e) => { if (e.target.value !== (state?.note ?? "")) void patch({ note: e.target.value }); }} />
          </label>
          {upcoming && <div className="rounded-xl border p-3 text-sm"><span className="text-[13px] text-muted-foreground">What’s next</span><br /><Link {...sessionPath} params={{ id: snap.id, sid: upcoming.id }} className="font-semibold underline">Week {upcoming.week} · Session {upcoming.order} · {upcoming.title}</Link></div>}
          <div className="flex flex-wrap gap-2">
            <Button size="xl" onClick={() => nav({ to: "/train" })}>Back to program</Button>
            <Button size="xl" variant="outline" onClick={async () => { await patch({ completedAt: undefined }); await router.invalidate(); flash("Completion undone · checkmarks kept"); }}>Undo finish</Button>
          </div>
        </section>
      )}
      {day.focus?.body && <p className="text-[15px] text-muted-foreground">{day.focus.body}</p>}
      <WorkoutBlocks view={mode === "active" ? view : previewView(view)} tracking={tracking} onTrackingChange={onTrackingChange} />
      {bar && <div className="sticky bottom-14 z-10 -mx-4 flex items-center gap-3 border-t bg-background px-4 py-3 sm:-mx-8 sm:px-8 lg:bottom-0">{bar}</div>}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogPopup>
          <DialogHeader><DialogTitle>Finish with unchecked sets?</DialogTitle><DialogDescription>{unchecked.items.length} of {unchecked.total} aren’t checked. You can still finish — checkmarks stay exactly as they are.</DialogDescription></DialogHeader>
          <DialogPanel><ul className="flex max-h-60 flex-col gap-1 overflow-auto text-sm">{unchecked.items.map((u, i) => <li key={u.key + i} className="flex justify-between gap-3"><span>{u.title}</span><span className="text-muted-foreground">{u.label}</span></li>)}</ul></DialogPanel>
          <DialogFooter><Button variant="outline" onClick={() => setConfirm(false)}>Keep training</Button><Button onClick={finish}>Finish anyway</Button></DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
export type { SessionRef };
