import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_V3_CLIP_LIMITS } from '@/constants/assistant-v3'
import { VIDEO_FRAME_CAPTURE_REASONS } from '@/constants/video-analysis'
import type { AssistantMention } from '@/types/assistant-mention'

const captureClipFrames = vi.hoisted(() => vi.fn())
vi.mock('@/lib/video-frame-capture', () => ({ captureClipFrames }))

import {
  captureTurnClips,
  resetPointedClipCaptureCache,
  resolveTurnClips,
} from '@/lib/assistant-pointed-clips'

function videoMention(
  url: string | undefined,
  label: string,
  nodeId?: string,
): AssistantMention {
  return {
    kind: 'video',
    id: label,
    label,
    scope: 'canvas',
    ...(url ? { url } : {}),
    ...(nodeId ? { nodeId } : {}),
  }
}

/** 抽好的一段：`frameChars` 是这段帧的 dataUrl 一共多少字（量预算用）。 */
function captured(duration: number, frameChars = 25) {
  return {
    ok: true as const,
    plan: { durationSeconds: duration, frames: [] },
    durationSeconds: duration,
    width: 768,
    height: 432,
    frames: [
      {
        index: 0,
        timestampSeconds: duration / 2,
        dataUrl: `data:image/webp;base64,${'A'.repeat(Math.max(0, frameChars - 23))}`,
      },
    ],
  }
}

const url = (name: string) => `https://cdn.example.com/${name}.mp4`

describe('resolveTurnClips', () => {
  it('points at @ clips then attachments; mounted video-N stay apart, deduped by url', () => {
    const { pointed, overflow, mounted } = resolveTurnClips({
      mentions: [
        videoMention(url('a'), '  Shot A  ', 'node-1'),
        {
          ...videoMention('https://cdn.example.com/img.png', 'pic'),
          kind: 'image',
        },
        videoMention(undefined, 'no address'),
      ],
      attachments: [
        { kind: 'image', url: 'https://cdn.example.com/b.png', label: 'b.png' },
        { kind: 'video', url: url('a'), label: 'dupe' },
      ],
      referenceVideos: [{ url: url('a') }, { url: url('ref') }],
    })
    expect(pointed).toEqual([
      { sourceUrl: url('a'), label: 'Shot A', nodeId: 'node-1' },
    ])
    // ⭐ 同一段既 @ 了又挂着：算被指着；挂着的称呼按它在视频台上的位置。
    expect(mounted).toEqual([{ sourceUrl: url('ref'), label: 'video-2' }])
    expect(overflow).toBe(0)
  })

  it('caps the pointed set at two (mounted clips never count toward it)', () => {
    const { pointed, overflow, mounted } = resolveTurnClips({
      mentions: [],
      attachments: [
        { kind: 'video', url: url('1'), label: 'one' },
        { kind: 'video', url: url('2'), label: 'two' },
        { kind: 'video', url: url('3'), label: 'three' },
      ],
      referenceVideos: [{ url: url('m1') }, { url: url('m2') }],
    })
    expect(pointed.map((clip) => clip.label)).toEqual(['one', 'two'])
    expect(overflow).toBe(1)
    expect(mounted.map((clip) => clip.label)).toEqual(['video-1', 'video-2'])
  })

  it(`carries at most ${ASSISTANT_V3_CLIP_LIMITS.maxMountedClips} mounted clips`, () => {
    const { mounted } = resolveTurnClips({
      mentions: [],
      attachments: [],
      referenceVideos: Array.from({ length: 5 }, (_, index) => ({
        url: url(`m${index}`),
      })),
    })
    expect(mounted).toHaveLength(ASSISTANT_V3_CLIP_LIMITS.maxMountedClips)
  })

  it('skips addresses the request would reject', () => {
    const { pointed } = resolveTurnClips({
      mentions: [],
      attachments: [
        { kind: 'video', url: 'not a url', label: 'bad' },
        {
          kind: 'video',
          url: `https://cdn.example.com/${'x'.repeat(5000)}.mp4`,
          label: 'long',
        },
        { kind: 'video', url: 'blob:https://app.example.com/1', label: '   ' },
      ],
    })
    expect(pointed).toEqual([
      { sourceUrl: 'blob:https://app.example.com/1', label: 'clip' },
    ])
  })
})

describe('captureTurnClips', () => {
  beforeEach(() => {
    captureClipFrames.mockReset()
    resetPointedClipCaptureCache()
  })

  it('sends frames for captured clips and keeps failed pointed ones without frames', async () => {
    captureClipFrames.mockResolvedValueOnce(captured(4)).mockResolvedValueOnce({
      ok: false,
      reason: VIDEO_FRAME_CAPTURE_REASONS.taintedCanvas,
      message: 'tainted',
    })
    const result = await captureTurnClips({
      pointed: [
        { sourceUrl: url('a'), label: 'A', nodeId: 'n1' },
        { sourceUrl: url('b'), label: 'B' },
      ],
      mounted: [],
    })
    expect(result.videoClips).toEqual([
      {
        sourceUrl: url('a'),
        label: 'A',
        nodeId: 'n1',
        durationSeconds: 4,
        frames: [
          {
            index: 0,
            timestampSeconds: 2,
            dataUrl: 'data:image/webp;base64,AA',
          },
        ],
      },
      { sourceUrl: url('b'), label: 'B' },
    ])
    expect(result.failures).toEqual([VIDEO_FRAME_CAPTURE_REASONS.taintedCanvas])
  })

  it('⭐ mounted clips ride flagged; one that failed is dropped silently', async () => {
    captureClipFrames.mockResolvedValueOnce(captured(6)).mockResolvedValueOnce({
      ok: false,
      reason: VIDEO_FRAME_CAPTURE_REASONS.loadFailed,
      message: 'load',
    })
    const result = await captureTurnClips({
      pointed: [],
      mounted: [
        { sourceUrl: url('m1'), label: 'video-1' },
        { sourceUrl: url('m2'), label: 'video-2' },
      ],
    })
    expect(result.videoClips).toEqual([
      expect.objectContaining({
        sourceUrl: url('m1'),
        label: 'video-1',
        mounted: true,
        durationSeconds: 6,
      }),
    ])
    // 挂着的没抽成：⛔ 不留系统行（没人问它）。
    expect(result.failures).toEqual([])
  })

  it('mounted clips fill only what the frame budget leaves; pointed ones never give way', async () => {
    const budget = ASSISTANT_V3_CLIP_LIMITS.carriedFramesMaxChars
    captureClipFrames
      .mockResolvedValueOnce(captured(4, budget - 100))
      .mockResolvedValueOnce(captured(4, 200))
      .mockResolvedValueOnce(captured(4, 50))
    const result = await captureTurnClips({
      pointed: [{ sourceUrl: url('p'), label: 'P' }],
      mounted: [
        { sourceUrl: url('big'), label: 'video-1' },
        { sourceUrl: url('small'), label: 'video-2' },
      ],
    })
    expect(result.videoClips.map((clip) => clip.label)).toEqual([
      'P',
      'video-2',
    ])
  })

  it('reuses a successful capture and retries a failed one', async () => {
    captureClipFrames
      .mockResolvedValueOnce(captured(4))
      .mockResolvedValueOnce({
        ok: false,
        reason: VIDEO_FRAME_CAPTURE_REASONS.loadFailed,
        message: 'load',
      })
      .mockResolvedValueOnce(captured(6))
    const a = { sourceUrl: url('a'), label: 'A' }
    const b = { sourceUrl: url('b'), label: 'B' }
    await captureTurnClips({ pointed: [a, b], mounted: [] })
    const again = await captureTurnClips({ pointed: [a, b], mounted: [] })
    expect(captureClipFrames).toHaveBeenCalledTimes(3)
    expect(again.failures).toEqual([])
    expect(again.videoClips.map((clip) => clip.durationSeconds)).toEqual([4, 6])
  })
})
