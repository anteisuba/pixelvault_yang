import { describe, expect, it } from 'vitest'

import {
  getAvailableImageModels,
  getModelFamily,
  getModelMessageKey,
} from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { filterModelSearch, rankModelSearch } from '@/lib/model-picker-search'
import enModels from '@/messages/models/en.json'
import jaModels from '@/messages/models/ja.json'
import zhModels from '@/messages/models/zh.json'

const gptImage = {
  name: ['GPT Image 2', 'gpt-image-2'],
  vendor: ['OpenAI', 'OpenAI'],
}
const novelAi = {
  name: ['NAI Diffusion V4.5', 'nai-diffusion-4-5-full'],
  vendor: ['NovelAI', 'NovelAI'],
}
const gemini = {
  name: ['Nano Banana', 'gemini-3.1-flash-image-preview'],
  vendor: ['Google'],
}

describe('rankModelSearch', () => {
  it('厂商名里的子串不算命中（nai ⛔ 撞进 OpenAI）', () => {
    expect(rankModelSearch('nai', gptImage)).toBeNull()
  })

  it('名字 / 型号 id 子串命中', () => {
    expect(rankModelSearch('nai', novelAi)).toBe('name')
    expect(rankModelSearch('image-2', gptImage)).toBe('name')
  })

  it('厂商按词首命中', () => {
    expect(rankModelSearch('open', gptImage)).toBe('vendor')
    expect(rankModelSearch('goo', gemini)).toBe('vendor')
    expect(rankModelSearch('ogle', gemini)).toBeNull()
  })

  it('空查询全收', () => {
    expect(rankModelSearch('  ', gptImage)).toBe('name')
  })
})

describe('filterModelSearch', () => {
  it('名字命中排在只靠厂商命中的前面，同档保持原顺序', () => {
    const rows = [
      { id: 'gemini', ...gemini },
      { id: 'gpt', ...gptImage },
      { id: 'novel', ...novelAi },
    ]
    // 「novel」：NovelAI 只在厂商上词首命中；没有名字命中的。
    expect(
      filterModelSearch(rows, 'novel', (row) => row).map((row) => row.id),
    ).toEqual(['novel'])
    // 「nai」：只有名字里真带 NAI 的那条，GPT Image 不再混进来。
    expect(
      filterModelSearch(rows, 'nai', (row) => row).map((row) => row.id),
    ).toEqual(['novel'])
  })

  it('名字命中在前', () => {
    const rows = [
      { id: 'vendor-only', name: ['Seedream'], vendor: ['Nano Labs'] },
      { id: 'name-hit', name: ['Nano Banana'], vendor: ['Google'] },
    ]
    expect(
      filterModelSearch(rows, 'nano', (row) => row).map((row) => row.id),
    ).toEqual(['name-hit', 'vendor-only'])
  })
})

/**
 * 用**真实目录**（`MODEL_OPTIONS` + `messages/models` 三语译名）造搜索字段，和选单
 * 行的形状一致：名字 = 完整译名 + 型号 id；厂商 = 系列名 + provider 名。
 * 11-19 第二轮真机：手写夹具里 GPT Image 的名字不带「OpenAI」，测试绿而真机仍错。
 */
describe('真实目录：搜 nai', () => {
  const locales = { zh: zhModels, en: enModels, ja: jaModels }
  for (const [locale, messages] of Object.entries(locales)) {
    it(`${locale}：不返回 provider 为 OpenAI 的模型`, () => {
      const labels = messages.Models as Record<string, { label: string }>
      const rows = getAvailableImageModels().map((model) => ({
        model,
        fields: {
          name: [
            labels[getModelMessageKey(model.id)]?.label ?? model.id,
            model.id,
            model.externalModelId,
          ],
          vendor: [
            getModelFamily(model.id) ?? '',
            model.providerConfig.label,
            model.adapterType,
          ],
        },
      }))
      // 前提：目录里真有 OpenAI 的图片模型，且译名里真带「OpenAI」（否则这条测不到）。
      const openAi = rows.filter(
        (row) => row.model.adapterType === AI_ADAPTER_TYPES.OPENAI,
      )
      expect(openAi.length).toBeGreaterThan(0)
      expect(openAi.some((row) => /openai/i.test(row.fields.name[0]!))).toBe(
        true,
      )

      const hits = filterModelSearch(rows, 'nai', (row) => row.fields)
      expect(
        hits.filter((row) => row.model.adapterType === AI_ADAPTER_TYPES.OPENAI),
      ).toEqual([])
      // 正向：拼型号的一截照样搜得到。
      expect(
        filterModelSearch(rows, '2.6', (row) => row.fields).some(
          (row) => row.model.adapterType === AI_ADAPTER_TYPES.OPENAI,
        ),
      ).toBe(true)
    })
  }
})
