import { useState } from "react";
import { PlayIcon } from "lucide-react";
import { parseDelta, type DeltaLine } from "../domain/delta";
import type { Exercise } from "../domain/types";
import { deltaTextOf, fmtSeconds, notesOf, prescription, resolveExercise, sortItems, subAssignments, type RawItem } from "../domain/workout";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

export function DeltaView({ value }: { value: unknown }) {
  const lines = parseDelta(value);
  return (
    <div className="flex flex-col gap-2">
      {lines.map((ln: DeltaLine, i: number) => {
        if (!ln.segs.length) return null;
        const cls = ln.header === 1 ? "mt-2 font-heading text-[26px] font-bold leading-tight tracking-tight"
          : ln.header === 2 ? "mt-2 font-heading text-[22px] font-semibold leading-tight tracking-tight"
          : ln.header ? "mt-2 text-lg font-semibold leading-tight" : "text-[17px] leading-relaxed";
        const Tag = (ln.header ? `h${Math.min(ln.header + 1, 6)}` : "p") as "p";
        const inner = ln.segs.map((sg, k) => (
          <span key={k} className={cn(sg.bold && "font-semibold", sg.italic && "italic", sg.underline && "underline", sg.strike && "line-through", sg.embed && "font-mono text-sm text-muted-foreground")}
            style={sg.color ? { color: sg.color } : undefined}>{sg.text}</span>
        ));
        if (ln.list) return <div key={i} className={cn(cls, "flex gap-2 pl-4")}><span aria-hidden>{ln.list === "bullet" ? "•" : `${ln.number}.`}</span><span>{inner}</span></div>;
        return <Tag key={i} className={cn(cls, "text-pretty", ln.align === "center" && "text-center", ln.indent && `pl-${ln.indent * 4}`)}>{inner}</Tag>;
      })}
    </div>
  );
}

function ExerciseCard({ item, label, index, nested }: { item: RawItem; label: string; index: Map<string, Exercise>; nested?: boolean }) {
  const ex = resolveExercise(item, index);
  const [showVideo, setShowVideo] = useState(false);
  const presc = prescription(item);
  const notes = notesOf(item);
  const mediaUrl = showVideo && ex?.videoUrl ? ex.videoUrl : ex?.imageUrl ?? ex?.thumbnail;
  return (
    <article className={cn("flex flex-wrap overflow-hidden border bg-card rounded-2xl", !nested && "shadow-xs/5")} aria-label={ex?.title ?? "Unknown exercise"}>
      <div className="relative flex min-h-42 flex-[1_1_220px] flex-col items-start justify-between gap-2 bg-muted p-3">
        {mediaUrl && !showVideo ? <img src={mediaUrl} alt={ex?.title ?? ""} loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : null}
        {showVideo && ex?.videoUrl ? <video src={ex.videoUrl} controls preload="metadata" className="absolute inset-0 h-full w-full object-cover" aria-label={`${ex.title} instructional video`} /> : null}
        <span className="relative font-mono text-[11px] text-muted-foreground">{ex ? (ex.videoUrl ? "exercise media" : "exercise image") : "media unavailable"}</span>
        {ex?.videoUrl && (
          <Button variant="outline" size="sm" className="relative min-h-11" onClick={() => setShowVideo((v) => !v)} aria-pressed={showVideo}>
            <PlayIcon className="size-3 fill-current" />{showVideo ? "Hide video" : "Watch video"}
          </Button>
        )}
      </div>
      <div className={cn("flex flex-[999_1_280px] flex-col gap-3 p-5", nested && "p-4")}>
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px] font-medium text-muted-foreground">{label}</span>
          <h3 className="font-heading text-[21px] font-semibold tracking-tight">{ex?.title ?? "Unknown exercise"}</h3>
        </div>
        {!ex && <p className="text-sm text-warning-foreground">This exercise was not found in the library. The prescription is shown as written.</p>}
        {presc.length > 0 && (
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(84px,1fr))] gap-2">
            {presc.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 rounded-[10px] bg-muted px-3 py-2.5">
                <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
                <dd className="text-2xl font-semibold tracking-tight tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
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
        if (item.type === "exerciseAssignment") { letterIdx++; return <ExerciseCard key={key} item={item} label={letter(letterIdx)} index={exerciseIndex} />; }
        if (item.type === "groupedAssignment") {
          const subs = subAssignments(item);
          const isSection = !!item.isSection;
          const isSuperset = !!item.isSuperset;
          letterIdx++;
          const lt = letter(letterIdx);
          return (
            <section key={key} className={cn("flex flex-col gap-1.5", !isSection && "rounded-3xl border bg-muted p-1.5")} aria-label={typeof item.title === "string" ? item.title : isSuperset ? `Superset ${lt}` : `Group ${lt}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-3 px-3.5 pt-2.5 pb-1.5">
                <h3 className="text-base font-semibold">{typeof item.title === "string" && item.title ? item.title : isSuperset ? `Superset ${lt}` : `Group ${lt}`}</h3>
                <span className="text-[13px] text-muted-foreground">
                  {isSection ? `${subs.length} exercises · in order` : isSuperset ? `Alternate exercises${typeof item.rest === "number" ? ` · rest ${fmtSeconds(item.rest)} after each round` : ""}` : "Complete in order"}
                </span>
              </div>
              {isSection
                ? subs.map((sa, j) => <ExerciseCard key={String(sa.itemId ?? j)} item={sa} label={String(j + 1)} index={exerciseIndex} nested />)
                : subs.map((sa, j) => <ExerciseCard key={String(sa.itemId ?? j)} item={sa} label={lt + (j + 1)} index={exerciseIndex} nested />)}
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
