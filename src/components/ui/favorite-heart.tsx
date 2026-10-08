'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { Heart } from '@/components/icons'
import { SPRING } from '@/constants/motion'
import { cn } from '@/lib/utils'

/** 点 ♥ 那一下心先缩到这么大再弹回（动效样片 H，assets.md §4.6）。 */
const HEART_POP_FROM = 0.78

/**
 * 收藏的那颗心（动效样片 H）：切换时先缩一下再弹回（`SPRING.slot`），同时由描边
 * 换成涂满。**真的切换过一次**之后才弹 —— 首次挂载 / 滚回来重挂（窗口化）⛔ 弹；
 * `prefers-reduced-motion` 下只换填充、不缩放。
 *
 * 作品卡、素材瓦片、两个查看器（画廊 / 素材）共用这一颗，⛔ 各写一份。
 */
export function FavoriteHeart({
  liked,
  className,
}: {
  liked: boolean
  className?: string
}) {
  const reducedMotion = useReducedMotion()
  const [seen, setSeen] = useState({ value: liked, changed: false })
  if (seen.value !== liked) setSeen({ value: liked, changed: true })
  const pop = seen.changed && !reducedMotion

  return (
    <motion.span
      key={liked ? 'on' : 'off'}
      initial={pop ? { scale: HEART_POP_FROM } : false}
      animate={{ scale: 1 }}
      transition={SPRING.slot}
      className="grid place-items-center"
      aria-hidden
    >
      <Heart
        weight={liked ? 'fill' : 'bold'}
        className={cn('size-3.5', className)}
      />
    </motion.span>
  )
}
