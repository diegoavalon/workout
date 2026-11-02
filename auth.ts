import { defineAuth } from "void/auth";
import { createAuthMiddleware, APIError } from "better-auth/api";

/**
 * The app is single-owner. Sign-up is closed unless the request carries the one-time
 * SETUP_KEY and no account exists yet, so a stranger can neither register nor
 * claim the account before the owner does.
 */
export default defineAuth(({ defaults, env }) => ({
  ...defaults,
  hooks: {
    ...defaults.hooks,
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const key = typeof env.SETUP_KEY === "string" ? env.SETUP_KEY : "";
      const given = ctx.headers?.get("x-setup-key") ?? "";
      if (!key || !safeEqual(key, given)) throw new APIError("FORBIDDEN", { message: "Sign-up is closed." });
      if ((await ctx.context.internalAdapter.countTotalUsers()) > 0) throw new APIError("FORBIDDEN", { message: "An account already exists." });
    }),
  },
}));

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
