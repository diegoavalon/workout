import { useMemo, useState } from "react";
import { CheckIcon, ClockIcon, DumbbellIcon, PlayIcon, RepeatIcon } from "lucide-react";
import type { Exercise } from "../domain/types";
import { buildWorkoutView, type BlockView, type ExerciseView, type NotesLineView, type WorkoutView } from "../domain/view-model";
import { useWorkoutTracking, type WorkoutTracking } from "../hooks/use-workout-tracking";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ExerciseCountdown } from "./ExerciseCountdown";
import { SetTracker, type SetTracking } from "./SetTracker";
import { SupersetCard } from "./SupersetCard";
import { cn } from "../lib/utils";

/* ---------------- Pure UI components (props in, markup out) ---------------- */

function lineClassName(header: number | undefined): string {
  if (header === 1) return "mt-2 font-heading text-[26px] font-bold leading-tight tracking-tight";
  if (header === 2) return "mt-2 font-heading text-[22px] font-semibold leading-tight tracking-tight";
  if (header) return "mt-2 text-lg font-semibold leading-tight";
  return "text-[17px] leading-relaxed";
}

export function DeltaView({ lines, isSummary }: { lines: NotesLineView[]; isSummary: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-2 text-foreground">
      {lines.map(({ line: ln, metric }, i) => {
        if (!ln.segs.length) return null;
        const cls = lineClassName(ln.header);
        const Tag = (ln.header ? `h${Math.min(ln.header + 1, 6)}` : "p") as "p";
        const inner = ln.segs.map((sg, k) => (
          <span key={k} className={cn(sg.bold && "font-semibold", sg.italic && "italic", sg.underline && "underline", sg.strike && "line-through", sg.embed && "font-mono text-sm text-muted-foreground")}
            style={sg.color && !/^(?:#000(?:000)?|#fff(?:fff)?|black|white)$/i.test(sg.color) ? { color: sg.color } : undefined}>{sg.text}</span>
        ));
        const MetricIcon = isSummary && metric ? (metric === "repeat" ? RepeatIcon : ClockIcon) : null;
        if (MetricIcon) return (
          <Badge key={i} variant="secondary" render={<p />} className="h-auto min-h-9 max-w-full shrink gap-2 rounded-lg px-3 py-1.5 text-sm/5 whitespace-normal sm:h-auto sm:text-sm/5">
            <MetricIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <span>{inner}</span>
          </Badge>
        );
        if (ln.list) return <div key={i} className={cn(cls, "flex basis-full gap-2 pl-4")}><span aria-hidden>{ln.list === "bullet" ? "•" : `${ln.number}.`}</span><span>{inner}</span></div>;
        return <Tag key={i} className={cn(cls, "basis-full text-pretty", ln.align === "center" && "text-center", ln.indent && `pl-${ln.indent * 4}`)}>{inner}</Tag>;
      })}
    </div>
  );
}

export function MediaPlaceholder({ title }: { title?: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted text-muted-foreground" role="img" aria-label={title ? `No media for ${title}` : "No media available"}>
      <DumbbellIcon className="size-10 opacity-40" aria-hidden />
      <span className="text-[13px] font-medium">No media available</span>
    </div>
  );
}

export type ExerciseCardProps = {
  exercise: ExerciseView;
  nested?: boolean;
  tracking?: SetTracking;
  complete?: boolean;
};

/** Pure UI: every displayed value arrives via `exercise`; only video/image toggle state is local. */
export function ExerciseCard({ exercise, nested, tracking, complete = false }: ExerciseCardProps) {
  const [showVideo, setShowVideo] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <article className={cn("isolate flex flex-wrap overflow-hidden border bg-card rounded-2xl transition-colors", !nested && "shadow-xs/5", complete && "border-success/40 bg-success/4")} aria-label={exercise.title} data-completed={complete}>
      <div className="relative min-h-42 flex-[1_1_220px] overflow-hidden bg-muted">
        {exercise.imageUrl && !showVideo ? <img src={exercise.imageUrl} alt={exercise.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={() => setImgFailed(true)} /> : null}
        {!showVideo && (!exercise.imageUrl || imgFailed) && <MediaPlaceholder title={exercise.title} />}
        {showVideo && exercise.videoUrl ? <video src={exercise.videoUrl} controls autoPlay playsInline preload="metadata" poster={exercise.posterUrl ?? undefined} className="absolute inset-0 h-full w-full bg-black object-contain" aria-label={`${exercise.title} instructional video`} /> : null}
        {exercise.videoUrl && (
          <Button variant="outline" size="sm" className={cn("absolute z-10 min-h-11", showVideo ? "top-2 right-2" : "bottom-2 left-2")} onClick={() => setShowVideo((v) => !v)} aria-pressed={showVideo}>
            <PlayIcon className="size-3 fill-current" />{showVideo ? "Hide video" : "Watch video"}
          </Button>
        )}
      </div>
      <div className={cn("flex flex-[999_1_280px] flex-col gap-3 p-5", nested && "p-4")}>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px] font-medium text-muted-foreground">{exercise.label}</span>
          <h3 className={cn("flex-1 font-heading text-[21px] font-semibold tracking-tight", complete && "text-success-foreground")}>{exercise.title}</h3>
          {complete && tracking && <Badge variant="success"><CheckIcon aria-hidden="true" />Completed</Badge>}
        </div>
        {!exercise.known && <p className="text-sm text-warning-foreground">This exercise was not found in the library. The prescription is shown as written.</p>}
        {exercise.metrics.length > 0 && (
          <dl className={`grid gap-2 ${exercise.metrics.length === 4 ? "grid-cols-2" : "grid-cols-[repeat(auto-fit,minmax(90px,1fr))]"}`}>
            {exercise.metrics.map((metric) => (
              <div key={metric.key} className="flex flex-col gap-0.5 rounded-[10px] bg-muted px-3 py-2.5 has-[[data-timer-completed=true]]:ring-1 has-[[data-timer-completed=true]]:ring-success/40">
                <dt className="text-xs font-medium text-muted-foreground">{metric.label}</dt>
                {tracking && metric.timerSeconds !== null
                  ? <ExerciseCountdown key={metric.timerSeconds} seconds={metric.timerSeconds} label={metric.label} />
                  : <dd className="text-2xl font-semibold tracking-tight tabular-nums">{metric.value}</dd>}
              </div>
            ))}
          </dl>
        )}
        {exercise.setDetails.length > 0 && (
          <ul className="flex flex-col gap-1 text-[14px] text-muted-foreground">
            {exercise.setDetails.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        )}
        {tracking && tracking.count > 0 && (
          <div className="border-t pt-3">
            <SetTracker {...tracking} label={exercise.title} />
          </div>
        )}
        {exercise.notes && <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">{exercise.notes}</p>}
      </div>
    </article>
  );
}

function trackingFor(exercise: ExerciseView, { tracking, onTrackingChange }: WorkoutTracking): SetTracking | undefined {
  if (exercise.trackingCount <= 0) return undefined;
  const completed = tracking[exercise.key] ?? [];
  return { count: exercise.trackingCount, completed, onChange: (value: string[]) => onTrackingChange(exercise.key, value) };
}
const isComplete = (t: SetTracking | undefined) => !!t && t.count > 0 && t.completed.length === t.count;

/**
 * Standalone and section cards are a tracked context: they always receive a
 * tracking object so timed metrics get countdowns, even when the view model
 * found no countable sets (the tracker itself renders only when count > 0).
 * Superset-nested cards receive no tracking and stay passive.
 */
function cardTracking(exercise: ExerciseView, state: WorkoutTracking): SetTracking {
  return trackingFor(exercise, state) ?? { count: 0, completed: [], onChange: () => {} };
}

/** Pure UI: renders a root `WorkoutView` with tracking supplied by the container. */
export function WorkoutBlocks({ view, tracking, onTrackingChange }: { view: WorkoutView } & WorkoutTracking) {
  const state: WorkoutTracking = { tracking, onTrackingChange };
  return (
    <div className="flex flex-col gap-7">
      {view.blocks.map((block) => <div key={block.key} id={block.key} className="scroll-mt-32"><Block block={block} state={state} /></div>)}
    </div>
  );
}

function Block({ block, state }: { block: BlockView; state: WorkoutTracking }) {
  switch (block.kind) {
    case "richText":
      return <section aria-label="Coach notes"><DeltaView lines={block.lines} isSummary={block.isSummary} /></section>;
    case "notes":
      return (
        <section aria-label={block.title ?? "Notes"} className="flex flex-col gap-1.5">
          {block.title && <h3 className="text-base font-semibold">{block.title}</h3>}
          {block.lines.map((line) => <p key={line} className="text-[15px] leading-relaxed text-muted-foreground">{line}</p>)}
        </section>
      );
    case "exercise": {
      const tracking = trackingFor(block.exercise, state);
      return <ExerciseCard exercise={block.exercise} tracking={cardTracking(block.exercise, state)} complete={isComplete(tracking)} />;
    }
    case "superset": {
      const completed = state.tracking[block.key] ?? [];
      const tracking: SetTracking | undefined = block.roundCount > 0
        ? { count: block.roundCount, completed, onChange: (value: string[]) => state.onTrackingChange(block.key, value) }
        : undefined;
      const complete = isComplete(tracking);
      return (
        <SupersetCard title={block.title} subtitle={block.subtitle} notes={block.notes} timers={block.timers} preferredTimerId={block.preferredTimerId} tracking={tracking} complete={complete}>
          {(groupComplete) => block.exercises.map((exercise) => (
            <ExerciseCard key={exercise.key} exercise={exercise} nested complete={groupComplete} />
          ))}
        </SupersetCard>
      );
    }
    case "section":
      return (
        <section className={cn("flex flex-col gap-1.5", block.framed && "rounded-3xl border bg-muted p-1.5")} aria-label={block.ariaLabel}>
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-3.5 pt-2.5 pb-1.5">
            <h3 className="text-base font-semibold">{block.title}</h3>
            <span className="text-[13px] text-muted-foreground">{block.subtitle}</span>
          </div>
          {block.notes.map((note) => <p key={note} className="px-3.5 text-[13px] leading-relaxed text-muted-foreground">{note}</p>)}
          {block.exercises.map((exercise) => {
            const tracking = trackingFor(exercise, state);
            return <ExerciseCard key={exercise.key} exercise={exercise} nested tracking={cardTracking(exercise, state)} complete={isComplete(tracking)} />;
          })}
        </section>
      );
    case "unsupported":
      return (
        <div className="rounded-2xl border bg-card p-5">
          <Badge variant="secondary">Unsupported block</Badge>
          <p className="mt-2 text-[15px] text-muted-foreground">This part of the workout ({block.typeLabel}) could not be displayed, but the rest of the session is unaffected.</p>
        </div>
      );
  }
}

/* ---------------- Container (state + view-model wiring only) ---------------- */

/** Container for legacy session items: builds the root view model and owns tracking state. */
export function WorkoutRenderer({ items, exerciseIndex }: { items: Record<string, unknown>[]; exerciseIndex: Map<string, Exercise> }) {
  const view = useMemo(() => buildWorkoutView(items, exerciseIndex), [items, exerciseIndex]);
  const trackingState = useWorkoutTracking();
  return <WorkoutBlocks view={view} {...trackingState} />;
}
