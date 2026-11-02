import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models/enum'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  formatUnitPriceAmount,
  getModelUnitPriceByStringId,
} from '@/constants/models/unit-prices'

import {
  IMAGE_COUNT_OPTIONS,
  imageCostEstimate,
  imageFrameReadout,
  imageNodeAcceptsReferences,
  imageQualityOptions,
  imageVersions,
} from './image-node-model'

const openai = {
  adapterType: AI_ADAPTER_TYPES.OPENAI,
  modelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
}

describe('画面弹层的档位：不支持的**禁用不隐藏**', () => {
  it('OpenAI 基础档：xhigh / max 灰掉而不是消失', () => {
    const options = imageQualityOptions(openai)
    expect(options.map((o) => o.value)).toEqual([
      'auto',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ])
    expect(options.find((o) => o.value === 'high')?.disabled).toBe(false)
    expect(options.find((o) => o.value === 'max')?.disabled).toBe(true)
  })

  it('模型覆盖能放开更高的档', () => {
    const options = imageQualityOptions({
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      modelId: AI_MODELS.OPENAI_GPT_IMAGE_25_FLARE,
    })
    expect(options.find((o) => o.value === 'max')?.disabled).toBe(false)
  })

  it('没选模型 / 能力表没声明 → 整段不画（组级不可用）', () => {
    expect(imageQualityOptions(undefined)).toEqual([])
    expect(
      imageQualityOptions({
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        modelId: 'whatever',
      }),
    ).toEqual([])
  })

  it('认不出来的 adapter 不让弹层炸（⛔ 也不给它编一份能力）', () => {
    expect(
      imageQualityOptions({ adapterType: 'nope', modelId: 'x' } as never),
    ).toEqual([])
  })

  it('张数与模型无关，一档都不灰', () => {
    expect(IMAGE_COUNT_OPTIONS.map((o) => o.value)).toEqual(['1', '2', '4'])
    expect(IMAGE_COUNT_OPTIONS.every((o) => !o.disabled)).toBe(true)
  })
})

describe('估价 = 单价 × 张数 × 质量系数', () => {
  const priced = Object.keys(AI_MODELS)
    .map((key) => AI_MODELS[key as keyof typeof AI_MODELS])
    .find((id) => getModelUnitPriceByStringId(id)?.unit === 'image')!
  const unit = getModelUnitPriceByStringId(priced)!.amount

  it('默认一张 auto 档 = 单价本身', () => {
    expect(imageCostEstimate(priced)).toBeCloseTo(unit)
  })

  it('四张 high 档 = 单价 × 4 × 2', () => {
    expect(
      imageCostEstimate(priced, { count: 4, quality: 'high' }),
    ).toBeCloseTo(unit * 8)
  })

  it('缺单价返回 null，⛔ 不写「$0」', () => {
    expect(imageCostEstimate('no-such-model')).toBeNull()
    expect(imageCostEstimate(undefined)).toBeNull()
  })

  it('读数行带的是**算完之后**的那个数，USD 格式化沿用单价那一层', () => {
    const readout = imageFrameReadout('16:9', priced, { count: 2 })
    expect(readout).toBe(`1792×1024 · ${formatUnitPriceAmount(unit * 2)}`)
  })
})

describe('imageVersions：读的是产出版本表', () => {
  it('存量的裸 url 仍算一版', () => {
    expect(
      imageVersions({ kind: 'image', url: 'https://cdn/a.png' } as never),
    ).toEqual(['https://cdn/a.png'])
  })

  it('有版本表时按表列出', () => {
    expect(
      imageVersions({
        kind: 'image',
        url: 'https://cdn/b.png',
        outputs: {
          versions: [
            { id: 'ov_1', url: 'https://cdn/a.png', createdAt: 'x' },
            { id: 'ov_2', url: 'https://cdn/b.png', createdAt: 'x' },
          ],
          cur: 1,
        },
      } as never),
    ).toEqual(['https://cdn/a.png', 'https://cdn/b.png'])
  })
})

describe('imageNodeAcceptsReferences', () => {
  it('shot / character / background / result 能挂参考图，叶子参考图不能', () => {
    expect(imageNodeAcceptsReferences('shot')).toBe(true)
    expect(imageNodeAcceptsReferences('character')).toBe(true)
    expect(imageNodeAcceptsReferences('background')).toBe(true)
    expect(imageNodeAcceptsReferences('result')).toBe(true)
    expect(imageNodeAcceptsReferences('reference')).toBe(false)
  })
})
