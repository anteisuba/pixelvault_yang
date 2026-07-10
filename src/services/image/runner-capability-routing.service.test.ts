import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockGetModelById = vi.fn()
const mockFindRunnerLoraAllowlistEntry = vi.fn()

vi.mock('@/constants/models', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/constants/models')>()
  return {
    ...actual,
    getModelById: (...args: unknown[]) => mockGetModelById(...args),
  }
})

vi.mock('@/constants/runner-checkpoints', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/constants/runner-checkpoints')>()
  return {
    ...actual,
    findRunnerLoraAllowlistEntry: (...args: unknown[]) =>
      mockFindRunnerLoraAllowlistEntry(...args),
  }
})

import { AI_MODELS } from '@/constants/models'
import { resolveRunnerCapableModelId } from './runner-capability-routing.service'

describe('resolveRunnerCapableModelId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the requested model unchanged when no LoRAs are attached', () => {
    const result = resolveRunnerCapableModelId(
      AI_MODELS.ILLUSTRIOUS_XL,
      undefined,
    )
    expect(result).toBe(AI_MODELS.ILLUSTRIOUS_XL)
    expect(mockGetModelById).not.toHaveBeenCalled()
  })

  it('returns the requested model unchanged for models with no runner upgrade target', () => {
    const result = resolveRunnerCapableModelId(AI_MODELS.FLUX_LORA, [
      { url: 'https://civitai.com/api/download/models/999' },
    ])
    expect(result).toBe(AI_MODELS.FLUX_LORA)
  })

  it('stays on the hosted model when the runner target is not available (flag off)', () => {
    mockGetModelById.mockReturnValue({ available: false })
    mockFindRunnerLoraAllowlistEntry.mockReturnValue({
      civitaiModelVersionId: 1672783,
      filename: 'tutenstein-cleo-carter-v1.safetensors',
      family: 'illustrious',
      displayName: 'Tutenstein Cleo Carter V1',
    })

    const result = resolveRunnerCapableModelId(AI_MODELS.ILLUSTRIOUS_XL, [
      { url: 'https://civitai.com/api/download/models/1672783' },
    ])

    expect(result).toBe(AI_MODELS.ILLUSTRIOUS_XL)
  })

  it('stays on the hosted model when no attached LoRA is in the runner allowlist', () => {
    mockGetModelById.mockReturnValue({ available: true })
    mockFindRunnerLoraAllowlistEntry.mockReturnValue(undefined)

    const result = resolveRunnerCapableModelId(AI_MODELS.ILLUSTRIOUS_XL, [
      { url: 'https://civitai.com/api/download/models/999' },
    ])

    expect(result).toBe(AI_MODELS.ILLUSTRIOUS_XL)
  })

  it('upgrades to the runner model when the runner target is available and a LoRA is allowlisted', () => {
    mockGetModelById.mockReturnValue({ available: true })
    mockFindRunnerLoraAllowlistEntry.mockImplementation((url: string) =>
      url.includes('1672783')
        ? {
            civitaiModelVersionId: 1672783,
            filename: 'tutenstein-cleo-carter-v1.safetensors',
            family: 'illustrious',
            displayName: 'Tutenstein Cleo Carter V1',
          }
        : undefined,
    )

    const result = resolveRunnerCapableModelId(AI_MODELS.ILLUSTRIOUS_XL, [
      { url: 'https://civitai.com/api/download/models/1672783' },
    ])

    expect(result).toBe(AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE)
  })
})
