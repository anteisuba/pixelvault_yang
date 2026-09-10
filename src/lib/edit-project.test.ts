import { describe, expect, it } from 'vitest'

import { EDIT_TRACK_IDS, EDIT_TRANSITION_IDS } from '@/constants/edit-desk'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import {
  applyInverseV4,
  applyNodeAssistantOpV4,
  type ApplyOpV4Context,
} from '@/lib/node-assistant-op-apply-v4'
import {
  buildClipFromNode,
  buildTimelineRows,
  clampTrim,
  clipDurationSec,
  clipIndexAt,
  clipStartSec,
  createEmptyEditProject,
  formatEditClock,
  listEditableAssets,
  moveClip,
  projectDurationSec,
  readClipSource,
  splitClipAt,
} from '@/lib/edit-project'
import { migrateRetireVideoMergeV4 } from '@/lib/node-workflow-migrate-v4'
import { EditProjectSchema } from '@/types/node-workflow'
import type {
  EditClip,
  NodeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

const NOW = '2026-09-10T00:00:00.000Z'

function makeContext(): ApplyOpV4Context {
  let counter = 0
  return {
    now: NOW,
    refs: new Map<string, string>(),
    mintId: (prefix) => {
      counter += 1
      return `${prefix}_${counter}`
    },
  }
}

function mintId(prefix: string): string {
  return `${prefix}_x`
}

function videoNode(
  id: string,
  options: {
    readonly url?: string
    readonly durationSec?: number
    readonly versions?: readonly { id: string; url: string }[]
    readonly cur?: number
    readonly subtype?: 'shot' | 'merge'
  } = {},
): NodeV4 {
  const subtype = options.subtype ?? 'shot'
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype,
      name: id,
      label: id,
      status: 'idle',
      createdAt: NOW,
      ...(options.url ? { url: options.url } : {}),
      ...(options.durationSec ? { durationSec: options.durationSec } : {}),
      ...(options.versions
        ? {
            outputs: {
              versions: options.versions.map((version) => ({
                ...version,
                createdAt: NOW,
              })),
              cur: options.cur ?? 0,
            },
          }
        : {}),
    },
  } as NodeV4
}

function clip(patch: Partial<EditClip> = {}): EditClip {
  return {
    id: 'c1',
    sourceNodeId: 'v1',
    in: 0,
    out: 4,
    speed: 1,
    muted: false,
    ...patch,
  }
}

function stateWith(project?: NodeWorkflowStateV4['edit']): NodeWorkflowStateV4 {
  return {
    version: 4,
    nodes: [],
    edges: [],
    ...(project ? { edit: project } : {}),
  }
}

describe('EditProject schema', () => {
  it('缺省值补齐：speed / muted / settings 三项不必写全', () => {
    const parsed = EditProjectSchema.parse({
      name: '成片',
      tracks: {
        video: [{ id: 'c1', sourceNodeId: 'v1', in: 0, out: 3 }],
        audio: [],
        music: [],
      },
      settings: {},
    })
    expect(parsed.tracks.video[0]?.speed).toBe(1)
    expect(parsed.tracks.video[0]?.muted).toBe(false)
    expect(parsed.settings.magnetic).toBe(true)
    expect(parsed.settings.aspect).toBe('16:9')
  })

  it('段里没有 url —— 素材永远从来源节点当场读', () => {
    const parsed = EditProjectSchema.parse({
      name: '成片',
      tracks: {
        video: [
          { id: 'c1', sourceNodeId: 'v1', in: 0, out: 3, url: 'https://x' },
        ],
        audio: [],
        music: [],
      },
      settings: {},
    })
    expect(parsed.tracks.video[0]).not.toHaveProperty('url')
  })
})

describe('时间线算术', () => {
  it('段长按倍速折算，总时长取最长的一条轨', () => {
    expect(clipDurationSec(clip({ in: 1, out: 5, speed: 2 }))).toBe(2)
    const project = createEmptyEditProject('成片')
    const withTracks = {
      ...project,
      tracks: {
        video: [clip({ id: 'a', out: 4 }), clip({ id: 'b', out: 6 })],
        audio: [],
        // 配乐比画面长是常态 —— 读数要按它报
        music: [clip({ id: 'm', out: 30 })],
      },
    }
    expect(projectDurationSec(withTracks)).toBe(30)
  })

  it('播放头落在哪一段 / 段起点', () => {
    const clips = [clip({ id: 'a', out: 4 }), clip({ id: 'b', out: 6 })]
    expect(clipStartSec(clips, 1)).toBe(4)
    expect(clipIndexAt(clips, 0)).toBe(0)
    expect(clipIndexAt(clips, 4)).toBe(1)
    expect(clipIndexAt(clips, 99)).toBe(-1)
  })

  it('时钟读数', () => {
    expect(formatEditClock(21)).toBe('0:21')
    expect(formatEditClock(7.04, true)).toBe('0:07.0')
    expect(formatEditClock(-1)).toBe('0:00')
  })
})

describe('裁剪 / 分割 / 排序', () => {
  it('裁剪不许把段裁成零帧', () => {
    const source = clip({ in: 0, out: 4 })
    // 出点拖到入点以下 → 守卫把出点抬回最短段长
    const trimmed = clampTrim(source, { out: 0 }, 10)
    expect(trimmed.out).toBeGreaterThan(trimmed.in)
  })

  it('裁剪上界是素材自己的长度', () => {
    expect(clampTrim(clip(), { out: 999 }, 8).out).toBe(8)
  })

  it('分割：两段共用来源与版本，转场归后一半', () => {
    const clips = [
      clip({ id: 'a', out: 6, transitionOut: EDIT_TRANSITION_IDS.crossfade }),
    ]
    const next = splitClipAt(clips, 3, mintId)
    expect(next).toHaveLength(2)
    expect(next?.[0]?.out).toBe(3)
    expect(next?.[1]?.in).toBe(3)
    expect(next?.[0]?.transitionOut).toBe(EDIT_TRANSITION_IDS.none)
    expect(next?.[1]?.transitionOut).toBe(EDIT_TRANSITION_IDS.crossfade)
    expect(next?.[1]?.sourceNodeId).toBe('v1')
  })

  it('分割：切点太靠边就不切', () => {
    expect(splitClipAt([clip({ out: 6 })], 0.05, mintId)).toBeNull()
    expect(splitClipAt([clip({ out: 6 })], 99, mintId)).toBeNull()
  })

  it('排序：拖到队尾', () => {
    const clips = [clip({ id: 'a' }), clip({ id: 'b' }), clip({ id: 'c' })]
    expect(moveClip(clips, 'a', 2).map((item) => item.id)).toEqual([
      'b',
      'c',
      'a',
    ])
  })
})

describe('来源与「上游已更新」徽标', () => {
  const node = videoNode('v1', {
    versions: [
      { id: 'ver1', url: 'https://a' },
      { id: 'ver2', url: 'https://b' },
    ],
    cur: 1,
  })

  it('段记的版本 ≠ 节点当前版本 → stale', () => {
    const facts = readClipSource([node], clip({ sourceVersionId: 'ver1' }))
    expect(facts.stale).toBe(true)
    expect(facts.currentVersionId).toBe('ver2')
    expect(facts.url).toBe('https://b')
  })

  it('段记的就是当前版本 → 不 stale', () => {
    expect(
      readClipSource([node], clip({ sourceVersionId: 'ver2' })).stale,
    ).toBe(false)
  })

  it('段没记版本 = 未知，⛔ 不算更新过', () => {
    expect(readClipSource([node], clip()).stale).toBe(false)
  })

  it('来源节点被删 = 孤儿，不是 stale', () => {
    const facts = readClipSource([], clip({ sourceVersionId: 'ver1' }))
    expect(facts.exists).toBe(false)
    expect(facts.stale).toBe(false)
  })
})

describe('建段与素材清单', () => {
  it('有产物的卡才建得出段；空卡返回 null', () => {
    expect(
      buildClipFromNode(videoNode('v1', { url: 'https://a' }), mintId),
    ).not.toBeNull()
    expect(buildClipFromNode(videoNode('v2'), mintId)).toBeNull()
  })

  it('段长取节点时长；量不到时给一个点得中的默认', () => {
    const withDuration = buildClipFromNode(
      videoNode('v1', { url: 'https://a', durationSec: 7 }),
      mintId,
    )
    expect(withDuration?.out).toBe(7)
    const without = buildClipFromNode(
      videoNode('v2', { url: 'https://b' }),
      mintId,
    )
    expect(without?.out).toBeGreaterThan(0)
  })

  it('画布素材只列有产物的视频 / 音频', () => {
    const state: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [
        videoNode('v1', { url: 'https://a' }),
        videoNode('v2'),
        {
          id: 't1',
          position: { x: 0, y: 0 },
          data: {
            kind: 'text',
            subtype: 'script',
            name: 't1',
            status: 'idle',
            createdAt: NOW,
          },
        } as NodeV4,
      ],
      edges: [],
    }
    expect(listEditableAssets(state).map((node) => node.id)).toEqual(['v1'])
  })

  it('渲染行：起点累加、宽度按秒换算、带来源事实', () => {
    const rows = buildTimelineRows(
      [clip({ id: 'a', out: 4 }), clip({ id: 'b', out: 6 })],
      [videoNode('v1', { url: 'https://a' })],
    )
    expect(rows[1]?.startSec).toBe(4)
    expect(rows[1]?.widthPx).toBeGreaterThan(rows[0]?.widthPx ?? 0)
    expect(rows[0]?.source.exists).toBe(true)
  })
})

describe('剪辑台 op（tier / inverse）', () => {
  const ids = NODE_ASSISTANT_OP_V4_IDS

  it('edit_set_timeline 整表替换，inverse 是原表', () => {
    const project = createEmptyEditProject('成片')
    const first = applyNodeAssistantOpV4(
      stateWith(),
      { op: ids.editSetTimeline, project },
      makeContext(),
    )
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.state.edit?.name).toBe('成片')
    // ⚠ 第一次落表之前 `edit` 不存在 —— 撤销必须退回**不存在**而不是一份空表
    const back = applyInverseV4(first.state, first.inverse, makeContext())
    expect(back.edit).toBeUndefined()
  })

  it('单段 op 在没有时间线时失败可见', () => {
    const result = applyNodeAssistantOpV4(
      stateWith(),
      {
        op: ids.editAddClip,
        track: EDIT_TRACK_IDS.video,
        clip: clip(),
      },
      makeContext(),
    )
    expect(result).toMatchObject({ ok: false, reason: 'editMissing' })
  })

  it('edit_add_clip / inverse 删掉刚加的那一段', () => {
    const base = stateWith(createEmptyEditProject('成片'))
    const added = applyNodeAssistantOpV4(
      base,
      { op: ids.editAddClip, track: EDIT_TRACK_IDS.video, clip: clip() },
      makeContext(),
    )
    expect(added.ok).toBe(true)
    if (!added.ok) return
    expect(added.state.edit?.tracks.video).toHaveLength(1)
    expect(added.changedNodeIds).toEqual(['v1'])
    const back = applyInverseV4(added.state, added.inverse, makeContext())
    expect(back.edit?.tracks.video).toHaveLength(0)
  })

  it('edit_remove_clip 的 inverse 把段放回**原位**', () => {
    const project = {
      ...createEmptyEditProject('成片'),
      tracks: {
        video: [clip({ id: 'a' }), clip({ id: 'b' }), clip({ id: 'c' })],
        audio: [],
        music: [],
      },
    }
    const removed = applyNodeAssistantOpV4(
      stateWith(project),
      { op: ids.editRemoveClip, track: EDIT_TRACK_IDS.video, clipId: 'b' },
      makeContext(),
    )
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    const back = applyInverseV4(removed.state, removed.inverse, makeContext())
    expect(back.edit?.tracks.video.map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('edit_update_clip 的 inverse 只回这次动过的那几项', () => {
    const project = {
      ...createEmptyEditProject('成片'),
      tracks: {
        video: [clip({ id: 'a', out: 6, speed: 1, muted: false })],
        audio: [],
        music: [],
      },
    }
    const updated = applyNodeAssistantOpV4(
      stateWith(project),
      {
        op: ids.editUpdateClip,
        track: EDIT_TRACK_IDS.video,
        clipId: 'a',
        patch: { speed: 2 },
      },
      makeContext(),
    )
    expect(updated.ok).toBe(true)
    if (!updated.ok) return
    expect(updated.state.edit?.tracks.video[0]?.speed).toBe(2)
    expect(updated.inverse).toMatchObject({
      kind: 'op',
      op: { patch: { speed: 1 } },
    })
    const back = applyInverseV4(updated.state, updated.inverse, makeContext())
    expect(back.edit?.tracks.video[0]?.speed).toBe(1)
  })

  it('edit_update_clip 的裁剪过守卫：in >= out 落不下去', () => {
    const project = {
      ...createEmptyEditProject('成片'),
      tracks: {
        video: [clip({ id: 'a', in: 0, out: 6 })],
        audio: [],
        music: [],
      },
    }
    const updated = applyNodeAssistantOpV4(
      stateWith(project),
      {
        op: ids.editUpdateClip,
        track: EDIT_TRACK_IDS.video,
        clipId: 'a',
        patch: { in: 9 },
      },
      makeContext(),
    )
    expect(updated.ok).toBe(true)
    if (!updated.ok) return
    const next = updated.state.edit?.tracks.video[0]
    expect(next && next.out - next.in).toBeGreaterThan(0)
  })

  it('edit_move_clip 的 inverse 拖回原下标', () => {
    const project = {
      ...createEmptyEditProject('成片'),
      tracks: {
        video: [clip({ id: 'a' }), clip({ id: 'b' })],
        audio: [],
        music: [],
      },
    }
    const moved = applyNodeAssistantOpV4(
      stateWith(project),
      {
        op: ids.editMoveClip,
        track: EDIT_TRACK_IDS.video,
        clipId: 'a',
        toIndex: 1,
      },
      makeContext(),
    )
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.state.edit?.tracks.video.map((item) => item.id)).toEqual([
      'b',
      'a',
    ])
    const back = applyInverseV4(moved.state, moved.inverse, makeContext())
    expect(back.edit?.tracks.video.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('未知段 / 重复段 id 都是失败可见', () => {
    const project = {
      ...createEmptyEditProject('成片'),
      tracks: { video: [clip({ id: 'a' })], audio: [], music: [] },
    }
    expect(
      applyNodeAssistantOpV4(
        stateWith(project),
        { op: ids.editRemoveClip, track: EDIT_TRACK_IDS.video, clipId: 'zz' },
        makeContext(),
      ),
    ).toMatchObject({ ok: false, reason: 'unknownClip' })
    expect(
      applyNodeAssistantOpV4(
        stateWith(project),
        {
          op: ids.editAddClip,
          track: EDIT_TRACK_IDS.video,
          clip: clip({ id: 'a' }),
        },
        makeContext(),
      ),
    ).toMatchObject({ ok: false, reason: 'duplicateClip' })
  })
})

describe('video.merge 退役（spec §8.6）', () => {
  function mergeState(): NodeWorkflowStateV4 {
    const a = videoNode('a', { url: 'https://a', durationSec: 5 })
    const b = videoNode('b', { url: 'https://b', durationSec: 9 })
    const merge = videoNode('m', {
      url: 'https://merged',
      subtype: 'merge',
    })
    return {
      version: 4,
      nodes: [
        a,
        b,
        {
          ...merge,
          data: {
            ...merge.data,
            mergeSettings: {
              clips: [{ url: 'https://b', startSec: 1, endSec: 4 }],
            },
            slots: {
              clip: {
                slot: 'clip',
                versions: [
                  {
                    id: 'sv1',
                    edgeId: 'e1',
                    sourceNodeId: 'a',
                    blocked: false,
                    addedAt: NOW,
                  },
                  {
                    id: 'sv2',
                    edgeId: 'e2',
                    sourceNodeId: 'b',
                    blocked: false,
                    addedAt: NOW,
                  },
                ],
                cur: null,
              },
            },
          },
        } as NodeV4,
      ],
      edges: [
        {
          id: 'e1',
          source: 'a',
          sourceHandle: 'out',
          target: 'm',
          slot: NODE_SLOT_IDS.clip,
        },
        {
          id: 'e2',
          source: 'b',
          sourceHandle: 'out',
          target: 'm',
          slot: NODE_SLOT_IDS.clip,
        },
      ],
    }
  }

  it('合成节点换成视频卡，产物 url 保留，clip 边断掉', () => {
    let counter = 0
    const result = migrateRetireVideoMergeV4(mergeState(), {
      mintId: (prefix) => `${prefix}_${(counter += 1)}`,
      timelineName: '成片',
    })
    const retired = result.state.nodes.find((node) => node.id === 'm')
    expect(retired?.data.subtype).toBe('shot')
    expect(retired?.data.kind === 'video' ? retired.data.url : undefined).toBe(
      'https://merged',
    )
    expect(result.state.edges).toHaveLength(0)
    expect(result.retired).toBe(1)
  })

  it('mergeSettings 的裁剪按 url 认领落进 V 轨', () => {
    let counter = 0
    const result = migrateRetireVideoMergeV4(mergeState(), {
      mintId: (prefix) => `${prefix}_${(counter += 1)}`,
      timelineName: '成片',
    })
    const video = result.state.edit?.tracks.video ?? []
    expect(video).toHaveLength(2)
    expect(video[0]).toMatchObject({ sourceNodeId: 'a', in: 0, out: 5 })
    // 裁剪认的是 url 不是下标
    expect(video[1]).toMatchObject({ sourceNodeId: 'b', in: 1, out: 4 })
  })

  it('已有时间线时不播种（幂等），但退役照做', () => {
    const base = mergeState()
    const seeded = { ...base, edit: createEmptyEditProject('别动我') }
    const result = migrateRetireVideoMergeV4(seeded, {
      mintId,
      timelineName: '成片',
    })
    expect(result.state.edit?.name).toBe('别动我')
    expect(result.seededClips).toBe(0)
    expect(
      result.state.nodes.find((node) => node.id === 'm')?.data.subtype,
    ).toBe('shot')
  })

  it('没有合成节点时原样返回同一个引用', () => {
    const state = stateWith()
    expect(
      migrateRetireVideoMergeV4(state, { mintId, timelineName: '成片' }).state,
    ).toBe(state)
  })
})
