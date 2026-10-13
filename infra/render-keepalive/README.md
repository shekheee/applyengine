# ApplyEngine Render keep-alive

This Cloudflare Worker calls the Render API health endpoint every ten minutes.
Render's free web service sleeps after fifteen minutes without inbound traffic,
so the schedule keeps the single ApplyEngine backend warm while staying within
the free monthly instance-hour allowance.

The Worker has no public route and stores no application credentials.

## Deploy

Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, then run:

```sh
npx wrangler deploy --config infra/render-keepalive/wrangler.jsonc
```

The configuration is the source of truth for the `*/10 * * * *` Cron Trigger.
