import { describe, expect, it } from 'vitest'

import { ASSISTANT_MENTION_LIMITS } from '@/constants/assistant-mention'
import {
  buildMentionMenu,
  candidateToMention,
  MENTION_MENU_MATCHES,
  type MentionMenuInput,
  type MentionMenuRow,
} from '@/lib/assistant-mention-menu'
import type { AssistantMentionCandidate } from '@/types/assistant-mention'

/**
 * `@` 菜单的形状（设计方案 §10b「菜单与搜索」）：最近使用、每组 4 条 +「查看全部」、
 * 「全部 @」、素材库文件夹下钻、搜索最多 20 条且给素材库留位、正文里已有的不再列。
 */

function card(
  id: string,
  label = id,
  extra: Partial<AssistantMentionCandidate> = {},
): AssistantMentionCandidate {
  return { kind: 'image', id, label, scope: 'canvas', nodeId: id, ...extra }
}

function libraryItem(id: string, label = id): AssistantMentionCandidate {
  return { kind: 'image', id, label, scope: 'library', generationId: id }
}

function input(overrides: Partial<MentionMenuInput> = {}): MentionMenuInput {
  return {
    groups: [],
    library: { items: [], folders: [] },
    query: '',
    recentKeys: [],
    expanded: null,
    folder: null,
    ...overrides,
  }
}

function describeRow(row: MentionMenuRow): string {
  switch (row.type) {
    case 'option':
      return row.candidate.id
    case 'more':
      return `more:${row.group}:${row.count}`
    case 'mentionAll':
      return `all:${row.items.length}`
    case 'folder':
      return `folder:${row.folder.id}`
    case 'less':
    case 'back':
      return row.type
  }
}

const many = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => card(`${prefix}${index + 1}`))

describe('空查询', () => {
  it('⭐ 按分组顺序排；每组先露 4 条 + 「查看全部」', () => {
    const view = buildMentionMenu(
      input({
        groups: [
          { id: 'results', items: many('r', 2) },
          { id: 'canvas', items: many('c', 6) },
        ],
      }),
    )
    expect(view.sections.map((section) => section.id)).toEqual([
      'canvas',
      'results',
    ])
    expect(view.sections[0]?.rows.map(describeRow)).toEqual([
      'c1',
      'c2',
      'c3',
      'c4',
      'more:canvas:6',
    ])
    expect(view.optionCount).toBe(6)
    // 键盘导航顺序 = 各段依次摊平。
    expect(view.rows.map(describeRow)).toEqual([
      'c1',
      'c2',
      'c3',
      'c4',
      'more:canvas:6',
      'r1',
      'r2',
    ])
  })

  it('最近使用排最上；别的组里不再重复那一条', () => {
    const view = buildMentionMenu(
      input({
        groups: [{ id: 'canvas', items: many('c', 3) }],
        recentKeys: ['image:c2', 'image:gone'],
      }),
    )
    expect(view.sections.map((section) => section.id)).toEqual([
      'recent',
      'canvas',
    ])
    expect(view.sections[0]?.rows.map(describeRow)).toEqual(['c2'])
    expect(view.sections[1]?.rows.map(describeRow)).toEqual(['c1', 'c3'])
  })

  it('⭐ 选中的卡整组照列，不止一张时最上面多一行「全部 @」', () => {
    const selected = many('s', 2)
    const view = buildMentionMenu(
      input({
        groups: [{ id: 'selected', items: selected }],
        recentKeys: ['image:s1'],
      }),
    )
    const selectedSection = view.sections.find(
      (section) => section.id === 'selected',
    )
    expect(selectedSection?.rows.map(describeRow)).toEqual([
      'all:2',
      's1',
      's2',
    ])
    // 只有一张时没有「全部 @」。
    const single = buildMentionMenu(
      input({ groups: [{ id: 'selected', items: [card('s1')] }] }),
    )
    expect(single.rows.map(describeRow)).toEqual(['s1'])
  })

  it('素材库那一组先列文件夹，再列几件', () => {
    const view = buildMentionMenu(
      input({
        library: {
          items: [libraryItem('g1')],
          folders: [
            { id: 'f1', name: '海报', parentId: null },
            { id: 'f2', name: '分镜', parentId: null },
          ],
        },
      }),
    )
    expect(view.sections.map((section) => section.id)).toEqual(['library'])
    expect(view.rows.map(describeRow)).toEqual(['folder:f1', 'folder:f2', 'g1'])
  })

  it('⚠ 正文里已经有的不再列', () => {
    const view = buildMentionMenu(
      input({
        groups: [{ id: 'canvas', items: many('c', 3) }],
        excludeKeys: new Set(['image:c1']),
      }),
    )
    expect(view.rows.map(describeRow)).toEqual(['c2', 'c3'])
  })

  it('什么都没有 = 空菜单（面板据此显示提示）', () => {
    const view = buildMentionMenu(input())
    expect(view).toEqual({ sections: [], rows: [], optionCount: 0 })
  })
})

describe('查看全部 / 下钻', () => {
  it('「查看全部」点开一组：收起一行 + 那一组全部', () => {
    const view = buildMentionMenu(
      input({
        groups: [
          { id: 'canvas', items: many('c', 6) },
          { id: 'results', items: many('r', 2) },
        ],
        expanded: 'canvas',
      }),
    )
    expect(view.rows.map(describeRow)).toEqual([
      'less',
      'c1',
      'c2',
      'c3',
      'c4',
      'c5',
      'c6',
    ])
  })

  it('素材库文件夹下钻：返回 + 别的文件夹 + 这一夹的几件', () => {
    const folder = { id: 'f1', name: '海报', parentId: null }
    const view = buildMentionMenu(
      input({
        groups: [{ id: 'canvas', items: many('c', 2) }],
        library: {
          items: [libraryItem('g1')],
          folders: [folder, { id: 'f2', name: '分镜', parentId: null }],
        },
        folder,
      }),
    )
    expect(view.sections.map((section) => section.id)).toEqual(['library'])
    expect(view.rows.map(describeRow)).toEqual(['back', 'folder:f2', 'g1'])
  })
})

describe('有查询', () => {
  it('⭐ 面板里的候选排成一列，素材库接在后面；同一条只出现一次', () => {
    const view = buildMentionMenu(
      input({
        groups: [
          { id: 'selected', items: [card('a', '夜景海报')] },
          { id: 'canvas', items: [card('a', '夜景海报'), card('b', '海报')] },
        ],
        library: { items: [libraryItem('g1', '海报_库')], folders: [] },
        query: '海报',
      }),
    )
    expect(view.sections.map((section) => section.id)).toEqual([
      MENTION_MENU_MATCHES,
      'library',
    ])
    expect(view.rows.map(describeRow)).toEqual(['b', 'a', 'g1'])
  })

  it(`⭐ 合计不超过 ${ASSISTANT_MENTION_LIMITS.searchResults} 条，素材库有结果时至少留 ${ASSISTANT_MENTION_LIMITS.perGroup} 个位`, () => {
    const { perGroup, searchResults } = ASSISTANT_MENTION_LIMITS
    const view = buildMentionMenu(
      input({
        groups: [
          {
            id: 'canvas',
            items: Array.from({ length: 30 }, (_, index) =>
              card(`c${index}`, `镜头${index}`),
            ),
          },
        ],
        library: {
          items: Array.from({ length: 10 }, (_, index) =>
            libraryItem(`g${index}`, `镜头库${index}`),
          ),
          folders: [],
        },
        query: '镜头',
      }),
    )
    expect(view.optionCount).toBe(searchResults)
    const library = view.sections.find((section) => section.id === 'library')
    expect(library?.rows).toHaveLength(perGroup)
    // 素材库没结果时整列都给面板里的。
    const localOnly = buildMentionMenu(
      input({
        groups: [
          {
            id: 'canvas',
            items: Array.from({ length: 30 }, (_, index) =>
              card(`c${index}`, `镜头${index}`),
            ),
          },
        ],
        query: '镜头',
      }),
    )
    expect(localOnly.optionCount).toBe(searchResults)
  })

  it('一条都没中 = 空', () => {
    const view = buildMentionMenu(
      input({
        groups: [{ id: 'canvas', items: many('c', 3) }],
        query: '不存在',
      }),
    )
    expect(view.optionCount).toBe(0)
  })
})

it('候选 → 登记表那一条：去掉副标题 / 预览 / 关键词', () => {
  expect(
    candidateToMention(
      card('n1', '镜头1', {
        subtitle: '图',
        preview: '前几句',
        keywords: ['海报'],
      }),
    ),
  ).toEqual({
    kind: 'image',
    id: 'n1',
    label: '镜头1',
    scope: 'canvas',
    nodeId: 'n1',
  })
})
