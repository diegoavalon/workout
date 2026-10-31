import { useEffect, useState } from "react";
import { PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { fmtSeconds } from "../domain/workout";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

/** A reusable, local countdown for a work or rest prescription, in seconds. */
export function ExerciseCountdown({ seconds, label }: { seconds: number; label: string }) {
  const durationMs = seconds * 1000;
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [deadline, setDeadline] = useState<number | null>(null);
  const running = deadline !== null;
  const finished = remainingMs === 0;
  const started = running || remainingMs !== durationMs;
  const action = running ? "Pause" : finished ? "Restart" : started ? "Resume" : "Start";

  useEffect(() => {
    if (deadline === null) return;
    // Use elapsed wall time so a backgrounded tab catches up when it returns.
    const update = () => {
      const remaining = Math.max(0, deadline - Date.now());
      setRemainingMs(remaining);
      if (remaining === 0) setDeadline(null);
    };
    update();
    const interval = window.setInterval(update, 200);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, [deadline]);

  const toggle = () => {
    if (deadline !== null) {
      setRemainingMs(Math.max(0, deadline - Date.now()));
      setDeadline(null);
    } else {
      const remaining = remainingMs > 0 ? remainingMs : durationMs;
      setRemainingMs(remaining);
      setDeadline(Date.now() + remaining);
    }
  };

  const reset = () => {
    setDeadline(null);
    setRemainingMs(durationMs);
  };

  return (
    <dd className="flex min-h-8 flex-wrap items-center justify-between gap-x-1" data-timer-completed={finished}>
      <span role="timer" aria-label={`${label} countdown`} aria-live="off" className={cn("text-2xl font-semibold tracking-tight tabular-nums", finished && "text-success-foreground")}>
        {fmtSeconds(Math.ceil(remainingMs / 1000))}
      </span>
      <div className="flex shrink-0 items-center">
        <Button variant="ghost" size="icon-xs" onClick={toggle} aria-label={`${action} ${label.toLowerCase()} timer`} title={action}>
          {running ? <PauseIcon className="size-3.5" aria-hidden="true" /> : <PlayIcon className="size-3.5" aria-hidden="true" />}
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={reset} disabled={!started} aria-label={`Reset ${label.toLowerCase()} timer`} title="Reset">
          <RotateCcwIcon className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      <span role="status" className="sr-only">{finished ? "Time’s up" : ""}</span>
    </dd>
  );
}
