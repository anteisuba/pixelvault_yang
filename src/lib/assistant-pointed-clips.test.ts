import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VIDEO_FRAME_CAPTURE_REASONS } from '@/constants/video-analysis'
import type { AssistantMention } from '@/types/assistant-mention'

const captureClipFrames = vi.hoisted(() => vi.fn())
vi.mock('@/lib/video-frame-capture', () => ({ captureClipFrames }))

import {
  capturePointedClips,
  resetPointedClipCaptureCache,
  resolvePointedClips,
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

function captured(duration: number) {
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
        dataUrl: 'data:image/webp;base64,AA',
      },
    ],
  }
}

describe('resolvePointedClips', () => {
  it('orders @ clips, then attachments, then mounted video-N, deduped by url', () => {
    const { clips, overflow } = resolvePointedClips({
      mentions: [
        videoMention('https://cdn.example.com/a.mp4', '  Shot A  ', 'node-1'),
        {
          ...videoMention('https://cdn.example.com/img.png', 'pic'),
          kind: 'image',
        },
        videoMention(undefined, 'no address'),
      ],
      attachments: [
        { kind: 'image', url: 'https://cdn.example.com/b.png', label: 'b.png' },
        { kind: 'video', url: 'https://cdn.example.com/a.mp4', label: 'dupe' },
      ],
      referenceVideos: [{ url: 'https://cdn.example.com/ref.mp4' }],
    })
    expect(clips).toEqual([
      {
        sourceUrl: 'https://cdn.example.com/a.mp4',
        label: 'Shot A',
        nodeId: 'node-1',
      },
      { sourceUrl: 'https://cdn.example.com/ref.mp4', label: 'video-1' },
    ])
    expect(overflow).toBe(0)
  })

  it('keeps the first two and reports the rest as overflow', () => {
    const { clips, overflow } = resolvePointedClips({
      mentions: [],
      attachments: [
        { kind: 'video', url: 'https://cdn.example.com/1.mp4', label: 'one' },
        { kind: 'video', url: 'https://cdn.example.com/2.mp4', label: 'two' },
      ],
      referenceVideos: [{ url: 'https://cdn.example.com/3.mp4' }],
    })
    expect(clips.map((clip) => clip.label)).toEqual(['one', 'two'])
    expect(overflow).toBe(1)
  })

  it('skips addresses the request would reject', () => {
    const { clips } = resolvePointedClips({
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
    expect(clips).toEqual([
      { sourceUrl: 'blob:https://app.example.com/1', label: 'clip' },
    ])
  })
})

describe('capturePointedClips', () => {
  beforeEach(() => {
    captureClipFrames.mockReset()
    resetPointedClipCaptureCache()
  })

  it('sends frames for captured clips and keeps failed ones without frames', async () => {
    captureClipFrames.mockResolvedValueOnce(captured(4)).mockResolvedValueOnce({
      ok: false,
      reason: VIDEO_FRAME_CAPTURE_REASONS.taintedCanvas,
      message: 'tainted',
    })
    const result = await capturePointedClips([
      { sourceUrl: 'https://cdn.example.com/a.mp4', label: 'A', nodeId: 'n1' },
      { sourceUrl: 'https://cdn.example.com/b.mp4', label: 'B' },
    ])
    expect(result.videoClips).toEqual([
      {
        sourceUrl: 'https://cdn.example.com/a.mp4',
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
      { sourceUrl: 'https://cdn.example.com/b.mp4', label: 'B' },
    ])
    expect(result.failures).toEqual([VIDEO_FRAME_CAPTURE_REASONS.taintedCanvas])
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
    const a = { sourceUrl: 'https://cdn.example.com/a.mp4', label: 'A' }
    const b = { sourceUrl: 'https://cdn.example.com/b.mp4', label: 'B' }
    await capturePointedClips([a, b])
    const again = await capturePointedClips([a, b])
    expect(captureClipFrames).toHaveBeenCalledTimes(3)
    expect(again.failures).toEqual([])
    expect(again.videoClips.map((clip) => clip.durationSeconds)).toEqual([4, 6])
  })
})
