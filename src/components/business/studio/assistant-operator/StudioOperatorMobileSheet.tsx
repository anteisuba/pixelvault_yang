'use client'

/**
 * 操作员面板的**手机外壳**：一张**半屏可拖**的底部 Sheet（v2 §4.6 / 画板 BMobile）。
 *
 * ⭐ **面板本身一行没改**：桌面那颗 `<aside>` 与这张 Sheet 装的是同一个
 * `StudioOperatorPanel`、同一份 props（`StudioOperatorDock` 里那一个元素，
 * 两条分支共用）。手机上变的只有**容器** —— 面板内部的疏密由 `@container`
 * 按容器宽度自己收（结果网格 2 列 / 候选 2 列），⛔ 不为手机再写一套内容。
 *
 * ── 为什么从 `100dvh` 全屏改成半屏（决策 20）────────────────────────
 * 全屏 Sheet 把工作台整个盖住，而助手改的恰恰是被盖住的那些控件 —— 用户要反复
 * 开关才能看见改动。半屏之后上半截（结果图 / 画布）**看得见也点得到**：
 *  · `modal={false}` —— vaul 的 Overlay 在非 modal 下自己 `return null`，既没有
 *    遮罩也没有 body 滚动锁，上半截照常响应点击；
 *  · 非 modal 时 vaul 把 `onPointerDownOutside` 直接 `preventDefault` ——
 *    点工作台**不会**关掉 Sheet（这正是我们要的：那一下是在改图，不是在退出）。
 *
 * ── 三档吸附 ───────────────────────────────────────────────────
 * 半屏（`halfSnapPoint`）/ 全屏（`fullSnapPoint`）/ 关闭（`open=false`）。
 * 默认开在**半屏**：vaul 在 `activeSnapPoint` 受控时认我们给的初值。
 * ⚠ **⛔ 不自己写 `translateY`**（`ui-defaults.md §6`）：吸附、跟手、回弹全归
 * vaul 管。自己接一层的下场是拖到一半松手时面板和遮罩各走各的。
 * ⚠ 拖把手：`DrawerContent` 顶部那一条（原语自带）。⛔ 不在这里再画第二条 ——
 * 而且 `handleOnly` 保持默认 `false`，整张 Sheet 的空白处都能拖，实际抓取区
 * 远大于 44（`ui-defaults.md §5` 触屏档）。
 *
 * ── 软键盘（§4.6：键盘弹起时升到全屏）──────────────────────────
 * `useKeyboardInset` 读的就是 `visualViewport`：一有遮挡，当前档就**派生**成全屏，
 * 键盘收起后自动回到用户自己那一档（`snap` 全程没被改过 —— ⛔ 不做记账）。
 * ⚠ 为什么必须升全屏：半屏 55dvh 减掉键盘那 ~300px 后，输入区上面的问题卡先
 * 被挤没，接着输入框自己也被压成一条 —— 而用户此刻正在打字。
 * ⚠ `DrawerContent` 已经把 `bottom` 钉在 `--keyboard-inset` 上（`KeyboardInsetBridge`
 * 供值），这里再把 `maxHeight` 一起扣掉 —— 只钉 bottom 不扣高，键盘弹起时整张
 * Sheet 会被顶出屏幕上沿，而输入区在最下面。
 *
 * ⚠ 收放法则（拍板 7）在手机上**只剩一半**：Sheet 关闭即收，⛔ 没有「点工作台
 * 收起」那条（`assistant-shell.md` 拍板 7）—— 半屏底下那半截工作台是给用户**看
 * 改动**的，点一下就把助手收了等于把刚才的对话丢了。这颗标记留着是因为面板
 * 内部的 Radix portal（下拉 / 弹层）仍然要认得它。
 */

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import {
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
  STUDIO_OPERATOR_MOBILE_SHELL,
} from '@/constants/studio-assistant-operator'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer'
import { useKeyboardInset } from '@/hooks/use-keyboard-inset'

const { halfSnapPoint, fullSnapPoint } = STUDIO_OPERATOR_MOBILE_SHELL

/** ⚠ 新建数组喂给 vaul：常量是 `as const`（只读），vaul 收的是可写数组。 */
const SNAP_POINTS: number[] = [halfSnapPoint, fullSnapPoint]

interface StudioOperatorMobileSheetProps {
  open: boolean
  onOpenChange(open: boolean): void
  children: ReactNode
}

export function StudioOperatorMobileSheet({
  open,
  onOpenChange,
  children,
}: StudioOperatorMobileSheetProps) {
  const t = useTranslations('StudioOperator')
  /** 用户自己停在哪一档 —— 键盘那一档是**派生**出来的，⛔ 不写进这份状态。 */
  const [snap, setSnap] = useState<number | string | null>(halfSnapPoint)
  const keyboardInset = useKeyboardInset()

  /**
   * 键盘遮挡时**派生**出全屏档，⛔ 不 `setSnap(full)` 再在键盘收起时 setState 回来。
   *
   * ⚠ 这条一开始是两个 effect + 两个 ref 写的，被 `react-hooks/set-state-in-effect`
   * 与 `react-hooks/refs` 双双拦下 —— 而规则拦得对：「键盘开着时该显示哪一档」是
   * 当前 props/state 的**函数**，不是需要同步的外部状态。派生之后「收起后回到弹起
   * 前那一档」不需要任何记账：`snap` 从头到尾就是那一档。
   */
  const activeSnap = keyboardInset > 0 ? fullSnapPoint : snap

  /**
   * 每次重新打开都回到默认那一档（半屏）：上一次拖到全屏不该记进下一次。
   *
   * ⚠ 这一条只能靠 effect：关闭是**外面**（`StudioOperatorDock` 的 host state）发起
   * 的，vaul 的 `onOpenChange` 那条路走不到；而把 `<Drawer>` 按 `open` 重挂会把
   * vaul 的收起动画直接剪掉。
   */
  useEffect(() => {
    if (open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 见上：外部发起的关闭没有事件可挂
    setSnap(halfSnapPoint)
  }, [open])

  return (
    /* ⚠ `shouldScaleBackground={false}`：背景缩放会把上半截工作台连同它正在
       显示的结果图一起缩一道 —— 而那半截恰恰是半屏 Sheet 的全部理由。 */
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
      modal={false}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={activeSnap}
      setActiveSnapPoint={setSnap}
    >
      <DrawerContent
        data-testid="operator-mobile-sheet"
        /* 当前吸附档 —— 三档切换的唯一可测读数（vaul 的 transform 在 jsdom 里
           量不出来）。⛔ 别拿它当样式钩子，视觉全归 vaul。 */
        data-snap={String(activeSnap)}
        {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
        /* ⚠ 高度走 style 不走工具类：原语自己带着 `h-auto`，同属性的两个类谁赢
           取决于 Tailwind 的输出顺序（不是 class 串里的顺序）—— 而「面板高度」
           不是可以赌的东西。行内 style 一定赢。 */
        style={{
          height: STUDIO_OPERATOR_MOBILE_SHELL.sheetHeight,
          maxHeight: `calc(${STUDIO_OPERATOR_MOBILE_SHELL.sheetHeight} - var(--keyboard-inset, 0px))`,
        }}
      >
        {/* Radix（vaul 底下就是它）要求 Content 里有 Title，缺了会在 dev 里报
            「DialogContent requires a DialogTitle」。⚠ 视觉上的标题由面板自己的
            头部承担（§4.1），所以这两行是 `sr-only` —— ⛔ 不在 Sheet 上再画
            一条标题栏，那会变成一屏两个头。 */}
        <DrawerTitle className="sr-only">{t('mobile.sheetTitle')}</DrawerTitle>
        <DrawerDescription className="sr-only">
          {t('mobile.sheetDescription')}
        </DrawerDescription>
        {/* 三段布局（头部 / 时间线 / 输入区）由面板自己排，这里只提供那个
            「能收缩的 flex 列」—— `min-h-0` 缺席时中段的 `overflow-y-auto`
            量不出高度，表现是整张 Sheet 跟着内容一起长、输入区被推到屏幕外。 */}
        <div
          className="flex min-h-0 flex-1 flex-col"
          style={{
            paddingBottom: 'var(--keyboard-safe-area-bottom, 0px)',
          }}
        >
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
