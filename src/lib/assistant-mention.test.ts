import { describe, expect, it } from 'vitest'

import {
  appendMentionToken,
  describeMentionNote,
  formatMentionToken,
  mentionFromAttachment,
  mentionKey,
  parseMentionTokens,
  pushRecentKeys,
  removeMentionToken,
  renderMentionText,
  resolveDraftMentions,
  resolveSlotMentions,
  resolveTypedMentions,
  searchMentionCandidates,
  splitMentionKey,
  toMentionRef,
  withUniqueMentionLabels,
} from '@/lib/assistant-mention'
import type {
  AssistantMention,
  AssistantMentionCandidate,
} from '@/types/assistant-mention'

/**
 * 统一引用模型的纯函数闸（设计方案 §10b · 附录 G §9）。
 *
 * 钉五件事：
 *  ① **按 id 解析**：改名、同名都不影响指到哪一张；
 *  ② 指的东西没了 = 「已删除」，发送闸据此拦下；
 *  ③ 一套 chip：外面递进来的与菜单选的是同一种记号，同一条只落一次；
 *  ④ 搜索排序：多词 AND、序号精确、前缀 > 子串、最近用过的同分在前；
 *  ⑤ 发给模型的写法：`「名字」`（同名补序号）+ `[mentioned: …]`。
 */

function canvasCard(
  id: string,
  label: string,
  extra: Partial<AssistantMention> = {},
): AssistantMention {
  return {
    kind: 'image',
    id,
    label,
    scope: 'canvas',
    nodeId: id,
    url: `https://cdn.test/${id}.png`,
    thumb: `https://cdn.test/${id}.png`,
    ...extra,
  }
}

function liveOf(...items: AssistantMention[]) {
  return new Map(items.map((item) => [mentionKey(item), item]))
}

describe('记号', () => {
  it('<@kind:id> 往返：格式化 → 解析 → 拆键', () => {
    const token = formatMentionToken({ kind: 'image', id: 'node-1' })
    expect(token).toBe('<@image:node-1>')
    expect(parseMentionTokens(`看 ${token} 和 <@text:t-2>`)).toEqual([
      expect.objectContaining({
        kind: 'image',
        id: 'node-1',
        key: 'image:node-1',
      }),
      expect.objectContaining({ kind: 'text', id: 't-2', key: 'text:t-2' }),
    ])
    expect(splitMentionKey('image:node-1')).toEqual({
      kind: 'image',
      id: 'node-1',
    })
    // 认不出的种类不算（⛔ 不把正文里一段 `<@foo:bar>` 当成引用）。
    expect(splitMentionKey('foo:bar')).toBeNull()
    expect(parseMentionTokens('<@foo:bar>')).toEqual([])
  })

  it('⭐ 一套 chip：外面递进来的接在末尾，已经在了就不动；移除连同后面的空格', () => {
    const card = canvasCard('n1', '镜头1')
    const once = appendMentionToken('把这张', card)
    expect(once).toBe('把这张 <@image:n1> ')
    expect(appendMentionToken(once, card)).toBe(once)
    expect(appendMentionToken('', card)).toBe('<@image:n1> ')
    expect(removeMentionToken(`${once}改亮`, card)).toBe('把这张 改亮')
  })
})

describe('resolveDraftMentions（按 id 解析）', () => {
  it('⭐ 改过名的卡按 id 认，名字取此刻的', () => {
    const registered = canvasCard('n1', '旧名字')
    const renamed = canvasCard('n1', '新名字')
    const [draft] = resolveDraftMentions(
      `看 ${formatMentionToken(registered)}`,
      [registered],
      liveOf(renamed),
    )
    expect(draft).toEqual({
      key: 'image:n1',
      mention: renamed,
      missing: false,
    })
  })

  it('⭐ 三张同名「镜头1」各指各的', () => {
    const cards = ['a', 'b', 'c'].map((id) => canvasCard(id, '镜头1'))
    const text = cards.map((card) => formatMentionToken(card)).join(' ')
    const drafts = resolveDraftMentions(text, cards, liveOf(...cards))
    expect(drafts.map((item) => item.mention?.nodeId)).toEqual(['a', 'b', 'c'])
    // 发给模型时名字补序号，正文里每一条仍然唯一。
    const unique = withUniqueMentionLabels(
      drafts.flatMap((item) => (item.mention ? [item.mention] : [])),
    )
    expect(unique.map((item) => item.label)).toEqual([
      '镜头1',
      '镜头1 (2)',
      '镜头1 (3)',
    ])
    expect(renderMentionText(text, unique)).toBe(
      '「镜头1」 「镜头1 (2)」 「镜头1 (3)」',
    )
  })

  it('⭐ 画布上的卡被删 = 「已删除」（带快照名），拦住发送', () => {
    const gone = canvasCard('n1', '镜头1')
    const [draft] = resolveDraftMentions(
      formatMentionToken(gone),
      [gone],
      new Map(),
    )
    expect(draft).toEqual({ key: 'image:n1', mention: gone, missing: true })
  })

  it('没登记过、也不在候选里 = 「已删除」（只剩记号，没有名字）', () => {
    const [draft] = resolveDraftMentions('<@image:ghost>', [], new Map())
    expect(draft).toEqual({ key: 'image:ghost', mention: null, missing: true })
  })

  it('素材库 / 结果是库里的永久记录：登记过就算在（服务端再按 id 核一次）', () => {
    const library: AssistantMention = {
      kind: 'image',
      id: 'gen-1',
      label: '图_001',
      scope: 'library',
      generationId: 'gen-1',
      url: 'https://cdn.test/gen-1.png',
    }
    const [draft] = resolveDraftMentions(
      formatMentionToken(library),
      [library],
      new Map(),
    )
    expect(draft?.missing).toBe(false)
  })

  it('胶囊上定的用途从登记表带过来；同一枚写两次只算一次', () => {
    const card = canvasCard('n1', '镜头1')
    const drafts = resolveDraftMentions(
      `${formatMentionToken(card)} ${formatMentionToken(card)}`,
      [{ ...card, role: 'style' }],
      liveOf(card),
    )
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.mention?.role).toBe('style')
  })
})

describe('手打的点名', () => {
  const poster = canvasCard('p', '海报')
  const posterAlt = canvasCard('q', '海报 2')

  it('`@名字` 只认候选里**唯一**的那一条，长名字先换', () => {
    const typed = resolveTypedMentions('看 @海报 2 和 @海报', [
      poster,
      posterAlt,
    ])
    expect(typed.text).toBe('看 <@image:q> 和 <@image:p>')
    expect(typed.mentions.map((item) => item.id)).toEqual(['q', 'p'])
  })

  it('同名的几条一条都不认；邮箱与记号自己的 `@` 不算', () => {
    const twin = canvasCard('r', '海报')
    expect(resolveTypedMentions('@海报', [poster, twin]).mentions).toEqual([])
    expect(resolveTypedMentions('写信到 me@海报', [poster]).mentions).toEqual(
      [],
    )
    expect(
      resolveTypedMentions('<@image:p>', [canvasCard('image:p', 'image:p')])
        .mentions,
    ).toEqual([])
  })

  it('`@Image2` / `@图2` 换成第 2 个槽位；越界报出来', () => {
    const slots = [canvasCard('a', 'A'), canvasCard('b', 'B')]
    expect(resolveSlotMentions('参考 @Image2 和 @图1', slots)).toEqual({
      text: '参考 <@image:b> 和 <@image:a>',
      mentions: [slots[1], slots[0]],
      invalid: false,
    })
    expect(resolveSlotMentions('@图3', slots).invalid).toBe(true)
    // `@图10` ≠ `@图1` 的续写，邮箱里的 `@Image1` 不算。
    expect(resolveSlotMentions('a@Image1', slots).mentions).toEqual([])
  })
})

describe('searchMentionCandidates（排序）', () => {
  const candidates: AssistantMentionCandidate[] = [
    { ...canvasCard('c1', '夜景海报'), subtitle: '图 · 第 2 镜' },
    { ...canvasCard('c2', '海报'), subtitle: '图' },
    { ...canvasCard('c3', '海边草图'), keywords: ['海报 草稿'] },
    { ...canvasCard('c4', '城市'), seq: 12, subtitle: '素材库' },
  ]

  it('名字全等 > 前缀 > 子串 > 关键词', () => {
    expect(
      searchMentionCandidates(candidates, '海报').map((item) => item.id),
    ).toEqual(['c2', 'c1', 'c3'])
  })

  it('多词都要命中', () => {
    expect(
      searchMentionCandidates(candidates, '海报 第').map((item) => item.id),
    ).toEqual(['c1'])
  })

  it('`#12` 只认序号；纯数字也认序号', () => {
    expect(
      searchMentionCandidates(candidates, '#12').map((item) => item.id),
    ).toEqual(['c4'])
    expect(
      searchMentionCandidates(candidates, '12').map((item) => item.id),
    ).toEqual(['c4'])
    expect(searchMentionCandidates(candidates, '#99')).toEqual([])
  })

  it('同分时最近用过的在前；最多 limit 条', () => {
    const twins: AssistantMentionCandidate[] = [
      canvasCard('x', '镜头'),
      canvasCard('y', '镜头'),
    ]
    expect(
      searchMentionCandidates(twins, '镜头', {
        recentKeys: ['image:y'],
      }).map((item) => item.id),
    ).toEqual(['y', 'x'])
    expect(searchMentionCandidates(twins, '镜头', { limit: 1 })).toHaveLength(1)
  })

  it('最近使用：刚用的排最前、去重', () => {
    expect(pushRecentKeys(['a', 'b'], ['b', 'c'])).toEqual(['c', 'b', 'a'])
  })
})

describe('发给模型 / 发给服务端', () => {
  it('`[mentioned: …]` 写清楚是哪一种东西、当什么用，看得见的带地址', () => {
    const card = canvasCard('n1', '镜头1', { role: 'first_frame' })
    expect(describeMentionNote([card])).toBe(
      '\n[mentioned: 「镜头1」 (image · canvas card as first frame) https://cdn.test/n1.png]',
    )
    expect(describeMentionNote([])).toBe('')
  })

  it('请求里那一份去掉地址与缩略图（服务端按 id 解析）', () => {
    const ref = toMentionRef(canvasCard('n1', '镜头1'))
    expect(ref).toEqual({
      kind: 'image',
      id: 'n1',
      label: '镜头1',
      scope: 'canvas',
      nodeId: 'n1',
    })
  })

  it('附件形状 → 引用：只有库里的那几种带 generationId', () => {
    const attachment = {
      id: 'gen-1',
      kind: 'video' as const,
      url: 'https://cdn.test/v.mp4',
      label: '视频_001',
      seq: 1,
    }
    expect(mentionFromAttachment(attachment, 'library')).toEqual({
      kind: 'video',
      id: 'gen-1',
      label: '视频_001',
      scope: 'library',
      url: 'https://cdn.test/v.mp4',
      generationId: 'gen-1',
      seq: 1,
    })
    expect(
      mentionFromAttachment(attachment, 'attachment').generationId,
    ).toBeUndefined()
  })
})
