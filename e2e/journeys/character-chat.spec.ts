import { expect, test } from '@playwright/test'

import { api } from './helpers'

/**
 * L4 主流程③：和角色聊天（docs/references/testing.md「测试标准」）。
 *
 * 只替掉边界：DeepSeek 由 `e2e/fake-llm/server.ts` 顶上。⚠ 文字模型不看 key 上的 `baseUrl`、
 * 一律打官方默认地址，CI 用真配置口 `CLOUDFLARE_AI_GATEWAY_URL` 把它改道到假大模型
 * （key 的 `baseUrl` 仍指过去，只为存 key 时那一下验 key 也落在假的上）。应用这一侧全是真的：建角色 → 角色页点「和她聊」→ 助手换成她 →
 * 回首页对话 → 输入框发一句 → 助手主循环真跑、真流式 → 界面上出现模型那句回答。
 */

const FAKE_LLM = process.env.FAKE_LLM_URL ?? 'https://localhost:4011'
const FAKE_REPLY = '（假模型）你好，我收到了。'

test('建一个角色 → 和她聊 → 发一句 → 看到她的回答', async ({ page }) => {
  await page.goto('/en/library/cards')

  const keys = await api<Array<{ id: string; adapterType: string }>>(
    page,
    'GET',
    '/api/api-keys',
  )
  if (!keys.data?.some((key) => key.adapterType === 'deepseek')) {
    const created = await api(page, 'POST', '/api/api-keys', {
      adapterType: 'deepseek',
      providerConfig: { label: 'DeepSeek', baseUrl: FAKE_LLM },
      modelId: 'deepseek',
      label: 'e2e deepseek',
      keyValue: 'sk-e2e-not-a-real-key',
    })
    expect(created.success, `存 key 失败：${created.error}`).toBe(true)
  }

  const name = `E2E 小雪 ${Date.now() % 100000}`
  const card = await api<{ id: string }>(page, 'POST', '/api/character-cards', {
    name,
  })
  expect(card.success, `建角色失败：${card.error}`).toBe(true)

  await page.goto(`/en/library/cards?character=${card.data!.id}`)
  await page.getByRole('button', { name: 'Chat with her' }).click()
  await expect(page).toHaveURL(/\/studio/)

  const message = `你好，我是测试 ${Date.now()}`
  const composer = page.getByRole('combobox', { name: /Tell me/ }).first()
  await composer.fill(message)
  await page.getByRole('button', { name: 'Send', exact: true }).first().click()

  await expect(page.getByText(message).first()).toBeVisible()
  await expect(page.getByText(FAKE_REPLY).first()).toBeVisible({
    timeout: 60_000,
  })

  // 模型那边真收到了这一句（经真提示词拼装、真选路，发到了这把 key 的 baseUrl）。
  // ⚠ 从测试进程去问：浏览器不信那张现签证书，测试进程有 NODE_EXTRA_CA_CERTS。
  const requests = (await (
    await fetch(`${FAKE_LLM}/requests`)
  ).json()) as Array<{
    lastUser: string
  }>
  expect(requests.some((request) => request.lastUser.includes(message))).toBe(
    true,
  )
})
