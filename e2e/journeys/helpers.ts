import type { Page } from '@playwright/test'

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
  return page.evaluate(
    async ({ method, path, body }) => {
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
