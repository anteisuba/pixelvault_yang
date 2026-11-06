import { describe, expect, it } from 'vitest'

import {
  NODE_SLOT_IDS,
  NODE_SLOT_OUTPUT_IDS,
  type NodeSlotId,
} from '@/constants/node-slots'
import {
  applyNodeAssistantOpV4,
  type ApplyOpV4Context,
} from '@/lib/node-assistant-op-apply-v4'
import {
  filmMaterialShots,
  isFilmMaterialNode,
  listIdleFilmMaterials,
  listMaterialPicks,
  planFilmMaterialAdd,
  planFilmMaterialRemove,
} from '@/lib/shot-film-materials'
import { listFilmMaterials } from '@/lib/shot-table-materials'
import { buildShotTableRows } from '@/lib/shot-table-rows'
import type { CharacterCardRecord } from '@/types'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

const NOW = '2026-11-07T00:00:00.000Z'

function node(id: string, data: Partial<NodeV4Data>): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { name: id, status: 'idle', createdAt: NOW, ...data } as NodeV4Data,
  }
}

const image = (id: string, subtype: string, extra = {}) =>
  node(id, {
    kind: 'image',
    subtype,
    url: `https://cdn/${id}.png`,
    ...extra,
  } as Partial<NodeV4Data>)

const shot = (id: string, shotNo: number, prompt = '') =>
  node(id, {
    kind: 'video',
    subtype: 'shot',
    label: id,
    shotNo,
    prompt,
  } as Partial<NodeV4Data>)

const edge = (
  id: string,
  source: string,
  target: string,
  slot: NodeSlotId = NODE_SLOT_IDS.reference,
): NodeWorkflowEdgeV4 => ({
  id,
  source,
  sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
  target,
  slot,
})

const LIN = {
  id: 'lib-lin',
  name: '林夏',
  looks: [],
} as unknown as CharacterCardRecord
const QIU = {
  id: 'lib-qiu',
  name: '秋',
  looks: [],
} as unknown as CharacterCardRecord

function run(
  state: NodeWorkflowStateV4,
  ops: readonly NodeAssistantOpV4[],
): NodeWorkflowStateV4 {
  let counter = 0
  const context: ApplyOpV4Context = {
    now: NOW,
    refs: new Map(),
    mintId: (prefix) => `${prefix}_${++counter}`,
  }
  let next = state
  for (const op of ops) {
    const result = applyNodeAssistantOpV4(next, op, context)
    if (!result.ok) throw new Error(`op failed: ${JSON.stringify(op)}`)
    next = result.state
  }
  return next
}

function base(): NodeWorkflowStateV4 {
  return {
    version: 4,
    nodes: [
      shot('s1', 1),
      shot('s2', 2),
      shot('s3', 3),
      image('bg', 'background'),
      image('style', 'reference'),
      image('lin', 'character', { characterId: LIN.id }),
      node('voice', { kind: 'audio', subtype: 'voice' } as Partial<NodeV4Data>),
      node('note', { kind: 'text', text: '旁白' } as Partial<NodeV4Data>),
    ],
    edges: [
      edge('e1', 'bg', 's1'),
      edge('e2', 'bg', 's3'),
      edge('e3', 'style', 's2', NODE_SLOT_IDS.firstFrame),
      edge('e4', 'bg', 's1', NODE_SLOT_IDS.firstFrame),
    ],
  }
}

const rowsOf = (state: NodeWorkflowStateV4) =>
  buildShotTableRows({
    nodes: state.nodes,
    edges: state.edges,
    ...(state.shotlist ? { shotlist: state.shotlist } : {}),
  })

describe('isFilmMaterialNode', () => {
  it('图 / 音频 / 普通视频算；镜头卡和文本卡不算', () => {
    const state = base()
    const kinds = state.nodes.map((entry) => [
      entry.id,
      isFilmMaterialNode(entry),
    ])
    expect(Object.fromEntries(kinds)).toEqual({
      s1: false,
      s2: false,
      s3: false,
      bg: true,
      style: true,
      lin: true,
      voice: true,
      note: false,
    })
    expect(
      isFilmMaterialNode(
        node('clip', { kind: 'video', subtype: 'clip' } as Partial<NodeV4Data>),
      ),
    ).toBe(true)
  })
})

describe('filmMaterialShots', () => {
  it('每张卡被哪几镜用，按镜号排，同一镜挂两次只记一次', () => {
    const shots = filmMaterialShots(rowsOf(base()))
    expect(shots.get('bg')).toEqual(['s1', 's3'])
    expect(shots.get('style')).toEqual(['s2'])
    expect(shots.has('voice')).toBe(false)
  })

  it('角色库的人不算（不是画布卡，不画线）', () => {
    const state = base()
    state.nodes[0] = shot('s1', 1, `@${QIU.name} 回头`)
    const rows = buildShotTableRows({
      nodes: state.nodes,
      edges: state.edges,
      characterCards: [QIU],
    })
    expect(rows[0]?.materials.some((m) => m.origin === 'library')).toBe(true)
    expect(filmMaterialShots(rows).has(QIU.id)).toBe(false)
  })
})

describe('listIdleFilmMaterials', () => {
  it('只给「列在 materials 里、卡还在、还没人用」的那几张，去重保序', () => {
    const state: NodeWorkflowStateV4 = {
      ...base(),
      shotlist: { materials: ['voice', 'gone', 'bg', 'voice', 'note', 'lin'] },
    }
    const used = filmMaterialShots(rowsOf(state))
    const idle = listIdleFilmMaterials({
      nodes: state.nodes,
      shotlist: state.shotlist,
      used,
    })
    expect(idle.map((m) => m.sourceId)).toEqual(['voice', 'lin'])
    expect(idle.every((m) => m.idle)).toBe(true)
    expect(idle[1]).toMatchObject({ kindRole: 'character', origin: 'edge' })
  })
})

describe('listMaterialPicks', () => {
  it('画布上的 = 还不在全片素材里的素材卡；角色库 = 不在、且画布上没有绑着他的卡在里面', () => {
    const state = base()
    const film = [
      ...listFilmMaterials(rowsOf(state)),
      ...listIdleFilmMaterials({
        nodes: state.nodes,
        shotlist: { materials: ['lin'] },
        used: filmMaterialShots(rowsOf(state)),
      }),
    ]
    const picks = listMaterialPicks({
      nodes: state.nodes,
      film,
      characterCards: [LIN, QIU],
    })
    expect(picks.canvas.map((m) => m.sourceId)).toEqual(['voice'])
    expect(picks.library.map((m) => m.sourceId)).toEqual([QIU.id])
    expect(picks.library[0]).toMatchObject({
      origin: 'library',
      kindRole: 'character',
      name: '秋',
    })
  })
})

describe('planFilmMaterialAdd / planFilmMaterialRemove', () => {
  it('拖一张进来 = 一条 set_shotlist；别的键（board / look）原样留着', () => {
    const state: NodeWorkflowStateV4 = {
      ...base(),
      shotlist: { look: '冷色', board: { x: 10, y: 20 } },
    }
    const ops = planFilmMaterialAdd(state, 'voice')
    expect(ops).toHaveLength(1)
    const next = run(state, ops)
    expect(next.shotlist).toEqual({
      look: '冷色',
      board: { x: 10, y: 20 },
      materials: ['voice'],
    })
  })

  it('已经列着、镜头卡、文本卡、不存在的卡 = 不发', () => {
    const state: NodeWorkflowStateV4 = {
      ...base(),
      shotlist: { materials: ['voice'] },
    }
    for (const id of ['voice', 's1', 'note', 'nope']) {
      expect(planFilmMaterialAdd(state, id)).toEqual([])
    }
  })

  it('写回时顺手去掉已经删掉的卡', () => {
    const state: NodeWorkflowStateV4 = {
      ...base(),
      shotlist: { materials: ['gone', 'voice'] },
    }
    const next = run(state, planFilmMaterialAdd(state, 'lin'))
    expect(next.shotlist?.materials).toEqual(['voice', 'lin'])
  })

  it('拿掉最后一张、表也没别的键 = 整份 shotlist 清空（撤销能退回）', () => {
    const state: NodeWorkflowStateV4 = {
      ...base(),
      shotlist: { materials: ['voice'] },
    }
    const ops = planFilmMaterialRemove(state, 'voice')
    expect(ops).toEqual([{ op: 'set_shotlist' }])
    expect(run(state, ops).shotlist).toBeUndefined()
  })

  it('拿掉一张留着别的；不在列表里 = 不发', () => {
    const state: NodeWorkflowStateV4 = {
      ...base(),
      shotlist: { materials: ['voice', 'lin'], board: { x: 0, y: 0 } },
    }
    const next = run(state, planFilmMaterialRemove(state, 'voice'))
    expect(next.shotlist).toEqual({ materials: ['lin'], board: { x: 0, y: 0 } })
    expect(planFilmMaterialRemove(state, 'bg')).toEqual([])
  })
})
