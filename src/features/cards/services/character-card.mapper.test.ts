import { describe, expect, it } from 'vitest'

import {
  mapCharacterCardRow,
  mergeCardExtensions,
} from '@/features/cards/services/character-card.mapper'

/** 导入时存下的原卡（`st.card.raw`）只住在服务端：不下发，编辑器整键写回时替它留着。 */
describe('st.card.raw', () => {
  const RAW = { spec: 'chara_card_v2', data: { name: 'Rei', x_unknown: 1 } }
  const existing = {
    'st.card': {
      spec: 'chara_card_v2',
      systemPrompt: 'old',
      raw: RAW,
      rawTruncated: true,
    },
    other: 'stay',
  }

  it('编辑器写回的 st.card 没带原卡：合并时原卡留着，别的格听写回的', () => {
    const merged = mergeCardExtensions(existing, {
      'st.card': { spec: 'chara_card_v2', systemPrompt: 'new' },
    }) as Record<string, Record<string, unknown>>
    expect(merged['st.card']).toEqual({
      spec: 'chara_card_v2',
      systemPrompt: 'new',
      raw: RAW,
      rawTruncated: true,
    })
    expect(merged.other).toBe('stay')
  })

  it('整键删掉 st.card 时原卡跟着走（⛔ 留孤儿）', () => {
    const merged = mergeCardExtensions(existing, { 'st.card': null }) as Record<
      string,
      unknown
    >
    expect(merged['st.card']).toBeUndefined()
  })

  it('下发给浏览器的卡上没有原卡（只留 rawTruncated 标记）', () => {
    const record = mapCharacterCardRow({
      id: 'card-1',
      name: 'Rei',
      tags: [],
      handle: null,
      looks: [],
      persona: null,
      summary: null,
      extensions: existing,
      voiceCardId: null,
      isFavorite: false,
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
      updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    } as unknown as Parameters<typeof mapCharacterCardRow>[0])
    expect(record.tavern).toMatchObject({
      systemPrompt: 'old',
      rawTruncated: true,
    })
    expect(record.tavern).not.toHaveProperty('raw')
  })
})
