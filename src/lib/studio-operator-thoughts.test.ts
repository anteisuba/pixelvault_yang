import { describe, expect, it } from 'vitest'

import { parseStudioOperatorThought } from './studio-operator-thoughts'

describe('「我的想法」一句的读法', () => {
  it('决定加深、句尾来源拆出来', () => {
    expect(
      parseStudioOperatorThought(
        '你说过喜欢冷色调，**夜景就走冷蓝**，比例也不换。〔记忆·偏好冷色调〕',
      ),
    ).toEqual({
      parts: [
        { text: '你说过喜欢冷色调，', key: false },
        { text: '夜景就走冷蓝', key: true },
        { text: '，比例也不换。', key: false },
      ],
      source: '记忆·偏好冷色调',
    })
  })

  it('没有标记：整句原样', () => {
    expect(parseStudioOperatorThought('先看一眼台上。')).toEqual({
      parts: [{ text: '先看一眼台上。', key: false }],
      source: null,
    })
  })

  it('落单的 ** 去掉、整句不加深，⛔ 吞字', () => {
    expect(parseStudioOperatorThought('**先只说不改，最后提醒他。')).toEqual({
      parts: [{ text: '先只说不改，最后提醒他。', key: false }],
      source: null,
    })
  })

  it('来源被加粗包着（11-11 实跑）：照样认出来源，前面那句照样加深', () => {
    expect(
      parseStudioOperatorThought('**先只说不改。〔规矩·每条带一个下一步〕**'),
    ).toEqual({
      parts: [{ text: '先只说不改。', key: true }],
      source: '规矩·每条带一个下一步',
    })
    expect(
      parseStudioOperatorThought('**先只说不改。**〔规矩·下一步〕'),
    ).toEqual({
      parts: [{ text: '先只说不改。', key: true }],
      source: '规矩·下一步',
    })
  })

  it('〔〕不在句尾：当字', () => {
    expect(parseStudioOperatorThought('〔记忆〕在前面').source).toBeNull()
  })
})
