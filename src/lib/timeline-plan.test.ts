/**
 * 一句话排片的算术（S10）。
 *
 * ⚠ 这里钉的是**每一个数字**：顺序、中段、叠化扣时、语音对齐、配乐淡出。
 * 「导出来和提案卡上写的不一样」这类问题必须能在这一个文件里复现。
 */

import { describe, expect, it } from 'vitest'

import {
  EDIT_TRANSITION_IDS,
  TIMELINE_PLAN_MUSIC_TAIL_GAIN,
  TIMELINE_PLAN_ORDER_IDS,
  TIMELINE_PLAN_TAKE_IDS,
} from '@/constants/edit-desk'
import { RENDER_CROSSFADE_SEC } from '@/constants/render-video'
import {
  buildTimelineProposal,
  collectTimelinePlanFacts,
  takeWindow,
  timelineDurationSec,
  type TimelinePlanFacts,
} from '@/lib/timeline-plan'
import { TimelinePlanIntentSchema } from '@/types/edit-desk-plan'
import type { NodeV4 } from '@/types/node-workflow'

const NOW = '2026-09-10T00:00:00.000Z'

function mint() {
  let n = 0
  return (prefix: string) => `${prefix}_${(n += 1)}`
}

function videoNode(id: string, shotNo: number, durationSec: number): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'shot',
      name: id,
      label: id,
      status: 'idle',
      createdAt: NOW,
      shotNo,
      url: `https://example.test/${id}.mp4`,
      durationSec,
    },
  } as NodeV4
}

function audioNode(id: string, durationSec: number): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'audio',
      subtype: 'voice',
      name: id,
      status: 'idle',
      createdAt: NOW,
      url: `https://example.test/${id}.mp3`,
      durationSec,
    },
  } as NodeV4
}

function textNode(id: string, shotNo: number, body: string): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'text',
      subtype: 'script',
      name: id,
      status: 'idle',
      createdAt: NOW,
      shotNo,
      body,
    },
  } as NodeV4
}

const baseIntent = TimelinePlanIntentSchema.parse({
  order: TIMELINE_PLAN_ORDER_IDS.shot,
  take: TIMELINE_PLAN_TAKE_IDS.middle,
  takeSeconds: 5,
  transition: EDIT_TRANSITION_IDS.crossfade,
  summary: '按镜号拼，每段取中间 5 秒，叠化。',
})

describe('takeWindow · 取哪一截', () => {
  it('middle = 中点 ± n/2', () => {
    expect(takeWindow(7, TIMELINE_PLAN_TAKE_IDS.middle, 5)).toEqual({
      in: 1,
      out: 6,
    })
  })

  it('head / tail 各贴一头', () => {
    expect(takeWindow(7, TIMELINE_PLAN_TAKE_IDS.head, 5)).toEqual({
      in: 0,
      out: 5,
    })
    expect(takeWindow(7, TIMELINE_PLAN_TAKE_IDS.tail, 5)).toEqual({
      in: 2,
      out: 7,
    })
  })

  it('想取的比素材还长时取整段（⛔ 不把出点推到素材之外）', () => {
    expect(takeWindow(3, TIMELINE_PLAN_TAKE_IDS.middle, 5)).toEqual({
      in: 0,
      out: 3,
    })
    expect(takeWindow(3, TIMELINE_PLAN_TAKE_IDS.full, 5)).toEqual({
      in: 0,
      out: 3,
    })
  })
})

describe('collectTimelinePlanFacts', () => {
  it('只收有产物的视频 / 音频卡，剧本原样保序', () => {
    const nodes = [
      textNode('t2', 2, '第二行'),
      textNode('t1', 1, '第一行'),
      videoNode('v2', 2, 7),
      videoNode('v1', 1, 7),
      audioNode('a1', 12),
      {
        ...videoNode('v3', 3, 7),
        data: { ...videoNode('v3', 3, 7).data, url: undefined },
      } as NodeV4,
    ]
    const facts = collectTimelinePlanFacts(nodes)
    expect(facts.assets.map((asset) => asset.id)).toEqual(['v2', 'v1', 'a1'])
    expect(facts.script.map((line) => line.nodeId)).toEqual(['t2', 't1'])
  })
})

describe('buildTimelineProposal', () => {
  const facts: TimelinePlanFacts = collectTimelinePlanFacts([
    textNode('t1', 1, '第一行'),
    textNode('t2', 2, '第二行'),
    videoNode('v2', 2, 7),
    videoNode('v1', 1, 7),
    audioNode('a_voice', 12),
    audioNode('a_music', 60),
  ])

  it('按镜号排 + 每段取中间 5 秒 + 段尾叠化（最后一段不接）', () => {
    const proposal = buildTimelineProposal(baseIntent, facts, {
      mintId: mint(),
      defaultName: 'cut',
    })
    expect(proposal).not.toBeNull()
    const clips = proposal!.project.tracks.video
    expect(clips.map((clip) => clip.sourceNodeId)).toEqual(['v1', 'v2'])
    expect(clips.map((clip) => [clip.in, clip.out])).toEqual([
      [1, 6],
      [1, 6],
    ])
    expect(clips[0]?.transitionOut).toBe(EDIT_TRANSITION_IDS.crossfade)
    expect(clips[1]?.transitionOut).toBeUndefined()
    expect(proposal!.cost).toBe('free')
    expect(proposal!.counts.clipsChanged).toBe(2)
    expect(proposal!.counts.tracksAdded).toBe(0)
  })

  it('叠化扣时：两段各 5s，叠一次 → 成片 5+5-0.5', () => {
    const proposal = buildTimelineProposal(baseIntent, facts, {
      mintId: mint(),
      defaultName: 'cut',
    })
    expect(timelineDurationSec(proposal!.project.tracks.video)).toBeCloseTo(
      10 - RENDER_CROSSFADE_SEC,
      5,
    )
  })

  it('按剧本顺序：剧本行的先后压过镜号大小', () => {
    const scriptFirstSecond = collectTimelinePlanFacts([
      textNode('t2', 2, '先说第二镜'),
      textNode('t1', 1, '再说第一镜'),
      videoNode('v1', 1, 7),
      videoNode('v2', 2, 7),
    ])
    const proposal = buildTimelineProposal(
      { ...baseIntent, order: TIMELINE_PLAN_ORDER_IDS.script },
      scriptFirstSecond,
      { mintId: mint(), defaultName: 'cut' },
    )
    expect(proposal!.project.tracks.video.map((c) => c.sourceNodeId)).toEqual([
      'v2',
      'v1',
    ])
  })

  it('点名的顺序（asIs）原样用，陌生 id 丢掉', () => {
    const proposal = buildTimelineProposal(
      {
        ...baseIntent,
        order: TIMELINE_PLAN_ORDER_IDS.asIs,
        videoNodeIds: ['v2', 'ghost_id', 'v1'],
      },
      facts,
      { mintId: mint(), defaultName: 'cut' },
    )
    expect(proposal!.project.tracks.video.map((c) => c.sourceNodeId)).toEqual([
      'v2',
      'v1',
    ])
  })

  it('语音对齐第 2 段：前面垫一段静音，长度 = 第 1 段在成片里的长度', () => {
    const proposal = buildTimelineProposal(
      { ...baseIntent, voice: { nodeId: 'a_voice', alignToIndex: 1 } },
      facts,
      { mintId: mint(), defaultName: 'cut' },
    )
    const audio = proposal!.project.tracks.audio
    expect(audio).toHaveLength(2)
    // 第 1 段 5s，段尾叠化扣 0.5s。
    expect(audio[0]?.out).toBeCloseTo(5 - RENDER_CROSSFADE_SEC, 5)
    expect(audio[0]?.gain).toBe(0)
    expect(audio[0]?.muted).toBe(true)
    expect(audio[1]?.out).toBe(12)
    expect(proposal!.counts.tracksAdded).toBe(1)
  })

  it('语音对齐第 1 段（0）时不垫静音', () => {
    const proposal = buildTimelineProposal(
      { ...baseIntent, voice: { nodeId: 'a_voice', alignToIndex: 0 } },
      facts,
      { mintId: mint(), defaultName: 'cut' },
    )
    expect(proposal!.project.tracks.audio).toHaveLength(1)
  })

  it('配乐裁到与画面同长，尾部 2s 降响度', () => {
    const proposal = buildTimelineProposal(
      { ...baseIntent, music: { nodeId: 'a_music', fadeOutSec: 2 } },
      facts,
      { mintId: mint(), defaultName: 'cut' },
    )
    const music = proposal!.project.tracks.music
    const total = 10 - RENDER_CROSSFADE_SEC
    expect(music).toHaveLength(2)
    expect(music[0]?.in).toBe(0)
    expect(music[0]?.out).toBeCloseTo(total - 2, 5)
    expect(music[1]?.out).toBeCloseTo(total, 5)
    expect(music[1]?.gain).toBe(TIMELINE_PLAN_MUSIC_TAIL_GAIN)
  })

  it('一段视频都摆不出来时返回 null（⛔ 不出一份空提案）', () => {
    const onlyAudio = collectTimelinePlanFacts([audioNode('a1', 3)])
    expect(
      buildTimelineProposal(baseIntent, onlyAudio, {
        mintId: mint(),
        defaultName: 'cut',
      }),
    ).toBeNull()
  })

  it('逐段理由按节点 id 回填', () => {
    const proposal = buildTimelineProposal(
      { ...baseIntent, reasons: [{ nodeId: 'v1', reason: '前一秒在抖' }] },
      facts,
      { mintId: mint(), defaultName: 'cut' },
    )
    expect(proposal!.rationale[0]?.reason).toBe('前一秒在抖')
    expect(proposal!.rationale[1]?.reason).toBeUndefined()
    expect(proposal!.rationale[0]?.sourceDurationSec).toBe(7)
  })
})

describe('TimelinePlanIntentSchema · 解析失败可见', () => {
  it('缺 summary / 陌生枚举一律不通过', () => {
    expect(
      TimelinePlanIntentSchema.safeParse({
        order: 'script',
        take: 'middle',
        transition: 'crossfade',
      }).success,
    ).toBe(false)
    expect(
      TimelinePlanIntentSchema.safeParse({
        order: 'vibes',
        take: 'middle',
        transition: 'crossfade',
        summary: 'x',
      }).success,
    ).toBe(false)
  })

  it('最小合法输入拿到默认值', () => {
    const parsed = TimelinePlanIntentSchema.parse({
      order: 'shot',
      take: 'full',
      transition: 'none',
      summary: '整段拼上',
    })
    expect(parsed.videoNodeIds).toEqual([])
    expect(parsed.reasons).toEqual([])
  })
})
