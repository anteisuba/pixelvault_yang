# PixelVault Execution Worker

This workspace hosts the execution-plane Worker for Phase 3. It still keeps the
original pipe-check endpoints:

- `GET /health`
- `POST /echo`

It now also exposes the Wave 1 Cinematic Short Video dispatch endpoint:

- `POST /workflows/cinematic-short-video`

The Worker does not store provider API keys. A Workflow resolves a key just in
time through Next.js `POST /api/internal/execution/resolve-key`, submits/polls
the provider, and posts a signed result callback to
`POST /api/internal/execution/callback`.

## Local Setup

1. Add the callback secret to the Next.js app in `.env.local`:

   ```env
   INTERNAL_CALLBACK_SECRET=replace-with-local-development-secret
   EXECUTION_WORKER_BASE_URL=http://127.0.0.1:8787
   NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
   ```

   Restart the Next.js dev server after changing these values.

2. Add the same secret for local Worker dev in `workers/execution/.dev.vars`.
   Do not commit this file.

   ```env
   INTERNAL_CALLBACK_SECRET=replace-with-local-development-secret
   ```

3. Keep `workers/execution/wrangler.jsonc` pointed at the local callback URL:

   ```jsonc
   {
     "vars": {
       "INTERNAL_CALLBACK_URL": "http://127.0.0.1:3000/api/internal/execution/callback",
     },
   }
   ```

4. Start the Worker:

   ```bash
   cd workers/execution
   npm install
   npm run dev
   ```

5. Check Worker health:

   ```bash
   curl http://127.0.0.1:8787/health
   ```

6. Check the echo callback pipe:

   ```bash
   curl -X POST http://127.0.0.1:8787/echo \
     -H "Content-Type: application/json" \
     -d '{"runId":"local-ping","kind":"ping","data":{"source":"curl"}}'
   ```

## Resolve-Key Smoke

`/api/internal/execution/resolve-key` requires an HMAC signature over the exact
JSON body. Generate one locally with the same secret used by Next.js:

```bash
BODY='{"runId":"<generationJobId>","apiKeyId":"<userApiKeyId>"}'
SIG=$(node -e "const c=require('crypto'); const b=process.argv[1]; console.log(c.createHmac('sha256', process.env.INTERNAL_CALLBACK_SECRET).update(b,'utf8').digest('hex'))" "$BODY")
curl -X POST http://127.0.0.1:3000/api/internal/execution/resolve-key \
  -H "Content-Type: application/json" \
  -H "X-Execution-Signature: $SIG" \
  -d "$BODY"
```

Expected response is `{"success":true,"data":{"apiKey":"..."}}` only when the
run exists, the job is non-terminal, and the API key belongs to that job owner.

## Workflow Dispatch Smoke

Submit a signed Worker run context to trigger the Workflow:

```bash
BODY='{
  "runId":"<generationJobId>",
  "workflowId":"CINEMATIC_SHORT_VIDEO",
  "providerId":"fal",
  "apiKeyId":"<userApiKeyId>",
  "callbackUrl":"http://127.0.0.1:3000/api/internal/execution/callback",
  "resolveKeyUrl":"http://127.0.0.1:3000/api/internal/execution/resolve-key",
  "timeoutMs":600000,
  "maxAttempts":200,
  "pollIntervalMs":3000,
  "providerInput":{
    "prompt":"cinematic tracking shot over a neon city",
    "modelId":"kling-video",
    "externalModelId":"fal-ai/kling-video/v2.1/master/text-to-video",
    "aspectRatio":"16:9",
    "duration":5,
    "width":1792,
    "height":1024
  }
}'
SIG=$(node -e "const c=require('crypto'); const b=process.argv[1]; console.log(c.createHmac('sha256', process.env.INTERNAL_CALLBACK_SECRET).update(b,'utf8').digest('hex'))" "$BODY")
curl -X POST http://127.0.0.1:8787/workflows/cinematic-short-video \
  -H "Content-Type: application/json" \
  -H "X-Execution-Signature: $SIG" \
  -d "$BODY"
```

Expected Worker response:

```json
{ "workflowInstanceId": "<generationJobId>" }
```

Expected Next.js logs for the full path:

1. video job created
2. Worker dispatch accepted
3. resolve-key called by Worker
4. callback result received
5. video artifact uploaded to R2
6. `generationJob` marked `COMPLETED`

## Deployment Checklist

1. Cloudflare: `wrangler secret put INTERNAL_CALLBACK_SECRET`
2. Vercel: Settings -> Env Vars -> `INTERNAL_CALLBACK_SECRET` for Production
   and Preview
3. Both sides must use the same strong random value:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. Production and Preview should use different secrets.
5. Deploy Worker: `cd workers/execution && npm run deploy`
6. Configure Next.js `EXECUTION_WORKER_BASE_URL`:
   - local: `http://127.0.0.1:8787`
   - production: the deployed Cloudflare Worker URL
