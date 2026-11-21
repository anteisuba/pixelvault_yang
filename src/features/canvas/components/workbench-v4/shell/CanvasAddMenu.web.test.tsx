/**
 * @vitest-environment jsdom
 *
 * 加节点菜单 `CanvasAddMenu`（唯一一份）：内容 = 目录十项 + 底部三件，每列第一项带字母，
 * 键盘走位 / 字母直落，空画布引导按钮弹的就是它。
 *
 * ⚠ jsdom 不排版：四列 / 两列折行、宽度不截断、贴边翻面、落点像素都证不了，留给真机。
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', async () => {
  const messages = (await import('@/messages/canvas/zh.json')).default
  function lookup(path: string): unknown {
    return path
      .split('.')
      .reduce<unknown>(
        (node, key) =>
          node && typeof node === 'object'
            ? (node as Record<string, unknown>)[key]
            : undefined,
        messages,
      )
  }
  return {
    useTranslations:
      (namespace: string) => (key: string, values?: Record<string, string>) => {
        const raw = lookup(`${namespace}.${key}`)
        if (typeof raw !== 'string') return key
        return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
          String(values?.[name] ?? ''),
        )
      },
  }
})

import {
  CANVAS_ADD_CATALOG,
  CANVAS_ADD_INTENT_IDS,
} from '@/constants/canvas-add-catalog'
import { canvasQuickAddLetter } from '@/constants/canvas-shell'

import { NodeCanvasEmptyGuide } from '../../NodeCanvasEmptyGuide'
import { CanvasAddMenu, nextCanvasAddMenuKey } from './CanvasAddMenu'

function actions() {
  return {
    onAdd: vi.fn(),
    onUpload: vi.fn(),
    onPickFromLibrary: vi.fn(),
    onShotTable: vi.fn(),
  }
}

function renderMenu(layout: 'grid' | 'list' = 'grid') {
  const props = actions()
  render(<CanvasAddMenu layout={layout} tone="popover" {...props} />)
  return props
}

afterEach(cleanup)

describe('CanvasAddMenu · 内容', () => {
  it('目录十项 + 底部三件（上传… ⌘U · 从素材库选 · 镜头表），没有标题', () => {
    renderMenu()
    const menu = screen.getByRole('menu')
    expect(menu.getAttribute('aria-label')).toBe('添加节点')
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(13)
    const footer = within(screen.getByTestId('canvas-add-footer'))
      .getAllByRole('menuitem')
      .map((row) => row.textContent)
    expect(footer).toEqual(['上传…⌘U', '从素材库选择', '镜头表'])
    // 助手别名不进菜单。
    expect(
      screen.queryByTestId(`canvas-add-${CANVAS_ADD_INTENT_IDS.audioTimbre}`),
    ).toBeNull()
  })

  it('每列第一项是带字母的那项（剧本 T / 生成图 I / 语音音色 A / 镜头 V）；四项带、六项不带', () => {
    renderMenu()
    const columns = CANVAS_ADD_CATALOG.map((group) =>
      within(screen.getByTestId(`canvas-add-group-${group.id}`)).getAllByRole(
        'menuitem',
      ),
    )
    expect(
      columns.map(
        (rows) =>
          rows[0]?.querySelector('[data-testid$="-shortcut"]')?.textContent,
      ),
    ).toEqual(['T', 'I', 'A', 'V'])
    const all = columns.flat()
    const lettered = all.filter((row) =>
      row.querySelector('[data-testid$="-shortcut"]'),
    )
    expect(all).toHaveLength(10)
    expect(lettered).toHaveLength(4)
    for (const rows of columns) {
      for (const row of rows.slice(1)) {
        expect(row.querySelector('[data-testid$="-shortcut"]')).toBeNull()
      }
    }
  })

  it('点一项交出意图 id；底部三件各走各的', () => {
    const props = renderMenu()
    fireEvent.click(
      screen.getByTestId(`canvas-add-${CANVAS_ADD_INTENT_IDS.imageBackground}`),
    )
    expect(props.onAdd).toHaveBeenCalledWith(
      CANVAS_ADD_INTENT_IDS.imageBackground,
    )
    fireEvent.click(screen.getByTestId('canvas-add-upload'))
    fireEvent.click(screen.getByTestId('canvas-add-library'))
    fireEvent.click(screen.getByTestId('canvas-add-shot-table'))
    expect(props.onUpload).toHaveBeenCalledOnce()
    expect(props.onPickFromLibrary).toHaveBeenCalledOnce()
    expect(props.onShotTable).toHaveBeenCalledOnce()
  })

  it('侧栏用的单列版：项序与四列版逐项相同', () => {
    renderMenu('grid')
    const gridOrder = screen
      .getAllByRole('menuitem')
      .map((row) => row.dataset.testid)
    cleanup()
    renderMenu('list')
    expect(
      screen.getAllByRole('menuitem').map((row) => row.dataset.testid),
    ).toEqual(gridOrder)
  })
})

describe('CanvasAddMenu · 键盘', () => {
  it('只有第一项可 Tab 进来；↓ 列内、→ 跨列、↓ 走到列底进底部那一行', () => {
    renderMenu()
    const id = (intentId: string) => `canvas-add-${intentId}`
    const tabbable = screen
      .getAllByRole('menuitem')
      .filter((row) => row.tabIndex === 0)
    expect(tabbable.map((row) => row.dataset.testid)).toEqual([
      id(CANVAS_ADD_INTENT_IDS.textScript),
    ])
    const first = tabbable[0] as HTMLElement
    act(() => first.focus())
    const press = (key: string) =>
      fireEvent.keyDown(document.activeElement as Element, { key })
    press('ArrowDown')
    expect(document.activeElement?.getAttribute('data-testid')).toBe(
      id(CANVAS_ADD_INTENT_IDS.textRule),
    )
    press('ArrowRight')
    expect(document.activeElement?.getAttribute('data-testid')).toBe(
      id(CANVAS_ADD_INTENT_IDS.imageShot),
    )
    press('ArrowRight')
    // 声音列只有一项：夹到末行。
    expect(document.activeElement?.getAttribute('data-testid')).toBe(
      id(CANVAS_ADD_INTENT_IDS.audioVoice),
    )
    press('ArrowDown')
    // 列底再 ↓ 进底部那一行（第 3 列 → 底部第 3 件）。
    expect(document.activeElement?.getAttribute('data-testid')).toBe(
      'canvas-add-shot-table',
    )
    press('ArrowLeft')
    expect(document.activeElement?.getAttribute('data-testid')).toBe(
      'canvas-add-library',
    )
    // roving：只有当前那一格可 Tab。
    expect(
      screen
        .getAllByRole('menuitem')
        .filter((row) => row.tabIndex === 0)
        .map((row) => row.dataset.testid),
    ).toEqual(['canvas-add-library'])
  })

  it('开着时按 T / I / A / V 直接建那一项，且不冒到 window（⛔ 全局快捷键再落一张）', () => {
    const props = renderMenu()
    const onWindowKey = vi.fn()
    window.addEventListener('keydown', onWindowKey)
    try {
      act(() => (screen.getAllByRole('menuitem')[0] as HTMLElement).focus())
      fireEvent.keyDown(document.activeElement as Element, {
        key: 'v',
        code: 'KeyV',
      })
      expect(props.onAdd).toHaveBeenCalledWith(CANVAS_ADD_INTENT_IDS.videoShot)
      expect(onWindowKey).not.toHaveBeenCalled()
      // 带修饰键的不认（⌘V 是粘贴）。
      fireEvent.keyDown(document.activeElement as Element, {
        key: 'v',
        code: 'KeyV',
        metaKey: true,
      })
      expect(props.onAdd).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('keydown', onWindowKey)
    }
  })

  it('nextCanvasAddMenuKey：走不动就原地；底部 ↑ 回到对应列末行', () => {
    const nav = {
      columns: [['a1', 'a2', 'a3'], ['b1'], ['c1', 'c2']],
      footer: ['f1', 'f2', 'f3'],
    }
    expect(nextCanvasAddMenuKey(nav, 'a1', 'up')).toBe('a1')
    expect(nextCanvasAddMenuKey(nav, 'a1', 'left')).toBe('a1')
    expect(nextCanvasAddMenuKey(nav, 'c2', 'right')).toBe('c2')
    expect(nextCanvasAddMenuKey(nav, 'a3', 'right')).toBe('b1')
    expect(nextCanvasAddMenuKey(nav, 'b1', 'right')).toBe('c1')
    expect(nextCanvasAddMenuKey(nav, 'a3', 'down')).toBe('f1')
    expect(nextCanvasAddMenuKey(nav, 'c2', 'down')).toBe('f3')
    expect(nextCanvasAddMenuKey(nav, 'f2', 'up')).toBe('b1')
    expect(nextCanvasAddMenuKey(nav, 'f3', 'right')).toBe('f3')
    expect(nextCanvasAddMenuKey(nav, 'f1', 'down')).toBe('f1')
  })

  it('每列第一项的字母就是目录里那一项的快捷字母', () => {
    for (const group of CANVAS_ADD_CATALOG) {
      const first = group.items[0]
      expect(first && canvasQuickAddLetter(first.id)).toBeTruthy()
    }
  })
})

describe('空画布引导 · 手动加节点', () => {
  it('点「手动加节点」以按钮为锚弹加节点菜单（⛔ 不开 ⌘K），选一项收起', () => {
    const addMenu = actions()
    render(<NodeCanvasEmptyGuide onChatOutline={vi.fn()} addMenu={addMenu} />)
    expect(screen.queryByTestId('empty-guide-add-menu')).toBeNull()
    fireEvent.click(screen.getByTestId('empty-guide-add-node'))
    const menu = screen.getByTestId('empty-guide-add-menu')
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(13)
    fireEvent.click(
      within(menu).getByTestId(`canvas-add-${CANVAS_ADD_INTENT_IDS.textNote}`),
    )
    expect(addMenu.onAdd).toHaveBeenCalledWith(CANVAS_ADD_INTENT_IDS.textNote)
    expect(screen.queryByTestId('empty-guide-add-menu')).toBeNull()
  })
})
