import { expect, test } from '@playwright/test'

import { api, dumpPage } from './helpers'

/**
 * L4 主流程②：LoRA 挂上 → 卸下 → 再挂回（docs/references/testing.md「测试标准」；
 * 11-03「摘下挂不回去」那一类）。
 *
 * 只替掉边界：收藏这一跳本身不碰 Civitai / HF（它只是带着上游信息建一行），所以用真接口
 * 收藏一把；之后全走界面：LoRA 台「+ LoRA」→ 舞台上开库（11-18 起不再弹居中挑框，是一块
 * `region`「Add LoRA」）→ 收藏栏点卡开详情 → 详情里「Mount」→ 药丸出现 → 收起面板 →
 * 点药丸「卸下」→ 药丸没了 → 再开一次库挂回 → 药丸回来。
 *
 * ⚠ 底模家族用 `Anima`：面板默认「只看能配当前底模的」，详情里装不上的「Mount」不可点；
 * 台上什么都没挂时当前底模是纯底模默认 `LORA_BASE_ONLY_DEFAULT_ID`（Anima DiT Turbo），
 * Civitai 的 baseModel `Anima` 归 `anima-dit` 家族，两次挂（空台上）都能配上。
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
      baseModelFamily: 'Anima',
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
    const panel = page.getByRole('region', { name: 'Add LoRA', exact: true })
    // 面板默认就开在「Favorites」那一栏；点一下只为写明意图（「All」是 Civitai，CI 里没配）。
    await panel.getByRole('tab', { name: 'Favorites', exact: true }).click()
    const card = panel.getByRole('button', {
      name: `View ${name} details`,
      exact: true,
    })
    await card.waitFor({ timeout: 15_000 })
    if (dumpName) await dumpPage(page, dumpName)
    await card.click()
    await panel
      .getByRole('article', { name: `${name} details`, exact: true })
      .getByRole('button', { name: 'Mount', exact: true })
      .click()
    await expect(pill).toBeVisible({ timeout: 15_000 })
    // 收起面板：详情里此时也有一颗「Unmount」，不收起药丸那颗会撞名。
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(panel).toHaveCount(0)
  }

  await mount('journey_lora_picker')
  await dumpPage(page, 'journey_lora_mounted')

  await pill.click()
  await page.getByRole('button', { name: 'Unmount', exact: true }).click()
  await expect(pill).toHaveCount(0)

  await mount()
})
