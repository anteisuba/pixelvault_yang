'use client'

/**
 * 操作员面板的**手机外壳**：一张全屏的底部 Sheet。
 *
 * ⭐ **面板本身一行没改**：桌面那颗 `<aside>` 与这张 Sheet 装的是同一个
 * `StudioOperatorPanel`、同一份 props（`StudioOperatorDock` 里那一个元素，
 * 两条分支共用）。手机上变的只有**容器** —— 面板内部的疏密由 `@container`
 * 按容器宽度自己收（结果网格 2 列 / 候选 2 列），⛔ 不为手机再写一套内容。
 *
 * ⚠ 用 vaul（`components/ui/drawer.tsx`）不是 Radix `Sheet`：`ui-defaults.md §6`
 * 的移动端配方里「侧栏面板 → 底部 vaul 抽屉」，而 vaul 比 Radix 多给的正是
 * **下拉关闭**那一下 —— 全屏面板上那是最顺手的退出手势。Esc / 点遮罩 / focus
 * trap 与 focus return 两者都由原语给，⛔ 这里不自己写。
 *
 * ⚠ **⛔ 不自己写 `translateY`**（`ui-defaults.md §6`）：进出场与拖拽跟手全归
 * vaul 管。自己接一层的下场是拖到一半松手时面板和遮罩各走各的。
 *
 * ⚠ 软键盘：`DrawerContent` 已经把 `bottom` 钉在 `--keyboard-inset` 上
 * （`KeyboardInsetBridge` 供值），这里再把 `maxHeight` 一起扣掉 —— 只钉 bottom
 * 不扣高，键盘弹起时整张 Sheet 会被顶出屏幕上沿，而输入区在最下面。
 *
 * ⚠ 收放法则（拍板 7）在手机上**只剩一半**：Sheet 关闭即收，⛔ 没有「点工作台
 * 收起」那条（`assistant-shell.md` 拍板 7）—— 全屏 Sheet 底下根本没有工作台可点。
 * 这颗标记留着是因为面板内部的 Radix portal（下拉 / 弹层）仍然要认得它。
 */

import type { ReactNode } from 'react'
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

  return (
    /* ⚠ `shouldScaleBackground={false}`：背景缩放是给**半高**抽屉的（露出来的那
       一截才看得见缩放）。全屏 Sheet 底下什么都露不出来，留着只是在每次开合时
       多跑一条 transform。 */
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
    >
      <DrawerContent
        data-testid="operator-mobile-sheet"
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
            进度带承担（§2.4），所以这两行是 `sr-only` —— ⛔ 不在 Sheet 上再画
            一条标题栏，那会变成一屏两个头。 */}
        <DrawerTitle className="sr-only">{t('mobile.sheetTitle')}</DrawerTitle>
        <DrawerDescription className="sr-only">
          {t('mobile.sheetDescription')}
        </DrawerDescription>
        {/* 三段布局（进度带 / 时间线 / 输入区）由面板自己排，这里只提供那个
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
