# FireGuard Independent Redeployment Handoff

**Prepared:** 28 August 2026

## 1. Current hosting arrangement

FireGuard is currently a Manus WebDev full-stack project running in Manus-managed **Autoscale** hosting. The Express/tRPC application process, its production frontend serving, and server-side route execution are hosted by the Manus project runtime. The current production domain is `https://firedash-4ykkjf9a.manus.space`.

The supporting services are not all on Manus infrastructure:

| Component | Current location | Independent-redeployment implication |
|---|---|---|
| React/Vite frontend | Served by the Manus production application | Can be rebuilt from the repository with the existing Vite build. |
| Express/tRPC backend | Manus WebDev Autoscale runtime | Requires a Node process or a deliberate serverless adaptation elsewhere. |
| Database | External TiDB Cloud MySQL-compatible endpoint | A new or existing TiDB/MySQL-compatible database and its private connection URL are required. The database is not contained in the source archive. |
| NASA FIRMS relay | External Cloudflare Worker | The existing relay must remain deployed, or an independently operated official-data relay must be configured. |
| Scheduled India-wide refresh | Managed scheduler invokes the backend callback | The handler is in `server/scheduler.ts`; an independent host needs a compatible authenticated scheduler. |
| S3/file storage helpers | Manus built-in Forge/storage integration | Required only for storage-proxy paths that are used; independent hosting needs equivalent credentials/service configuration. |
| OAuth | Manus OAuth services | Independent hosting requires a compatible OAuth registration and callback URLs, or the authentication flow must be replaced deliberately. |

The scheduled refresh is not an in-process `setInterval`. The server performs one startup snapshot refresh, exposes `/api/scheduled/refreshIndiaHotspots`, and the managed scheduler invokes that callback on the configured cadence. If the application is copied to another host without a replacement scheduler, the startup refresh can run, but recurring refreshes will not automatically continue.

## 2. Source code and repository

The connected source repository is:

`https://github.com/SAPSIDED/india-fire-anomaly-dashboard`

The repository branch used by the current project is `main`. A safe source archive accompanies this handoff:

`fireguard-independent-source.zip`

The archive contains the application source, tests, migration files, configuration, research notes, and generated dataset. It intentionally excludes `.git`, `node_modules`, build output, environment files, Manus project metadata, and runtime logs. In particular, `.project-config.json` is excluded because it contains private deployment metadata and secret values.

The repository and archive are source-code handoffs, not database backups. Existing database rows, cache contents, scheduled-job history, Cloudflare Worker configuration, and OAuth registrations must be migrated or recreated separately.

## 3. Database and migration setup

The database schema is defined in `drizzle/schema.ts`. Drizzle is configured by `drizzle.config.ts`, which reads the private `DATABASE_URL` variable and uses the MySQL dialect. The reviewed migration history is under `drizzle/` and currently includes migrations `0000` through `0009` plus the Drizzle metadata snapshots and journal.

For a new independent deployment, create or select a MySQL/TiDB-compatible database, enable TLS/SSL as required by the provider, and provide its connection URL as `DATABASE_URL`. Then install the dependencies and apply the reviewed migration history. The preferred migration command for an already generated migration set is:

```bash
pnpm install --frozen-lockfile
pnpm exec drizzle-kit migrate
```

The repository also defines:

```bash
pnpm db:push
```

That script runs `drizzle-kit generate` followed by `drizzle-kit migrate`. It is useful when intentionally generating a new migration from a schema change, but an independent redeployment of the current schema should first use the reviewed migrations and verify the target database before generating anything new.

The database is not recoverable from this source archive. If the existing FireGuard historical evidence, cache, GPPD, flare-reference, seasonal, snapshot, and user data must be retained, obtain a separate database backup/export from the current TiDB Cloud database before switching hosts.

## 4. Environment-variable names

The names below are required or relevant. **No secret values are included in this handoff.** Values should be supplied through the independent host’s encrypted environment-variable settings, not committed to GitHub and not placed in frontend source files.

### Server-side runtime variables

| Variable | Purpose | Required status |
|---|---|---|
| `DATABASE_URL` | MySQL/TiDB-compatible database connection used by the application and Drizzle. | Required for database-backed functionality. |
| `JWT_SECRET` | Session-cookie signing secret. | Required for authentication/session integrity. |
| `VITE_APP_ID` | Application/OAuth identifier used by the server and frontend configuration. | Required for the existing authentication setup. |
| `OAUTH_SERVER_URL` | OAuth server base URL. | Required for existing Manus OAuth routes. |
| `OWNER_OPEN_ID` | Owner identity used for administrator access. | Required if the existing admin/incident-evidence flow is retained. |
| `OWNER_NAME` | Owner display name/configuration. | Recommended for the existing project configuration. |
| `NASA_FIRMS_MAP_KEY` | Server-side authentication for official NASA FIRMS requests. | Required for live FIRMS retrieval. |
| `FIRMS_RELAY_BASE_URL` | Base URL of the official-data Cloudflare FIRMS relay. | Recommended; the code has a production default, but set it explicitly. |
| `FIRMS_RELAY_AUTH_TOKEN` | Optional backend-to-relay bearer credential. | Optional if the backend is deliberately configured to use the server-side NASA key as relay authentication. |
| `BUILT_IN_FORGE_API_URL` | Server-side Manus Forge/storage/API base URL. | Required for retained Manus Forge/storage integrations. |
| `BUILT_IN_FORGE_API_KEY` | Server-side Manus Forge/storage/API credential. | Required for retained Manus Forge/storage integrations. |
| `NODE_ENV` | Runtime mode; use `production` for the deployed process. | Set by the deployment platform or start command. |
| `PORT` | HTTP listener port supplied by the hosting platform. | Usually supplied by the host; the server defaults to 3000. |

### Browser-exposed configuration variables

These are intentionally prefixed with `VITE_` and may be embedded in the browser bundle. They must not contain private database, JWT, NASA, or Cloudflare credentials.

| Variable | Purpose |
|---|---|
| `VITE_APP_ID` | Browser-side application identifier. |
| `VITE_APP_TITLE` | Website title. |
| `VITE_APP_LOGO` | Logo URL. |
| `VITE_OAUTH_PORTAL_URL` | Browser OAuth portal URL. |
| `VITE_FRONTEND_FORGE_API_URL` | Browser-safe Forge API base URL, if retained. |
| `VITE_FRONTEND_FORGE_API_KEY` | Browser-facing Forge credential expected by the existing frontend integration; review whether it is appropriate for the independent host before enabling it. |
| `VITE_ANALYTICS_ENDPOINT` | Analytics endpoint, if analytics is retained. |
| `VITE_ANALYTICS_WEBSITE_ID` | Analytics site identifier, if analytics is retained. |

### Deployment-only or integration-specific variables

| Variable | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Used to administer/deploy the Cloudflare relay; it is not required by the browser and should not be exposed to the application frontend. |
| `MANUS_WEBDEV_PROJECT_ID` | Manus project metadata; not needed for a non-Manus host unless a retained Manus integration explicitly requires it. |
| `DRIZZLE_DATABASE_URL` | Present in the managed project metadata as a compatibility alias, but the current `drizzle.config.ts` reads `DATABASE_URL`; set it only if an external tool or deployment process explicitly needs the alias. |
| `FIRMS_RELAY_AUTH_TOKEN` | Optional as described above; set it when the relay is configured to require a separate backend bearer token. |

The current code also uses the test-only `VITEST` variable during automated tests. It is not a production secret and should not be enabled in the production server process.

## 5. Exact package commands

The project declares `pnpm@10.4.1` in `package.json` and uses an ES-module Node runtime. The standard independent deployment sequence is:

```bash
pnpm install --frozen-lockfile
pnpm exec drizzle-kit migrate
pnpm run check
pnpm test
pnpm run build
NODE_ENV=production pnpm start
```

The package scripts are:

```text
pnpm dev      -> NODE_ENV=development tsx watch server/_core/index.ts
pnpm build    -> vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
pnpm start    -> NODE_ENV=production node dist/index.js
pnpm check    -> tsc --noEmit
pnpm test     -> vitest run
pnpm db:push  -> drizzle-kit generate && drizzle-kit migrate
```

The production process must bind to the port supplied by the host through `PORT`. Do not hardcode a platform-specific port in an independent deployment wrapper.

## 6. Runtime routes and operational requirements

The main API is mounted under `/api/trpc`. The existing frontend calls the tRPC procedures through the configured client. The scheduled callback is:

```text
POST /api/scheduled/refreshIndiaHotspots
```

That route authenticates the request as a scheduler request and returns a JSON result containing the row count, active official FIRMS source, and fetch timestamp. An independent scheduler must provide whatever authentication mechanism is accepted by the target runtime; a public unauthenticated cron endpoint should not be created.

The backend startup also initializes the public India gas-flare reference and seasonal agricultural context asynchronously. These are non-blocking and failure-safe, but an independent database must contain or reload the corresponding reference data if the same historical/context behavior is required.

## 7. What this handoff does not provide

This handoff does not include secret values, production database contents, a database dump, Cloudflare dashboard ownership, OAuth application ownership, or an independent replacement for Manus’s scheduler. It also does not migrate the application to Vercel Functions. The current code is a Node/Express/tRPC server and should first be run as a Node service on a compatible host.

The safest independent migration order is to restore the database, configure private environment variables, start the backend on a temporary HTTPS domain, verify `/api/trpc` and a real FIRMS request, configure the OAuth callback, configure the authenticated scheduled callback, and only then point a frontend deployment at the backend.

## 8. Current handoff status

The backend source and migration files are available from the GitHub repository and the accompanying safe archive. The production backend is currently Manus-hosted; the database is external TiDB Cloud; the NASA FIRMS relay is an external Cloudflare Worker; and recurring refresh dispatch is managed by the Manus scheduler calling the backend callback. No secret value is written in this handoff document.
