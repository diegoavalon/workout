import { useState, type ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "../lib/utils";
import type { TimerOptionView } from "../domain/view-model";
import { ExerciseCountdown } from "./ExerciseCountdown";
import { SetTracker, type SetTracking } from "./SetTracker";
import { Badge } from "./ui/badge";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";

export type SupersetCardProps = {
  title: string;
  subtitle: string;
  notes?: string[];
  timers: TimerOptionView[];
  preferredTimerId: string | null;
  /** Round tracking supplied by the container; omit when there is no agreed round count. */
  tracking?: SetTracking;
  complete: boolean;
  children: (complete: boolean) => ReactNode;
};

/** Pure UI: renders a superset shell from props. Rounds, timers, and the preferred timer are derived by the view-model builder. */
export function SupersetCard({ title, subtitle, notes = [], timers, preferredTimerId, tracking, complete, children }: SupersetCardProps) {
  const preferredTimer = timers.find((timer) => timer.id === preferredTimerId) ?? timers[0];
  const [selectedTimerId, setSelectedTimerId] = useState(preferredTimer?.id);
  const selectedTimer = timers.find((timer) => timer.id === selectedTimerId) ?? preferredTimer;

  return (
    <section aria-label={title} data-completed={complete} className={cn("flex flex-col gap-1.5 rounded-3xl border bg-muted p-1.5 transition-colors", complete && "border-success/40")}>
      <header role="group" aria-label={`${title} tracking`} data-slot="superset-tracker" className="sticky top-15 z-10 flex flex-col gap-3 bg-muted px-3.5 py-3 shadow-xs/5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn("text-base font-semibold", complete && "text-success-foreground")}>{title}</h3>
            {complete && <Badge variant="success"><CheckIcon aria-hidden="true" />Completed</Badge>}
          </div>
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        </div>
        {notes.map((note) => <p key={note} className="text-[13px] leading-relaxed text-muted-foreground">{note}</p>)}
        {(tracking || selectedTimer) && (
          <div className="flex flex-wrap items-start gap-3">
            {tracking && (
              <div className="min-w-0 flex-[1_1_140px]">
                <SetTracker {...tracking} label={title} unit="Round" compact />
              </div>
            )}
            {selectedTimer && (
              <div className="w-36 min-w-0 shrink-0 sm:w-56">
                {timers.length > 1 ? (
                  <Select items={timers.map((t) => ({ value: t.id, label: `${t.label} · ${t.display}` }))} value={selectedTimer.id} onValueChange={(value) => { if (value) setSelectedTimerId(value); }}>
                    <SelectTrigger aria-label={`${title} timer prescription`} size="sm" className="min-w-0 text-xs sm:text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup alignItemWithTrigger={false}>
                      {timers.map((timer) => <SelectItem key={timer.id} value={timer.id}>{timer.label} · {timer.display}</SelectItem>)}
                    </SelectPopup>
                  </Select>
                ) : <p className="text-xs font-medium text-muted-foreground">{selectedTimer.label}</p>}
                <dl className="mt-1 rounded-lg border bg-card px-2 py-1 has-[[data-timer-completed=true]]:ring-1 has-[[data-timer-completed=true]]:ring-success/40">
                  <dt className="sr-only">{selectedTimer.label}</dt>
                  <ExerciseCountdown key={`${selectedTimer.id}:${selectedTimer.seconds}`} seconds={selectedTimer.seconds} label={selectedTimer.kind} />
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
