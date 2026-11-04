import { expect, test } from '@playwright/test'

import { api, dumpPage } from './helpers'

/**
 * L4 主流程②：LoRA 挂上 → 卸下 → 再挂回（docs/references/testing.md「测试标准」；
 * 11-03「摘下挂不回去」那一类）。
 *
 * 只替掉边界：收藏这一跳本身不碰 Civitai / HF（它只是带着上游信息建一行），所以用真接口
 * 收藏一把；之后全走界面：LoRA 台「+ LoRA」→ 挑框里点它 → 挂上 → 药丸出现 →
 * 点药丸「卸下」→ 药丸没了 → 再挑一次 → 药丸回来。
 */
test('LoRA：挂上 → 卸下 → 再挂回', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/en/studio/lora')

  const name = `E2E LoRA ${Date.now() % 100000}`
  const favorited = await api<{ id: string }>(
    page,
    'POST',
    '/api/lora-assets/favorite',
    {
      name,
      triggerWord: 'e2e_trigger',
      loraUrl: `https://civitai.com/api/download/models/${Date.now()}`,
      type: 'style',
      baseModelFamily: 'Illustrious',
      provider: 'civitai',
    },
  )
  expect(favorited.success, `收藏失败：${favorited.error}`).toBe(true)

  await page.reload()
  const pill = page.getByRole('button', {
    name: new RegExp(`^${name} · weight `),
  })

  const mount = async (dumpName?: string) => {
    await page.getByRole('button', { name: 'Add LoRA' }).first().click()
    // 挑框默认开在 Civitai 浏览（CI 里没配，会报加载失败），收藏在「Favorites」那一栏。
    await page
      .getByRole('dialog', { name: 'Pick LoRAs' })
      .getByRole('button', { name: /^Favorites/ })
      .click()
    const pick = page.getByRole('button', { name: `Pick ${name}` })
    if (dumpName) {
      await pick.or(page.getByText(name)).first().waitFor({ timeout: 15_000 })
      await dumpPage(page, dumpName)
    }
    await pick.click()
    await page.getByRole('button', { name: 'Mount 1' }).click()
    await expect(pill).toBeVisible({ timeout: 15_000 })
  }

  await mount('journey_lora_picker')
  await dumpPage(page, 'journey_lora_mounted')

  await pill.click()
  await page.getByRole('button', { name: 'Unmount' }).click()
  await expect(pill).toHaveCount(0)

  await mount()
})
