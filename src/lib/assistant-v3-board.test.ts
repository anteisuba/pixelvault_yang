import { describe, expect, it } from 'vitest'

import type {
  AssistantOperatorCanvasNode,
  AssistantOperatorCanvasSnapshot,
} from '@/types/assistant-operator'
import {
  buildAssistantV3Handles,
  formatScriptShotKey,
  renderAssistantV3Board,
} from './assistant-v3-board'

const HARRY = 'image249e8bf4-8cc4-46eb-8125-3485e3a9053e'
const RON = 'image7bc23597-15e6-4026-9e34-0e2613ee3479'
const S01 = 'video16f1cb3f-4164-4eb7-8d49-a429fa5fff0f'
const S04A = 'videob924b6a0-ecf6-4ec8-9c5e-f5d676063fcd'
const SCRIPT = 'textb1572be4-fea9-47b2-b03f-b7e642008921'

function node(
  partial: Partial<AssistantOperatorCanvasNode> &
    Pick<AssistantOperatorCanvasNode, 'id' | 'name' | 'kind'>,
): AssistantOperatorCanvasNode {
  return { text: '', ...partial } as AssistantOperatorCanvasNode
}

function board(
  nodes: AssistantOperatorCanvasNode[],
  lanes?: { shotNo: number | null; nodes: AssistantOperatorCanvasNode[] }[],
): AssistantOperatorCanvasSnapshot {
  return {
    currentShotNo: null,
    selectedNodeIds: [],
    shots: (lanes ?? [{ shotNo: null, nodes }]).map((lane) => ({
      expanded: true as const,
      shotNo: lane.shotNo,
      title: lane.shotNo === null ? 'loose' : `S${lane.shotNo}`,
      nodes: lane.nodes,
    })),
  }
}

describe('v3 句柄', () => {
  it('类型三字母 + uuid 前六位；真 id 与句柄都认', () => {
    const handles = buildAssistantV3Handles([HARRY, S01, SCRIPT])
    expect(handles.handleOf(HARRY)).toBe('img-249e8b')
    expect(handles.handleOf(S01)).toBe('vid-16f1cb')
    expect(handles.handleOf(SCRIPT)).toBe('txt-b1572b')
    expect(handles.idOf('img-249e8b')).toBe(HARRY)
    expect(handles.idOf(' IMG-249E8B ')).toBe(HARRY)
    expect(handles.idOf(HARRY)).toBe(HARRY)
    expect(handles.idOf('img-000000')).toBeNull()
  })

  it('前六位撞了就逐位加长，两边都不再相同', () => {
    const a = 'image249e8bf4-0000-4000-8000-000000000001'
    const b = 'image249e8bf9-0000-4000-8000-000000000002'
    const handles = buildAssistantV3Handles([a, b])
    expect(handles.handleOf(a)).toBe('img-249e8bf4')
    expect(handles.handleOf(b)).toBe('img-249e8bf9')
    expect(handles.idOf('img-249e8bf9')).toBe(b)
  })

  it('句柄抄错一位时给最近的', () => {
    const handles = buildAssistantV3Handles([HARRY, RON])
    expect(handles.nearest('img-249e8c').map(handles.handleOf)).toContain(
      'img-249e8b',
    )
  })
})

describe('v3 板子', () => {
  it('剧本镜号印成 S04a，镜头带只印 LANE 位置号', () => {
    expect(formatScriptShotKey('s4a')).toBe('S04a')
    expect(formatScriptShotKey('s12')).toBe('S12')
    const shot = node({
      id: S04A,
      name: '女德拉科笑容僵住',
      kind: 'video',
      subtype: 'shot',
      model: 'seedance-2.5-byteplus',
      fromScript: { nodeId: SCRIPT, shotKey: 's4a', state: 'synced' },
    })
    const text = renderAssistantV3Board({
      canvas: board([], [{ shotNo: 5, nodes: [shot] }]),
      handles: buildAssistantV3Handles([S04A]),
      latestUserText: '',
    })
    expect(text).toContain('LANE 5')
    expect(text).toContain('script S04a (synced)')
    expect(text).not.toMatch(/\bS5\b/)
  })

  it('连线印成「槽 ← 句柄」，不出 edgeId 也不出 UUID', () => {
    const shot = node({
      id: S01,
      name: '全景推到中景',
      kind: 'video',
      subtype: 'shot',
      inputs: [{ slot: 'reference', from: RON, edgeId: 'edge-ron-s01' }],
    })
    const ron = node({
      id: RON,
      name: '罗恩 · 黑袍',
      kind: 'image',
      subtype: 'character',
    })
    const text = renderAssistantV3Board({
      canvas: board([shot, ron]),
      handles: buildAssistantV3Handles([S01, RON]),
      latestUserText: '',
    })
    expect(text).toContain('reference ← img-7bc235「罗恩 · 黑袍」')
    expect(text).not.toContain('edge-ron-s01')
    expect(text).not.toContain(RON)
  })

  it('没选模型的媒体卡写出 model none（⛔ 不省掉）', () => {
    const text = renderAssistantV3Board({
      canvas: board([node({ id: HARRY, name: '哈利 · 黑袍', kind: 'image' })]),
      handles: buildAssistantV3Handles([HARRY]),
      latestUserText: '',
    })
    expect(text).toContain('model none')
  })

  it('有产出写 has output，正在生成写 generating', () => {
    const text = renderAssistantV3Board({
      canvas: board([
        node({
          id: HARRY,
          name: '哈利 · 黑袍',
          kind: 'image',
          hasOutput: true,
        }),
        node({ id: S01, name: '全景', kind: 'video', generating: true }),
      ]),
      handles: buildAssistantV3Handles([HARRY, S01]),
      latestUserText: '',
    })
    expect(text).toMatch(/img-249e8b[^\n]*has output/)
    expect(text).toMatch(/vid-16f1cb[^\n]*generating/)
  })

  it('大画布只展开点了名的卡与一跳连线，其余一行', () => {
    const filler = Array.from({ length: 20 }, (_, index) =>
      node({
        id: `image${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`,
        name: `填充卡${index}`,
        kind: 'image',
        text: '一段很长的提示词',
      }),
    )
    const harry = node({
      id: HARRY,
      name: '哈利 · 黑袍',
      kind: 'image',
      text: '哈利全身黑袍',
      inputs: [{ slot: 'reference', from: RON, edgeId: 'e1' }],
    })
    const ron = node({
      id: RON,
      name: '罗恩 · 黑袍',
      kind: 'image',
      text: '罗恩',
    })
    const nodes = [...filler, harry, ron]
    const text = renderAssistantV3Board({
      canvas: board(nodes),
      handles: buildAssistantV3Handles(nodes.map((item) => item.id)),
      latestUserText: '把「哈利 · 黑袍」改成 2:3',
    })
    expect(text).toContain('prompt (6 chars): 哈利全身黑袍')
    expect(text).toContain('prompt (2 chars): 罗恩')
    expect(text).toContain('「填充卡0」 · model none · 8 chars')
    expect(text).not.toContain('一段很长的提示词')
  })
})
