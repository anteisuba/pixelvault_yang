/**
 * WP-StyleConsistency-02 · LoRA merge / dedup / Civitai token tests
 *
 * 6 paths:
 *   1. Priority ordering (char > style > styleParam > bg)
 *   2. Deduplication by URL
 *   3. FAL adapter: max 5 LoRAs
 *   4. Replicate adapter: max 1 LoRA
 *   5. Civitai token injection
 *   6. Edge: no LoRAs from any card
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/db', () => ({
  db: {
    characterCard: { findFirst: vi.fn(), findUnique: vi.fn() },
    backgroundCard: { findFirst: vi.fn(), findUnique: vi.fn() },
    styleCard: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}))

vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: vi.fn(),
  resolveLlmTextRoute: vi.fn(),
}))

vi.mock('@/lib/llm-output-validator', () => ({
  validateRecipeFusion: vi.fn((text: string) => text),
}))

vi.mock('@/services/civitai-token.service', () => ({
  getCivitaiTokenByInternalUserId: vi.fn(),
  injectCivitaiToken: vi.fn((url: string, token: string) => {
    if (!url.includes('civitai.com')) return url
    const u = new URL(url)
    u.searchParams.set('token', token)
    return u.toString()
  }),
}))

import { db } from '@/lib/db'
import { compileRecipe } from './recipe-compiler.service'
import { getCivitaiTokenByInternalUserId } from '@/services/civitai-token.service'
import { llmTextCompletion } from '@/services/llm-text.service'

const mockCharFind = vi.mocked(db.characterCard.findFirst)
const mockBgFind = vi.mocked(db.backgroundCard.findFirst)
const mockStyleFind = vi.mocked(db.styleCard.findFirst)
const mockCivitaiToken = vi.mocked(getCivitaiTokenByInternalUserId)
const mockLlm = vi.mocked(llmTextCompletion)

// ─── Fixtures ───────────────────────────────────────────────────

const mkLora = (url: string, scale = 1.0) => ({ url, scale })

const mkStyleCard = (overrides: Record<string, unknown> = {}) => ({
  id: 'style-1',
  name: 'Test Style',
  userId: 'user-1',
  prompt: 'anime style',
  modelId: 'fal-ai/flux-2-pro',
  adapterType: 'fal',
  loras: [],
  advancedParams: null,
  sourceImageUrl: null,
  attributes: null,
  ...overrides,
})

const mkCharCard = (overrides: Record<string, unknown> = {}) => ({
  id: 'char-1',
  name: 'Test Char',
  userId: 'user-1',
  prompt: 'a warrior',
  loras: [],
  sourceImageUrl: null,
  referenceImages: [],
  attributes: null,
  ...overrides,
})

const mkBgCard = (overrides: Record<string, unknown> = {}) => ({
  id: 'bg-1',
  name: 'Test BG',
  userId: 'user-1',
  prompt: 'forest',
  loras: [],
  sourceImageUrl: null,
  ...overrides,
})

// ─── Setup ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockLlm.mockResolvedValue('compiled test prompt')
  mockCivitaiToken.mockResolvedValue(null)
})

// ─── Tests ──────────────────────────────────────────────────────

describe('LoRA merge in compileRecipe', () => {
  it('preserves priority: char > style > styleParam > bg', async () => {
    mockCharFind.mockResolvedValue(
      mkCharCard({ loras: [mkLora('https://hf.co/char-lora', 0.8)] }) as never,
    )
    mockStyleFind.mockResolvedValue(
      mkStyleCard({
        loras: [mkLora('https://hf.co/style-lora', 0.6)],
      }) as never,
    )
    mockBgFind.mockResolvedValue(
      mkBgCard({ loras: [mkLora('https://hf.co/bg-lora', 0.4)] }) as never,
    )

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
      backgroundCardId: 'bg-1',
    })

    const loras = result.advancedParams?.loras ?? []
    expect(loras).toHaveLength(3)
    expect(loras[0].url).toBe('https://hf.co/char-lora')
    expect(loras[1].url).toBe('https://hf.co/style-lora')
    expect(loras[2].url).toBe('https://hf.co/bg-lora')
  })

  it('deduplicates by URL (first occurrence wins)', async () => {
    const sharedUrl = 'https://hf.co/shared-lora'
    mockCharFind.mockResolvedValue(
      mkCharCard({ loras: [mkLora(sharedUrl, 0.8)] }) as never,
    )
    mockStyleFind.mockResolvedValue(
      mkStyleCard({ loras: [mkLora(sharedUrl, 0.3)] }) as never,
    )
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
    })

    const loras = result.advancedParams?.loras ?? []
    expect(loras).toHaveLength(1)
    expect(loras[0].scale).toBe(0.8) // char's scale wins
  })

  it('trims to 5 LoRAs for FAL adapter', async () => {
    const sixLoras = Array.from({ length: 6 }, (_, i) =>
      mkLora(`https://hf.co/lora-${i}`),
    )
    mockCharFind.mockResolvedValue(mkCharCard({ loras: sixLoras }) as never)
    mockStyleFind.mockResolvedValue(
      mkStyleCard({ adapterType: 'fal' }) as never,
    )
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
    })

    const loras = result.advancedParams?.loras ?? []
    expect(loras).toHaveLength(5)
    expect(loras[4].url).toBe('https://hf.co/lora-4')
  })

  it('trims to 1 LoRA for Replicate adapter', async () => {
    mockCharFind.mockResolvedValue(
      mkCharCard({
        loras: [mkLora('https://hf.co/first'), mkLora('https://hf.co/second')],
      }) as never,
    )
    mockStyleFind.mockResolvedValue(
      mkStyleCard({ adapterType: 'replicate' }) as never,
    )
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
    })

    const loras = result.advancedParams?.loras ?? []
    expect(loras).toHaveLength(1)
    expect(loras[0].url).toBe('https://hf.co/first')
  })

  it('injects Civitai token into matching URLs', async () => {
    mockCharFind.mockResolvedValue(
      mkCharCard({
        loras: [
          mkLora('https://civitai.com/api/download/models/12345'),
          mkLora('https://hf.co/non-civitai'),
        ],
      }) as never,
    )
    mockStyleFind.mockResolvedValue(mkStyleCard() as never)
    mockBgFind.mockResolvedValue(null as never)
    mockCivitaiToken.mockResolvedValue('test-token-abc')

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
    })

    const loras = result.advancedParams?.loras ?? []
    expect(loras).toHaveLength(2)
    expect(loras[0].url).toContain('token=test-token-abc')
    // Non-civitai URL gets token param too via map (injectCivitaiToken skips it)
    expect(loras[1].url).toBe('https://hf.co/non-civitai')
  })

  it('returns base advancedParams unchanged when no LoRAs', async () => {
    mockCharFind.mockResolvedValue(null as never)
    mockStyleFind.mockResolvedValue(
      mkStyleCard({ advancedParams: { guidanceScale: 7 } }) as never,
    )
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      styleCardId: 'style-1',
    })

    expect(result.advancedParams?.loras).toBeUndefined()
    expect(result.advancedParams?.guidanceScale).toBe(7)
  })
})
