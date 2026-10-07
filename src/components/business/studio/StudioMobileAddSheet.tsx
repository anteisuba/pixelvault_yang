'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { ChevronLeft, ChevronRight, Plus } from '@/components/icons'
import type { UseStudioVideoAssetsReturn } from '@/hooks/use-studio-video-assets'
import { cn } from '@/lib/utils'
import {
  ReferenceImageCountLine,
  ReferenceImageLibraryDialog,
  ReferenceImagePickerBody,
} from '@/components/business/studio/ReferenceImageChip'
import {
  StudioVideoAssetLibraryDialog,
  StudioVideoAssetMenu,
} from '@/components/business/studio/StudioVideoAssetChip'
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioToolPopoverMaxHeightClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

/**
 * 「＋」下半截的一行。`onSelect` = 收起抽屉去别处（开舞台面板 / 既有对话框）；
 * `page` = 在抽屉里推进一页（带 ›，左上 ‹ 回来）。
 */
export type StudioMobileAddRow = {
  key: string
  icon: ReactNode
  label: string
  /** 行尾的一句现状（已选几个 / 填了几个字）。 */
  detail?: string
} & (
  | { onSelect: () => void; page?: never; toggle?: never }
  | { page: ReactNode; onSelect?: never; toggle?: never }
  /** 一行开关（「先搜再画」）：点整行拨开 / 关，抽屉不收。`detail` 写在标签下面。 */
  | {
      toggle: { checked: boolean; onChange: (next: boolean) => void }
      onSelect?: never
      page?: never
    }
)

interface StudioMobileAddSheetProps {
  disabled?: boolean
  /**
   * 下半截那几行 —— 每台给自己的（图片：模板 · 角色；视频：模板 · 剧本；
   * 标签：模板 · 查资料 · 角色构图 · 画中文字）。
   */
  rows: readonly StudioMobileAddRow[]
  /** 视频档那一份素材（与输入框顶上的素材排同一份）；不给 = 参考图。 */
  videoAssets?: UseStudioVideoAssetsReturn
  /**
   * 挂了输入框里看不见的东西（选了角色 / 填了画中文字）—— 「＋」变灰底，与描边
   * chip 的 `set` 同义；挂着的图在输入框里看得见，不算。
   */
  hasHiddenSetting?: boolean
}

/**
 * 手机输入条左下那颗「＋」（owner 2026-10-02 选「Claude 式最简」）：往这一枪里加
 * 东西的入口全收在这里，输入条只剩 提示词 / ＋ · 模型 · 规格 · 参数 · 生成。
 *
 * - 上半截是「挂素材」本体：参考图（上传 · 最近素材 · 素材库），视频档 = 与桌面
 *   「素材」chip 同一份菜单（图 · 参考视频 · 音频）。
 * - 下半截一行一项，由宿主给（`rows`）。模型参数是规格旁边那颗 chip（owner
 *   2026-10-03），⛔ 不收进这里。
 *
 * ⚠ 素材库弹窗挂在抽屉**外面**：点「素材库」先收抽屉再开弹窗，弹窗不跟着卸载
 *   （与 `ReferenceImageChip` 同一个理由）。
 */
export function StudioMobileAddSheet({
  disabled,
  rows,
  videoAssets,
  hasHiddenSetting = false,
}: StudioMobileAddSheetProps) {
  const t = useTranslations('StudioMobile')
  const [open, setOpen] = useState(false)
  const [pageKey, setPageKey] = useState<string | null>(null)
  const [imageLibraryOpen, setImageLibraryOpen] = useState(false)
  const [videoPicker, setVideoPicker] = useState<'image' | 'video' | null>(null)

  const isVideo = videoAssets !== undefined
  const activePage = rows.find((row) => row.key === pageKey && row.page)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setPageKey(null)
  }
  const close = () => handleOpenChange(false)

  const root = (
    <div className="flex flex-col gap-3">
      {isVideo ? (
        <StudioVideoAssetMenu
          assets={videoAssets}
          disabled={disabled}
          onDone={close}
          onPickLibrary={setVideoPicker}
        />
      ) : (
        <ReferenceImagePickerBody
          disabled={disabled}
          onDone={close}
          onOpenLibrary={() => {
            close()
            setImageLibraryOpen(true)
          }}
          headerSlot={<ReferenceImageCountLine />}
        />
      )}
      {rows.length > 0 ? (
        <>
          <div className="h-px bg-border/60" aria-hidden />
          <div className="flex flex-col">
            {rows.map((row) =>
              row.toggle ? (
                <AddSheetToggleRow
                  key={row.key}
                  icon={row.icon}
                  label={row.label}
                  hint={row.detail}
                  checked={row.toggle.checked}
                  onChange={row.toggle.onChange}
                  disabled={disabled}
                  testId={`studio-mobile-add-${row.key}`}
                />
              ) : (
                <AddSheetRow
                  key={row.key}
                  icon={row.icon}
                  label={row.label}
                  detail={row.detail}
                  pushes={Boolean(row.page)}
                  disabled={disabled}
                  testId={`studio-mobile-add-${row.key}`}
                  onClick={() => {
                    if (row.page) {
                      setPageKey(row.key)
                      return
                    }
                    close()
                    row.onSelect?.()
                  }}
                />
              ),
            )}
          </div>
        </>
      ) : null}
    </div>
  )

  return (
    <>
      <StudioToolSurface open={open} onOpenChange={handleOpenChange}>
        <StudioToolSurfaceTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={t('add')}
            aria-haspopup="dialog"
            data-testid="studio-mobile-add"
            data-set={hasHiddenSetting ? '' : undefined}
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-full border border-border bg-background text-foreground',
              'transition-[background-color,border-color] duration-fast ease-standard active:bg-muted',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
              hasHiddenSetting && 'border-transparent bg-muted',
              open && 'border-foreground',
            )}
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </StudioToolSurfaceTrigger>
        <StudioToolPopoverContent
          size="action"
          side="top"
          align="start"
          sideOffset={8}
          label={t('add')}
          className={cn(studioToolPopoverMaxHeightClass, 'overflow-y-auto')}
        >
          {activePage ? (
            <div className="flex flex-col gap-2">
              <div className="-ml-2 flex h-11 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPageKey(null)}
                  aria-label={t('back')}
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-foreground/75 transition-colors duration-fast ease-standard active:bg-surface-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <span className="text-sm font-medium">{activePage.label}</span>
              </div>
              {activePage.page}
            </div>
          ) : (
            root
          )}
        </StudioToolPopoverContent>
      </StudioToolSurface>

      {isVideo ? (
        <StudioVideoAssetLibraryDialog
          assets={videoAssets}
          kind={videoPicker}
          onClose={() => setVideoPicker(null)}
        />
      ) : (
        <ReferenceImageLibraryDialog
          open={imageLibraryOpen}
          onOpenChange={setImageLibraryOpen}
        />
      )}
    </>
  )
}

function AddSheetRow({
  icon,
  label,
  detail,
  onClick,
  disabled,
  pushes,
  testId,
}: {
  icon: ReactNode
  label: string
  detail?: string
  onClick: () => void
  disabled?: boolean
  /** 点下去是在抽屉里推进一页（带 ›），不是收起抽屉去别处。 */
  pushes?: boolean
  testId: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-1.5 text-left text-sm text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill active:bg-surface-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
    >
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground/80"
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? (
        <span className="max-w-40 truncate text-xs tabular-nums text-muted-foreground">
          {detail}
        </span>
      ) : null}
      {pushes ? (
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      ) : null}
    </button>
  )
}

/**
 * 抽屉里的一行开关：整行就是开关（`role="switch"`），右边一颗拨子 —— 开 = 轨变
 * 近黑、拨子横移 12px（spring-slot）。
 */
function AddSheetToggleRow({
  icon,
  label,
  hint,
  checked,
  onChange,
  disabled,
  testId,
}: {
  icon: ReactNode
  label: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  testId: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      data-testid={testId}
      className="flex min-h-13 w-full items-center gap-3 rounded-xl px-1.5 py-1.5 text-left text-sm text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill active:bg-surface-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
    >
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground/80"
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{label}</span>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          'relative h-5 w-8 shrink-0 rounded-full transition-colors duration-fast ease-standard',
          checked ? 'bg-foreground' : 'bg-surface-fill-track',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-sm transition-transform duration-spring-slot ease-spring-slot',
            checked && 'translate-x-3',
          )}
        />
      </span>
    </button>
  )
}
