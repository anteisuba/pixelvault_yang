import { describe, expect, it } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

import type { NodeV4Data, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

import {
  buildNodeCanvasSnapshotV4,
  collectSlotLines,
  type CanvasSnapshotV4Node,
} from './node-assistant-context'

function v4Node(
  id: string,
  data: Partial<NodeV4Data> & Pick<NodeV4Data, 'kind' | 'subtype'>,
): CanvasSnapshotV4Node {
  return {
    id,
    data: {
      name: id,
      status: 'done',
      createdAt: '2026-09-06T00:00:00.000Z',
      ...data,
    } as NodeV4Data,
  }
}

function v4Edge(
  id: string,
  source: string,
  target: string,
  slot: NodeWorkflowEdgeV4['slot'],
  sourceHandle: NodeWorkflowEdgeV4['sourceHandle'] = 'out',
): NodeWorkflowEdgeV4 {
  return { id, source, target, slot, sourceHandle }
}

describe('buildNodeCanvasSnapshotV4', () => {
  const shot02 = v4Node('v_02', {
    kind: 'video',
    subtype: 'shot',
    name: 'S02·镜头',
    label: '有人还在',
    status: 'running',
    shotNo: 2,
    prompt: '以新首帧锁定人物、饰件、服装及体积感。',
    params: { duration: '7', aspectRatio: '16:9' },
    model: {
      optionId: 'seedance-2.5',
      modelId: 'seedance-2.5',
      adapterType: AI_ADAPTER_TYPES.FAL,
      providerConfig: { label: 'Fal', baseUrl: 'https://fal.run' },
    },
    slots: {
      firstFrame: {
        slot: 'firstFrame',
        cur: 'ver5',
        versions: [
          {
            id: 'ver4',
            edgeId: 'e_old',
            sourceNodeId: 'i_kf02a4',
            blocked: true,
            addedAt: '2026-09-05T00:00:00.000Z',
          },
          {
            id: 'ver5',
            edgeId: 'e_new',
            sourceNodeId: 'i_kf02c5',
            blocked: false,
            addedAt: '2026-09-06T00:00:00.000Z',
          },
        ],
      },
    },
  })
  const firstFrame = v4Node('i_kf02c5', {
    kind: 'image',
    subtype: 'shot',
    name: 'S02·首帧',
    shotNo: 2,
  })
  const voice = v4Node('a_sig', {
    kind: 'audio',
    subtype: 'voice',
    name: 'S02·语音',
    shotNo: 2,
    ownerName: '西格莉卡',
  })
  const rejected = v4Node('i_kf02a4', {
    kind: 'image',
    subtype: 'shot',
    name: 'kf02-action-v4',
    blocked: true,
    blockedReason: '首帧动作不自然',
  })
  const edges = [
    v4Edge('e_new', 'i_kf02c5', 'v_02', 'firstFrame'),
    v4Edge('e_voice', 'a_sig', 'v_02', 'voice'),
  ]

  it('边内联在目标节点下，槽内只报当前版 + 版本数', () => {
    const text = buildNodeCanvasSnapshotV4(
      [shot02, firstFrame, voice, rejected],
      edges,
      { currentShotNo: 2 },
    )
    expect(text).toContain(
      'S02·有人还在 [[node:v_02]] video.shot · running · 7 · seedance-2.5 · 16:9',
    )
    expect(text).toContain(
      '  firstFrame ← [[node:i_kf02c5]] S02·首帧 (image.shot, done, 当前 · 共 2 版)',
    )
    expect(text).toContain(
      '  voice ← [[node:a_sig]] S02·语音 (audio.voice, done, owner=西格莉卡)',
    )
    // 非当前版（ver4 的源）不进快照的槽行。
    expect(text).not.toContain('firstFrame ← [[node:i_kf02a4]]')
    // 已内联的源节点不再单列。
    expect(text).not.toMatch(/^\[\[node:i_kf02c5\]\]/m)
  })

  it('散节点单列一段，带 blocked 理由', () => {
    const text = buildNodeCanvasSnapshotV4(
      [shot02, firstFrame, voice, rejected],
      edges,
      { currentShotNo: 2 },
    )
    expect(text).toContain('# 散节点')
    expect(text).toContain(
      '[[node:i_kf02a4]] kf02-action-v4 (image.shot, done, blocked: 首帧动作不自然)',
    )
  })

  it('当前镜与相邻两镜完整，其余一行标题', () => {
    const others = [3, 5, 7].map((shotNo) =>
      v4Node(`v_0${shotNo}`, {
        kind: 'video',
        subtype: 'shot',
        name: `S0${shotNo}·镜头`,
        label: `镜头${shotNo}`,
        shotNo,
        prompt: '别的镜头提示词',
      }),
    )
    const text = buildNodeCanvasSnapshotV4([shot02, ...others], [], {
      currentShotNo: 2,
    })
    // 相邻镜 S03 完整（带 prompt），远镜 S05 / S07 只有标题行。
    expect(text).toContain('  prompt: 别的镜头提示词')
    expect(text).toContain('S05·镜头5 [[node:v_05]] video.shot · done')
    expect(text.match(/prompt: 别的镜头提示词/g)).toHaveLength(1)
  })

  it('选中或最近改动的远镜升为完整档', () => {
    const far = v4Node('v_09', {
      kind: 'video',
      subtype: 'shot',
      shotNo: 9,
      prompt: '远镜提示词',
    })
    expect(
      buildNodeCanvasSnapshotV4([shot02, far], [], { currentShotNo: 2 }),
    ).not.toContain('远镜提示词')
    expect(
      buildNodeCanvasSnapshotV4([shot02, far], [], {
        currentShotNo: 2,
        selectedIds: ['v_09'],
      }),
    ).toContain('远镜提示词')
    expect(
      buildNodeCanvasSnapshotV4([shot02, far], [], {
        currentShotNo: 2,
        changedIds: ['v_09'],
      }),
    ).toContain('远镜提示词')
  })

  it('单镜结构超预算时先降 prompt，仍超才降成标题行并明说', () => {
    // 槽极多的一镜：每条槽行都带一个长名字，把结构撑过 maxShotBlockLength。
    const sources = Array.from({ length: 10 }, (_, index) =>
      v4Node(`a_${index}`, {
        kind: 'audio',
        subtype: 'voice',
        name: `${'名'.repeat(80)}${index}`,
        shotNo: 6,
      }),
    )
    const wide = v4Node('v_06', {
      kind: 'video',
      subtype: 'shot',
      shotNo: 6,
      prompt: 'p'.repeat(300),
    })
    const wideEdges = sources.map((source, index) =>
      v4Edge(`e_${index}`, source.id, 'v_06', 'voice'),
    )

    // 少量槽 → prompt 还在。
    expect(
      buildNodeCanvasSnapshotV4(
        [wide, ...sources.slice(0, 2)],
        wideEdges.slice(0, 2),
        { currentShotNo: 6 },
      ),
    ).toContain('prompt: ')

    // 槽多到撑爆预算 → prompt 先被砍，槽行仍在。
    const trimmed = buildNodeCanvasSnapshotV4([wide, ...sources], wideEdges, {
      currentShotNo: 6,
    })
    expect(trimmed).not.toContain('prompt: ')
    expect(trimmed).toContain('  voice ← [[node:a_0]]')

    // 槽行本身就超预算 → 整镜降为标题行，并明说自己被降了。
    const flood = Array.from({ length: 40 }, (_, index) =>
      v4Node(`b_${index}`, {
        kind: 'audio',
        subtype: 'voice',
        name: `${'名'.repeat(120)}${index}`,
        shotNo: 6,
      }),
    )
    const demoted = buildNodeCanvasSnapshotV4(
      [wide, ...flood],
      flood.map((source, index) =>
        v4Edge(`f_${index}`, source.id, 'v_06', 'voice'),
      ),
      { currentShotNo: 6 },
    )
    expect(demoted).not.toContain('  voice ←')
    expect(demoted).toContain('S06 已降为标题行（结构过长）')
  })

  it('标题档超行数上限时说出省了多少，⛔ 不静默截断', () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      v4Node(`v_${index + 10}`, {
        kind: 'video',
        subtype: 'shot',
        shotNo: index + 10,
      }),
    )
    const text = buildNodeCanvasSnapshotV4(many, [], {
      currentShotNo: 1,
      maxTitleRows: 2,
    })
    expect(text).toContain('… 另有 4 个镜头未列出')
  })

  it('跨镜 tailFrame 边另起「接续」一段', () => {
    const text = buildNodeCanvasSnapshotV4(
      [shot02, v4Node('v_03', { kind: 'video', subtype: 'shot', shotNo: 3 })],
      [v4Edge('e_tail', 'v_02', 'v_03', 'firstFrame', 'tailFrame')],
      { currentShotNo: 2 },
    )
    expect(text).toContain('# 接续')
    expect(text).toContain('[[node:v_02]] tailFrame → [[node:v_03]] firstFrame')
  })

  it('空画布给空串，不编造结构', () => {
    expect(buildNodeCanvasSnapshotV4([], [])).toBe('')
  })
})

describe('快照 · C1 契约修正', () => {
  it('镜头行是「序号 + 标签」，换序只动序号，标签不变', () => {
    const shot = v4Node('v_02', {
      kind: 'video',
      subtype: 'shot',
      name: 'S02·镜头',
      label: '有人还在',
      shotNo: 2,
    })
    expect(
      buildNodeCanvasSnapshotV4([shot], [], { currentShotNo: 2 }),
    ).toContain('S02·有人还在 [[node:v_02]]')
    const reordered = { ...shot, data: { ...shot.data, shotNo: 5 } }
    expect(
      buildNodeCanvasSnapshotV4([reordered], [], { currentShotNo: 5 }),
    ).toContain('S05·有人还在 [[node:v_02]]')
  })

  it('文本槽按角色分列，⛔ 剧本与约束不混成一行', () => {
    const shot = v4Node('v_02', {
      kind: 'video',
      subtype: 'shot',
      label: '有人还在',
      shotNo: 2,
    })
    const script = v4Node('t_script', {
      kind: 'text',
      subtype: 'script',
      name: '台词',
      body: '她转身',
      shotNo: 2,
    })
    const style = v4Node('t_rule', {
      kind: 'text',
      subtype: 'rule',
      name: '风格卡',
      body: '不许出现字幕',
      shotNo: 2,
    })
    const character = v4Node('t_char', {
      kind: 'text',
      subtype: 'shotNote',
      name: '角色设定',
      body: '西格莉卡：银发',
      defaultRole: 'character',
      shotNo: 2,
    })
    const text = buildNodeCanvasSnapshotV4(
      [shot, script, style, character],
      [
        v4Edge('e1', 't_script', 'v_02', 'text'),
        v4Edge('e2', 't_rule', 'v_02', 'text'),
        v4Edge('e3', 't_char', 'v_02', 'text'),
      ],
      { currentShotNo: 2 },
    )
    expect(text).toContain('  text[剧本] ← [[node:t_script]] 台词')
    expect(text).toContain('  text[风格约束] ← [[node:t_rule]] 风格卡')
    expect(text).toContain('  text[角色描述] ← [[node:t_char]] 角色设定')
  })

  it('角色节点带 [卡:名]，⛔ 只给名字不给 id', () => {
    const character = v4Node('i_char', {
      kind: 'image',
      subtype: 'character',
      name: '角色·西格莉卡',
      characterName: '西格莉卡',
      contextCardId: 'card_7f3',
    })
    const text = buildNodeCanvasSnapshotV4([character], [])
    expect(text).toContain('[[node:i_char]] 角色·西格莉卡 [卡:西格莉卡]')
    expect(text).not.toContain('card_7f3')
  })
})

describe('collectSlotLines', () => {
  it('没有 binding 的 0..N 槽回落到边表，多值并列全列', () => {
    const target = v4Node('v_1', { kind: 'video', subtype: 'shot', shotNo: 1 })
    const lines = collectSlotLines(target, [
      v4Edge('e1', 'a1', 'v_1', 'voice'),
      v4Edge('e2', 'a2', 'v_1', 'voice'),
      v4Edge('e3', 'x', 'other', 'voice'),
    ])
    expect(lines).toEqual([
      { slot: 'voice', sourceId: 'a1', versionCount: 1 },
      { slot: 'voice', sourceId: 'a2', versionCount: 1 },
    ])
  })

  it('cur 为空的槽不产生行（空槽不冒充有内容）', () => {
    const target = v4Node('v_1', {
      kind: 'video',
      subtype: 'shot',
      shotNo: 1,
      slots: {
        firstFrame: { slot: 'firstFrame', cur: null, versions: [] },
      },
    })
    expect(collectSlotLines(target, [])).toEqual([])
  })
})

/* ── 第三期 C3b：助手看到的 v4 画布上下文 ──────────────────────────────
 * `buildNodeCanvasSnapshotV4` / `collectSlotLines` 在 C1 就已经按 v4 读了，本片
 * 只补测试 —— 补的正是「按槽读」这条路径上没被锁住的三处：文本角色的来源、
 * binding 与边表两条读法的优先级、以及一跳外的源不会被当成直连槽。
 * ────────────────────────────────────────────────────────────────────── */

describe('collectSlotLines · v4 读取路径（C3b 补测）', () => {
  it('文本槽的角色优先读 binding 上落的那个，其次问源节点', () => {
    const rule = v4Node('t_rule', {
      kind: 'text',
      subtype: 'rule',
      body: '胶片颗粒',
    })
    const note = v4Node('t_note', {
      kind: 'text',
      subtype: 'shotNote',
      body: '她回头',
      defaultRole: 'script',
    })
    const shot = v4Node('v_1', { kind: 'video', subtype: 'shot', shotNo: 1 })
    const byId = new Map([
      [rule.id, rule],
      [note.id, note],
      [shot.id, shot],
    ])
    const lines = collectSlotLines(
      shot,
      [
        v4Edge('e1', 't_note', 'v_1', 'text'),
        v4Edge('e2', 't_rule', 'v_1', 'text'),
      ],
      byId,
    )
    // 没有 binding → 角色由源节点的 defaultRole / 子型推出来（rule 子型 → style）。
    expect(lines.map((line) => line.role)).toEqual(['script', 'style'])
  })

  it('binding 上显式写了角色时，它压过源节点的子型', () => {
    const note = v4Node('t_note', {
      kind: 'text',
      subtype: 'shotNote',
      body: '她回头',
      defaultRole: 'script',
    })
    const shot = v4Node('v_1', {
      kind: 'video',
      subtype: 'shot',
      shotNo: 1,
      slots: {
        text: {
          slot: 'text',
          cur: 'ver-1',
          versions: [
            {
              id: 'ver-1',
              edgeId: 'e1',
              sourceNodeId: 't_note',
              role: 'character',
              blocked: false,
              addedAt: '2026-09-06T00:00:00.000Z',
            },
          ],
        },
      },
    })
    const lines = collectSlotLines(
      shot,
      [v4Edge('e1', 't_note', 'v_1', 'text')],
      new Map([
        [note.id, note],
        [shot.id, shot],
      ]),
    )
    expect(lines).toEqual([
      { slot: 'text', sourceId: 't_note', versionCount: 1, role: 'character' },
    ])
  })

  it('有 binding 的槽**不**再回落边表 —— 两条读法不叠加', () => {
    const shot = v4Node('v_1', {
      kind: 'video',
      subtype: 'shot',
      shotNo: 1,
      slots: {
        firstFrame: {
          slot: 'firstFrame',
          cur: 'ver-1',
          versions: [
            {
              id: 'ver-1',
              edgeId: 'e1',
              sourceNodeId: 'img_a',
              blocked: false,
              addedAt: '2026-09-06T00:00:00.000Z',
            },
            {
              id: 'ver-2',
              edgeId: 'e2',
              sourceNodeId: 'img_b',
              blocked: false,
              addedAt: '2026-09-06T00:00:00.000Z',
            },
          ],
        },
      },
    })
    const lines = collectSlotLines(shot, [
      v4Edge('e1', 'img_a', 'v_1', 'firstFrame'),
      v4Edge('e2', 'img_b', 'v_1', 'firstFrame'),
    ])
    // 轮播槽只报当前版，并把版本数带上（快照那行的「共 N 版」）。
    expect(lines).toEqual([
      { slot: 'firstFrame', sourceId: 'img_a', versionCount: 2 },
    ])
  })

  it('一跳外的源不进这个节点的槽行（特写占的是角色卡的槽）', () => {
    const shot = v4Node('v_1', { kind: 'video', subtype: 'shot', shotNo: 1 })
    const lines = collectSlotLines(shot, [
      v4Edge('e1', 'char', 'v_1', 'reference'),
      v4Edge('e2', 'closeup', 'char', 'closeup'),
    ])
    expect(lines).toEqual([
      { slot: 'reference', sourceId: 'char', versionCount: 1 },
    ])
  })

  it('端口表里没有的槽不产生行（写错槽的边被忽略而不是乱入）', () => {
    const merge = v4Node('m', { kind: 'video', subtype: 'merge', shotNo: 1 })
    const lines = collectSlotLines(merge, [
      v4Edge('e1', 'a', 'm', 'clip'),
      v4Edge('e2', 'b', 'm', 'firstFrame'),
    ])
    expect(lines).toEqual([{ slot: 'clip', sourceId: 'a', versionCount: 1 }])
  })
})
