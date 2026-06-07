# Testing & Visual Regression

How to run the suites and the non-obvious gotchas to avoid.

## Suites

| Suite             | Command                                  | Where                  |
| ----------------- | ---------------------------------------- | ---------------------- |
| Unit (Vitest)     | `npm run test` / `npm run test:run`      | `src/**/*.test.ts(x)`  |
| E2E (Playwright)  | `npx playwright test`                    | `e2e/`                 |
| Visual regression | `npx playwright test e2e/visual.spec.ts` | `e2e/*.visual.spec.ts` |

Pre-push hook already runs `tsc --noEmit` + `lint` + `vitest run`. CI (`ci.yml`)
runs type-check, lint, unit tests, and a schema/security audit. **E2E / visual
regression are NOT in CI yet** — see the caveats below for why.

## Visual regression

Specs use `toHaveScreenshot`. They run against the dev server
(`playwright.config.ts` → `webServer: npm run dev`, `reuseExistingServer`).

- **Run / check:** `npx playwright test e2e/visual.spec.ts`
- **Intentional UI change → update baselines:**
  `npx playwright test e2e/visual.spec.ts --update-snapshots`
  Then call out which snapshots changed in your PR / report.
- **Studio (authenticated) only:** `npx playwright test --project=studio`

### ⚠️ Caveat 1 — baselines are per-OS (`-win32` / `-darwin` / `-linux`)

Screenshots render differently per operating system (fonts, anti-aliasing), so
`toHaveScreenshot` namespaces baselines by platform: `studio-studio-win32.png`,
`studio-studio-darwin.png`, etc. Playwright auto-selects the set matching the
machine it runs on.

**This repo is developed on both PC (Windows) and Mac.** Commit a baseline set
for **each OS you develop on**:

- Currently committed: `-win32.png` (generated on Windows).
- **Next time on the Mac**, generate the macOS set once and commit it:
  `npx playwright test --update-snapshots` → produces `-darwin.png`.

After that each machine uses its own baselines automatically — no Docker, no CI
needed.

> **Maintenance:** an intentional UI change only updates the baselines on the OS
> you regenerate on; the other OS's set goes stale until you switch to that
> machine and re-run `--update-snapshots`. (Solo + git keeps both in sync.)

> **CI later (optional):** to run visual regression in CI (Linux), generate a
> matching `-linux.png` set in the official Playwright container and commit it —
> CI's Linux rendering won't match win32/darwin baselines:
>
> ```bash
> docker run --rm -v "${PWD}:/work" -w /work \
>   mcr.microsoft.com/playwright:v1.59.1-jammy \
>   npx playwright test e2e/visual.spec.ts --update-snapshots
> ```

### ⚠️ Caveat 2 — the studio baseline depends on the test user's state

`e2e/studio.visual.spec.ts` captures the signed-in studio. Its baseline bakes in
the test user's current state: the onboarding card ("Step 1 / 3"), the
"no model selected" prompt area, and **no configured API key**. If the test user
later dismisses onboarding or configures a key, the baseline will diff.

Keep the E2E test user in a clean, stable state, or mask the volatile regions:

```ts
await expect(page).toHaveScreenshot('studio.png', {
  mask: [
    page.locator('[data-onboarding]'),
    page.locator('[data-vercel-toolbar]'),
  ],
})
```

> The Vercel Toolbar ("N | … Issue") is intentionally left visible (it surfaces
> errors during dev). Its issue count is dynamic — if it ever flips a baseline,
> that's the toolbar, not a real UI regression; mask it or disable
> `NEXT_PUBLIC_ENABLE_VERCEL_TOOLBAR` for the test run.

### Authenticated specs (Clerk)

`e2e/global.setup.ts` mints a Clerk testing token; `e2e/auth.setup.ts` signs in
the test user and saves `storageState` to `e2e/.auth/user.json` (gitignored). The
`studio` Playwright project reuses it. Requires a Clerk **development** instance
and the `E2E_CLERK_USER_*` vars (see `.env.example`).

## Testing API keys

PixelVault has **two key layers** (see `.env.example` header):

1. **System / platform keys** (`HF_API_TOKEN`, `GEMINI_API_KEY`, `FAL_API_KEY`,
   …) → read from env by `src/lib/platform-keys.ts`. Fallback for free-tier
   generation + model health checks. **To test generation locally, put test keys
   in `.env.local` under these names.**
2. **User (bring-your-own) keys** → entered in-app via `QuickSetupDialog`,
   encrypted with `API_KEY_ENCRYPTION_SECRET`, stored per-user in the DB. **Not
   set via env.** To test the BYO flow, configure a key in the app for your
   signed-in test user; for automated E2E, seed it through the api-keys API.

### 🔒 Test keys are test-only

Any key used for local dev / testing **must** be a throwaway / dev-instance /
spend-capped key. **Never reuse a production API key for testing, and never let a
test key reach production.** `.env.local` is gitignored; keep it that way.
