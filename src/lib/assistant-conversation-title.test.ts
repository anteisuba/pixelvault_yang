import { describe, expect, it } from 'vitest'

import {
  TITLE_MAX_WIDTH,
  deriveAssistantConversationTitle,
  visualWidth,
} from '@/lib/assistant-conversation-title'

/**
 * 会话标题派生的回归闸（owner 2026-09-20 真机第 4 条）。
 *
 * 钉四件事：
 *  ① 参考图提及先剥掉（chip 的两种形态：`@名字` 与「reference image N」短语）；
 *  ② 只取首句；
 *  ③ 上限按**视觉宽度**：CJK 一个字两格、拉丁一格，同一条宽度；
 *  ④ 读不出内容才回 `null`——⛔ 剥成空时退回原文，不吐一个空标题。
 */

describe('deriveAssistantConversationTitle — 剥参考图提及', () => {
  it('⭐ owner 截图那一条：三段 reference image 全剥掉，只留他真正说的话', () => {
    expect(
      deriveAssistantConversationTitle(
        'reference image 1 reference image 2 reference image 3 这几张图的画风抽出来用在新的角色上',
      ),
      // 17 个汉字 = 34 格，刚好在上限里 —— 噪音剥掉之后整句都留得住。
    ).toBe('这几张图的画风抽出来用在新的角色上')
  })

  it('chip 序列化的 `@名字` 也剥（`@Image1` / `@Attachment[...]` / 角色卡）', () => {
    expect(deriveAssistantConversationTitle('@Image1 @Image2 换成黄昏光')).toBe(
      '换成黄昏光',
    )
    expect(
      deriveAssistantConversationTitle('@Attachment[abc%20d] 配上这段音'),
    ).toBe('配上这段音')
    expect(deriveAssistantConversationTitle('@莫宁 走进来')).toBe('走进来')
  })

  it('三语短语各一种说法，大小写与序号都不挑', () => {
    expect(deriveAssistantConversationTitle('Reference Image 2 偏冷')).toBe(
      '偏冷',
    )
    expect(deriveAssistantConversationTitle('参考图 3 的构图照搬')).toBe(
      '的构图照搬',
    )
    expect(
      deriveAssistantConversationTitle('リファレンス画像 1 の色味で'),
    ).toBe('の色味で')
  })

  it('⛔ 剥成空时退回原文 —— 一个噪音标题好过一个空标题', () => {
    expect(deriveAssistantConversationTitle('@Image1 @Image2 @Image3')).toBe(
      '@Image1 @Image2 @Image3',
    )
  })
})

describe('deriveAssistantConversationTitle — 首句与长度', () => {
  it('只取首句（三语句号 + 换行都算收尾）', () => {
    expect(deriveAssistantConversationTitle('先把光调暖。然后换成竖构图')).toBe(
      '先把光调暖',
    )
    expect(deriveAssistantConversationTitle('这张行吗？我再想想')).toBe(
      '这张行吗',
    )
    expect(deriveAssistantConversationTitle('第一行\n第二行')).toBe('第一行')
  })

  it('CJK 与拉丁各自算 —— 两种语言下是同一条视觉宽度', () => {
    const cjk = deriveAssistantConversationTitle('字'.repeat(40))
    const latin = deriveAssistantConversationTitle('a'.repeat(80))
    expect(visualWidth(cjk!)).toBeLessThanOrEqual(TITLE_MAX_WIDTH)
    expect(visualWidth(latin!)).toBeLessThanOrEqual(TITLE_MAX_WIDTH)
    // 18 个汉字 = 36 个西文字符，同一条宽度（各自都为省略号让出一格）。
    expect(cjk).toHaveLength(18)
    expect(latin).toHaveLength(36)
    expect(cjk?.endsWith('…')).toBe(true)
    expect(latin?.endsWith('…')).toBe(true)
  })

  it('没到上限的原样留着，⛔ 不硬加省略号', () => {
    expect(deriveAssistantConversationTitle('黄昏光的参考研究')).toBe(
      '黄昏光的参考研究',
    )
  })

  it('空 / 空白 / 缺席一律回 null（调用方画「未命名会话」）', () => {
    expect(deriveAssistantConversationTitle(null)).toBeNull()
    expect(deriveAssistantConversationTitle(undefined)).toBeNull()
    expect(deriveAssistantConversationTitle('   ')).toBeNull()
  })

  it('幂等：存量标题再过一遍还是它自己（所以不必写数据迁移）', () => {
    const once = deriveAssistantConversationTitle(
      'reference image 1 这几张图的画风抽出来用在新的角色上',
    )
    expect(deriveAssistantConversationTitle(once)).toBe(once)
  })

  it('strips the bracketed on-screen reference label too', () => {
    expect(
      deriveAssistantConversationTitle('把 「图1」 的画风改成赛璐璐'),
    ).toBe('把 的画风改成赛璐璐')
  })
})
