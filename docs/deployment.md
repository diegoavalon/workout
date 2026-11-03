# Deployment

Tempo is configured to deploy to **https://tempo.nivelohq.com** on the **nivelo-tempo** Cloudflare Worker. The hostname and Worker name are declared in `void.config.ts`.

The app is a Void SPA plus a Worker: Better Auth sign-in uses D1, and an authenticated route serves the generator's source programs from private R2 storage. Builds do not need the private `data/views` directory. Programs and progress stay in IndexedDB on each device; deployment does not add cross-device sync.

## Nivelo app structure

| Hostname | Purpose |
| --- | --- |
| `nivelohq.com` | Nivelo homepage and links to apps; deploy separately when needed. |
| `tempo.nivelohq.com` | Tempo frontend and `/api/*`, deployed together on `nivelo-tempo`. |
| Other app subdomains | Give each app its own Worker, secrets, and database/storage as needed. |

Use one Cloudflare account and the existing `nivelohq.com` DNS zone. Keep authentication cookies scoped to each app. Choose the final hostname before normal use: browser storage belongs to its origin, so moving later requires exporting and importing local progress.

## What is public and what is not

| Asset | Access |
| --- | --- |
| App shell (JS, CSS, icons) | Public static files. They contain no program content. |
| `/api/auth/*` | Public, rate limited. Sign-up is closed (see below). |
| `/api/corpus/*` (source programs) | Signed-in only. Stored in R2, never a static file. |
| Programs and progress | Generated in the browser and kept in IndexedDB on each device. |

Legacy `public/content/` files have been removed. Keep source programs outside `public/`: anything placed there is a public static asset. Leave the corpus bucket private and serve it only through `/api/corpus/*`.

## First deploy

### 1. Prepare the Cloudflare account

Use the account that owns the `nivelohq.com` zone. In Cloudflare, open **Storage & databases > R2 > Overview** and complete R2 activation if needed. Void will create the app's bucket and database; you do not need to create them manually. See [R2 setup](https://developers.cloudflare.com/r2/get-started/).

### 2. Sign in and deploy from this machine

Stop any `npm run dev` or `npm run preview` process for this project before deploying (Ctrl+C in its terminal). Void 1.2.1's dev-server cleanup can remove `.wrangler/deploy/config.json` while the deployment is using it, especially when provisioning changes the configuration and restarts the dev server. Restart development after deployment finishes.

From the project root:

```sh
npx void connect --platform cloudflare
npx void cloudflare status
npx void deploy --platform cloudflare
```

The first command opens browser sign-in when needed. Check that the deployment account shown by `status` owns the domain. The project already records an account in `void.lock.json`; signing in as another user does not switch that account.

Void builds the app, provisions D1 and private R2, applies `db/migrations/`, and creates `BETTER_AUTH_SECRET`. The configured custom-domain route attaches `tempo.nivelohq.com`; Cloudflare manages its DNS record and HTTPS certificate. Do not manually add a CNAME to a `workers.dev` hostname. See [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Wait until `https://tempo.nivelohq.com` opens the sign-in page. If DNS or TLS is still pending, inspect **Workers & Pages > nivelo-tempo > Settings > Domains & Routes**. `npx void domain status tempo.nivelohq.com` checks the local route configuration; Cloudflare's dashboard shows certificate status.

If deployment fails with `ENOENT` for `.wrangler/deploy/config.json`, stop the dev/preview server and retry with `npx void deploy --platform cloudflare --debug`. Void rebuilds the pointer itself. Keep `void.lock.json`: resources provisioned before the failure are recorded there and reused on retry. Do not delete the database or bucket to recover from this local file error.

### 3. Create the owner account

`SETUP_KEY` is a one-time secret that authorises creating the single owner account. Every sign-up request must carry it in an `x-setup-key` header (`auth.ts`); with the secret unset, or once any account exists, sign-up is refused. It is not your login password. You choose the email and password while creating the account, then delete the key.

**Step 1: set the key** (both options need this). Generate it locally and store it as a secret without echoing it:

```bash
export SETUP_KEY="$(openssl rand -hex 32)"
printf '%s' "$SETUP_KEY" | npx void secret put SETUP_KEY
echo "$SETUP_KEY"   # copy it for Option A; skip for Option B
```

**Step 2, Option A: browser.** Open `https://tempo.nivelohq.com/setup` (not linked from sign-in). Enter the setup key, a name, your email and a password of at least 8 characters, then **Create account**. You are signed in and sent to the app. If an owner already exists, the page says so and offers a link to sign in. A wrong key shows an error under the key field.

**Step 2, Option B: script.** Run in the same shell. Credentials are read at prompts so they stay out of shell history:

```bash
export APP_URL=https://tempo.nivelohq.com
read -r -p "Owner email: " OWNER_EMAIL
read -r -s -p "Owner password: " OWNER_PASSWORD
printf '\n'
export OWNER_EMAIL OWNER_PASSWORD
npm run auth:create-owner      # scripts/create-owner.ts: POSTs /api/auth/sign-up/email with x-setup-key
```

Optional `OWNER_NAME` sets the display name (default `Owner`). The script prints "Owner account created" on success and the HTTP status on failure.

**Step 3: remove the key** once the account exists:

```bash
npx void secret delete SETUP_KEY
unset SETUP_KEY
```

Keep the owner credentials in your password manager; they are used for sign-in and corpus uploads. There is no password-reset email: if you forget the password, reset it from the server with Void CLI access.

### 4. Upload the private source programs

Use the same shell so `APP_URL`, `OWNER_EMAIL`, and `OWNER_PASSWORD` are still available. The upload needs `data/views/index.json` and its referenced files locally. If they are missing but the local parsed source is available, run `npm run persist:views` first.

```sh
npm run corpus:upload
unset OWNER_EMAIL OWNER_PASSWORD
```

The script signs in, uploads the versioned corpus to private R2, and uploads its manifest last. Re-run it whenever the source weeks change. Normal code deployments do not upload or reset the corpus.

### 5. Verify the deployed app

- Open `https://tempo.nivelohq.com` in a private browser window and sign in.
- Generate a program, activate it, and confirm progress survives a reload.
- Load a workout, disconnect, and confirm it remains available offline.
- Without a session, `/api/corpus/manifest.json` must return `401`.
- Legacy `/content/` URLs must not expose workout JSON.

### 6. Enable automatic deployments

After the first local deploy, include the updated `void.lock.json` in the changes merged into `master`, along with the configuration, workflow, and public-content deletions. The lock records the provisioned resources so CI reuses them.

The workflow in `.github/workflows/void-deploy.yml` watches pushes to **master**. It runs `npm ci`, typechecking, and unit tests before deploying through Void.

In GitHub, open **Settings > Secrets and variables > Actions**:

- Add the repository secret `CLOUDFLARE_API_TOKEN`. Scope it to the deployment account and domain. It needs Workers Scripts edit access, D1 and R2 access, and the zone permissions used to manage the configured custom domain. See the installed Void [Cloudflare CI guide](../node_modules/void/docs/integrations/cloudflare.md#deploying-from-ci) and [Cloudflare's GitHub Actions guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).
- Add the repository variable `CLOUDFLARE_WORKERS_SUBDOMAIN` with the account's `workers.dev` subdomain (for example, `my-account`), which Void uses for readiness checks when a version URL is unavailable. This is not `tempo.nivelohq.com`.
- `DATABASE_URL` is unnecessary for this D1 app. `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` are needed only if Cloudflare Access protects deployment readiness.

Owner credentials and the temporary setup key do not belong in GitHub Actions. They are not needed for subsequent code deployments.

Future pushes to `master` deploy to the configured hostname. Keep this GitHub Actions workflow as the deployment path instead of also enabling a separate deployment-on-push integration.

## Local development

`npm run dev` serves local `data/views` through `/api/corpus/*` using a development middleware. Production uses the authenticated Worker route. Create a local owner once with `SETUP_KEY=dev npm run dev` and `npm run auth:create-owner` against `http://localhost:5173`, supplying the same setup key and local owner credentials.

## Tests

`npm run test:e2e` builds nothing itself: run `npm run build` first. It starts the preview server with throwaway credentials, creates a test owner, and uploads the corpus when `data/views` exists.

Unit tests use a synthetic generated-program fixture. The additional corpus tests run only when private local `data/views` files are available; they are skipped in CI.

The browser tests still depend on the removed `/content/` fixtures and a local generated-program export. Those need test-only replacements before the full suite can run from a fresh checkout. The intermittent next-session preview issue is deferred. Browser tests are not part of the deployment workflow; unit tests and typechecking are.

## Offline

The sign-in check is skipped when the device is offline and has signed in before, so the installed app keeps working with no connection. Signing out clears that memory.
