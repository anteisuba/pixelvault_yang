import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_VIDEO_TIERS } from '@/constants/assistant'
import { ASSISTANT_V3_CLIP_LIMITS } from '@/constants/assistant-v3'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { planClipFrames } from '@/lib/video-frame-plan'
import type { AssistantOperatorVideoClip } from '@/types/assistant-operator'

vi.mock('server-only', () => ({}))

const { fetchAsBuffer } = vi.hoisted(() => ({ fetchAsBuffer: vi.fn() }))

/**
 * 测试里的「图」：内容写着格式（`webp:…`），格式不在名单里就认不出。
 * 「片子」：真的 ISO-BMFF / QuickTime 文件头，按 `served` 登记的大小下发。
 */
vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer,
  uploadToR2: vi.fn(),
  detectTrustedImageMime: async (
    buffer: Buffer,
    formats: ReadonlySet<string> = new Set(['jpeg', 'png', 'webp', 'gif']),
  ) => {
    const format = buffer.toString().split(':')[0] ?? ''
    if (!formats.has(format)) throw new Error('unsupported image')
    return { format, mimeType: `image/${format}`, width: 768, height: 432 }
  },
}))

import type { V3Context } from './assistant-v3-steps.service'
import { createPictureCache } from './assistant-v3-look.service'
import {
  createClipCache,
  loadClip,
  pointedClipParts,
  viewPointedClips,
} from './assistant-v3-watch.service'

/** 地址 → 片子（`brand` 决定 mp4 / mov，`bytes` 决定多大）。没登记的下不来。 */
const served = new Map<string, { brand: string; bytes: number }>()

function clipBytes(brand: string, bytes: number): Buffer {
  const head = Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from(`ftyp${brand}`, 'ascii'),
  ])
  return Buffer.concat([head, Buffer.alloc(Math.max(0, bytes - head.length))])
}

function serve(name: string, brand = 'isom', bytes = 1_000) {
  const url = `https://cdn.test/${name}.mp4`
  served.set(url, { brand, bytes })
  return url
}

/** 按片长计划抽好的一组帧（客户端交上来的形状）。 */
function capturedClip(
  url: string,
  label: string,
  durationSeconds: number,
  format = 'webp',
): AssistantOperatorVideoClip {
  return {
    sourceUrl: url,
    label,
    durationSeconds,
    frames: planClipFrames(durationSeconds).entries.map((entry) => ({
      index: entry.index,
      timestampSeconds: entry.timestampSeconds,
      dataUrl: `data:image/webp;base64,${Buffer.from(`${format}:${label}-${entry.index}`).toString('base64')}`,
    })),
  }
}

function context(
  adapterType: AI_ADAPTER_TYPES,
  videoClips: AssistantOperatorVideoClip[],
  clipTier: V3Context['clipTier'],
): V3Context {
  return {
    prepared: { run: { signal: undefined } },
    request: { messages: [], videoClips },
    seesImages: clipTier !== false,
    pictures: createPictureCache(adapterType),
    clipTier,
    clips: createClipCache(),
  } as unknown as V3Context
}

beforeEach(() => {
  served.clear()
  fetchAsBuffer.mockReset()
  fetchAsBuffer.mockImplementation(
    async (url: string, options: { maxBytes?: number }) => {
      const clip = served.get(url)
      if (!clip) throw new Error('unreachable')
      if (options.maxBytes !== undefined && clip.bytes > options.maxBytes)
        throw new Error(
          `Image exceeds maximum size of ${options.maxBytes} bytes (declared ${clip.bytes}).`,
        )
      return { buffer: clipBytes(clip.brand, clip.bytes), mimeType: 'video/*' }
    },
  )
})

describe('v3 看片 · 被指着的片子怎么摆', () => {
  it('⭐ 帧逐张标好「clip 「名字」 · frame k/N at t s」，整组摆上来', async () => {
    const url = 'https://cdn.test/walk.mp4'
    const views = await viewPointedClips(
      context(
        AI_ADAPTER_TYPES.OPENAI,
        [capturedClip(url, '走路', 6)],
        ASSISTANT_VIDEO_TIERS.frames,
      ),
      [{ url, label: '走路' }],
    )
    expect(views[0]).toMatchObject({ kind: 'frames', durationSeconds: 6 })
    const parts = pointedClipParts(views)
    expect(parts[0]).toEqual({
      type: 'text',
      text: 'CLIPS THE CREATOR POINTED AT (in order): 1 = clip 「走路」 (4 frames sampled across 6 s)',
    })
    const labels = parts.flatMap((part) =>
      part.type === 'text' ? [part.text] : [],
    )
    expect(labels.slice(1)).toEqual([
      'clip 「走路」 · frame 1/4 at 0.8 s',
      'clip 「走路」 · frame 2/4 at 2.3 s',
      'clip 「走路」 · frame 3/4 at 3.8 s',
      'clip 「走路」 · frame 4/4 at 5.3 s',
    ])
    expect(parts.filter((part) => part.type === 'image')).toHaveLength(4)
    // 帧档⛔ 不去下片子本体。
    expect(fetchAsBuffer).not.toHaveBeenCalled()
  })

  it('⭐ Gemini（native 档）在内联上限内交片子本体，⛔ 不用帧', async () => {
    const url = serve('walk')
    const views = await viewPointedClips(
      context(
        AI_ADAPTER_TYPES.GEMINI,
        [capturedClip(url, '走路', 6)],
        ASSISTANT_VIDEO_TIERS.native,
      ),
      [{ url, label: '走路' }],
    )
    expect(views[0]).toMatchObject({
      kind: 'video',
      clip: { mediaType: 'video/mp4' },
    })
    const parts = pointedClipParts(views)
    expect(parts[0]).toMatchObject({
      text: 'CLIPS THE CREATOR POINTED AT (in order): 1 = clip 「走路」 (the clip itself)',
    })
    expect(parts).toContainEqual(
      expect.objectContaining({ type: 'file', mediaType: 'video/mp4' }),
    )
    expect(parts.some((part) => part.type === 'image')).toBe(false)
  })

  it('Gemini 片子超过内联上限 → 退回帧', async () => {
    const url = serve(
      'long',
      'isom',
      ASSISTANT_V3_CLIP_LIMITS.inlineMaxBytes + 1,
    )
    const views = await viewPointedClips(
      context(
        AI_ADAPTER_TYPES.GEMINI,
        [capturedClip(url, '长片', 20)],
        ASSISTANT_VIDEO_TIERS.native,
      ),
      [{ url, label: '长片' }],
    )
    expect(fetchAsBuffer).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        maxBytes: ASSISTANT_V3_CLIP_LIMITS.inlineMaxBytes,
      }),
    )
    expect(views[0]).toMatchObject({ kind: 'frames' })
    expect(views[0]?.kind === 'frames' && views[0].frames).toHaveLength(8)
  })

  it('Gemini 片子太大、浏览器也没抽成 → 如实写没看成', async () => {
    const url = serve(
      'long',
      'isom',
      ASSISTANT_V3_CLIP_LIMITS.inlineMaxBytes + 1,
    )
    const views = await viewPointedClips(
      context(
        AI_ADAPTER_TYPES.GEMINI,
        [{ sourceUrl: url, label: '长片' }],
        ASSISTANT_VIDEO_TIERS.native,
      ),
      [{ url, label: '长片' }],
    )
    expect(views[0]).toEqual({
      kind: 'none',
      ref: { url, label: '长片' },
      note: 'too large to watch directly (over 20 MB); its frames could not be sampled in the browser',
    })
    expect(pointedClipParts(views)).toEqual([
      {
        type: 'text',
        text: 'CLIPS THE CREATOR POINTED AT (in order): 1 = clip 「长片」 (not shown: too large to watch directly (over 20 MB); its frames could not be sampled in the browser)',
      },
    ])
  })

  it('⭐ 服务端复算计划：时间戳不对的那组帧⛔ 不摆上去', async () => {
    const url = 'https://cdn.test/walk.mp4'
    const clip = capturedClip(url, '走路', 6)
    clip.frames![1] = { ...clip.frames![1]!, timestampSeconds: 4.9 }
    const views = await viewPointedClips(
      context(AI_ADAPTER_TYPES.OPENAI, [clip], ASSISTANT_VIDEO_TIERS.frames),
      [{ url, label: '走路' }],
    )
    expect(views[0]).toMatchObject({
      kind: 'none',
      note: 'its frames did not pass the check',
    })
  })

  it('不是片长计划的帧数（老的三帧）→ 不摆', async () => {
    const url = 'https://cdn.test/walk.mp4'
    const clip = capturedClip(url, '走路', 12)
    clip.frames = clip.frames!.slice(0, 3)
    const views = await viewPointedClips(
      context(AI_ADAPTER_TYPES.OPENAI, [clip], ASSISTANT_VIDEO_TIERS.frames),
      [{ url, label: '走路' }],
    )
    expect(views[0]?.kind).toBe('none')
  })

  /**
   * Claude 与 Grok（2026-10-15 从 `video: false` 改成 frames 档）：帧就是图，走与看图同一条
   * 路、同一个单图上限（Claude 原图约 7.5 MB）。
   */
  for (const adapter of [AI_ADAPTER_TYPES.ANTHROPIC, AI_ADAPTER_TYPES.XAI]) {
    it(`${adapter}：被指着的片子按帧看，⛔ 不下片子本体`, async () => {
      const url = 'https://cdn.test/walk.mp4'
      const views = await viewPointedClips(
        context(
          adapter,
          [capturedClip(url, '走路', 3)],
          ASSISTANT_VIDEO_TIERS.frames,
        ),
        [{ url, label: '走路' }],
      )
      expect(views[0]).toMatchObject({ kind: 'frames' })
      expect(views[0]?.kind === 'frames' && views[0].frames).toHaveLength(3)
      expect(fetchAsBuffer).not.toHaveBeenCalled()
    })
  }

  it('Claude：超过它单图上限的帧整组不用（与看图同一个数）', async () => {
    const url = 'https://cdn.test/walk.mp4'
    const pictures = createPictureCache(AI_ADAPTER_TYPES.ANTHROPIC)
    expect(pictures.maxBytes).toBe(7_500_000)
    const views = await viewPointedClips(
      {
        ...context(
          AI_ADAPTER_TYPES.ANTHROPIC,
          [capturedClip(url, '走路', 3)],
          ASSISTANT_VIDEO_TIERS.frames,
        ),
        pictures: { ...pictures, maxBytes: 4 },
      } as V3Context,
      [{ url, label: '走路' }],
    )
    expect(views[0]?.kind).toBe('none')
  })

  it('GIF 帧不收（Gemini 收不了 GIF，五家同一张名单）', async () => {
    const url = 'https://cdn.test/walk.mp4'
    const views = await viewPointedClips(
      context(
        AI_ADAPTER_TYPES.OPENAI,
        [capturedClip(url, '走路', 3, 'gif')],
        ASSISTANT_VIDEO_TIERS.frames,
      ),
      [{ url, label: '走路' }],
    )
    expect(views[0]?.kind).toBe('none')
  })
})

describe('v3 看片 · 下片子', () => {
  it('QuickTime 按 Gemini 的写法交 video/mov；同一个地址只下一次', async () => {
    const url = serve('take', 'qt  ')
    const cache = createClipCache()
    const first = await loadClip(cache, url)
    const second = await loadClip(cache, url)
    expect(first).toMatchObject({ ok: true, clip: { mediaType: 'video/mov' } })
    expect(second).toBe(first)
    expect(fetchAsBuffer).toHaveBeenCalledTimes(1)
  })

  it('浏览器里的 blob: 地址服务端下不了：⛔ 不去请求', async () => {
    const result = await loadClip(createClipCache(), 'blob:https://app/1')
    expect(result).toEqual({ ok: false, reason: 'unloadable' })
    expect(fetchAsBuffer).not.toHaveBeenCalled()
  })

  it('下回来的不是视频容器 → 下不来（按文件头认，⛔ 不信 content-type）', async () => {
    fetchAsBuffer.mockResolvedValueOnce({
      buffer: Buffer.from('<html>not a clip at all</html>'),
      mimeType: 'video/mp4',
    })
    const result = await loadClip(createClipCache(), 'https://cdn.test/x.mp4')
    expect(result).toEqual({ ok: false, reason: 'unloadable' })
  })
})
