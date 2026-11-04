import { expect, test } from '@playwright/test'

import { dumpPage } from './helpers'

/**
 * L4 主流程④：镜头表（docs/references/testing.md「测试标准」；镜头表 = 画布节点）。
 *
 * 第一段：从画布打开镜头表，空项目说「还没有镜头」，能回到画布。
 * TODO 第二段：加一张镜头卡 → 镜头表里出现一行 → 写一句描述 → 刷新后还在（存库那一跳）。
 */
test('画布 → 打开镜头表 → 回画布', async ({ page }) => {
  await page.goto('/en/studio/node')
  await page.getByRole('button', { name: 'Add node', exact: true }).click()
  await dumpPage(page, 'journey_canvas_add_node_menu')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Shot list', exact: true }).click()
  await dumpPage(page, 'journey_shot_list')
  await expect(page.getByText('No shots yet')).toBeVisible()

  await page.getByRole('button', { name: 'Back to canvas' }).click()
  await expect(
    page.getByRole('button', { name: 'Shot list', exact: true }),
  ).toBeVisible()
})
