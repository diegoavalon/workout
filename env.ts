import { defineEnv, string } from "void/env";

export default defineEnv({
  /**
   * One-time key that allows creating the owner account (npm run auth:create-owner).
   * Public sign-up is closed whenever this is unset, so remove it once the account exists:
   *   void secret delete SETUP_KEY
   */
  SETUP_KEY: string().optional(),
});
