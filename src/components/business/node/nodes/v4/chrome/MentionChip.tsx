'use client'

/**
 * 正文里的 `@` 引用胶囊（spec §1.7，画板 `VideoExpanded.dc.html` / `Expanded.dc.html`）。
 *
 * 灰底（`surface-fill`）+ 16px 缩略：图 / 视频给方角缩略图，语音给三根波形小标。
 * 显式写了角色前缀（`@首帧 …`）才在名字前显示前缀，⛔ 无前缀的不补「参考」两个字
 * ——那会让每一颗普通引用都长出一截噪声。
 *
 * **纯渲染**：不知道节点、不碰槽、不发 op。解析在 `parse-mentions.ts`，
 * 落槽是 S4。
 */

import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { NODE_V4_CHROME } from '@/constants/node-studio'
import { NODE_SLOT_IDS, type NodeMentionRole } from '@/constants/node-slots'
import { cn } from '@/lib/utils'

export type MentionChipMedia =
  | { readonly kind: 'image' | 'video'; readonly thumbnailUrl?: string }
  | { readonly kind: 'audio' }
  | { readonly kind: 'text' }

export interface MentionChipProps {
  readonly name: string
  readonly role?: NodeMentionRole
  /** 显式前缀才显示——见文件头注。 */
  readonly showRole?: boolean
  readonly media?: MentionChipMedia
  readonly className?: string
}

/** 语音没有缩略图，给三根高低不一的柱子当波形小标（画板同款）。 */
function WaveformGlyph() {
  return (
    <span
      aria-hidden
      className="flex h-3 shrink-0 items-end gap-px text-foreground"
    >
      <i className="block h-1.25 w-0.5 rounded-full bg-current" />
      <i className="block h-2.75 w-0.5 rounded-full bg-current" />
      <i className="block h-1.75 w-0.5 rounded-full bg-current" />
    </span>
  )
}

export function MentionChip({
  name,
  role = NODE_SLOT_IDS.reference,
  showRole = false,
  media,
  className,
}: MentionChipProps) {
  const t = useTranslations('StudioNode.v4')
  const roleLabel = t(`slots.${role}`)
  const size = NODE_V4_CHROME.mentionThumbSize

  return (
    <span
      data-mention-chip={role}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md bg-surface-fill px-1.5 py-px align-middle text-2sm whitespace-nowrap text-foreground',
        className,
      )}
    >
      {media?.kind === 'audio' ? (
        <WaveformGlyph />
      ) : media && 'thumbnailUrl' in media && media.thumbnailUrl ? (
        <Image
          src={media.thumbnailUrl}
          alt=""
          width={size}
          height={size}
          unoptimized
          className="size-4 shrink-0 rounded-xs object-cover"
        />
      ) : media ? (
        <span
          aria-hidden
          className="size-4 shrink-0 rounded-xs bg-surface-fill-track"
        />
      ) : null}
      <span className="truncate">
        @{showRole ? `${roleLabel} ` : ''}
        {name}
      </span>
    </span>
  )
}
