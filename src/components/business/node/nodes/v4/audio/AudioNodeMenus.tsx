'use client'

/**
 * 音频节点的**两张菜单**（v3 spec §4，画板 `AudioStates.dc.html` / `AudioSelected.dc.html`）：
 * 提示词栏 `+` 的添加菜单与工具条「⋯」的更多菜单。
 *
 * 两张都只是 `DropdownMenuItem` 的**列表**：壳（`NodePromptBar` / `NodeToolbar`）
 * 负责弹层与定位，⛔ 这里不自己写浮层（与 `image/ImageNodeMenus.tsx` 同一条分工）。
 *
 * ⚠ 「来源」是**只读一行**（画板原话「来源（只读一行：『来自声音库 · 平台样本 ·
 * 莫宁』）」）：它是 `outputs.versions[cur].source` 的显示，⛔ 不做成可点的项 ——
 * 点了没有任何事会发生的菜单项比没有这一项更糟。
 */

import { useTranslations } from 'next-intl'
import {
  AtSign,
  AudioLines,
  Copy,
  Library,
  Scissors,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react'

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu'

export function AudioAddMenuItems({
  onUpload,
  onAssetLibrary,
  onVoiceLibrary,
  onMention,
}: {
  onUpload(): void
  onAssetLibrary(): void
  onVoiceLibrary(): void
  onMention(): void
}) {
  const t = useTranslations('StudioNode.v4.audio')
  return (
    <>
      <DropdownMenuItem data-audio-add="upload" onSelect={onUpload}>
        <Upload aria-hidden className="size-4" />
        {t('add.upload')}
        <DropdownMenuShortcut>{t('add.uploadShortcut')}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem data-audio-add="library" onSelect={onAssetLibrary}>
        <Library aria-hidden className="size-4" />
        {t('add.library')}
      </DropdownMenuItem>
      <DropdownMenuItem data-audio-add="voices" onSelect={onVoiceLibrary}>
        <AudioLines aria-hidden className="size-4" />
        {t('add.voiceLibrary')}
      </DropdownMenuItem>
      <DropdownMenuItem data-audio-add="mention" onSelect={onMention}>
        <AtSign aria-hidden className="size-4" />
        {t('add.mention')}
      </DropdownMenuItem>
    </>
  )
}

export function AudioMoreMenuItems({
  onRename,
  onDuplicate,
  onSplitVersion,
  ownerItem,
  sourceLabel,
  onDelete,
}: {
  onRename(): void
  onDuplicate(): void
  /** 「拆出当前版本」。⚠ 只有一版时调用方传 `undefined`（拆无可拆）。 */
  onSplitVersion?: (() => void) | undefined
  /** 「归属角色…」那一项（子菜单住在 `AudioOwnerMenuItem`）。 */
  ownerItem: React.ReactNode
  /** 「来源」那一行只读小字。没有来源（自己生成的）就不出这一行。 */
  sourceLabel?: string | undefined
  onDelete(): void
}) {
  const tAudio = useTranslations('StudioNode.v4.audio')
  return (
    <>
      {/* ⋯ 的文案按**这一类卡**写（S5c 尾项：共用键写的是「重命名节点 / 克隆空
          节点 / 删除节点」，在一张音频卡上读起来像在说别的东西）。⛔ 共用键
          （`toolbar.clone` 等）的语义不动，只是这里不再用它们。 */}
      <DropdownMenuItem data-audio-more="rename" onSelect={onRename}>
        <UserRound aria-hidden className="size-4" />
        {tAudio('more.rename')}
      </DropdownMenuItem>
      <DropdownMenuItem data-audio-more="duplicate" onSelect={onDuplicate}>
        <Copy aria-hidden className="size-4" />
        {tAudio('more.duplicate')}
      </DropdownMenuItem>
      {onSplitVersion ? (
        <DropdownMenuItem data-audio-more="split" onSelect={onSplitVersion}>
          <Scissors aria-hidden className="size-4" />
          {tAudio('more.splitVersion')}
        </DropdownMenuItem>
      ) : null}
      {ownerItem}
      {sourceLabel ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel data-audio-more="source">
            <span className="block text-3xs font-normal text-muted-foreground">
              {tAudio('more.source')}
            </span>
            <span className="block truncate text-2xs font-normal text-foreground">
              {sourceLabel}
            </span>
          </DropdownMenuLabel>
        </>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        data-audio-more="delete"
        variant="destructive"
        onSelect={onDelete}
      >
        <Trash2 aria-hidden className="size-4" />
        {tAudio('more.delete')}
      </DropdownMenuItem>
    </>
  )
}
