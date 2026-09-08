import { describe, expect, it } from 'vitest'

import { NODE_SLOT_IDS, NODE_SLOT_OUTPUT_IDS } from '@/constants/node-slots'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'

import {
  V4_SLOT_ISSUE_IDS,
  buildV4AudioPayload,
  buildV4ImagePayload,
  buildV4MergeClipUrls,
  buildV4VideoPayload,
  composeSlotPrompt,
  readSlotSources,
  readTextSegments,
  validateV4Slots,
} from './node-slot-payload'

const NOW = '2026-09-07T00:00:00.000Z'

function node(
  id: string,
  data: Partial<NodeV4Data> & { kind: NodeV4Data['kind'] },
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      name: id,
      status: 'idle',
      createdAt: NOW,
      ...data,
    } as NodeV4Data,
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  slot: NodeWorkflowEdgeV4['slot'],
): NodeWorkflowEdgeV4 {
  return {
    id,
    source,
    sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
    target,
    slot,
  }
}

/* ── 夹具：一个镜头 + 首帧 / 尾帧 / 角色卡（带特写 + 绑定音色）/ 参考视频 /
 *        直挂音色 / 三档文本 ─────────────────────────────────────────── */
const first = node('first', {
  kind: 'image',
  subtype: 'shot',
  url: 'https://cdn/first.png',
})
const last = node('last', {
  kind: 'image',
  subtype: 'shot',
  url: 'https://cdn/last.png',
})
const character = node('char', {
  kind: 'image',
  subtype: 'character',
  name: '阿岚',
  url: 'https://cdn/char.png',
})
const closeup = node('cu', {
  kind: 'image',
  subtype: 'reference',
  url: 'https://cdn/cu.png',
})
const boundVoice = node('vb', {
  kind: 'audio',
  subtype: 'voice',
  url: 'https://cdn/vb.mp3',
})
const directVoice = node('vd', {
  kind: 'audio',
  subtype: 'voice',
  url: 'https://cdn/vd.mp3',
  ownerName: '旁白甲',
})
const refClip = node('clip', {
  kind: 'video',
  subtype: 'clip',
  url: 'https://cdn/ref.mp4',
})
const script = node('t-script', {
  kind: 'text',
  subtype: 'shotNote',
  body: '她回头',
  defaultRole: 'script',
})
const style = node('t-style', {
  kind: 'text',
  subtype: 'rule',
  body: '胶片颗粒',
  defaultRole: 'style',
})
const characterText = node('t-char', {
  kind: 'text',
  subtype: 'shotNote',
  body: '阿岚：短发',
  defaultRole: 'character',
})
const shot = node('shot', {
  kind: 'video',
  subtype: 'shot',
  label: '走廊',
  shotNo: 1,
})

const nodes = [
  first,
  last,
  character,
  closeup,
  boundVoice,
  directVoice,
  refClip,
  script,
  style,
  characterText,
  shot,
]
const edges = [
  edge('e1', 'first', 'shot', NODE_SLOT_IDS.firstFrame),
  edge('e2', 'last', 'shot', NODE_SLOT_IDS.lastFrame),
  edge('e3', 'char', 'shot', NODE_SLOT_IDS.reference),
  edge('e4', 'clip', 'shot', NODE_SLOT_IDS.reference),
  edge('e5', 'vd', 'shot', NODE_SLOT_IDS.voice),
  edge('e6', 't-script', 'shot', NODE_SLOT_IDS.text),
  edge('e7', 't-style', 'shot', NODE_SLOT_IDS.text),
  edge('e8', 't-char', 'shot', NODE_SLOT_IDS.text),
  edge('e9', 'cu', 'char', NODE_SLOT_IDS.closeup),
  edge('e10', 'vb', 'char', NODE_SLOT_IDS.voice),
]

describe('buildV4VideoPayload · 每个槽落在自己的位置', () => {
  const payload = buildV4VideoPayload({
    nodeId: 'shot',
    nodes,
    edges,
    ownPrompt: '镜头缓推',
  })

  it('首帧 / 尾帧各取各的槽 —— ⛔ 不再按 images[0]/[1] 取', () => {
    expect(payload.firstFrameUrl).toBe('https://cdn/first.png')
    expect(payload.lastFrameUrl).toBe('https://cdn/last.png')
  })

  it('image_urls：关键帧段是真前缀，参考图与一跳特写跟在后面', () => {
    expect(payload.keyframeUrls).toEqual([
      'https://cdn/first.png',
      'https://cdn/last.png',
    ])
    expect(payload.imageUrls).toEqual([
      'https://cdn/first.png',
      'https://cdn/last.png',
      'https://cdn/char.png',
      'https://cdn/cu.png',
    ])
    expect(payload.imageUrls.slice(0, 2)).toEqual(payload.keyframeUrls)
  })

  it('参考视频进 video_urls，不混进 image_urls（同槽按 kind 分流）', () => {
    expect(payload.videoUrls).toEqual(['https://cdn/ref.mp4'])
    expect(payload.imageUrls).not.toContain('https://cdn/ref.mp4')
  })

  it('语音：角色卡绑的那条先占位并带角色名，直挂的用自己的 ownerName', () => {
    expect(payload.audioBindings).toEqual([
      { url: 'https://cdn/vb.mp3', nodeId: 'vb', characterName: '阿岚' },
      { url: 'https://cdn/vd.mp3', nodeId: 'vd', characterName: '旁白甲' },
    ])
  })

  it('文本三档各归各段，约束排在正文之后', () => {
    expect(payload.text).toEqual({
      script: '她回头',
      style: ['胶片颗粒'],
      character: ['阿岚：短发'],
    })
    expect(payload.prompt).toBe('她回头\n\n镜头缓推\n\n阿岚：短发\n\n胶片颗粒')
  })
})

describe('readSlotSources · binding 优先、边表兜底', () => {
  it('轮播槽只出 cur 那一版，其余版本是历史', () => {
    const withBinding: NodeV4 = {
      ...shot,
      data: {
        ...shot.data,
        slots: {
          [NODE_SLOT_IDS.firstFrame]: {
            slot: NODE_SLOT_IDS.firstFrame,
            cur: 'v2',
            versions: [
              {
                id: 'v1',
                edgeId: 'e1',
                sourceNodeId: 'first',
                blocked: false,
                addedAt: NOW,
              },
              {
                id: 'v2',
                edgeId: 'e2',
                sourceNodeId: 'last',
                blocked: false,
                addedAt: NOW,
              },
            ],
          },
        },
      } as NodeV4Data,
    }
    expect(
      readSlotSources(withBinding, NODE_SLOT_IDS.firstFrame, edges, nodes).map(
        (source) => source.node.id,
      ),
    ).toEqual(['last'])
  })

  it('cur 为空 = 空槽，⛔ 不静默拿第一版顶上', () => {
    const emptyCur: NodeV4 = {
      ...shot,
      data: {
        ...shot.data,
        slots: {
          [NODE_SLOT_IDS.firstFrame]: {
            slot: NODE_SLOT_IDS.firstFrame,
            cur: null,
            versions: [
              {
                id: 'v1',
                edgeId: 'e1',
                sourceNodeId: 'first',
                blocked: false,
                addedAt: NOW,
              },
            ],
          },
        },
      } as NodeV4Data,
    }
    expect(
      readSlotSources(emptyCur, NODE_SLOT_IDS.firstFrame, edges, nodes),
    ).toEqual([])
  })

  it('已判失败的素材永不入列', () => {
    const blocked = node('bad', {
      kind: 'image',
      subtype: 'shot',
      url: 'https://cdn/bad.png',
      blocked: true,
    })
    const payload = buildV4VideoPayload({
      nodeId: 'shot',
      nodes: [...nodes, blocked],
      edges: [...edges, edge('e11', 'bad', 'shot', NODE_SLOT_IDS.reference)],
    })
    expect(payload.imageUrls).not.toContain('https://cdn/bad.png')
  })
})

describe('readTextSegments · 角色是边的属性', () => {
  it('同一份文本连进两个镜头可以是两种角色', () => {
    const shotB = node('shotB', { kind: 'video', subtype: 'shot', label: 'B' })
    const twoShots = [script, shot, shotB]
    const twoEdges = [
      edge('a', 't-script', 'shot', NODE_SLOT_IDS.text),
      {
        ...edge('b', 't-script', 'shotB', NODE_SLOT_IDS.text),
      },
    ]
    // A 镜：源节点的 defaultRole=script → 正文。
    expect(readTextSegments(shot, twoEdges, twoShots).script).toBe('她回头')
    // B 镜：binding 上显式落了 style → 约束段（binding 优先于 defaultRole）。
    const shotBWithRole: NodeV4 = {
      ...shotB,
      data: {
        ...shotB.data,
        slots: {
          [NODE_SLOT_IDS.text]: {
            slot: NODE_SLOT_IDS.text,
            cur: 'vb1',
            versions: [
              {
                id: 'vb1',
                edgeId: 'b',
                sourceNodeId: 't-script',
                role: 'style',
                blocked: false,
                addedAt: NOW,
              },
            ],
          },
        },
      } as NodeV4Data,
    }
    expect(readTextSegments(shotBWithRole, twoEdges, twoShots)).toEqual({
      style: ['她回头'],
      character: [],
    })
  })
})

describe('composeSlotPrompt', () => {
  // ⚠ 「与 v3 的 `mergePromptWithUpstreamText` 逐字相同」那条随 ③e 删了：v3 收割层
  // 整块不在了，对照物没了就没有「逐字相同」可言。这条纪律现在由下面两条正面钉：
  // **上游在前、自有在后、空的那一边整段跳过**。
  it('上游剧本在前、自有提示词在后', () => {
    expect(composeSlotPrompt({ ownPrompt: '自有', script: '上游' })).toBe(
      '上游\n\n自有',
    )
    expect(composeSlotPrompt({ ownPrompt: '', script: '上游' })).toBe('上游')
    expect(composeSlotPrompt({ ownPrompt: '自有', script: '' })).toBe('自有')
    expect(composeSlotPrompt({ ownPrompt: '', script: '' })).toBe('')
  })

  it('空段一律跳过，不留空行', () => {
    expect(
      composeSlotPrompt({ script: 'A', style: ['', '  '], character: [] }),
    ).toBe('A')
  })
})

describe('buildV4ImagePayload / buildV4AudioPayload / buildV4MergeClipUrls', () => {
  it('图：参考槽的图 + 角色卡的一跳特写', () => {
    const still = node('still', { kind: 'image', subtype: 'shot' })
    const payload = buildV4ImagePayload({
      nodeId: 'still',
      nodes: [...nodes, still],
      edges: [
        ...edges,
        edge('e11', 'char', 'still', NODE_SLOT_IDS.reference),
        edge('e12', 't-script', 'still', NODE_SLOT_IDS.text),
      ],
      ownPrompt: '走廊全景',
    })
    expect(payload.referenceUrls).toEqual([
      'https://cdn/char.png',
      'https://cdn/cu.png',
    ])
    expect(payload.prompt).toBe('她回头\n\n走廊全景')
  })

  it('音：台词走 text 槽，音色供体走 timbre 槽', () => {
    const voiceNode = node('v-out', { kind: 'audio', subtype: 'voice' })
    const timbre = node('timbre', {
      kind: 'audio',
      subtype: 'voice',
      url: 'https://cdn/timbre.mp3',
    })
    const payload = buildV4AudioPayload({
      nodeId: 'v-out',
      nodes: [voiceNode, timbre, script],
      edges: [
        edge('a', 't-script', 'v-out', NODE_SLOT_IDS.text),
        edge('b', 'timbre', 'v-out', NODE_SLOT_IDS.timbre),
      ],
    })
    expect(payload.timbreUrl).toBe('https://cdn/timbre.mp3')
    expect(payload.prompt).toBe('她回头')
  })

  it('合并：clip 槽按顺序出 URL', () => {
    const a = node('a', {
      kind: 'video',
      subtype: 'shot',
      label: 'A',
      url: 'https://cdn/a.mp4',
    })
    const b = node('b', {
      kind: 'video',
      subtype: 'shot',
      label: 'B',
      url: 'https://cdn/b.mp4',
    })
    const merge = node('m', { kind: 'video', subtype: 'merge' })
    expect(
      buildV4MergeClipUrls({
        nodeId: 'm',
        nodes: [a, b, merge],
        edges: [
          edge('e1', 'a', 'm', NODE_SLOT_IDS.clip),
          edge('e2', 'b', 'm', NODE_SLOT_IDS.clip),
        ],
      }),
    ).toEqual(['https://cdn/a.mp4', 'https://cdn/b.mp4'])
  })
})

describe('validateV4Slots · 缺槽的说法', () => {
  it('合并节点少于 2 条片段 → belowMin，走 C3c-① 新增的专属键', () => {
    const a = node('a', {
      kind: 'video',
      subtype: 'shot',
      label: 'A',
      url: 'https://cdn/a.mp4',
    })
    const merge = node('m', { kind: 'video', subtype: 'merge' })
    const issues = validateV4Slots(
      merge,
      [edge('e1', 'a', 'm', NODE_SLOT_IDS.clip)],
      [a, merge],
    )
    expect(issues).toEqual([
      {
        slot: NODE_SLOT_IDS.clip,
        issue: V4_SLOT_ISSUE_IDS.belowMin,
        i18nKey: 'StudioNode.v4.slotIssue.belowMin',
      },
    ])
  })

  it('已判失败的素材挂在槽上 → blockedSource，走现有键', () => {
    const bad = node('bad', {
      kind: 'image',
      subtype: 'shot',
      url: 'https://cdn/bad.png',
      blocked: true,
    })
    const issues = validateV4Slots(
      shot,
      [edge('e1', 'bad', 'shot', NODE_SLOT_IDS.firstFrame)],
      [bad, shot],
    )
    expect(issues).toEqual([
      {
        slot: NODE_SLOT_IDS.firstFrame,
        issue: V4_SLOT_ISSUE_IDS.blockedSource,
        i18nKey: 'StudioNode.v4.connectRejected.blockedSource',
      },
    ])
  })

  it('轮播槽有版本但 cur 为空 → currentMissing，走现有键', () => {
    const withEmptyCur: NodeV4 = {
      ...shot,
      data: {
        ...shot.data,
        slots: {
          [NODE_SLOT_IDS.firstFrame]: {
            slot: NODE_SLOT_IDS.firstFrame,
            cur: null,
            versions: [
              {
                id: 'v1',
                edgeId: 'e1',
                sourceNodeId: 'first',
                blocked: false,
                addedAt: NOW,
              },
            ],
          },
        },
      } as NodeV4Data,
    }
    expect(validateV4Slots(withEmptyCur, [], nodes)).toEqual([
      {
        slot: NODE_SLOT_IDS.firstFrame,
        issue: V4_SLOT_ISSUE_IDS.currentMissing,
        i18nKey: 'StudioNode.v4.connectRejected.blockedVersion',
      },
    ])
  })

  it('填满的镜头没有任何问题', () => {
    expect(validateV4Slots(shot, edges, nodes)).toEqual([])
  })
})
