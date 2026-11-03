import { defineHandler } from "void";
import { db, sql } from "void/db";

// Public on purpose: the /setup screen asks whether an owner exists before it shows the form.
// Reveals only "open" or "closed"; creating the account still needs SETUP_KEY (see auth.ts).
export const GET = defineHandler(async () => {
  const rows = await db.all<{ n: number }>(sql`select count(*) as n from user`);
  return new Response(JSON.stringify({ open: Number(rows[0]?.n ?? 0) === 0 }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
});
