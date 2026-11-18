// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_UNDO_STASH } from '@/constants/studio-assistant-operator'
import { restoreOperatorUndoRecord } from '@/features/assistant/hooks/use-studio-operator-restored-undo'
import type { AssistantOperatorAppliedStep } from '@/types/assistant-operator'
import type { StudioOperatorThreadEntry } from '@/types/studio-assistant-operator'

import {
  canRestoreOperatorUndo,
  dropOperatorUndoRecord,
  findOperatorUndoRecord,
  pruneOperatorUndoRecords,
  readOperatorUndoStash,
  syncOperatorUndoStash,
  type OperatorUndoRecord,
} from './studio-operator-undo-stash'

/**
 * 11-17 真机：助手用 edit 把 1000 多字的提示词整段换掉，离开页面再回来「撤销」没了，
 * 原草稿无处可找。旧代码里撤销本钱（`inverse`）只活在内存里、历史结构上装不下它 ——
 * 下面每一条在旧代码下都没有落点可测（模块不存在）。
 */

const NOW = Date.parse('2026-11-17T12:00:00Z')
const LONG_DRAFT = `原稿：${'窗边的少女安静地读着书，午后的光落在她粉色的头发上。'.repeat(40)}`

function promptEntry(
  id: string,
  previous: string,
  value: string,
  extra: Partial<{ mode: 'replace' | 'append'; undone: boolean }> = {},
): StudioOperatorThreadEntry {
  const step = {
    id: 's1',
    title: '改写提示词',
    status: 'done',
    tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
    verb: 'apply',
    payload: { value, mode: extra.mode ?? 'replace' },
    inverse: { value: previous },
  } satisfies AssistantOperatorAppliedStep
  return {
    kind: 'step',
    id,
    step,
    runKey: 'run-1',
    undone: extra.undone ?? false,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('跨页面撤销：本机留底', () => {
  it('整段换掉的长原稿落到本机，刷新后还对得上历史那一行', () => {
    syncOperatorUndoStash(
      'sess-1',
      [promptEntry('run-1:s1', LONG_DRAFT, '新的短提示词')],
      NOW,
    )
    const records = readOperatorUndoStash(NOW + 1000)
    expect(records).toHaveLength(1)
    // ⭐ 保证：被换掉的那段 > 200 字原稿一字不差地在快照里。
    expect(records[0]).toMatchObject({
      field: 'prompt',
      before: LONG_DRAFT,
      after: '新的短提示词',
      draft: true,
    })
    expect(
      findOperatorUndoRecord(records, 'sess-1', 'run-1:s1', '改写提示词'),
    ).toEqual(records[0])
    expect(
      findOperatorUndoRecord(records, 'sess-2', 'run-1:s1', '改写提示词'),
    ).toBeNull()
  })

  it('追加那一支：after 与应用那一侧同一个算法（协议分隔符）', () => {
    syncOperatorUndoStash(
      'sess-1',
      [promptEntry('run-1:s1', 'a girl', 'by the window', { mode: 'append' })],
      NOW,
    )
    const [record] = readOperatorUndoStash(NOW)
    expect(record?.after.startsWith('a girl')).toBe(true)
    expect(record?.after.endsWith('by the window')).toBe(true)
  })

  it('本次加载里已经撤过的那一步从本机摘掉', () => {
    const entry = promptEntry('run-1:s1', LONG_DRAFT, 'x')
    syncOperatorUndoStash('sess-1', [entry], NOW)
    syncOperatorUndoStash(
      'sess-1',
      [{ ...entry, undone: true } as StudioOperatorThreadEntry],
      NOW,
    )
    expect(readOperatorUndoStash(NOW)).toEqual([])
  })

  it('过期的丢；超条数先丢旧的普通改动，长草稿最后丢', () => {
    const base = (i: number, draft: boolean): OperatorUndoRecord => ({
      sessionId: 's',
      entryId: `e${i}`,
      title: 't',
      field: 'prompt',
      before: draft ? LONG_DRAFT : 'short',
      after: 'y',
      at: new Date(NOW - (100 - i) * 1000).toISOString(),
      draft,
    })
    const many = [
      base(0, true),
      ...Array.from({ length: STUDIO_OPERATOR_UNDO_STASH.maxRecords }, (_, i) =>
        base(i + 1, false),
      ),
    ]
    const kept = pruneOperatorUndoRecords(many, NOW)
    expect(kept).toHaveLength(STUDIO_OPERATOR_UNDO_STASH.maxRecords)
    expect(kept.some((r) => r.entryId === 'e0')).toBe(true) // 最旧的长草稿还在
    expect(kept.some((r) => r.entryId === 'e1')).toBe(false) // 丢的是最旧的普通改动
    expect(
      pruneOperatorUndoRecords(
        [base(0, true)],
        NOW + STUDIO_OPERATOR_UNDO_STASH.ttlMs + 200_000,
      ),
    ).toEqual([])
  })

  it('本机那份被改坏：当没有，不抛', () => {
    window.localStorage.setItem(STUDIO_OPERATOR_UNDO_STASH.storageKey, '{oops')
    expect(readOperatorUndoStash(NOW)).toEqual([])
  })
})

describe('跨页面撤销：撤之前比对（选定语义 = 改过就不盖）', () => {
  const record: OperatorUndoRecord = {
    sessionId: 's',
    entryId: 'e',
    title: 't',
    field: 'prompt',
    before: LONG_DRAFT,
    after: '新的短提示词',
    at: new Date(NOW).toISOString(),
    draft: true,
  }

  it('那一格还是助手写下的那一版 → 写回原稿', () => {
    const dispatch = vi.fn()
    const ok = restoreOperatorUndoRecord(record, {
      getState: () => ({ prompt: '新的短提示词 ', advancedParams: {} }),
      dispatch,
    })
    expect(ok).toBe(true)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_PROMPT',
      payload: LONG_DRAFT,
    })
  })

  it('之后又手改过 → 不盖，交回调用方去复制原文', () => {
    const dispatch = vi.fn()
    expect(canRestoreOperatorUndo(record, '新的短提示词，加了一句')).toBe(false)
    const ok = restoreOperatorUndoRecord(record, {
      getState: () => ({
        prompt: '新的短提示词，加了一句',
        advancedParams: {},
      }),
      dispatch,
    })
    expect(ok).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('负面词那一格：只换 negativePrompt，别的高级参数原样', () => {
    const dispatch = vi.fn()
    restoreOperatorUndoRecord(
      { ...record, field: 'negative', before: 'blurry', after: 'lowres' },
      {
        getState: () => ({
          prompt: '',
          advancedParams: { negativePrompt: 'lowres', seed: 7 },
        }),
        dispatch,
      },
    )
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_ADVANCED_PARAMS',
      payload: { negativePrompt: 'blurry', seed: 7 },
    })
  })

  it('撤完从本机摘掉', () => {
    syncOperatorUndoStash(
      'sess-1',
      [promptEntry('run-1:s1', LONG_DRAFT, 'x')],
      NOW,
    )
    const [saved] = readOperatorUndoStash(NOW)
    dropOperatorUndoRecord(saved!, NOW)
    expect(readOperatorUndoStash(NOW)).toEqual([])
  })
})
