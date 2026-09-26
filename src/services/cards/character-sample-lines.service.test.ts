import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const mockFindFirst = vi.fn()
const mockCompletion = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    characterCard: { findFirst: (...a: unknown[]) => mockFindFirst(...a) },
  },
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn().mockResolvedValue({ id: 'u1' }),
}))
vi.mock('@/services/llm-text.service', () => ({
  resolveLlmTextRoute: vi.fn().mockResolvedValue({
    adapterType: 'gemini',
    apiKey: 'k',
    providerConfig: {},
  }),
  llmTextCompletion: (...a: unknown[]) => mockCompletion(...a),
}))

import { sampleCharacterLines } from './character-sample-lines.service'

describe('sampleCharacterLines（试读）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindFirst.mockResolvedValue({
      name: 'Denia',
      persona: { speech: '叫对方「指挥官」', catchphrases: ['呢'] },
    })
  })

  it('把设定写进提示，读回两句', async () => {
    mockCompletion.mockResolvedValue(
      '```json\n{"lines": ["指挥官，看着我呢。", "嘘——秘密。"]}\n```',
    )
    await expect(sampleCharacterLines('clerk', 'card')).resolves.toEqual({
      lines: ['指挥官，看着我呢。', '嘘——秘密。'],
    })
    const [input] = mockCompletion.mock.calls[0]!
    expect(input.userPrompt).toContain('Way of speaking: 叫对方「指挥官」')
    expect(input.userPrompt).toContain('Catchphrases: 呢')
  })

  it('不是本人的卡返回 null；模型没回 JSON 就报错', async () => {
    mockFindFirst.mockResolvedValueOnce(null)
    await expect(sampleCharacterLines('clerk', 'x')).resolves.toBeNull()
    mockCompletion.mockResolvedValue('我不知道')
    await expect(sampleCharacterLines('clerk', 'card')).rejects.toThrow()
  })
})
