/**
 * 正文引用胶囊（契约 §5.2）。这里守三件事，每一件都对应一个明确的取舍：
 *
 * 1. **位置即拼接顺序** —— 胶囊在句子里的位置就是展开后文字的位置。这是整条
 *    功能存在的理由：`mergePromptWithUpstreamText` 把先后写死成「上游永远在前」，
 *    用户无从决定「我的话在前还是分镜文本在前」。
 * 2. **循环引用停在环上**，不整体报错也不无限展开。
 * 3. **查不到的名字降级成字面文字**，不是错误 —— 与「展开为文字（脱钩）」同终态。
 */
import { describe, expect, it } from 'vitest'

import {
  composePromptWithTextNodes,
  expandTextCapsules,
  formatTextCapsule,
  parseTextCapsules,
} from './node-text-capsule'

const TEXTS: Record<string, string> = {
  开场: '夜里的便利店，门口的灯在闪。',
  人物设定: '小林，二十岁，店员。',
  嵌套: '前段。▤人物设定 后段。',
}
const resolve = (name: string) => TEXTS[name]

describe('parseTextCapsules', () => {
  it('按出现顺序扫出胶囊与它们的位置', () => {
    const found = parseTextCapsules('先说 ▤开场 再说 ▤人物设定 完')
    expect(found.map((c) => c.name)).toEqual(['开场', '人物设定'])
    expect(found[0].start).toBe(3)
    expect(
      '先说 ▤开场 再说 ▤人物设定 完'.slice(found[0].start, found[0].end),
    ).toBe('▤开场')
  })

  it('名字不含空白 —— 否则纯文本里划不出胶囊的右边界', () => {
    // 「▤深夜便利店 吧台」只应吃到「深夜便利店」，后面那半是用户的句子。
    expect(parseTextCapsules('▤深夜便利店 吧台')[0].name).toBe('深夜便利店')
  })

  it('没有胶囊时返回空数组（不是 null，调用方不用判两种空）', () => {
    expect(parseTextCapsules('一段普通的提示词，还有一个 @素材名')).toEqual([])
  })
})

describe('expandTextCapsules · 位置即拼接顺序', () => {
  it('⭐ 胶囊在哪，展开的文字就在哪', () => {
    const before = expandTextCapsules('▤开场 然后镜头推近。', resolve)
    const after = expandTextCapsules('镜头推近，之前是 ▤开场', resolve)
    expect(before.prompt).toBe('夜里的便利店，门口的灯在闪。 然后镜头推近。')
    expect(after.prompt).toBe('镜头推近，之前是 夜里的便利店，门口的灯在闪。')
    // 同一个引用，两种顺序 —— 这正是 mergePromptWithUpstreamText 给不了的。
    expect(before.prompt).not.toBe(after.prompt)
  })

  it('嵌套引用一路展开，并把用掉的名字全报出来', () => {
    const out = expandTextCapsules('开头 ▤嵌套 结尾', resolve)
    expect(out.prompt).toBe('开头 前段。小林，二十岁，店员。 后段。 结尾')
    // 调用方要靠这份名单把已展开的上游文本从「前置拼接」里排除，否则发两遍。
    expect(out.expandedNames).toEqual(['嵌套', '人物设定'])
  })

  it('查不到的名字降级成字面文字，不是错误', () => {
    const out = expandTextCapsules('引用一个不存在的 ▤幽灵 收尾', resolve)
    expect(out.prompt).toBe('引用一个不存在的 ▤幽灵 收尾')
    expect(out.expandedNames).toEqual([])
    expect(out.cycleNames).toEqual([])
  })

  it('没有胶囊时原样返回', () => {
    expect(expandTextCapsules('干净的一句话', resolve).prompt).toBe(
      '干净的一句话',
    )
  })
})

describe('expandTextCapsules · 循环引用停在环上', () => {
  const looped: Record<string, string> = {
    甲: '甲说：▤乙',
    乙: '乙说：▤甲',
  }
  const resolveLoop = (name: string) => looped[name]

  it('A → B → A 不无限展开，环上那一处留字面量并报出来', () => {
    const out = expandTextCapsules('起：▤甲', resolveLoop)
    // 展到第二层遇到「甲」已在链上 → 停，保留 ▤甲 字面量。
    expect(out.prompt).toBe('起：甲说：乙说：▤甲')
    expect(out.cycleNames).toEqual(['甲'])
    // ⚠ 其余部分照常展开 —— 用户要的是「把能展的展了，告诉我哪一处成环」，
    // 不是整段拒绝。
    expect(out.expandedNames).toEqual(['甲', '乙'])
  })

  it('自引用（A → A）同样停得住', () => {
    const out = expandTextCapsules('▤自己', (n) =>
      n === '自己' ? '我引用 ▤自己' : undefined,
    )
    expect(out.prompt).toBe('我引用 ▤自己')
    expect(out.cycleNames).toEqual(['自己'])
  })
})

describe('formatTextCapsule', () => {
  it('抹平名字里的空白 —— 与 parseTextCapsules 的「名字不含空白」是同一条规矩', () => {
    expect(formatTextCapsule('深夜 便利店')).toBe('▤深夜便利店')
  })
})

describe('composePromptWithTextNodes · 胶囊优先，其余才前置', () => {
  const allTexts = [
    { name: '开场', text: '夜里的便利店。' },
    { name: '人物设定', text: '小林，二十岁。' },
  ]

  it('⭐ 被胶囊引用的文本在**句中**展开，不再被前置到句首', () => {
    const out = composePromptWithTextNodes({
      ownPrompt: '镜头推近，此时 ▤开场',
      upstreamTexts: [{ name: '开场', text: '夜里的便利店。' }],
      allTexts,
    })
    // ⚠ 关键：句首**没有**那段文字 —— 旧的 mergePromptWithUpstreamText 一定会加。
    expect(out.prompt).toBe('镜头推近，此时 夜里的便利店。')
  })

  it('没被引用的上游文本仍然前置 —— 存量图不写胶囊也照常工作', () => {
    const out = composePromptWithTextNodes({
      ownPrompt: '我的话',
      upstreamTexts: [{ name: '开场', text: '夜里的便利店。' }],
      allTexts,
    })
    expect(out.prompt).toBe('夜里的便利店。\n\n我的话')
  })

  it('引用了 A、上游还连着 B → A 进句中，B 仍前置', () => {
    const out = composePromptWithTextNodes({
      ownPrompt: '此时 ▤开场',
      upstreamTexts: [
        { name: '开场', text: '夜里的便利店。' },
        { name: '人物设定', text: '小林，二十岁。' },
      ],
      allTexts,
    })
    expect(out.prompt).toBe('小林，二十岁。\n\n此时 夜里的便利店。')
  })

  it('胶囊可以引用**没连线**的文本节点 —— 引用不需要先连线', () => {
    const out = composePromptWithTextNodes({
      ownPrompt: '设定是 ▤人物设定',
      upstreamTexts: [],
      allTexts,
    })
    expect(out.prompt).toBe('设定是 小林，二十岁。')
  })

  it('成环的名字报出来，供调用方提示（不许静默）', () => {
    const out = composePromptWithTextNodes({
      ownPrompt: '▤甲',
      upstreamTexts: [],
      allTexts: [
        { name: '甲', text: '甲：▤乙' },
        { name: '乙', text: '乙：▤甲' },
      ],
    })
    expect(out.cycleNames).toEqual(['甲'])
  })
})
