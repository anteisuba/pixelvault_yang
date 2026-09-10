import { describe, expect, it } from 'vitest'

import {
  NODE_EDGE_VIA_IDS,
  NODE_SLOT_IDS,
  NODE_SLOT_OUTPUT_IDS,
} from '@/constants/node-slots'
import { planV4IngestDrop } from '@/hooks/node/use-cast-ingest-v4'
import {
  defaultMentionSlot,
  removeMentionsForSource,
  resolveMentionsToSlots,
} from '@/lib/node-mentions-to-slots'
import { connectIntoSlot, reconcileStateSlots } from '@/lib/node-slot-binding'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

const NOW = '2026-09-10T00:00:00.000Z'

function node(
  id: string,
  data: Partial<NodeV4Data> & { kind: NodeV4Data['kind'] },
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { name: id, status: 'idle', createdAt: NOW, ...data } as NodeV4Data,
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  slot: NodeWorkflowEdgeV4['slot'],
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

function stateOf(
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[] = [],
): NodeWorkflowStateV4 {
  return { version: 4, nodes: [...nodes], edges: [...edges] }
}

const platform = node('img-platform', {
  kind: 'image',
  subtype: 'shot',
  name: '站台图',
  url: 'https://cdn/p.png',
})
const tail = node('img-tail', {
  kind: 'image',
  subtype: 'shot',
  name: '尾帧图',
  url: 'https://cdn/t.png',
})
const narration = node('aud-1', {
  kind: 'audio',
  subtype: 'voice',
  name: '旁白',
})
const script = node('txt-1', {
  kind: 'text',
  subtype: 'script',
  name: '第二镜剧本',
  body: '',
})
const shot = node('shot-1', {
  kind: 'video',
  subtype: 'shot',
  name: '走廊',
  label: '走廊',
})

const BASE = stateOf([platform, tail, narration, script, shot])

describe('resolveMentionsToSlots · 显式角色落槽', () => {
  it('@首帧 / @尾帧 / @语音 / @参考 各落各的槽', () => {
    const diff = resolveMentionsToSlots(
      BASE,
      shot.id,
      '开场 @首帧 站台图，收在 @尾帧 尾帧图，配 @语音 旁白，参照 @参考 站台图',
    )
    expect(diff.rejected).toEqual([])
    expect(
      diff.toConnect.map((plan) => [plan.sourceNodeId, plan.slot]),
    ).toEqual([
      [platform.id, NODE_SLOT_IDS.firstFrame],
      [tail.id, NODE_SLOT_IDS.lastFrame],
      [narration.id, NODE_SLOT_IDS.voice],
      [platform.id, NODE_SLOT_IDS.reference],
    ])
  })

  it('同一个来源 + 同一个槽写两次只当一次', () => {
    const diff = resolveMentionsToSlots(
      BASE,
      shot.id,
      '@首帧 站台图 再说一次 @首帧 站台图',
    )
    expect(diff.toConnect).toHaveLength(1)
  })
})

describe('resolveMentionsToSlots · 无角色按来源 kind 落默认槽', () => {
  it('图 → 参考、语音 → 语音、文本 → 文本', () => {
    const diff = resolveMentionsToSlots(
      BASE,
      shot.id,
      '@站台图 @旁白 @第二镜剧本',
    )
    expect(diff.rejected).toEqual([])
    expect(
      diff.toConnect.map((plan) => [plan.sourceNodeId, plan.slot]),
    ).toEqual([
      [platform.id, NODE_SLOT_IDS.reference],
      [narration.id, NODE_SLOT_IDS.voice],
      [script.id, NODE_SLOT_IDS.text],
    ])
  })

  it('首选口不存在时只在「恰好一个口收这个 kind」时回落', () => {
    const doc = node('txt-2', {
      kind: 'text',
      subtype: 'shotNote',
      name: '场记',
      body: '',
    })
    // 文本节点只有 `source` 一个口，收任意 kind。
    expect(defaultMentionSlot('image', doc)).toBe(NODE_SLOT_IDS.source)
    const voiceNode = node('aud-2', {
      kind: 'audio',
      subtype: 'voice',
      name: '音色卡',
    })
    // 音色节点没有 `voice` 口，但只有 `timbre` 收音频。
    expect(defaultMentionSlot('audio', voiceNode)).toBe(NODE_SLOT_IDS.timbre)
  })
})

describe('resolveMentionsToSlots · 角色卡', () => {
  const cardImage = node('img-morning', {
    kind: 'image',
    subtype: 'character',
    name: '莫宁定妆',
    contextCardId: 'card-morning',
    url: 'https://cdn/m.png',
  })
  const cardVoice = node('aud-morning', {
    kind: 'audio',
    subtype: 'voice',
    name: '莫宁音色',
  })
  const withCard = stateOf(
    [platform, narration, shot, cardImage, cardVoice],
    [edge('e-voice', cardVoice.id, cardImage.id, NODE_SLOT_IDS.voice)],
  )
  const castCards = [{ id: 'card-morning', name: '莫宁' }]

  it('无角色 → 卡绑的那张图', () => {
    const diff = resolveMentionsToSlots(withCard, shot.id, '@莫宁 走进来', {
      castCards,
    })
    expect(diff.toConnect).toEqual([
      {
        sourceNodeId: cardImage.id,
        targetNodeId: shot.id,
        slot: NODE_SLOT_IDS.reference,
      },
    ])
  })

  it('@语音 → 卡绑的音色（挂在角色图 voice 槽上的音频节点）', () => {
    const diff = resolveMentionsToSlots(withCard, shot.id, '@语音 莫宁', {
      castCards,
    })
    expect(diff.toConnect).toEqual([
      {
        sourceNodeId: cardVoice.id,
        targetNodeId: shot.id,
        slot: NODE_SLOT_IDS.voice,
      },
    ])
  })
})

describe('resolveMentionsToSlots · 拒绝要有理由', () => {
  it('容量满 → slotFull', () => {
    const state = stateOf(
      [platform, tail, shot],
      [edge('e1', platform.id, shot.id, NODE_SLOT_IDS.reference)],
    )
    const diff = resolveMentionsToSlots(state, shot.id, '@参考 尾帧图', {
      capacityBySlot: { [NODE_SLOT_IDS.reference]: 1 },
    })
    expect(diff.toConnect).toEqual([])
    expect(diff.rejected[0]?.reason).toBe('slotFull')
    expect(diff.rejected[0]?.slot).toBe(NODE_SLOT_IDS.reference)
  })

  it('槽不收这个 kind → kindNotAllowed', () => {
    const diff = resolveMentionsToSlots(BASE, shot.id, '@首帧 旁白')
    expect(diff.rejected[0]?.reason).toBe('kindNotAllowed')
  })

  it('@ 自己 → selfLoop', () => {
    const diff = resolveMentionsToSlots(BASE, shot.id, '@参考 走廊')
    expect(diff.rejected[0]?.reason).toBe('selfLoop')
  })

  it('画布上没有这个名字 → 根本不成 chip，不产生落点', () => {
    const diff = resolveMentionsToSlots(BASE, shot.id, '@不存在的东西')
    expect(diff.toConnect).toEqual([])
    expect(diff.rejected).toEqual([])
  })
})

describe('resolveMentionsToSlots · 退格删 @ 即断槽', () => {
  const state = stateOf(
    [platform, tail, shot],
    [
      edge(
        'e-mention',
        platform.id,
        shot.id,
        NODE_SLOT_IDS.firstFrame,
        NODE_EDGE_VIA_IDS.mention,
      ),
      edge('e-dragged', tail.id, shot.id, NODE_SLOT_IDS.lastFrame),
    ],
  )

  it('正文里没人指着的 @ 边被断掉', () => {
    const diff = resolveMentionsToSlots(state, shot.id, '空镜，无引用')
    expect(diff.toDisconnect.map((plan) => plan.edgeId)).toEqual(['e-mention'])
  })

  it('⛔ 不碰手拖 / 手连进来的边（没有 via 标）', () => {
    const diff = resolveMentionsToSlots(state, shot.id, '')
    expect(diff.toDisconnect.map((plan) => plan.edgeId)).not.toContain(
      'e-dragged',
    )
  })

  it('@ 还在 → 既不重复连也不断', () => {
    const diff = resolveMentionsToSlots(state, shot.id, '@首帧 站台图')
    expect(diff.toConnect).toEqual([])
    expect(diff.toDisconnect).toEqual([])
    expect(diff.bindings).toHaveLength(1)
  })
})

describe('resolveMentionsToSlots · 同名歧义', () => {
  it('最长匹配之后仍撞名 → 取图里靠前的那个并标 ambiguous', () => {
    const twin = node('img-twin', {
      kind: 'image',
      subtype: 'shot',
      name: '站台图',
      url: 'https://cdn/twin.png',
    })
    const state = stateOf([platform, twin, shot])
    const diff = resolveMentionsToSlots(state, shot.id, '@参考 站台图')
    expect(diff.bindings[0]?.sourceNodeId).toBe(platform.id)
    expect(diff.bindings[0]?.ambiguous).toBe(true)
  })

  it('长名优先：`站台图` 与 `站台图 夜` 并存时切出长的那个', () => {
    const longer = node('img-night', {
      kind: 'image',
      subtype: 'shot',
      name: '站台图 夜',
      url: 'https://cdn/n.png',
    })
    const state = stateOf([platform, longer, shot])
    const diff = resolveMentionsToSlots(state, shot.id, '@参考 站台图 夜')
    expect(diff.bindings[0]?.sourceNodeId).toBe(longer.id)
    expect(diff.bindings[0]?.ambiguous).toBeUndefined()
  })
})

describe('removeMentionsForSource · 手拆边 → 删 chip', () => {
  it('整段删掉那个 chip，正文其余不动', () => {
    const next = removeMentionsForSource('开场 @首帧 站台图 收在门口', {
      sourceName: '站台图',
      slot: NODE_SLOT_IDS.firstFrame,
      names: ['站台图'],
    })
    expect(next).toBe('开场 收在门口')
  })

  it('正文里本来就没有 → null（不必改文本）', () => {
    expect(
      removeMentionsForSource('开场', {
        sourceName: '站台图',
        slot: NODE_SLOT_IDS.firstFrame,
        names: ['站台图'],
      }),
    ).toBeNull()
  })
})

describe('参考轨的序号引用（`@图1` / `@视频1` / `@语音1`）', () => {
  /** 轨：图 1 = 首帧站台图、图 2 = 参考尾帧图、语音 1 = 旁白。 */
  const railState = stateOf(
    [platform, tail, narration, shot],
    [
      edge('e-first', platform.id, shot.id, NODE_SLOT_IDS.firstFrame),
      edge('e-ref', tail.id, shot.id, NODE_SLOT_IDS.reference),
      edge('e-voice', narration.id, shot.id, NODE_SLOT_IDS.voice),
    ],
  )

  it('序号指轨上那一项，且**沿用它现在的槽**（⛔ 不按 kind 重推成参考）', () => {
    const diff = resolveMentionsToSlots(
      railState,
      shot.id,
      '男主（@图1）看向 @图2，配 @语音1',
    )
    expect(diff.rejected).toEqual([])
    // 三条边都已经在了 —— 序号引用只是**指着**它们，不新建边。
    expect(diff.toConnect).toEqual([])
    expect(diff.bindings.map((item) => [item.name, item.slot])).toEqual([
      ['图1', NODE_SLOT_IDS.firstFrame],
      ['图2', NODE_SLOT_IDS.reference],
      ['语音1', NODE_SLOT_IDS.voice],
    ])
  })

  it('三语前缀都收（解析靠固定表，⛔ 不靠当前 locale）', () => {
    const diff = resolveMentionsToSlots(railState, shot.id, '@image1 @音声1')
    expect(diff.bindings.map((item) => item.sourceNodeId)).toEqual([
      platform.id,
      narration.id,
    ])
  })

  it('删一项后面顺位：断掉图 1，`@图1` 改指原来的图 2', () => {
    const afterRemoval = stateOf(
      [platform, tail, narration, shot],
      [
        edge('e-ref', tail.id, shot.id, NODE_SLOT_IDS.reference),
        edge('e-voice', narration.id, shot.id, NODE_SLOT_IDS.voice),
      ],
    )
    const diff = resolveMentionsToSlots(afterRemoval, shot.id, '@图1')
    expect(diff.bindings[0]?.sourceNodeId).toBe(tail.id)
  })

  it('`@名字` 仍然照旧解析', () => {
    const diff = resolveMentionsToSlots(railState, shot.id, '参照 @尾帧 尾帧图')
    expect(diff.bindings.map((item) => [item.name, item.slot])).toEqual([
      ['尾帧图', NODE_SLOT_IDS.lastFrame],
    ])
  })
})

describe('三条路汇到同一份 reconcileStateSlots', () => {
  /** 同一个目标槽：@ 落槽 / 连线 / 拖入，三条路的 `slots` 必须一模一样。 */
  it('@、connect、拖入落同一个槽的结果一致', () => {
    const base = stateOf([platform, shot])

    // ① @ 引用
    const diff = resolveMentionsToSlots(base, shot.id, '@首帧 站台图')
    const mentionPlan = diff.toConnect[0]
    expect(mentionPlan?.slot).toBe(NODE_SLOT_IDS.firstFrame)
    const viaMention = connectIntoSlot(base, {
      source: mentionPlan?.sourceNodeId ?? '',
      target: shot.id,
      slot: NODE_SLOT_IDS.firstFrame,
      edgeId: 'e-same',
      via: NODE_EDGE_VIA_IDS.mention,
      now: NOW,
    })

    // ② 连线（`connect` op 的落点）
    const viaConnect = connectIntoSlot(base, {
      source: platform.id,
      target: shot.id,
      slot: NODE_SLOT_IDS.firstFrame,
      edgeId: 'e-same',
      now: NOW,
    })

    // ③ 拖入。⚠ 镜头卡的默认落点是**参考**（spec §5 · 2026-09-10 定稿），
    // 所以这一路比的是「同样落参考」的那两份，⛔ 不是把它掰回首帧。
    const drop = planV4IngestDrop(platform, shot, base.edges, base.nodes)
    expect(drop).toMatchObject({
      kind: 'single',
      candidate: { slot: NODE_SLOT_IDS.reference },
    })
    const viaDrop = connectIntoSlot(base, {
      source: platform.id,
      target: shot.id,
      slot: NODE_SLOT_IDS.reference,
      edgeId: 'e-same',
      now: NOW,
    })
    const viaConnectReference = connectIntoSlot(base, {
      source: platform.id,
      target: shot.id,
      slot: NODE_SLOT_IDS.reference,
      edgeId: 'e-same',
      now: NOW,
    })

    expect(viaMention.ok && viaConnect.ok && viaDrop.ok).toBe(true)
    if (
      !viaMention.ok ||
      !viaConnect.ok ||
      !viaDrop.ok ||
      !viaConnectReference.ok
    ) {
      return
    }
    const slotsOf = (state: NodeWorkflowStateV4) =>
      reconcileStateSlots(state, { now: NOW }).nodes.find(
        (item) => item.id === shot.id,
      )?.data.slots
    expect(slotsOf(viaMention.state)).toEqual(slotsOf(viaConnect.state))
    expect(slotsOf(viaDrop.state)).toEqual(slotsOf(viaConnectReference.state))
  })
})
