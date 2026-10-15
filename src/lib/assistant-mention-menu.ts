/**
 * `@` 菜单长什么样（设计方案 §10b「菜单与搜索」）—— 纯函数，面板与测试共用。
 *
 * ── 空查询 ──────────────────────────────────────────────────────────
 * 顶部「最近使用」，下面按分组（`ASSISTANT_MENTION_GROUPS` 的顺序）每组先露
 * `perGroup` 条 + 「查看全部」；选中的卡不止一张时，那一组最上面多一行「全部 @」。
 * 素材库那一组先列文件夹（可下钻），再列最近的几件。
 *
 * ── 有查询 ──────────────────────────────────────────────────────────
 * 面板里现成的候选按 `searchMentionCandidates` 排一列，素材库（服务端检索）接在
 * 后面；合计不超过 `searchResults` 条。素材库有结果时至少给它留 `perGroup` 个位
 * —— 不然画布上二十张卡会把库里那一张挤没。
 *
 * ⚠ 已经在正文里的不再列（再点一次只会多插一枚同样的胶囊）。
 */

import {
  ASSISTANT_MENTION_GROUP_IDS,
  ASSISTANT_MENTION_GROUPS,
  ASSISTANT_MENTION_LIMITS,
} from '@/constants/assistant-mention'
import {
  mentionKey,
  pickRecentCandidates,
  searchMentionCandidates,
  splitMentionQuery,
} from '@/lib/assistant-mention'
import type {
  AssistantMention,
  AssistantMentionCandidate,
  AssistantMentionGroupId,
  AssistantMentionLibraryFolder,
} from '@/types/assistant-mention'

export type MentionMenuRow =
  | {
      readonly type: 'option'
      readonly key: string
      readonly candidate: AssistantMentionCandidate
    }
  | {
      readonly type: 'more'
      readonly key: string
      readonly group: AssistantMentionGroupId
      readonly count: number
    }
  | { readonly type: 'less'; readonly key: string }
  | {
      readonly type: 'mentionAll'
      readonly key: string
      readonly items: readonly AssistantMentionCandidate[]
    }
  | {
      readonly type: 'folder'
      readonly key: string
      readonly folder: AssistantMentionLibraryFolder
    }
  | { readonly type: 'back'; readonly key: string }

/**
 * 一段（有标题的那一组）。`matches` = 有查询时那一列排好序的。
 * ⚠ ⛔ 别叫 `results`：那是「本次对话的生成」那一组的 id。
 */
export const MENTION_MENU_MATCHES = 'matches'

export interface MentionMenuSection {
  readonly id: AssistantMentionGroupId | typeof MENTION_MENU_MATCHES
  readonly rows: readonly MentionMenuRow[]
}

export interface MentionMenuView {
  readonly sections: readonly MentionMenuSection[]
  /** 键盘导航的顺序（= 各段依次摊平）。 */
  readonly rows: readonly MentionMenuRow[]
  /** 能选的那几行（候选）一共几条 —— 读屏播报「N 个结果」用它。 */
  readonly optionCount: number
}

export interface MentionMenuInput {
  readonly groups: readonly {
    readonly id: AssistantMentionGroupId
    readonly items: readonly AssistantMentionCandidate[]
  }[]
  readonly library: {
    readonly items: readonly AssistantMentionCandidate[]
    readonly folders: readonly AssistantMentionLibraryFolder[]
  }
  readonly query: string
  readonly recentKeys: readonly string[]
  /** 「查看全部」点开的那一组。 */
  readonly expanded: AssistantMentionGroupId | null
  /** 下钻进去的素材库文件夹。 */
  readonly folder: AssistantMentionLibraryFolder | null
  /** 正文里已经有的（不再列）。 */
  readonly excludeKeys?: ReadonlySet<string>
}

const GROUP_ORDER = new Map<AssistantMentionGroupId, number>(
  ASSISTANT_MENTION_GROUPS.map((id, index) => [id, index]),
)

function option(
  section: string,
  candidate: AssistantMentionCandidate,
): MentionMenuRow {
  return {
    type: 'option',
    key: `${section}|${mentionKey(candidate)}`,
    candidate,
  }
}

function folderRow(folder: AssistantMentionLibraryFolder): MentionMenuRow {
  return { type: 'folder', key: `folder|${folder.id}`, folder }
}

function finish(sections: MentionMenuSection[]): MentionMenuView {
  const kept = sections.filter((section) => section.rows.length > 0)
  const rows = kept.flatMap((section) => section.rows)
  return {
    sections: kept,
    rows,
    optionCount: rows.filter((row) => row.type === 'option').length,
  }
}

export function buildMentionMenu(input: MentionMenuInput): MentionMenuView {
  const exclude = input.excludeKeys ?? new Set<string>()
  const keep = (item: AssistantMentionCandidate) =>
    !exclude.has(mentionKey(item))
  const groups = [...input.groups]
    .map((group) => ({ id: group.id, items: group.items.filter(keep) }))
    .filter((group) => group.items.length > 0)
    .sort(
      (a, b) => (GROUP_ORDER.get(a.id) ?? 99) - (GROUP_ORDER.get(b.id) ?? 99),
    )
  const libraryItems = input.library.items.filter(keep)
  const searching = splitMentionQuery(input.query).length > 0
  const { perGroup, searchResults } = ASSISTANT_MENTION_LIMITS

  // ── 素材库下钻 ────────────────────────────────────────────────
  if (input.folder) {
    return finish([
      {
        id: ASSISTANT_MENTION_GROUP_IDS.library,
        rows: [
          { type: 'back', key: 'back' },
          ...input.library.folders
            .filter((folder) => folder.id !== input.folder?.id)
            .map(folderRow),
          ...libraryItems.map((item) =>
            option(ASSISTANT_MENTION_GROUP_IDS.library, item),
          ),
        ],
      },
    ])
  }

  // ── 有查询：一列排好序的 + 素材库 ──────────────────────────────
  if (searching) {
    const seen = new Set<string>()
    const pool = groups
      .flatMap((group) => group.items)
      .filter((item) => {
        const key = mentionKey(item)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    const ranked = searchMentionCandidates(pool, input.query, {
      recentKeys: input.recentKeys,
      limit: searchResults,
    })
    const rankedKeys = new Set(ranked.map(mentionKey))
    const fromLibrary = libraryItems.filter(
      (item) => !rankedKeys.has(mentionKey(item)),
    )
    const localCap = fromLibrary.length
      ? searchResults - Math.min(fromLibrary.length, perGroup)
      : searchResults
    const local = ranked.slice(0, localCap)
    const library = fromLibrary.slice(0, searchResults - local.length)
    return finish([
      {
        id: MENTION_MENU_MATCHES,
        rows: local.map((item) => option(MENTION_MENU_MATCHES, item)),
      },
      {
        id: ASSISTANT_MENTION_GROUP_IDS.library,
        rows: [
          ...input.library.folders.slice(0, perGroup).map(folderRow),
          ...library.map((item) =>
            option(ASSISTANT_MENTION_GROUP_IDS.library, item),
          ),
        ],
      },
    ])
  }

  // ── 「查看全部」点开了一组 ─────────────────────────────────────
  if (input.expanded) {
    const items =
      input.expanded === ASSISTANT_MENTION_GROUP_IDS.library
        ? libraryItems
        : (groups.find((group) => group.id === input.expanded)?.items ?? [])
    return finish([
      {
        id: input.expanded,
        rows: [
          { type: 'less', key: 'less' },
          ...(input.expanded === ASSISTANT_MENTION_GROUP_IDS.library
            ? input.library.folders.map(folderRow)
            : []),
          ...items.map((item) => option(input.expanded!, item)),
        ],
      },
    ])
  }

  // ── 空查询：最近使用 + 每组几条 ────────────────────────────────
  const everything = [
    ...groups.flatMap((group) => group.items),
    ...libraryItems,
  ]
  const recent = pickRecentCandidates(everything, input.recentKeys)
  const recentKeys = new Set(recent.map(mentionKey))
  const sections: MentionMenuSection[] = [
    {
      id: ASSISTANT_MENTION_GROUP_IDS.recent,
      rows: recent.map((item) =>
        option(ASSISTANT_MENTION_GROUP_IDS.recent, item),
      ),
    },
  ]
  const grouped = [
    ...groups,
    ...(libraryItems.length || input.library.folders.length
      ? [{ id: ASSISTANT_MENTION_GROUP_IDS.library, items: libraryItems }]
      : []),
  ]
  for (const group of grouped) {
    const isSelected = group.id === ASSISTANT_MENTION_GROUP_IDS.selected
    // 选中的卡整组照列（那是「你此刻指着的」）；其余组里最近用过的不再重复。
    const items = isSelected
      ? group.items
      : group.items.filter((item) => !recentKeys.has(mentionKey(item)))
    const rows: MentionMenuRow[] = []
    if (isSelected && group.items.length > 1)
      rows.push({ type: 'mentionAll', key: 'mentionAll', items: group.items })
    if (group.id === ASSISTANT_MENTION_GROUP_IDS.library)
      rows.push(...input.library.folders.slice(0, perGroup).map(folderRow))
    rows.push(...items.slice(0, perGroup).map((item) => option(group.id, item)))
    if (items.length > perGroup)
      rows.push({
        type: 'more',
        key: `more|${group.id}`,
        group: group.id,
        count: items.length,
      })
    sections.push({ id: group.id, rows })
  }
  return finish(sections)
}

/** 候选 → 登记表里那一条（去掉只给菜单看的副标题 / 预览 / 关键词）。 */
export function candidateToMention(
  candidate: AssistantMentionCandidate,
): AssistantMention {
  const {
    subtitle: _subtitle,
    preview: _preview,
    keywords: _keywords,
    ...mention
  } = candidate
  void _subtitle
  void _preview
  void _keywords
  return mention
}
