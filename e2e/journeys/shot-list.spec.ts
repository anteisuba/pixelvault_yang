import { expect, test } from '@playwright/test'

import { api } from './helpers'

/**
 * L4 主流程④：镜头表（docs/references/testing.md「测试标准」；镜头表 = 画布节点）。
 *
 * 真接口建一个带一张镜头卡（`shotNo: 1`）的项目并设为当前项目——⚠ 桌面「添加节点」菜单
 * 加出来的镜头卡不带镜号、进不了镜头表（只有镜头带 / 助手排镜才编号），所以这一跳不走点击。
 * 表本身也随项目一起放上画布（`shotlist.board`）——H1 起表是画布上的一张宽卡，没有全屏入口。
 * 之后全走界面：画布上的表里有这一行 → 写一句描述 → 存库 → 刷新后还在。
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
        // 表坐在画布上（H1 起表是画布上的一张宽卡，位置 = shotlist.board）
        shotlist: { board: { x: 0, y: 480 } },
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

  const table = page.getByRole('region', { name: 'Shot list', exact: true })
  const openTable = async () => {
    await page.goto('/en/studio/node')
    // 表要等画布从服务端水化完才合成出来（鉴权 + 列项目），比默认 5 秒久
    await expect(table).toBeVisible({ timeout: 20_000 })
    await expect(table.getByText(/^1 shots/)).toBeVisible()
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
  const cell = table.getByPlaceholder('What happens in this shot…').first()
  await cell.fill(note)
  await cell.blur()
  expect((await saved).ok(), '存库那一下失败').toBe(true)

  await openTable() // 重新进页面：读的是库里的那份
  await expect(
    table.getByPlaceholder('What happens in this shot…').first(),
  ).toHaveValue(note)
})
