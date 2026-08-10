/**
 * 槽架的两条硬纪律（契约 `references/pages/canvas-slot-rack.md` §4.2 / §4.4）：
 *
 * 1. **分类区从容量契约派生**，不是手写数组 —— 改 `slotLimits` 里的数字，UI 必须
 *    跟着变。本轮原型逐格手写分类，四处漏掉视频区（其中一处是详情面板档，正好
 *    戳穿「两档同一份名单」的论点）。
 * 2. **折缩略图，不折账** —— 折起时摘要行仍要读得到「有多少、满没满」。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

describe('CanvasSlotRack · 序号盖在图上（契约 §4.6）', () => {
  const shot = {
    id: 's1',
    kind: 'shot',
    label: '开场远景',
    token: '@开场远景',
    mediaUrl: 'https://cdn/s1.png',
  } as ComposerReferenceToken

  it('进了载荷的素材，缩略图角上标出它的位置', () => {
    render(
      <CanvasSlotRack
        tokens={[shot]}
        slotLimits={FULL}
        defaultExpanded={true}
        slotIndexByUrl={new Map([['https://cdn/s1.png', 3]])}
      />,
    )
    // ⚠ 这个 3 必须和正文胶囊「图 3」、模型收到的 `@Image3` 是同一个数 ——
    // 三处共用 `sendPreview.images[].index`，不各算各的。
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('没进载荷的素材不标序号（超出上限那几张本来就没有位置）', () => {
    render(
      <CanvasSlotRack
        tokens={[shot]}
        slotLimits={FULL}
        defaultExpanded={true}
        slotIndexByUrl={new Map()}
      />,
    )
    expect(screen.queryByText('3')).not.toBeInTheDocument()
    // 但槽位本身还在 —— 素材不因为发不出去就消失（契约 §4.7）。
    expect(screen.getByTitle('开场远景')).toBeInTheDocument()
  })
})

describe('CanvasSlotRack · 单击引用、双击定位（手势分配）', () => {
  const token = {
    id: 'c1',
    kind: 'character',
    label: '小林',
    token: '@小林',
    mediaUrl: 'https://cdn/c1.png',
  } as ComposerReferenceToken

  it('单击 = 引用到正文，不动相机', () => {
    const onInsert = vi.fn()
    const onLocate = vi.fn()
    render(
      <CanvasSlotRack
        tokens={[token]}
        slotLimits={FULL}
        defaultExpanded={true}
        onInsert={onInsert}
        onLocate={onLocate}
      />,
    )
    fireEvent.click(screen.getByTitle(/^slotHint/))
    expect(onInsert).toHaveBeenCalledWith(token)
    // ⚠ 关键：单击**不能**飞相机 —— 写提示词时被拽走视野是 2026-08-09 owner
    // 当场否掉的第一版。
    expect(onLocate).not.toHaveBeenCalled()
  })

  it('双击 = 聚焦画布节点', () => {
    const onLocate = vi.fn()
    render(
      <CanvasSlotRack
        tokens={[token]}
        slotLimits={FULL}
        defaultExpanded={true}
        onInsert={vi.fn()}
        onLocate={onLocate}
      />,
    )
    fireEvent.doubleClick(screen.getByTitle(/^slotHint/))
    expect(onLocate).toHaveBeenCalledWith('c1')
  })

  it('没有插入能力时，提示回落到纯名字（不许说一个做不到的手势）', () => {
    render(
      <CanvasSlotRack
        tokens={[token]}
        slotLimits={FULL}
        defaultExpanded={true}
        onLocate={vi.fn()}
      />,
    )
    expect(screen.getByTitle('小林')).toBeInTheDocument()
  })
})

describe('CanvasSlotRack · 未命名素材不能渲染成空白格', () => {
  it('⚠ 真机回归：label 与 token 都空时，退回族名而不是一个没字的灰块', () => {
    // 画布上「加了但还没命名」的节点是常态（旧件在抽屉里有一句「给该节点命名后
    // 即可作为标签插入」，槽架没有那个位置）。此前首字兜底 `label.slice(0, 1)`
    // 对空串取到空串，真机上就是一格无名灰块，用户看不出那是什么。
    render(
      <CanvasSlotRack
        tokens={[
          {
            id: 'unnamed1',
            kind: 'shot',
            label: '',
            token: '',
          } as ComposerReferenceToken,
        ]}
        slotLimits={FULL}
        defaultExpanded={true}
      />,
    )
    expect(screen.getByTitle('shot')).toBeInTheDocument()
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

describe('CanvasSlotRack · 结构性动效的两条纪律（阶段 6-C）', () => {
  const tokens = [token('c1', 'character')]

  it('折起走退场动画，且**最终真的收干净**（不留常驻残影）', async () => {
    /**
     * ⚠ 这条断言 2026-08-10 **反过来写过一次**。原文是「折起是瞬时的」，理由是
     * 「收起用户要的是立刻看见结果」—— owner 真机看过后拍板要对称（两头都做），
     * 所以现在有 exit。留着这段历史是因为两种做法各有硬理由，下一个人改回去
     * 之前应该知道这不是随手定的。
     *
     * 现在守的是退场的**下限**：可以慢一点，但不能永远不卸载。`AnimatePresence`
     * 接管卸载时机之后，一旦 exit 卡住（比如 key 不稳导致 presence 状态错乱），
     * 收起的那一格会永久留在 DOM 里 —— 用户点了「收起」却还看得见。
     */
    render(
      <CanvasSlotRack
        tokens={tokens}
        slotLimits={FULL}
        defaultExpanded={true}
      />,
    )
    expect(screen.getByTitle('character-c1')).toBeInTheDocument()

    // 展开态下摘要行与三个分类行都是 expanded=true，取第一个（摘要行）。
    fireEvent.click(screen.getAllByRole('button', { expanded: true })[0])
    await waitFor(() =>
      expect(screen.queryByTitle('character-c1')).not.toBeInTheDocument(),
    )
    // 账仍在（折缩略图不折账 §4.2）—— 退场只带走缩略图，不带走摘要。
    expect(screen.getByText(/^total:/)).toBeInTheDocument()
  })

  it('展开后内容立刻可读可点 —— 不能依赖动画结束才挂载', () => {
    // jsdom 里 matchMedia 默认不匹配 reduce，这条守的是**结构**：无论动效开关，
    // 展开后内容必须已经可读可点，不能依赖动画结束才挂载。
    render(
      <CanvasSlotRack
        tokens={tokens}
        slotLimits={FULL}
        defaultExpanded={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByText('zoneLabel.images').closest('button')!)
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

describe('CanvasSlotRack · 发不出去要说为什么（阶段 5）', () => {
  const unreadyVoice = {
    id: 'v1',
    kind: 'voice',
    label: '旁白',
    token: '',
    dimmed: true,
  } as ComposerReferenceToken

  it('未就绪的音色标出来并给原因 —— 不能长得和会发送的槽位一样', () => {
    // ⚠ 真机口径：一个连着但还没录/没选到音频的音色节点，此前在槽架里与正常
    // 槽位**一模一样**，用户只会以为配音会发出去。
    render(
      <CanvasSlotRack
        tokens={[unreadyVoice]}
        slotLimits={FULL}
        defaultExpanded={true}
        onInsert={vi.fn()}
      />,
    )
    expect(screen.getByTitle(/^notSendingUnready/)).toBeInTheDocument()
  })

  it('超出上限与未就绪给的是**两条不同**的原因（下一步不一样）', () => {
    const overflowShot = {
      id: 's1',
      kind: 'shot',
      label: '开场远景',
      token: '@开场远景',
      mediaUrl: 'https://cdn/s1.png',
    } as ComposerReferenceToken
    render(
      <CanvasSlotRack
        tokens={[overflowShot]}
        slotLimits={FULL}
        defaultExpanded={true}
        onInsert={vi.fn()}
        unsendableUrls={new Set(['https://cdn/s1.png'])}
      />,
    )
    // 去减素材 ≠ 去把音色配上，所以文案不能合并成一句「不会发送」。
    expect(screen.getByTitle(/^notSendingOverflow/)).toBeInTheDocument()
  })
})

describe('CanvasSlotRack · 持有 ≠ 本次发送时两个口径都说（契约 §4.8）', () => {
  it('⚠ 真机回归：挂了一条发不出去的，折起时不能只显示「持有」那个数', () => {
    /**
     * 阶段 5 真机抓到的：连了一个还没配音频的音色节点，摘要行显示「音 1」、
     * 槽位淡出、实际发送 0 条。淡出只在**展开到第三级**才看得见 —— 折起时
     * 用户读到的只有那个 1，于是「挂了 = 会发」这个误解在最外层原样成立。
     */
    render(
      <CanvasSlotRack
        tokens={[
          token('c1', 'character'),
          {
            id: 'v1',
            kind: 'voice',
            label: '旁白',
            token: '',
            dimmed: true,
          } as ComposerReferenceToken,
        ]}
        slotLimits={FULL}
        defaultExpanded={false}
      />,
    )
    expect(
      screen.getByText('heldVsSending:{"held":2,"sending":1}'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^total:/)).not.toBeInTheDocument()
  })

  it('全都发得出去时只说一个数 —— 多说一遍就是噪音', () => {
    render(
      <CanvasSlotRack
        tokens={[token('c1', 'character')]}
        slotLimits={FULL}
        defaultExpanded={false}
      />,
    )
    expect(screen.getByText('total:{"held":1,"total":15}')).toBeInTheDocument()
    expect(screen.queryByText(/^heldVsSending:/)).not.toBeInTheDocument()
  })
})
