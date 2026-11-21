/**
 * @vitest-environment jsdom
 *
 * ⌘K 新建组 = 全目录 `CANVAS_ADD_CATALOG`（全量可搜）。
 *
 * ⚠ 搜索要真文案才证得出来，所以这里的 next-intl 假件读真的 zh 词条并做 `{x}` 插值
 * （`ShellChrome.web.test.tsx` 那份只回 key，搜「角色」在那边永远搜不到）。
 * 过滤是真 cmdk 的：jsdom 里不排版，但打分与显隐是它自己的逻辑。
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView ??= function scrollIntoView() {}

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
import { CANVAS_SHELL_QUICK_ADD } from '@/constants/canvas-shell'

import { ShellCommandPalette } from './ShellCommandPalette'

const CATALOG_IDS = CANVAS_ADD_CATALOG.flatMap((group) =>
  group.items.map((item) => item.id),
)
const QUICK_IDS = new Set(CANVAS_SHELL_QUICK_ADD.map((entry) => entry.intentId))

function renderPalette() {
  const onAdd = vi.fn()
  render(
    <ShellCommandPalette
      open
      onOpenChange={vi.fn()}
      nodes={[]}
      projects={[]}
      currentProjectId="p1"
      onFocusNode={vi.fn()}
      onAdd={onAdd}
      onUpload={vi.fn()}
      onAskAssistant={vi.fn()}
      onOpenEditDesk={vi.fn()}
      hasShotTable={false}
      onShotTable={vi.fn()}
      onSwitchProject={vi.fn()}
      onManageChannels={null}
    />,
  )
  return { onAdd }
}

function createRowIds(): string[] {
  return screen
    .queryAllByTestId(/^shell-command-create-(?!shortcut-)/)
    .map((row) =>
      (row.getAttribute('data-testid') ?? '').replace(
        'shell-command-create-',
        '',
      ),
    )
}

function search(query: string) {
  act(() => {
    fireEvent.change(screen.getByTestId('shell-command-input'), {
      target: { value: query },
    })
  })
}

afterEach(cleanup)

describe('ShellCommandPalette · 新建 = 全目录', () => {
  it('渲染目录全部项，顺序同目录组序项序；助手别名 audio.timbre 不进面板', () => {
    renderPalette()
    expect(CATALOG_IDS).toHaveLength(10)
    expect(createRowIds()).toEqual(CATALOG_IDS)
    expect(
      screen.queryByTestId(
        `shell-command-create-${CANVAS_ADD_INTENT_IDS.audioTimbre}`,
      ),
    ).toBeNull()
    expect(
      screen.getByTestId(
        `shell-command-create-${CANVAS_ADD_INTENT_IDS.imageCharacter}`,
      ).textContent,
    ).toBe('新建角色')
  })

  it('四类快捷项行尾带 T / I / A / V，其余六项不带', () => {
    renderPalette()
    for (const id of CATALOG_IDS) {
      const hint = screen.queryByTestId(`shell-command-create-shortcut-${id}`)
      if (QUICK_IDS.has(id)) {
        const letter = CANVAS_SHELL_QUICK_ADD.find(
          (entry) => entry.intentId === id,
        )?.letter
        expect(hint?.textContent).toBe(letter?.toUpperCase())
      } else {
        expect(hint).toBeNull()
      }
    }
    expect(QUICK_IDS.size).toBe(4)
  })

  it('搜「角色」命中「新建角色」，点它以 image.character 调 onAdd', () => {
    const { onAdd } = renderPalette()
    search('角色')
    const row = screen.getByTestId(
      `shell-command-create-${CANVAS_ADD_INTENT_IDS.imageCharacter}`,
    )
    expect(row.textContent).toBe('新建角色')
    // 只按名字过滤：不相干的项（含四类快捷项）一律筛掉，⛔ 不再长「新建X「角色」」那种带引号的行。
    const visible = createRowIds()
    expect(visible).not.toContain(CANVAS_ADD_INTENT_IDS.imageBackground)
    expect(visible).not.toContain(CANVAS_ADD_INTENT_IDS.imageShot)
    expect(visible).not.toContain(CANVAS_ADD_INTENT_IDS.textScript)
    expect(visible).not.toContain(CANVAS_ADD_INTENT_IDS.videoShot)
    for (const id of visible) {
      expect(
        screen.getByTestId(`shell-command-create-${id}`).textContent,
      ).not.toMatch(/[「」“”"]/)
    }
    fireEvent.click(row)
    expect(onAdd).toHaveBeenCalledWith(CANVAS_ADD_INTENT_IDS.imageCharacter)
  })

  it('搜大类词「图片」命中图片组全部项', () => {
    renderPalette()
    search('图片')
    const imageGroup = CANVAS_ADD_CATALOG.find((group) => group.id === 'image')
    const visible = createRowIds()
    for (const item of imageGroup?.items ?? []) {
      expect(visible).toContain(item.id)
    }
    // 别的组的非快捷项不该被大类词带出来。
    expect(visible).not.toContain(CANVAS_ADD_INTENT_IDS.textRule)
    expect(visible).not.toContain(CANVAS_ADD_INTENT_IDS.videoClip)
  })
})
