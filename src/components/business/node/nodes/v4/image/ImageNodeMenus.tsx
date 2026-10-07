'use client'

/**
 * 图片节点的**三张菜单**（spec §3，画板 `ImageToolbar.dc.html` / `ImageStates.dc.html`）：
 * 工具条的「编辑」子菜单、「⋯」更多菜单、提示词栏 `+` 的添加菜单。
 *
 * 三张都只是 `DropdownMenuItem` 的**列表**：壳（`NodeToolbar` / `NodePromptBar`）
 * 负责弹层与定位，⛔ 这里不自己写浮层。
 *
 * ── 编辑子菜单接的是**现有**图片编辑（⛔ 不新写一套）─────────────────────
 * 四项映射到 `READY_CANVAS_IMAGE_EDIT_CAPABILITY_IDS` 里已经跑得通的四条能力，
 * 宿主是既有的 `CanvasImageEditWorkspace`（它把结果落成派生节点并聚焦过去）。
 * ⚠ 「扩图」在能力表里没有独立条目，最接近的是 `upscale`；真正的 outpaint 要等
 * 能力表补，⛔ 不在这里假装它已经有了。
 */

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import type { StoryboardGridSize } from '@/constants/storyboard-grid'
import {
  Copy,
  Check,
  Crop,
  Eye,
  Globe,
  Grid2x2,
  Grid3X3,
  Image as ImageIcon,
  Layers,
  Paintbrush,
  Pencil,
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
import type { ReadyCanvasImageEditCapabilityId } from '@/types/canvas-image-edit'

import { useBrokenThumbs } from '../chrome/NodeMediaMissing'

/** 编辑子菜单的四项 → 现有能力 id。⛔ 值域不自己造，来自 `canvas-image-edit`。 */
export const IMAGE_EDIT_MENU_TASKS: readonly {
  readonly id: string
  readonly task: ReadyCanvasImageEditCapabilityId
}[] = [
  { id: 'inpaint', task: 'inpaint' },
  { id: 'expand', task: 'upscale' },
  { id: 'cutout', task: 'remove-background' },
  { id: 'background', task: 'object-replace' },
]

const EDIT_ICONS = {
  inpaint: Paintbrush,
  expand: Crop,
  cutout: Layers,
  background: ImageIcon,
} as const

export function ImageEditMenuItems({
  onPick,
}: {
  onPick(task: ReadyCanvasImageEditCapabilityId): void
}) {
  const t = useTranslations('StudioNode.v4.image')
  return (
    <>
      {IMAGE_EDIT_MENU_TASKS.map(({ id, task }) => {
        const Icon = EDIT_ICONS[id as keyof typeof EDIT_ICONS]
        return (
          <DropdownMenuItem
            key={id}
            data-image-edit-task={id}
            onSelect={() => onPick(task)}
          >
            <Icon aria-hidden className="size-4" />
            {t(`edit.${id}`)}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}

export function ImageMoreMenuItems({
  onQuickLook,
  onRename,
  onDuplicate,
  onSplitVersion,
  onSetCharacter,
  onSplitGrid,
  splitGridBusy = false,
  sourceLabel,
  onDelete,
}: {
  onQuickLook?: (() => void) | undefined
  onRename(): void
  onDuplicate(): void
  /**
   * 「切宫格 3×3 / 2×2」（§3 九宫格分镜的手动那一条）。宿主没接切开能力、或卡上还
   * 没有图 → 调用方传 `undefined`，整组不出。
   */
  onSplitGrid?: ((size: StoryboardGridSize) => void) | undefined
  /** 正在切：两项灰掉（⛔ 同一张图并发切两次）。 */
  readonly splitGridBusy?: boolean
  /** 当前版的来源（九宫格切出来的那一格写「九宫格 · 天台 · 第 3 格」），只读。 */
  readonly sourceLabel?: string | undefined
  /** 「拆出当前版本」（spec §3）。⚠ 只有一版时调用方传 `undefined`（拆无可拆）。 */
  onSplitVersion?: (() => void) | undefined
  /**
   * 「设为角色卡」。⚠ 已经是角色卡的那张不给这一项 —— 调用方传 `undefined`，
   * ⛔ 不摆一个按了什么都不变的灰项。
   */
  onSetCharacter?: (() => void) | undefined
  onDelete(): void
}) {
  const tImage = useTranslations('StudioNode.v4.image')
  const tVideo = useTranslations('StudioNode.v4.video')
  return (
    <>
      {onQuickLook ? (
        <DropdownMenuItem data-image-more="quick-look" onSelect={onQuickLook}>
          <Eye aria-hidden className="size-4" />
          {tVideo('more.quickLook')}
        </DropdownMenuItem>
      ) : null}
      {/* ⋯ 的文案按**这一类卡**写（S5c 尾项）。⛔ 共用键的语义不动。 */}
      <DropdownMenuItem data-image-more="rename" onSelect={onRename}>
        <Pencil aria-hidden className="size-4" />
        {tImage('more.rename')}
      </DropdownMenuItem>
      <DropdownMenuItem data-image-more="duplicate" onSelect={onDuplicate}>
        <Copy aria-hidden className="size-4" />
        {tImage('more.duplicate')}
      </DropdownMenuItem>
      {onSplitVersion ? (
        <DropdownMenuItem data-image-more="split" onSelect={onSplitVersion}>
          {/* 拆出一版 = 从一摞版本里抽一张；⛔ 剪刀只留给「裁剪」。 */}
          <Layers aria-hidden className="size-4" />
          {tImage('more.splitVersion')}
        </DropdownMenuItem>
      ) : null}
      {onSetCharacter ? (
        <DropdownMenuItem
          data-image-more="set-character"
          onSelect={onSetCharacter}
        >
          <UserRound aria-hidden className="size-4" />
          {tImage('more.setCharacter')}
        </DropdownMenuItem>
      ) : null}
      {onSplitGrid ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-image-more="split-grid-3"
            disabled={splitGridBusy}
            onSelect={() => onSplitGrid(3)}
          >
            <Grid3X3 aria-hidden className="size-4" />
            {tImage('storyboard.split3')}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-image-more="split-grid-2"
            disabled={splitGridBusy}
            onSelect={() => onSplitGrid(2)}
          >
            <Grid2x2 aria-hidden className="size-4" />
            {tImage('storyboard.split2')}
          </DropdownMenuItem>
        </>
      ) : null}
      {sourceLabel ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel data-image-more="source">
            <span className="block text-3xs font-normal text-muted-foreground">
              {tImage('more.source')}
            </span>
            <span className="block truncate text-2xs font-normal text-foreground">
              {sourceLabel}
            </span>
          </DropdownMenuLabel>
        </>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        data-image-more="delete"
        variant="destructive"
        onSelect={onDelete}
      >
        <Trash2 aria-hidden className="size-4" />
        {tImage('more.delete')}
      </DropdownMenuItem>
    </>
  )
}

export function ImageAddMenuItems({
  onUpload,
  onLibrary,
  canvasCandidates,
  onPickCanvas,
  searchGrounding,
}: {
  onUpload(): void
  onLibrary(): void
  /** 画布上已有产物的图（生成的 / 上传的），挂进参考槽。 */
  readonly canvasCandidates?: readonly {
    readonly id: string
    readonly name: string
    readonly thumbnailUrl?: string | undefined
    readonly attached?: boolean
    readonly blockedReason?: string | undefined
  }[]
  onPickCanvas?(nodeId: string): void
  /**
   * 「先搜再画」开关（B 定稿：在「+」菜单里，跟这张卡存）。只对支持的型号给；
   * 拨动不收菜单。
   */
  searchGrounding?: { checked: boolean; onChange(next: boolean): void }
}) {
  const t = useTranslations('StudioNode.v4.image')
  const tNode = useTranslations('StudioNode.v4')
  const thumbs = useBrokenThumbs()
  const canvas = canvasCandidates ?? []
  return (
    <>
      <DropdownMenuItem
        data-image-add="upload"
        onSelect={onUpload}
        className="h-9.5 cursor-pointer gap-2.5 rounded-lg px-2.5 text-2sm text-foreground hover:bg-surface-fill focus:bg-surface-fill"
      >
        <Upload aria-hidden className="size-4" />
        {t('add.upload')}
        <DropdownMenuShortcut className="font-mono text-2xs tracking-normal text-muted-foreground/75">
          ⌘U
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        data-image-add="library"
        onSelect={onLibrary}
        className="h-9.5 cursor-pointer gap-2.5 rounded-lg px-2.5 text-2sm text-foreground hover:bg-surface-fill focus:bg-surface-fill"
      >
        <ImageIcon aria-hidden className="size-4" />
        {t('add.library')}
      </DropdownMenuItem>
      {onPickCanvas ? (
        <>
          <div className="flex justify-between px-2.5 pt-2.5 pb-1.5 text-2xs tracking-wide text-muted-foreground">
            <span>{tNode('addCanvasTitle')}</span>
            <span>{tNode('addCanvasHint')}</span>
          </div>
          {canvas.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-2.5 pb-2">
              {canvas.map((candidate) => (
                <DropdownMenuItem
                  key={candidate.id}
                  data-image-add-canvas={candidate.id}
                  data-attached={candidate.attached ? 'true' : undefined}
                  aria-label={tNode('addCanvasAttach', {
                    name: candidate.name,
                  })}
                  aria-disabled={Boolean(
                    candidate.blockedReason && !candidate.attached,
                  )}
                  title={
                    candidate.attached
                      ? candidate.name
                      : (candidate.blockedReason ?? candidate.name)
                  }
                  onSelect={(event) => {
                    if (candidate.attached) return
                    if (candidate.blockedReason) {
                      event.preventDefault()
                      return
                    }
                    onPickCanvas(candidate.id)
                  }}
                  className={`relative size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-fill p-0 text-muted-foreground focus:bg-surface-fill ${candidate.blockedReason && !candidate.attached ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:ring-2 hover:ring-foreground focus:ring-2 focus:ring-foreground'}`}
                >
                  {thumbs.usable(candidate.thumbnailUrl) ? (
                    <Image
                      src={candidate.thumbnailUrl!}
                      alt=""
                      width={48}
                      height={48}
                      unoptimized
                      onError={() => thumbs.markBroken(candidate.thumbnailUrl!)}
                      className="size-full object-cover"
                    />
                  ) : (
                    <ImageIcon aria-hidden className="m-auto size-4" />
                  )}
                  {candidate.attached ? (
                    <span className="absolute top-0.75 right-0.75 flex size-4 items-center justify-center rounded-full bg-foreground text-card">
                      <Check aria-hidden className="size-2.5" />
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </div>
          ) : (
            <div className="px-2.5 pb-2 text-xs text-muted-foreground/75">
              {tNode('addCanvasEmpty')}
            </div>
          )}
        </>
      ) : null}
      {searchGrounding ? (
        <>
          <DropdownMenuSeparator className="mx-1.5 my-1" />
          <ImageSearchGroundingMenuItem {...searchGrounding} />
        </>
      ) : null}
    </>
  )
}

/**
 * 「先搜再画」那一行开关：整行是 `menuitemcheckbox`，右边一颗拨子（开 = 轨变近黑、
 * 拨子横移 12px，spring-slot）。拨动不收菜单。桌面在「+」菜单底部，手机抽屉里
 * 单独挂这一项。
 */
export function ImageSearchGroundingMenuItem({
  checked,
  onChange,
}: {
  checked: boolean
  onChange(next: boolean): void
}) {
  const tSearch = useTranslations('SearchGrounding')
  return (
    <DropdownMenuItem
      data-image-add="search-grounding"
      role="menuitemcheckbox"
      aria-checked={checked}
      onSelect={(event) => {
        event.preventDefault()
        onChange(!checked)
      }}
      className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-2sm text-foreground hover:bg-surface-fill focus:bg-surface-fill"
    >
      <Globe aria-hidden className="size-4" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span>{tSearch('toggle')}</span>
        <small className="text-2xs leading-snug text-muted-foreground">
          {tSearch('hintCard')}
        </small>
      </span>
      <span
        aria-hidden
        className={`relative h-5 w-8 shrink-0 rounded-full transition-colors duration-fast ease-standard ${checked ? 'bg-foreground' : 'bg-surface-fill-track'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-sm transition-transform duration-spring-slot ease-spring-slot ${checked ? 'translate-x-3' : ''}`}
        />
      </span>
    </DropdownMenuItem>
  )
}
