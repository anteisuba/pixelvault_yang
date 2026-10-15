import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

const mockCompileRecipe = vi.fn()
vi.mock('@/services/kernel/card-recipe-compiler.service', () => ({
  compileRecipe: (...args: unknown[]) => mockCompileRecipe(...args),
}))

const mockSubmit = vi.fn()
const mockWait = vi.fn()
vi.mock('@/services/image/submit-image.service', () => ({
  submitImageGeneration: (...args: unknown[]) => mockSubmit(...args),
  waitForImageGenerationResult: (...args: unknown[]) => mockWait(...args),
}))

import { TransformInputSchema } from '@/types/transform'
import { handleStyleTransform } from './handle-style-transform'

describe('handleStyleTransform', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue({ id: 'db_user_1' })
    mockCompileRecipe.mockResolvedValue({
      compiledPrompt: 'styled',
      modelId: 'model-a',
    })
    mockSubmit.mockResolvedValue({ jobId: 'job_1' })
    mockWait.mockResolvedValue({ id: 'gen_1', url: 'https://cdn/x.png' })
  })

  it('风格卡：编译器拿的是库里的用户 id，⛔ 不是 Clerk id', async () => {
    const input = TransformInputSchema.parse({
      input: { data: 'https://cdn/subject.png' },
      subject: { imageData: 'https://cdn/subject.png' },
      style: { type: 'style_card', cardId: 'style_1' },
      transformation: { type: 'style' },
      variants: 1,
    })

    await handleStyleTransform('clerk_1', input).catch(() => undefined)

    expect(mockEnsureUser).toHaveBeenCalledWith('clerk_1')
    expect(mockCompileRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'db_user_1', styleCardId: 'style_1' }),
    )
  })
})
