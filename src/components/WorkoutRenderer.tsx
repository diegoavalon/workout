import { useState } from "react";
import { CheckIcon, ClockIcon, DumbbellIcon, PlayIcon, RepeatIcon } from "lucide-react";
import { parseDelta, type DeltaLine } from "../domain/delta";
import type { Exercise } from "../domain/types";
import { deltaTextOf, fmtSeconds, notesOf, prescription, resolveExercise, sortItems, subAssignments, type RawItem } from "../domain/workout";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ExerciseCountdown } from "./ExerciseCountdown";
import { SetTracker, type SetTracking } from "./SetTracker";
import { SupersetCard } from "./SupersetCard";
import { cn } from "../lib/utils";

function noteMetricIcon(line: DeltaLine) {
  if (line.header || line.list || line.indent || line.align && line.align !== "left" || line.segs.some((seg) => seg.embed)) return null;
  const text = line.segs.map((seg) => seg.text).join("").trim();
  if (/^\d+(?:\s*[-–]\s*\d+)?\s*(?:sets?|rounds?|reps?)$/i.test(text)) return RepeatIcon;
  if (/^\d+(?:\s*[-–]\s*\d+)?\s*(?:min(?:ute)?s?|sec(?:ond)?s?)$/i.test(text)
    || /^every\s+\d+\s*(?:min(?:ute)?s?|sec(?:ond)?s?)(?:\s*[x×]\s*\d+\s*(?:sets?|rounds?))?$/i.test(text)
    || /^for time$/i.test(text)) return ClockIcon;
  return null;
}

export function DeltaView({ value }: { value: unknown }) {
  const lines = parseDelta(value);
  // Only heading-and-metadata summaries use tiles; detailed instructions stay prose.
  const isSummary = lines.some((line) => !!line.header)
    && lines.every((line) => !line.segs.length || !!line.header || noteMetricIcon(line) !== null);
  return (
    <div className="flex flex-wrap items-start gap-2 text-foreground">
      {lines.map((ln: DeltaLine, i: number) => {
        if (!ln.segs.length) return null;
        const cls = ln.header === 1 ? "mt-2 font-heading text-[26px] font-bold leading-tight tracking-tight"
          : ln.header === 2 ? "mt-2 font-heading text-[22px] font-semibold leading-tight tracking-tight"
          : ln.header ? "mt-2 text-lg font-semibold leading-tight" : "text-[17px] leading-relaxed";
        const Tag = (ln.header ? `h${Math.min(ln.header + 1, 6)}` : "p") as "p";
        const inner = ln.segs.map((sg, k) => (
          <span key={k} className={cn(sg.bold && "font-semibold", sg.italic && "italic", sg.underline && "underline", sg.strike && "line-through", sg.embed && "font-mono text-sm text-muted-foreground")}
            style={sg.color && !/^(?:#000(?:000)?|#fff(?:fff)?|black|white)$/i.test(sg.color) ? { color: sg.color } : undefined}>{sg.text}</span>
        ));
        const MetricIcon = isSummary ? noteMetricIcon(ln) : null;
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

type ExerciseCardProps = { item: RawItem; label: string; index: Map<string, Exercise>; nested?: boolean };

function TrackedExercise(props: ExerciseCardProps) {
  const [completedSets, setCompletedSets] = useState<string[]>([]);
  const sets = props.item.sets;
  const count = typeof sets === "number" && Number.isSafeInteger(sets) && sets > 0 ? sets : 0;
  return <ExerciseCard {...props} tracking={{ count, completed: completedSets, onChange: setCompletedSets }} complete={count > 0 && completedSets.length === count} />;
}

function ExerciseCard({ item, label, index, nested, tracking, complete = false }: ExerciseCardProps & { tracking?: SetTracking; complete?: boolean }) {
  const ex = resolveExercise(item, index);
  const [showVideo, setShowVideo] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const presc = prescription(item).filter(([key]) => tracking || key !== "Sets");
  const time = item.times ?? item.durationSeconds ?? item.seconds;
  const rest = item.rest ?? item.restSeconds;
  const notes = notesOf(item);
  const mediaUrl = showVideo && ex?.videoUrl ? ex.videoUrl : ex?.imageUrl ?? ex?.thumbnail;
  return (
    <article className={cn("isolate flex flex-wrap overflow-hidden border bg-card rounded-2xl transition-colors", !nested && "shadow-xs/5", complete && "border-success/40 bg-success/4")} aria-label={ex?.title ?? "Unknown exercise"} data-completed={complete}>
      <div className="relative min-h-42 flex-[1_1_220px] overflow-hidden bg-muted">
        {mediaUrl && !showVideo ? <img src={mediaUrl} alt={ex?.title ?? ""} loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={() => setImgFailed(true)} /> : null}
        {!showVideo && (!mediaUrl || imgFailed) && <MediaPlaceholder title={ex?.title} />}
        {showVideo && ex?.videoUrl ? <video src={ex.videoUrl} controls autoPlay playsInline preload="metadata" poster={ex.imageUrl ?? ex.thumbnail} className="absolute inset-0 h-full w-full bg-black object-contain" aria-label={`${ex.title} instructional video`} /> : null}
        {ex?.videoUrl && (
          <Button variant="outline" size="sm" className={cn("absolute z-10 min-h-11", showVideo ? "top-2 right-2" : "bottom-2 left-2")} onClick={() => setShowVideo((v) => !v)} aria-pressed={showVideo}>
            <PlayIcon className="size-3 fill-current" />{showVideo ? "Hide video" : "Watch video"}
          </Button>
        )}
      </div>
      <div className={cn("flex flex-[999_1_280px] flex-col gap-3 p-5", nested && "p-4")}>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px] font-medium text-muted-foreground">{label}</span>
          <h3 className={cn("flex-1 font-heading text-[21px] font-semibold tracking-tight", complete && "text-success-foreground")}>{ex?.title ?? "Unknown exercise"}</h3>
          {complete && tracking && <Badge variant="success"><CheckIcon aria-hidden="true" />Completed</Badge>}
        </div>
        {!ex && <p className="text-sm text-warning-foreground">This exercise was not found in the library. The prescription is shown as written.</p>}
        {presc.length > 0 && (
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(90px,1fr))] gap-2">
            {presc.map(([k, v]) => {
              const seconds = k === "Time" ? time : k === "Rest" ? rest : null;
              return (
                <div key={k} className="flex flex-col gap-0.5 rounded-[10px] bg-muted px-3 py-2.5 has-[[data-timer-completed=true]]:ring-1 has-[[data-timer-completed=true]]:ring-success/40">
                  <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
                  {tracking && typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
                    ? <ExerciseCountdown key={seconds} seconds={seconds} label={k} />
                    : <dd className="text-2xl font-semibold tracking-tight tabular-nums">{v}</dd>}
                </div>
              );
            })}
          </dl>
        )}
        {tracking && tracking.count > 0 && (
          <div className="border-t pt-3">
            <SetTracker {...tracking} label={ex?.title ?? "Unknown exercise"} />
          </div>
        )}
        {notes && <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">{notes}</p>}
      </div>
    </article>
  );
}

/** The one renderer for every program, week, and frequency group. */
export function WorkoutRenderer({ items, exerciseIndex }: { items: Record<string, unknown>[]; exerciseIndex: Map<string, Exercise> }) {
  let letterIdx = 0;
  const letter = (i: number) => String.fromCharCode(64 + i);
  return (
    <div className="flex flex-col gap-7">
      {sortItems(items as RawItem[]).map((raw, i) => {
        const item = raw as RawItem;
        const key = String(item.itemId ?? i);
        if (item.type === "richText" || item.type === "text" || deltaTextOf(item) != null && item.type !== "exerciseAssignment" && item.type !== "groupedAssignment") {
          return <section key={key} aria-label="Coach notes"><DeltaView value={deltaTextOf(item)} /></section>;
        }
        if (item.type === "exerciseAssignment") { letterIdx++; return <TrackedExercise key={key} item={item} label={letter(letterIdx)} index={exerciseIndex} />; }
        if (item.type === "groupedAssignment") {
          const subs = subAssignments(item);
          const isSection = !!item.isSection;
          const isSuperset = !!item.isSuperset;
          letterIdx++;
          const lt = letter(letterIdx);
          if (isSuperset && !isSection) return (
            <SupersetCard key={key} item={item} exercises={subs} label={lt}>
              {(complete) => subs.map((sa, j) => <ExerciseCard key={String(sa.itemId ?? j)} item={sa} label={lt + (j + 1)} index={exerciseIndex} nested complete={complete} />)}
            </SupersetCard>
          );
          return (
            <section key={key} className={cn("flex flex-col gap-1.5", !isSection && "rounded-3xl border bg-muted p-1.5")} aria-label={typeof item.title === "string" ? item.title : isSuperset ? `Superset ${lt}` : `Group ${lt}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-3 px-3.5 pt-2.5 pb-1.5">
                <h3 className="text-base font-semibold">{typeof item.title === "string" && item.title ? item.title : isSuperset ? `Superset ${lt}` : `Group ${lt}`}</h3>
                <span className="text-[13px] text-muted-foreground">
                  {isSection ? `${subs.length} exercises · in order` : isSuperset ? `Alternate exercises${typeof item.rest === "number" ? ` · rest ${fmtSeconds(item.rest)} after each round` : ""}` : "Complete in order"}
                </span>
              </div>
              {isSection
                ? subs.map((sa, j) => <TrackedExercise key={String(sa.itemId ?? j)} item={sa} label={String(j + 1)} index={exerciseIndex} nested />)
                : subs.map((sa, j) => <TrackedExercise key={String(sa.itemId ?? j)} item={sa} label={lt + (j + 1)} index={exerciseIndex} nested />)}
            </section>
          );
        }
        return (
          <div key={key} className="rounded-2xl border bg-card p-5">
            <Badge variant="secondary">Unsupported block</Badge>
            <p className="mt-2 text-[15px] text-muted-foreground">This part of the workout ({String(item.type ?? "unknown")}) could not be displayed, but the rest of the session is unaffected.</p>
          </div>
        );
      })}
    </div>
  );
}
