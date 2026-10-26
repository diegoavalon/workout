export type Exercise = { id: string; name: string; image: string; video: string | null };

export type ExerciseAssignment = {
  type: "exerciseAssignment";
  itemId?: string;
  order?: number;
  exerciseId: string;
  child: Exercise | null;
  sets?: number;
  reps?: string | null;
  rest?: number;
  times?: number;
  notes?: string | null;
};

export type GroupedAssignment = {
  type: "groupedAssignment";
  itemId?: string;
  order?: number;
  title?: string;
  isSuperset: boolean;
  isSection: boolean;
  rest?: number;
  assignmentIds?: string[];
  subAssignments: ExerciseAssignment[];
};

export type RichText = { type: "richText"; itemId?: string; order?: number; child: { content: string } };

export type WorkoutItem = ExerciseAssignment | GroupedAssignment | RichText;
export type WorkoutDoc = { id: string; items: WorkoutItem[] };

export type Program = {
  id: string;
  title: string;
  description: string;
  daysPerWeek: number;
  totalWeeks: number;
  category: string;
  difficulty: string;
  equipment: string[];
  custom?: SessionDef[];
};

/** [title, focus, template key, minutes] */
export type SessionDef = [string, string, TemplateKey, number];
export type TemplateKey = "lower" | "upper" | "power" | "full" | "hills";

const D = (ops: unknown[]) => JSON.stringify({ ops });

export const EXL: Record<string, Exercise> = {};
(
  [
    ["ex-hip-9090", "90/90 Hip Switch", true],
    ["ex-glute-bridge", "Glute Bridge"],
    ["ex-wgs", "World's Greatest Stretch", true],
    ["ex-back-squat", "Back Squat", true],
    ["ex-rdl", "Romanian Deadlift", true],
    ["ex-bss", "Bulgarian Split Squat", true],
    ["ex-copenhagen", "Copenhagen Plank"],
    ["ex-deadbug", "Dead Bug"],
    ["ex-bench", "Bench Press", true],
    ["ex-row", "Chest-Supported Row"],
    ["ex-ohp", "Half-Kneeling Press", true],
    ["ex-pullup", "Pull-Up", true],
    ["ex-pushup", "Push-Up"],
    ["ex-facepull", "Face Pull"],
    ["ex-band-dislocate", "Band Dislocate"],
    ["ex-boxjump", "Box Jump", true],
    ["ex-medball", "Med Ball Rotational Throw", true],
    ["ex-sled", "Sled Push"],
    ["ex-bike", "Air Bike Intervals"],
    ["ex-trapbar", "Trap Bar Deadlift", true],
    ["ex-kbswing", "Kettlebell Swing", true],
    ["ex-carry", "Farmer's Carry"],
    ["ex-lunge", "Walking Lunge"],
    ["ex-hill", "Hill Sprint"],
  ] as [string, string, boolean?][]
).forEach(([id, name, v]) => {
  EXL[id] = {
    id,
    name,
    image: `https://media.example.com/exercises/${id}.jpg`,
    video: v ? `https://media.example.com/exercises/${id}.mp4` : null,
  };
});

export const SAMPLE: WorkoutDoc = {
  id: "athletic-performance-w1-s1",
  items: [
    { order: 3, type: "richText", itemId: "rt-strength", child: { content: D([{ insert: "Strength" }, { insert: "\n", attributes: { header: 2 } }, { insert: "Rest fully between squat sets. Quality over load.\n" }]) } },
    { order: 1, type: "richText", itemId: "rt-notes", child: { content: D([{ insert: "Coaching notes" }, { insert: "\n", attributes: { header: 2 } }, { insert: "Week 1 sets your baseline. Every working set should feel " }, { insert: "smooth and repeatable", attributes: { bold: true } }, { insert: " — finish each set with two to three reps left in the tank.\n" }, { insert: "Write down your squat load; Week 2 builds from it.", attributes: { italic: true, color: "#e60000" } }, { insert: "\n" }]) } },
    { order: 2, type: "groupedAssignment", itemId: "g-warmup", title: "Warmup", isSection: true, isSuperset: false, assignmentIds: ["a-1", "a-2", "a-3"], subAssignments: [
      { order: 1, type: "exerciseAssignment", itemId: "a-1", exerciseId: "ex-hip-9090", child: EXL["ex-hip-9090"], sets: 1, times: 60, notes: "Slow and controlled, tall chest." },
      { order: 2, type: "exerciseAssignment", itemId: "a-2", exerciseId: "ex-glute-bridge", child: EXL["ex-glute-bridge"], sets: 2, reps: "10", notes: "Two-second hold at the top." },
      { order: 3, type: "exerciseAssignment", itemId: "a-3", exerciseId: "ex-wgs", child: EXL["ex-wgs"], sets: 1, reps: "5/side" },
    ] },
    { order: 4, type: "exerciseAssignment", itemId: "a-4", exerciseId: "ex-back-squat", child: EXL["ex-back-squat"], sets: 4, reps: "5", rest: 180, notes: "Brace before you descend. Pause briefly at the bottom of the last rep of each set." },
    { order: 5, type: "groupedAssignment", itemId: "g-b", isSuperset: true, isSection: false, rest: 90, assignmentIds: ["a-5", "a-6"], subAssignments: [
      { order: 1, type: "exerciseAssignment", itemId: "a-5", exerciseId: "ex-rdl", child: EXL["ex-rdl"], sets: 3, reps: "8", notes: "Hinge until the hamstrings load; keep the bar close." },
      { order: 2, type: "exerciseAssignment", itemId: "a-6", exerciseId: "ex-bss", child: EXL["ex-bss"], sets: 3, reps: "8/side", rest: 90 },
    ] },
    { order: 6, type: "groupedAssignment", itemId: "g-c", isSuperset: true, isSection: false, rest: 60, assignmentIds: ["a-7", "a-8"], subAssignments: [
      { order: 1, type: "exerciseAssignment", itemId: "a-7", exerciseId: "ex-copenhagen", child: EXL["ex-copenhagen"], sets: 3, times: 20, notes: "Each side. Knee-supported version is fine this week." },
      { order: 2, type: "exerciseAssignment", itemId: "a-8", exerciseId: "ex-deadbug", child: EXL["ex-deadbug"], sets: 3, reps: "8/side", rest: 60 },
    ] },
    { order: 7, type: "richText", itemId: "rt-cool", child: { content: D([{ insert: "Cooldown" }, { insert: "\n", attributes: { header: 2 } }, { insert: "Five minutes of easy walking, then nasal breathing until your heart rate settles.\n" }]) } },
  ],
};

type Item = WorkoutItem;
const ex = (id: string, sets?: number, reps?: string | null, rest?: number, notes?: string | null, times?: number): ExerciseAssignment => ({
  type: "exerciseAssignment", exerciseId: id, child: EXL[id] || null, sets, reps, rest, notes, times,
});
const sup = (subs: ExerciseAssignment[], rest: number): GroupedAssignment => ({ type: "groupedAssignment", isSuperset: true, isSection: false, rest, subAssignments: subs });
const sec = (title: string, subs: ExerciseAssignment[]): GroupedAssignment => ({ type: "groupedAssignment", isSection: true, isSuperset: false, title, subAssignments: subs });
const txt = (h: string, p: string): RichText => ({ type: "richText", child: { content: D([{ insert: h }, { insert: "\n", attributes: { header: 2 } }, { insert: p + "\n" }]) } });
const warm = () => sec("Warmup", [ex("ex-hip-9090", 1, null, 0, null, 60), ex("ex-glute-bridge", 2, "10"), ex("ex-wgs", 1, "5/side")]);
const warmU = () => sec("Warmup", [ex("ex-band-dislocate", 2, "10"), ex("ex-pushup", 2, "8"), ex("ex-facepull", 1, "15")]);
const cool = () => txt("Cooldown", "Five minutes of easy walking, then nasal breathing until your heart rate settles.");

export const PHASE_COPY = ["Build a base: learn the rhythm of each session and leave reps in reserve.", "Add a set to the main lifts. Same loads, more work.", "Heavier, fewer reps. Rest fully between sets.", "Deload. Drop a set everywhere and move well."];
export const WEEK_TITLES = ["Foundation", "Volume", "Intensification", "Recovery"];
const S = (b: number, w: number) => { const p = (w - 1) % 4; return b + (p === 1 ? 1 : 0) - (p === 3 ? 1 : 0); };
const R = (b: number, w: number) => String((w - 1) % 4 === 2 ? Math.max(3, b - 2) : b);

const TEMPLATES: Record<TemplateKey, (w: number) => Item[]> = {
  lower: (w) => [txt("Coaching notes", PHASE_COPY[(w - 1) % 4]), warm(), txt("Strength", "Rest fully between squat sets. Quality over load."), ex("ex-back-squat", S(4, w), R(5, w), 180, "Brace before you descend."), sup([ex("ex-rdl", S(3, w), R(8, w), 0, "Keep the bar close."), ex("ex-bss", S(3, w), R(8, w) + "/side", 90)], 90), sup([ex("ex-copenhagen", 3, null, 0, "Each side.", 20), ex("ex-deadbug", 3, "8/side", 60)], 60), cool()],
  upper: (w) => [txt("Coaching notes", PHASE_COPY[(w - 1) % 4]), warmU(), ex("ex-bench", S(4, w), R(5, w), 150, "Shoulder blades pinned; touch the same spot every rep."), sup([ex("ex-row", S(3, w), R(10, w), 0), ex("ex-ohp", S(3, w), R(8, w) + "/side", 90)], 90), sup([ex("ex-pullup", 3, "AMRAP", 0, "Stop one rep before form breaks."), ex("ex-facepull", 3, "15", 60)], 60), cool()],
  power: () => [txt("Coaching notes", "Every rep is fast. If speed drops, end the set."), warm(), txt("Power", "Full recovery between rounds — this is not conditioning."), sup([ex("ex-boxjump", 4, "3", 0, "Step down, never jump down."), ex("ex-medball", 4, "4/side", 120)], 120), txt("Conditioning", "Hard but repeatable. Match your first round on the last."), ex("ex-sled", 5, "20 m", 60), ex("ex-bike", 6, null, 40, "All-out effort.", 20), cool()],
  full: (w) => [txt("Coaching notes", PHASE_COPY[(w - 1) % 4]), warm(), ex("ex-trapbar", S(4, w), R(4, w), 180, "Push the floor away."), sup([ex("ex-lunge", S(3, w), "10/side", 0), ex("ex-pushup", S(3, w), "12", 75)], 75), sup([ex("ex-kbswing", 3, "15", 0), ex("ex-carry", 3, null, 60, "Heavy. Walk tall.", 40)], 60), cool()],
  hills: (w) => [txt("Coaching notes", "Sprint uphill at 90%. Walk back down as recovery."), warm(), ex("ex-hill", S(6, w), null, 90, null, 10), ex("ex-sled-drag", 4, "20 m", 60, "Backward drag."), ex("ex-kbswing", 3, "15", 60), cool()],
};

const SESSIONS: Record<number, SessionDef[]> = {
  3: [["Full Body A", "Strength", "full", 55], ["Full Body B", "Power", "power", 45], ["Full Body C", "Upper emphasis", "upper", 50]],
  4: [["Lower Body Strength", "Strength", "lower", 55], ["Upper Body Strength", "Strength", "upper", 50], ["Power & Conditioning", "Power", "power", 45], ["Full Body Strength", "Strength", "full", 60]],
  5: [["Lower Strength", "Strength", "lower", 55], ["Upper Push", "Hypertrophy", "upper", 50], ["Conditioning", "Conditioning", "power", 40], ["Upper Pull", "Hypertrophy", "upper", 50], ["Full Body Power", "Power", "full", 55]],
};
export const SUGGESTED_DAYS: Record<number, string[]> = { 3: ["Mon", "Wed", "Fri"], 4: ["Mon", "Tue", "Thu", "Fri"], 5: ["Mon", "Tue", "Wed", "Fri", "Sat"] };

export const BASE_PROGRAMS: Program[] = [
  { id: "foundations", title: "Foundations Strength", description: "Learn the main lifts and build a base of strength with three full-body sessions a week.", daysPerWeek: 3, totalWeeks: 6, category: "Strength", difficulty: "Beginner", equipment: ["Barbell", "Dumbbells", "Bench"] },
  { id: "minimal", title: "Minimal Equipment", description: "Efficient full-body sessions built around a pair of dumbbells and a bench.", daysPerWeek: 3, totalWeeks: 4, category: "General fitness", difficulty: "Beginner", equipment: ["Dumbbells", "Bench"] },
  { id: "athletic-performance", title: "Athletic Performance", description: "Strength, power, and conditioning for field and court athletes.", daysPerWeek: 4, totalWeeks: 8, category: "Strength & conditioning", difficulty: "Intermediate", equipment: ["Barbell", "Trap bar", "Plyo box", "Med ball", "Sled", "Air bike"] },
  { id: "strength-conditioning", title: "Strength & Conditioning", description: "A longer block that alternates heavy strength phases with conditioning work.", daysPerWeek: 4, totalWeeks: 12, category: "Strength & conditioning", difficulty: "Intermediate", equipment: ["Barbell", "Kettlebell", "Sled", "Air bike"] },
  { id: "strength-hypertrophy", title: "Strength & Hypertrophy", description: "Heavy compound lifts paired with higher-rep accessory work.", daysPerWeek: 4, totalWeeks: 6, category: "Hypertrophy", difficulty: "Intermediate", equipment: ["Barbell", "Dumbbells", "Cable"] },
  { id: "hypertrophy-split", title: "Hypertrophy Split", description: "Five focused sessions a week with enough volume to drive muscle growth.", daysPerWeek: 5, totalWeeks: 8, category: "Hypertrophy", difficulty: "Advanced", equipment: ["Barbell", "Dumbbells", "Cable", "Pull-up bar"] },
  { id: "performance-block", title: "Performance Block", description: "High-frequency speed, power, and strength for in-season athletes.", daysPerWeek: 5, totalWeeks: 6, category: "Athletic performance", difficulty: "Advanced", equipment: ["Barbell", "Plyo box", "Med ball", "Sled"] },
];

export const IMPORTED_PROGRAM: Program = {
  id: "hill-sprints", title: "Hill Sprint Block", description: "Imported program: acceleration work on hills plus a strength session.", daysPerWeek: 3, totalWeeks: 6, category: "Speed", difficulty: "Intermediate", equipment: ["Hill", "Kettlebell", "Sled"],
  custom: [["Hill Sprints", "Speed", "hills", 40], ["Full Body Strength", "Strength", "full", 55], ["Tempo & Power", "Power", "power", 45]],
};

export const GROUP_COPY: Record<number, string> = { 3: "A manageable weekly training commitment.", 4: "A balanced training schedule.", 5: "A higher-frequency training schedule." };

export const sessionsOf = (p: Program): SessionDef[] => p.custom || SESSIONS[p.daysPerWeek];
export const workoutId = (p: Program, w: number, s: number) => `${p.id}-w${w}-s${s}`;

export function rawWorkout(p: Program, w: number, s: number): WorkoutDoc {
  if (p.id === "athletic-performance" && w === 1 && s === 1) return SAMPLE;
  const key = sessionsOf(p)[s - 1][2];
  const items = TEMPLATES[key](w);
  let n = 0;
  const tag = <T extends Item>(it: T): T => {
    n++;
    it.itemId = `i${n}`;
    if (it.type === "groupedAssignment") {
      it.subAssignments.forEach((sa, i) => { sa.order = i + 1; tag(sa); });
      it.assignmentIds = it.subAssignments.map((x) => x.itemId!);
    }
    return it;
  };
  return { id: workoutId(p, w, s), items: items.map((it, i) => tag({ ...it, order: i + 1 })) };
}

export function mediaTotals(p: Program) {
  const ids = new Set<string>();
  sessionsOf(p).forEach(([, , k]) =>
    TEMPLATES[k](1).forEach((it) => {
      const list: Item[] = it.type === "groupedAssignment" ? it.subAssignments : [it];
      list.forEach((a) => { if (a.type === "exerciseAssignment" && a.child?.id) ids.add(a.child.id); });
    }),
  );
  const list = [...ids].map((i) => EXL[i]).filter(Boolean);
  return { img: list.length, vid: list.filter((e) => e.video).length };
}

export type Seg = { text: string; bold: boolean; italic: boolean; highlight: boolean; underline: boolean; strike: boolean; large: boolean; small: boolean };
export type Line = { segs: Seg[]; header?: number; list?: "bullet" | "ordered"; n: number };

/** Parses a Quill-style delta into lines; malformed input yields a fallback line. */
export function parseDelta(input: unknown): Line[] {
  const fallback: Line[] = [{ n: 0, segs: [{ text: "This note could not be displayed.", bold: false, italic: false, highlight: false, underline: false, strike: false, large: false, small: false }] }];
  try {
    const obj = typeof input === "string" ? JSON.parse(input) : (input as { ops?: unknown });
    const ops = Array.isArray(obj) ? obj : (obj as { ops?: unknown } | null)?.ops;
    if (!Array.isArray(ops)) return fallback;
    const lines: { segs: Seg[]; a: Record<string, unknown> }[] = [];
    let cur: Seg[] = [];
    const close = (a?: Record<string, unknown>) => { if (cur.length) lines.push({ segs: cur, a: a || {} }); cur = []; };
    ops.forEach((op: { insert?: unknown; attributes?: Record<string, unknown> }) => {
      if (typeof op.insert !== "string") return;
      const parts = op.insert.split("\n");
      parts.forEach((t, i) => {
        if (t) {
          const a = op.attributes || {};
          cur.push({ text: t, bold: !!a.bold, italic: !!a.italic, highlight: !!a.color, underline: !!a.underline, strike: !!a.strike, large: a.size === "large" || a.size === "huge", small: a.size === "small" });
        }
        if (i < parts.length - 1) close(op.attributes);
      });
    });
    close();
    let ol = 0;
    return lines.map(({ segs, a }) => {
      ol = a.list === "ordered" ? ol + 1 : 0;
      return { segs, header: a.header as number | undefined, list: a.list as Line["list"], n: ol };
    });
  } catch {
    return fallback;
  }
}

export const fmtSeconds = (s?: number) => (!s ? "" : s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
export const letter = (i: number) => String.fromCharCode(64 + i);
