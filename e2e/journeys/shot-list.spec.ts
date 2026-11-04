import { expect, test } from '@playwright/test'

import { api } from './helpers'

/**
 * L4 主流程④：镜头表（docs/references/testing.md「测试标准」；镜头表 = 画布节点）。
 *
 * 真接口建一个带一张镜头卡（`shotNo: 1`）的项目并设为当前项目——⚠ 桌面「添加节点」菜单
 * 加出来的镜头卡不带镜号、进不了镜头表（只有镜头带 / 助手排镜才编号），所以这一跳不走点击。
 * 之后全走界面：画布 → 镜头表里有这一行 → 写一句描述 → 存库 → 刷新后还在 → 回画布。
 */
test('镜头表：写一句描述 → 存库 → 刷新还在', async ({ page }) => {
  await page.goto('/en/studio/image')

  const created = await api<{ id: string }>(
    page,
    'POST',
    '/api/node-workflow/projects',
    {
      name: `E2E 镜头表 ${Date.now() % 100000}`,
      state: {
        version: 4,
        nodes: [
          {
            id: 'n_shot_1',
            position: { x: 0, y: 0 },
            data: {
              kind: 'video',
              subtype: 'shot',
              name: '镜1',
              label: '镜1',
              status: 'idle',
              createdAt: new Date().toISOString(),
              shotNo: 1,
            },
          },
        ],
        edges: [],
      },
    },
  )
  expect(created.success, `建项目失败：${created.error}`).toBe(true)
  const projectId = created.data!.id
  const activated = await api(
    page,
    'POST',
    `/api/node-workflow/projects/${projectId}/activate`,
  )
  expect(activated.success, `设当前项目失败：${activated.error}`).toBe(true)

  const openTable = async () => {
    await page.goto('/en/studio/node')
    await page.getByRole('button', { name: 'Shot list', exact: true }).click()
    await expect(page.getByText('1 shots')).toBeVisible()
  }

  await openTable()
  const note = `雪地里一只狐狸回头 ${Date.now()}`
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes(`/api/node-workflow/projects/${projectId}`) &&
      (response.request().postData() ?? '').includes(note),
    { timeout: 20_000 },
  )
  const cell = page.getByPlaceholder('What happens in this shot…').first()
  await cell.fill(note)
  await cell.blur()
  expect((await saved).ok(), '存库那一下失败').toBe(true)

  await openTable() // 重新进页面：读的是库里的那份
  await expect(
    page.getByPlaceholder('What happens in this shot…').first(),
  ).toHaveValue(note)

  await page.getByRole('button', { name: 'Back to canvas' }).click()
  await expect(
    page.getByRole('button', { name: 'Shot list', exact: true }),
  ).toBeVisible()
})
