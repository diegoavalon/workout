/** Presentation-only formatting helpers for UI components. */
export const fmtSeconds = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
