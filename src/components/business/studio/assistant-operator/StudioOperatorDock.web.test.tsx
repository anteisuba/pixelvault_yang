// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useImageUpload } from '@/hooks/use-image-upload'
import {
  addOperatorMention,
  appendOperatorEntry,
  resetOperatorThread,
} from '@/hooks/use-studio-operator-store'
import type { StudioOperatorAttachment } from '@/types/studio-assistant-operator'
import type { StudioOperatorPanel } from './StudioOperatorPanel'
type StudioOperatorPanelProps = Parameters<typeof StudioOperatorPanel>[0]

import {
  STUDIO_OPERATOR_DEFAULT_ANCHOR,
  STUDIO_OPERATOR_MOBILE_SHELL,
  STUDIO_OPERATOR_PANEL_RESIZE,
  STUDIO_OPERATOR_SHELL,
} from '@/constants/studio-assistant-operator'

/**
 * 面板外壳的几何闸（§11.1）+ 「胶囊已删」的回归闸（拍板 7 改口）。
 *
 * ⭐ 本来该由 `verify-real` 在真机上读这几个数（面板宽 560 · inset 24 · 轨宽 48），
 * 2026-09-06 本次施工时 claude-in-chrome 扩展未连接，所以把同样的断言钉在这里 ——
 * ⛔ 静态检查不冒称视觉验证，但这几个**数**必须有机器守着。
 *
 * 钉四件事：
 *  ① 展开态宽 = `defaultWidthPx`（560），fixed 四边 inset 24（`top-6/right-6/bottom-6`）；
 *  ② 收起态是**同一个 `<aside>` 收到 48px**，⛔ 不再有另一颗 fixed 在别处的胶囊
 *     （胶囊连同它的 testid 已于切片 3a 全仓删净，所以这里不再断言它不存在 ——
 *      一条永远不会失败的断言只是噪音）；
 *  ③ 收起态渲染图标轨，展开态不渲染；
 *  ④ 点轨展开（收放法则的「点图标轨 → 展开」那一半）；
 *  ⑤ **手机档**（本片）：全屏 Sheet + 右下浮标，⛔ 没有图标轨、没有那颗
 *     `<aside>`；LoRA 域在手机上整颗不渲染（那条路由仍走 `LoraAssistantDock`，
 *     两颗面板永不同屏）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const setOpen = vi.hoisted(() => vi.fn())
let hostOpen = true
let hostDomain = 'image'
let hostCollapseOnOutsidePointer: boolean | undefined
let mobile = false
let references: ReturnType<typeof useImageUpload>
let panelProps: StudioOperatorPanelProps
let onUploaded: (attachment: StudioOperatorAttachment) => void

vi.mock('@/contexts/studio-operator-host', () => ({
  useStudioOperatorHost: () => {
    references = useImageUpload()
    return {
      open: hostOpen,
      setOpen,
      domain: hostDomain,
      referenceLimit: 4,
      referenceImages: references.referenceEntries,
      apply: {
        addReference: references.addReferenceImage,
        removeReference: (url: string) => {
          const index = references.referenceEntries.findIndex(
            (entry) => entry.url === url,
          )
          if (index >= 0) references.removeReferenceImage(index)
        },
      },
      results: [],
      collapseOnOutsidePointer: hostCollapseOnOutsidePointer,
    }
  },
}))

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile }))
vi.mock('@/hooks/use-assistant-operator', () => ({
  useAssistantOperator: () => ({
    domain: 'image',
    send: vi.fn(),
    stop: vi.fn(),
    newThread: vi.fn(),
    critique: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-studio-operator-critique', () => ({
  useStudioOperatorCritique: () => undefined,
}))
// 助手设置 persona（§8）—— 外壳拉一次往下传，这里给一份不发请求的默认值。
vi.mock('@/hooks/use-assistant-persona', () => ({
  useAssistantPersona: () => ({
    persona: {
      name: null,
      avatarPreset: 'mark',
      avatarUrl: null,
      tone: 'professional',
      toneCustom: null,
      verbosity: 'standard',
      planMode: 'auto',
      language: 'ui',
    },
    isLoading: false,
    isSaving: false,
    error: null,
    save: vi.fn(),
    uploadAvatar: vi.fn(),
    removeAvatar: vi.fn(),
    reload: vi.fn(),
  }),
}))
vi.mock(
  '@/components/business/studio/assistant-operator/AssistantSettingsDialog',
  () => ({
    ASSISTANT_SETTINGS_SECTIONS: { persona: 'persona', rules: 'rules' },
    AssistantSettingsDialog: () => null,
  }),
)
vi.mock('@/hooks/use-studio-operator-history', () => ({
  useStudioOperatorHistory: () => ({
    sessions: [],
    currentSessionId: null,
    isHydrating: false,
    error: null,
    selectSession: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-studio-operator-upload', () => ({
  useStudioOperatorUpload: (options: { onUploaded: typeof onUploaded }) => {
    onUploaded = options.onUploaded
    return {
      uploads: [],
      uploadFiles: vi.fn(),
      retryUpload: vi.fn(),
      dismissUpload: vi.fn(),
    }
  },
}))
vi.mock('@/hooks/use-studio-operator-web-import', () => ({
  useStudioOperatorWebImport: () => ({
    states: {},
    limit: 4,
    toggleCandidate: vi.fn(),
  }),
}))
vi.mock(
  '@/components/business/studio/assistant-operator/StudioOperatorPanel',
  () => ({
    StudioOperatorPanel: (props: StudioOperatorPanelProps) => {
      panelProps = props
      return <div data-testid="operator-panel-content" />
    },
  }),
)
vi.mock(
  '@/components/business/studio/assistant-operator/StudioOperatorLightbox',
  () => ({ StudioOperatorLightbox: () => null, openOperatorLightbox: vi.fn() }),
)

import { StudioOperatorDock } from './StudioOperatorDock'

beforeEach(() => {
  hostOpen = true
  hostDomain = 'image'
  hostCollapseOnOutsidePointer = undefined
  mobile = false
  setOpen.mockClear()
  resetOperatorThread()
})

describe('StudioOperatorDock', () => {
  it('uploads and workspace reference changes share one list, including removals and draft renumbering', () => {
    render(<StudioOperatorDock />)
    const first: StudioOperatorAttachment = {
      id: 'uploaded',
      kind: 'image',
      url: 'https://cdn.test/first.png',
      label: 'uploaded',
    }
    act(() => onUploaded(first))
    expect(references.referenceImages).toEqual([first.url])
    expect(panelProps.attachments.map((item) => item.url)).toEqual([first.url])
    act(() => references.addReferenceImage('https://cdn.test/second.png'))
    expect(panelProps.attachments).toHaveLength(2)
    act(() => panelProps.onDraftChange('参考@Image2'))
    act(() => panelProps.onAttachmentsChange(panelProps.attachments.slice(1)))
    expect(references.referenceImages).toEqual(['https://cdn.test/second.png'])
    expect(panelProps.draft).toBe('参考@Image1')
    act(() => references.clearAllImages())
    expect(panelProps.attachments).toEqual([])
    expect(panelProps.draft).toBe('参考')
  })

  it('library selections and dragged mention images enter the shared references without duplicates', () => {
    render(<StudioOperatorDock />)
    const image: StudioOperatorAttachment = {
      id: 'library',
      kind: 'image',
      url: 'https://cdn.test/library.png',
      label: 'library',
    }
    act(() => panelProps.onAttachmentsChange([image]))
    act(() => addOperatorMention({ ...image, id: 'dragged' }))
    expect(references.referenceImages).toEqual([image.url])
    expect(panelProps.attachments).toHaveLength(1)
  })

  it('展开态：宽 560、顶 / 右由宿主锚点给（缺省 24）', () => {
    render(<StudioOperatorDock />)
    const panel = screen.getByTestId('operator-panel')
    expect(panel.style.width).toBe(
      `${STUDIO_OPERATOR_PANEL_RESIZE.defaultWidthPx}px`,
    )
    expect(STUDIO_OPERATOR_SHELL.insetPx).toBe(24)
    expect(panel).toHaveClass('fixed')
    expect(panel.style.top).toBe(
      `${STUDIO_OPERATOR_DEFAULT_ANCHOR.panelTopPx}px`,
    )
    expect(panel.style.right).toBe(
      `${STUDIO_OPERATOR_DEFAULT_ANCHOR.panelRightPx}px`,
    )
    expect(screen.getByTestId('operator-panel-content')).toBeTruthy()
  })

  it('展开态皮肤走三层玻璃①「面板」（v2 §12.1）：玻璃面 + 细边 + 柔投影 + 18px 圆角', () => {
    render(<StudioOperatorDock />)
    const panel = screen.getByTestId('operator-panel')
    // 18px = `rounded-2xl`，圆角区间的上限那一档（§12.3「面板与浮层取上限」）。
    expect(panel.className).toContain('rounded-2xl')
    expect(panel.className).toContain('border border-border')
    // ⛔ 不是 `bg-card`：面板是**玻璃**那一层（半透 + 模糊，低端机回落不透明）。
    expect(panel.className).toContain('assistant-glass-panel')
    expect(panel.className).not.toContain('bg-card')
    expect(panel.dataset.phase).toBe('open')
    expect(panel.className).toContain('shadow-assistant-panel')
  })

  /**
   * ⭐ **Dock 自己声明可点**（2026-09-19 真机：画布页面板点不动）。
   *
   * 🔬 画布宿主把助手渲染在一条 `pointer-events-none` 的全屏 rail 里（那条 rail
   * 必须是 none，否则会盖住整张画布）。展开态不自己写 `auto` 就从 rail 继承成
   * none —— 面板画得出来，点击全落到底下的画布上。收起态照旧是 none（那时
   * `<aside>` 宽高归零，留着可点只会在右上角吃掉点击）。
   */
  it('⭐ 展开态自己 `pointer-events-auto`；头像同样自己声明', () => {
    render(<StudioOperatorDock />)
    expect(screen.getByTestId('operator-panel').className).toContain(
      'pointer-events-auto',
    )
    cleanup()

    hostOpen = false
    render(<StudioOperatorDock />)
    // 收起档整颗 aside 根本不渲染 —— ⛔ 不留一个有尺寸的空面板在右上角吃点击。
    expect(screen.queryByTestId('operator-panel')).toBeNull()
    // 头像住在画布那条 rail 里 —— 不自己声明就「收起之后再也打不开」。
    expect(screen.getByTestId('operator-avatar-toggle').className).toContain(
      'pointer-events-auto',
    )
  })

  /**
   * 收起态 = **右上角那颗人设头像**（D7b ④，owner 2026-09-20 改口）。
   * ⛔ 右下角那颗 44px 近黑圆按钮（D7 ④ · Q2 = C）连同它的组件文件已删。
   */
  it('收起态：aside 不渲染，右上角一颗 36px 头像', () => {
    hostOpen = false
    render(<StudioOperatorDock />)
    expect(screen.queryByTestId('operator-panel')).toBeNull()
    const avatar = screen.getByTestId('operator-avatar-toggle')
    expect(avatar.style.width).toBe(`${STUDIO_OPERATOR_SHELL.avatarSizePx}px`)
    expect(avatar.style.top).toBe(
      `${STUDIO_OPERATOR_DEFAULT_ANCHOR.avatarTopPx}px`,
    )
    expect(avatar.style.bottom).toBe('')
    expect(avatar.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByTestId('operator-panel-content')).toBeNull()
  })

  /** 开合两态：`aria-pressed` 跟着走，头像在两态都在场（同一个持久元素）。 */
  it('展开态：同一颗头像还在，aria-pressed 翻成 true', () => {
    render(<StudioOperatorDock />)
    const avatar = screen.getByTestId('operator-avatar-toggle')
    expect(avatar.getAttribute('aria-pressed')).toBe('true')
    expect(avatar.style.transform).toContain('scale(')
  })

  /** 结果卡落地那一刻面板多半是收着的（点生成键 = 点工作台 = 收面板）。 */
  const arriveResult = (id: string) => {
    act(() => {
      appendOperatorEntry({
        kind: 'result',
        id,
        total: 1,
        completed: 1,
        items: [{ id: `${id}-img`, url: 'https://cdn.test/a.png' }],
        storedAt: '2026-09-19T00:00:00.000Z',
      })
    })
  }

  it('无事无角标；收着时回来一张结果就画数字', () => {
    hostOpen = false
    render(<StudioOperatorDock />)
    expect(screen.queryByTestId('operator-avatar-badge')).toBeNull()
    arriveResult('result-unread')
    expect(screen.getByTestId('operator-avatar-badge').textContent).toBe('1')
  })

  it('打开面板即把未读结果清零', () => {
    hostOpen = false
    const view = render(<StudioOperatorDock />)
    arriveResult('result-unread')
    expect(screen.getByTestId('operator-avatar-badge').textContent).toBe('1')
    hostOpen = true
    view.rerender(<StudioOperatorDock />)
    hostOpen = false
    view.rerender(<StudioOperatorDock />)
    expect(screen.queryByTestId('operator-avatar-badge')).toBeNull()
  })

  /**
   * 注意力收放法则的**宿主开关**（2026-09-19 owner 拍板：画布整体豁免）。
   *
   * ⚠ 两条一起钉：缺省仍旧收（工作台 / LoRA 的行为不回归），显式说不收才不收。
   */
  const clickOutside = () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    fireEvent.pointerDown(outside)
    outside.remove()
  }

  it('缺省仍旧收：点面板外任意元素就收起（拍板 7 原样）', () => {
    render(<StudioOperatorDock />)
    clickOutside()
    expect(setOpen).toHaveBeenCalledWith(false)
  })

  it('宿主说不收时：点面板外不收，那条监听根本没挂', () => {
    hostCollapseOnOutsidePointer = false
    render(<StudioOperatorDock />)
    clickOutside()
    expect(setOpen).not.toHaveBeenCalled()
  })

  it('点头像展开；展开态再点一次收起（同一颗按钮两件事）', () => {
    hostOpen = false
    render(<StudioOperatorDock />)
    fireEvent.click(screen.getByTestId('operator-avatar-toggle'))
    expect(setOpen).toHaveBeenCalledWith(true)
    cleanup()

    hostOpen = true
    render(<StudioOperatorDock />)
    fireEvent.click(screen.getByTestId('operator-avatar-toggle'))
    expect(setOpen).toHaveBeenCalledWith(false)
  })
})

describe('StudioOperatorDock · 手机档', () => {
  /**
   * ⚠ v2 §4.6 起 Sheet 是**半屏**的：上半截工作台露着 —— 所以 Sheet 一开，
   * 浮标就整颗不渲染（⛔ 不再是「浮标一直挂着、被全屏 Sheet 盖住」）。
   */
  it('渲染半屏 Sheet；开着时⛔ 不画收起态按钮，也没有桌面 aside', () => {
    mobile = true
    render(<StudioOperatorDock />)
    expect(screen.getByTestId('operator-mobile-sheet')).toBeTruthy()
    expect(screen.queryByTestId('operator-avatar-toggle')).toBeNull()
    expect(screen.queryByTestId('operator-panel')).toBeNull()
  })

  it('Sheet 装的是同一个面板（open 时挂上、关闭时卸载）', () => {
    mobile = true
    const { unmount } = render(<StudioOperatorDock />)
    expect(screen.getByTestId('operator-panel-content')).toBeTruthy()
    unmount()

    hostOpen = false
    render(<StudioOperatorDock />)
    expect(screen.queryByTestId('operator-mobile-sheet')).toBeNull()
    expect(screen.queryByTestId('operator-panel-content')).toBeNull()
    // 面板收起时那颗头像仍在 —— 它是手机上唯一的入口。
    expect(screen.getByTestId('operator-avatar-toggle')).toBeTruthy()
  })

  it('点头像打开；手机档同样挂**右上角**（⛔ 不再是右下那颗浮标）', () => {
    mobile = true
    hostOpen = false
    render(<StudioOperatorDock />)
    const avatar = screen.getByTestId('operator-avatar-toggle')
    expect(avatar.style.top).toBe(
      `${STUDIO_OPERATOR_MOBILE_SHELL.fabInsetPx}px`,
    )
    expect(avatar.style.bottom).toBe('')
    fireEvent.click(avatar)
    expect(setOpen).toHaveBeenCalledWith(true)
  })

  it('LoRA 域在手机上整颗不渲染（装配台仍走 LoraAssistantDock）', () => {
    mobile = true
    hostDomain = 'lora'
    const { container } = render(<StudioOperatorDock />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('operator-mobile-sheet')).toBeNull()
    expect(screen.queryByTestId('operator-avatar-toggle')).toBeNull()
  })
})

/**
 * ── morph 的四档相位（D7b ④ · 画板 ②「动画怎么做」）─────────────────
 *
 * 逐条钉铁律：
 *  ① 过渡中面板 `pointer-events-none` + `will-change`（CSS module 按 `data-phase`
 *     挂），过渡完两样都撤；
 *  ② **毛玻璃在 transitionend 之后才出现**（过渡中开 `backdrop-filter` 会掉帧）；
 *  ③ 收回靠**定时器**（200ms）卸载 —— ⛔ 不靠 transitionend / animationend：
 *     后台标签页里那个事件永远不来，留下的是幽灵面板；
 *  ④ 展开那条兜底定时器（240 + slack）在事件不来时照样把相位推到 `open`。
 */
describe('StudioOperatorDock · 头像开关的过渡', () => {
  beforeEach(() => {
    hostOpen = false
  })

  it('①②④ 过渡中不可点、无毛玻璃；transitionend 之后两样都到位', () => {
    const view = render(<StudioOperatorDock />)
    hostOpen = true
    view.rerender(<StudioOperatorDock />)

    const panel = screen.getByTestId('operator-panel')
    expect(panel.dataset.phase).toBe('opening')
    expect(panel.className).not.toContain('assistant-glass-panel')
    expect(panel.className).not.toContain('pointer-events-auto')
    expect(screen.getByTestId('operator-avatar-toggle').dataset.phase).toBe(
      'opening',
    )

    act(() => {
      fireEvent.transitionEnd(panel, { propertyName: 'transform' })
    })
    expect(screen.getByTestId('operator-panel').dataset.phase).toBe('open')
    expect(screen.getByTestId('operator-panel').className).toContain(
      'assistant-glass-panel',
    )
    expect(screen.getByTestId('operator-panel').className).toContain(
      'pointer-events-auto',
    )
  })

  it('④ transitionend 不来时，兜底定时器照样把相位推到 open', () => {
    vi.useFakeTimers()
    try {
      const view = render(<StudioOperatorDock />)
      hostOpen = true
      view.rerender(<StudioOperatorDock />)
      expect(screen.getByTestId('operator-panel').dataset.phase).toBe('opening')
      act(() => vi.advanceTimersByTime(STUDIO_OPERATOR_SHELL.openMs + 60))
      expect(screen.getByTestId('operator-panel').dataset.phase).toBe('open')
    } finally {
      vi.useRealTimers()
    }
  })

  it('③ 收回：内容立刻不可达，200ms 后**定时器**把面板整颗卸载', () => {
    vi.useFakeTimers()
    try {
      hostOpen = true
      const view = render(<StudioOperatorDock />)
      hostOpen = false
      view.rerender(<StudioOperatorDock />)
      expect(screen.getByTestId('operator-panel').dataset.phase).toBe('closing')
      expect(
        screen.getByTestId('operator-panel-content').closest('[inert]'),
      ).not.toBeNull()
      act(() => vi.advanceTimersByTime(STUDIO_OPERATOR_SHELL.closeMs - 1))
      expect(screen.queryByTestId('operator-panel')).not.toBeNull()
      act(() => vi.advanceTimersByTime(1))
      expect(screen.queryByTestId('operator-panel')).toBeNull()
      expect(screen.getByTestId('operator-avatar-toggle')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reduced-motion 直切：没有中间相位，毛玻璃当场就挂', () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia
    try {
      const view = render(<StudioOperatorDock />)
      hostOpen = true
      view.rerender(<StudioOperatorDock />)
      const panel = screen.getByTestId('operator-panel')
      expect(panel.dataset.phase).toBe('open')
      expect(panel.className).toContain('assistant-glass-panel')

      hostOpen = false
      view.rerender(<StudioOperatorDock />)
      expect(screen.queryByTestId('operator-panel')).toBeNull()
    } finally {
      window.matchMedia = original
    }
  })
})

/**
 * **⛔ 外壳里不许按 domain 分叉**（D7b ③ 的结构闸）。
 *
 * 🔬 四张脸的差异住在宿主的 `face` 里（`contexts/studio-operator-host.tsx`）。外壳
 * 与面板一旦自己写 `domain === 'image' ? … : …` 去挑文案 / 图标 / 药丸，第五个宿主
 * 接进来时那几处会各自沉默地回落到某一张脸 —— 而回落出来的界面看起来完全正常。
 * ⚠ 这条是**源码扫描**：运行时断言看不见一条写死的分支有没有被执行到。
 * ⚠ 白名单两处是**真的按域分**的东西，与「脸」无关：手机档有没有这套外壳
 *   （`hasMobileShell`）与会话行上那枚域标签。
 */
describe('⛔ 外壳与面板不按 domain 挑脸', () => {
  const FACE_FORK = /domain\s*===\s*ASSISTANT_PROTOCOL_DOMAIN_IDS\.\w+\s*\?/

  it.each([
    'StudioOperatorDock.tsx',
    'StudioOperatorPanel.tsx',
    'StudioOperatorHeader.tsx',
    'StudioOperatorEmptyState.tsx',
  ])('%s 里没有「按域挑一张脸」的三元分叉', async (file) => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const source = readFileSync(
      join(
        process.cwd(),
        'src/components/business/studio/assistant-operator',
        file,
      ),
      'utf-8',
    )
    expect(FACE_FORK.test(source)).toBe(false)
  })
})
