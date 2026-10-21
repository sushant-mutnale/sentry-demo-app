# sentry-demo-app

A deliberately broken little service that produces **realistic** Sentry telemetry: structured logs,
breadcrumbs, spans, releases, and multi-frame exceptions. Use it to practise connecting a GitHub repo
to Sentry and debugging with Sentry + Corunner MCP.

```
src/            Fastify server, routes, failure scenarios
public/         tiny browser UI (JS error, unhandled rejection, fetch error, message)
scripts/        smoke runner
logs/app.log    JSON logs (also pretty-printed to stdout)
data/demo.db    SQLite database, created and seeded on boot
```

## Quick start

```bash
git clone <your-repo-url> sentry-demo-app
cd sentry-demo-app
cp .env.example .env      # then paste your Sentry DSN
pnpm install
pnpm dev                  # http://localhost:3000/web
```

The DB is created and seeded automatically (`ord_demo_1001`, `ord_demo_1002`, and the intentionally
malformed `ord_bad_items`). Logs go to `./logs/app.log` and stdout.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | liveness + release/environment |
| GET | `/orders/:id` | DB read inside a `db.sql` span |
| POST | `/checkout` | zod-validated, charges an order (3-frame call chain) |
| POST | `/webhooks/stripe` | `invoice.paid` triggers a fake `StripeInvalidRequestError` |
| POST | `/jobs/run?job=...&fail=1` | 3 attempts, then `JobFailedError` |
| GET | `/admin/boom?fail=<mode>` | one failure at a time |
| GET | `/debug/sentry` | fires every failure mode (10s rate limit) |
| GET | `/web` | browser UI (JS error, rejection, fetch error, message) |

Send `x-user-email` and `x-workspace-id` headers to control the Sentry user/workspace tags.
Responses carry `x-demo-trace-id` for correlation.

## Failure modes

| `?fail=` | What Sentry receives |
| --- | --- |
| `pool` | `PrismaClientKnownRequestError` (`P2024` pool timeout, simulated) |
| `type` | `TypeError: Cannot read properties of undefined (reading 'amount')` |
| `stripe` | `StripeInvalidRequestError: No such customer: 'cus_Qw3rTy9LmN0p'` |
| `zod` | `ZodError: Invalid input: expected number, received string` |
| `timeout` | `TimeoutError: The operation was aborted due to timeout` |
| `redis` | `Error: connect ECONNREFUSED 127.0.0.1:6399` |
| `unhandled` | unhandled rejection captured by the process handler |

```bash
node scripts/smoke.mjs            # hits every mode, prints status + trace id
curl "http://localhost:3000/admin/boom?fail=type"
open http://localhost:3000/web
```

## Link this repo in Sentry

1. Push the repo to GitHub:
   ```bash
   git remote add origin https://github.com/<you>/sentry-demo-app.git
   git push -u origin main
   ```
2. In Sentry: **Settings -> Integrations -> GitHub** -> install the integration and grant access to
   the repo.
3. **Project Settings -> Repositories** (or **Code Mappings**) -> add `sentry-demo-app` and map it to
   your project. This gives stack traces source context and links issues to commits.
4. Set `SENTRY_RELEASE` in `.env` to a commit SHA if you want releases/commits on events; by default
   the app uses `git rev-parse --short HEAD`.
5. Restart, fire `curl "http://localhost:3000/admin/boom?fail=type"`, open the issue in Sentry and
   confirm the stack shows source lines and the commit.

## Debug it with Corunner / Sentry MCP

- "List unresolved issues from release <sha> and group them by culprit."
- "Get the latest event for the P2024 issue and show the request, user and breadcrumbs."
- "Search logs for checkout completed in the last hour and correlate with errors."
- "Which release introduced the checkout TypeError?"

## Notes

- `pool` / `stripe` / `redis` failures are **simulated** (no Prisma/Stripe/Redis accounts needed);
  stack traces, tags, breadcrumbs and error classes match what those libraries emit.
- `redis` connects to port **6399**, which nothing listens on, so it deterministically produces a real
  `ECONNREFUSED`. Point `REDIS_URL` elsewhere if you want it to succeed.
- Without `SENTRY_DSN` the app still runs; telemetry is dropped and a warning is printed.
- `uncaughtException` / `unhandledRejection` are captured but do not exit the process, so the demo
  keeps serving traffic.
