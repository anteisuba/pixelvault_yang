import { describe, expect, it } from 'vitest'

import { toLoraOperatorResults } from '@/hooks/use-lora-operator-host'

/**
 * 装配台结果列 → 结果行卡（切片 3b）。
 *
 * ⚠ 钉的是**筛子**：地址还没回来的那些进了结果行卡就是一格永远加载不出来的灰块，
 * 而它看起来只是「有一张图特别慢」——这类失败没人会去查。
 */
describe('toLoraOperatorResults', () => {
  it('只收跑完且真有地址的那些，⛔ 不拿占位凑数', () => {
    expect(
      toLoraOperatorResults([
        { id: 'r-1', url: 'https://cdn.test/1.png', loraName: 'Ink Wash' },
        { id: 'r-2', url: '' },
        { id: 'r-3', url: '   ' },
        { id: '', url: 'https://cdn.test/4.png' },
        { id: 'r-5', url: 'https://cdn.test/5.png', loraName: null },
      ]),
    ).toEqual([
      { id: 'r-1', url: 'https://cdn.test/1.png', label: 'Ink Wash' },
      { id: 'r-5', url: 'https://cdn.test/5.png' },
    ])
  })

  it('一条都不合格时给空数组（结果行卡整块不渲染，⛔ 不做空占位）', () => {
    expect(toLoraOperatorResults([])).toEqual([])
    expect(toLoraOperatorResults([{ id: 'r-1', url: '' }])).toEqual([])
  })
})
