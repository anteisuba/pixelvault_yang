/**
 * 一条能直接塞进接口回包（画廊 / 历史 / 出图结果）的 `GenerationRecord`；按需覆盖字段。
 */
import type { GenerationRecord } from '@/types'

export function generationFixture(
  overrides: Partial<GenerationRecord> & { id: string },
): GenerationRecord {
  return {
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    outputType: 'IMAGE',
    status: 'COMPLETED',
    url: `https://cdn.example.com/${overrides.id}.png`,
    storageKey: `generations/${overrides.id}.png`,
    mimeType: 'image/png',
    width: 1024,
    height: 1024,
    prompt: `prompt ${overrides.id}`,
    model: 'gemini-3-pro-image',
    provider: 'gemini',
    requestCount: 1,
    isPublic: false,
    isPromptPublic: false,
    ...overrides,
  }
}
