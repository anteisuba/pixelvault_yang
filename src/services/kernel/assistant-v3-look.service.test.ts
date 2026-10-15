import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_VIDEO_TIERS } from '@/constants/assistant'
import {
  ASSISTANT_V3_CLIP_LIMITS,
  ASSISTANT_V3_LIMITS,
} from '@/constants/assistant-v3'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { AssistantOperatorStepSchema } from '@/types/assistant-operator'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'

vi.mock('server-only', () => ({}))

const { fetchAsBuffer, recordLedgerStep } = vi.hoisted(() => ({
  fetchAsBuffer: vi.fn(),
  recordLedgerStep: vi.fn(),
}))

vi.mock('@/services/kernel/assistant-operator.service', () => ({
  recordLedgerStep,
  rememberStepArtifacts: vi.fn(),
  isFatalOperatorToolError: () => false,
  planTool: vi.fn(),
  TOOL_FAILED_DETAIL: 'tool failed',
  toStepEvent: (raw: unknown) => ({
    type: 'step',
    step: AssistantOperatorStepSchema.parse(raw),
  }),
}))

/** 测试里的「图」：内容写着格式与地址（`png:https://…`），格式不在名单里就认不出。 */
vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer,
  detectTrustedImageMime: async (
    buffer: Buffer,
    formats: ReadonlySet<string>,
  ) => {
    const format = buffer.toString().split(':')[0] ?? ''
    if (!formats.has(format)) throw new Error('unsupported image')
    return { format, mimeType: `image/${format}`, width: 512, height: 768 }
  },
}))

import type { V3Context } from './assistant-v3-steps.service'
import {
  createPictureCache,
  executeV3Look,
  loadFreshLooks,
  lookClipParts,
  lookUserParts,
  picturesRideInToolResult,
} from './assistant-v3-look.service'
import { createClipCache } from './assistant-v3-watch.service'

/** 地址 → 格式；没登记的地址下不来。 */
const served = new Map<string, string>()
/** 地址 → 片子多大（真的 mp4 文件头）；没登记的下不来。 */
const clipsServed = new Map<string, number>()

function clip(name: string, bytes = 1_000) {
  const url = `https://cdn.test/${name}.mp4`
  clipsServed.set(url, bytes)
  return { url, label: name }
}

function context(overrides: Partial<V3Context> = {}): V3Context {
  return {
    face: 'canvas',
    clerkId: 'clerk-1',
    prepared: {
      run: { stepSeq: 0, signal: undefined },
      user: { id: 'user-1' },
    },
    request: { messages: [] },
    nodes: [],
    handles: {},
    language: 'english',
    stepPrefix: 'v3s1',
    transcript: [{ type: 'board', text: 'BOARD', images: [] }],
    replyText: { current: '' },
    seesImages: true,
    pictures: createPictureCache(AI_ADAPTER_TYPES.OPENAI),
    clipTier: ASSISTANT_VIDEO_TIERS.frames,
    clips: createClipCache(),
    ...overrides,
  } as unknown as V3Context
}

function picture(name: string, format = 'png') {
  const url = `https://cdn.test/${name}.${format}`
  served.set(url, format)
  return { url, label: name }
}

async function run(
  generator: AsyncGenerator<AssistantOperatorEvent, unknown>,
): Promise<{ events: AssistantOperatorEvent[]; outcome: unknown }> {
  const events: AssistantOperatorEvent[] = []
  for (;;) {
    const next = await generator.next()
    if (next.done) return { events, outcome: next.value }
    events.push(next.value)
  }
}

describe('v3 look · Denia 自己看', () => {
  beforeEach(() => {
    served.clear()
    recordLedgerStep.mockReset()
    fetchAsBuffer.mockReset()
    clipsServed.clear()
    fetchAsBuffer.mockImplementation(
      async (url: string, options: { maxBytes?: number }) => {
        const bytes = clipsServed.get(url)
        if (bytes !== undefined) {
          if (options.maxBytes !== undefined && bytes > options.maxBytes)
            throw new Error(
              `Image exceeds maximum size of ${options.maxBytes} bytes (declared ${bytes}).`,
            )
          return {
            buffer: Buffer.concat([
              Buffer.from([0, 0, 0, 24]),
              Buffer.from('ftypisom-mp4-bytes', 'ascii'),
            ]),
            mimeType: 'video/mp4',
          }
        }
        const format = served.get(url)
        if (!format) throw new Error('unreachable')
        return { buffer: Buffer.from(`${format}:${url}`), mimeType: 'image/*' }
      },
    )
  })

  it('一次最多看 maxLookCards 张：多出来的明说只看了前几张', async () => {
    const targets = Array.from(
      { length: ASSISTANT_V3_LIMITS.maxLookCards + 2 },
      (_, index) => picture(`p${index + 1}`),
    )
    const { events, outcome } = await run(
      executeV3Look(context(), { targets, notes: [], question: 'who is who?' }),
    )
    expect(fetchAsBuffer).toHaveBeenCalledTimes(
      ASSISTANT_V3_LIMITS.maxLookCards,
    )
    expect(outcome).toMatchObject({
      kind: 'result',
      error: false,
      images: targets.slice(0, ASSISTANT_V3_LIMITS.maxLookCards),
    })
    const output = (outcome as { output: string }).output
    expect(output).toContain(
      `Only the first ${ASSISTANT_V3_LIMITS.maxLookCards} pictures were looked at; 「p7」, 「p8」 were not.`,
    )
    expect(output).toContain(
      'You are looking at these pictures for: "who is who?"',
    )
    expect(output).toContain('for your next step only')
    expect(output).toContain('1 = 「p1」 (512×768)')
    // 过程行只写看了哪几张，⛔ 不写看到了什么。
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'step',
      step: {
        tool: 'read_state',
        status: 'done',
        result: { digest: 'p1 · p2 · p3 · p4 · p5 · p6' },
      },
    })
  })

  it('一张下不来只点名那一张，其余照看，⛔ 不连坐整步', async () => {
    const good = picture('harry')
    const gif = picture('goyle', 'gif')
    const lost = { url: 'https://cdn.test/gone.png', label: 'gone' }
    const { events, outcome } = await run(
      executeV3Look(context(), {
        targets: [good, gif, lost],
        notes: [],
        question: 'compare',
      }),
    )
    expect(outcome).toMatchObject({
      kind: 'result',
      error: false,
      images: [good],
    })
    expect((outcome as { output: string }).output).toContain(
      'Could not load 「goyle」, 「gone」',
    )
    expect(events[0]).toMatchObject({ step: { status: 'done' } })
  })

  it('一张都没下来：这一步才算失败', async () => {
    const { events, outcome } = await run(
      executeV3Look(context(), {
        targets: [{ url: 'https://cdn.test/gone.png', label: 'gone' }],
        notes: [],
        question: '',
      }),
    )
    expect(outcome).toMatchObject({
      kind: 'result',
      error: true,
      failureKey: 'look:unloaded',
    })
    expect(outcome).not.toHaveProperty('images')
    expect(events[0]).toMatchObject({ step: { status: 'error' } })
  })

  it('所选模型看不了图：只回一句换模型，⛔ 不下图、不借别家', async () => {
    const { events, outcome } = await run(
      executeV3Look(context({ seesImages: false }), {
        targets: [picture('harry')],
        notes: [],
        question: 'who?',
      }),
    )
    expect(events).toEqual([])
    expect(fetchAsBuffer).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({
      kind: 'result',
      error: true,
      failureKey: 'look:noVision',
    })
    expect((outcome as { output: string }).output).toContain(
      'cannot see pictures, and no other provider is used in its place',
    )
  })

  it('已经附在这一轮那句话里的图⛔ 不再附一遍，只指给模型看', async () => {
    const pointed = picture('door')
    const { outcome } = await run(
      executeV3Look(
        context({
          transcript: [{ type: 'board', text: 'BOARD', images: [pointed] }],
        }),
        { targets: [pointed], notes: [], question: 'what is it?' },
      ),
    )
    expect(outcome).toMatchObject({ kind: 'result', error: false })
    expect(outcome).not.toHaveProperty('images')
    expect((outcome as { output: string }).output).toContain(
      "Already in front of you in the creator's message: 「door」 (picture 1 of IMAGES THE CREATOR POINTED AT)",
    )
  })

  it('图只附给紧跟着的那一次调用：模型一开口（新的 assistant 条目）就不再附', async () => {
    const harry = picture('harry')
    const look: AssistantV3Transcript = [
      { type: 'board', text: 'BOARD', images: [] },
      {
        type: 'assistant',
        text: '',
        calls: [{ id: 'call_1', tool: 'look', input: '{}' }],
      },
      {
        type: 'result',
        id: 'call_1',
        tool: 'look',
        output: 'looked',
        error: false,
        images: [harry],
      },
    ]
    const fresh = await loadFreshLooks(context({ transcript: look }))
    expect([...fresh.keys()]).toEqual(['call_1'])
    expect(fresh.get('call_1')).toMatchObject({
      header: 'PICTURES FROM YOUR look (in order): 1 = 「harry」',
    })
    expect(fresh.get('call_1')?.pictures).toHaveLength(1)

    const later = await loadFreshLooks(
      context({
        transcript: [
          ...look,
          { type: 'assistant', text: '是哈利。', calls: [] },
        ],
      }),
    )
    expect(later.size).toBe(0)
  })

  it('单图上限按所选那家收紧：Claude 是 base64 后 10 MB，别家 20 MB', () => {
    expect(createPictureCache(AI_ADAPTER_TYPES.ANTHROPIC).maxBytes).toBe(
      7_500_000,
    )
    for (const adapter of [
      AI_ADAPTER_TYPES.OPENAI,
      AI_ADAPTER_TYPES.GEMINI,
      AI_ADAPTER_TYPES.DEEPSEEK,
      AI_ADAPTER_TYPES.XAI,
    ])
      expect(createPictureCache(adapter).maxBytes).toBe(20_000_000)
  })

  it('Gemini 把图放进工具结果，另外四家跟在工具结果后的 user 里', () => {
    expect(picturesRideInToolResult(AI_ADAPTER_TYPES.GEMINI)).toBe(true)
    for (const adapter of [
      AI_ADAPTER_TYPES.OPENAI,
      AI_ADAPTER_TYPES.ANTHROPIC,
      AI_ADAPTER_TYPES.DEEPSEEK,
      AI_ADAPTER_TYPES.XAI,
    ])
      expect(picturesRideInToolResult(adapter)).toBe(false)
  })

  /* ── 看片（看图期第二段）──────────────────────────────────────────── */

  it('⭐ 别家（帧档）看一段没被指着的片子：只回一句请创作者 @ 它，⛔ 不下、不猜、不记失败', async () => {
    const take = clip('take')
    const { events, outcome } = await run(
      executeV3Look(context(), {
        targets: [],
        clips: [take],
        notes: [],
        question: 'does it move?',
      }),
    )
    expect(fetchAsBuffer).not.toHaveBeenCalled()
    expect(events).toEqual([])
    expect(outcome).toMatchObject({ kind: 'result', error: false })
    expect(outcome).not.toHaveProperty('clips')
    expect(outcome).not.toHaveProperty('failureKey')
    expect((outcome as { output: string }).output).toContain(
      '「take」 is a clip you were not shown: you only watch clips the creator points at. Ask them to @ the clip in their message. Do not describe it from its prompt or its name.',
    )
  })

  it('⭐ Gemini（native 档）看一段没被指着的片子：在内联上限内交片子本体，只附给下一次', async () => {
    const take = clip('take')
    const { events, outcome } = await run(
      executeV3Look(context({ clipTier: ASSISTANT_VIDEO_TIERS.native }), {
        targets: [],
        clips: [take],
        notes: [],
        question: 'does it move?',
      }),
    )
    expect(fetchAsBuffer).toHaveBeenCalledWith(
      take.url,
      expect.objectContaining({
        maxBytes: ASSISTANT_V3_CLIP_LIMITS.inlineMaxBytes,
      }),
    )
    expect(outcome).toMatchObject({
      kind: 'result',
      error: false,
      clips: [take],
    })
    expect((outcome as { output: string }).output).toContain(
      'The clip itself comes with this result, for your next step only: 「take」.',
    )
    expect(events[0]).toMatchObject({
      step: { status: 'done', result: { digest: 'take' } },
    })
  })

  it('Gemini 片子太大：如实说，请创作者 @ 它（@ 了浏览器会抽帧）', async () => {
    const big = clip('big', ASSISTANT_V3_CLIP_LIMITS.inlineMaxBytes + 1)
    const { outcome } = await run(
      executeV3Look(context({ clipTier: ASSISTANT_VIDEO_TIERS.native }), {
        targets: [],
        clips: [big],
        notes: [],
        question: '',
      }),
    )
    expect(outcome).toMatchObject({ kind: 'result', error: false })
    expect(outcome).not.toHaveProperty('clips')
    expect((outcome as { output: string }).output).toContain(
      '「big」 is too large to watch directly (over 20 MB). Ask the creator to @ the clip',
    )
  })

  it('被指着的片子已经在眼前：只指给模型看，⛔ 不再下第二遍', async () => {
    const take = clip('take')
    const { outcome } = await run(
      executeV3Look(
        context({
          clipTier: ASSISTANT_VIDEO_TIERS.native,
          transcript: [
            { type: 'board', text: 'BOARD', images: [], clips: [take] },
          ],
        }),
        { targets: [], clips: [take], notes: [], question: 'ok?' },
      ),
    )
    expect(fetchAsBuffer).not.toHaveBeenCalled()
    expect(outcome).not.toHaveProperty('clips')
    expect((outcome as { output: string }).output).toContain(
      "Already in front of you in the creator's message: 「take」 (clip 1 of CLIPS THE CREATOR POINTED AT).",
    )
  })

  it('⛔ 不借别家：所选模型看不了图，片子一段也不看', async () => {
    const { events, outcome } = await run(
      executeV3Look(context({ seesImages: false, clipTier: false }), {
        targets: [],
        clips: [clip('take')],
        notes: [],
        question: '',
      }),
    )
    expect(events).toEqual([])
    expect(fetchAsBuffer).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ failureKey: 'look:noVision' })
  })

  it('look 附上的片子只跟在下一次调用里，作为文件交给模型', async () => {
    const take = clip('take')
    const transcript: AssistantV3Transcript = [
      { type: 'board', text: 'BOARD', images: [] },
      {
        type: 'assistant',
        text: '',
        calls: [{ id: 'call_1', tool: 'look', input: '{}' }],
      },
      {
        type: 'result',
        id: 'call_1',
        tool: 'look',
        output: 'watched',
        error: false,
        clips: [take],
      },
    ]
    const fresh = await loadFreshLooks(
      context({
        transcript,
        pictures: createPictureCache(AI_ADAPTER_TYPES.GEMINI),
        clipTier: ASSISTANT_VIDEO_TIERS.native,
      }),
    )
    const look = fresh.get('call_1')!
    expect(look.header).toBe('')
    expect(look.pictures).toEqual([])
    expect(lookClipParts(look)).toEqual([
      {
        type: 'text',
        text: 'CLIPS FROM YOUR look (in order): 1 = clip 「take」 (the clip itself)',
      },
      { type: 'text', text: 'clip 「take」:' },
      expect.objectContaining({ type: 'file', mediaType: 'video/mp4' }),
    ])
    expect(lookUserParts(look)).toEqual(lookClipParts(look))
  })

  /* ── 视频台上只是挂着的参考视频：look 它才看（owner 2026-10-15「挂着不等于每轮都看」）── */

  /** 浏览器随请求带来的一段挂着的片子（3 秒 → 3 帧），帧里写着地址与序号。 */
  function carried(url: string, label: string) {
    return {
      sourceUrl: url,
      label,
      mounted: true as const,
      durationSeconds: 3,
      frames: [0.5, 1.5, 2.5].map((timestampSeconds, index) => ({
        index,
        timestampSeconds,
        dataUrl: `data:image/webp;base64,${Buffer.from(
          `webp:${url}#${index}`,
        ).toString('base64')}`,
      })),
    }
  }

  it('⭐ 别家 look 一段挂着的片子：带来的帧摆上去，只给下一步，⛔ 不下片子本体', async () => {
    const mountedUrl = 'https://cdn.test/ref.mp4'
    const withFrames = context({
      request: {
        messages: [],
        videoClips: [carried(mountedUrl, 'video-1')],
      } as unknown as V3Context['request'],
    })
    const { events, outcome } = await run(
      executeV3Look(withFrames, {
        targets: [],
        clips: [{ url: mountedUrl, label: 'video-1' }],
        notes: [],
        question: 'how fast does she turn?',
      }),
    )
    expect(fetchAsBuffer).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({
      kind: 'result',
      error: false,
      clips: [{ url: mountedUrl, label: 'video-1' }],
    })
    expect((outcome as { output: string }).output).toContain(
      'Frames sampled from 「video-1」 (3 frames sampled across 3 s) come with this result, for your next step only.',
    )
    expect(events[0]).toMatchObject({
      step: { status: 'done', result: { digest: 'video-1' } },
    })

    const transcript: AssistantV3Transcript = [
      { type: 'board', text: 'BOARD', images: [] },
      {
        type: 'assistant',
        text: '',
        calls: [{ id: 'call_1', tool: 'look', input: '{}' }],
      },
      {
        type: 'result',
        id: 'call_1',
        tool: 'look',
        output: (outcome as { output: string }).output,
        error: false,
        clips: [{ url: mountedUrl, label: 'video-1' }],
      },
    ]
    const fresh = await loadFreshLooks({ ...withFrames, transcript })
    const parts = lookUserParts(fresh.get('call_1')!)
    expect(parts[0]).toEqual({
      type: 'text',
      text: 'CLIPS FROM YOUR look (in order): 1 = clip 「video-1」 (3 frames sampled across 3 s)',
    })
    expect(parts).toContainEqual({
      type: 'text',
      text: 'clip 「video-1」 · frame 2/3 at 1.5 s',
    })
    expect(parts.filter((part) => part.type === 'image')).toHaveLength(3)

    // 模型一开口（新的 assistant 条目）就不再附。
    const later = await loadFreshLooks({
      ...withFrames,
      transcript: [
        ...transcript,
        { type: 'assistant', text: '很快。', calls: [] },
      ],
    })
    expect(later.size).toBe(0)
  })

  it('Gemini look 一段挂着的片子：先给片子本体；太大才用带来的帧', async () => {
    const mountedUrl = 'https://cdn.test/ref.mp4'
    clipsServed.set(mountedUrl, ASSISTANT_V3_CLIP_LIMITS.inlineMaxBytes + 1)
    const { outcome } = await run(
      executeV3Look(
        context({
          clipTier: ASSISTANT_VIDEO_TIERS.native,
          request: {
            messages: [],
            videoClips: [carried(mountedUrl, 'video-1')],
          } as unknown as V3Context['request'],
        }),
        {
          targets: [],
          clips: [{ url: mountedUrl, label: 'video-1' }],
          notes: [],
          question: '',
        },
      ),
    )
    expect(fetchAsBuffer).toHaveBeenCalledWith(mountedUrl, expect.anything())
    expect((outcome as { output: string }).output).toContain(
      'Frames sampled from 「video-1」 (3 frames sampled across 3 s)',
    )
  })
})
