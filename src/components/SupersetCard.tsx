import { useState, type ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { fmtSeconds, type RawItem } from "../domain/workout";
import { cn } from "../lib/utils";
import { ExerciseCountdown } from "./ExerciseCountdown";
import { SetTracker } from "./SetTracker";
import { Badge } from "./ui/badge";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";

type GroupTimer = { value: string; label: string; seconds: number; kind: "Time" | "Rest" };
const countOf = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
const positiveSeconds = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

function roundCount(item: RawItem, exercises: RawItem[]) {
  const prescribed = countOf(item.sets ?? item.rounds);
  if (prescribed) return prescribed;
  // Older imports only prescribe sets on the exercises. Use a shared count when they agree.
  const counts = exercises.map((exercise) => countOf(exercise.sets));
  return counts.length > 0 && counts.every((count) => count === counts[0]) ? counts[0] : 0;
}

function timerOptions(item: RawItem, exercises: RawItem[], label: string): GroupTimer[] {
  const timers: GroupTimer[] = [];
  const roundRest = item.rest ?? item.restSeconds;
  const roundTime = item.times ?? item.durationSeconds ?? item.seconds;
  if (positiveSeconds(roundRest)) timers.push({ value: "round-rest", label: "Rest after round", seconds: roundRest, kind: "Rest" });
  if (positiveSeconds(roundTime)) timers.push({ value: "round-time", label: "Round time", seconds: roundTime, kind: "Time" });
  exercises.forEach((exercise, i) => {
    const time = exercise.times ?? exercise.durationSeconds ?? exercise.seconds;
    const rest = exercise.rest ?? exercise.restSeconds;
    const last = i === exercises.length - 1;
    if (positiveSeconds(time)) timers.push({ value: `${i}-time`, label: `Time for ${label}${i + 1}`, seconds: time, kind: "Time" });
    if (positiveSeconds(rest) && !(last && rest === roundRest)) {
      timers.push({ value: `${i}-rest`, label: last && !positiveSeconds(roundRest) ? "Rest after round" : `Rest after ${label}${i + 1}`, seconds: rest, kind: "Rest" });
    }
  });
  return timers;
}

export function SupersetCard({ item, exercises, label, children }: { item: RawItem; exercises: RawItem[]; label: string; children: (complete: boolean) => ReactNode }) {
  const title = typeof item.title === "string" && item.title.trim() ? item.title : `Superset ${label}`;
  const count = roundCount(item, exercises);
  const [completedRounds, setCompletedRounds] = useState<string[]>([]);
  const complete = count > 0 && completedRounds.length === count;
  const timers = timerOptions(item, exercises, label);
  const preferredTimer = timers.find((timer) => timer.label === "Rest after round") ?? timers.find((timer) => timer.kind === "Rest") ?? timers[0];
  const [selectedTimerId, setSelectedTimerId] = useState(preferredTimer?.value);
  const selectedTimer = timers.find((timer) => timer.value === selectedTimerId) ?? preferredTimer;

  return (
    <section aria-label={title} data-completed={complete} className={cn("flex flex-col gap-1.5 rounded-3xl border bg-muted p-1.5 transition-colors", complete && "border-success/40")}>
      <header role="group" aria-label={`${title} tracking`} data-slot="superset-tracker" className="sticky top-15 z-10 flex flex-col gap-3 bg-muted px-3.5 py-3 shadow-xs/5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn("text-base font-semibold", complete && "text-success-foreground")}>{title}</h3>
            {complete && <Badge variant="success"><CheckIcon aria-hidden="true" />Completed</Badge>}
          </div>
          <span className="text-xs text-muted-foreground">Alternate exercises</span>
        </div>
        {(count > 0 || selectedTimer) && (
          <div className="flex flex-wrap items-start gap-3">
            {count > 0 && (
              <div className="min-w-0 flex-[1_1_140px]">
                <SetTracker count={count} completed={completedRounds} onChange={setCompletedRounds} label={title} unit="Round" compact />
              </div>
            )}
            {selectedTimer && (
              <div className="w-36 min-w-0 shrink-0 sm:w-56">
                {timers.length > 1 ? (
                  <Select items={timers} value={selectedTimer.value} onValueChange={(value) => { if (value) setSelectedTimerId(value); }}>
                    <SelectTrigger aria-label={`${title} timer prescription`} size="sm" className="min-w-0 text-xs sm:text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup alignItemWithTrigger={false}>
                      {timers.map((timer) => <SelectItem key={timer.value} value={timer.value}>{timer.label} · {fmtSeconds(timer.seconds)}</SelectItem>)}
                    </SelectPopup>
                  </Select>
                ) : <p className="text-xs font-medium text-muted-foreground">{selectedTimer.label}</p>}
                <dl className="mt-1 rounded-lg border bg-card px-2 py-1 has-[[data-timer-completed=true]]:ring-1 has-[[data-timer-completed=true]]:ring-success/40">
                  <dt className="sr-only">{selectedTimer.label}</dt>
                  <ExerciseCountdown key={`${selectedTimer.value}:${selectedTimer.seconds}`} seconds={selectedTimer.seconds} label={selectedTimer.kind} />
                </dl>
              </div>
            )}
          </div>
        )}
      </header>
      {children(complete)}
    </section>
  );
}
