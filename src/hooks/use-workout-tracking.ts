import { useCallback, useState } from "react";

/**
 * Session tracking state (completed sets/rounds, keyed by view-model key).
 * This is the only workout state the rendering container owns; pure UI
 * components receive `completed`/`onChange` through props.
 */
export function useWorkoutTracking() {
  const [tracking, setTracking] = useState<Record<string, string[]>>({});
  const onTrackingChange = useCallback((key: string, value: string[]) => {
    setTracking((prev) => ({ ...prev, [key]: value }));
  }, []);
  return { tracking, onTrackingChange };
}

export type WorkoutTracking = ReturnType<typeof useWorkoutTracking>;
