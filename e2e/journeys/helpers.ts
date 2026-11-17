import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { Page } from '@playwright/test'

/**
 * L4 冒烟要打开的每个台、每个库页（smoke.spec.ts 与 tap-targets.spec.ts 共用）。
 * ⭐ 新页面 / 新台 / 新库页：在这里加一行。
 */
export const SMOKE_PAGES = [
  '/en/studio',
  '/en/studio/image',
  '/en/studio/image/tags',
  '/en/studio/video',
  '/en/studio/audio',
  '/en/studio/3d',
  '/en/studio/edit',
  '/en/studio/lora',
  '/en/studio/node',
  '/en/library/assets',
  '/en/library/cards',
  '/en/library/voices',
  '/en/library/prompts',
  '/en/library/lora',
  '/en/library/gallery',
  '/en/library/tags',
  '/en/library/tavern',
  '/en/settings',
  '/zh/studio/image',
  '/ja/studio/image',
] as const

export interface Envelope<T> {
  success: boolean
  data?: T
  error?: string
  status: number
}

/**
 * 以登录的测试账号调自家接口。⚠ 走页面里的 fetch：Clerk 的会话 cookie 一分钟过期，
 * 页面上的 Clerk 会续；`page.request` 带的是存下来那份，跑久了就 401。
 */
export async function api<T = unknown>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<Envelope<T>> {
  // 先等 Clerk 起来、现拿一张会话令牌：跑到后面（重试时尤其）存下来那张早过期了，直接 fetch 会 401。
  await page.waitForFunction(
    () => (window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded === true,
  )
  return page.evaluate(
    async ({ method, path, body }) => {
      await (
        window as { Clerk?: { session?: { getToken(): Promise<unknown> } } }
      ).Clerk?.session?.getToken()
      const response = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await response.json().catch(() => ({ success: false }))
      return { ...json, status: response.status }
    },
    { method, path, body },
  )
}

/**
 * 存一份这一刻的截图 + 无障碍树到 `e2e/.pages/`（CI 每次传成 artifact「e2e-pages」）：
 * 写下一步用例前看它找按钮 / 输入框的名字。
 */
export async function dumpPage(page: Page, name: string): Promise<void> {
  const dir = path.join(__dirname, '..', '.pages')
  await mkdir(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`) })
  await writeFile(
    path.join(dir, `${name}.aria.yml`),
    await page.locator('body').ariaSnapshot(),
  )
}
