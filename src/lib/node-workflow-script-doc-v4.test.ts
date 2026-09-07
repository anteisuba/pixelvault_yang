import { describe, expect, it } from 'vitest'

import { NODE_SLOT_IDS } from '@/constants/node-slots'
import type { NodeWorkflowState } from '@/types/node-workflow'
import type { ScriptDoc } from '@/types/script-doc'

import {
  getUpstreamNodes,
  harvestUpstreamShotTextPrompt,
} from './node-workflow-graph'
import { migrateNodeWorkflowStateToV4 } from './node-workflow-migrate-v4'
import { projectScriptDocToGraph } from './node-workflow-script-doc'
import {
  buildShotTextBody,
  projectScriptDocToGraphV4,
} from './node-workflow-script-doc-v4'

const NOW = '2026-09-07T00:00:00.000Z'

/** 每次投影都从 1 起编号 —— 两条路径的 `makeId` 调用序一致就得到同一批 id。 */
function makeCounterIds(): (prefix: string) => string {
  let n = 0
  return (prefix) => {
    n += 1
    return `${prefix}${n}`
  }
}

const doc: ScriptDoc = {
  title: '走廊',
  logline: '',
  roles: [
    { id: 'r1', name: '阿岚', description: '短发，深色风衣' },
    { id: 'r2', name: '老周', description: '' },
  ],
  shots: [
    {
      id: 's1',
      sceneLabel: '走廊·夜',
      summary: '她回头看了一眼空荡的走廊',
      camera: '缓慢推入',
      composition: '中近景',
      durationSeconds: 6,
      roleIds: ['r1'],
      dialogue: [{ id: 'l1', speakerRoleId: 'r1', line: '还有人吗' }],
    },
    {
      id: 's2',
      sceneLabel: '楼梯间',
      summary: '灯灭了',
      roleIds: ['r1', 'r2'],
      dialogue: [],
    },
  ],
} as ScriptDoc

const emptyV3State: NodeWorkflowState = { nodes: [], edges: [] }

function v3ThenUpgrade() {
  const result = projectScriptDocToGraph(doc, emptyV3State, {
    makeId: makeCounterIds(),
    anchor: { x: 0, y: 0 },
  })
  const v3State = {
    nodes: result.nodesToAdd,
    edges: result.edgesToAdd,
    scriptDoc: doc,
  }
  return {
    v3State,
    v4: migrateNodeWorkflowStateToV4(v3State, { now: NOW }).state,
  }
}

/** 比对用的节点身份：id + 种类 + 子型 + 镜号。⛔ 不比 `name` —— 两条路径的显示名
 *  各自从不同的原料算（v3 走 `resolveNodeDisplayName` 读七字段，v4 直接给），
 *  那是显示层的事，不是这条等价要锁的东西。 */
function nodeShape(node: {
  id: string
  data: { kind: string; subtype: string; shotNo?: number }
}) {
  return {
    id: node.id,
    kind: node.data.kind,
    subtype: node.data.subtype,
    shotNo: node.data.shotNo,
  }
}

function edgeShape(edge: { source: string; target: string; slot: string }) {
  return { source: edge.source, target: edge.target, slot: edge.slot }
}

function sortEdges(edges: ReturnType<typeof edgeShape>[]) {
  return [...edges].sort((a, b) =>
    `${a.source}>${a.target}:${a.slot}`.localeCompare(
      `${b.source}>${b.target}:${b.slot}`,
    ),
  )
}

describe('projectScriptDocToGraphV4 · v3 → v4 投影等价', () => {
  const { v3State, v4: upgraded } = v3ThenUpgrade()
  const projected = projectScriptDocToGraphV4(doc, {
    makeId: makeCounterIds(),
    now: NOW,
  })

  it('节点集合一致（id / kind / subtype）', () => {
    const strip = (node: ReturnType<typeof nodeShape>) => ({
      id: node.id,
      kind: node.kind,
      subtype: node.subtype,
    })
    expect(projected.nodes.map(nodeShape).map(strip)).toEqual(
      upgraded.nodes.map(nodeShape).map(strip),
    )
  })

  it('镜号一致 —— 台词的音色节点也归到它所属的镜（C3c-① A 缺口②已补）', () => {
    // ⚠ 音色节点的 `scriptRef.sourceId` 是**台词 id** 不是镜头 id。迁移的镜号索引
    // 因此把台词也收进去（`buildShotNoIndex`），否则整张图的音色节点全部无镜号、
    // 掉进散节点自由区 —— 用户看到的是「音色全掉出镜头了」。
    const shotNoOf = (
      nodes: readonly { data: { kind: string; shotNo?: number } }[],
    ) =>
      nodes
        .filter((node) => node.data.kind === 'audio')
        .map((node) => node.data.shotNo)
    expect(shotNoOf(upgraded.nodes)).toEqual([1])
    expect(shotNoOf(projected.nodes)).toEqual([1])

    // 其余节点的镜号两侧同样一致。
    const nonAudio = (
      nodes: readonly { data: { kind: string; shotNo?: number } }[],
    ) =>
      nodes
        .filter((node) => node.data.kind !== 'audio')
        .map((node) => node.data.shotNo)
    expect(nonAudio(projected.nodes)).toEqual(nonAudio(upgraded.nodes))
  })

  it('边槽一致（谁经哪个槽连到谁）', () => {
    expect(sortEdges(projected.edges.map(edgeShape))).toEqual(
      sortEdges(upgraded.edges.map(edgeShape)),
    )
    // 槽不是「都落 reference」的糊：文本 / 参考 / 语音 / 片段四种都出现了。
    expect(new Set(projected.edges.map((edge) => edge.slot))).toEqual(
      new Set([
        NODE_SLOT_IDS.text,
        NODE_SLOT_IDS.reference,
        NODE_SLOT_IDS.voice,
        NODE_SLOT_IDS.clip,
      ]),
    )
  })

  it('文本内容一致 —— 以「真正送进模型的那一段」为准', () => {
    // 比的是**同一份文字**：v3 那条路上 `harvestUpstreamShotTextPrompt` 前置进
    // 提示词的那一段。C3c-① A 缺口①补完之后，迁移产物的 `body` 与它逐字相同
    // （三处共用 `composeShotTextBody`）。
    const v3Text = v3State.nodes
      .filter((node) => node.type === 'seedance')
      .map((node) =>
        harvestUpstreamShotTextPrompt(
          getUpstreamNodes(node.id, v3State.edges, v3State.nodes),
        ),
      )
    const v4Text = projected.nodes
      .filter(
        (node) => node.data.kind === 'video' && node.data.subtype === 'shot',
      )
      .map((shot) =>
        projected.edges
          .filter(
            (edge) =>
              edge.target === shot.id && edge.slot === NODE_SLOT_IDS.text,
          )
          .map((edge) => {
            const source = projected.nodes.find(
              (node) => node.id === edge.source,
            )
            return source?.data.kind === 'text' ? source.data.body : ''
          })
          .join('\n\n'),
      )

    expect(v4Text).toEqual(v3Text)
    expect(v4Text).toEqual([
      '走廊·夜\n她回头看了一眼空荡的走廊\n缓慢推入\n中近景',
      '楼梯间\n灯灭了',
    ])
    // 迁移那一侧的 body 现在与投影逐字相同 —— 缺口①的回归闸门。
    expect(
      upgraded.nodes
        .filter((node) => node.data.kind === 'text')
        .map((node) => (node.data.kind === 'text' ? node.data.body : '')),
    ).toEqual(v3Text)
  })

  it('位置允许不同（v4 走镜头带版式，v3 走 anchor 偏移）', () => {
    expect(projected.nodes.every((node) => node.position !== undefined)).toBe(
      true,
    )
  })
})

describe('projectScriptDocToGraphV4 · v4 自有形状', () => {
  const projected = projectScriptDocToGraphV4(doc, {
    makeId: makeCounterIds(),
    now: NOW,
  })

  it('每个镜头一个 video.shot，label 稳定、shotNo 只作显示序号', () => {
    const shots = projected.nodes.filter(
      (node) => node.data.kind === 'video' && node.data.subtype === 'shot',
    )
    expect(shots.map((node) => node.data.shotNo)).toEqual([1, 2])
    expect(
      shots.map((node) =>
        node.data.kind === 'video' ? node.data.label : undefined,
      ),
    ).toEqual(['走廊·夜', '楼梯间'])
  })

  it('剧本文本连进镜头的 text 槽，角色是 script', () => {
    const scriptNodes = projected.nodes.filter(
      (node) => node.data.kind === 'text',
    )
    expect(
      scriptNodes.map((node) =>
        node.data.kind === 'text' ? node.data.defaultRole : undefined,
      ),
    ).toEqual(['script', 'script'])
    const textEdges = projected.edges.filter(
      (edge) => edge.slot === NODE_SLOT_IDS.text,
    )
    expect(textEdges).toHaveLength(2)
  })

  it('角色卡不带 shotNo（跨镜复用），连到用到它的每一个镜头', () => {
    const characters = projected.nodes.filter(
      (node) => node.data.kind === 'image' && node.data.subtype === 'character',
    )
    expect(characters.map((node) => node.data.shotNo)).toEqual([
      undefined,
      undefined,
    ])
    const alan = characters[0]!
    const shotIds = projected.nodes
      .filter(
        (node) => node.data.kind === 'video' && node.data.subtype === 'shot',
      )
      .map((node) => node.id)
    // 阿岚在两镜都出场 → 两条边都在（另外还有两条进静帧的参考边）。
    expect(
      projected.edges.filter(
        (edge) => edge.source === alan.id && shotIds.includes(edge.target),
      ),
    ).toHaveLength(2)
    // 老周只在第二镜。
    const zhou = characters[1]!
    expect(
      projected.edges.filter(
        (edge) => edge.source === zhou.id && shotIds.includes(edge.target),
      ),
    ).toHaveLength(1)
  })

  it('styleNote → 一个 text.rule（defaultRole=style）连到每一个镜头', () => {
    // ⚠ v3 投影没有这个落点，所以等价夹具的 doc 不带 styleNote —— 它是 v4 才
    // 有的新节点，单独锁在这里。
    const withStyle = projectScriptDocToGraphV4(
      { ...doc, styleNote: '胶片颗粒，低饱和' },
      { makeId: makeCounterIds(), now: NOW },
    )
    const rules = withStyle.nodes.filter(
      (node) => node.data.kind === 'text' && node.data.subtype === 'rule',
    )
    expect(rules).toHaveLength(1)
    const rule = rules[0]!
    expect(rule.data.kind === 'text' && rule.data.defaultRole).toBe('style')
    expect(rule.data.kind === 'text' && rule.data.body).toBe('胶片颗粒，低饱和')
    expect(
      withStyle.edges.filter(
        (edge) => edge.source === rule.id && edge.slot === NODE_SLOT_IDS.text,
      ),
    ).toHaveLength(2)
    // 前面的 id 一个都不挪 —— 它只在尾部多出来。
    const bare = projectScriptDocToGraphV4(doc, {
      makeId: makeCounterIds(),
      now: NOW,
    })
    expect(
      withStyle.nodes.slice(0, bare.nodes.length).map((n) => n.id),
    ).toEqual(bare.nodes.map((n) => n.id))
  })

  it('shotStills=false 时不投静帧，也就没有静帧那两条参考边', () => {
    const noStills = projectScriptDocToGraphV4(doc, {
      makeId: makeCounterIds(),
      now: NOW,
      shotStills: false,
    })
    expect(
      noStills.nodes.filter(
        (node) => node.data.kind === 'image' && node.data.subtype === 'shot',
      ),
    ).toHaveLength(0)
  })

  it('每条边都带槽，且 binding 已经从边表重算好', () => {
    expect(projected.edges.every((edge) => Boolean(edge.slot))).toBe(true)
    const shot = projected.nodes.find(
      (node) => node.data.kind === 'video' && node.data.subtype === 'shot',
    )!
    expect(shot.data.slots?.[NODE_SLOT_IDS.text]?.versions).toHaveLength(1)
    expect(shot.data.slots?.[NODE_SLOT_IDS.text]?.cur).toBeTruthy()
  })

  it('空 doc 不产出成片节点（一镜也没有 → 没有可接的片段）', () => {
    const empty = projectScriptDocToGraphV4(
      { ...doc, roles: [], shots: [] },
      { makeId: makeCounterIds(), now: NOW },
    )
    expect(empty.nodes).toEqual([])
    expect(empty.edges).toEqual([])
  })
})

describe('buildShotTextBody', () => {
  it('四栏按 scene → action → camera → composition 拼，空段跳过', () => {
    expect(
      buildShotTextBody({
        id: 's',
        summary: '她回头',
        sceneLabel: '走廊',
        roleIds: [],
        dialogue: [],
      } as unknown as ScriptDoc['shots'][number]),
    ).toBe('走廊\n她回头')
  })
})
