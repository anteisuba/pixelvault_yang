import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockSubmit = vi.fn()
const mockWait = vi.fn()
vi.mock('@/services/image/submit-image.service', () => ({
  submitImageGeneration: (...args: unknown[]) => mockSubmit(...args),
  waitForImageGenerationResult: (...args: unknown[]) => mockWait(...args),
}))

import { getTransformPresetById } from '@/constants/transform-presets'
import { TransformInputSchema } from '@/types/transform'
import { handleStyleTransform } from './handle-style-transform'

describe('handleStyleTransform', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubmit.mockResolvedValue({ jobId: 'job_1' })
    mockWait.mockResolvedValue({ id: 'gen_1', url: 'https://cdn/x.png' })
  })

  it('预设：按预设的型号出图', async () => {
    const preset = getTransformPresetById('preset-watercolor')
    const input = TransformInputSchema.parse({
      input: { data: 'https://cdn/subject.png' },
      subject: { imageData: 'https://cdn/subject.png' },
      style: { type: 'preset', presetId: 'preset-watercolor' },
      transformation: { type: 'style' },
      variants: 1,
    })

    await handleStyleTransform('clerk_1', input)

    expect(mockSubmit).toHaveBeenCalledWith(
      'clerk_1',
      expect.objectContaining({ modelId: preset?.modelId }),
    )
  })

  it('风格卡已下线：style_card 过不了请求校验', () => {
    const parsed = TransformInputSchema.safeParse({
      input: { data: 'https://cdn/subject.png' },
      subject: { imageData: 'https://cdn/subject.png' },
      style: { type: 'style_card', cardId: 'style_1' },
      transformation: { type: 'style' },
      variants: 1,
    })
    expect(parsed.success).toBe(false)
  })
})
