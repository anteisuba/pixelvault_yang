import { describe, expect, it } from 'vitest'

import type {
  AssistantOperatorCanvasNode,
  AssistantOperatorCanvasSnapshot,
} from '@/types/assistant-operator'
import {
  buildAssistantV3Handles,
  formatScriptShotKey,
  parseAssistantV3LaneItem,
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

  it('在场角色印出身份与说话方式（附录J ④），只在库里的不印', () => {
    const text = renderAssistantV3Board({
      canvas: {
        ...board([]),
        characters: {
          total: 2,
          list: [
            {
              name: '林夏',
              work: null,
              imageCount: 3,
              onCanvas: true,
              profile: {
                look: '黑长发',
                identity: '雾港侦探社见习生',
                behavior: '',
                speech: '说话短，\n爱用反问。' + '嗯'.repeat(400),
                backstory: '',
              },
            },
            { name: '高尔', work: null, imageCount: 1, onCanvas: false },
          ],
        },
      },
      handles: buildAssistantV3Handles([]),
      latestUserText: '',
    })
    expect(text).toContain('CAST ON THE BOARD:')
    expect(text).toContain(
      '林夏 — is: 雾港侦探社见习生 · talks: 说话短， 爱用反问。',
    )
    expect(text).not.toMatch(/高尔 —/)
    // 每格截到上限，⛔ 不把整份设定每轮重发。
    const castLine = text.split('\n').find((line) => line.includes('林夏 —'))!
    expect(castLine.length).toBeLessThan(300)
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

/**
 * 板子分级（P2 第二片，设计方案 §2.4）：大画布上当前镜那条与左右各一、有展开卡的带照旧（相关的
 * 展开、其余一行）；别的带只印一行（几张卡、叫什么、怎么取），⛔ 不给句柄。散卡永远在。
 */
describe('v3 板子 · 分级', () => {
  const shot = (no: number, suffix = 'a') =>
    node({
      id: `video${String(no).padStart(2, '0')}${suffix}1b2c3-0000-4000-8000-${String(no).padStart(12, '0')}`,
      name: `S${String(no).padStart(2, '0')} 镜头${no}`,
      kind: 'video',
      subtype: 'shot',
      model: 'seedance-2.5-byteplus',
      text: `第 ${no} 镜的提示词`,
    })
  const lanes = Array.from({ length: 12 }, (_, index) => ({
    shotNo: index + 1,
    nodes: [shot(index + 1), shot(index + 1, 'b')],
  }))
  const loose = node({ id: HARRY, name: '哈利 · 黑袍', kind: 'image' })
  const allNodes = [...lanes.flatMap((lane) => lane.nodes), loose]
  const handles = buildAssistantV3Handles(allNodes.map((item) => item.id))
  const render = (
    patch: Partial<AssistantOperatorCanvasSnapshot>,
    latestUserText = '',
  ) =>
    renderAssistantV3Board({
      canvas: {
        ...board([], [...lanes, { shotNo: null, nodes: [loose] }]),
        ...patch,
      },
      handles,
      latestUserText,
    })

  it('当前镜左右各一照旧；别的带一行：卡数、名字、read "lane:<n>"，⛔ 不给句柄', () => {
    const text = render({ currentShotNo: 5, selectedNodeIds: [] })
    for (const no of [4, 5, 6]) {
      expect(text).toContain(`LANE ${no}\n`)
      expect(text).toContain(handles.handleOf(lanes[no - 1]!.nodes[0]!.id))
    }
    expect(text).toContain(
      'LANE 9 — off-screen, 2 cards: 「S09 镜头9」「S09 镜头9」 — read "lane:9" for them',
    )
    expect(text).not.toContain(handles.handleOf(lanes[8]!.nodes[0]!.id))
    expect(text).toContain('9 lanes off-screen as one line each')
    // 散卡永远在。
    expect(text).toContain('img-249e8b')
  })

  it('还没落焦点：最前面三条在眼前；选中 / 点名的卡所在的带也在', () => {
    const plain = render({ currentShotNo: null })
    expect(plain).toContain('LANE 3\n')
    expect(plain).toContain('LANE 4 — off-screen')
    const selected = render({
      currentShotNo: null,
      selectedNodeIds: [lanes[10]!.nodes[0]!.id],
    })
    expect(selected).toContain('LANE 11\n')
    expect(selected).not.toContain('LANE 11 — off-screen')
    const named = render({ currentShotNo: null }, '把「S08 镜头8」改成黄昏')
    expect(named).not.toContain('LANE 8 — off-screen')
  })

  it('最后一面是焦点：照样三条在眼前（往前挪）', () => {
    const text = render({ currentShotNo: 12 })
    for (const no of [10, 11, 12]) expect(text).toContain(`LANE ${no}\n`)
    expect(text).toContain('LANE 9 — off-screen')
  })

  it('小画布（不过 boardCatalogMinNodes）不分级', () => {
    const small = lanes.slice(0, 6)
    const text = renderAssistantV3Board({
      canvas: { ...board([], small), currentShotNo: 1 },
      handles,
      latestUserText: '',
    })
    expect(text).not.toContain('off-screen')
    expect(text).toContain(handles.handleOf(small[5]!.nodes[0]!.id))
  })

  it('一条带的名字最多列几个，其余只写 +k more', () => {
    const crowded = Array.from({ length: 9 }, (_, index) =>
      node({
        id: `image${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`,
        name: `S20 素材${index}`,
        kind: 'image',
      }),
    )
    const text = renderAssistantV3Board({
      canvas: {
        ...board([], [...lanes, { shotNo: 20, nodes: crowded }]),
        currentShotNo: 1,
      },
      handles: buildAssistantV3Handles([
        ...allNodes.map((item) => item.id),
        ...crowded.map((item) => item.id),
      ]),
      latestUserText: '',
    })
    expect(text).toMatch(
      /LANE 20 — off-screen, 9 cards: (「S20 素材\d」){6} \+3 more — read "lane:20" for them/,
    )
  })

  it('认得出 "lane:<n>"（大小写、空格不论），别的照原路走', () => {
    expect(parseAssistantV3LaneItem('lane:9')).toBe(9)
    expect(parseAssistantV3LaneItem(' LANE: 12 ')).toBe(12)
    expect(parseAssistantV3LaneItem('lane:')).toBeNull()
    expect(parseAssistantV3LaneItem('lane:0')).toBeNull()
    expect(parseAssistantV3LaneItem('lane:2.5')).toBeNull()
    expect(parseAssistantV3LaneItem('vid-09a1b2')).toBeNull()
  })
})
