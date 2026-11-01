import { describe, expect, it } from "vitest";
import { parseItem, parsePrintedDate, parseQuantity, parseWeekText, trackFromName } from "./parse.ts";

// Excerpts of real sessions: October 2026 (Week 4), January 2026 (Week 3), and March 2026 (Week 1).
const OCT_DAY1 = `A) Daily Focus Notes:
Hollow Body Rock + Suitcase Calf Raise
The rock only works if your lower back stays glued to the floor.
Short on time? Remove Finisher

B) Warmup (8 min):
2 min Cardio of Choice
3 Sets
1. Banded Reverse Nordics; 6-8 reps
2. Ring Assisted Cossack Squat; 6 reps/side

C) Strength Intensity (15 min):
Back Squat
3 Working Sets; rest 2-3 min
Warm-Up Set - 10 reps @20X1 Tempo - Easy
Working Set 1 - 9 reps @20X1 Tempo - RPE 7
Working Set 2 - 7 reps @20X1 Tempo - RPE 8
Working Set 3 - 5 reps @20X1 Tempo - RPE 9
RPE = Rate of Perceived Exertion - scale of 10, where 10 is form failure.

E) Strength Balance (12 min):
3 sets
1. Barbell Hip Thrust; 10-12 reps @21X1 Tempo
rest 60 sec
2. Bent Knee Copenhagen Raise; 6-10 reps/side @20X0 Tempo
rest 60-90 sec and back to 1.
Loading Note:
Perform 1-2 warmup sets to determine starting weight. Aim for each set to be close to failure.

G) Cooldown (5 min):
1-2 sets
1. Foot Elevated Hip Flexion Stretch; 30 sec/side
2. Butterfly Stretch; 60 sec
`;

const MAX_SET = `C) Strength Intensity (12 min):
Wide Grip Bench Press
4 Working Sets; rest 2 min
Warm-Up Set - 10 reps @20X1 Tempo - Easy
Working Set 1 - 6 reps @20X1 Tempo - RPE 7
Working Set 4 - Max Unbroken reps @20X1 Tempo - RPE 10 - Set 1 weight.
`;

const JAN_DAY = `B) Warmup (8 min):
2 min Cardio of Choice
+
3 Sets
15 sec Cardio Sprint
directly into
Split Stance Dual KB RDL; 6-8 reps/side

C) Strength Intensity 1 (12 min):
Back Squat
3 Working Sets; rest 3 minutes
Warm-Up Set - 3.3.3 reps @ 20X1 - Easy
Working Set 1 - 3.3.3 @ 20X1 - RPE 7
`;

const MAR_COND = `E) Anaerobic Power Conditioning (15 min):
4-6 sets
Box Jump Over; 10 reps
rest 10 sec
Bike 18 sec @ 97% effort
rest walk 1:30-2:00
Effort Note:
The goal is maximal output, do NOT pace.
`;

function week(tracks: { heading: string; days: { date: string; header: string; body?: string }[] }[], headerWeekOf = "Persist Week of October 26, 2026") {
  const toc = tracks.map((t) => `${t.heading}\n${t.days.map((d) => `   ${d.date}`).join("\n")}`).join("\n");
  const body = tracks
    .map((t) => `${t.heading}\n\n${t.days.map((d) => `${d.date}\n${d.header}\n\n${d.body ?? ""}`).join("\n\n")}`)
    .join("\n");
  return `${headerWeekOf}\nREMINDER\n\n${toc}\n\n\n${body}\n`;
}
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Seven days starting Monday 2026-10-26, each printed the way the PDFs print them. */
const seven = (_monday: number, _prefix: string, track: string, body: string, wk = 4) =>
  [1, 2, 3, 4, 5, 6, 7].map((d) => {
    const dt = new Date(Date.UTC(2026, 9, 26 + d - 1));
    return {
      date: `${WEEKDAY_NAMES[d - 1]}, ${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCDate()}th, 2026`,
      header: `Week ${wk} Day ${d} - Persist ${track}`,
      body: d === 7 ? "A note from Marcus.\n\nWarmly,\nMarcus" : body,
    };
  });

describe("quantities and items", () => {
  it("parses reps, ranges, per-side, time and distance", () => {
    expect(parseQuantity("6-8 reps/side")).toMatchObject({ type: "count", min: 6, max: 8, perSide: true });
    expect(parseQuantity("30 sec/side")).toMatchObject({ type: "seconds", min: 30, perSide: true });
    expect(parseQuantity("10m")).toMatchObject({ type: "distance", min: 10, unit: "m" });
    expect(parseQuantity("Max Unbroken reps")).toMatchObject({ type: "max" });
  });

  it("parses name; spec @tempo and male/female loads", () => {
    const it1 = parseItem("2. Bent Knee Copenhagen Raise; 6-10 reps/side @20X0 Tempo")!;
    expect(it1).toMatchObject({ index: "2", name: "Bent Knee Copenhagen Raise", tempo: "20X0" });
    expect(it1.qty).toMatchObject({ min: 6, max: 10, perSide: true });
    const kb = parseItem("KB Swing High Pull 70/53#")!;
    expect(kb.loads).toEqual([{ male: 70, female: 53, unit: "lb", raw: "70/53#" }]);
    expect(parseItem("12/10 Cal Row @ High Effort (Male/Female)")!.qty).toMatchObject({ type: "calories", min: 12, female: 10 });
  });

  it("keeps a name that starts with digits", () => {
    expect(parseItem("1 1/4 Pushup; 6-10 reps @20X0 Tempo")).toMatchObject({ name: "1 1/4 Pushup" });
  });
});

describe("section parsing", () => {
  const day = (body: string) => {
    const text = week([{ heading: "Pump Lift 5x", days: seven(26, "", "PUMP LIFT 5x", body) }]);
    return parseWeekText(text, "persist-102626").week.tracks["pump-lift-5x"][0];
  };

  it("parses the October skeleton: focus, warmup, strength, balance, cooldown", () => {
    const d = day(OCT_DAY1);
    expect(d.sessionType).toBe("training");
    expect(d.focusTopic).toBe("Hollow Body Rock + Suitcase Calf Raise");
    expect(d.shortOnTime).toEqual(["Remove Finisher"]);
    expect(d.sections.map((s) => s.label)).toEqual(["A", "B", "C", "E", "G"]);
    const c = d.sections[2];
    expect(c.exercise).toBe("Back Squat");
    expect(c.sets.map((s) => [s.kind, s.reps?.min, s.rpeMin, s.tempo])).toEqual([
      ["warmup", 10, null, "20X1"],
      ["working", 9, 7, "20X1"],
      ["working", 7, 8, "20X1"],
      ["working", 5, 9, "20X1"],
    ]);
    const balance = d.sections[3];
    expect(balance.lines.filter((l) => l.item).map((l) => l.item!.name)).toEqual(["Barbell Hip Thrust", "Bent Knee Copenhagen Raise"]);
    expect(balance.notes[0].label).toBe("Loading Note");
  });

  it("parses a max-reps set that reuses Set 1 weight", () => {
    const d = day(MAX_SET);
    const s = d.sections[0].sets.at(-1)!;
    expect(s).toMatchObject({ rpeMin: 10, sameWeightAsSet1: true });
    expect(s.reps?.type).toBe("max");
  });

  it("parses the January format: '+' connector, bare tempo, cluster reps", () => {
    const d = day(JAN_DAY);
    expect(d.sections[0].lines.map((l) => l.kind)).toContain("connector");
    const sets = d.sections[1].sets;
    expect(sets[0].reps).toMatchObject({ type: "count", min: 9, unit: "cluster" });
    expect(sets[1]).toMatchObject({ tempo: "20X1", rpeMin: 7 });
  });

  it("parses a conditioning section without guessing at structure", () => {
    const d = day(MAR_COND);
    const s = d.sections[0];
    expect(s.kind).toBe("freeform");
    expect(s.minutesMin).toBe(15);
    expect(s.lines.filter((l) => l.kind === "rest")).toHaveLength(2);
    expect(s.notes[0].label).toBe("Effort Note");
  });
});

describe("week-level quirks", () => {
  it("anchors dates on the week's Monday and logs a wrong printed date", () => {
    const days = seven(26, "", "PUMP LIFT 5x", OCT_DAY1);
    days[2].date = "Wednesday, October 29th, 2026"; // should be the 28th
    const r = parseWeekText(week([{ heading: "Pump Lift 5x", days }]), "persist-102626");
    expect(r.week.weekStart).toBe("2026-10-26");
    expect(r.week.tracks["pump-lift-5x"][2].date).toBe("2026-10-28");
    expect(r.corrections).toContainEqual(expect.objectContaining({ type: "printed-date-mismatch", original: "2026-10-29", corrected: "2026-10-28" }));
  });

  it("trusts dated content over the page header", () => {
    const r = parseWeekText(week([{ heading: "Perform", days: seven(26, "", "PERFORM", OCT_DAY1) }], "Persist Week of October 12, 2026"), "persist-102626");
    expect(r.week.weekStart).toBe("2026-10-26");
    expect(r.corrections).toContainEqual(expect.objectContaining({ type: "header-week-mismatch" }));
  });

  it("assigns tracks from headings when the day header names another track", () => {
    const days = seven(26, "", "PUMP LIFT 5x", OCT_DAY1); // every title says 5x, heading says 4x
    const r = parseWeekText(week([{ heading: "Pump Lift 4x", days }]), "persist-102626");
    expect(Object.keys(r.week.tracks)).toEqual(["pump-lift-4x"]);
    expect(r.corrections.filter((c) => c.type === "day-header-track-mismatch")).toHaveLength(7);
  });

  it("drops a day header that is repeated across a page break", () => {
    const days = seven(26, "", "PUMP LIFT 5x", OCT_DAY1);
    days[1].body = `${OCT_DAY1}\n${days[1].header}`; // repeated at the end of day 2 and again before day 3
    const r = parseWeekText(week([{ heading: "Pump Lift 5x", days }]), "persist-102626");
    expect(r.week.tracks["pump-lift-5x"].map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("numbers days by position when a header is missing, and logs it", () => {
    const days = seven(26, "", "PUMP LIFT 5x", OCT_DAY1);
    days[0].header = "";
    const r = parseWeekText(week([{ heading: "Pump Lift 5x", days }]), "persist-102626");
    expect(r.week.tracks["pump-lift-5x"].map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.corrections).toContainEqual(expect.objectContaining({ type: "day-header-missing" }));
  });

  it("treats a day with no sections as a note", () => {
    const r = parseWeekText(week([{ heading: "Minimalist", days: seven(26, "", "Minimalist", OCT_DAY1) }]), "persist-102626");
    const d7 = r.week.tracks["minimalist"][6];
    expect(d7.sessionType).toBe("note");
    expect(d7.noteBody).toContain("Marcus");
  });
});

describe("names and dates", () => {
  it("maps track names", () => {
    expect(trackFromName("Persist PUMP COND 4x")).toBe("pump-condition-4x");
    expect(trackFromName("PUMP CONDITION 5x")).toBe("pump-condition-5x");
    expect(trackFromName("Persist Minimalist")).toBe("minimalist");
    expect(trackFromName("Pump Lift 5x - April")).toBeNull();
  });

  it("parses printed dates with and without commas", () => {
    expect(parsePrintedDate("Monday, October 26th, 2026")).toBe("2026-10-26");
    expect(parsePrintedDate("Wednesday March 4, 2026")).toBe("2026-03-04");
    expect(parsePrintedDate("Saturday, March 28th 2026")).toBe("2026-03-28");
  });
});
