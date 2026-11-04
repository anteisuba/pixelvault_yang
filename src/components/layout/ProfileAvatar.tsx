'use client'

import Image from 'next/image'
import { UserCircle } from '@/components/icons'

import { accountAvatarSrc, accountInitial } from '@/lib/account-avatar'
import { cn } from '@/lib/utils'

interface ProfileAvatarProps {
  avatarUrl?: string | null
  /** 没头像时写它的第一个字（`displayName ?? username`）；也没有才退回小人图标。 */
  name?: string | null
  /** `next/image` 的像素尺寸；显示尺寸由 `className` 的 `size-*` 决定。 */
  size: number
  className?: string
  iconClassName?: string
}

/** 首字字号随头像档走：24 一档 · 32 一档 · 48 往上一档。 */
function initialTextClass(size: number): string {
  if (size <= 24) return 'text-2xs'
  if (size <= 32) return 'text-xs'
  return 'text-lg'
}

/**
 * 「我」这颗头像的唯一画法（D3 ④ 入口）。左栏、账号菜单、旧侧栏与设置页的
 * 「我」区都用它——⛔ 别再各写一份 `<Image> / <UserCircle>` 分支。
 *
 * ui-spec §9 Avatar（㉗，owner 11-04）：平圆，没边没影；有图用图，没图浅灰底写名字
 * 第一个字。⚠ Clerk 自动画的那张渐变小人不算图（`accountAvatarSrc` 认掉它）。
 *
 * 它只负责长相：去哪儿由调用方套的 `Link` 决定（一律是个人主页），
 * 这里不挂菜单、不挂红点。
 */
export function ProfileAvatar({
  avatarUrl,
  name,
  size,
  className,
  iconClassName,
}: ProfileAvatarProps) {
  const src = accountAvatarSrc(avatarUrl)
  const initial = src ? null : accountInitial(name)
  return (
    <span
      data-profile-avatar={src ? 'image' : initial ? 'initial' : 'icon'}
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-fill text-muted-foreground',
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          unoptimized
          className="size-full rounded-full object-cover"
        />
      ) : initial ? (
        <span
          aria-hidden
          className={cn('font-medium text-foreground', initialTextClass(size))}
        >
          {initial}
        </span>
      ) : (
        <UserCircle className={cn('size-4', iconClassName)} />
      )}
    </span>
  )
}
