import { describe, expect, it } from 'vitest'

import {
  EDIT_EXPORT_RANGE_IDS,
  EDIT_TRACK_IDS,
  EDIT_TRANSITION_IDS,
} from '@/constants/edit-desk'
import {
  RENDER_CROSSFADE_SEC,
  RENDER_OUTPUT_FPS,
  RENDER_PLAN_ERROR_CODES,
  RENDER_PLAN_VERSION,
} from '@/constants/render-video'
import {
  RenderPlanError,
  renderOutputDimensions,
  resolveRenderWindow,
  toRenderPlan,
} from '@/lib/edit-project'
import type { EditClip, EditProject, NodeV4 } from '@/types/node-workflow'

const NOW = '2026-09-10T00:00:00.000Z'

function mediaNode(
  id: string,
  kind: 'video' | 'audio',
  url: string | undefined,
  durationSec = 10,
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind,
      subtype: kind === 'video' ? 'shot' : 'voice',
      name: id,
      label: id,
      status: 'idle',
      createdAt: NOW,
      durationSec,
      ...(url ? { url } : {}),
    },
  } as NodeV4
}

function clip(patch: Partial<EditClip> & { id: string }): EditClip {
  return {
    sourceNodeId: 'v1',
    in: 0,
    out: 4,
    speed: 1,
    muted: false,
    ...patch,
  }
}

function project(patch: Partial<EditProject> = {}): EditProject {
  return {
    name: '成片',
    tracks: { video: [], audio: [], music: [] },
    settings: { aspect: '16:9', resolution: '1080p', magnetic: true },
    ...patch,
  } as EditProject
}

/** 三段各 4s：0–4 / 4–8 / 8–12。 */
function threeClipProject(): EditProject {
  return project({
    tracks: {
      video: [
        clip({ id: 'c1', sourceNodeId: 'v1' }),
        clip({ id: 'c2', sourceNodeId: 'v2' }),
        clip({ id: 'c3', sourceNodeId: 'v3' }),
      ],
      audio: [],
      music: [],
    },
  })
}

const NODES: readonly NodeV4[] = [
  mediaNode('v1', 'video', 'https://cdn/v1.mp4'),
  mediaNode('v2', 'video', 'https://cdn/v2.mp4'),
  mediaNode('v3', 'video', 'https://cdn/v3.mp4'),
  mediaNode('a1', 'audio', 'https://cdn/a1.mp3'),
]

const SETTINGS = { projectId: 'proj_1' } as const

describe('renderOutputDimensions', () => {
  it('比例 × 清晰度 —— 短边定档，长边由比例推', () => {
    expect(renderOutputDimensions('16:9', '1080p')).toEqual({
      width: 1920,
      height: 1080,
    })
    expect(renderOutputDimensions('9:16', '1080p')).toEqual({
      width: 1080,
      height: 1920,
    })
    expect(renderOutputDimensions('1:1', '720p')).toEqual({
      width: 720,
      height: 720,
    })
    expect(renderOutputDimensions('16:9', '4k')).toEqual({
      width: 3840,
      height: 2160,
    })
  })

  it('两边都是偶数 —— H.264 的 4:2:0 采样要求', () => {
    for (const aspect of ['16:9', '9:16', '1:1'] as const) {
      for (const resolution of ['720p', '1080p', '4k'] as const) {
        const { width, height } = renderOutputDimensions(aspect, resolution)
        expect(width % 2).toBe(0)
        expect(height % 2).toBe(0)
      }
    }
  })
})

describe('resolveRenderWindow', () => {
  it('整条 = 全长', () => {
    expect(
      resolveRenderWindow(threeClipProject(), {
        range: EDIT_EXPORT_RANGE_IDS.all,
      }),
    ).toEqual({ fromSec: 0, toSec: 12 })
  })

  it('I·O 只标了一头时另一头取端点', () => {
    expect(
      resolveRenderWindow(threeClipProject(), {
        range: EDIT_EXPORT_RANGE_IDS.inOut,
        inPointSec: 5,
      }),
    ).toEqual({ fromSec: 5, toSec: 12 })
  })

  it('单段 = 那一段在时间线上的起止', () => {
    expect(
      resolveRenderWindow(threeClipProject(), {
        range: EDIT_EXPORT_RANGE_IDS.clip,
        clipId: 'c2',
        track: EDIT_TRACK_IDS.video,
      }),
    ).toEqual({ fromSec: 4, toSec: 8 })
  })

  it('选中的段已经不在时间线上 —— 报错而不是悄悄导出整条', () => {
    expect(() =>
      resolveRenderWindow(threeClipProject(), {
        range: EDIT_EXPORT_RANGE_IDS.clip,
        clipId: 'gone',
      }),
    ).toThrow(RenderPlanError)
  })
})

describe('toRenderPlan · 三范围', () => {
  it('整条：三段全在，输出规格 25fps', () => {
    const plan = toRenderPlan(
      threeClipProject(),
      NODES,
      { range: EDIT_EXPORT_RANGE_IDS.all },
      SETTINGS,
    )
    expect(plan.version).toBe(RENDER_PLAN_VERSION)
    expect(plan.name).toBe('成片')
    expect(plan.projectId).toBe('proj_1')
    expect(plan.output.fps).toBe(RENDER_OUTPUT_FPS)
    expect(plan.video.map((segment) => segment.id)).toEqual(['c1', 'c2', 'c3'])
    expect(plan.video[0]?.src).toBe('https://cdn/v1.mp4')
    expect(plan.totalDurationSec).toBe(12)
  })

  it('I·O：跨段的窗口把两头的段裁到素材本地秒', () => {
    const plan = toRenderPlan(
      threeClipProject(),
      NODES,
      {
        range: EDIT_EXPORT_RANGE_IDS.inOut,
        inPointSec: 2,
        outPointSec: 9,
      },
      SETTINGS,
    )
    expect(plan.video.map((segment) => segment.id)).toEqual(['c1', 'c2', 'c3'])
    // c1 只剩后 2s（本地 2–4），c3 只剩前 1s（本地 0–1）。
    expect(plan.video[0]).toMatchObject({ in: 2, out: 4, durationSec: 2 })
    expect(plan.video[1]).toMatchObject({ in: 0, out: 4, durationSec: 4 })
    expect(plan.video[2]).toMatchObject({ in: 0, out: 1, durationSec: 1 })
    expect(plan.totalDurationSec).toBe(7)
  })

  it('I·O：1.5× 的段按素材本地秒裁（⛔ 不拿成片秒当本地秒）', () => {
    const sped = project({
      tracks: {
        video: [clip({ id: 'c1', sourceNodeId: 'v1', out: 6, speed: 1.5 })],
        audio: [],
        music: [],
      },
    })
    // 段在成片上占 4s（6 / 1.5）。取成片 1–3s → 本地 1.5–4.5。
    const plan = toRenderPlan(
      sped,
      NODES,
      {
        range: EDIT_EXPORT_RANGE_IDS.inOut,
        inPointSec: 1,
        outPointSec: 3,
      },
      SETTINGS,
    )
    expect(plan.video[0]).toMatchObject({
      in: 1.5,
      out: 4.5,
      speed: 1.5,
      durationSec: 2,
    })
  })

  it('单段：只出那一段，可以当裁剪用', () => {
    const plan = toRenderPlan(
      threeClipProject(),
      NODES,
      {
        range: EDIT_EXPORT_RANGE_IDS.clip,
        clipId: 'c2',
        track: EDIT_TRACK_IDS.video,
      },
      SETTINGS,
    )
    expect(plan.video).toHaveLength(1)
    expect(plan.video[0]?.id).toBe('c2')
    expect(plan.totalDurationSec).toBe(4)
  })
})

describe('toRenderPlan · 转场重叠扣时', () => {
  it('两处叠化 → 成片比段长之和短两个叠化时长', () => {
    const withCrossfades = project({
      tracks: {
        video: [
          clip({
            id: 'c1',
            sourceNodeId: 'v1',
            transitionOut: EDIT_TRANSITION_IDS.crossfade,
          }),
          clip({
            id: 'c2',
            sourceNodeId: 'v2',
            transitionOut: EDIT_TRANSITION_IDS.crossfade,
          }),
          clip({ id: 'c3', sourceNodeId: 'v3' }),
        ],
        audio: [],
        music: [],
      },
    })
    const plan = toRenderPlan(
      withCrossfades,
      NODES,
      { range: EDIT_EXPORT_RANGE_IDS.all },
      SETTINGS,
    )
    expect(plan.totalDurationSec).toBeCloseTo(12 - 2 * RENDER_CROSSFADE_SEC, 6)
  })

  it('黑场不扣时长 —— 它是段内的淡入淡出，不是重叠', () => {
    const withBlack = project({
      tracks: {
        video: [
          clip({
            id: 'c1',
            sourceNodeId: 'v1',
            transitionOut: EDIT_TRANSITION_IDS.black,
          }),
          clip({ id: 'c2', sourceNodeId: 'v2' }),
        ],
        audio: [],
        music: [],
      },
    })
    const plan = toRenderPlan(
      withBlack,
      NODES,
      { range: EDIT_EXPORT_RANGE_IDS.all },
      SETTINGS,
    )
    expect(plan.totalDurationSec).toBe(8)
  })

  it('最后一段的转场被抹平 —— 后面没有东西可接', () => {
    const trailing = project({
      tracks: {
        video: [
          clip({
            id: 'c1',
            sourceNodeId: 'v1',
            transitionOut: EDIT_TRANSITION_IDS.crossfade,
          }),
        ],
        audio: [],
        music: [],
      },
    })
    const plan = toRenderPlan(
      trailing,
      NODES,
      { range: EDIT_EXPORT_RANGE_IDS.all },
      SETTINGS,
    )
    expect(plan.video[0]?.transitionOut).toBe(EDIT_TRANSITION_IDS.none)
    expect(plan.totalDurationSec).toBe(4)
  })

  it('尾巴被 I·O 切掉的段不再接转场', () => {
    const withCrossfade = project({
      tracks: {
        video: [
          clip({
            id: 'c1',
            sourceNodeId: 'v1',
            transitionOut: EDIT_TRANSITION_IDS.crossfade,
          }),
          clip({ id: 'c2', sourceNodeId: 'v2' }),
        ],
        audio: [],
        music: [],
      },
    })
    const plan = toRenderPlan(
      withCrossfade,
      NODES,
      {
        range: EDIT_EXPORT_RANGE_IDS.inOut,
        inPointSec: 0,
        outPointSec: 3,
      },
      SETTINGS,
    )
    expect(plan.video).toHaveLength(1)
    expect(plan.video[0]?.transitionOut).toBe(EDIT_TRANSITION_IDS.none)
    expect(plan.totalDurationSec).toBe(3)
  })
})

describe('toRenderPlan · 语音与配乐层', () => {
  it('A / M 轨按同一个窗口裁，并带上成片时间轴的起点与增益', () => {
    const withAudio = project({
      tracks: {
        video: [clip({ id: 'c1', sourceNodeId: 'v1', out: 10 })],
        audio: [
          clip({ id: 'a1', sourceNodeId: 'a1', out: 3 }),
          clip({ id: 'a2', sourceNodeId: 'a1', out: 3, gain: 0.5 }),
        ],
        music: [clip({ id: 'm1', sourceNodeId: 'a1', out: 10 })],
      },
    })
    const plan = toRenderPlan(
      withAudio,
      NODES,
      { range: EDIT_EXPORT_RANGE_IDS.inOut, inPointSec: 2, outPointSec: 8 },
      SETTINGS,
    )
    expect(plan.audio).toHaveLength(2)
    expect(plan.audio[0]).toMatchObject({
      id: 'a1',
      in: 2,
      out: 3,
      startSec: 0,
      gain: 1,
    })
    expect(plan.audio[1]).toMatchObject({
      id: 'a2',
      in: 0,
      out: 3,
      startSec: 1,
      gain: 0.5,
    })
    expect(plan.music[0]).toMatchObject({ in: 2, out: 8, startSec: 0 })
  })
})

describe('toRenderPlan · 失败可见', () => {
  it('空表', () => {
    expect(() =>
      toRenderPlan(
        project(),
        NODES,
        {
          range: EDIT_EXPORT_RANGE_IDS.all,
        },
        SETTINGS,
      ),
    ).toThrow(
      expect.objectContaining({
        code: RENDER_PLAN_ERROR_CODES.emptyTimeline,
      }) as Error,
    )
  })

  it('来源节点没有 url', () => {
    expect(() =>
      toRenderPlan(
        threeClipProject(),
        [mediaNode('v1', 'video', undefined)],
        { range: EDIT_EXPORT_RANGE_IDS.all },
        SETTINGS,
      ),
    ).toThrow(
      expect.objectContaining({
        code: RENDER_PLAN_ERROR_CODES.missingSource,
      }) as Error,
    )
  })

  it('I·O 区间为零长', () => {
    expect(() =>
      toRenderPlan(
        threeClipProject(),
        NODES,
        {
          range: EDIT_EXPORT_RANGE_IDS.inOut,
          inPointSec: 4,
          outPointSec: 4,
        },
        SETTINGS,
      ),
    ).toThrow(
      expect.objectContaining({
        code: RENDER_PLAN_ERROR_CODES.emptyRange,
      }) as Error,
    )
  })

  it('超过渲染时长上限', () => {
    const long = project({
      tracks: {
        video: [clip({ id: 'c1', sourceNodeId: 'v1', out: 1_000 })],
        audio: [],
        music: [],
      },
    })
    expect(() =>
      toRenderPlan(long, NODES, { range: EDIT_EXPORT_RANGE_IDS.all }, SETTINGS),
    ).toThrow(
      expect.objectContaining({
        code: RENDER_PLAN_ERROR_CODES.tooLong,
      }) as Error,
    )
  })
})
