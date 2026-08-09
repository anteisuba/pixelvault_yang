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
        onClose={vi.fn()}
      />,
    )

    for (const groupId of Object.values(CANVAS_ADD_GROUP_IDS)) {
      expect(
        screen.getByText(`addCatalog.groups.${groupId}`),
      ).toBeInTheDocument()
    }
    // 顶部真上传 + 图片 2 + 视频 4 + 声音 1 + 统一收集 1 = 9。
    // 角色/场景两个兼容 intent 仍留在 catalog，但手工菜单只暴露一个收集入口。
    // 图片从 3 降到 2：关键帧 2026-08-09 退役（canvas-add-catalog 头注）。
    expect(screen.getAllByRole('menuitem')).toHaveLength(9)
    expect(
      screen.getByText('addCatalog.items.collect.label'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('addCatalog.items.organizeCharacter.label'),
    ).not.toBeInTheDocument()
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
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByText('addCatalog.upload').closest('button') as HTMLElement,
    )
    expect(onUpload).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('keeps one collection entry and creates the canonical collector directly', () => {
    const onSelect = vi.fn()
    render(
      <CanvasAddMenu
        open
        screenPosition={{ x: 24, y: 24 }}
        onSelect={onSelect}
        onUpload={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(
      screen
        .getByText('addCatalog.items.imageAsset.label')
        .closest('button') as HTMLElement,
    )
    expect(onSelect).toHaveBeenCalledWith(CANVAS_ADD_INTENT_IDS.imageAsset)

    // 2026-08-09：关键帧那一项已退役（见 canvas-add-catalog 的头注），菜单里
    // 不再有它，所以这里也不再点它。
    fireEvent.click(
      screen
        .getByText('addCatalog.items.collect.label')
        .closest('button') as HTMLElement,
    )
    expect(onSelect).toHaveBeenCalledWith(
      CANVAS_ADD_INTENT_IDS.organizeCharacter,
    )
    expect(
      screen.queryByText('addCatalog.items.organizeScene.label'),
    ).not.toBeInTheDocument()
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
          onClose={vi.fn()}
        />,
      )

      fireEvent.keyDown(document, { key: 'a' })

      expect(workbenchLadder).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('keydown', workbenchLadder)
    }
  })
})
