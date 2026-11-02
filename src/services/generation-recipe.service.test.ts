import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockLoraFindMany = vi.fn()
const mockGenerationFindFirst = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    loraAsset: { findMany: (...args: unknown[]) => mockLoraFindMany(...args) },
    generation: {
      findFirst: (...args: unknown[]) => mockGenerationFindFirst(...args),
    },
  },
}))

import {
  buildImageRecipeDraft,
  buildVideoRecipeDraft,
  finalizeGenerationRecipe,
  readGenerationRecipe,
} from './generation-recipe.service'

describe('generation-recipe.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoraFindMany.mockResolvedValue([])
  })

  describe('buildImageRecipeDraft', () => {
    it('keeps the studio inputs, drops server-injected runner fields and enriches LoRAs', async () => {
      mockLoraFindMany.mockResolvedValue([
        {
          id: 'platform-lora',
          userId: null,
          loraUrl: 'https://civitai.com/a',
          name: 'Platform copy',
          baseModelFamily: 'sdxl',
          triggerWord: '',
          civitaiModelId: null,
          civitaiModelVersionId: null,
        },
        {
          id: 'mine',
          userId: 'user-1',
          loraUrl: 'https://civitai.com/a',
          name: 'My Style',
          baseModelFamily: 'illustrious',
          triggerWord: 'mystyle',
          civitaiModelId: 11,
          civitaiModelVersionId: 22,
        },
      ])

      const recipe = await buildImageRecipeDraft({
        userId: 'user-1',
        modelId: 'runner-illustrious',
        prompt: '1girl, smile',
        aspectRatio: '3:4',
        advancedParams: {
          negativePrompt: 'lowres',
          steps: 28,
          loras: [
            { url: 'https://civitai.com/a', scale: 0.8 },
            { url: 'https://example.com/b.safetensors' },
          ],
          runnerLoras: [{ filename: 'a', downloadUrl: 'https://signed' }],
          runnerCheckpoint: { url: 'https://signed' },
        },
        referenceImages: [],
      })

      expect(recipe).toMatchObject({
        version: 1,
        kind: 'image',
        modelId: 'runner-illustrious',
        prompt: '1girl, smile',
        negativePrompt: 'lowres',
        aspectRatio: '3:4',
        seedSource: 'unknown',
        loras: [
          {
            url: 'https://civitai.com/a',
            scale: 0.8,
            loraAssetId: 'mine',
            name: 'My Style',
            baseModelFamily: 'illustrious',
            triggerWord: 'mystyle',
            civitaiModelId: 11,
            civitaiModelVersionId: 22,
          },
          { url: 'https://example.com/b.safetensors' },
        ],
      })
      expect(recipe.advancedParams).not.toHaveProperty('runnerLoras')
      expect(recipe.advancedParams).not.toHaveProperty('runnerCheckpoint')
      expect(recipe.referenceImages).toBeUndefined()
      expect(mockLoraFindMany.mock.calls[0][0].where.OR).toEqual([
        { userId: 'user-1' },
        { userId: null },
      ])
    })

    it('marks a user-typed seed as user', async () => {
      const recipe = await buildImageRecipeDraft({
        userId: 'user-1',
        modelId: 'nai-v5',
        prompt: 'cat',
        advancedParams: { seed: 42 },
      })
      expect(recipe).toMatchObject({ seed: 42, seedSource: 'user' })
      expect(mockLoraFindMany).not.toHaveBeenCalled()
    })
  })

  describe('finalizeGenerationRecipe', () => {
    it('records the provider seed when the user left it random', () => {
      const draft = buildVideoRecipeDraft({
        modelId: 'kling',
        prompt: 'run',
        duration: 5,
      })
      expect(finalizeGenerationRecipe(draft, 1234)).toMatchObject({
        seed: 1234,
        seedSource: 'provider',
      })
    })

    it('never overrides a user seed', () => {
      const draft = buildVideoRecipeDraft({
        modelId: 'kling',
        prompt: 'run',
        seed: 7,
      })
      expect(finalizeGenerationRecipe(draft, 1234)).toMatchObject({
        seed: 7,
        seedSource: 'user',
      })
    })

    it('drops an unreadable draft instead of failing the finalize', () => {
      expect(finalizeGenerationRecipe({ kind: 'nope' }, 1)).toBeUndefined()
      expect(finalizeGenerationRecipe(undefined, 1)).toBeUndefined()
    })
  })

  describe('readGenerationRecipe', () => {
    it('returns null for someone else’s or a missing work', async () => {
      mockGenerationFindFirst.mockResolvedValue(null)
      await expect(readGenerationRecipe('gen-1', 'user-1')).resolves.toBeNull()
      expect(mockGenerationFindFirst.mock.calls[0][0].where).toEqual({
        id: 'gen-1',
        userId: 'user-1',
      })
    })

    it('reads a stored recipe and reports its gaps', async () => {
      mockGenerationFindFirst.mockResolvedValue({
        id: 'gen-1',
        outputType: 'IMAGE',
        prompt: 'cat',
        model: 'nai-v5',
        seed: null,
        snapshot: null,
        recipe: {
          version: 1,
          kind: 'image',
          modelId: 'nai-v5',
          prompt: 'cat',
          seed: 99,
          seedSource: 'provider',
        },
      })

      await expect(readGenerationRecipe('gen-1', 'user-1')).resolves.toEqual({
        generationId: 'gen-1',
        source: 'stored',
        recipe: expect.objectContaining({ seed: 99 }),
        gaps: [],
      })
    })

    it('derives an old image recipe from its snapshot and names what is missing', async () => {
      mockGenerationFindFirst.mockResolvedValue({
        id: 'gen-old',
        outputType: 'IMAGE',
        prompt: 'cat',
        model: 'runner-sdxl',
        seed: null,
        recipe: null,
        snapshot: {
          compiledPrompt: 'cat, masterpiece',
          modelId: 'runner-sdxl',
          // 旧 schema 不认的比例：整份 safeParse 会失败，仍要读出提示词和参数。
          aspectRatio: '2:3',
          advancedParams: {
            loras: [{ url: 'https://civitai.com/a', scale: 1 }],
          },
          referenceImages: ['https://cdn.test/ref.png'],
        },
      })

      const read = await readGenerationRecipe('gen-old', 'user-1')

      expect(read).toMatchObject({
        source: 'derived',
        recipe: {
          kind: 'image',
          prompt: 'cat, masterpiece',
          aspectRatio: '2:3',
          referenceImages: ['https://cdn.test/ref.png'],
          loras: [{ url: 'https://civitai.com/a', scale: 1 }],
        },
        gaps: ['seed', 'loraDetails'],
      })
    })

    it('says the whole recipe is missing for an old video', async () => {
      mockGenerationFindFirst.mockResolvedValue({
        id: 'gen-video',
        outputType: 'VIDEO',
        prompt: 'run',
        model: 'kling',
        seed: null,
        recipe: null,
        snapshot: { executionCallback: {} },
      })

      await expect(
        readGenerationRecipe('gen-video', 'user-1'),
      ).resolves.toMatchObject({
        source: 'none',
        recipe: null,
        gaps: ['recipe'],
      })
    })
  })
})
