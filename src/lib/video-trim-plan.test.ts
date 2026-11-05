import { describe, expect, it } from 'vitest'

import { RENDER_PLAN_ERROR_CODES } from '@/constants/render-video'
import { RenderPlanError } from '@/lib/edit-project'
import { NodeWorkflowStateV4Schema } from '@/types/node-workflow'

import {
  buildVideoTrimPlan,
  nearestRenderAspect,
  renderResolutionFor,
} from './video-trim-plan'

const NOW = '2026-11-05T00:00:00.000Z'

function card(url?: string) {
  return NodeWorkflowStateV4Schema.parse({
    version: 4,
    nodes: [
      {
        id: 'v1',
        position: { x: 0, y: 0 },
        data: {
          kind: 'video',
          subtype: 'shot',
          name: 'S02',
          label: 'S02',
          status: url ? 'done' : 'idle',
          createdAt: NOW,
          durationSec: 8,
          ...(url ? { url } : {}),
        },
      },
    ],
    edges: [],
  }).nodes[0]!
}

let seq = 0
const mintId = (prefix: string) => `${prefix}${(seq += 1)}`

describe('nearestRenderAspect / renderResolutionFor', () => {
  it('取最接近的比例；量不到 = 横屏', () => {
    expect(nearestRenderAspect(1920, 1080)).toBe('16:9')
    expect(nearestRenderAspect(1080, 1920)).toBe('9:16')
    expect(nearestRenderAspect(1024, 1024)).toBe('1:1')
    expect(nearestRenderAspect(1440, 1080)).toBe('16:9') // 4:3 → 横屏加边
    expect(nearestRenderAspect(undefined, 0)).toBe('16:9')
  })

  it('清晰度跟原片短边，不往上拉', () => {
    expect(renderResolutionFor(1280, 720)).toBe('720p')
    expect(renderResolutionFor(1920, 1080)).toBe('1080p')
    expect(renderResolutionFor(3840, 2160)).toBe('4k')
    expect(renderResolutionFor()).toBe('1080p')
  })
})

describe('buildVideoTrimPlan', () => {
  it('一段画面 = 原片的入出点，原声保留，名字与项目照给', () => {
    const plan = buildVideoTrimPlan(
      card('https://cdn.test/v1.mp4'),
      { startSec: 1.5, endSec: 4 },
      { projectId: 'p1', name: 'S02 · 裁剪', width: 1280, height: 720, mintId },
    )
    expect(plan.projectId).toBe('p1')
    expect(plan.name).toBe('S02 · 裁剪')
    expect(plan.video).toHaveLength(1)
    expect(plan.video[0]).toMatchObject({
      src: 'https://cdn.test/v1.mp4',
      in: 1.5,
      out: 4,
      muted: false,
      sourceNodeId: 'v1',
    })
    expect(plan.totalDurationSec).toBeCloseTo(2.5)
    expect(plan.output).toMatchObject({ aspect: '16:9', resolution: '720p' })
  })

  it('卡上没片子 = 说「缺片」', () => {
    try {
      buildVideoTrimPlan(
        card(),
        { startSec: 0, endSec: 2 },
        { projectId: 'p1', name: 'x', mintId },
      )
      throw new Error('should throw')
    } catch (error) {
      expect(error).toBeInstanceOf(RenderPlanError)
      expect((error as RenderPlanError).code).toBe(
        RENDER_PLAN_ERROR_CODES.missingSource,
      )
    }
  })
})
