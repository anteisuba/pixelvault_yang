import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'

import { ConnectToShotPopover } from './ConnectToShotPopover'

const targets = [
  {
    id: 's1',
    name: 'S01 · 车站外',
    durationLabel: '7s',
    occupiedSlots: [],
  },
  {
    id: 's2',
    name: 'S02 · 站台',
    occupiedSlots: [NODE_SLOT_IDS.voice],
  },
] as const

function setup(
  props: Partial<React.ComponentProps<typeof ConnectToShotPopover>> = {},
) {
  const onNew = vi.fn()
  const onConnect = vi.fn()
  const view = render(
    <ConnectToShotPopover
      sourceNodeId="a1"
      sourceKind={NODE_MEDIA_KIND_IDS.audio}
      targets={targets}
      onNew={onNew}
      onConnect={onConnect}
      {...props}
    />,
  )
  return { ...view, onNew, onConnect }
}

describe('ConnectToShotPopover（spec §1.13）', () => {
  it('顶行是「新建镜头」，下面按传进来的顺序列画布上已有的镜头', () => {
    const { container, onNew } = setup()
    const rows = container.querySelectorAll('[data-connect-to-shot-row]')
    expect(
      [...rows].map((row) => row.getAttribute('data-connect-to-shot-row')),
    ).toEqual(['s1', 's2'])
    fireEvent.click(container.querySelector('[data-connect-to-shot-new]')!)
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('音频卡落 voice 槽；目标槽已被占的那一行写「替换」而不是静默覆盖', () => {
    const { container, onConnect } = setup()
    const busy = container.querySelector('[data-connect-to-shot-row="s2"]')!
    expect(busy.getAttribute('data-slot')).toBe(NODE_SLOT_IDS.voice)
    expect(busy.querySelector('[data-connect-to-shot-occupied]')).not.toBeNull()
    expect(
      container
        .querySelector('[data-connect-to-shot-row="s1"]')!
        .querySelector('[data-connect-to-shot-occupied]'),
    ).toBeNull()

    fireEvent.click(
      container.querySelector('[data-connect-to-shot-connect="s2"]')!,
    )
    expect(onConnect).toHaveBeenCalledWith('s2', NODE_SLOT_IDS.voice)
  })

  it('文本卡落 text 槽（⛔ 不复用音频那一格）', () => {
    const { container, onConnect } = setup({
      sourceKind: NODE_MEDIA_KIND_IDS.text,
    })
    fireEvent.click(
      container.querySelector('[data-connect-to-shot-connect="s1"]')!,
    )
    expect(onConnect).toHaveBeenCalledWith('s1', NODE_SLOT_IDS.text)
  })

  it('图片卡在行内选 首帧 / 尾帧，默认首帧，选了就按选的落槽', () => {
    const { container, onConnect } = setup({
      sourceKind: NODE_MEDIA_KIND_IDS.image,
    })
    const row = container.querySelector('[data-connect-to-shot-row="s1"]')!
    expect(row.getAttribute('data-slot')).toBe(NODE_SLOT_IDS.firstFrame)
    fireEvent.click(
      row.querySelector(`[data-frame-slot="${NODE_SLOT_IDS.lastFrame}"]`)!,
    )
    fireEvent.click(
      container.querySelector('[data-connect-to-shot-connect="s1"]')!,
    )
    expect(onConnect).toHaveBeenCalledWith('s1', NODE_SLOT_IDS.lastFrame)
    // ⚠ 每行各自记 —— 另一行仍是首帧。
    expect(
      container
        .querySelector('[data-connect-to-shot-row="s2"]')!
        .getAttribute('data-slot'),
    ).toBe(NODE_SLOT_IDS.firstFrame)
  })

  it('画布上一张镜头都没有时列表位置写空态（⛔ 不给一个空白框）', () => {
    const { container } = setup({ targets: [] })
    expect(
      container.querySelector('[data-connect-to-shot-empty]'),
    ).not.toBeNull()
  })

  it('搜索按名字过滤', () => {
    const { container } = setup()
    fireEvent.change(
      container.querySelector('[data-connect-to-shot-search]')!,
      {
        target: { value: '站台' },
      },
    )
    expect(
      container.querySelectorAll('[data-connect-to-shot-row]'),
    ).toHaveLength(1)
  })
})
