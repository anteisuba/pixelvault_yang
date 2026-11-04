// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_V3_CLIP_LIMITS } from '@/constants/assistant-v3'
import { VIDEO_FRAME_CAPTURE_REASONS } from '@/constants/video-analysis'
import { planClipFrames } from '@/lib/video-frame-plan'
import type { AssistantMention } from '@/types/assistant-mention'
import {
  installFakeVideoDecoding,
  type FakeVideoDecoding,
} from '@/test/fake-video-element'

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

describe('captureTurnClips（真抽帧，只替浏览器解码那层）', () => {
  let videos: FakeVideoDecoding

  beforeEach(() => {
    resetPointedClipCaptureCache()
    videos = installFakeVideoDecoding()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('抽成的带帧；被指着的没抽成留下不带帧，并记一笔原因', async () => {
    videos.set(url('a'), { duration: 4 })
    videos.set(url('b'), 'tainted')

    const result = await captureTurnClips({
      pointed: [
        { sourceUrl: url('a'), label: 'A', nodeId: 'n1' },
        { sourceUrl: url('b'), label: 'B' },
      ],
      mounted: [],
    })

    const plan = planClipFrames(4)
    expect(result.videoClips).toEqual([
      {
        sourceUrl: url('a'),
        label: 'A',
        nodeId: 'n1',
        durationSeconds: 4,
        frames: plan.entries.map((entry) => ({
          index: entry.index,
          timestampSeconds: entry.timestampSeconds,
          dataUrl: expect.stringMatching(/^data:image\//),
        })),
      },
      { sourceUrl: url('b'), label: 'B' },
    ])
    expect(result.failures).toEqual([VIDEO_FRAME_CAPTURE_REASONS.taintedCanvas])
  })

  it('⭐ 挂着的带上标记；没抽成的那段悄悄不带', async () => {
    videos.set(url('m1'), { duration: 6 })
    videos.set(url('m2'), 'loadError')

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

  it('挂着的只填帧预算剩下的；被指着的从不让位', async () => {
    const budget = ASSISTANT_V3_CLIP_LIMITS.carriedFramesMaxChars
    const frames = planClipFrames(4).entries.length
    const perFrame = (total: number) => Math.floor(total / frames)
    videos.set(url('p'), { duration: 4, frameChars: perFrame(budget - 1000) })
    videos.set(url('big'), { duration: 4, frameChars: 2000 })
    videos.set(url('small'), { duration: 4, frameChars: 30 })

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

  it('抽成的下次直接复用；没抽成的下次再试', async () => {
    videos.set(url('a'), { duration: 4 })
    videos.set(url('b'), 'loadError')
    const a = { sourceUrl: url('a'), label: 'A' }
    const b = { sourceUrl: url('b'), label: 'B' }

    await captureTurnClips({ pointed: [a, b], mounted: [] })
    videos.set(url('b'), { duration: 6 })
    const again = await captureTurnClips({ pointed: [a, b], mounted: [] })

    expect(videos.loads[url('a')]).toBe(1)
    expect(again.failures).toEqual([])
    expect(again.videoClips.map((clip) => clip.durationSeconds)).toEqual([4, 6])
  })
})
