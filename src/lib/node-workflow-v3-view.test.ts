import { describe, expect, it } from 'vitest'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import {
  migrateNodeWorkflowStateToV4,
  type V3State,
} from '@/lib/node-workflow-migrate-v4'
import { reconcileStateSlots } from '@/lib/node-slot-binding'
import {
  projectV4ToV3View,
  writeV3ViewBackToV4,
} from '@/lib/node-workflow-v3-view'
import type { NodeWorkflowState } from '@/types/node-workflow'

const NOW = '2026-09-08T00:00:00.000Z'

function node(id: string, type: string, data: Record<string, unknown> = {}) {
  return {
    id,
    type,
    position: { x: 1, y: 2 },
    data: { prompt: '', status: NODE_STATUS_IDS.idle, ...data },
  } as never
}

function fixture(): V3State {
  return {
    scriptDoc: { shots: [{ id: 'shot_a' }] },
    nodes: [
      node('n_text', NODE_TYPE_IDS.shotText, {
        scene: '控制室广角',
        scriptRef: { kind: 'shotText', sourceId: 'shot_a' },
      }),
      node('n_char', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '西格莉卡',
        mediaUrl: 'https://x/1.png',
      }),
      node('n_bg', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.background,
        backgroundName: '夜晚街道',
      }),
      node('n_voice', NODE_TYPE_IDS.voice, {
        voiceClipUrl: 'https://x/a.mp3',
        audioOwnerName: '西格莉卡',
      }),
      node('n_video', NODE_TYPE_IDS.seedance, {
        scriptRef: { kind: 'seedance', sourceId: 'shot_a' },
        prompt: '她转身',
        duration: '7',
        aspectRatio: '16:9',
      }),
      node('n_clip', NODE_TYPE_IDS.videoReference),
    ],
    edges: [
      { id: 'e_text', source: 'n_text', target: 'n_video' },
      { id: 'e_voice', source: 'n_voice', target: 'n_video' },
      { id: 'e_char', source: 'n_char', target: 'n_video' },
      { id: 'e_clip', source: 'n_clip', target: 'n_video' },
    ],
  }
}

function v4Of() {
  return migrateNodeWorkflowStateToV4(fixture(), { now: NOW }).state
}

describe('projectV4ToV3View', () => {
  it('可渲染字段与原 v3 对得上：节点数、类型/role、连线、提示词、媒体', () => {
    const v4 = v4Of()
    const view = projectV4ToV3View(
      v4,
      fixture() as unknown as NodeWorkflowState,
    )

    expect(view.nodes).toHaveLength(6)
    expect(view.edges.map((edge) => edge.id)).toEqual([
      'e_text',
      'e_voice',
      'e_char',
      'e_clip',
    ])
    const byId = new Map(view.nodes.map((n) => [n.id, n]))
    expect(byId.get('n_char')?.type).toBe(NODE_TYPE_IDS.image)
    expect(byId.get('n_char')?.data.role).toBe(NODE_IMAGE_ROLE_IDS.character)
    expect(byId.get('n_char')?.data.characterName).toBe('西格莉卡')
    expect(byId.get('n_char')?.data.mediaUrl).toBe('https://x/1.png')
    expect(byId.get('n_bg')?.data.backgroundName).toBe('夜晚街道')
    expect(byId.get('n_voice')?.type).toBe(NODE_TYPE_IDS.voice)
    expect(byId.get('n_voice')?.data.voiceClipUrl).toBe('https://x/a.mp3')
    expect(byId.get('n_video')?.type).toBe(NODE_TYPE_IDS.seedance)
    expect(byId.get('n_video')?.data.prompt).toBe('她转身')
    expect(byId.get('n_video')?.data.duration).toBe('7')
    expect(byId.get('n_text')?.data.scene).toBe('控制室广角')
    // 位置原样。
    expect(byId.get('n_text')?.position).toEqual({ x: 1, y: 2 })
  })

  it('v4 没有落点的 v3 字段从上一份视图带过来（scriptRef 不丢，剧本投影不重复建点）', () => {
    const view = projectV4ToV3View(
      v4Of(),
      fixture() as unknown as NodeWorkflowState,
    )
    const text = view.nodes.find((n) => n.id === 'n_text')
    expect(text?.data.scriptRef).toEqual({
      kind: 'shotText',
      sourceId: 'shot_a',
    })
  })
})

describe('writeV3ViewBackToV4', () => {
  // ⚠ 比的是**对齐过槽绑定**的那一份，不是 `v4Of()` 原件（C3c-③d-2 · 真机 ①）：
  // 写回时会顺手把边对应的 `data.slots` 补齐，否则「连了线但槽卡是空的」。
  it('原样折回：投影再写回 = 原 v4（v4 独有字段一个不丢，槽绑定按边对齐）', () => {
    const v4 = v4Of()
    const view = projectV4ToV3View(
      v4,
      fixture() as unknown as NodeWorkflowState,
    )
    expect(writeV3ViewBackToV4(view, v4, { now: NOW })).toEqual(
      reconcileStateSlots(v4, { now: NOW }),
    )
  })

  it('往返稳定：再投影一次仍然是同一份视图', () => {
    const v4 = v4Of()
    const first = projectV4ToV3View(
      v4,
      fixture() as unknown as NodeWorkflowState,
    )
    const back = writeV3ViewBackToV4(first, v4, { now: NOW })
    expect(projectV4ToV3View(back, first)).toEqual(first)
  })

  it('改一个字段只动那一个字段，稳定名 / 镜号 / createdAt / 槽绑定不被重算', () => {
    const v4 = v4Of()
    const view = projectV4ToV3View(
      v4,
      fixture() as unknown as NodeWorkflowState,
    )
    const edited: NodeWorkflowState = {
      ...view,
      nodes: view.nodes.map((n) =>
        n.id === 'n_video'
          ? { ...n, data: { ...n.data, prompt: '她停住' } }
          : n,
      ),
    }
    const next = writeV3ViewBackToV4(edited, v4, { now: NOW })
    const before = reconcileStateSlots(v4, { now: NOW }).nodes.find(
      (n) => n.id === 'n_video',
    )
    const after = next.nodes.find((n) => n.id === 'n_video')
    expect(after).toEqual({
      ...before,
      data: { ...before?.data, prompt: '她停住' },
    })
    expect(next.edges).toEqual(v4.edges)
  })

  // ─── C3c-③d-2 · 真机 ①：连线建成了边，但目标节点的槽绑定没写 ──────────────
  //
  // v3 引擎只认「边」，v4 的槽卡认的是目标节点 `data.slots`。写回口只落边不落
  // 绑定 = 用户拖完线看到的是「连了等于没连」。
  it('新连的一条边，目标节点的槽绑定同步落上（不是只有边）', () => {
    const v4 = v4Of()
    const view = projectV4ToV3View(
      v4,
      fixture() as unknown as NodeWorkflowState,
    )
    const edited: NodeWorkflowState = {
      ...view,
      edges: [
        ...view.edges,
        {
          id: 'e_bg_new',
          source: 'n_bg',
          target: 'n_video',
        } as (typeof view.edges)[number],
      ],
    }

    const next = writeV3ViewBackToV4(edited, v4, { now: NOW })
    const video = next.nodes.find((n) => n.id === 'n_video')
    const reference = video?.data.slots?.[NODE_SLOT_IDS.reference]
    expect(
      reference?.versions.map((version) => version.sourceNodeId),
    ).toContain('n_bg')
    // 新连的那一版成为当前版 —— 用户刚拖的线要在槽里看得见。
    expect(
      reference?.versions.find((version) => version.id === reference.cur)
        ?.sourceNodeId,
    ).toBe('n_bg')
  })

  it('拆掉一条边，槽绑定里对应的那一版跟着消失', () => {
    const v4 = reconcileStateSlots(v4Of(), { now: NOW })
    const view = projectV4ToV3View(
      v4,
      fixture() as unknown as NodeWorkflowState,
    )
    const edited: NodeWorkflowState = {
      ...view,
      edges: view.edges.filter((edge) => edge.id !== 'e_char'),
    }

    const next = writeV3ViewBackToV4(edited, v4, { now: NOW })
    const reference = next.nodes.find((n) => n.id === 'n_video')?.data.slots?.[
      NODE_SLOT_IDS.reference
    ]
    expect(reference?.versions.map((version) => version.edgeId)).not.toContain(
      'e_char',
    )
  })

  it('新增的 v3 节点现造一份 v4；删掉的节点连它的边一起走', () => {
    const v4 = v4Of()
    const view = projectV4ToV3View(
      v4,
      fixture() as unknown as NodeWorkflowState,
    )
    const edited: NodeWorkflowState = {
      ...view,
      nodes: [
        ...view.nodes.filter((n) => n.id !== 'n_clip'),
        {
          id: 'n_new',
          type: NODE_TYPE_IDS.image,
          position: { x: 9, y: 9 },
          data: { prompt: '', status: NODE_STATUS_IDS.idle },
        } as (typeof view.nodes)[number],
      ],
      edges: [
        ...view.edges.filter((e) => e.id !== 'e_clip'),
        { id: 'e_new', source: 'n_new', target: 'n_video' },
      ],
    }
    const next = writeV3ViewBackToV4(edited, v4, { now: NOW })
    expect(next.nodes.map((n) => n.id)).not.toContain('n_clip')
    expect(next.nodes.map((n) => n.id)).toContain('n_new')
    expect(next.edges.map((e) => e.id)).not.toContain('e_clip')
    expect(next.edges.find((e) => e.id === 'e_new')?.slot).toBe(
      NODE_SLOT_IDS.reference,
    )
  })
})
