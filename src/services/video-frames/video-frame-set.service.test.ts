import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VIDEO_FRAME_PLAN } from '@/constants/video-analysis'
import { RESEARCH_SOURCE_IDS } from '@/constants/research'
import { planVideoFrames } from '@/lib/video-frame-plan'

const mockUploadToR2 = vi.fn()
const mockDetectTrustedImageMime = vi.fn()

vi.mock('@/services/storage/r2', () => ({
  uploadToR2: (params: unknown) => mockUploadToR2(params),
  detectTrustedImageMime: (buffer: Buffer) =>
    mockDetectTrustedImageMime(buffer),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { buildVideoFrameEvidence, describeVideoFrameSet, persistVideoFrameSet } =
  await import('@/services/video-frames/video-frame-set.service')

const DURATION = 80
const VIDEO_URL = 'https://cdn.example.com/clips/shot-01.mp4'
// 1×1 webp（真的能过 sharp 的那种在这里不需要 —— detectTrustedImageMime 已被 mock）。
const FRAME_DATA_URL = `data:image/webp;base64,${Buffer.from('frame-bytes').toString('base64')}`

function onPlanFrames() {
  return planVideoFrames(DURATION).entries.map((entry) => ({
    index: entry.index,
    timestampSeconds: entry.timestampSeconds,
    dataUrl: FRAME_DATA_URL,
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDetectTrustedImageMime.mockResolvedValue({
    format: 'webp',
    mimeType: 'image/webp',
    width: 640,
    height: 360,
  })
  mockUploadToR2.mockImplementation(({ key }: { key: string }) =>
    Promise.resolve(`https://cdn.example.com/${key}`),
  )
})

describe('persistVideoFrameSet', () => {
  it('按计划抽的帧集：逐帧转存 R2，参数原样带出来', async () => {
    const frameSet = await persistVideoFrameSet({
      userId: 'user-1',
      sourceVideoUrl: VIDEO_URL,
      durationSeconds: DURATION,
      frames: onPlanFrames(),
    })

    expect(mockUploadToR2).toHaveBeenCalledTimes(VIDEO_FRAME_PLAN.frameCount)
    expect(frameSet.frames).toHaveLength(VIDEO_FRAME_PLAN.frameCount)
    expect(frameSet.planVersion).toBe(VIDEO_FRAME_PLAN.planVersion)
    expect(frameSet.strategy).toBe(VIDEO_FRAME_PLAN.strategy)
    expect(frameSet.sourceVideoUrl).toBe(VIDEO_URL)
    expect(frameSet.frames.map((frame) => frame.timestampSeconds)).toEqual([
      5, 15, 25, 35, 45, 55, 65, 75,
    ])
    // 一次抽帧 = 一个目录，组内按序号命名（回看时整组取得到）。
    const keys = mockUploadToR2.mock.calls.map(
      (call) => (call[0] as { key: string }).key,
    )
    expect(keys[0]).toMatch(
      /^vision-frames\/user-1\/[0-9a-f]{16}\/frame-01\.webp$/,
    )
    expect(new Set(keys).size).toBe(VIDEO_FRAME_PLAN.frameCount)
  })

  it('⭐ 时间戳偏离计划 → VIDEO_FRAMES_INVALID，且一帧都不上传', async () => {
    const frames = onPlanFrames()
    frames[4] = { ...frames[4], timestampSeconds: 1 }

    await expect(
      persistVideoFrameSet({
        userId: 'user-1',
        sourceVideoUrl: VIDEO_URL,
        durationSeconds: DURATION,
        frames,
      }),
    ).rejects.toMatchObject({ errorCode: 'VIDEO_FRAMES_INVALID' })
    expect(mockUploadToR2).not.toHaveBeenCalled()
  })

  it('帧数对不上 → 打回（缺一帧的帧集复跑不出同一组结论）', async () => {
    await expect(
      persistVideoFrameSet({
        userId: 'user-1',
        sourceVideoUrl: VIDEO_URL,
        durationSeconds: DURATION,
        frames: onPlanFrames().slice(0, 5),
      }),
    ).rejects.toMatchObject({ errorCode: 'VIDEO_FRAMES_INVALID' })
  })

  it('片长算不出计划 → 打回，不去猜一个长度', async () => {
    await expect(
      persistVideoFrameSet({
        userId: 'user-1',
        sourceVideoUrl: VIDEO_URL,
        durationSeconds: 0,
        frames: onPlanFrames(),
      }),
    ).rejects.toMatchObject({ errorCode: 'VIDEO_FRAMES_INVALID' })
  })

  it('不是 base64 data URL / 超体量 → 打回', async () => {
    const frames = onPlanFrames()
    frames[0] = { ...frames[0], dataUrl: 'https://cdn.example.com/frame.png' }
    await expect(
      persistVideoFrameSet({
        userId: 'user-1',
        sourceVideoUrl: VIDEO_URL,
        durationSeconds: DURATION,
        frames,
      }),
    ).rejects.toMatchObject({ errorCode: 'VIDEO_FRAMES_INVALID' })
  })

  it('按魔数验真 —— data URL 头里写什么不算数', async () => {
    mockDetectTrustedImageMime.mockRejectedValueOnce(
      new Error('Unsupported or corrupted image file'),
    )
    await expect(
      persistVideoFrameSet({
        userId: 'user-1',
        sourceVideoUrl: VIDEO_URL,
        durationSeconds: DURATION,
        frames: onPlanFrames(),
      }),
    ).rejects.toThrow(/Unsupported or corrupted image file/)
  })
})

describe('帧集 → ResearchRun 证据', () => {
  it('kind:image / sourceId:vision_input，标题带序号+时间戳，url 指回来源视频', async () => {
    const frameSet = await persistVideoFrameSet({
      userId: 'user-1',
      sourceVideoUrl: VIDEO_URL,
      durationSeconds: DURATION,
      frames: onPlanFrames(),
    })
    const evidence = buildVideoFrameEvidence(frameSet)

    expect(evidence).toHaveLength(VIDEO_FRAME_PLAN.frameCount)
    expect(evidence[2]).toMatchObject({
      id: 'video-frame-3',
      kind: 'image',
      sourceId: RESEARCH_SOURCE_IDS.visionInput,
      title: 'Frame 3/8 @ 0:25',
      // 点开引用要回到视频本身，不是回到那张裁下来的图。
      url: VIDEO_URL,
      width: 640,
      height: 360,
    })
    expect(evidence[2]).toHaveProperty(
      'imageUrl',
      expect.stringContaining('frame-03.webp'),
    )
    for (const item of evidence) {
      expect(() => new Date(item.retrievedAt).toISOString()).not.toThrow()
    }
  })

  it('query 摘要含复跑所需的全部参数（版本/策略/帧数/片长/时间戳/来源）', async () => {
    const frameSet = await persistVideoFrameSet({
      userId: 'user-1',
      sourceVideoUrl: VIDEO_URL,
      durationSeconds: DURATION,
      frames: onPlanFrames(),
    })
    const note = describeVideoFrameSet(frameSet)

    expect(note).toContain(`frames v${VIDEO_FRAME_PLAN.planVersion}`)
    expect(note).toContain(VIDEO_FRAME_PLAN.strategy)
    expect(note).toContain('8f')
    expect(note).toContain('80s')
    expect(note).toContain('t=[5.00,15.00,25.00,35.00,45.00,55.00,65.00,75.00]')
    expect(note).toContain(VIDEO_URL)
  })
})
