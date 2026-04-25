# Email scheduler — operations & runbook (Tier B)

Tier A added the templates and a local preview harness. Tier B adds the scheduler that actually delivers them.

## Architecture at a glance

```
┌──────────────┐   POST every 15min   ┌──────────────────────────┐
│ GitHub       │  Authorization:      │ /api/email-scheduler     │
│ Actions cron │  Bearer <secret>     │ (Cloudflare Pages Fn)    │
└──────────────┘ ────────────────────▶│                          │
                                       │ 1. recover stuck rows    │
                                       │ 2. claim N due rows      │
                                       │    (FOR UPDATE SKIP …)   │
                                       │ 3. for each:             │
                                       │    - lookup capture row  │
                                       │    - check unsub list    │
                                       │    - render Liquid       │
                                       │    - send via Resend     │
                                       │    - mark sent / failed  │
                                       └──────────┬───────────────┘
                                                  │
                                                  ▼
              ┌────────────────────────────────────────────────┐
              │  Supabase                                       │
              │  ├── email_captures (existing)                  │
              │  ├── email_sequence_queue (NEW, mig 009)        │
              │  └── email_unsubscribes  (NEW, mig 009)         │
              └────────────────────────────────────────────────┘
```

Enrollment flow:

```
User submits load calculator → /api/email-capture
   ↓
   transactional results email goes out (existing, unchanged)
   ↓
   email_captures row inserted (existing, unchanged)
   ↓
   enrollPersona1() (NEW)
     ↓
     if user is segment=home + is_diy=false + contractor_stage=not_yet
        AND not in email_unsubscribes
     ↓
     INSERT 4 rows into email_sequence_queue
        scheduled_at: NOW + 30min, +3d, +7d, +14d
```

## Pre-deploy checklist

1. **Apply migration 009** via Supabase SQL Editor → `supabase/migrations/009_email_sequence_queue.sql`. Do this BEFORE merging the PR. Per the 2026-04-19 incident, schema drift causes silent INSERT failures in the Cloudflare Worker.

2. **Set Cloudflare Pages env vars** (Pages → Settings → Environment Variables, both Production AND Preview):
   - `EMAIL_SCHEDULER_SECRET` — a long random string (`openssl rand -hex 32`). Bearer token for cron auth.
   - `UNSUBSCRIBE_SIGNING_KEY` — another long random string. HMAC key for unsubscribe links. **Never rotate without grace period — rotation invalidates every previously-sent unsub link.**

3. **Set GitHub Actions secret**:
   - Repo Settings → Secrets and variables → Actions → New repository secret
   - Name: `EMAIL_SCHEDULER_SECRET` (must match Cloudflare value byte-for-byte)

4. **Verify the build**: locally run `npm run prebuild && npm run build`. The prebuild regenerates `functions/_generated/email-templates.ts` from the .liquid sources; the build then bundles it into the Functions.

5. **Smoke-test the endpoint** before enabling the cron:
   ```bash
   curl -i -X POST https://nailthequote.com/api/email-scheduler \
     -H "Authorization: Bearer <secret>"
   ```
   Expected: `200 {"recovered": 0, "processed": 0}` (no rows enqueued yet).

6. **Enable the GitHub Actions workflow** — it's in `.github/workflows/email-scheduler-cron.yml`. Auto-runs every 15 min once the workflow file is on `main`.

## Day-zero validation

Once the migration is applied and the secrets are configured, validate with one synthetic end-to-end run before letting cron loose:

```bash
# 1. Submit a real load-calc capture as a test user (use your own email).
#    Flow through the wizard so segment=home, is_diy=false, contractor_stage=not_yet.

# 2. Check the queue:
psql "$SUPABASE_URL" -c "SELECT id, email, email_number, scheduled_at, status
                          FROM email_sequence_queue
                          WHERE email = 'you@example.com'
                          ORDER BY email_number;"
# Expect 4 rows, all status=pending.

# 3. Force email_number=0 to fire now:
psql "$SUPABASE_URL" -c "UPDATE email_sequence_queue
                          SET scheduled_at = NOW()
                          WHERE email = 'you@example.com' AND email_number = 0;"

# 4. Trigger the scheduler manually (workflow_dispatch from GH Actions, or curl).
# 5. Check your inbox for the Day 0 email. Confirm:
#    - rendered with your actual sqft/city/tonnage
#    - climate-region paragraph matches your ZIP
#    - subject line includes your tonnage
#    - footer has a working unsubscribe link
# 6. Click the unsubscribe link → confirmation page should load.
# 7. SELECT * FROM email_unsubscribes WHERE email = 'you@example.com'; → row exists
# 8. SELECT status FROM email_sequence_queue WHERE email = 'you@example.com';
#    → email_number 1, 2, 3 should now be 'unsubscribed'.
# 9. Done. Delete the test rows.
```

## Observability

- **GitHub Actions** → repo Actions tab → "Email scheduler tick" → each run shows the response body (processed count + outcomes per row).
- **Cloudflare Pages logs** (`wrangler pages deployment tail`) — the scheduler logs claim counts, errors, and any non-fatal issues.
- **Supabase admin RPC** (Tier C will add a per-row UI) — for now, query directly:
  ```sql
  SELECT status, COUNT(*) FROM email_sequence_queue GROUP BY status;
  SELECT * FROM email_sequence_queue WHERE status = 'failed' ORDER BY claimed_at DESC LIMIT 20;
  ```
- **Resend dashboard** — sent emails appear with the `from: hello@nailthequote.com` filter; bounces/complaints surface there.

## Kill switch

If something goes wrong, three escalating ways to stop sends:

1. **Pause the cron** — Repo → Actions → "Email scheduler tick" → "..." → Disable workflow. New ticks stop firing within seconds.
2. **Cancel queued sends** for a specific user:
   ```sql
   UPDATE email_sequence_queue SET status = 'cancelled'
   WHERE email = 'foo@bar.com' AND status = 'pending';
   ```
3. **Cancel ALL queued sends** (nuclear option):
   ```sql
   UPDATE email_sequence_queue SET status = 'cancelled' WHERE status = 'pending';
   ```

## Tier C additions (admin panel + kill switch + Resend webhook)

Tier C ships:
- **Migration 010** — `system_settings` + `email_send_events` tables + `get_email_sequence_admin` and `set_email_scheduler_paused` RPCs.
- **`/api/resend-webhook`** — receives Resend events (delivered/opened/clicked/bounced/complained) and archives them. Configure in the Resend dashboard with `?secret=<RESEND_WEBHOOK_SECRET>`.
- **Kill switch** — admin button on `/admin/tools/load-calculator/`. The scheduler reads `system_settings.email_scheduler_paused` at the top of every tick (fail-open if the table is missing).
- **Admin panel** — "Email sequence (persona 1)" card on the load-calc admin page showing queue status tiles, per-email engagement (open/click/bounce % from the webhook archive), recent failures, and the kill switch.

### Tier C pre-deploy checklist

1. Apply **migration 010** in Supabase SQL Editor before merging the Tier C PR.
2. Add `RESEND_WEBHOOK_SECRET` to Cloudflare Pages env vars (Production + Preview). `openssl rand -hex 32`.
3. In the Resend dashboard, create a webhook:
   - URL: `https://nailthequote.com/api/resend-webhook?secret=<RESEND_WEBHOOK_SECRET>`
   - Events: `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`, `email.delivery_delayed`
4. Confirm engagement data is flowing: `SELECT event_type, COUNT(*) FROM email_send_events GROUP BY event_type;` should show rows within ~1 hour of the first send post-merge.

### Tier C kill-switch behavior

- Admin clicks "Pause scheduler" → `set_email_scheduler_paused(password, true)` → `system_settings.email_scheduler_paused = true`.
- Next cron tick: scheduler reads `system_settings`, sees `paused=true`, returns `200 {"paused": true, "processed": 0}` without claiming any rows.
- Admin clicks "Resume scheduler" → flips it back to false → scheduler resumes claiming on the next tick.

The kill switch is **fail-open** — if the `system_settings` query errors, the scheduler keeps running. Otherwise a settings-table outage would halt the entire pipeline.

## What ships in Tier D (future)

- Per-row retry / cancel buttons in the admin (today: SQL only).
- Subject-line A/B harness (manifest already has subject option 2; unused at send time).
- Svix signature verification on the Resend webhook (currently URL secret only).
- Other personas (DIY, has_estimates, researching, pro) once their templates ship.

## Failure modes & expected behavior

| Failure | Behavior |
|---|---|
| Resend API 5xx | Row marked `failed` with the error message. NOT retried automatically — Tier C will add manual retry from admin. |
| User submits calculator twice | `ON CONFLICT DO NOTHING` — second submission is a no-op for the queue. Original `scheduled_at` preserved. |
| User unsubscribes mid-sequence | Subsequent due rows hit the unsub check before send → marked `unsubscribed`, no email leaves Resend. |
| Cloudflare Function times out mid-row | Row stuck in `sending`. Recovered to `pending` by the next tick (10-min stuck threshold). |
| Migration 009 not applied | Scheduler returns 500 on the `claim_due_email_sequence_rows` RPC call. Cron job marks the run as failed, surfaces in GH Actions UI. |
| Templates regenerated but commit not pushed | Production runs old templates from the deployed bundle until next build/deploy. Local `npm run prebuild` always fresh. |
