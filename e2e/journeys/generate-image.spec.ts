import { expect, test, type Page } from '@playwright/test'

import { api, type Envelope } from './helpers'

/**
 * L4 主流程①：出一张图 → 进库（docs/references/testing.md「测试标准」）。
 *
 * 只替掉边界：执行 Worker + 服务商由 `e2e/fake-worker/server.ts` 顶上（CI 里起在
 * `EXECUTION_WORKER_BASE_URL`）。应用这一侧全是真的：存 key（加密入库）→ 提交出图
 * （真路由、真扣点、真派发签名）→ 假 Worker 向应用**取 key**（真解密）→ 回调写库 →
 * 状态接口报完成 → 库页把这张图显示出来。
 */

const FAKE_WORKER = process.env.FAKE_WORKER_URL ?? 'http://localhost:4010'
const MODEL_ID = 'gpt-image-2'
const KEY_VALUE = 'openai-e2e-not-a-real-key'

/** 测试账号上一把 OpenAI 的 key（重跑时复用上一次存的）。 */
async function ensureOpenAIKey(page: Page): Promise<string> {
  const listed = await api<Array<{ id: string; adapterType: string }>>(
    page,
    'GET',
    '/api/api-keys',
  )
  expect(listed.success, `列 key 失败：${listed.error}`).toBe(true)
  const existing = listed.data?.find((key) => key.adapterType === 'openai')
  if (existing) return existing.id

  const created = await api<{ id: string }>(page, 'POST', '/api/api-keys', {
    adapterType: 'openai',
    providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
    modelId: MODEL_ID,
    label: 'e2e openai',
    keyValue: KEY_VALUE,
  })
  expect(created.success, `存 key 失败：${created.error}`).toBe(true)
  return created.data!.id
}

test('出一张图 → 状态报完成 → 库里看得到', async ({ page }) => {
  await page.goto('/en/studio/image')
  const apiKeyId = await ensureOpenAIKey(page)

  const prompt = `e2e red square ${Date.now()}`
  const submitted = await api<{ jobId: string }>(
    page,
    'POST',
    '/api/studio/generate',
    { modelId: MODEL_ID, apiKeyId, freePrompt: prompt, aspectRatio: '1:1' },
  )
  expect(submitted.success, `提交失败：${submitted.error}`).toBe(true)
  const jobId = submitted.data!.jobId

  let last: Envelope<{ status: string; errorMessage?: string }> | undefined
  await expect
    .poll(
      async () => {
        last = await api(
          page,
          'GET',
          `/api/studio/generate/status?jobId=${encodeURIComponent(jobId)}`,
        )
        return last.data?.status
      },
      { timeout: 60_000, intervals: [500, 1000, 2000] },
    )
    .toBe('COMPLETED')
  expect(last?.data?.errorMessage).toBeFalsy()

  // 假 Worker 那边真拿到了这把 key（应用解密 → 签名回给 Worker 的整条取 key 链）。
  const runs = (await (await fetch(`${FAKE_WORKER}/runs`)).json()) as Array<{
    apiKey: string
  }>
  expect(runs.map((run) => run.apiKey)).toContain(KEY_VALUE)

  // 库页显示出这一张：图是假 Worker 上那张，库页要么直接用、要么经 /_next/image 转一手。
  await page.goto('/en/library/assets')
  await expect
    .poll(
      () =>
        page
          .locator('img')
          .evaluateAll((images) =>
            images.some((image) =>
              decodeURIComponent(
                (image as HTMLImageElement).currentSrc ||
                  (image as HTMLImageElement).src,
              ).includes('/artifact/'),
            ),
          ),
      { timeout: 20_000 },
    )
    .toBe(true)
})
