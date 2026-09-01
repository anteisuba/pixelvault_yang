import path from 'node:path'

import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'
import { test as setup, expect, type Page } from '@playwright/test'

/**
 * Signs in a dedicated test user programmatically (no UI form, so Clerk bot
 * detection doesn't trip) and saves the authenticated session to
 * e2e/.auth/user.json. The `studio` project in playwright.config.ts reuses
 * this storageState so studio specs start already signed in.
 *
 * Credentials come from env (set them in .env.local, never commit):
 *   E2E_CLERK_USER_EMAIL=...
 *   E2E_CLERK_USER_PASSWORD=...
 * Create the user once in the Clerk dashboard (development instance).
 */

export const STORAGE_STATE = path.join(__dirname, '.auth', 'user.json')

/**
 * Clerk 保留测试邮箱（`+clerk_test` 子地址）的固定验证码 —— 测试模式下所有
 * email / phone 验证都收这一个码，不需要真实收信。官方为自动化留的口子：
 * https://clerk.com/docs/guides/development/testing/test-emails-and-phones
 *
 * ⚠ 因此 `E2E_CLERK_USER_EMAIL` **必须**是 `xxx+clerk_test@yyy` 形式。换成普通
 * 邮箱时下面这道验证会失败（那个地址收不到真实邮件）。
 */
const CLERK_TEST_VERIFICATION_CODE = '424242'

/**
 * 过掉 Clerk **Client Trust**（新设备验证）。
 *
 * Client Trust 不是 MFA —— 它住在 Dashboard 的 `Attack protection`，所以
 * Multi-factor 三个策略全关、`Require MFA` 也关的情况下照样生效。它的行为是：
 * 密码校验通过后，只要这个客户端是「新」的，就再要一道邮箱验证码，`signIn`
 * 停在 `needs_second_factor`（对象上 `clientTrustState: "new"`）。
 *
 * 而 `clerk.signIn()` 只在 `status === 'complete'` 时 setActive，遇到这个状态
 * **静默返回** —— 不抛错、不建 session，于是后面 `/en/studio` 被弹回 sign-in。
 *
 * Playwright 每次都是全新 browser context ⇒ 必然是新客户端 ⇒ 必然命中；而人在
 * 自己的浏览器里早已是受信客户端，从来遇不到。这个不对称是它极难查的原因。
 * ⭐ 唯一可靠判据：`signIn` 对象上的 `clientTrustState === 'new'` —— 不是任何
 * MFA 相关字段，查 MFA 设置只会得出「都关着啊」。
 *
 * 这里用 legacy `prepareSecondFactor` / `attemptSecondFactor`（已实测该 clerk-js
 * 版本上存在，且没有更新的 `signIn.mfa.*` 命名空间）。
 */
async function completeClientTrustChallenge(page: Page): Promise<void> {
  const outcome = await page.evaluate(async (code) => {
    const clerk = (
      window as unknown as {
        Clerk?: {
          setActive?: (options: { session: string }) => Promise<void>
          client?: {
            signIn?: {
              status?: string | null
              prepareSecondFactor: (params: {
                strategy: string
              }) => Promise<unknown>
              attemptSecondFactor: (params: {
                strategy: string
                code: string
              }) => Promise<{
                status?: string | null
                createdSessionId?: string | null
              }>
            }
          }
        }
      }
    ).Clerk
    const signIn = clerk?.client?.signIn
    if (!signIn) return 'no-signin-object'

    // Client Trust 与 MFA 复用同一个状态；MFA 未启用时这里只可能是前者。
    if (
      signIn.status !== 'needs_second_factor' &&
      signIn.status !== 'needs_client_trust'
    ) {
      return `skipped:${signIn.status}`
    }

    await signIn.prepareSecondFactor({ strategy: 'email_code' })
    const attempt = await signIn.attemptSecondFactor({
      strategy: 'email_code',
      code,
    })
    if (attempt.status !== 'complete' || !attempt.createdSessionId) {
      return `incomplete:${attempt.status}`
    }
    await clerk?.setActive?.({ session: attempt.createdSessionId })
    return 'complete'
  }, CLERK_TEST_VERIFICATION_CODE)

  if (outcome === 'complete' || outcome.startsWith('skipped:')) return

  throw new Error(
    `Client Trust 二次验证没过（${outcome}）。检查：` +
      `E2E_CLERK_USER_EMAIL 是否为 +clerk_test 形式；` +
      `或在 Clerk Dashboard 的 Development 实例 → Attack protection 关掉 Client Trust。`,
  )
}

setup('authenticate test user', async ({ page }) => {
  // 默认 30s 不够：`global.setup.ts` 暖的是**未登录**的 /en/studio（会被重定向
  // 到 sign-in），登录后的 studio 子树是第一次访问才现编译，冷跑要一分钟以上。
  // 与 global.setup 的 warm-up 同一档，避免把编译时间误报成登录失败。
  setup.setTimeout(180_000)

  const email = process.env.E2E_CLERK_USER_EMAIL
  const password = process.env.E2E_CLERK_USER_PASSWORD
  if (!email || !password) {
    throw new Error(
      'Missing E2E_CLERK_USER_EMAIL / E2E_CLERK_USER_PASSWORD. Add a dedicated ' +
        'Clerk test user and put its credentials in .env.local before running ' +
        'authenticated specs.',
    )
  }

  // Inject the testing token, then load a page where ClerkProvider is mounted.
  await setupClerkTestingToken({ page })
  await page.goto('/en')
  await clerk.loaded({ page })

  await clerk.signIn({
    page,
    signInParams: { strategy: 'password', identifier: email, password },
  })

  // 密码过了不等于登进去了 —— Client Trust 会在这之后再要一道验证（见上面的
  // 函数注释）。没触发时这一步是 no-op。
  await completeClientTrustChallenge(page)

  // Confirm the session actually lands on studio (not bounced to sign-in, and
  // not a 404 — a broken route keeps the /studio URL but renders not-found).
  await page.goto('/en/studio')
  await expect(page).toHaveURL(/\/studio/)
  await expect(page.getByText('This page could not be found')).toHaveCount(0)

  await page.context().storageState({ path: STORAGE_STATE })
})
