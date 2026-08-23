import { describe, expect, it } from 'vitest'

import { collectConversationMediaReferences } from '@/lib/assistant-media-selection'

interface Ref {
  url: string
  label: string
}

const ref = (url: string, label = url): Ref => ({ url, label })

const message = (...refs: Ref[]) => ({ mediaReferences: refs })

/** 只看顺序时，url 比整条对象好读。 */
const urls = (refs: Ref[]) => refs.map((r) => r.url)

describe('collectConversationMediaReferences', () => {
  it('空对话空附件 → 空数组', () => {
    expect(
      collectConversationMediaReferences([], [], { maxReferences: 8 }),
    ).toEqual([])
  })

  // 这条是 2026-08-22 修复的核心：旧行为发出去的顺序是「当前 → 历史倒序」，
  // 于是越新的历史图编号越小，而转录区是正序排的 —— 编号和阅读顺序相反。
  it('⭐ 按对话顺序发出：老的在前，这一轮新附的在最后', () => {
    const result = collectConversationMediaReferences(
      [message(ref('a')), message(ref('b')), message(ref('c'))],
      [ref('d')],
      { maxReferences: 8 },
    )

    expect(urls(result)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('⚠ 重复附同一张不改它的位次（去重保留首次出现）', () => {
    // `a` 在第一轮就出现过，这一轮又被重新附了一次 —— 它仍然是 #1，
    // ⛔ 不该因为「刚刚又附了一次」跳到队尾拿一个新号。
    const result = collectConversationMediaReferences(
      [message(ref('a')), message(ref('b'))],
      [ref('a'), ref('c')],
      { maxReferences: 8 },
    )

    expect(urls(result)).toEqual(['a', 'b', 'c'])
  })

  it('⭐ 截断按优先级：保当前 + 最近的，丢最老的', () => {
    const result = collectConversationMediaReferences(
      [message(ref('oldest')), message(ref('middle')), message(ref('recent'))],
      [ref('current')],
      { maxReferences: 3 },
    )

    expect(result).toHaveLength(3)
    expect(urls(result)).not.toContain('oldest')
    // 活下来的仍然按对话顺序排 —— 选取优先级不该泄漏到发出顺序里。
    expect(urls(result)).toEqual(['middle', 'recent', 'current'])
  })

  it('上限为 0 时一条都不带（防御边界，不是崩）', () => {
    expect(
      collectConversationMediaReferences([message(ref('a'))], [ref('b')], {
        maxReferences: 0,
      }),
    ).toEqual([])
  })

  it('normalize 逐条生效（studio 用它截 label）', () => {
    const result = collectConversationMediaReferences(
      [message(ref('a', 'a-very-long-label'))],
      [],
      {
        maxReferences: 8,
        normalize: (reference) => ({
          ...reference,
          label: reference.label.slice(0, 4),
        }),
      },
    )

    expect(result[0]?.label).toBe('a-ve')
  })

  it('只有当前附件、没有历史时也走同一条路', () => {
    const result = collectConversationMediaReferences(
      [],
      [ref('x'), ref('y')],
      {
        maxReferences: 8,
      },
    )

    expect(urls(result)).toEqual(['x', 'y'])
  })
})
