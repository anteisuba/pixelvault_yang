/**
 * 槽架的两条硬纪律（契约 `references/pages/canvas-slot-rack.md` §4.2 / §4.4）：
 *
 * 1. **分类区从容量契约派生**，不是手写数组 —— 改 `slotLimits` 里的数字，UI 必须
 *    跟着变。本轮原型逐格手写分类，四处漏掉视频区（其中一处是详情面板档，正好
 *    戳穿「两档同一份名单」的论点）。
 * 2. **折缩略图，不折账** —— 折起时摘要行仍要读得到「有多少、满没满」。
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ComposerReferenceToken } from '@/hooks/node/use-video-composer'
import type { VideoSendSlotLimits } from '@/lib/node-video-send-slots'

import { CanvasSlotRack } from './CanvasSlotRack'

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

function token(
  id: string,
  kind: ComposerReferenceToken['kind'],
): ComposerReferenceToken {
  return {
    id,
    kind,
    label: `${kind}-${id}`,
    token: `@${id}`,
    mediaUrl: `https://cdn/${id}.png`,
  } as ComposerReferenceToken
}

/** 火山全能参考的真实形状：图 9 + 音 3 + 视频 3，跨模态总额 12。 */
const FULL: VideoSendSlotLimits = {
  images: 9,
  videos: 3,
  audio: 3,
  imagesLimitedByTotal: false,
}

describe('CanvasSlotRack · 分类区从容量契约派生（§4.4）', () => {
  it('三个区都有位时，摘要行与分类行都出现三个', () => {
    render(
      <CanvasSlotRack tokens={[]} slotLimits={FULL} defaultExpanded={true} />,
    )
    for (const zone of ['images', 'audio', 'videos']) {
      expect(screen.getByText(`zoneLabel.${zone}`)).toBeInTheDocument()
    }
  })

  it('⚠ 回归：视频区不得被漏掉 —— 契约给了 3 个视频位就必须有视频区', () => {
    render(
      <CanvasSlotRack
        tokens={[token('v1', 'video')]}
        slotLimits={FULL}
        defaultExpanded={true}
      />,
    )
    expect(screen.getByText('zoneLabel.videos')).toBeInTheDocument()
    expect(
      screen.getByText('zoneCount:{"held":1,"limit":3}'),
    ).toBeInTheDocument()
  })

  it('契约把某区降到 0（该模式不吃这个模态）→ 该区整个不渲染', () => {
    // 多图参考档：slots.videos = 0。
    render(
      <CanvasSlotRack
        tokens={[]}
        slotLimits={{ ...FULL, videos: 0 }}
        defaultExpanded={true}
      />,
    )
    expect(screen.getByText('zoneLabel.images')).toBeInTheDocument()
    expect(screen.queryByText('zoneLabel.videos')).not.toBeInTheDocument()
  })

  it('上限跟着契约走，不是写死的数字', () => {
    // Seedance 2.5 的容量比 2.0 大一档（30/10/10），UI 必须照搬而不是钉在 9。
    render(
      <CanvasSlotRack
        tokens={[]}
        slotLimits={{
          images: 30,
          videos: 10,
          audio: 10,
          imagesLimitedByTotal: false,
        }}
        defaultExpanded={true}
      />,
    )
    expect(
      screen.getByText('zoneCount:{"held":0,"limit":30}'),
    ).toBeInTheDocument()
  })

  it('素材按 kind 落到正确的区：voice→音频、video→视频、其余五种→图片', () => {
    render(
      <CanvasSlotRack
        tokens={[
          token('c1', 'character'),
          token('b1', 'background'),
          token('s1', 'shot'),
          token('k1', 'keyframe'),
          token('cu1', 'closeup'),
          token('vo1', 'voice'),
          token('vi1', 'video'),
        ]}
        slotLimits={FULL}
        defaultExpanded={true}
      />,
    )
    // 按区定位 —— 音频与视频恰好都是 1/3，全局 getByText 会撞车。
    const countOf = (zone: string) =>
      screen.getByText(`zoneLabel.${zone}`).closest('button')?.textContent
    expect(countOf('images')).toContain('zoneCount:{"held":5,"limit":9}')
    expect(countOf('audio')).toContain('zoneCount:{"held":1,"limit":3}')
    expect(countOf('videos')).toContain('zoneCount:{"held":1,"limit":3}')
  })
})

describe('CanvasSlotRack · 折缩略图不折账（§4.2）', () => {
  const tokens = [token('c1', 'character'), token('vo1', 'voice')]

  it('折起时摘要行仍读得到账', () => {
    render(
      <CanvasSlotRack
        tokens={tokens}
        slotLimits={FULL}
        defaultExpanded={false}
      />,
    )
    // 分类行与缩略图都不在，但总额还在。
    expect(screen.queryByText('zoneLabel.images')).not.toBeInTheDocument()
    expect(screen.getByText('total:{"held":2,"total":15}')).toBeInTheDocument()
  })

  it('展开一级出分类，再展开出缩略图', () => {
    render(
      <CanvasSlotRack
        tokens={tokens}
        slotLimits={FULL}
        defaultExpanded={false}
      />,
    )
    expect(screen.queryByTitle('character-c1')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    const imageZone = screen.getByText('zoneLabel.images').closest('button')!
    expect(imageZone).toHaveAttribute('aria-expanded', 'false')
    // 缩略图还没出来，但这一级已经读得到 n/max。
    expect(
      screen.getByText('zoneCount:{"held":1,"limit":9}'),
    ).toBeInTheDocument()

    fireEvent.click(imageZone)
    expect(screen.getByTitle('character-c1')).toBeInTheDocument()
  })
})

describe('CanvasSlotRack · 两档密度 = 两个默认折叠深度（§4.3）', () => {
  const tokens = [token('c1', 'character')]

  it.each([
    [true, '完整档默认展开'],
    [false, '紧凑档默认折起'],
  ])('defaultExpanded=%s → %s', (expanded) => {
    render(
      <CanvasSlotRack
        tokens={tokens}
        slotLimits={FULL}
        defaultExpanded={expanded}
      />,
    )
    if (expanded) {
      expect(screen.getByTitle('character-c1')).toBeInTheDocument()
    } else {
      expect(screen.queryByTitle('character-c1')).not.toBeInTheDocument()
    }
  })

  it('⚠ 回归：两档的账是同一个数 —— 紧凑档不得只显示前 N 个', () => {
    // 旧的 density='card' 分支写死 slice(0, 5)，12 个素材只显示 5 个。
    const many = Array.from({ length: 12 }, (_, i) => token(`img${i}`, 'shot'))
    const compact = render(
      <CanvasSlotRack
        tokens={many}
        slotLimits={FULL}
        defaultExpanded={false}
      />,
    )
    const compactTotal = screen.getByText(/^total:/).textContent
    compact.unmount()

    render(
      <CanvasSlotRack tokens={many} slotLimits={FULL} defaultExpanded={true} />,
    )
    expect(screen.getByText(/^total:/).textContent).toBe(compactTotal)
  })
})
