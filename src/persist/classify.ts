import type { Section } from "./schema.ts";

export const PATTERNS = [
  "squat", "hinge", "lunge-single-leg", "horizontal-press", "vertical-press", "horizontal-pull",
  "vertical-pull", "carry", "core", "isolation-arms", "isolation-shoulders", "isolation-legs",
  "olympic", "plyometric", "cardio", "mobility",
] as const;
export type Pattern = (typeof PATTERNS)[number];

export interface PatternGuess {
  pattern: Pattern | null;
  /** Looser guess for the unmapped report only; never written to the catalog. */
  suggested: Pattern | null;
  rule: string | null;
}

// Strong rules: wording that only means one thing. First match wins.
const STRONG: [Pattern, RegExp][] = [
  ["cardio", /^(cardio of choice|cardio sprint|row|bike|run|walk|jog|ski|swim|shuttle run|double under|single under|jump rope)(\b|$)|^(run|row|bike|ski|jog|walk)[/ ,]+(run|row|bike|ski|jog|walk|swim)/],
  // Positions and stretches that borrow a lift's or muscle's name.
  ["mobility", /\bstretch\b|\b(wrist|ankle) circle\b|\b(thoracic|hip) rotation\b|\bbottom of squat\b|\b(half|middle) split hip hinge\b/],
  ["vertical-press", /\b(handstand push up|hspu)\b/],
  ["isolation-legs", /\b(nordic|hamstring curl|leg curl)\b/],
  ["horizontal-pull", /\bring row\b/],
  ["olympic", /\b(clean|snatch|jerk)\b/],
  ["plyometric", /\b(squat jump|slam ball|med ball slam|bench hops?|skater jump|box jump|broad jump|jump squat|tuck jump|jump lunge|lateral hop|hop|bound|depth jump|jumping jack)\b/],
  ["cardio", /\b(cal(orie)?s? (row|bike)|cal row|cal bike|calorie row|single under|\d+m run)\b/],
  ["isolation-legs", /\b(band(ed)? walk|monster walk|band(ed)? (abduction|adduction)|cable abduction)\b/],
  ["carry", /\b(rack march|carry|farmers walk|suitcase walk|rack walk|waiter walk)\b/],
  ["mobility", /\bjefferson curl\b/],
  ["lunge-single-leg", /\b(patrick step|tall kneel to stand|poliquin step|box step over|lunge|split squat|step up|step down|cossack|pistol|skater|kickstand|bulgarian|curtsy|single leg squat|rear foot elevated)\b/],
  ["hinge", /^(?!.*(squat|delt)).*\b(swing)\b|\b(hip bridge|straight leg bridge|hamstring (march|walk ?out)|rack pull|hyper|ghd hip extension|goodmoring|dl high pull|dual kettlebell dl|kettlebell high pull|deadstop hike)\b|\b(deadlift|good morning|hip thrust|glute bridge|kettlebell swing|back extension|pull through|hip hinge)\b|^single leg hip thrust/],
  ["squat", /\b(squat|leg press|hack squat|thruster|wall sit|wall ball)\b/],
  ["horizontal-press", /\b(bench press|push up|floor press|chest press|1 1\/4 push up)\b/],
  ["vertical-press", /\b(overhead press|shoulder press|military press|z press|push press|strict press|behind the neck press|seated press|handstand push up|landmine press|arnold press|see saw press)\b/],
  ["vertical-pull", /\b(pull up|chin up|pulldown|muscle up)\b/],
  ["horizontal-pull", /\b(body row|renegade row|ballistic row|elbowing row|ring row|bent over row|cable row|seal row|chest supported row|t bar row|inverted row|pendlay row|single arm row|dumbbell row|barbell row|kettlebell row|chainsaw row|gorilla row|bulgarian ring row|y row)\b/],
  ["vertical-press", /\b(seated|standing|half kneeling|tall kneeling|bottoms up)\b.*\bpress\b(?!.*(bench|floor|chest|incline))/],
  ["isolation-shoulders", /\b(lateral raise|front raise|rear delt|reverse fly|face pull|y raise|shrug|upright row)\b/],
  ["isolation-shoulders", /\breverse\b.*\bfly\b/],
  ["olympic", /\bdevil'?s? press\b/],
  ["isolation-arms", /\b(jm press|tate press|skull ?crusher)\b/],
  ["isolation-shoulders", /^(?!.*plank)(?=.*\b(powell raise|poliquin raise|full raise|horn grip raise|cuban press|external rotation|er on knee|er elbow on knee|band pull ?apart|scap retraction)\b).*$/],
  ["horizontal-press", /\bspoto press\b/],
  ["vertical-press", /\b(hspu|handstand|pike hs|hs hold|hs walk|wall walk|farmers press|filly press|bradford press|strict (kettlebell|dumbbell) press|(left|right) arm (kettlebell )?press|alternating kettlebell press|single arm dumbbell press)\b/],
  ["vertical-pull", /^(?!.*hollow).*\b(pullover|lat pull ?down|chin over bar)\b/],
  ["horizontal-pull", /\b(meadows? row|landmine row|landmine meadow|half kneeling .*row|prone row|see saw row|band row)\b/],
  // Dips and chest flies have no pattern of their own in the list; both are pressing movements for the chest.
  ["horizontal-press", /\b(bar dip|ring dip|bench dip|fly)\b(?!.*(support|stretch))/],
  ["isolation-arms", /\b(curl|skullcrusher|tricep|bicep|pushdown|kickback|wrist)\b(?!.*(leg|hamstring|nordic|bridge|jefferson))/],
  ["isolation-legs", /\b(leg extension|leg curl|hamstring curl|nordic|calf raise|adductor|abductor|hip abduction|sissy)\b/],
  ["core", /\b(plank|crunch|hollow|sit up|leg raise|toes to bar|knee tuck|russian twist|ab wheel|rollout|dead bug|bird dog|pallof|l sit|v up|heel tap|bicycle|copenhagen|wiper|flutter|knee to elbow|toe touch|pike leg)\b/],
  ["plyometric", /\bburpee\b/],
  ["core", /\b(tuck up|mountain climber|candlestick|superman|planche|sprawl|inchworm|body saw|oblique raise|hanging (knee|leg)|leg tuck|windshield|leg lower|leg lowering|toes to ring|dip support|quadruped (reverse )?crawl|reverse quadruped crawl|turkish get up|chop and lift|side bend|pike up|shoulder tap|beast to|front rack hold)\b/],
  ["mobility", /(stretch|pose|toe sit|duck walk|ostrich walk|elephant walk|babymaker|arm bar|shoulder (rotation|car)|neck car|hip er|thoracic sweep|thread the needle|forward fold|lumbar roll|chest opener|hamstring to .* flow|gunslinger|circle|pulse|shoulder (extension|flexion)|ytw|pass through|horse stance|crab reach|underswitch|around the world|passive hang|hang\b|thoracic rotation|hip rotation|cat cow|pigeon|couch|pancake|butterfly|frog|shinbox|prayer|jefferson|90\/90|hero|sleeper|seal\b|downdog|updog|down dog|weight shift|heel sit|ankle|scratch test|angel|swimmer|windmill|halo|middle split|front split|side split|can opener|child)/],
];

// Weaker rules: likely but not certain, so they only produce suggestions.
const WEAK: [Pattern, RegExp][] = [
  ["horizontal-press", /\bpress\b/],
  ["horizontal-pull", /\brow\b/],
  ["core", /\b(carry|hold|walk|crawl)\b/],
  ["hinge", /\b(swing|bridge|hamstring)\b/],
  ["squat", /\bsit\b/],
  ["isolation-arms", /\bextension\b/],
];

export function guessPattern(key: string): PatternGuess {
  for (const [pattern, re] of STRONG) if (re.test(key)) return { pattern, suggested: pattern, rule: re.source.slice(0, 40) };
  for (const [pattern, re] of WEAK) if (re.test(key)) return { pattern: null, suggested: pattern, rule: `weak:${re.source.slice(0, 30)}` };
  return { pattern: null, suggested: null, rule: null };
}

const EQUIPMENT: [string, RegExp][] = [
  ["barbell", /\b(barbell|trap bar|ez bar|safety bar|zercher)\b/],
  ["dumbbell", /\bdumbbell\b|\b(hammer curl|powell raise|lateral raise|front raise|renegade row)\b/],
  ["dumbbell-or-kettlebell", /\b(goblet|suitcase|farmers)\b/],
  ["kettlebell", /\bkettlebell\b/],
  ["cable", /\bcable\b/],
  ["band", /\b(banded|band|resistance band)\b/],
  ["rings", /\bring\b/],
  ["machine", /\b(machine|leg press|hack squat|pulldown|smith)\b/],
  ["landmine", /\blandmine\b/],
  ["box", /\bbox\b/],
  ["bench", /\bbench\b/],
  ["sled", /\bsled\b/],
  ["plate", /\bplate\b/],
  ["pvc", /\bpvc\b/],
  ["medicine-ball", /\b(med ball|medicine ball|wall ball|slam ball)\b/],
  ["bike", /\b(bike|echo bike|assault bike)\b/],
  ["rower", /\b(rower|row erg)\b/],
  ["bodyweight", /\b(bodyweight|push up|pull up|chin up|plank)\b/],
  ["pull-up-bar", /\b(pull up|chin up|toes to bar|hanging|passive hang|muscle up|bar dip)\b/],
  ["jump-rope", /\b(double|single) under\b/],
  ["rower", /^(row|row (calorie|buy in|or jog))\b|\brow (calorie|buy in)\b/],
  ["ski-erg", /\bski\b/],
];

// Lifts that are barbell lifts unless the name says otherwise.
const BARBELL_BY_DEFAULT =
  /\b(back squat|front squat|bench press|deadlift|strict press|z press|push press|behind the neck press|pendlay row|hip thrust|good morning|power snatch|power clean|hang clean|overhead squat|thruster)\b/;

/** Equipment needed beyond the floor; an empty list means bodyweight or nothing at all. */
export function guessEquipment(key: string): string[] {
  const found = EQUIPMENT.filter(([, re]) => re.test(key)).map(([name]) => name);
  const implement = found.some((e) => !["bodyweight", "pull-up-bar", "box", "bench"].includes(e));
  if (!implement && BARBELL_BY_DEFAULT.test(key)) found.unshift("barbell");
  return found;
}

export const UNILATERAL_RE = /\b(single arm|single leg|one arm|one leg|alternating|split squat|lunge|step up|step down|kickstand|bulgarian|pistol|cossack|curtsy|skater|rear foot elevated)\b/;

// ---------------------------------------------------------------------------
// Sections

export type Role =
  | "focus-note" | "warmup" | "hot-start" | "speed-strength" | "strength-intensity-1"
  | "strength-intensity-2" | "strength-balance" | "finisher" | "conditioning" | "cooldown"
  | "active-recovery" | "mobility" | "weekly-note";

export type Format =
  | "straight-sets" | "superset" | "giant-set" | "cluster" | "emom" | "every-n-sec" | "amrap"
  | "for-time" | "intervals" | "ladder" | "run-the-rack" | "chipper" | "steady-state";

/** `beforeStrength` is true for freeform sections that come before the day's first strength section. */
export function classifyRole(s: Pick<Section, "title" | "kind">, beforeStrength: boolean): Role {
  const t = s.title.toLowerCase();
  if (/daily focus|coach notes?/.test(t)) return "focus-note";
  if (/recovery mobility/.test(t)) return "mobility";
  if (/active recovery/.test(t)) return "active-recovery";
  if (/^warm\s?-?\s?up/.test(t)) return "warmup";
  if (/^cool\s?-?\s?down/.test(t)) return "cooldown";
  if (/^strength intensity\s*2/.test(t)) return "strength-intensity-2";
  if (/^strength intensity/.test(t)) return "strength-intensity-1";
  if (/^strength balance/.test(t)) return "strength-balance";
  if (/^finisher/.test(t)) return "finisher";
  if (/speed strength/.test(t)) return "speed-strength";
  if (/hot start/.test(t) || (s.kind === "freeform" && beforeStrength)) return "hot-start";
  return "conditioning";
}

const lineText = (s: Section) => s.lines.map((l) => l.text).concat(s.scheme).join("\n");

export function classifyFormat(s: Section, role: Role): Format | null {
  if (role === "focus-note" || role === "weekly-note" || role === "mobility") return null;
  if (role === "warmup" || role === "cooldown" || role === "active-recovery") return null;
  const text = `${s.title}\n${lineText(s)}`;
  const items = s.lines.filter((l) => l.item?.index).length || s.lines.filter((l) => l.kind === "item").length;
  if (s.kind === "strength") {
    if (/giant set/i.test(s.title)) return "giant-set";
    if (s.scheme.some((x) => /^every\s+\d/i.test(x))) return "every-n-sec";
    if (s.sets.some((x) => x.reps?.unit === "cluster")) return "cluster";
    return "straight-sets";
  }
  if (/\bEMOM\b/i.test(text)) return "emom";
  if (/\bAMRAP\b/i.test(text)) return "amrap";
  if (/run the rack/i.test(text)) return "run-the-rack";
  if (/\bchipper\b/i.test(text)) return "chipper";
  if (/\bfor time\b/i.test(text)) return "for-time";
  if (/^\s*\d+(?:-\d+){2,}/m.test(text)) return "ladder";
  if (/^every\s+\d/im.test(text)) return "every-n-sec";
  if (/\binterval|\bwork\b.*\brest\b|\d+\s*sec @|\d+:\d\d @/i.test(text)) return "intervals";
  if (/steady|zone 2|continuous (clock|effort)|grinder pace|sustained pace/i.test(text)) return "steady-state";
  // Prescribed sets or rounds with rest between them: work/rest intervals in the conditioning sense,
  // plain sets for speed-strength and similar barbell pieces.
  const setsHeader = /^\s*\d+(?:-\d+)?\s+(?:working\s+)?(?:sets?|rounds?)\b/im.test(text);
  const restLine = /\brest\b/i.test(text);
  if (setsHeader && restLine && ["conditioning", "hot-start", "speed-strength"].includes(role)) return role === "speed-strength" || /jerk|snatch|clean|squat/i.test(s.title) ? "straight-sets" : "intervals";
  if (role === "strength-balance" || role === "finisher") {
    if (items >= 4) return "giant-set";
    if (items >= 2) return "superset";
    if (items === 1) return "straight-sets";
  }
  return null;
}
