import { describe, expect, it } from 'vitest'

import {
  NODE_EDGE_VIA_IDS,
  NODE_MENTION_ROLE_LABELS,
  NODE_SLOT_IDS,
  NODE_SLOT_OUTPUT_IDS,
  type NodeSlotId,
} from '@/constants/node-slots'
import {
  applyNodeAssistantOpV4,
  type ApplyOpV4Context,
} from '@/lib/node-assistant-op-apply-v4'
import {
  SHOT_MATERIAL_FIRST_FRAME_PREFIX,
  firstFrameHolder,
  listFilmMaterials,
  planMaterialAdd,
  planMaterialRemove,
  planMaterialReplace,
  planMaterialSlot,
  readShotMaterials,
  type ShotTableMaterial,
} from '@/lib/shot-table-materials'
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

const shot = (id: string, prompt: string) =>
  node(id, {
    kind: 'video',
    subtype: 'shot',
    label: id,
    shotNo: 1,
    prompt,
  } as Partial<NodeV4Data>)

function edge(
  id: string,
  source: string,
  slot: NodeSlotId,
  target = 's',
  via?: 'mention',
): NodeWorkflowEdgeV4 {
  return {
    id,
    source,
    sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
    target,
    slot,
    ...(via ? { data: { via } } : {}),
  }
}

const LIN = {
  id: 'lib-lin',
  name: '林夏',
  looks: [],
} as unknown as CharacterCardRecord

function materialsOf(
  state: NodeWorkflowStateV4,
  shotId = 's',
  cards: readonly CharacterCardRecord[] = [],
): ShotTableMaterial[] {
  const target = state.nodes.find((entry) => entry.id === shotId)
  return readShotMaterials({
    prompt: target && 'prompt' in target.data ? (target.data.prompt ?? '') : '',
    incoming: state.edges.filter((entry) => entry.target === shotId),
    byId: new Map(state.nodes.map((entry) => [entry.id, entry] as const)),
    characterCards: cards,
  })
}

/** 用真的 op 执行器跑一遍（`@` 同步就在里面），⛔ 不自己模拟建边。 */
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

const ctx = (state: NodeWorkflowStateV4, locale = 'zh') => ({
  state,
  shotId: 's',
  locale,
})

const slotsOf = (state: NodeWorkflowStateV4, source: string) =>
  state.edges
    .filter((entry) => entry.target === 's' && entry.source === source)
    .map((entry) => entry.slot)

describe('readShotMaterials', () => {
  it('首 / 角 / 场 / 参 / 声，按这个顺序；尾帧与文本不算素材', () => {
    const state: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [
        shot('s', '一镜'),
        node('voice', {
          kind: 'audio',
          subtype: 'voice',
        } as Partial<NodeV4Data>),
        image('style', 'reference'),
        image('bg', 'background'),
        image('hero', 'character'),
        image('frame', 'shot'),
        image('tail', 'shot'),
        node('note', { kind: 'text', subtype: 'rule' } as Partial<NodeV4Data>),
      ],
      edges: [
        edge('e-voice', 'voice', NODE_SLOT_IDS.voice),
        edge('e-style', 'style', NODE_SLOT_IDS.reference),
        edge('e-bg', 'bg', NODE_SLOT_IDS.reference),
        edge('e-hero', 'hero', NODE_SLOT_IDS.reference),
        edge('e-frame', 'frame', NODE_SLOT_IDS.firstFrame),
        edge('e-tail', 'tail', NODE_SLOT_IDS.lastFrame),
        edge('e-note', 'note', NODE_SLOT_IDS.text),
      ],
    }
    expect(
      materialsOf(state).map((entry) => [entry.sourceId, entry.role]),
    ).toEqual([
      ['frame', 'first'],
      ['hero', 'character'],
      ['bg', 'scene'],
      ['style', 'reference'],
      ['voice', 'voice'],
    ])
  })

  it('当首帧的角色卡：角色字是「首」，种类仍是角', () => {
    const state: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [shot('s', 'x'), image('hero', 'character')],
      edges: [edge('e', 'hero', NODE_SLOT_IDS.firstFrame)],
    }
    expect(materialsOf(state)[0]).toMatchObject({
      role: 'first',
      kindRole: 'character',
      thumbUrl: 'https://cdn/hero.png',
    })
  })

  it('@ 到的角色库人物进列；画布上已有绑她的卡连着，就不再出现第二次', () => {
    const base: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [shot('s', '@林夏 回头')],
      edges: [],
    }
    expect(materialsOf(base, 's', [LIN])).toMatchObject([
      { origin: 'library', sourceId: 'lib-lin', role: 'character' },
    ])
    const bound: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [
        shot('s', '@林夏 回头'),
        image('lin-card', 'character', {
          characterId: 'lib-lin',
          name: '林夏',
        }),
      ],
      edges: [edge('e', 'lin-card', NODE_SLOT_IDS.reference)],
    }
    expect(materialsOf(bound, 's', [LIN]).map((entry) => entry.origin)).toEqual(
      ['edge'],
    )
  })
})

describe('listFilmMaterials', () => {
  it('全片素材 = 各镜在用的，同一来源只出现一次', () => {
    const film = listFilmMaterials([
      {
        materials: [
          { origin: 'edge', sourceId: 'bg', kindRole: 'scene', name: 'bg' },
          {
            origin: 'library',
            sourceId: 'lib-lin',
            kindRole: 'character',
            name: '林夏',
          },
        ] as ShotTableMaterial[],
      },
      {
        materials: [
          { origin: 'edge', sourceId: 'bg', kindRole: 'scene', name: 'bg' },
        ] as ShotTableMaterial[],
      },
    ])
    expect(film.map((entry) => entry.sourceId)).toEqual(['bg', 'lib-lin'])
  })
})

describe('改列 = 改边（真跑 op 执行器）', () => {
  it('写回前缀必须是解析器认的首帧前缀', () => {
    for (const prefix of Object.values(SHOT_MATERIAL_FIRST_FRAME_PREFIX)) {
      expect(NODE_MENTION_ROLE_LABELS[prefix]).toBe(NODE_SLOT_IDS.firstFrame)
    }
  })

  it('「+」= 说明末尾写 @名字，同步自己把边建上（一条 set_prompt）', () => {
    const state: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [
        shot('s', '雪夜街道'),
        image('bg', 'background', { name: '街道' }),
      ],
      edges: [],
    }
    const ops = planMaterialAdd(ctx(state), {
      origin: 'edge',
      sourceId: 'bg',
      kindRole: 'scene',
      name: '街道',
      mediaKind: 'image',
    })
    expect(ops).toEqual([
      {
        op: 'set_prompt',
        target: 's',
        prompt: '雪夜街道 @街道',
        mode: 'replace',
      },
    ])
    const after = run(state, ops)
    expect(slotsOf(after, 'bg')).toEqual([NODE_SLOT_IDS.reference])
    expect(after.edges[0]?.data?.via).toBe(NODE_EDGE_VIA_IDS.mention)
  })

  it('「+」角色卡（绑了角色库，不走 @ 连线）= 直接 connect', () => {
    const state: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [
        shot('s', 'x'),
        image('lin-card', 'character', {
          characterId: 'lib-lin',
          name: '林夏',
        }),
      ],
      edges: [],
    }
    const ops = planMaterialAdd(ctx(state), {
      origin: 'edge',
      sourceId: 'lin-card',
      kindRole: 'character',
      name: '林夏',
      mediaKind: 'image',
    })
    expect(ops).toEqual([
      { op: 'connect', source: 'lin-card', target: 's', slot: 'reference' },
    ])
    expect(slotsOf(run(state, ops), 'lin-card')).toEqual(['reference'])
  })

  it('移除 @ 建的：删正文里的 @，边跟着断', () => {
    const state: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [
        shot('s', '@街道 雪落'),
        image('bg', 'background', { name: '街道' }),
      ],
      edges: [edge('e', 'bg', NODE_SLOT_IDS.reference, 's', 'mention')],
    }
    const [material] = materialsOf(state)
    const ops = planMaterialRemove(ctx(state), material!)
    expect(ops).toEqual([
      { op: 'set_prompt', target: 's', prompt: '雪落', mode: 'replace' },
    ])
    expect(slotsOf(run(state, ops), 'bg')).toEqual([])
  })

  it('移除手拖的：只断边，正文不动', () => {
    const state: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [shot('s', '雪落'), image('bg', 'background')],
      edges: [edge('e', 'bg', NODE_SLOT_IDS.reference)],
    }
    const ops = planMaterialRemove(ctx(state), materialsOf(state)[0]!)
    expect(ops).toEqual([{ op: 'disconnect', edgeId: 'e' }])
  })

  it('移除角色库的人：删 @，没有边可断', () => {
    const state: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [shot('s', '@林夏 回头')],
      edges: [],
    }
    const [material] = materialsOf(state, 's', [LIN])
    expect(planMaterialRemove(ctx(state), material!)).toEqual([
      { op: 'set_prompt', target: 's', prompt: '回头', mode: 'replace' },
    ])
  })

  it('当首帧（@ 建的）：改成 @首帧 前缀，同步把参考换成首帧', () => {
    const state: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [
        shot('s', '@街道 雪落'),
        image('bg', 'background', { name: '街道' }),
      ],
      edges: [edge('e', 'bg', NODE_SLOT_IDS.reference, 's', 'mention')],
    }
    const ops = planMaterialSlot(
      ctx(state),
      materialsOf(state)[0]!,
      'firstFrame',
    )
    expect(ops).toEqual([
      {
        op: 'set_prompt',
        target: 's',
        prompt: '@首帧 街道 雪落',
        mode: 'replace',
      },
    ])
    expect(slotsOf(run(state, ops), 'bg')).toEqual([NODE_SLOT_IDS.firstFrame])
  })

  it('当首帧（手拖的，正文没 @）：断了再连，一步撤销', () => {
    const state: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [shot('s', '雪落'), image('bg', 'background')],
      edges: [edge('e', 'bg', NODE_SLOT_IDS.reference)],
    }
    const ops = planMaterialSlot(
      ctx(state),
      materialsOf(state)[0]!,
      'firstFrame',
    )
    expect(ops).toEqual([
      { op: 'disconnect', edgeId: 'e' },
      { op: 'connect', source: 'bg', target: 's', slot: 'firstFrame' },
    ])
    expect(slotsOf(run(state, ops), 'bg')).toEqual([NODE_SLOT_IDS.firstFrame])
  })

  it('当参考：首帧前缀去掉（英文界面写的是 first 前缀也认）', () => {
    const state: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [
        shot('s', 'rain @first Street'),
        image('bg', 'background', { name: 'Street' }),
      ],
      edges: [edge('e', 'bg', NODE_SLOT_IDS.firstFrame, 's', 'mention')],
    }
    const ops = planMaterialSlot(
      ctx(state, 'en'),
      materialsOf(state)[0]!,
      'reference',
    )
    expect(ops).toEqual([
      {
        op: 'set_prompt',
        target: 's',
        prompt: 'rain @Street',
        mode: 'replace',
      },
    ])
    expect(slotsOf(run(state, ops), 'bg')).toEqual([NODE_SLOT_IDS.reference])
  })

  describe('首帧被占着时选「首帧」= 对调（第 25 条）', () => {
    const swap = (state: NodeWorkflowStateV4) => {
      const materials = materialsOf(state)
      const target = materials.find((entry) => entry.sourceId === 'bg')!
      return planMaterialSlot(
        ctx(state),
        target,
        'firstFrame',
        firstFrameHolder(materials),
      )
    }

    it('两项都是 @ 建的：先断占位者，正文两个前缀一起改', () => {
      const state: NodeWorkflowStateV4 = {
        version: 4,
        nodes: [
          shot('s', '@首帧 车窗 @街道 雪落'),
          image('frame', 'shot', { name: '车窗' }),
          image('bg', 'background', { name: '街道' }),
        ],
        edges: [
          edge('e1', 'frame', NODE_SLOT_IDS.firstFrame, 's', 'mention'),
          edge('e2', 'bg', NODE_SLOT_IDS.reference, 's', 'mention'),
        ],
      }
      const ops = swap(state)
      expect(ops).toEqual([
        { op: 'disconnect', edgeId: 'e1' },
        {
          op: 'set_prompt',
          target: 's',
          prompt: '@车窗 @首帧 街道 雪落',
          mode: 'replace',
        },
      ])
      const after = run(state, ops)
      expect(slotsOf(after, 'bg')).toEqual([NODE_SLOT_IDS.firstFrame])
      expect(slotsOf(after, 'frame')).toEqual([NODE_SLOT_IDS.reference])
    })

    it('两项都是手拖的：断两条、连两条', () => {
      const state: NodeWorkflowStateV4 = {
        version: 4,
        nodes: [
          shot('s', '雪落'),
          image('frame', 'shot', { name: '车窗' }),
          image('bg', 'background', { name: '街道' }),
        ],
        edges: [
          edge('e1', 'frame', NODE_SLOT_IDS.firstFrame),
          edge('e2', 'bg', NODE_SLOT_IDS.reference),
        ],
      }
      const ops = swap(state)
      expect(ops).toEqual([
        { op: 'disconnect', edgeId: 'e1' },
        { op: 'connect', source: 'frame', target: 's', slot: 'reference' },
        { op: 'disconnect', edgeId: 'e2' },
        { op: 'connect', source: 'bg', target: 's', slot: 'firstFrame' },
      ])
      const after = run(state, ops)
      expect(slotsOf(after, 'bg')).toEqual([NODE_SLOT_IDS.firstFrame])
      expect(slotsOf(after, 'frame')).toEqual([NODE_SLOT_IDS.reference])
    })

    it('占位者是 @ 建的、新首帧是手拖的：首帧先腾空再连，不撞容量', () => {
      const state: NodeWorkflowStateV4 = {
        version: 4,
        nodes: [
          shot('s', '@首帧 车窗 雪落'),
          image('frame', 'shot', { name: '车窗' }),
          image('bg', 'background', { name: '街道' }),
        ],
        edges: [
          edge('e1', 'frame', NODE_SLOT_IDS.firstFrame, 's', 'mention'),
          edge('e2', 'bg', NODE_SLOT_IDS.reference),
        ],
      }
      const after = run(state, swap(state))
      expect(slotsOf(after, 'bg')).toEqual([NODE_SLOT_IDS.firstFrame])
      expect(slotsOf(after, 'frame')).toEqual([NODE_SLOT_IDS.reference])
    })
  })

  it('换一张：同一个槽换成另一项，一批 op', () => {
    const state: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [
        shot('s', '@首帧 街道 雪落'),
        image('bg', 'background', { name: '街道' }),
        image('bg2', 'background', { name: '桥' }),
      ],
      edges: [edge('e', 'bg', NODE_SLOT_IDS.firstFrame, 's', 'mention')],
    }
    const ops = planMaterialReplace(ctx(state), materialsOf(state)[0]!, {
      origin: 'edge',
      sourceId: 'bg2',
      kindRole: 'scene',
      name: '桥',
      mediaKind: 'image',
    })
    const after = run(state, ops)
    expect(slotsOf(after, 'bg')).toEqual([])
    expect(slotsOf(after, 'bg2')).toEqual([NODE_SLOT_IDS.firstFrame])
    const shotNode = after.nodes[0]
    expect(
      shotNode && 'prompt' in shotNode.data ? shotNode.data.prompt : undefined,
    ).toBe('雪落 @首帧 桥')
  })

  it('首帧被谁占着', () => {
    const state: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [shot('s', 'x'), image('a', 'shot'), image('b', 'reference')],
      edges: [
        edge('e1', 'b', NODE_SLOT_IDS.reference),
        edge('e2', 'a', NODE_SLOT_IDS.firstFrame),
      ],
    }
    expect(firstFrameHolder(materialsOf(state))?.sourceId).toBe('a')
  })
})
