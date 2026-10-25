'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { Bookmark } from '@/components/icons'
import { SPRING } from '@/constants/motion'
import { cn } from '@/lib/utils'

/** 点收藏那一下书签先缩到这么大再弹回（动效样片 H，assets.md §4.6）。 */
const BOOKMARK_POP_FROM = 0.78

/**
 * 收藏 = 书签（ui-spec.md §9「收藏」⑳，⛔ 红心）：没收藏线框、收藏了涂满。切换时先缩
 * 一下再弹回（`SPRING.slot`）。**真的切换过一次**之后才弹 —— 首次挂载 / 滚回来重挂
 * （窗口化）⛔ 弹；`prefers-reduced-motion` 下只换填充、不缩放。
 *
 * 作品卡、素材瓦片、两个查看器（画廊 / 素材）共用这一颗，⛔ 各写一份。
 */
export function FavoriteBookmark({
  saved,
  className,
}: {
  saved: boolean
  className?: string
}) {
  const reducedMotion = useReducedMotion()
  const [seen, setSeen] = useState({ value: saved, changed: false })
  if (seen.value !== saved) setSeen({ value: saved, changed: true })
  const pop = seen.changed && !reducedMotion

  return (
    <motion.span
      key={saved ? 'on' : 'off'}
      initial={pop ? { scale: BOOKMARK_POP_FROM } : false}
      animate={{ scale: 1 }}
      transition={SPRING.slot}
      className="grid place-items-center"
      aria-hidden
    >
      <Bookmark
        weight={saved ? 'fill' : 'regular'}
        className={cn('size-3.5', className)}
      />
    </motion.span>
  )
}
