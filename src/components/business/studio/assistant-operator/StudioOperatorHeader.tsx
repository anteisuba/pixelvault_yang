'use client'

/**
 * 面板**头部**（D7c ④ · 画板 `DesignD7cShell`「头部 · 改后」）—— 44px 一行：
 * 头像槽 · 会话标题▾ ……… **一颗 ⋯**。
 *
 * ── 头部只回答「这是哪个会话」（D7c ④，owner 2026-09-20）────────────
 * 那枚域标记胶囊（域图标 + `face.contextLine()`，写的是「未选模型 · 1:1 · 1 张」）
 * **整块搬去输入框上方**（`StudioOperatorPanel` 的规格行）。判据：头部说的是**会话
 * 身份**，而那一句说的是「这一句发出去会产出什么」—— 它随参数栏变，属于输入区。
 * 留在这里的代价是标题被挤到第三位，而标题才是这一行里唯一有分量的东西。
 * ⚠ `face.contextLine` **没有**从契约里删，只是换了渲染位置。⛔ 头部不再收 `face`
 *   与 `domain` 两个 prop —— 它此刻一格都不读，留着就会有人往回填东西。
 *
 * ── 它替掉了什么 ────────────────────────────────────────────────
 * 顶部那条进度带（整文件删）。决策 14：它占了 40px
 * 的常驻高度去说一句「3/6」，而这句话在加载态那句状态词里顺带就说了
 * （「正在查 3 个来源…」本身就是进度，§3.6）。
 *
 * ⚠ 带上挂着的两样东西**各自找到了去处**（§3.6 那条 ⚠）：
 *  · 齿轮设置入口 → 这里（头部右上，§4.1）；
 *  · 续跑 chip → **已搬到结论记录块的尾部**（§3.6，commit #13）。这里留着的是
 *    **回落档**：一条结论记录都没有时（会话从没结过账）它还得有个落点 ——
 *    这颗按钮本来就是为「刷新之后」存在的，而刷新之后恰恰可能什么都没载回来。
 *    ⚠ 挂不挂由面板判（`resumeHost`），⛔ 这里不再自己决定。
 *
 * ── 右上收成**一颗 ⋯**（D7b ④，owner 2026-09-20）──────────────────
 * 并排那三颗 32px 图标（历史 · 设置 · 收起）**全部退场**：收起改点左上头像（见下），
 * 历史与设置收进 ⋯ 菜单，隐身（56a）也在那里。
 *
 * ⚠ 菜单里的「历史会话」**不另开一份列表**：它把标题▾ 那个受控 `DropdownMenu` 打开
 *   （`setMenuOpen(true)`），锚点仍是标题那颗药丸。v1 把两处合并过一次
 *   （2026-09-09），结论是对的：用户找「上次那个会话」时脑子里想的就是「换一个
 *   标题」。⛔ 不开第二个菜单实例 —— 两份菜单内容必然漂。
 * ⚠ ⋯ 关掉自己时会把焦点还给它的触发器，而那一下对刚打开的历史下拉来说是一次
 *   「点了外面」—— 所以 ⋯ 的触发器带着 `HISTORY_BUTTON_ATTR`，历史下拉的
 *   `onInteractOutside` 认得它就不当外部点击。⛔ 别改成 `setTimeout` 去躲这一拍：
 *   那只是把同一个竞态推迟一帧。
 *
 * ⚠ **收起钮与并排图标全删**（D7b ④，owner 2026-09-20）：收起现在点**左上那颗头像**。
 * 键盘可达没有丢 —— 头像本身是一颗 `<button>`（桌面上是外壳那颗 fixed 的，
 * 手机上是下面这颗），Esc 那一级也还在。⛔ 别把 `PanelRightClose` 找回来：
 * 一个面板不该有两条收起的路。
 *
 * ── 左上那个头像槽 ──────────────────────────────────────────────
 * 桌面上头部**不画**头像：那颗是外壳里那个持久 fixed 元素滑进来的（D7b「一个
 * 元素两个锚点」），这里只留一个同尺寸的空槽给它坐。手机走 Sheet、没有 morph，
 * 所以那一档由头部自己画（`avatarOwned`）。⛔ 两边都画的表现是过渡末尾头像
 * 边缘闪一下。
 */

import { useCallback, useState } from 'react'
import {
  Check,
  MessageSquarePlus,
  ChevronDown,
  EyeOff,
  MoreHorizontal,
  Settings2,
} from '@/components/icons'
import { useFormatter, useTranslations } from 'next-intl'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import {
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
  STUDIO_OPERATOR_SHELL,
} from '@/constants/studio-assistant-operator'
import type { AssistantOperatorDomain } from '@/constants/assistant-operator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  setOperatorIncognito,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import { AssistantAvatarGlyph } from '@/components/business/studio/assistant-operator/AssistantAvatarGlyph'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { AssistantPersona } from '@/types/assistant-persona'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'
import { StudioOperatorSessionRow } from '@/components/business/studio/assistant-operator/StudioOperatorSessionRow'
import { deriveAssistantConversationTitle } from '@/lib/assistant-conversation-title'
import {
  ASSISTANT_SURFACE_IDS,
  type AssistantSurfaceId,
} from '@/types/assistant-conversation'

/**
 * 会话行上那枚域标签读哪条词条。
 *
 * ⚠ `Record<Surface, …>`：surface 表加一档而这里没跟上，编译期就红 ——
 * 漏掉的表现是菜单上一枚印着 `undefined` 的标签。
 * ⚠ 画布不是操作员的域，`domainName` 里也没有它的词条 —— 不画标签。
 */
/**
 * 历史图标身上的标记 —— 菜单的 `onInteractOutside` 靠它认出「点的是我自己的
 * 第二个入口」（见头注）。⚠ 用属性不用 `data-testid`：testid 是给用例的，
 * ⛔ 不让运行时逻辑依赖它。
 */
const HISTORY_BUTTON_ATTR = 'data-operator-history-trigger'

/** 一天的毫秒数 —— 只给下面那个「今天 / 昨天」的日差用。 */
const MS_PER_DAY = 86_400_000

/**
 * 加载态那三条骨架的首行宽度（画板「加载中」：62% / 48% / 70%）。
 *
 * ⚠ 三条**不等长**：等长的骨架读起来是三条进度条，不是三个待载入的标题。
 * ⚠ 条数写死 3 —— 它占的是「下拉一屏大概几行」，⛔ 不跟着上一次的列表长度走
 *   （那会让刷新前后跳两次高度）。
 */
const HISTORY_SKELETON_WIDTHS = ['w-3/5', 'w-1/2', 'w-7/10'] as const

/**
 * 右上**那一颗 ⋯** 的皮肤（§4.1：32px）。
 *
 * ⚠ 命中区 32px 是 `ui-defaults.md §5` 的 fine 档底线，⛔ 别为了挤下更多东西
 * 缩到 28 —— 它是头部唯一的常驻入口，先保命中。
 */
const HEADER_ICON_BUTTON_CLASS =
  'grid size-8 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground active:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none'

const SESSION_DOMAIN_BY_SURFACE: Record<
  AssistantSurfaceId,
  AssistantOperatorDomain | null
> = {
  [ASSISTANT_SURFACE_IDS.imageStudio]: ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
  [ASSISTANT_SURFACE_IDS.videoStudio]: ASSISTANT_PROTOCOL_DOMAIN_IDS.video,
  [ASSISTANT_SURFACE_IDS.lora]: ASSISTANT_PROTOCOL_DOMAIN_IDS.lora,
  [ASSISTANT_SURFACE_IDS.nodeCanvas]: null,
}

interface StudioOperatorHeaderProps {
  /**
   * 这一轮还在跑 —— 会话切换 / 新会话在这一档**不可点**（换会话 = 换语境，
   * 而流正读着旧那一份）。
   * ⚠ ⛔ 它不再决定头部长什么样：进度带删了（决策 14），进度由状态词说（§3.6）。
   */
  working: boolean
  history: UseStudioOperatorHistoryResult
  onNewThread(): void
  /**
   * 「助手设置」（§4.1 右上那颗齿轮）。
   *
   * ⚠ 弹层住在外壳（`StudioOperatorDock`）：收放法则（拍板 7）随时会把面板卸载，
   * 弹层跟着面板走的下场是它自己突然消失。
   */
  onOpenAssistantSettings(): void
  /**
   * 收起 —— 现在只有**头像**按得到它（D7b）。⚠ 桌面上按的是外壳那颗 fixed 头像，
   * 所以这个回调在桌面档其实没有调用方；留着是因为手机那颗头像就在头部里。
   */
  onCollapse(): void
  /**
   * 头部**自己画**那颗头像吗（手机档 = 是）。
   * ⚠ 判据由外壳给（它才知道有没有 morph），⛔ 头部不自己 `useIsMobile()`：
   *   同一件事判两遍必然会漂。
   */
  avatarOwned: boolean
  persona?: AssistantPersona
  /**
   * **有未完成计划**（第三期 · 断点续跑）—— 刷新之后唯一还看得见的入口。
   *
   * ⭐ 它必须在头部而不是只在流里：刷新之后线程是从库里载回来的**只读历史**，
   * checkpoint 薄卡那一档在历史类型里根本不存在 —— 于是「从第 N 步继续」在最需要
   * 它的那一刻（刚刷新完）一个入口都没有。
   * ⚠ 只在**空闲**时露脸：正在跑的时候再挤一颗「继续」会让人以为要开第二条流。
   * ⚠ 缺席 = 没有没跑完的计划，⛔ 不画停用态。
   */
  resume?: {
    /** 1 起数。 */
    stepNumber: number
    onResume(): void
  }
}

export function StudioOperatorHeader({
  working,
  history,
  onNewThread,
  onOpenAssistantSettings,
  onCollapse,
  avatarOwned,
  persona,
  resume,
}: StudioOperatorHeaderProps) {
  const t = useTranslations('StudioOperator')
  const format = useFormatter()
  /**
   * 隐身（56a）—— ⚠ 从 store 读而不是从 props：它同时要被 ⋯ 菜单切、被头部那枚
   * 胶囊读、被驱动 hook 在事件处理器里同步读。穿成 prop 等于让面板与外壳各转发
   * 一次同一个布尔。
   */
  const { incognito } = useStudioOperatorState()
  /**
   * **举着刀的那一行**（owner 2026-09-20 真机第 3 条）—— 删除是原位两段确认，
   * ⛔ 不再弹 `AlertDialog`。
   *
   * ⚠ 这一格住在这里而不是各行自己：同一列表**同时只能有一行**处于确认态，
   * 各记各的表现是一屏红字。⚠ 换会话列表 / 关菜单时清掉（见下面那两处）。
   */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  /** ⚠ 稳定引用：行里的 3 秒定时器把它当 effect 依赖。 */
  const cancelConfirmDelete = useCallback(() => setConfirmDeleteId(null), [])
  /** 标题▾ 与历史图标共开的那一个菜单（见头注），⛔ 不是两个实例。 */
  const [menuOpen, setMenuOpen] = useState(false)

  /**
   * 胶囊上那几个字（owner 2026-09-20 真机第 4 条）。
   *
   * ⚠ **派生在渲染时跑**，⛔ 不信库里那一列的长度：存量标题是几个月前按 80 字
   * 存下的，那正是胶囊上「reference image 1 reference image 2 …」的来源。
   * ⚠ 与历史行**共用同一个函数**（`lib/assistant-conversation-title.ts`），
   * ⛔ 两处各写一遍必然漂成两种长度。
   */
  const sessionTitle =
    deriveAssistantConversationTitle(
      history.sessions.find((item) => item.id === history.currentSessionId)
        ?.title,
    ) ?? t('newThread')

  /**
   * 会话行右边那枚日期（画板 BCards：`今天` / `昨天` / `09-05`）。
   *
   * ⚠ 日差按**本地零点**算不按 24 小时算：`23:50` 与次日 `00:10` 差 20 分钟，
   * 按毫秒除会得出「今天」，而用户看到的是两个日子。
   * ⚠ 更早的那一档走 `format.dateTime` 而不是手拼 `MM-DD`：分隔符是地区的事
   *   （ja 是 `09/05`），⛔ 不在这里替三种语言拿主意。
   */
  const sessionDateLabel = (iso: string): string => {
    const date = new Date(iso)
    const midnight = (value: Date) =>
      new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
    const days = Math.round(
      (midnight(new Date()) - midnight(date)) / MS_PER_DAY,
    )
    if (days <= 0) return t('history.today')
    if (days === 1) return t('history.yesterday')
    return format.dateTime(date, { month: '2-digit', day: '2-digit' })
  }

  return (
    <div
      data-testid="operator-header"
      data-working={working ? 'true' : 'false'}
      /* ⚠ 头部**不铺自己的底**（§12.1）：它坐在面板那层玻璃上，给它一层
         `bg-card` 等于在玻璃上又糊一块不透明白 —— 分层交给那条下边线。 */
      className="shrink-0 border-b border-border"
    >
      <div
        style={{ height: `${STUDIO_OPERATOR_SHELL.headerHeightPx}px` }}
        className="flex items-center gap-2 px-3"
      >
        {/* 头像槽（D7b ④）—— 桌面是给外壳那颗 fixed 头像**留位**的空格子，
            手机是真的那一颗。两档同宽，所以标题的起点在两档上逐像素相同。 */}
        {avatarOwned ? (
          <button
            type="button"
            data-testid="operator-header-avatar"
            aria-label={t('collapse')}
            {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
            onClick={onCollapse}
            style={{
              width: `${STUDIO_OPERATOR_SHELL.avatarHeaderSizePx}px`,
              height: `${STUDIO_OPERATOR_SHELL.avatarHeaderSizePx}px`,
            }}
            className="grid shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-card text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AssistantAvatarGlyph
              presetId={persona?.avatarPreset ?? null}
              name={persona?.name?.trim() || t('timeline.assistantFallback')}
            />
          </button>
        ) : (
          <span
            data-testid="operator-header-avatar-slot"
            aria-hidden
            className="shrink-0"
            style={{
              width: `${STUDIO_OPERATOR_SHELL.avatarHeaderSizePx}px`,
              height: `${STUDIO_OPERATOR_SHELL.avatarHeaderSizePx}px`,
            }}
          />
        )}

        <DropdownMenu
          modal={false}
          open={menuOpen}
          onOpenChange={(next) => {
            setMenuOpen(next)
            if (next) history.refreshSessions()
            // ⚠ 关掉菜单就把刀放下：下次打开不该有一行还举着「确认删除」。
            else setConfirmDeleteId(null)
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="operator-session-menu"
              aria-label={t('history.heading')}
              title={sessionTitle}
              /* 画板 BCards「头部 · 静止」：标题是一颗 `bg-muted` 的浅片，
                 不是一行裸字 —— 那颗片就是「这里可以点开历史」的形状。
                 ⚠ 展开时压深一档（`data-[state=open]`），⛔ 不换色相。
                 ⚠ **hug-content**（对稿 2026-09-11）：⛔ 不给 `flex-1` —— 撑满一行
                   的浅片读起来是一条输入框，而它是一颗药丸式的下拉触发器。
                 ⚠ 静息底**透明**（D7c ④ 改后）：规格胶囊走了之后标题是这一行里唯一
                   有分量的东西，再给它一块浅底等于让它跟一颗控件抢读法。hover 与
                   展开两态照旧压底 —— 可点这件事由那两态说。 */
              className="flex h-8 min-w-0 max-w-full items-center gap-1 rounded-md bg-transparent px-2.5 text-left text-sm font-medium text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent data-[state=open]:bg-surface-fill-track focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <span className="min-w-0 truncate">{sessionTitle}</span>
              <ChevronDown className="size-3.5 shrink-0" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            onInteractOutside={(event) => {
              // 点历史图标不算「点了外面」—— 否则它永远关不掉菜单（见头注）。
              if (
                event.target instanceof Element &&
                event.target.closest(`[${HISTORY_BUTTON_ATTR}]`)
              )
                event.preventDefault()
            }}
            /* ── 三层玻璃③：**浮层**（§12.1）。唯一真正半透 + 模糊的一层，
               配强投影；14px 圆角走区间上限一侧。
               ⚠ 宽 300 / 内边距 5（画板 `DesignD7cShell`「历史下拉」）。
               ⚠ **开合动效**（画板动效表前两行）：开 = 淡入 + 下移 4px，
                 ⛔ 不缩放整张菜单（`zoom-in-100` 把原语那档 95 顶掉）；
                 关 = 只淡出、不位移。原语那份 `origin-(--radix-…)` 照旧贴触发器。
               ⚠ 时长曲线走既有 token（`--duration-fast` + `ease-standard`，
                 原语已经带着后者），⛔ 不为画板上的 90ms 新开一档。
               ⚠ 降级写 `motion-reduce:animate-none` 不是 `transition-none`：
                 开合走的是 `animate-in` / `animate-out`（keyframes），⛔ 关过渡
                 关不掉动画。 */
            className="max-h-[60svh] w-75 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl p-1.25 assistant-glass-overlay shadow-assistant-overlay duration-(--duration-fast) data-[side=bottom]:slide-in-from-top-1 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 motion-reduce:animate-none"
          >
            <DropdownMenuLabel className="px-2.25 pb-1 pt-1.5 text-2xs font-normal text-muted-foreground">
              {t('history.heading')}
            </DropdownMenuLabel>
            {/* ── 加载中 = **替掉**列表（画板「加载中」那条 ⚠）───────────
                真机上现在是「读取中…」那行字和已经载出来的会话行同时挂着 ——
                于是列表读起来像「这些是旧的，新的还在路上」。三条骨架占住行位，
                ⛔ 不叠在列表上面。⚠ 骨架行高 = 真行高（`h-11`），⛔ 不许跳动。 */}
            {history.isHydrating ? (
              <div
                data-testid="operator-history-skeleton"
                role="status"
                aria-label={t('history.loading')}
              >
                {HISTORY_SKELETON_WIDTHS.map((width) => (
                  <div key={width} className="flex h-11 items-center px-2.25">
                    <span className="flex min-w-0 flex-1 flex-col gap-1.25">
                      <Skeleton className={cn('h-2.25 rounded-sm', width)} />
                      <Skeleton className="h-1.75 w-2/5 rounded-sm" />
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {/* 一条都没有 = **一句灰字**（画板「一条都没有」）：⛔ 不画插图空态，
                这是个下拉菜单不是一页；底下那颗「新对话」照常在。 */}
            {!history.isHydrating && history.sessions.length === 0 ? (
              <p
                data-testid="operator-history-empty"
                className="px-2.25 pb-4 pt-3.5 text-xs text-muted-foreground"
              >
                {t('history.empty')}
              </p>
            ) : null}
            {/* ⚠ 列表与骨架**互斥**（上面那条 ⚠）：这一行的 `isHydrating` 判据就是
                「⛔ 不叠加」本身 —— 少了它，骨架会挂在已经载出来的行上面。 */}
            {(history.isHydrating ? [] : history.sessions).map((session) => {
              /* ⚠ 域标签读的是 `surface`（线程**起始**域）—— 一条线程后来切去
                 哪儿只在它自己的域标记里，列表这一层看不到，也不该猜。
                 ⚠ 先取出来再判：直接把索引表达式塞进模板串，`null` 会一起进
                 `t()` 的键类型里（编译期就红）。 */
              const sessionDomain = SESSION_DOMAIN_BY_SURFACE[session.surface]
              return (
                <StudioOperatorSessionRow
                  key={session.id}
                  session={session}
                  domainLabel={
                    sessionDomain ? t(`domainName.${sessionDomain}`) : null
                  }
                  dateLabel={sessionDateLabel(session.updatedAt)}
                  current={session.id === history.currentSessionId}
                  selectDisabled={
                    working ||
                    Boolean(history.loadingSessionId) ||
                    history.deletingSessionId === session.id
                  }
                  deleteDisabled={
                    Boolean(history.deletingSessionId) ||
                    (working && session.id === history.currentSessionId)
                  }
                  renaming={history.renamingSessionId === session.id}
                  deleting={history.deletingSessionId === session.id}
                  confirming={confirmDeleteId === session.id}
                  onSelect={() => history.selectSession(session)}
                  onRename={(title) =>
                    void history.renameSession(session, title)
                  }
                  onRequestDelete={() => setConfirmDeleteId(session.id)}
                  onCancelDelete={cancelConfirmDelete}
                  onConfirmDelete={() => {
                    void history.deleteSession(session).then((deleted) => {
                      if (deleted) setConfirmDeleteId(null)
                    })
                  }}
                />
              )
            })}
            {history.error ? (
              <DropdownMenuItem disabled className="text-2sm text-destructive">
                {history.error}
              </DropdownMenuItem>
            ) : null}
            {/* 「新会话」在**底部**（画板 BCards「历史下拉展开」）：列表是来找
                旧东西的，新建是找不到时的兜底 —— 摆在最上面等于每次翻历史都先
                跨过一颗会把当前会话换掉的按钮。 */}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="operator-new-thread"
              disabled={working || Boolean(history.loadingSessionId)}
              onSelect={() => onNewThread()}
            >
              <MessageSquarePlus className="size-4" aria-hidden />
              {t('newThread')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ── 隐身胶囊（56a · 画板 `DesignD56Simple`「隐身开着」）──────
            ⚠ **一枚文字胶囊**，⛔ 不用红点：红点说的是「有东西要你看」，而隐身
              是一个**持续的状态** —— 它要能一眼读出来在说什么。
            ⚠ 关着时整枚不渲染（⛔ 不画停用态）：绝大多数轮次里它就不该占位。 */}
        {incognito ? (
          <span
            data-testid="operator-incognito-pill"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-2sm text-muted-foreground"
          >
            <EyeOff className="size-3.5" aria-hidden />
            {t('incognito')}
          </span>
        ) : null}

        {/* ── 有未完成计划（第三期 · 断点续跑）───────────────────────
            ⚠ 长在标题右边、成本计数左边：它是一个**动作**，而右边那两样是注脚
              与常驻入口 —— 动作排在注脚前面。
            ⚠ `busy` 时整块不渲染（见 prop 头注）。 */}
        {resume && !working ? (
          <button
            type="button"
            data-testid="operator-band-resume"
            data-step={resume.stepNumber}
            onClick={resume.onResume}
            className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-2sm font-medium text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('resume.band', { step: resume.stepNumber })}
          </button>
        ) : null}

        {/* 标题药丸 hug 之后靠这一格把右上三颗推到右边（⛔ 不靠 `flex-1` 撑标题）。 */}
        <span className="flex-1" />

        {/* ── 右上**一颗 ⋯**（D7b ④ · 画板 `DesignD7bToggle` 的「⋯ 菜单」）────
            设置 · 分隔线 · 隐身。⛔ 历史会话只走标题下拉（D12 B7：⋯ 里那一项与它
            是同一份历史，两个入口）。 */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="operator-more"
              aria-label={t('more')}
              {...{ [HISTORY_BUTTON_ATTR]: '' }}
              {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
              className={HEADER_ICON_BUTTON_CLASS}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          {/* ── 三层玻璃③：**浮层**（§12.1），与历史下拉同一层。 */}
          <DropdownMenuContent
            align="end"
            {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
            className="w-56 rounded-xl assistant-glass-overlay shadow-assistant-overlay"
          >
            <DropdownMenuItem
              data-testid="operator-assistant-settings"
              onSelect={onOpenAssistantSettings}
            >
              <Settings2 className="size-4" aria-hidden />
              {t('assistantSettings')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/**
             * 隐身（56a 切片 4）—— 现在是**真的**：开着时这一轮一条记忆都不写
             * （请求带 `incognito`，服务端结账时跳过写入）。
             * ⚠ 作用于**当前会话**，⛔ 不写库：用户为一件事临时不想被记，不该
             * 变成他此后每一轮的设置。换会话 / 刷新之后回到关着。
             * ⚠ `onSelect` 里 `preventDefault()`：切一颗开关不该顺手把菜单关掉 ——
             * 用户常常是切完想立刻确认头部那枚胶囊亮了。
             */}
            <DropdownMenuItem
              data-testid="operator-more-incognito"
              aria-checked={incognito}
              role="menuitemcheckbox"
              onSelect={(event) => {
                event.preventDefault()
                setOperatorIncognito(!incognito)
              }}
            >
              <EyeOff className="size-4" aria-hidden />
              {t('incognito')}
              {incognito ? (
                <Check className="ml-auto size-4" aria-hidden />
              ) : null}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
