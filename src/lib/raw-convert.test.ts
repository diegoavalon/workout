import { describe, expect, it } from "vitest";
import { buildLibrary, collapsePerSet, convertDayItems } from "./raw-convert";

const ex = (id: string, exId: string, extra: Record<string, unknown> = {}) => ({
  id, itemId: exId, type: "exercise", order: 0, sets: 3, reps: [5, 5, 5], rest: 60, notes: "",
  child: { id: exId, title: `Ex ${exId}`, imageUrl: "https://x/img.jpg", videoUrl: null, tags: [] },
  ...extra,
});

describe("collapsePerSet", () => {
  it("collapses equal values and keeps varying ones", () => {
    expect(collapsePerSet([5, 5, 5])).toBe(5);
    expect(collapsePerSet([7, 8, 9])).toEqual([7, 8, 9]);
    expect(collapsePerSet(["", ""])).toBeUndefined();
    expect(collapsePerSet(null)).toBeUndefined();
  });
});

describe("convertDayItems", () => {
  it("converts text/exercise types, uses document ids as itemIds, and collapses per-set reps", () => {
    const { items, report } = convertDayItems([
      { id: "t1", itemId: "tile1", type: "text", order: 0, child: { id: "tile1", text: "[{\"insert\":\"Hi\\n\"}]" } },
      ex("a1", "ex-squat", { order: 1, rpePerSet: [7, 8, 9] }),
    ]);
    expect(items[0]).toMatchObject({ type: "richText", itemId: "t1", order: 1 });
    expect((items[0].child as Record<string, unknown>).content).toContain("Hi");
    expect(items[1]).toMatchObject({ type: "exerciseAssignment", itemId: "a1", exerciseId: "ex-squat", reps: "5", order: 2 });
    expect(String(items[1].notes)).toContain("RPE: 7, 8, 9");
    expect(report.exercises).toBe(1);
  });

  it("orders group children by assignmentIds, surfaces group richText, and warns on missing children", () => {
    const group = {
      id: "g1", itemId: "superset", type: "exercise", order: 0, isSuperset: true, isSection: false,
      assignmentIds: ["s2", "s1", "s-missing"],
      richText: "[{\"insert\":\"Do the complex\\n\"}]",
      child: { id: "superset", title: "Superset" },
      subAssignments: [ex("s1", "ex-a", { order: 5 }), ex("s2", "ex-b", { order: 9 })],
    };
    const { items, report } = convertDayItems([group]);
    expect(items[0].type).toBe("richText");
    const g = items[1];
    expect(g).toMatchObject({ type: "groupedAssignment", itemId: "g1" });
    expect((g.subAssignments as Record<string, unknown>[]).map((s) => s.itemId)).toEqual(["s2", "s1"]);
    expect(report.warnings.join(" ")).toContain("s-missing");
  });

  it("warns instead of dropping unknown item types", () => {
    const { items, report } = convertDayItems([{ id: "u1", type: "videoHero", order: 0 }]);
    expect(items).toHaveLength(1);
    expect(report.warnings.join(" ")).toContain("videoHero");
  });
});

describe("buildLibrary", () => {
  it("dedupes embedded exercises and skips the superset placeholder", () => {
    const { items } = convertDayItems([
      ex("a1", "ex-squat"),
      { id: "g1", itemId: "superset", type: "exercise", order: 1, isSuperset: true, child: { id: "superset", title: "Superset" }, subAssignments: [ex("s1", "ex-squat"), ex("s2", "ex-row")] },
    ]);
    const { library, conflicts } = buildLibrary([items]);
    expect(library.map((e) => e.id).sort()).toEqual(["ex-row", "ex-squat"]);
    expect(conflicts).toEqual([]);
  });
});
