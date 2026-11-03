import { expect, test } from '@playwright/test'

/**
 * L4 冒烟（docs/references/testing.md「测试标准」）：登录的测试账号把每个台、每个库页打开一遍。
 * 红的条件：页面抛了没接住的异常、落到错误页 / 404、自家 `/api` 回 5xx。
 * 502 / 503 不算：那是「外面的服务连不上 / 没配」（CI 里没有 Fish Audio、Civitai 索引这些），
 * 自家接口按约定就该回这两个、界面照常显示；500 等其它 5xx 才是自家代码出错。
 * ⭐ 新页面 / 新台 / 新库页：在这里加一行。
 */
/** 外部服务不可用时自家接口按约定回的状态码。 */
const UPSTREAM_UNAVAILABLE = new Set([502, 503])

const PAGES = [
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

for (const path of PAGES) {
  test(`打开不崩：${path}`, async ({ page }) => {
    const crashes: string[] = []
    const serverErrors: string[] = []
    page.on('pageerror', (error) => crashes.push(error.message))
    page.on('response', (response) => {
      const url = new URL(response.url())
      if (
        url.pathname.startsWith('/api/') &&
        response.status() >= 500 &&
        !UPSTREAM_UNAVAILABLE.has(response.status())
      )
        serverErrors.push(`${response.status()} ${url.pathname}`)
    })

    const response = await page.goto(path)
    expect(response?.status(), '页面本身的状态码').toBeLessThan(400)
    await page.waitForLoadState('networkidle')

    await expect(page).not.toHaveURL(/\/sign-in/)
    await expect(page.getByText('This page could not be found')).toHaveCount(0)
    await expect(page.getByText('Something went wrong')).toHaveCount(0)
    expect(crashes, '页面抛了没接住的异常').toEqual([])
    expect(serverErrors, '自家接口回了 5xx（502/503 以外）').toEqual([])
  })
}
