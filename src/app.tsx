import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRootRoute, createRoute, createRouter, Link, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowUpFromLineIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, DownloadIcon, HardDriveDownloadIcon, MoonIcon, PlayIcon, SettingsIcon, SunIcon, Trash2Icon } from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "./components/ui/dialog";
import { Progress } from "./components/ui/progress";
import { ToastProvider, toastManager } from "./components/ui/toast";
import { WorkoutRenderer } from "./components/WorkoutRenderer";
import { repo } from "./data/db";
import { deleteCachedMedia, downloadMedia, requestPersistence, storageEstimate } from "./data/media";
import { completedKeys, collectMedia, frequencyGroups, groupForParam, nextIncomplete, programProgress } from "./domain/selectors";
import { WEEKDAYS, flatSessions, sessionKey, type ImportReport, type Program } from "./domain/types";
import type { RawItem } from "./domain/workout";
import { cn } from "./lib/utils";

const flash = (title: string) => toastManager.add({ title });
const card = (cls?: string) => cn("rounded-2xl border bg-card shadow-xs/5", cls);

async function baseData() {
  await repo.ensureSeeded();
  await repo.syncCatalog();
  const [programs, runs, progress] = await Promise.all([repo.listPrograms(), repo.listRuns(), repo.listProgress()]);
  return { programs, runs, progress };
}
const activeRunOf = (runs: Awaited<ReturnType<typeof repo.listRuns>>, pid: string) => runs.find((r) => r.programId === pid && !r.endedAt);

function useOfflineDark() {
  const [dark, setDark] = useState(false);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    setOffline(!navigator.onLine);
    const on = () => setOffline(false), off = () => setOffline(true);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    requestPersistence();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  return { dark, setDark, offline };
}

function Shell() {
  const { dark, setDark, offline } = useOfflineDark();
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => { const h = () => setUpdateReady(true); window.addEventListener("sw-update-ready", h); return () => window.removeEventListener("sw-update-ready", h); }, []);
  return (
    <ToastProvider position="bottom-center">
      <div className="relative flex min-h-dvh bg-background text-foreground">
        <aside className="sticky top-0 hidden h-dvh w-70 shrink-0 flex-col overflow-auto border-e bg-sidebar lg:flex">
          <div className="flex h-15 items-center gap-2.5 border-b px-5"><div className="size-5.5 rounded-md bg-primary" /><span className="text-[15px] font-semibold tracking-tight">Logbook</span></div>
          <nav className="flex flex-col gap-0.5 p-3" aria-label="Library">
            <span className="px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">Library</span>
            {[3, 4, 5].map((n) => <Link key={n} to="/programs/$group" params={{ group: String(n) }} className="flex h-9 items-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted [&.active]:bg-muted">{n}× per week</Link>)}
            <Link to="/programs/$group" params={{ group: "other" }} className="flex h-9 items-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted [&.active]:bg-muted">Other schedules</Link>
          </nav>
          <nav className="flex flex-col gap-0.5 p-3" aria-label="App">
            <Link to="/downloads" className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium hover:bg-muted [&.active]:bg-muted"><HardDriveDownloadIcon className="size-4" />Downloads</Link>
            <Link to="/settings" className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium hover:bg-muted [&.active]:bg-muted"><SettingsIcon className="size-4" />Settings</Link>
          </nav>
          <div className="mt-auto flex items-center gap-2 border-t px-5 py-4 text-xs text-muted-foreground">
            <span className={cn("size-1.5 rounded-full", offline ? "bg-muted-foreground" : "bg-success")} />
            <span>{offline ? "Offline · using saved content" : "Online · content saved on device"}</span>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-15 items-center gap-2 border-b bg-background px-3 sm:px-6">
            <Link to="/" className="flex items-center gap-2.5 font-semibold lg:hidden"><span className="size-5.5 rounded-md bg-primary" />Logbook</Link>
            <span className="flex-1" />
            {offline && <Badge variant="secondary" size="lg">Offline</Badge>}
            <Button variant="ghost" size="icon-lg" aria-label="Toggle theme" onClick={() => setDark((d) => !d)}>{dark ? <SunIcon /> : <MoonIcon />}</Button>
          </header>
          {updateReady && (
            <div role="alert" className="flex flex-wrap items-center gap-3 border-b bg-muted px-4 py-3 text-sm">
              <span className="flex-1">A new version of the app is available.</span>
              <Button size="sm" onClick={() => (window as unknown as { __updateSW?: () => void }).__updateSW?.()}>Update now</Button>
            </div>
          )}
          <main className="flex-1"><div className="mx-auto flex max-w-190 flex-col gap-7 px-4 pt-7 pb-12 sm:px-8"><Outlet /></div></main>
          <nav className="sticky bottom-0 flex border-t bg-background lg:hidden" aria-label="App">
            <Link to="/" className="flex min-h-14 flex-1 items-center justify-center text-sm font-medium [&.active]:text-primary">Library</Link>
            <Link to="/downloads" className="flex min-h-14 flex-1 items-center justify-center text-sm font-medium [&.active]:text-primary">Downloads</Link>
            <Link to="/settings" className="flex min-h-14 flex-1 items-center justify-center text-sm font-medium [&.active]:text-primary">Settings</Link>
          </nav>
        </div>
      </div>
    </ToastProvider>
  );
}

function Heading({ title, sub }: { title: string; sub?: string }) {
  return <div className="flex flex-col gap-2"><h1 className="font-heading text-[clamp(26px,4vw,32px)] leading-[1.15] font-semibold tracking-tight text-balance">{title}</h1>{sub && <p className="text-base text-muted-foreground">{sub}</p>}</div>;
}
function NotFound({ what }: { what: string }) {
  return <><Heading title={`${what} not found`} sub="It may have been removed by a content update. Your progress is stored separately and has not been changed." /><Link to="/" className="text-sm font-medium underline">Back to library</Link></>;
}

/* ---------------- Library ---------------- */
function Library() {
  const { programs, runs, progress } = libraryRoute.useLoaderData();
  const groups = frequencyGroups(programs);
  const active = runs.find((r) => !r.endedAt);
  const activeProg = active ? programs.find((p) => p.id === active.programId) : undefined;
  const done = active ? completedKeys(progress, active.id) : new Set<string>();
  const nx = activeProg ? nextIncomplete(activeProg, done) : null;
  const [importOpen, setImportOpen] = useState(false);
  return (
    <>
      {activeProg && active && (
        <section className={card("flex flex-col gap-4 p-5")} aria-label="Continue">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-muted-foreground">Continue · {activeProg.title}</span>
              <span className="text-xl font-semibold tracking-tight">{nx ? `Session ${nx.order} — ${nx.title ?? ""}` : "Program complete"}</span>
              <span className="text-sm text-muted-foreground">{nx ? `Week ${nx.weekOrder} of ${activeProg.totalWeeks}` : "Every session is done."}</span>
            </div>
            {nx ? <Link to="/program/$programId/week/$weekId/session/$sessionId" params={{ programId: activeProg.id, weekId: nx.weekId, sessionId: nx.id }}><Button size="xl">Continue<ChevronRightIcon /></Button></Link>
              : <Link to="/program/$programId" params={{ programId: activeProg.id }}><Button size="xl">Review</Button></Link>}
          </div>
          <Progress value={(programProgress(activeProg, done).done / Math.max(1, programProgress(activeProg, done).total)) * 100} />
          <span className="text-[13px] text-muted-foreground">{programProgress(activeProg, done).done} of {programProgress(activeProg, done).total} sessions complete</span>
        </section>
      )}
      <Heading title="How many days per week do you want to train?" sub="Pick a frequency to see programs built around it." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {groups.map((g) => (
          <Link key={g.key} to="/programs/$group" params={{ group: g.key }} className={card("flex min-h-50 flex-col gap-3.5 p-5 transition-colors hover:bg-muted")}>
            <span className="flex items-baseline gap-1.5">{g.daysPerWeek ? <><span className="font-heading text-[52px] leading-none font-semibold tracking-tighter tabular-nums">{g.daysPerWeek}×</span><span className="text-[15px] font-medium text-muted-foreground">per week</span></> : <span className="font-heading text-3xl font-semibold">Other</span>}</span>
            <span className="text-[15px] text-muted-foreground">{g.label}</span>
            <span className="mt-auto flex items-center justify-between text-sm font-medium"><span>{g.programs.length} program{g.programs.length === 1 ? "" : "s"}</span><ChevronRightIcon className="size-4.5" /></span>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">Programs and progress are stored on this device.</span>
        <Button variant="outline" onClick={() => setImportOpen(true)}><ArrowUpFromLineIcon />Import program</Button>
      </div>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const doImport = async (input: { manifest: unknown; files: Record<string, unknown>; library?: unknown[] }) => {
    setBusy(true); setError(null);
    try { const r = await repo.importBundle(input); setReport(r); if (!r.errors.length) { flash(r.duplicate ? "Already imported — no duplicates created" : "Program imported"); await router.invalidate(); } }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const fromUrl = async () => {
    try {
      const manifest = (await (await fetch(url)).json()) as { weeks?: { sessions?: { contentPath: string }[] }[] };
      const base = url.slice(0, url.lastIndexOf("/") + 1);
      const files: Record<string, unknown> = {};
      for (const w of manifest.weeks ?? []) for (const s of w.sessions ?? []) files[s.contentPath] = await (await fetch(new URL(s.contentPath, base).href)).json();
      let library: unknown[] | undefined;
      try { const l = await (await fetch(new URL("exercises/library.json", base.replace(/programs\/[^/]+\/$/, "")).href)).json(); if (Array.isArray(l)) library = l; } catch { /* optional */ }
      await doImport({ manifest, files, library });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const fromFile = async (f: File | undefined) => { if (f) { try { await doImport(JSON.parse(await f.text())); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } } };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader><DialogTitle>Import program</DialogTitle><DialogDescription>Import a versioned bundle: a manifest JSON plus its session files. Progress for unchanged session IDs is kept.</DialogDescription></DialogHeader>
        <DialogPanel className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">Bundle file (.json with manifest, files, library)
            <input type="file" accept="application/json" className="min-h-11 text-sm" onChange={(e) => fromFile(e.target.files?.[0])} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">Or manifest URL
            <span className="flex gap-2"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/program.json" className="min-h-11 flex-1 rounded-lg border bg-background px-3" /><Button disabled={busy || !url} onClick={fromUrl}>Fetch</Button></span></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {report && (
            <div className="flex flex-col gap-1.5 text-sm" role="status">
              {report.errors.map((e) => <p key={e} className="text-destructive">{e}</p>)}
              {!report.errors.length && <p><CheckIcon className="mr-1 inline size-4" />Imported {report.sessionsImported} sessions into program {report.programId} (content {report.contentVersion}).</p>}
              {report.missingExercises.map((m) => <p key={m} className="text-warning-foreground">Missing exercise: {m} — sessions still render with a placeholder.</p>)}
              {report.warnings.map((w) => <p key={w} className="text-muted-foreground">{w}</p>)}
              {report.removedSessionIds.length > 0 && <p className="text-warning-foreground">Migration report: session IDs removed by this update: {report.removedSessionIds.join(", ")}. Their progress records are kept, not deleted.</p>}
            </div>
          )}
        </DialogPanel>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/* ---------------- Program list / overview / week / session ---------------- */
function ProgramList() {
  const { programs } = groupRoute.useLoaderData();
  const { group } = groupRoute.useParams();
  const g = groupForParam(programs, group);
  if (!g) return <NotFound what="Schedule group" />;
  return (
    <>
      <Heading title={g.label} sub={g.daysPerWeek ? `${g.daysPerWeek} sessions a week, in order, on days you choose.` : "Programs on schedules other than 3, 4, or 5 days a week."} />
      {g.programs.length === 0 && <p className="text-muted-foreground">No programs on this schedule yet. Import one from the library.</p>}
      <div className="flex flex-col gap-3">
        {g.programs.map((p) => (
          <Link key={p.id} to="/program/$programId" params={{ programId: p.id }} className={card("flex flex-col gap-2.5 p-5 transition-colors hover:bg-muted")}>
            <span className="flex flex-wrap gap-1.5"><Badge variant="outline" size="lg">{p.totalWeeks} weeks</Badge><Badge variant="outline" size="lg">{p.daysPerWeek}×/week</Badge>{p.focus && <Badge variant="secondary" size="lg">{p.focus}</Badge>}</span>
            <span className="text-xl font-semibold tracking-tight">{p.title}</span>
            {p.description && <span className="text-[15px] text-muted-foreground text-pretty">{p.description}</span>}
            {p.equipment?.length ? <span className="text-[13px] text-muted-foreground">Equipment: {p.equipment.join(", ")}</span> : null}
          </Link>
        ))}
      </div>
    </>
  );
}

function MediaSummary({ programId, items, exerciseIndex }: { programId: string; items: Map<string, Record<string, unknown>[]>; exerciseIndex: Map<string, import("./domain/types").Exercise> }) {
  const router = useRouter();
  const [records, setRecords] = useState<Awaited<ReturnType<typeof repo.listMedia>>>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => { repo.listMedia(programId).then(setRecords); }, [programId, busy]);
  const assets = collectMedia(items, exerciseIndex);
  const total = assets.length;
  const downloaded = records.filter((r) => r.status === "downloaded").length;
  const failed = records.filter((r) => r.status !== "downloaded");
  const start = async () => {
    const all = collectMedia(items, exerciseIndex);
    abort.current = new AbortController(); setBusy(true);
    const res = await downloadMedia(repo, programId, all, { signal: abort.current.signal, onProgress: (d, t) => setProgress(Math.round((d / t) * 100)) });
    setBusy(false); setRecords(await repo.listMedia(programId));
    flash(res.every((r) => r.status === "downloaded") ? "Media saved for offline use" : "Download finished — some media is not downloadable");
    await router.invalidate();
  };
  return (
    <section className={card("flex flex-col")} aria-label="Offline media">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex flex-col gap-0.5"><span className="text-[15px] font-semibold">Offline media</span>
          <span className="text-[13px] text-muted-foreground">{total === 0 ? "No downloadable media referenced." : downloaded >= total ? "All referenced media is saved on this device." : "Workout text is saved. Images and videos need an explicit download."}</span></div>
        {downloaded < total && !busy && <Button variant="outline" onClick={start}><DownloadIcon />Download media</Button>}
        {busy && <Button variant="outline" onClick={() => abort.current?.abort()}>Cancel</Button>}
        {downloaded > 0 && !busy && <Button variant="outline" onClick={async () => { await deleteCachedMedia(repo, programId); setRecords([]); flash("Media removed · progress kept"); }}><Trash2Icon />Remove media</Button>}
      </div>
      {busy && <div className="px-5 py-3"><Progress value={progress} /></div>}
      <div className="px-5 py-3 text-[13px] text-muted-foreground">Saved {downloaded} of {total} assets{failed.length ? ` · ${failed.length} failed or not downloadable (CORS required)` : ""}. Text workouts work offline regardless.</div>
    </section>
  );
}

function ProgramOverview() {
  const { program, runs, progress, items, exerciseIndex } = programRoute.useLoaderData();
  const navigate = useNavigate(); const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  if (!program) return <NotFound what="Program" />;
  const totalSessions = flatSessions(program).length;
  const downloadedSessions = items.size;
  const fullyDownloaded = downloadedSessions >= totalSessions;
  const download = async () => {
    setDownloading(true);
    const r = await repo.downloadProgram(program.id);
    setDownloading(false);
    flash(r.downloaded >= r.total ? "Program saved for offline use" : `Saved ${r.downloaded} of ${r.total} sessions — check your connection`);
    await router.invalidate();
  };
  const run = activeRunOf(runs, program.id);
  const done = completedKeys(progress, run?.id);
  const pr = programProgress(program, done);
  const nx = run ? nextIncomplete(program, done) : null;
  const primary = async () => {
    if (!run) { await repo.startRun(program.id); flash(`${program.title} started`); await router.invalidate(); return; }
    if (nx) navigate({ to: "/program/$programId/week/$weekId/session/$sessionId", params: { programId: program.id, weekId: nx.weekId, sessionId: nx.id } });
  };
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <h1 className="font-heading text-[clamp(28px,4.5vw,36px)] leading-[1.1] font-semibold tracking-tight">{program.title}</h1>
        {program.description && <p className="text-base leading-relaxed text-muted-foreground text-pretty">{program.description}</p>}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] overflow-hidden rounded-2xl border bg-card">
        {[["Days per week", String(program.daysPerWeek)], ["Weeks", String(program.totalWeeks)], ["Sessions", String(flatSessions(program).length)], ["Focus", program.focus ?? "—"], ["Level", program.difficulty ?? "—"]].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 px-4 py-4 shadow-[-1px_0_0_var(--border),0_-1px_0_var(--border)]"><span className="text-xs font-medium text-muted-foreground">{k}</span><span className="text-lg font-semibold">{v}</span></div>
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        <Button size="xl" className="min-h-13 text-base font-semibold" onClick={primary}>{run ? (nx ? `Continue · Week ${nx.weekOrder}, Session ${nx.order}` : "Program complete") : "Start program"}</Button>
        <span className="text-center text-[13px] text-muted-foreground">{run ? `${pr.done} of ${pr.total} sessions complete` : "You can preview any session without starting."}</span>
        {run && <Button variant="outline" onClick={async () => { await repo.endRun(run.id); await repo.startRun(program.id); flash("New run started — previous progress kept"); await router.invalidate(); }}>Restart as new run</Button>}
      </div>
      <section className={card("flex flex-wrap items-center justify-between gap-3 p-5")} aria-label="Offline download">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold">Offline use</span>
          <span className="text-[13px] text-muted-foreground">{fullyDownloaded ? "All sessions are saved on this device and open offline." : `${downloadedSessions} of ${totalSessions} sessions saved on this device. The rest load when you open them online.`}</span>
        </div>
        {fullyDownloaded ? <Badge variant="success" size="lg">Downloaded</Badge> : <Button variant="outline" disabled={downloading} onClick={download}><DownloadIcon />{downloading ? "Downloading…" : "Download program"}</Button>}
      </section>
      <MediaSummary programId={program.id} items={items} exerciseIndex={exerciseIndex} />
      <section className="flex flex-col gap-3" aria-label="Weeks">
        <h2 className="font-heading text-xl font-semibold tracking-tight">Weeks</h2>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xs/5">
          {[...program.weeks].sort((a, b) => a.order - b.order).map((w) => {
            const wd = w.sessions.filter((s) => done.has(sessionKey(program.id, s.id))).length;
            const weekLabel = w.title && w.title.trim().toLowerCase() !== `week ${w.order}` ? w.title : "";
            return (
              <Link key={w.id} to="/program/$programId/week/$weekId" params={{ programId: program.id, weekId: w.id }} className="flex min-h-16 w-full items-center gap-4 border-t px-5 py-3.5 first:border-t-0 hover:bg-muted">
                <span className="w-16 shrink-0 text-sm font-semibold">Week {w.order}</span>
                <span className="flex-1 text-[15px] font-medium">{weekLabel}</span>
                <span className="font-mono text-[13px] text-muted-foreground">{wd}/{w.sessions.length}</span><ChevronRightIcon className="size-4.5 opacity-50" />
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}

function WeekView() {
  const { program, week, runs, progress } = weekRoute.useLoaderData();
  if (!program || !week) return <NotFound what="Week" />;
  const run = activeRunOf(runs, program.id);
  const done = completedKeys(progress, run?.id);
  const nx = run ? nextIncomplete(program, done) : null;
  const sessions = [...week.sessions].sort((a, b) => a.order - b.order);
  return (
    <>
      <p className="text-sm font-medium text-muted-foreground"><Link to="/program/$programId" params={{ programId: program.id }} className="underline">{program.title}</Link> · {sessions.length} sessions this week</p>
      <Heading title={`Week ${week.order}${week.title && week.title.trim().toLowerCase() !== `week ${week.order}` ? ` — ${week.title}` : ""}`} sub="Train these in order on whichever days suit you. A missed day never skips a session." />
      <div className="flex flex-col gap-2.5">
        {sessions.map((s) => {
          const isDone = done.has(sessionKey(program.id, s.id));
          const isNext = nx?.id === s.id;
          return (
            <Link key={s.id} to="/program/$programId/week/$weekId/session/$sessionId" params={{ programId: program.id, weekId: week.id, sessionId: s.id }} className={cn(card("flex min-h-21 items-center gap-4 p-4 hover:bg-muted"), isNext && "border-foreground")}>
              <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl text-xl font-semibold tabular-nums", isDone ? "bg-success/8 text-success-foreground" : "bg-muted")}>{isDone ? <CheckIcon className="size-5.5" strokeWidth={2.5} /> : s.order}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[13px] font-medium text-muted-foreground">Session {s.order}</span>
                <span className="text-[17px] font-semibold tracking-tight">{s.title ?? `Session ${s.order}`}</span>
                <span className="text-[13px] text-muted-foreground">{[s.summary, s.estimatedMinutes ? `${s.estimatedMinutes} min` : null].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge variant={isDone ? "success" : isNext ? "default" : "secondary"} size="lg">{isDone ? "Done" : s.optional ? "Optional" : isNext ? "Up next" : "To do"}</Badge>
                {s.suggestedWeekday && <span className="text-xs text-muted-foreground">Suggested {WEEKDAYS[s.suggestedWeekday]}</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function SessionView() {
  const data = sessionRoute.useLoaderData();
  const router = useRouter();
  const { program, week, session, items, exerciseIndex, runs, progress } = data;
  useEffect(() => { const r = activeRunOf(runs, program?.id ?? ""); if (r && program && session) repo.markOpened(r.id, program.id, session.id); }, []);
  if (!program || !week || !session) return <NotFound what="Session" />;
  if (!items) return <><Heading title={`Session ${session.order}`} sub="This session's workout is not on this device yet." /><p className="text-sm text-muted-foreground">Connect to the internet and open it again, or use Download program on the program page to save every session for offline use.</p></>;
  const run = activeRunOf(runs, program.id);
  const done = completedKeys(progress, run?.id);
  const all = flatSessions(program);
  const idx = all.findIndex((s) => s.id === session.id);
  const prev = idx > 0 ? all[idx - 1] : null;
  const next = idx < all.length - 1 ? all[idx + 1] : null;
  const isDone = done.has(sessionKey(program.id, session.id));
  const completedAt = run ? progress.find((p) => p.runId === run.id && p.sessionKey === sessionKey(program.id, session.id))?.completedAt : undefined;
  const exerciseCount = (items as RawItem[]).reduce((c, it) => c + (it.type === "groupedAssignment" ? (Array.isArray(it.subAssignments) ? it.subAssignments.length : 0) : it.type === "exerciseAssignment" ? 1 : 0), 0);
  const toggle = async () => {
    const r = run ?? (await repo.startRun(program.id));
    await repo.toggleComplete(r.id, program.id, session.id);
    flash(isDone ? "Marked not complete" : next ? "Session complete · next one is ready" : "Program complete");
    await router.invalidate();
  };
  const navBtn = (s: typeof prev, label: string) => s ? (
    <Link to="/program/$programId/week/$weekId/session/$sessionId" params={{ programId: program.id, weekId: s.weekId, sessionId: s.id }}><Button variant="outline" size="icon-xl" aria-label={label}>{label === "Previous session" ? <ChevronLeftIcon /> : <ChevronRightIcon />}</Button></Link>
  ) : <Button variant="outline" size="icon-xl" aria-label={label} disabled>{label === "Previous session" ? <ChevronLeftIcon /> : <ChevronRightIcon />}</Button>;
  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm font-medium text-muted-foreground">
        <Link to="/program/$programId" params={{ programId: program.id }} className="underline">{program.title}</Link>{" · "}
        <Link to="/program/$programId/week/$weekId" params={{ programId: program.id, weekId: week.id }} className="underline">Week {week.order}</Link>{" · Session "}{session.order}
      </nav>
      <div className="flex flex-col gap-2.5">
        <span className="text-[15px] font-semibold text-muted-foreground">Session {session.order}</span>
        <h1 className="font-heading text-[clamp(30px,5vw,40px)] leading-[1.08] font-bold tracking-tight text-balance">{session.title ?? `Session ${session.order}`}</h1>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {session.estimatedMinutes && <Badge variant="outline" size="lg"><ClockIcon />{session.estimatedMinutes} min</Badge>}
          <Badge variant="outline" size="lg">{exerciseCount} exercises</Badge>
          {session.optional && <Badge variant="secondary" size="lg">Optional · recovery</Badge>}
          {completedAt && <Badge variant="success" size="lg">Completed {new Date(completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Badge>}
          {!run && <Badge variant="secondary" size="lg">Preview</Badge>}
        </div>
      </div>
      <WorkoutRenderer items={items} exerciseIndex={exerciseIndex} />
      <div className="sticky bottom-14 lg:bottom-0 flex items-center gap-2 border-t bg-background pt-3 pb-4">
        {navBtn(prev, "Previous session")}
        <Button size="xl" variant={isDone ? "secondary" : "default"} className={cn("min-h-13 flex-1 text-base font-semibold", isDone && "bg-success/8 text-success-foreground")} onClick={toggle}>
          <CheckIcon strokeWidth={2.5} />{isDone ? "Completed" : "Mark complete"}
        </Button>
        {navBtn(next, "Next session")}
      </div>
    </>
  );
}


/* ---------------- Downloads & settings ---------------- */
function Downloads() {
  const { programs, itemsByProgram, exerciseIndex } = downloadsRoute.useLoaderData();
  const router = useRouter();
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [media, setMedia] = useState<Awaited<ReturnType<typeof repo.listMedia>>>([]);
  useEffect(() => { storageEstimate().then(setEstimate); repo.listMedia().then(setMedia); }, []);
  const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;
  const isIOS = typeof navigator !== "undefined" && /iPhone|iPad/.test(navigator.userAgent) && !(navigator as unknown as { standalone?: boolean }).standalone;
  return (
    <>
      <Heading title="Downloads & offline status" sub="Workout text and exercise definitions are saved when a program is imported. Media needs an explicit download." />
      {isIOS && <p className="rounded-2xl border bg-card p-4 text-sm">On iPhone/iPad, add this app to your Home Screen: Safari can evict saved data for sites that are not installed and not used for a while. Export your progress from Settings as a backup.</p>}
      <section className={card("flex flex-col gap-2 p-5")} aria-label="Storage">
        <span className="text-[15px] font-semibold">Device storage</span>
        <span className="text-sm text-muted-foreground">{estimate ? `Using about ${mb(estimate.usage)} of ${mb(estimate.quota)} available.` : "Storage estimate is not available in this browser."}</span>
      </section>
      <div className="flex flex-col gap-3">
        {programs.map((p) => {
          const assets = collectMedia(itemsByProgram[p.id] ?? new Map(), exerciseIndex);
          const recs = media.filter((m) => m.programId === p.id);
          const dl = recs.filter((r) => r.status === "downloaded").length;
          return (
            <section key={p.id} className={card("flex flex-col gap-3 p-5")} aria-label={p.title}>
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{p.title}</span>
                <Badge variant={dl >= assets.length && assets.length > 0 ? "success" : "secondary"} size="lg">{dl >= assets.length && assets.length > 0 ? "Media offline" : "Text offline"}</Badge></div>
              <span className="text-sm text-muted-foreground">Text: saved · Images/video: {dl}/{assets.length} saved{recs.some((r) => r.status !== "downloaded") ? " · some assets failed or are not downloadable (CORS required)" : ""}</span>
              <span className="flex gap-2"><Link to="/program/$programId" params={{ programId: p.id }}><Button variant="outline">Open program</Button></Link>
              {dl > 0 && <Button variant="outline" onClick={async () => { await deleteCachedMedia(repo, p.id); setMedia(await repo.listMedia()); flash("Media removed · progress kept"); await router.invalidate(); }}><Trash2Icon />Delete media</Button>}</span>
            </section>
          );
        })}
      </div>
    </>
  );
}

function Settings() {
  const router = useRouter();
  const [confirm, setConfirm] = useState<null | "content" | "media" | "progress">(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const download = async () => {
    const blob = new Blob([await repo.exportProgress()], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "workout-progress.json"; a.click(); URL.revokeObjectURL(a.href);
  };
  const restore = async (f: File | undefined) => {
    if (!f) return;
    try { const r = await repo.importProgress(JSON.parse(await f.text())); flash(`Restored ${r.runs} runs and ${r.progress} progress records`); await router.invalidate(); }
    catch (e) { flash(`Backup rejected: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const act = async () => {
    if (confirm === "progress") await repo.resetProgress();
    if (confirm === "media") { for (const p of await repo.listPrograms()) await deleteCachedMedia(repo, p.id); }
    if (confirm === "content") await repo.resetContent();
    setConfirm(null); flash("Done"); await router.invalidate();
  };
  const row = (title: string, sub: string, btn: ReactNode) => (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 first:border-t-0"><div className="flex flex-col gap-0.5"><span className="text-[15px] font-semibold">{title}</span><span className="text-[13px] text-muted-foreground">{sub}</span></div>{btn}</div>
  );
  return (
    <>
      <Heading title="Settings & data" sub="Progress, media, and imported content are stored separately on this device." />
      <section className={card("flex flex-col")}>
        {row("Export progress", "Download runs and session completion as JSON.", <Button variant="outline" onClick={download}>Export</Button>)}
        {row("Restore progress", "Import a previously exported file. Invalid files are rejected without changing data.", <><input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => restore(e.target.files?.[0])} /><Button variant="outline" onClick={() => fileRef.current?.click()}>Restore</Button></>)}
        {row("Delete media only", "Removes downloaded images/video. Workouts and progress stay.", <Button variant="outline" onClick={() => setConfirm("media")}>Delete media</Button>)}
        {row("Delete progress only", "Removes runs and completion history. Content stays.", <Button variant="outline" onClick={() => setConfirm("progress")}>Delete progress</Button>)}
        {row("Reset local content", "Removes imported programs from this device. Progress stays, keyed by stable session IDs.", <Button variant="outline" onClick={() => setConfirm("content")}>Reset content</Button>)}
      </section>
      <p className="text-[13px] text-muted-foreground">Browsers can evict local storage, especially Safari on iOS for sites not added to the Home Screen. Export your progress regularly; no storage is guaranteed indefinitely.</p>
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogPopup>
          <DialogHeader><DialogTitle>Are you sure?</DialogTitle><DialogDescription>This cannot be undone from this device.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="destructive" onClick={act}>Delete</Button></DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}

/* ---------------- Routes ---------------- */
const rootRoute = createRootRoute({ component: Shell, notFoundComponent: () => <NotFound what="Page" /> });
const libraryRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", loader: baseData, component: Library });
const groupRoute = createRoute({ getParentRoute: () => rootRoute, path: "/programs/$group", loader: baseData, component: ProgramList });
const programRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/program/$programId",
  loader: async ({ params }) => { const b = await baseData(); const program = b.programs.find((p) => p.id === params.programId); return { ...b, program, items: program ? await repo.getAllSessionItems(program.id) : new Map(), exerciseIndex: await repo.exerciseIndex() }; },
  component: ProgramOverview,
});
const weekRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/program/$programId/week/$weekId",
  loader: async ({ params }) => { const b = await baseData(); const program = b.programs.find((p) => p.id === params.programId); return { ...b, program, week: program?.weeks.find((w) => w.id === params.weekId) }; },
  component: WeekView,
});
const sessionRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/program/$programId/week/$weekId/session/$sessionId",
  loader: async ({ params }) => {
    const b = await baseData(); const program = b.programs.find((p) => p.id === params.programId);
    const week = program?.weeks.find((w) => w.id === params.weekId);
    const session = week?.sessions.find((s) => s.id === params.sessionId);
    return { ...b, program, week, session, items: program && session ? await repo.ensureSessionItems(program.id, session.id) : undefined, exerciseIndex: await repo.exerciseIndex() };
  },
  component: SessionView,
});
const downloadsRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/downloads",
  loader: async () => { const b = await baseData(); const itemsByProgram: Record<string, Map<string, Record<string, unknown>[]>> = {}; for (const p of b.programs) itemsByProgram[p.id] = await repo.getAllSessionItems(p.id); return { ...b, itemsByProgram, exerciseIndex: await repo.exerciseIndex() }; },
  component: Downloads,
});
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", loader: baseData, component: Settings });

export const routeTree = rootRoute.addChildren([libraryRoute, groupRoute, programRoute, weekRoute, sessionRoute, downloadsRoute, settingsRoute]);
export const router = createRouter({ routeTree, defaultPreload: "intent" });
declare module "@tanstack/react-router" { interface Register { router: typeof router } }
