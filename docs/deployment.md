# Deployment

The app is a Void SPA plus a small Worker: Better Auth sign-in (D1) and an authenticated route that serves the generator's source programs from private R2 storage. Builds do not need `data/` beyond what is committed; `data/views` stays local.

## What is public and what is not

| Asset | Access |
| --- | --- |
| App shell (JS, CSS, icons) | Public static files. They contain no program content. |
| `/api/auth/*` | Public, rate limited. Sign-up is closed (see below). |
| `/api/corpus/*` (source programs) | Signed-in only. Stored in R2, never a static file. |
| Programs and progress | Generated in the browser and kept in IndexedDB on each device. |

`public/content/` (the legacy bundled programs) IS served publicly, as are any files committed under `public/`.

## First deploy

1. Set the secrets (Void creates `BETTER_AUTH_SECRET` itself):
   ```sh
   void secret put SETUP_KEY        # one-time key that allows creating the owner account
   ```
2. Deploy: `npx void deploy --platform cloudflare` (or push to the branch the workflow watches). The auth tables are in `db/migrations/` and are applied on deploy.
3. Create the owner account, then close sign-up for good:
   ```sh
   APP_URL=https://<your-url> OWNER_EMAIL=you@example.com OWNER_PASSWORD='...' SETUP_KEY='...' npm run auth:create-owner
   void secret delete SETUP_KEY
   ```
   Sign-up also refuses once any account exists, so a leaked key cannot add a second user.
4. Publish the source programs (needs `data/views` locally, `npm run persist:views`):
   ```sh
   APP_URL=https://<your-url> OWNER_EMAIL=you@example.com OWNER_PASSWORD='...' npm run corpus:upload
   ```
   Re-run it whenever the source weeks change. Devices fetch the new version on their next generation.

## Local development

`npm run dev` serves `data/views` through the same `/api/corpus/*` URLs, but the route requires a session, so create a local owner once with `SETUP_KEY=dev npm run dev` and `npm run auth:create-owner` against `http://localhost:5173` (or sign up via the script with any key).

## Tests

`npm run test:e2e` builds nothing itself: run `npm run build` first. It starts the preview server with throwaway credentials, creates a test owner, and uploads the corpus when `data/views` exists.

## Offline

The sign-in check is skipped when the device is offline and has signed in before, so the installed app keeps working with no connection. Signing out clears that memory.
