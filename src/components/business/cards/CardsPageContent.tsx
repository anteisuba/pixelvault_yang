'use client'

import { motion, useTransform } from 'motion/react'

import { CharacterRoster } from '@/components/business/cards/CharacterRoster'
import { useIsMobile } from '@/hooks/use-mobile'
import { useStudioOperatorYield } from '@/hooks/use-studio-operator-yield'

/**
 * /cards 页面内容：角色页（方向 A）。
 *
 * ⭐ 地台与图片台同一套（`.workbench-ground`，四边 `--workbench-pad`）：上面一行、下面
 *   一张白卡。卡片助手展开时面板从右侧滑进来，地台的右内边距绑 `studioOperatorYield`
 *   同一根弹簧让位 —— 并排，⛔ 不覆盖（owner 09-27）。
 * ⚠ 恒绑同一个 motion 值、在变换里取值 —— ⛔ 不在 style 上把它换成 `undefined`
 *   （motion 的 style 从 motion 值换成静态值时不解绑，同图片台那条）。
 * ⚠ 只剩角色：画风卡、背景卡两个页签下线（owner 09-25）。
 * ⭐ 手机没有地台（iOS 稿 v16）：`workbench-ground-flush-phone` 把内边距与灰底拿掉。
 * ⭐ 桌面在库整页里（ui-spec §9「库」）：就画在白板上，⛔ 地台灰底。角色页没有库左栏，左右
 *   各留同一截内边距（owner 10-30「布局和间距还有问题」：内容贴着白板左边）。
 */
export function CardsPageContent() {
  const isMobile = useIsMobile()
  const operatorYield = useStudioOperatorYield()
  const paddingRight = useTransform(operatorYield, (reserve) =>
    reserve > 0
      ? `max(var(--workbench-pad), ${reserve}px)`
      : 'var(--workbench-pad)',
  )
  if (!isMobile) {
    return (
      <main className="flex h-page flex-col bg-background px-5.5 pt-3 text-foreground">
        <CharacterRoster />
      </main>
    )
  }
  return (
    <motion.main
      style={{ paddingRight }}
      className="workbench-ground workbench-ground-flush-phone h-page flex-col gap-0 text-foreground"
    >
      <CharacterRoster />
    </motion.main>
  )
}
