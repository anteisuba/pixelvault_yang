import { describe, expect, it } from 'vitest'

import { NODE_SLOT_IDS } from '@/constants/node-slots'

import {
  nextPromptDraft,
  remapVideoRailMentions,
  sameVideoRailOrder,
  VIDEO_RAIL_GROUP_IDS,
  type VideoRailEntry,
  type VideoRailGroupId,
} from './video-node-rail'

function entry(
  group: VideoRailGroupId,
  index: number,
  sourceNodeId: string,
): VideoRailEntry {
  return {
    group,
    index,
    slot:
      group === VIDEO_RAIL_GROUP_IDS.voice
        ? NODE_SLOT_IDS.voice
        : NODE_SLOT_IDS.reference,
    edgeId: `e-${sourceNodeId}`,
    sourceNodeId,
    sourceName: sourceNodeId,
  }
}

const image = VIDEO_RAIL_GROUP_IDS.image
const video = VIDEO_RAIL_GROUP_IDS.video

describe('remapVideoRailMentions', () => {
  const before = [
    entry(image, 1, 'a'),
    entry(image, 2, 'b'),
    entry(image, 3, 'c'),
  ]

  it('拿掉一项：它的号删掉（连同尾随空格），后面的前移', () => {
    const after = [entry(image, 1, 'a'), entry(image, 2, 'c')]
    expect(remapVideoRailMentions('@图2 和 @图3', before, after)).toBe(
      '和 @图2',
    )
  })

  it('前缀原样保留（三语与大小写）', () => {
    const after = [
      entry(image, 1, 'c'),
      entry(image, 2, 'a'),
      entry(image, 3, 'b'),
    ]
    expect(
      remapVideoRailMentions('@image1 / @画像3 / @Image2', before, after),
    ).toBe('@image2 / @画像1 / @Image3')
  })

  it('@图12 不是 @图1；轨上没有的号原样不动', () => {
    const after = [entry(image, 1, 'b'), entry(image, 2, 'c')]
    expect(remapVideoRailMentions('@图12 与 @图9', before, after)).toBe(
      '@图12 与 @图9',
    )
  })

  it('分组各数各的：视频组的号不受图组变化影响', () => {
    const withVideo = [...before, entry(video, 1, 'v')]
    const after = [
      entry(image, 1, 'b'),
      entry(image, 2, 'c'),
      entry(video, 1, 'v'),
    ]
    expect(remapVideoRailMentions('@视频1 配 @图2', withVideo, after)).toBe(
      '@视频1 配 @图1',
    )
  })

  it('同一张在组里出现两次：按出现次序各自对', () => {
    const twice = [entry(image, 1, 'a'), entry(image, 2, 'a')]
    const after = [
      entry(image, 1, 'x'),
      entry(image, 2, 'a'),
      entry(image, 3, 'a'),
    ]
    expect(remapVideoRailMentions('@图1 @图2', twice, after)).toBe('@图2 @图3')
  })

  it('没有 @ 或没有变化：返回同一个串', () => {
    const text = '没有引用'
    expect(remapVideoRailMentions(text, before, [])).toBe(text)
    expect(remapVideoRailMentions('@图1', before, before)).toBe('@图1')
  })
})

describe('sameVideoRailOrder', () => {
  it('只看「是哪一张、按什么顺序」，⛔ 不看缩略图', () => {
    const a = [entry(image, 1, 'a'), entry(image, 2, 'b')]
    const withThumb = a.map((item) => ({ ...item, thumbnailUrl: 'x' }))
    expect(sameVideoRailOrder(a, withThumb)).toBe(true)
    expect(sameVideoRailOrder(a, [...a].reverse())).toBe(false)
  })
})

describe('nextPromptDraft（提示词栏里还没发出去的草稿）', () => {
  const railBefore = [
    entry(image, 1, 'a'),
    entry(image, 2, 'b'),
    entry(image, 3, 'c'),
  ]
  const railAfter = [entry(image, 1, 'a'), entry(image, 2, 'c')]

  it('助手写了新词（轨没变）：草稿整段跟上', () => {
    expect(
      nextPromptDraft({
        draft: '我正在打的',
        syncedPrompt: '旧词',
        currentPrompt: '助手写的新词',
        syncedRail: railBefore,
        rail: railBefore,
      }),
    ).toBe('助手写的新词')
  })

  it('轨变了、已保存正文只是被对了号：⛔ 不盖掉没发出去的字，只给草稿对号', () => {
    expect(
      nextPromptDraft({
        draft: '@图3 的外套，再加一顶帽子',
        syncedPrompt: '@图3 的外套',
        currentPrompt: '@图2 的外套',
        syncedRail: railBefore,
        rail: railAfter,
      }),
    ).toBe('@图2 的外套，再加一顶帽子')
  })

  it('只有轨变了（已保存正文里没有号）：草稿对号', () => {
    expect(
      nextPromptDraft({
        draft: '@图2 在左，@图3 在右',
        syncedPrompt: '',
        currentPrompt: '',
        syncedRail: railBefore,
        rail: railAfter,
      }),
    ).toBe('在左，@图2 在右')
  })

  it('轨变了但已保存正文是别的来源改的：照旧整段跟上', () => {
    expect(
      nextPromptDraft({
        draft: '我正在打的',
        syncedPrompt: '@图3 的外套',
        currentPrompt: '助手按新轨写的 @图2',
        syncedRail: railBefore,
        rail: railAfter,
      }),
    ).toBe('助手按新轨写的 @图2')
  })

  it('第一次同步（没有之前的轨）：草稿不动', () => {
    expect(
      nextPromptDraft({
        draft: '@图1',
        syncedPrompt: '@图1',
        currentPrompt: '@图1',
        syncedRail: null,
        rail: railAfter,
      }),
    ).toBe('@图1')
  })
})
