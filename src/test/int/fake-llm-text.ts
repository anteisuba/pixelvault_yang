/**
 * L2a：文字模型那一跳的假件（替 `@/services/llm-text.service` 的调用两条，其余照用真的）。
 * 按顺序回 `fakeLlm.queue`，吐完回 `fakeLlm.fallback`；每次调用的入参记进 `fakeLlm.calls`。
 * ⛔ 不出网：自带联网一律当不支持，问了就抛。
 *
 * 用法：
 * ```ts
 * vi.mock('@/services/llm-text.service', async (importOriginal) =>
 *   (await import('@/test/int/fake-llm-text')).fakeLlmTextModule(await importOriginal()),
 * )
 * import { fakeLlm } from '@/test/int/fake-llm-text'
 * beforeEach(() => fakeLlm.reset())
 * ```
 */
import type { LlmTextInput } from '@/services/llm-text.service'

/** 一次回答：一段字、一个错（照抛）、或自己决定什么时候回。 */
export type FakeLlmReply = string | Error | (() => Promise<string>)

interface FakeLlm {
  queue: FakeLlmReply[]
  fallback: FakeLlmReply
  calls: LlmTextInput[]
  reset(): void
}

export const fakeLlm: FakeLlm = {
  queue: [],
  fallback: JSON.stringify({ finished: true }),
  calls: [],
  reset() {
    this.queue = []
    this.fallback = JSON.stringify({ finished: true })
    this.calls = []
  },
}

async function answer(input: LlmTextInput): Promise<string> {
  fakeLlm.calls.push(input)
  const reply = fakeLlm.queue.shift() ?? fakeLlm.fallback
  if (reply instanceof Error) throw reply
  return typeof reply === 'function' ? reply() : reply
}

type LlmTextModule = typeof import('@/services/llm-text.service')

export function fakeLlmTextModule(real: LlmTextModule): LlmTextModule {
  return {
    ...real,
    llmTextCompletion: answer,
    llmTextStream: async function* (input: LlmTextInput) {
      yield await answer(input)
    },
    supportsNativeWebSearch: () => false,
    llmNativeWebSearch: async () => {
      throw new Error('native web search is not faked')
    },
  } as LlmTextModule
}
