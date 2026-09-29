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
  AudioLines,
  Copy,
  Download,
  ImageIcon,
  Layers,
  Trash2,
  Upload,
  UserRound,
} from '@/components/icons'

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
  canvasCandidates = [],
}: {
  onUpload(): void
  onAssetLibrary(): void
  onVoiceLibrary(): void
  readonly canvasCandidates?: readonly {
    readonly id: string
    readonly name: string
    readonly audioUrl?: string | undefined
  }[]
}) {
  const t = useTranslations('StudioNode.v4.audio')
  const tNode = useTranslations('StudioNode.v4')
  const canvas = canvasCandidates.filter((candidate) => candidate.audioUrl)
  const referenceUnavailable = t('add.referenceUnavailable')
  return (
    <>
      <DropdownMenuItem
        data-audio-add="upload"
        onSelect={onUpload}
        className="h-9.5 cursor-pointer gap-2.5 rounded-lg px-2.5 text-2sm text-foreground hover:bg-surface-fill focus:bg-surface-fill"
      >
        <Upload aria-hidden className="size-4" />
        {t('add.upload')}
        <DropdownMenuShortcut className="font-mono text-2xs tracking-normal text-muted-foreground/75">
          {t('add.uploadShortcut')}
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        data-audio-add="library"
        onSelect={onAssetLibrary}
        className="h-9.5 cursor-pointer gap-2.5 rounded-lg px-2.5 text-2sm text-foreground hover:bg-surface-fill focus:bg-surface-fill"
      >
        <ImageIcon aria-hidden className="size-4" />
        {t('add.library')}
      </DropdownMenuItem>
      <DropdownMenuItem
        data-audio-add="voices"
        onSelect={onVoiceLibrary}
        className="h-9.5 cursor-pointer gap-2.5 rounded-lg px-2.5 text-2sm text-foreground hover:bg-surface-fill focus:bg-surface-fill"
      >
        <AudioLines aria-hidden className="size-4" />
        {t('add.voiceLibrary')}
      </DropdownMenuItem>
      <div className="flex justify-between px-2.5 pt-2.5 pb-1.5 text-2xs tracking-wide text-muted-foreground">
        <span>{tNode('addCanvasTitle')}</span>
        <span>{tNode('addCanvasHint')}</span>
      </div>
      {canvas.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 px-2.5 pb-2">
          {canvas.map((candidate) => (
            <DropdownMenuItem
              key={candidate.id}
              data-audio-add-canvas={candidate.id}
              aria-disabled="true"
              aria-label={`${candidate.name} · ${referenceUnavailable}`}
              title={referenceUnavailable}
              onSelect={(event) => event.preventDefault()}
              className="relative size-12 shrink-0 cursor-not-allowed overflow-hidden rounded-lg border border-border bg-surface-fill-hover p-0 text-muted-foreground opacity-40 focus:bg-surface-fill-hover"
            >
              <AudioLines aria-hidden className="m-auto size-4" />
            </DropdownMenuItem>
          ))}
        </div>
      ) : (
        <div
          data-audio-add-empty
          className="px-2.5 pb-2 text-xs text-muted-foreground/75"
        >
          {tNode('addCanvasEmpty')}
        </div>
      )}
    </>
  )
}

export function AudioMoreMenuItems({
  onRename,
  onDuplicate,
  onSplitVersion,
  onDownload,
  ownerItem,
  sourceLabel,
  onDelete,
}: {
  onRename(): void
  onDuplicate(): void
  /**
   * 「下载」—— 从工具条收进 ⋯（方向 B：每类卡最多 4 个动作 + ⋯）。没片时调用方传
   * `undefined`，⛔ 不摆一个按了什么都不下的项。
   */
  onDownload?: (() => void) | undefined
  /** 「拆出当前版本」。⚠ 只有一版时调用方传 `undefined`（拆无可拆）。 */
  onSplitVersion?: (() => void) | undefined
  /** 「归属角色…」那一项（子菜单住在 `AudioOwnerMenuItem`）。 */
  ownerItem: React.ReactNode
  /** 「来源」那一行只读小字。没有来源（自己生成的）就不出这一行。 */
  sourceLabel?: string | undefined
  onDelete(): void
}) {
  const tAudio = useTranslations('StudioNode.v4.audio')
  const tNode = useTranslations('StudioNode.v4')
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
      {onDownload ? (
        <DropdownMenuItem data-audio-more="download" onSelect={onDownload}>
          <Download aria-hidden className="size-4" />
          {tNode('toolbar.download')}
        </DropdownMenuItem>
      ) : null}
      {onSplitVersion ? (
        <DropdownMenuItem data-audio-more="split" onSelect={onSplitVersion}>
          {/* 拆出一版 = 从一摞版本里抽一张；⛔ 剪刀只留给「裁剪」。 */}
          <Layers aria-hidden className="size-4" />
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
