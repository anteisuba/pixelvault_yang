/**
 * 助手新内核的「模型那一头」假件：替的是**项目外的 SDK 包**（`@ai-sdk/anthropic`、`@ai-sdk/openai`），
 * 应用里 `resolveNextModel` 照真的走（真 key、真接法、真 baseURL），只是 SDK 造出来的模型换成
 * `MockLanguageModelV3`，按排好的回合一步一步回。⛔ 不出网、不用真 key。
 *
 * DeepSeek 那把 key 的两条接法正好各落一个包：新接法（Anthropic 兼容入口）= `fakeModels.main`，
 * 保守接法（OpenAI 兼容 chat）= `fakeModels.fallback`。
 *
 * 用法（`vi.mock` 写在测试文件里）：
 * ```ts
 * vi.mock('@ai-sdk/anthropic', async (importOriginal) =>
 *   (await import('@/test/assistant-bench/fake-model')).fakeAnthropic(await importOriginal()),
 * )
 * vi.mock('@ai-sdk/openai', async (importOriginal) =>
 *   (await import('@/test/assistant-bench/fake-model')).fakeOpenAI(await importOriginal()),
 * )
 * ```
 */
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider'
import { simulateReadableStream } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'

type AnthropicModule = typeof import('@ai-sdk/anthropic')
type OpenAIModule = typeof import('@ai-sdk/openai')

export const fakeModels: {
  main: MockLanguageModelV3
  fallback: MockLanguageModelV3
} = {
  main: scriptedModel([]),
  fallback: scriptedModel([]),
}

export function resetFakeModels(): void {
  fakeModels.main = scriptedModel([])
  fakeModels.fallback = scriptedModel([])
}

export function fakeAnthropic(real: AnthropicModule): AnthropicModule {
  return {
    ...real,
    createAnthropic: ((options) => {
      const provider = real.createAnthropic(options)
      const model = () => fakeModels.main
      return Object.assign(model, provider, {
        languageModel: model,
        messages: model,
        chat: model,
      })
    }) as AnthropicModule['createAnthropic'],
  }
}

export function fakeOpenAI(real: OpenAIModule): OpenAIModule {
  return {
    ...real,
    createOpenAI: ((options) => {
      const provider = real.createOpenAI(options)
      const main = () => fakeModels.main
      const fallback = () => fakeModels.fallback
      return Object.assign(main, provider, {
        languageModel: main,
        responses: main,
        chat: fallback,
      })
    }) as OpenAIModule['createOpenAI'],
  }
}

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
}

export const finish = (
  unified: 'stop' | 'tool-calls',
): LanguageModelV3StreamPart => ({
  type: 'finish',
  finishReason: { unified, raw: undefined },
  usage,
})

export function textTurn(text: string): LanguageModelV3StreamPart[] {
  return [
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: text },
    { type: 'text-end', id: 't' },
    finish('stop'),
  ]
}

export function toolTurn(
  ...calls: { id: string; name: string; input: unknown }[]
): LanguageModelV3StreamPart[] {
  return [
    ...calls.map(
      (call): LanguageModelV3StreamPart => ({
        type: 'tool-call',
        toolCallId: call.id,
        toolName: call.name,
        input: JSON.stringify(call.input),
      }),
    ),
    finish('tool-calls'),
  ]
}

/** 排好的回合：一次调用回一个；排完了回一句「…」。给 `Error` = 那一次厂商报错。 */
export function scriptedModel(
  turns: (LanguageModelV3StreamPart[] | Error)[],
): MockLanguageModelV3 {
  const queue = [...turns]
  return new MockLanguageModelV3({
    doStream: async () => {
      const next = queue.shift() ?? textTurn('…')
      if (next instanceof Error) throw next
      return { stream: simulateReadableStream({ chunks: next }) }
    },
  })
}

/**
 * 吐完 `before` 就一个分片都不出、停在那里（厂商在想 / 在自己联网），等测试 `release()` 才吐 `after`。
 * `started` = 模型已经开始往外吐（`before` 已发出）。之后再调用回一句「…」。
 */
export function heldModel(
  before: LanguageModelV3StreamPart[],
  after: LanguageModelV3StreamPart[],
): {
  model: MockLanguageModelV3
  started: Promise<void>
  release: () => void
} {
  let markStarted!: () => void
  const started = new Promise<void>((resolve) => {
    markStarted = resolve
  })
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let calls = 0
  const model = new MockLanguageModelV3({
    doStream: async ({ abortSignal }) => {
      calls += 1
      if (calls > 1)
        return { stream: simulateReadableStream({ chunks: textTurn('…') }) }
      return {
        stream: new ReadableStream<LanguageModelV3StreamPart>({
          async start(controller) {
            for (const part of before) controller.enqueue(part)
            markStarted()
            // 和真请求一样：被 abort（⏹ / 时间预算硬线）就断流，不再等 `release()`。
            const aborted = new Promise<'aborted'>((resolve) => {
              if (abortSignal?.aborted) resolve('aborted')
              abortSignal?.addEventListener('abort', () => resolve('aborted'), {
                once: true,
              })
            })
            if ((await Promise.race([held, aborted])) === 'aborted') {
              controller.error(abortSignal?.reason)
              return
            }
            for (const part of after) controller.enqueue(part)
            controller.close()
          },
        }),
      }
    },
  })
  return { model, started, release }
}

/** 这一次调用发出去的整段（系统提示 + 消息），拿来查字。 */
export const promptOf = (call: LanguageModelV3CallOptions) =>
  JSON.stringify(call.prompt)
