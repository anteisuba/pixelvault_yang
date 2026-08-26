import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import {
  CANVAS_ADD_GROUP_IDS,
  CANVAS_ADD_INTENT_IDS,
} from '@/constants/canvas-add-catalog'

import { CanvasAddMenu } from './CanvasAddMenu'

describe('CanvasAddMenu', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame
  const originalCancelAnimationFrame = window.cancelAnimationFrame

  beforeEach(() => {
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    window.cancelAnimationFrame = vi.fn()
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
  })

  it('renders compact insert intents without a cast tray entry', () => {
    render(
      <CanvasAddMenu
        open
        screenPosition={{ x: 24, y: 24 }}
        onSelect={vi.fn()}
        onUpload={vi.fn()}
        onPickFromLibrary={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    for (const groupId of Object.values(CANVAS_ADD_GROUP_IDS)) {
      expect(
        screen.getByText(`addCatalog.groups.${groupId}`),
      ).toBeInTheDocument()
    }
    // 顶部真上传/从素材库选择 2 + 图片 2 + 视频 4 + 声音 1 + 组织 2 = 11。
    // 图片从 3 降到 2：关键帧 2026-08-09 退役（canvas-add-catalog 头注）。
    // 组织从「塌成一颗收集」改回两行（《画布修法》A2）：角色档案/场景档案
    // 各自独立可达，不再有孤儿的 collect 文案。
    expect(screen.getAllByRole('menuitem')).toHaveLength(11)
    expect(screen.getByText('addCatalog.pickFromLibrary')).toBeInTheDocument()
    expect(
      screen.queryByText('addCatalog.items.collect.label'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('addCatalog.items.organizeCharacter.label'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('addCatalog.items.organizeScene.label'),
    ).toBeInTheDocument()
    expect(screen.queryByText('addCatalog.cast')).not.toBeInTheDocument()
    expect(
      screen.queryByText('addCatalog.items.shotText.label'),
    ).not.toBeInTheDocument()
  })

  // 台账 #26（owner 2026-08-02）：顶部主行是真上传——走 onUpload 回调（宿主
  // 弹文件选择器），不再发 imageAsset intent。
  it('fires onUpload from the primary upload row', () => {
    const onUpload = vi.fn()
    const onSelect = vi.fn()
    render(
      <CanvasAddMenu
        open
        screenPosition={{ x: 24, y: 24 }}
        onSelect={onSelect}
        onUpload={onUpload}
        onPickFromLibrary={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByText('addCatalog.upload').closest('button') as HTMLElement,
    )
    expect(onUpload).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  // 《画布修法》A2：组织组恢复两行——角色档案 / 场景档案各自独立可点，
  // 不再塌成一颗硬编码派 organizeCharacter 的「收集」按钮。
  it('dispatches the matching intent per row, including both organize entries', () => {
    const onSelect = vi.fn()
    render(
      <CanvasAddMenu
        open
        screenPosition={{ x: 24, y: 24 }}
        onSelect={onSelect}
        onUpload={vi.fn()}
        onPickFromLibrary={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(
      screen
        .getByText('addCatalog.items.imageAsset.label')
        .closest('button') as HTMLElement,
    )
    expect(onSelect).toHaveBeenCalledWith(CANVAS_ADD_INTENT_IDS.imageAsset)

    fireEvent.click(
      screen
        .getByText('addCatalog.items.organizeCharacter.label')
        .closest('button') as HTMLElement,
    )
    expect(onSelect).toHaveBeenCalledWith(
      CANVAS_ADD_INTENT_IDS.organizeCharacter,
    )

    fireEvent.click(
      screen
        .getByText('addCatalog.items.organizeScene.label')
        .closest('button') as HTMLElement,
    )
    expect(onSelect).toHaveBeenCalledWith(CANVAS_ADD_INTENT_IDS.organizeScene)

    expect(onSelect).toHaveBeenCalledTimes(3)
  })

  // R3-4 §4.2「一次一层」回归（owner 实测，2026-07-27）: 菜单在 document 级
  // 消费掉 Esc 后必须截断冒泡，否则同一次按键会继续跑到 StudioNodeWorkbench
  // 挂在 window 上的 Esc 阶梯，关完菜单顺手把画布选中也清掉。工作台那边"看
  // addMenu 还开着就早退"兜不住——keydown 是 discrete 事件，React 会在
  // document 与 window 两个阶段之间同步 flush 重渲染，window 监听器届时已经
  // 换成 addMenu=null 的新闭包。
  it('stops the Escape it consumed from reaching the workbench ladder on window', () => {
    const onClose = vi.fn()
    const workbenchLadder = vi.fn()
    window.addEventListener('keydown', workbenchLadder)

    try {
      render(
        <CanvasAddMenu
          open
          screenPosition={{ x: 24, y: 24 }}
          onSelect={vi.fn()}
          onUpload={vi.fn()}
          onPickFromLibrary={vi.fn()}
          onClose={onClose}
        />,
      )

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(onClose).toHaveBeenCalledTimes(1)
      expect(workbenchLadder).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', workbenchLadder)
    }
  })

  // 同一把锁的另一半：非 Esc 的按键不能被截断（画布快捷键仍要能到 window）。
  it('lets other keys through to window', () => {
    const workbenchLadder = vi.fn()
    window.addEventListener('keydown', workbenchLadder)

    try {
      render(
        <CanvasAddMenu
          open
          screenPosition={{ x: 24, y: 24 }}
          onSelect={vi.fn()}
          onUpload={vi.fn()}
          onPickFromLibrary={vi.fn()}
          onClose={vi.fn()}
        />,
      )

      fireEvent.keyDown(document, { key: 'a' })

      expect(workbenchLadder).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('keydown', workbenchLadder)
    }
  })

  // 右键在画布上另有含义（空白处右键 = 就地重开一个添加菜单），且浏览器
  // 通常不为右键派发 click——不能武装吞 click，否则会一直留着，误吞新菜单
  // 打开后紧接着那一次正常左键点击。
  it('does not arm click suppression when the outside pointerdown is a right-click', () => {
    const onClose = vi.fn()
    const outsideOnClick = vi.fn()
    render(
      <div>
        <button type="button" onClick={outsideOnClick}>
          outside target
        </button>
        <CanvasAddMenu
          open
          screenPosition={{ x: 24, y: 24 }}
          onSelect={vi.fn()}
          onUpload={vi.fn()}
          onPickFromLibrary={vi.fn()}
          onClose={onClose}
        />
      </div>,
    )

    const outsideButton = screen.getByText('outside target')
    fireEvent.pointerDown(outsideButton, { pointerId: 1, button: 2 })
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(outsideButton)
    expect(outsideOnClick).toHaveBeenCalledTimes(1)
  })

  // 《画布修法》A1（P1 误触）：菜单打开时点击外部——那一下常常正好落在菜单
  // 自己盖住的其它控件上（调查实测复现：点左栏「当前项目」，触发了下层的
  // 「从素材库选择」）。第一下必须只关菜单，不能让同一次点击顺手激活它刚刚
  // 让开位置的东西。
  it('swallows the click that follows an outside pointerdown, so it only closes the menu', () => {
    const outsideOnClick = vi.fn()

    // 用一个持有 open 状态的小外壳来贴近真实宿主（StudioNodeWorkbench 里
    // onClose 会把 addMenu 置空，从而让 open 真正翻成 false）——直接传静态
    // `open` + `vi.fn()` 测不出「菜单关闭之后再点一次应该正常生效」这一半，
    // 因为 open 全程没变过，outside-pointerdown 监听器会在第二次点击时重新
    // 武装一次新的吞掉窗口。
    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <div>
          <button type="button" onClick={outsideOnClick}>
            outside target
          </button>
          <CanvasAddMenu
            open={open}
            screenPosition={{ x: 24, y: 24 }}
            onSelect={vi.fn()}
            onUpload={vi.fn()}
            onPickFromLibrary={vi.fn()}
            onClose={() => setOpen(false)}
          />
        </div>
      )
    }

    render(<Harness />)

    const outsideButton = screen.getByText('outside target')
    fireEvent.pointerDown(outsideButton, { pointerId: 1, button: 0 })

    // 同一个用户手势里紧跟着来的 click（浏览器基于 mousedown/mouseup 独立
    // 派发，不会因为更早的 pointerdown 被拦截就不发）——这一下必须被吞掉。
    fireEvent.click(outsideButton)
    expect(outsideOnClick).not.toHaveBeenCalled()

    // 吞掉的只是「这一次」——菜单已经真正关闭（open 翻成了 false），用户
    // 再点一次应该正常生效（验收清单：「再点一次才进项目」）。
    fireEvent.click(outsideButton)
    expect(outsideOnClick).toHaveBeenCalledTimes(1)
  })

  // 同一把锁不能误伤正常操作：点菜单自己的条目时，pointerdown 命中的是
  // menuRef 内部，不算「外部点击」，click 应该照常派给 onSelect。
  it('does not suppress a normal pointerdown+click sequence on its own menu item', () => {
    const onSelect = vi.fn()
    render(
      <CanvasAddMenu
        open
        screenPosition={{ x: 24, y: 24 }}
        onSelect={onSelect}
        onUpload={vi.fn()}
        onPickFromLibrary={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const button = screen
      .getByText('addCatalog.items.imageAsset.label')
      .closest('button') as HTMLElement
    fireEvent.pointerDown(button, { pointerId: 1, button: 0 })
    fireEvent.click(button)

    expect(onSelect).toHaveBeenCalledWith(CANVAS_ADD_INTENT_IDS.imageAsset)
  })
})
