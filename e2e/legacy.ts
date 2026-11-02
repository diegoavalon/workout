import type { Page } from "@playwright/test";

/**
 * Simulates a program saved by an earlier version: writes its manifest, session files and the exercise
 * library straight into the app's IndexedDB, then reloads so the app hydrates from it. Fresh devices no
 * longer install preset programs, so tests that open /program/... routes need this.
 */
export async function seedLegacyProgram(page: Page, programId: string) {
  await page.goto("/active-program");
  await page.getByRole("heading", { name: "Active program" }).waitFor();
  await page.evaluate(async (id) => {
    const base = `/content/programs/${id}/`;
    const manifest = await (await fetch(`${base}program.json`)).json();
    const library = await (await fetch("/content/exercises/library.json")).json();
    const rows: { key: string; items: unknown }[] = [];
    for (const w of manifest.weeks) for (const s of w.sessions) rows.push({ key: `${id}/${s.id}`, items: await (await fetch(new URL(s.contentPath, location.origin + base))).json() });
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("workout-app"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction(["programs", "workouts", "exercises"], "readwrite");
    tx.objectStore("programs").put(manifest);
    for (const r of rows) tx.objectStore("workouts").put(r);
    for (const e of library) if (e?.id) tx.objectStore("exercises").put({ ...e, title: e.title ?? e.name });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
  }, programId);
  await page.reload();
}
