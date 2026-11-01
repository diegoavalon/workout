import { useMemo } from "react";
import type { Exercise } from "../domain/types";
import { buildGeneratedDayView, buildGeneratedProgramView, type GeneratedDay, type GeneratedProgram, type GeneratedProgramView, type SessionView } from "../domain/generated";
import { useWorkoutTracking, type WorkoutTracking } from "../hooks/use-workout-tracking";
import { Badge } from "./ui/badge";
import { WorkoutBlocks } from "./WorkoutRenderer";

/** Pure UI: renders one generated day from its root `SessionView` model. */
export function GeneratedSessionView({ session, tracking, onTrackingChange }: { session: SessionView } & WorkoutTracking) {
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2.5">
        <span className="text-[15px] font-semibold text-muted-foreground">{session.dayLabel} · {session.date}</span>
        <h1 className="font-heading text-[clamp(30px,5vw,40px)] leading-[1.08] font-bold tracking-tight text-balance">{session.title}</h1>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {session.badges.map((badge) => <Badge key={badge} variant="outline" size="lg">{badge}</Badge>)}
        </div>
      </div>
      <WorkoutBlocks view={session} tracking={tracking} onTrackingChange={onTrackingChange} />
    </div>
  );
}

/** Pure UI: renders a whole generated program from its root `GeneratedProgramView` model. */
export function GeneratedProgramViewComponent({ program, tracking, onTrackingChange }: { program: GeneratedProgramView } & WorkoutTracking) {
  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-heading text-[clamp(30px,5vw,40px)] leading-[1.08] font-bold tracking-tight text-balance">{program.title}</h1>
      {program.weeks.map((week) => (
        <section key={week.key} aria-label={week.label} className="flex flex-col gap-7">
          <h2 className="text-lg font-semibold">{week.label}</h2>
          {week.days.map((day) => (
            <GeneratedSessionView key={day.key} session={day} tracking={tracking} onTrackingChange={onTrackingChange} />
          ))}
        </section>
      ))}
    </div>
  );
}

/** Container for a generated day: builds the root view model and owns tracking state. */
export function GeneratedWorkoutRenderer({ day, exerciseIndex }: { day: GeneratedDay; exerciseIndex?: Map<string, Exercise> }) {
  const session = useMemo(() => buildGeneratedDayView(day, exerciseIndex), [day, exerciseIndex]);
  const trackingState = useWorkoutTracking();
  return <GeneratedSessionView session={session} {...trackingState} />;
}

/** Container for a generated program file: builds the root view model and owns tracking state. */
export function GeneratedProgramRenderer({ program, exerciseIndex }: { program: GeneratedProgram; exerciseIndex?: Map<string, Exercise> }) {
  const view = useMemo(() => buildGeneratedProgramView(program, exerciseIndex), [program, exerciseIndex]);
  const trackingState = useWorkoutTracking();
  return <GeneratedProgramViewComponent program={view} {...trackingState} />;
}
