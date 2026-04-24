# PixelVault Execution Worker

This workspace is the Phase 3 sub-step 1 execution-plane pipe check. It only proves:

- the Worker can run locally
- Next.js can call the Worker
- the Worker can call back into Next.js
- Next.js verifies `X-Execution-Signature`

It does not run video, audio, provider polling, queues, Durable Objects, or database writes.

## Local Setup

1. Add the same callback secret to the Next.js app in `.env.local`:

   ```env
   INTERNAL_CALLBACK_SECRET=replace-with-local-development-secret
   ```

   Restart the Next.js dev server after adding or changing this value.

2. Keep `workers/execution/wrangler.jsonc` aligned with that secret and with the local callback URL:

   ```jsonc
   {
     "vars": {
       "INTERNAL_CALLBACK_URL": "http://127.0.0.1:3000/api/internal/execution/callback",
       "INTERNAL_CALLBACK_SECRET": "replace-with-local-development-secret",
     },
   }
   ```

3. Start the Next.js app separately. This project keeps app dev server ownership outside Codex-run worker tasks.

4. Start the Worker:

   ```bash
   cd workers/execution
   npm install
   npm run dev
   ```

5. Check Worker health:

   ```bash
   curl http://localhost:8787/health
   ```

6. Check the echo callback pipe:

   ```bash
   curl -X POST http://localhost:8787/echo \
     -H "Content-Type: application/json" \
     -d '{"runId":"local-ping","kind":"ping","data":{"source":"curl"}}'
   ```

The Worker signs the exact callback JSON body with `HMAC-SHA256(secret, body)` and sends the lowercase hex digest in `X-Execution-Signature`.

## Vercel / Cloudflare Deployment

TODO:

- set `INTERNAL_CALLBACK_SECRET` in Vercel
- set matching Worker secret / environment binding in Cloudflare
- replace `INTERNAL_CALLBACK_URL` with the deployed Next.js callback URL
- deploy with `npm run deploy`
