/**
 * L2a 真库：Seedance 提示词规划。路由走真的（库里的 key + 助手那一家），
 * 只假边界：文字模型那一跳（llm-text）。核的是发给模型的那段话和回来的结构。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const llm = vi.hoisted(() => ({ completion: vi.fn() }))
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: llm.completion,
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { createSeedancePromptPlan } from '@/services/prompts/seedance-prompt-plan.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

const VALID_PLAN = {
  title: 'Rain Window Cat',
  visualDescription:
    'A fluffy orange tabby watches rain from a warm wooden windowsill.',
  timeline: [
    {
      startSecond: 0,
      endSecond: 4,
      action: 'The cat watches raindrops trace the glass.',
      camera: 'Medium close-up with a slow push-in.',
      composition: 'Cat profile against cool rainy city blur.',
    },
  ],
  motion: 'Subtle ear twitches, slow push-in, gentle rain movement.',
  camera: 'Cinematic close-up, shallow depth of field.',
  duration: '8s',
  audioIntent: 'Gentle rain on glass, distant soft thunder, no music.',
  finalPrompt:
    'A fluffy orange tabby cat sits on a windowsill watching rain. 0-4s: medium close-up, slow push-in.',
  copyRisk: 'low',
}

let clerkId: string

/** 发给模型的那一次请求（最后一次）。 */
function sent(): { systemPrompt: string; userPrompt: string } & Record<
  string,
  unknown
> {
  const calls = llm.completion.mock.calls
  return calls[calls.length - 1]![0]
}

beforeEach(async () => {
  await resetDatabase()
  llm.completion.mockReset()
  llm.completion.mockResolvedValue(JSON.stringify(VALID_PLAN))
  const user = await createTestUser()
  await seedAssistantKey(user.id, AI_ADAPTER_TYPES.GEMINI)
  clerkId = user.clerkId
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createSeedancePromptPlan', () => {
  it('「自动」走她那把 Gemini，回校验过的规划', async () => {
    const result = await createSeedancePromptPlan(clerkId, {
      idea: 'A cat sitting on a windowsill watching rain',
      plannerProvider: 'auto',
      locale: 'en',
    })

    expect(result.plan.title).toBe(VALID_PLAN.title)
    expect(result.planner.adapterType).toBe(AI_ADAPTER_TYPES.GEMINI)
    expect(sent()).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      apiKey: 'sk-test-not-a-real-key',
      modelId: result.planner.modelId,
      responseFormat: 'json_object',
    })
  })

  it('系统提示带上 Seedance 运镜规则', async () => {
    await createSeedancePromptPlan(clerkId, {
      idea: 'A cat sitting on a windowsill watching rain',
      plannerProvider: 'auto',
      locale: 'en',
    })

    expect(sent().systemPrompt).toContain('Z-AXIS DEPTH')
    expect(sent().systemPrompt).toContain('rear-right blind spot')
    expect(sent().systemPrompt).toContain('SEEDANCE 2.5 CONTROL RULES')
  })

  it('参考素材写进提示，用 @ImageN / @VideoN / @AudioN 指代；没给就不写那一段', async () => {
    await createSeedancePromptPlan(clerkId, {
      idea: 'A duel at dusk',
      plannerProvider: 'auto',
      locale: 'en',
      references: {
        images: [
          { index: 1, name: 'Alice', kind: 'character' },
          { index: 2, name: '首帧1', category: '首帧' },
        ],
        videoCount: 1,
        audio: [{ characterName: 'Alice' }, {}],
      },
    })
    const prompt = sent().userPrompt
    expect(prompt).toContain('PRODUCTION REFERENCES')
    expect(prompt).toContain('2 reference image(s)')
    expect(prompt).toContain('@Image1 = "Alice" (character)')
    expect(prompt).toContain('@Image2 = "首帧1" (首帧)')
    expect(prompt).toContain('@Video1')
    expect(prompt).toContain('Alice (@Audio1)')

    await createSeedancePromptPlan(clerkId, {
      idea: 'A quiet morning on the balcony',
      plannerProvider: 'auto',
      locale: 'en',
    })
    expect(sent().userPrompt).not.toContain('PRODUCTION REFERENCES')
  })

  it('中文用户要中文的规划', async () => {
    await createSeedancePromptPlan(clerkId, {
      idea: '我想做一个拟人化 AI 工具在酒吧聊天的二次元短片',
      plannerProvider: 'auto',
      locale: 'zh',
    })

    expect(sent().userPrompt).toContain(
      'Write every JSON string value in Simplified Chinese',
    )
    expect(sent().userPrompt).not.toContain('Write finalPrompt in English')
  })

  it.each([
    ['不合格式', JSON.stringify({ title: '' })],
    ['JSON 断了', '{"title":"Broken"'],
  ])('模型回的%s：重试一次后抛结构化的服务商输出错误', async (_, raw) => {
    llm.completion.mockResolvedValue(raw)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    const attempt = createSeedancePromptPlan(clerkId, {
      idea: 'invalid output',
      plannerProvider: 'gemini',
      locale: 'zh',
    })
    let done = false
    const settled = expect(attempt)
      .rejects.toMatchObject({
        errorCode: 'SEEDANCE_PROMPT_PLAN_INVALID_OUTPUT',
        httpStatus: 502,
        i18nKey: 'errors.provider.invalidStructuredOutput',
      })
      .finally(() => {
        done = true
      })
    // 查库是真 I/O（不走假时钟）：让出一拍给它，再把重试的退避时间拨过去。
    while (!done) {
      await new Promise((resolve) => setImmediate(resolve))
      await vi.advanceTimersByTimeAsync(500)
    }
    await settled
    expect(llm.completion).toHaveBeenCalledTimes(2)
  })
})
