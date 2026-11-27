import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import {
  areNovelAiSpecsEqual,
  mapCharacterSlotRoleToNovelAiKind,
  normalizeNovelAiPreciseReferencesForModel,
  normalizeNovelAiSpecForModel,
  resolveNovelAiPreciseReferenceBaseCaption,
  validateNovelAiPreciseReferencesForModel,
} from '@/lib/novelai-spec'
import type { NovelAiPreciseReference } from '@/types/novelai'

const V45 = AI_MODELS.NOVELAI_V45_FULL
const V5 = AI_MODELS.NOVELAI_V5_FULL
const V5_MEDIUM = AI_MODELS.NOVELAI_V5_FULL_MEDIUM

describe('mapCharacterSlotRoleToNovelAiKind', () => {
  const v45Kinds = ['character', 'style', 'character&style'] as const
  const v5Kinds = ['character', 'style', 'character&style', 'outfit'] as const

  it('按造型槽 role 映射到精确参考 kind，不支持 outfit 时不误标为 character', () => {
    expect(mapCharacterSlotRoleToNovelAiKind('identity', v45Kinds)).toBe(
      'character',
    )
    expect(mapCharacterSlotRoleToNovelAiKind('faceCloseup', v45Kinds)).toBe(
      'character',
    )
    expect(mapCharacterSlotRoleToNovelAiKind('style', v45Kinds)).toBe('style')
    expect(mapCharacterSlotRoleToNovelAiKind('costume', v45Kinds)).toBeNull()
    expect(mapCharacterSlotRoleToNovelAiKind('costume', v5Kinds)).toBe('outfit')
    expect(mapCharacterSlotRoleToNovelAiKind('background', v5Kinds)).toBeNull()
  })

  it('主图若标成 custom/pose 仍兜底映射为 character', () => {
    expect(
      mapCharacterSlotRoleToNovelAiKind('custom', v45Kinds, false),
    ).toBeNull()
    expect(mapCharacterSlotRoleToNovelAiKind('custom', v45Kinds, true)).toBe(
      'character',
    )
  })
})

describe('resolveNovelAiPreciseReferenceBaseCaption', () => {
  it('精确翻译 V5 全部 6 种 base_caption 组合并在 V4.5 自动降级', () => {
    expect(
      resolveNovelAiPreciseReferenceBaseCaption({ kind: 'character' }, true),
    ).toBe('character')
    expect(
      resolveNovelAiPreciseReferenceBaseCaption(
        { kind: 'character', preferSameOutfit: false },
        true,
      ),
    ).toBe('character')
    expect(
      resolveNovelAiPreciseReferenceBaseCaption(
        { kind: 'character', preferSameOutfit: true },
        true,
      ),
    ).toBe('character_mainoutfit')
    expect(
      resolveNovelAiPreciseReferenceBaseCaption({ kind: 'outfit' }, true),
    ).toBe('costume')
    expect(
      resolveNovelAiPreciseReferenceBaseCaption({ kind: 'style' }, true),
    ).toBe('style')
    expect(
      resolveNovelAiPreciseReferenceBaseCaption(
        { kind: 'character&style' },
        true,
      ),
    ).toBe('character&style')
    expect(
      resolveNovelAiPreciseReferenceBaseCaption(
        { kind: 'character&style', preferSameOutfit: true },
        true,
      ),
    ).toBe('character&style')
    expect(
      resolveNovelAiPreciseReferenceBaseCaption(
        { kind: 'character&style', preferSameOutfit: false },
        true,
      ),
    ).toBe('character&style_anyoutfit')
    // V4.5 不支持 preferSameOutfit，统一降回 character / character&style
    expect(
      resolveNovelAiPreciseReferenceBaseCaption(
        { kind: 'character', preferSameOutfit: true },
        false,
      ),
    ).toBe('character')
    expect(
      resolveNovelAiPreciseReferenceBaseCaption(
        { kind: 'character&style', preferSameOutfit: false },
        false,
      ),
    ).toBe('character&style')
  })
})

describe('normalizeNovelAiPreciseReferencesForModel / normalizeNovelAiSpecForModel', () => {
  const mixed: NovelAiPreciseReference[] = [
    {
      id: 'r1',
      url: 'https://cdn.test/char.png',
      kind: 'character',
      strength: 2.5,
      preferSameOutfit: true,
      source: { type: 'user' },
    },
    {
      id: 'r2',
      url: 'https://cdn.test/outfit.png',
      kind: 'outfit',
      strength: 1.5,
    },
    {
      id: 'r3',
      url: 'https://cdn.test/style.png',
      kind: 'style',
      strength: 0.7,
      fidelity: 0.4,
    },
    {
      id: 'r4',
      url: 'https://cdn.test/cs.png',
      kind: 'character&style',
      strength: 1.2,
      preferSameOutfit: false,
      fidelity: 0.8,
    },
  ]

  it('切到 V4.5：剔除 outfit、钳制 strength 到 0–1、剥离 preferSameOutfit、补齐默认 fidelity', () => {
    const out = normalizeNovelAiPreciseReferencesForModel(mixed, V45)
    expect(out).toEqual([
      {
        id: 'r1',
        url: 'https://cdn.test/char.png',
        kind: 'character',
        strength: 1,
        fidelity: 1,
        source: { type: 'user' },
      },
      {
        id: 'r3',
        url: 'https://cdn.test/style.png',
        kind: 'style',
        strength: 0.7,
        fidelity: 0.4,
      },
      {
        id: 'r4',
        url: 'https://cdn.test/cs.png',
        kind: 'character&style',
        strength: 1,
        fidelity: 0.8,
      },
    ])
  })

  it('切到 V5 Full：保留 outfit、0–5 strength 与 preferSameOutfit（含 false），剥离 V4.5 fidelity', () => {
    const out = normalizeNovelAiPreciseReferencesForModel(mixed, V5)
    expect(out).toEqual([
      {
        id: 'r1',
        url: 'https://cdn.test/char.png',
        kind: 'character',
        strength: 2.5,
        preferSameOutfit: true,
        source: { type: 'user' },
      },
      {
        id: 'r2',
        url: 'https://cdn.test/outfit.png',
        kind: 'outfit',
        strength: 1.5,
      },
      {
        id: 'r3',
        url: 'https://cdn.test/style.png',
        kind: 'style',
        strength: 0.7,
      },
      {
        id: 'r4',
        url: 'https://cdn.test/cs.png',
        kind: 'character&style',
        strength: 1.2,
        preferSameOutfit: false,
      },
    ])
  })

  it('切到不支持精确参考的模型（V5 Medium / 非 NAI）：整块裁空返回 undefined', () => {
    expect(
      normalizeNovelAiSpecForModel({ preciseReferences: mixed }, V5_MEDIUM),
    ).toBeUndefined()
    expect(
      normalizeNovelAiSpecForModel(
        { preciseReferences: mixed },
        AI_MODELS.PIXAI_TSUBAKI_2,
      ),
    ).toBeUndefined()
  })

  it('areNovelAiSpecsEqual 准确识别值等价与字段差异', () => {
    const a = {
      preciseReferences: [
        {
          url: 'https://cdn.test/a.png',
          kind: 'character' as const,
          strength: 0.8,
          fidelity: 0.5,
          source: { type: 'card' as const, cardId: 'c1', slotId: 's1' },
        },
      ],
    }
    const b = {
      preciseReferences: [
        {
          url: 'https://cdn.test/a.png',
          kind: 'character' as const,
          strength: 0.8,
          fidelity: 0.5,
          source: { type: 'card' as const, cardId: 'c1', slotId: 's1' },
        },
      ],
    }
    expect(areNovelAiSpecsEqual(a, b)).toBe(true)
    expect(
      areNovelAiSpecsEqual(a, {
        preciseReferences: [{ ...b.preciseReferences[0]!, strength: 0.9 }],
      }),
    ).toBe(false)
  })
})

describe('validateNovelAiPreciseReferencesForModel', () => {
  const validRef: NovelAiPreciseReference = {
    url: 'https://cdn.test/a.png',
    kind: 'character',
    strength: 0.8,
    fidelity: 0.6,
  }

  it('空列表一律放行', () => {
    expect(
      validateNovelAiPreciseReferencesForModel([], V5, {
        hasInpaintMask: true,
      }),
    ).toEqual({ valid: true })
  })

  it('V4.5 多图精确参考（character + style）与叠加重绘均放行', () => {
    expect(
      validateNovelAiPreciseReferencesForModel(
        [
          validRef,
          { url: 'https://cdn.test/style.png', kind: 'style', strength: 0.5 },
        ],
        V45,
        { hasInpaintMask: true },
      ),
    ).toEqual({ valid: true })
  })

  it('V4.5 拒掉 outfit、超范围强度与 preferSameOutfit', () => {
    expect(
      validateNovelAiPreciseReferencesForModel(
        [{ ...validRef, kind: 'outfit' }],
        V45,
        { hasInpaintMask: false },
      ),
    ).toMatchObject({
      valid: false,
      reason: expect.stringContaining('outfit'),
    })
    expect(
      validateNovelAiPreciseReferencesForModel(
        [{ ...validRef, strength: 2 }],
        V45,
        { hasInpaintMask: false },
      ),
    ).toMatchObject({
      valid: false,
      reason: expect.stringContaining('between 0 and 1'),
    })
    expect(
      validateNovelAiPreciseReferencesForModel(
        [{ ...validRef, preferSameOutfit: true }],
        V45,
        { hasInpaintMask: false },
      ),
    ).toMatchObject({
      valid: false,
      reason: expect.stringContaining('Prefer same outfit'),
    })
  })

  it('V5 放行 outfit + 0–5 强度 + preferSameOutfit；拒掉重绘叠加、fidelity、style 上设 preferSameOutfit 与 V5 Medium', () => {
    expect(
      validateNovelAiPreciseReferencesForModel(
        [
          {
            url: 'https://cdn.test/char.png',
            kind: 'character',
            strength: 2.5,
            preferSameOutfit: true,
          },
          {
            url: 'https://cdn.test/outfit.png',
            kind: 'outfit',
            strength: 1.5,
          },
          {
            url: 'https://cdn.test/cs.png',
            kind: 'character&style',
            strength: 3,
            preferSameOutfit: false,
          },
        ],
        V5,
        { hasInpaintMask: false },
      ),
    ).toEqual({ valid: true })

    expect(
      validateNovelAiPreciseReferencesForModel(
        [{ url: 'https://cdn.test/char.png', kind: 'character', strength: 1 }],
        V5,
        { hasInpaintMask: true },
      ),
    ).toMatchObject({
      valid: false,
      reason: expect.stringContaining('inpainting'),
    })
    expect(
      validateNovelAiPreciseReferencesForModel([validRef], V5, {
        hasInpaintMask: false,
      }),
    ).toMatchObject({
      valid: false,
      reason: expect.stringContaining('fidelity'),
    })
    expect(
      validateNovelAiPreciseReferencesForModel(
        [
          {
            url: 'https://cdn.test/s.png',
            kind: 'style',
            strength: 1,
            preferSameOutfit: true,
          },
        ],
        V5,
        { hasInpaintMask: false },
      ),
    ).toMatchObject({
      valid: false,
      reason: expect.stringContaining('only applies to character'),
    })
    expect(
      validateNovelAiPreciseReferencesForModel(
        [{ url: 'https://cdn.test/a.png', kind: 'character', strength: 1 }],
        V5_MEDIUM,
        { hasInpaintMask: false },
      ),
    ).toMatchObject({
      valid: false,
      reason: expect.stringContaining('not supported'),
    })
  })
})
