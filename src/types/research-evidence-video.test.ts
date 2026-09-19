import { describe, expect, it } from 'vitest'

import { EvidenceItemSchema } from '@/types/research'
import { RESEARCH_LIMITS } from '@/constants/research'

/**
 * **视频证据的正反例**（56b 切片 1「四种资料」的第四种）。
 *
 * 钉三件事：
 *  ① 四种 `kind` 都过得了同一个判别联合（`video` 不是「带时长的图片」）；
 *  ② `videoUrl` / `site` 是必填 —— 一条点不开的「视频」在界面上就是一颗按下去
 *     没反应的播放钮；
 *  ③ 时长有天花板：上游偶尔把毫秒当秒给，而封面角标上会渲染成一个荒谬的数字。
 */

const BASE = {
  id: 'bilibili:view:BV1',
  sourceId: 'bilibili',
  sourceTier: 'social',
  retrievedAt: '2026-09-19T00:00:00.000Z',
  title: 'bilibili · 三层光叠法拆解',
  url: 'https://www.bilibili.com/video/BV1',
} as const

describe('EvidenceVideoItemSchema', () => {
  it('⭐ 封面 / 时长 / 站名 / 元数据摘录齐了就过', () => {
    const parsed = EvidenceItemSchema.safeParse({
      ...BASE,
      kind: 'video',
      videoUrl: 'https://www.bilibili.com/video/BV1',
      thumbnailUrl: 'https://i2.hdslb.com/cover.jpg',
      durationSeconds: 760,
      site: 'bilibili',
      excerpt: '标题：三层光叠法拆解 · UP主：某某',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.kind).toBe('video')
  })

  it('封面与时长可以缺席 —— 网搜回来的播放页给不出这两样', () => {
    expect(
      EvidenceItemSchema.safeParse({
        ...BASE,
        kind: 'video',
        videoUrl: 'https://www.youtube.com/watch?v=x',
        site: 'YouTube',
      }).success,
    ).toBe(true)
  })

  it('⛔ 没有 videoUrl / site 不给过', () => {
    expect(
      EvidenceItemSchema.safeParse({ ...BASE, kind: 'video', site: 'bilibili' })
        .success,
    ).toBe(false)
    expect(
      EvidenceItemSchema.safeParse({
        ...BASE,
        kind: 'video',
        videoUrl: 'https://x/1',
      }).success,
    ).toBe(false)
  })

  it('⛔ 时长为 0 / 超过 24 小时不给过（上游把毫秒当秒给的那一档）', () => {
    for (const durationSeconds of [
      0,
      -1,
      RESEARCH_LIMITS.maxVideoDurationSeconds + 1,
    ]) {
      expect(
        EvidenceItemSchema.safeParse({
          ...BASE,
          kind: 'video',
          videoUrl: 'https://x/1',
          site: 'bilibili',
          durationSeconds,
        }).success,
      ).toBe(false)
    }
  })

  it('图片那一档一个字没改 —— 新增第四支不动前三支', () => {
    expect(
      EvidenceItemSchema.safeParse({
        ...BASE,
        kind: 'image',
        imageUrl: 'https://cdn.test/1.png',
      }).success,
    ).toBe(true)
  })
})
