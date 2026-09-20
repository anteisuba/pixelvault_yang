'use client'

/**
 * 操作员面板的**手机外壳**：一张**接近满屏**的底部 Sheet（owner 2026-09-20 真机）。
 *
 * ⭐ **面板本身一行没改**：桌面那颗 `<aside>` 与这张 Sheet 装的是同一个
 * `StudioOperatorPanel`、同一份 props（`StudioOperatorDock` 里那一个元素，
 * 两条分支共用）。手机上变的只有**容器** —— 面板内部的疏密由 `@container`
 * 按容器宽度自己收（结果网格 2 列 / 候选 2 列），⛔ 不为手机再写一套内容。
 *
 * ── 为什么从半屏（0.55）改成接近满屏（`sheetHeight`）────────────────
 * owner 原话：「感觉半屏高度不够」。半屏那一档把 376px 分成四格，而其中
 * **只有会话区是弹性的** —— 头部 / 建议 chip / 规格行 / 输入区都是固定高，于是
 * 挤压全落在会话区一个人头上：空态要 153px 只拿到 100，一句话被切掉半行。
 * 再怎么收留白也只是把撞点往后推一格。**助手就是当前任务**，它该拿到整屏。
 * ⚠ 顶上留一条窄缝（`95svh` 的那 5%）：只够让人看出「后面还有东西、这是一层
 *   可以关掉的」，⛔ 不留到能看清结果缩略图 —— 那些高度归会话区。
 *
 * ── ⛔ `snapPoints` 整套已退场 ────────────────────────────────────
 * 半屏 / 全屏两档、软键盘升档、关掉复位、`paddingBottom` 扣掉没露出来的那一截 ——
 * 全部跟着半屏一起删。只有一个高度就没有档可吸，vaul 回到它最常走的那条路：
 * 一张固定高度、往下拖即关的抽屉。⛔ 别为了「留个可拖的档」把它们找回来：
 * 两个只差 5% 的吸附档拖起来分不出来，只会让人以为拖坏了。
 *
 * ── 软键盘 ─────────────────────────────────────────────────────
 * `DrawerContent` 已经把 `bottom` 钉在 `--keyboard-inset` 上（`KeyboardInsetBridge`
 * 供值），这里再把 `maxHeight` 一起扣掉 —— 只钉 bottom 不扣高，键盘弹起时整张
 * Sheet 会被顶出屏幕上沿，而输入区在最下面。口径与 `responsive-dialog.tsx`
 * 逐字同源（`min(95svh, calc(100svh - inset))`）。
 * ⚠ ⛔ 不再「键盘一弹就升到全屏」：那是半屏档的补丁，现在本来就是满屏。
 *
 * ⚠ 收放法则（拍板 7）在手机上**只剩一半**：Sheet 关闭即收，⛔ 没有「点工作台
 * 收起」那条（`assistant-shell.md` 拍板 7）—— `modal={false}` 让 vaul 既不画遮罩
 * 也不锁 body 滚动，顶上那条缝底下的工作台照常看得见。这颗标记留着是因为面板
 * 内部的 Radix portal（下拉 / 弹层）仍然要认得它。
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

const { sheetHeight } = STUDIO_OPERATOR_MOBILE_SHELL

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
    /* ⚠ `shouldScaleBackground={false}`：背景缩放会把顶上那条缝里露出来的工作台
       连同它正在显示的结果图一起缩一道，而那条缝的全部作用就是「让人看出后面
       还有东西」。 */
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
      modal={false}
    >
      <DrawerContent
        data-testid="operator-mobile-sheet"
        /* 三层玻璃①：**面板**（§12.1）。手机上装的是同一层玻璃，圆角只在上沿
           （画板 BMobile 的 20px）—— 下沿贴着屏幕边，给它圆角只会露出一条缝。 */
        className="rounded-t-2xl border-border assistant-glass-panel"
        {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
        /* ⚠ 高度走 style 不走工具类：原语自己带着 `h-auto`，同属性的两个类谁赢
           取决于 Tailwind 的输出顺序（不是 class 串里的顺序）—— 而「面板高度」
           不是可以赌的东西。行内 style 一定赢。 */
        style={{
          height: sheetHeight,
          maxHeight: `min(${sheetHeight}, calc(100svh - var(--keyboard-inset, 0px)))`,
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
            量不出高度，表现是整张 Sheet 跟着内容一起长、输入区被推到屏幕外。
            ⭐ 这一层就是**会话区会裁剪**的根：`min-h-0` 一断，时间线就不再收缩，
            内容会直接把建议 chip 与输入区顶下去。⛔ 别删。 */}
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
