// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_SHELL } from '@/constants/studio-assistant-operator'
import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'

import {
  getOperatorState,
  setOperatorIncognito,
} from '@/hooks/use-studio-operator-store'

import { StudioOperatorHeader } from './StudioOperatorHeader'

/**
 * 面板头部的回归闸（D7c ④ · 画板 `DesignD7cShell`「头部 · 改后」）。
 *
 * 钉七件事：
 *  ① 头高就是 `STUDIO_OPERATOR_SHELL.headerHeightPx`（真机目检读同一个数）；
 *  ② ⛔ **带子的东西一样都不许回来**：进度环 / 分数 / 清单开关（决策 14）；
 *  ③ 标题▾ 与右上历史图标开的是**同一个下拉**（§4.1），且图标能再点一下关掉；
 *  ④ 下拉里有历史列表（每行日期走「今天 / 昨天 / MM-DD」）＋ **底部**那颗新会话；
 *  ⑤ 右上**一颗 ⋯**（32px），菜单三项：历史会话 · 设置 · 隐身（占位禁用）；
 *  ⑥ 续跑 chip 只在**空闲**时露脸 —— 它暂挂在头部（§3.6 那条 ⚠ 的去处之一）；
 *  ⑦ ⭐ **规格胶囊不在头部**（D7c ④）：头部只回答「这是哪个会话」，那一句下沉到
 *     输入框上方（在 `StudioOperatorPanel.web.test.tsx` 里验）；
 *  ⑧ ⭐ 动的那几处都挂着 `motion-reduce:` 降级（D7c ④ 动效表最后一行）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => '09/05' }),
}))

/**
 * Radix 的 portal 在 jsdom 里只会给这条断言添噪声，但**开合必须是真的**：
 * ③ 那一条要断言「两个入口开的是同一个受控菜单」。所以这份替身把 `open` 原样
 * 挂到 DOM 上，并让触发器把 `onOpenChange(true)` 调回去（Radix 真身做的就是这件事）。
 */
vi.mock('@/components/ui/dropdown-menu', async () => {
  const React = await import('react')
  const OpenChangeContext = React.createContext<(next: boolean) => void>(
    () => {},
  )
  return {
    DropdownMenu: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode
      open?: boolean
      onOpenChange?: (next: boolean) => void
    }) => (
      <OpenChangeContext.Provider value={onOpenChange ?? (() => {})}>
        <div
          /* ⚠ 两个 `DropdownMenu` 在场（历史下拉 + 右上那颗 ⋯）：受控的那个才是
             历史下拉，⛔ 两个共用一个 testid 会让 `getByTestId` 直接抛「找到多个」。 */
          data-testid={
            open === undefined
              ? 'operator-more-menu'
              : 'operator-session-dropdown'
          }
          data-open={open ? 'true' : 'false'}
        >
          {children}
        </div>
      </OpenChangeContext.Provider>
    ),
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => {
      const onOpenChange = React.useContext(OpenChangeContext)
      return <span onClick={() => onOpenChange(true)}>{children}</span>
    },
    /* ⚠ 把 `className` 原样透下来：`motion-reduce` 那条断言验的是**组件交给
       原语的那串类名**，替身吞掉它等于验了个寂寞。 */
    DropdownMenuContent: ({
      children,
      className,
    }: {
      children: React.ReactNode
      className?: string
    }) => (
      <div
        data-testid="operator-session-dropdown-content"
        className={className}
      >
        {children}
      </div>
    ),
    DropdownMenuItem: ({
      children,
      onSelect,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      onSelect?: () => void
    }) => (
      <button {...props} onClick={onSelect}>
        {children}
      </button>
    ),
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenuSeparator: () => <hr />,
  }
})

const NOW = Date.now()
const DAY_MS = 86_400_000

const SESSIONS = [
  {
    id: 'today-session',
    title: '黄昏光的参考研究',
    surface: ASSISTANT_SURFACE_IDS.imageStudio,
    updatedAt: new Date(NOW).toISOString(),
  },
  {
    id: 'yesterday-session',
    title: '胶片颗粒对比测试',
    surface: ASSISTANT_SURFACE_IDS.imageStudio,
    updatedAt: new Date(NOW - DAY_MS).toISOString(),
  },
  {
    id: 'older-session',
    title: '城市天台构图',
    surface: ASSISTANT_SURFACE_IDS.videoStudio,
    updatedAt: new Date(NOW - 6 * DAY_MS).toISOString(),
  },
] as unknown as UseStudioOperatorHistoryResult['sessions']

const HISTORY: UseStudioOperatorHistoryResult = {
  sessions: [],
  currentSessionId: null,
  isHydrating: false,
  loadingSessionId: null,
  renamingSessionId: null,
  renameSession: vi.fn().mockResolvedValue(true),
  error: null,
  selectSession: vi.fn(),
  refreshSessions: vi.fn(),
  deletingSessionId: null,
  deleteSession: vi.fn().mockResolvedValue(true),
}

function renderHeader(
  overrides: Partial<Parameters<typeof StudioOperatorHeader>[0]> = {},
) {
  const onOpenAssistantSettings = vi.fn()
  const onCollapse = vi.fn()
  const onNewThread = vi.fn()
  render(
    <StudioOperatorHeader
      working={false}
      history={HISTORY}
      onNewThread={onNewThread}
      onOpenAssistantSettings={onOpenAssistantSettings}
      onCollapse={onCollapse}
      avatarOwned={false}
      {...overrides}
    />,
  )
  return { onOpenAssistantSettings, onCollapse, onNewThread }
}

describe('StudioOperatorHeader', () => {
  it('头高钉在常量那一档，且带子的读数一样都没有', () => {
    renderHeader()
    const head = screen.getByTestId('operator-header')
      .firstElementChild as HTMLElement
    expect(head.style.height).toBe(`${STUDIO_OPERATOR_SHELL.headerHeightPx}px`)
    // ⛔ 决策 14：进度环 / 分数 / 清单开关整条删掉。
    expect(screen.queryByTestId('operator-band-ring')).toBeNull()
    expect(screen.queryByTestId('operator-band-fraction')).toBeNull()
    expect(screen.queryByTestId('operator-band-toggle')).toBeNull()
    expect(screen.queryByTestId('operator-band-list')).toBeNull()
  })

  /**
   * D7c ④：头部只回答「这是哪个会话」。那枚域标记胶囊（`face.contextLine()`）
   * 搬去了输入框上方 —— ⛔ 它回到头部就是这一条红。
   */
  it('⭐ ⛔ 头部不再画规格胶囊；头像槽之后紧跟的就是标题', () => {
    renderHeader()
    expect(screen.queryByTestId('operator-domain-chip')).toBeNull()

    const row = screen.getByTestId('operator-header')
      .firstElementChild as HTMLElement
    const slot = screen.getByTestId('operator-header-avatar-slot')
    // 标题那颗药丸**紧挨着**头像槽（⛔ 中间不许再塞第三样东西）。
    expect(row.children[0]).toBe(slot)
    expect(row.children[1]).toContainElement(
      screen.getByTestId('operator-session-menu'),
    )
  })

  it('标题▾ 与 ⋯ 菜单里的「历史会话」开的是同一个下拉', () => {
    renderHeader()
    const dropdown = screen.getByTestId('operator-session-dropdown')
    expect(dropdown.dataset.open).toBe('false')

    // 第二条路：⋯ 菜单里那一项（⛔ 不另开一份列表）。
    fireEvent.click(screen.getByTestId('operator-more-history'))
    expect(dropdown.dataset.open).toBe('true')

    // 第一条路：标题自己（Radix 真身把触发器的点击变成 onOpenChange(true)）。
    fireEvent.click(screen.getByTestId('operator-session-menu'))
    expect(dropdown.dataset.open).toBe('true')
  })

  it('下拉里是历史列表：每行一枚「今天 / 昨天 / MM-DD」，新会话在最底下', () => {
    const { onNewThread } = renderHeader({
      history: { ...HISTORY, sessions: SESSIONS },
    })
    const rows = screen.getAllByTestId('operator-session-item')
    expect(rows.map((row) => row.dataset.sessionId)).toEqual([
      'today-session',
      'yesterday-session',
      'older-session',
    ])
    expect(rows[0]?.textContent).toContain('history.today')
    expect(rows[1]?.textContent).toContain('history.yesterday')
    expect(rows[2]?.textContent).toContain('09/05')

    // ⚠ 新会话排在**所有会话行之后**（画板 BCards「历史下拉展开」）。
    const newThread = screen.getByTestId('operator-new-thread')
    expect(
      rows[2]?.compareDocumentPosition(newThread) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    fireEvent.click(newThread)
    expect(onNewThread).toHaveBeenCalledTimes(1)
  })

  /**
   * D7c ④ 画板「加载中」那条 ⚠：真机上「读取中…」那行字和已经载出来的会话行
   * **同时挂着**。骨架必须**替掉**列表，⛔ 不叠在上面。
   */
  it('⭐ 加载中 = 三条骨架**替掉**列表，⛔ 不与会话行同时挂着', () => {
    renderHeader({
      history: { ...HISTORY, isHydrating: true, sessions: SESSIONS },
    })

    const skeleton = screen.getByTestId('operator-history-skeleton')
    expect(skeleton.children).toHaveLength(3)
    expect(screen.queryAllByTestId('operator-session-item')).toHaveLength(0)
    // 「新对话」在这一档照常在（画板：底下那颗不跟着消失）。
    expect(screen.getByTestId('operator-new-thread')).toBeTruthy()
  })

  /**
   * D7c ④ 画板「一条都没有」：一句灰字，⛔ 不画插图空态 —— 这是个下拉菜单
   * 不是一页，底下「新对话」照常在。
   */
  it('⭐ 一条都没有 = 一句灰字 + 底下那颗新对话', () => {
    renderHeader()
    expect(screen.getByTestId('operator-history-empty').textContent).toBe(
      'history.empty',
    )
    expect(screen.queryByTestId('operator-history-skeleton')).toBeNull()
    expect(screen.getByTestId('operator-new-thread')).toBeTruthy()
  })

  /**
   * owner 2026-09-20 真机第 3 条：删除是**原位两段**，⛔ 不再弹 `AlertDialog`。
   * 这一条只钉头部这一侧的那一格 —— 同一列表**同时只有一行**能举着刀。
   * 行内的两个状态机在 `StudioOperatorSessionRow.web.test.tsx` 里逐条验。
   */
  it('⭐ 同一列表同时只有一行处于确认删除态；⛔ 两张弹层都退场', () => {
    renderHeader({ history: { ...HISTORY, sessions: SESSIONS } })
    const deletes = screen.getAllByTestId('operator-session-delete')

    fireEvent.click(deletes[0] as HTMLElement)
    expect(deletes[0]).toHaveAttribute('data-confirming', 'true')

    fireEvent.click(deletes[1] as HTMLElement)
    expect(deletes[1]).toHaveAttribute('data-confirming', 'true')
    expect(deletes[0]).toHaveAttribute('data-confirming', 'false')

    // ⛔ 改名弹层与删除弹层都不在了。
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  /**
   * owner 2026-09-20 真机第 4 条：标题胶囊与历史行**共用同一个派生函数**
   * （`lib/assistant-conversation-title.ts`），存量长标题在渲染时就短下来。
   * 规则本身（剥提及 / 首句 / 宽度）在 `assistant-conversation-title.test.ts` 里验。
   */
  it('⭐ 标题胶囊与历史行共用派生函数：存量长标题渲染时就剥掉参考图提及', () => {
    const noisy = [
      {
        id: 'noisy-session',
        title:
          'reference image 1 reference image 2 reference image 3 这几张图的画风抽出来用在新的角色上',
        surface: ASSISTANT_SURFACE_IDS.imageStudio,
        updatedAt: new Date(NOW).toISOString(),
      },
    ] as unknown as UseStudioOperatorHistoryResult['sessions']

    renderHeader({
      history: {
        ...HISTORY,
        sessions: noisy,
        currentSessionId: 'noisy-session',
      },
    })

    const pill = screen.getByTestId('operator-session-menu')
    expect(pill.textContent).not.toContain('reference image')
    expect(pill.textContent).toContain('这几张图的画风')

    const row = screen.getByTestId('operator-session-item')
    expect(row.textContent).not.toContain('reference image')
    expect(row.textContent).toContain('这几张图的画风')
  })

  /**
   * 右上收成**一颗 ⋯**（D7b ④）：并排三颗图标（历史 · 设置 · 收起）全部退场，
   * 菜单里三项 —— 历史会话 · 设置 · 隐身（56a 未落 → 占位禁用）。
   */
  it('右上只有一颗 ⋯（32px 档），菜单三项，历史 / 设置行为接通', () => {
    const { onOpenAssistantSettings } = renderHeader()
    expect(screen.getByTestId('operator-more').className).toContain('size-8')
    // ⛔ 并排那三颗不存在了。
    expect(screen.queryByTestId('operator-history-button')).toBeNull()
    expect(screen.queryByTestId('operator-collapse')).toBeNull()

    expect(screen.getByTestId('operator-more-history')).toBeTruthy()
    fireEvent.click(screen.getByTestId('operator-assistant-settings'))
    expect(onOpenAssistantSettings).toHaveBeenCalledTimes(1)

    // 隐身（56a 切片 4）：真开关，⛔ 不再是禁用占位。
    expect(screen.getByTestId('operator-more-incognito')).not.toBeDisabled()
  })

  /**
   * 隐身（56a 切片 4）—— ⋯ 菜单那颗开关作用于**当前会话**，头部一枚文字胶囊。
   * ⚠ ⛔ 不用红点：红点说的是「有东西要你看」，隐身是一个持续的状态。
   */
  it('⭐ 隐身：菜单切一下 → 头部出文字胶囊；再切一下收回去', () => {
    // store 是模块级的 —— ⚠ 这一条自己把它摆回关着，⛔ 不依赖用例顺序。
    setOperatorIncognito(false)
    renderHeader()
    // 关着时整枚不渲染（⛔ 不画停用态）。
    expect(screen.queryByTestId('operator-incognito-pill')).toBeNull()

    fireEvent.click(screen.getByTestId('operator-more-incognito'))
    expect(screen.getByTestId('operator-incognito-pill')).toBeTruthy()
    expect(getOperatorState().incognito).toBe(true)

    fireEvent.click(screen.getByTestId('operator-more-incognito'))
    expect(screen.queryByTestId('operator-incognito-pill')).toBeNull()
    expect(getOperatorState().incognito).toBe(false)
  })

  /**
   * 收起钮已删（D7b ④）—— 收起改点左上那颗头像。
   * ⚠ 桌面上头部只留**空槽**（那颗头像是外壳里那个持久 fixed 元素滑进来的），
   *   手机上头部自己画一颗可点的。
   */
  it('⛔ 不再有收起钮；桌面留空槽、手机画真头像且点了就收', () => {
    renderHeader()
    expect(screen.queryByTestId('operator-collapse')).toBeNull()
    const slot = screen.getByTestId('operator-header-avatar-slot')
    expect(slot.style.width).toBe(
      `${STUDIO_OPERATOR_SHELL.avatarHeaderSizePx}px`,
    )
    expect(screen.queryByTestId('operator-header-avatar')).toBeNull()
    cleanup()

    const { onCollapse } = renderHeader({ avatarOwned: true })
    expect(screen.queryByTestId('operator-header-avatar-slot')).toBeNull()
    fireEvent.click(screen.getByTestId('operator-header-avatar'))
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  /**
   * D7c ④ 动效表末行：「全部包在 `motion-reduce:` 里」。
   *
   * ⚠ 两种降级**不能混**：下拉开合走的是 `animate-in` / `animate-out`
   * （keyframes），`transition-none` 关不掉它 —— 必须是 `animate-none`；
   * 而标题药丸与 ⋯ 是 `transition-colors`，那一档才用 `transition-none`。
   * ⛔ 这条红 = 有人把降级删了，或者把两种写反了。
   */
  it('⭐ 动的那几处都挂着对应的 `motion-reduce:` 降级', () => {
    renderHeader()

    // 历史下拉：keyframes 动画档。⚠ 同屏两张浮层（历史 + ⋯），认「装着新对话
    // 那一颗」的那一张，⛔ 不靠顺序取。
    const content = screen
      .getAllByTestId('operator-session-dropdown-content')
      .find((node) => node.contains(screen.getByTestId('operator-new-thread')))
    expect(content?.className).toContain('motion-reduce:animate-none')

    // 标题药丸与右上 ⋯：`transition-colors` 档。
    for (const id of ['operator-session-menu', 'operator-more']) {
      expect(screen.getByTestId(id).className).toContain(
        'motion-reduce:transition-none',
      )
    }
  })

  it('续跑 chip 只在空闲时露脸', () => {
    const onResume = vi.fn()
    renderHeader({ resume: { stepNumber: 3, onResume } })
    const chip = screen.getByTestId('operator-band-resume')
    expect(chip.dataset.step).toBe('3')
    fireEvent.click(chip)
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('干活中 ⛔ 不画续跑 chip（会让人以为要开第二条流）', () => {
    renderHeader({
      working: true,
      resume: { stepNumber: 3, onResume: vi.fn() },
    })
    expect(screen.queryByTestId('operator-band-resume')).toBeNull()
  })
})
