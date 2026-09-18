'use client'

import Image from 'next/image'
import { UserCircle } from '@/components/icons'

import { cn } from '@/lib/utils'

interface ProfileAvatarProps {
  avatarUrl?: string | null
  /** `next/image` 的像素尺寸；显示尺寸由 `className` 的 `size-*` 决定。 */
  size: number
  className?: string
  iconClassName?: string
}

/**
 * 「我」这颗头像的唯一画法（D3 ④ 入口）。侧栏顶端、手机顶栏胶囊与抽屉的
 * 「我」区都用它——⛔ 别再各写一份 `<Image> / <UserCircle>` 分支。
 *
 * 它只负责长相：去哪儿由调用方套的 `Link` 决定（一律是个人主页），
 * 这里不挂菜单、不挂红点。
 */
export function ProfileAvatar({
  avatarUrl,
  size,
  className,
  iconClassName,
}: ProfileAvatarProps) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground',
        className,
      )}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={size}
          height={size}
          unoptimized
          className="size-full rounded-full object-cover"
        />
      ) : (
        <UserCircle className={cn('size-4', iconClassName)} />
      )}
    </span>
  )
}
