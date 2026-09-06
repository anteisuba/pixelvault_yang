// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorAssetChoiceCard } from './StudioOperatorAssetChoiceCard'

/**
 * 歧义反问单选卡（§3.3 第 5 行 / §11.4「反问单选卡」）。
 *
 * ⚠ 本片只到组件为止：由服务端事件驱动的接线是第 3 轮的事，所以这份用例验的是
 * 「它此刻就能独立渲染与被点」——⛔ 不是一个等着接线的空壳。
 *
 * 钉三件事：
 *  ① 4 列 `aspect-3/4` 网格（§11.4），与结果行卡的 2/4 列不共用一套；
 *  ② 点一张把**那一条**交出去（调用方据此插 @chip 并带上下文重发）；
 *  ③ 选过之后整卡 `.resolved`（标题转 muted），⛔ 不把候选整片撤掉 —— 用户要
 *    看得见自己当时选的是哪一张。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const options = [
  {
    id: 'g1',
    url: 'https://cdn.test/1.png',
    thumbnailUrl: 'https://cdn.test/1t.png',
    label: '第一张',
    kind: 'image' as const,
  },
  {
    id: 'g2',
    url: 'https://cdn.test/2.mp4',
    label: '一段视频',
    kind: 'video' as const,
  },
]

describe('StudioOperatorAssetChoiceCard', () => {
  it('4 列 aspect-3/4 网格，缺缩略图时画类型字形（⛔ 不回落到 url）', () => {
    render(
      <StudioOperatorAssetChoiceCard
        question="你说的是哪一张？"
        options={options}
        onChoose={vi.fn()}
      />,
    )
    const tiles = screen.getAllByTestId('operator-asset-choice-option')
    expect(tiles).toHaveLength(2)
    expect(tiles[0]?.parentElement?.className).toContain('grid-cols-4')
    expect(tiles[0]?.className).toContain('aspect-3/4')
    // 视频那格没有缩略图 —— ⛔ 不能把 mp4 地址塞给 next/image。
    expect(tiles[1]?.querySelector('img')).toBeNull()
    expect(screen.getByTestId('operator-asset-choice').textContent).toContain(
      '你说的是哪一张？',
    )
  })

  it('点一张把那一条交出去', () => {
    const onChoose = vi.fn()
    render(
      <StudioOperatorAssetChoiceCard
        question="哪一张？"
        options={options}
        onChoose={onChoose}
      />,
    )
    fireEvent.click(screen.getAllByTestId('operator-asset-choice-option')[1]!)
    expect(onChoose).toHaveBeenCalledWith(options[1])
  })

  it('选过之后整卡 resolved，候选仍然看得见', () => {
    render(
      <StudioOperatorAssetChoiceCard
        question="哪一张？"
        options={options}
        chosenId="g1"
        onChoose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('operator-asset-choice').dataset.resolved).toBe(
      'true',
    )
    expect(
      screen.getAllByTestId('operator-asset-choice-option')[0]?.dataset.chosen,
    ).toBe('true')
    expect(screen.getAllByTestId('operator-asset-choice-option')).toHaveLength(
      2,
    )
  })
})
