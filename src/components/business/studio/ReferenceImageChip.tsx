'use client'

import {
  useCallback,
  useContext,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import { Image as ImageIcon, Plus } from '@/components/icons'
import { useTranslations } from 'next-intl'
import { createPortal } from 'react-dom'
import * as Toolbar from '@radix-ui/react-toolbar'

import { AssetPickerBrowser } from '@/components/business/assets/AssetPickerBrowser'
import { StudioLibraryTargetContext } from '@/components/business/studio/shell/StudioLibraryOverlay'
import { ImageAttachmentPreviewStrip } from '@/components/business/ImageAttachmentPreviewStrip'
import { ImagePickerPopoverBody } from '@/components/business/studio-shared/ImagePickerPopoverBody'
import { studioLibraryPickPath } from '@/constants/studio-shell'
import { useLibraryPickSlot } from '@/contexts/studio-library-pick'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'
import {
  StudioChipBadge,
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  useStudioChipClasses,
} from '@/components/business/studio-shared/primitives/tool-surface'

interface ReferenceImageChipProps {
  disabled?: boolean
}

/**
 * 参考图「加一张」的那一套逻辑 —— 上传 / 拖入 / 最近素材 / 素材库四条落法汇到同一个
 * `useImageUpload` store。chip 弹层与手机输入条的「＋」抽屉共用（owner 2026-10-02），
 * ⛔ 不在宿主里各写一份上传与容量判断。
 */
function useReferenceImagePicker() {
  const t = useTranslations('ImageChip')
  const { imageUpload } = useStudioData()

  const totalEntries = imageUpload.referenceEntries.length
  const isFull =
    Number.isFinite(imageUpload.maxImages) &&
    imageUpload.maxImages > 0 &&
    totalEntries >= imageUpload.maxImages
  const limitReason = isFull
    ? t('limitReached', { max: imageUpload.maxImages })
    : undefined

  /**
   * ⚠ 这里以前是 `FileReader.readAsDataURL` → `addReferenceImage`，也就是把整张
   * 图以 **base64 data URL** 塞进 `referenceImages`，随生成请求进 JSON body。
   * base64 膨胀约 33%，一张 3.4MB 的图就能把 body 顶到 Vercel Serverless 的
   * **4.5MB 硬上限**，平台层直接 413 —— 响应不是 JSON，前端只能显示
   * `Failed with status 413`，服务端的错误信息根本没机会产生。
   *
   * ⭐ 正确的那条路一直都在：`useImageUpload.handleFileChange` → `uploadLocalFile`
   * → 压缩（15MB 闸）+ multipart 上传 → 回来一个 R2 的 http(s) URL。粘贴与拖到
   * 提示词框走的就是它，只有这颗 chip 自己另写了一份。那边的注释写得很清楚：
   * 「never inlined as a multi-MB data URL in a generate request body」。
   */
  const handleFileSelect = (file: File) => {
    if (isFull) return
    void imageUpload.handleFileChange(file)
  }

  /**
   * ⚠ 消费端是 `imageUpload.addFromUrl` —— **追加**语义、且有容量
   * （`useImageUpload.maxImages`）。按 page §8.3 的判据，这种入口应当是
   * **多选**：以前挂成单选，放 4 张参考图要开 4 次弹窗。
   */
  const remainingReferenceSlots = Number.isFinite(imageUpload.maxImages)
    ? Math.max(0, imageUpload.maxImages - imageUpload.referenceEntries.length)
    : undefined

  const handleSelectAsset = async (gen: GenerationRecord) => {
    if (isFull) return
    // Defensive guard: even though AssetSelectorDialog is locked to
    // mediaType="image", a future caller wiring this chip up differently
    // could pass through a video/audio asset and addFromUrl would silently
    // attach it as a "reference image", breaking downstream generation.
    if (gen.outputType !== 'IMAGE') return
    await imageUpload.addFromUrl(gen.url)
  }

  const handleSelectAssets = async (gens: GenerationRecord[]) => {
    for (const gen of gens) {
      await handleSelectAsset(gen)
    }
  }

  return {
    totalEntries,
    isFull,
    limitReason,
    remainingReferenceSlots,
    handleFileSelect,
    handleSelectAsset,
    handleSelectAssets,
  }
}

interface ReferenceImagePickerBodyProps {
  disabled?: boolean
  /** 落了一张（或开了文件选择后选定）—— 宿主收起自己的弹层。 */
  onDone: () => void
  /** 「素材库」—— 弹窗由宿主挂在弹层**外面**，收起弹层时它不跟着卸载。 */
  onOpenLibrary: () => void
  headerSlot?: ReactNode
}

/** 弹层身体：拖拽 / 粘贴 / 上传 + 最近素材 + 素材库入口。 */
export function ReferenceImagePickerBody({
  disabled,
  onDone,
  onOpenLibrary,
  headerSlot,
}: ReferenceImagePickerBodyProps) {
  const t = useTranslations('ImageChip')
  const picker = useReferenceImagePicker()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) picker.handleFileSelect(file)
    onDone()
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || picker.isFull}
      />
      <ImagePickerPopoverBody
        dropHint={t('dropHint')}
        recentLabel={t('recentAssets')}
        recentEmptyLabel={t('recentAssetsEmpty')}
        openLibraryLabel={t('openLibrary')}
        onPickFile={() => fileInputRef.current?.click()}
        onDropFile={(file) => {
          picker.handleFileSelect(file)
          onDone()
        }}
        onPickAsset={(generation) => {
          void picker.handleSelectAsset(generation)
          onDone()
        }}
        onOpenLibrary={() => {
          if (picker.isFull) return
          onOpenLibrary()
        }}
        disabledReason={picker.limitReason}
        headerSlot={headerSlot}
      />
    </>
  )
}

/**
 * 素材库 = 外壳中间的库叠层（第 9f 步 9f-2d，⛔ 再开全屏弹窗）：「素材库」那一下打开
 * `/library/assets?pick=1`，这里把任务型那副挑选（page §8）传送进库那一格 —— 多选到剩余
 * 格数为止，挑好落进参考图、库收起回到台。桌面 chip 与手机「＋」抽屉各登记一次，后挂的
 * 那一处说了算。`portal` 由宿主原样画出来。
 */
export function useOpenReferenceImageLibrary(): () => void {
  const router = useRouter()
  return useCallback(
    () => router.push(studioLibraryPickPath('assets')),
    [router],
  )
}

/**
 * 素材库那一格里的挑选本体：登记 + 传送。⚠ 是组件、⛔ 是宿主里无条件调的 hook ——
 * 它要读 `useStudioData`，不收参考图的宿主（LoRA 台的「＋」抽屉在 `StudioProvider` 外面）
 * 就不画它。
 */
export function ReferenceImageLibraryPortal() {
  const tTools = useTranslations('StudioTools')
  const tShell = useTranslations('StudioShell')
  const picker = useReferenceImagePicker()
  const benchLabel = tTools('tools.image.label')
  const slot = useLibraryPickSlot('assets', benchLabel)
  const close = useContext(StudioLibraryTargetContext)?.close
  if (!slot) return null
  return createPortal(
    <AssetPickerBrowser
      mode="multi"
      mediaType="image"
      maxSelection={picker.remainingReferenceSlots}
      title={tShell('pickFor', { bench: benchLabel })}
      onConfirmMany={(gens) => {
        void picker.handleSelectAssets(gens)
        close?.()
      }}
      onCancel={() => close?.()}
    />,
    slot,
    'reference-image-library',
  )
}

/** 「已挂 N 张 · 最多 M 张」—— 描边外观与手机「＋」抽屉的弹层头部。 */
export function ReferenceImageCountLine() {
  const t = useTranslations('ImageChip')
  const { imageUpload } = useStudioData()
  const totalEntries = imageUpload.referenceEntries.length
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-sm font-medium">{t('referenceLabel')}</span>
      <span className="text-2xs tabular-nums text-muted-foreground">
        {Number.isFinite(imageUpload.maxImages) && imageUpload.maxImages > 0
          ? t('attachedOfMax', {
              count: totalEntries,
              max: imageUpload.maxImages,
            })
          : t('attachedCount', { count: totalEntries })}
      </span>
    </div>
  )
}

/**
 * ReferenceImageChip — Krea-style "Image" chip combining Upload + Select asset
 * into a single compose-bar entry point.
 *
 *   tap chip       → popover: drag/paste/upload dropzone + recent assets +
 *                     asset library (shared ImagePickerPopoverBody — same UI
 *                     as the prompt assistant's image entry, see
 *                     docs/references/pages/assistant-shell.md)
 *   tap Upload     → native file picker → uploadLocalFile（压缩 + multipart
 *                     → R2 URL）。⛔ 绝不是 base64 data URL，见 handleFileSelect
 *   tap Select     → close popover, open the shell's library overlay in pick
 *                     mode (`ReferenceImageLibraryPortal`). Confirmed tiles come
 *                     back through addFromUrl, up to the remaining slots.
 *
 * All paths feed the same useImageUpload store, so downstream generation
 * code is unchanged.
 */
export function ReferenceImageChip({ disabled }: ReferenceImageChipProps) {
  const t = useTranslations('ImageChip')
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const openLibrary = useOpenReferenceImageLibrary()
  const [panelBoundary, setPanelBoundary] = useState<Element | null>(null)
  const bindTrigger = useCallback((element: HTMLButtonElement | null) => {
    if (element) setPanelBoundary(element.closest('.studio-param-panel'))
  }, [])
  const popoverOpen = state.panels.refImage

  const enabledReferenceCount = imageUpload.referenceImages.length
  const totalEntries = imageUpload.referenceEntries.length
  const isActive = totalEntries > 0
  const chip = useStudioChipClasses()
  const badgeWarning =
    totalEntries > 0 && enabledReferenceCount === 0
      ? t('disabledUnsupported')
      : undefined

  const closePopover = () => {
    dispatch({ type: 'CLOSE_PANEL', payload: 'refImage' })
  }

  return (
    <>
      <StudioToolSurface
        open={popoverOpen}
        onOpenChange={(nextOpen) =>
          dispatch({
            type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
            payload: 'refImage',
          })
        }
      >
        <StudioToolSurfaceTrigger asChild>
          <Toolbar.Button
            ref={bindTrigger}
            type="button"
            disabled={disabled}
            aria-label={t('label')}
            title={badgeWarning}
            className={cn(
              chip.trigger,
              chip.look === 'outline'
                ? // 输入框左下角的「+」圆钮（ui-spec.md §9「输入框」）：加进来的图排在
                  // 字上面那一排，钮上不写字、不报数。
                  cn('w-8 justify-center px-0', popoverOpen && chip.open)
                : (isActive || popoverOpen) && chip.open,
            )}
          >
            {chip.look === 'outline' ? (
              <Plus className="size-4 shrink-0" aria-hidden />
            ) : (
              <ImageIcon className="size-4 shrink-0" />
            )}
            {chip.look === 'outline' ? null : (
              <>
                <span className="hidden sm:inline">{t('label')}</span>
                {totalEntries > 0 && (
                  <StudioChipBadge
                    title={badgeWarning}
                    ariaLabel={badgeWarning}
                  >
                    {totalEntries}
                  </StudioChipBadge>
                )}
              </>
            )}
          </Toolbar.Button>
        </StudioToolSurfaceTrigger>

        <StudioToolPopoverContent
          size="action"
          collisionBoundary={panelBoundary}
          collisionPadding={8}
          className={cn(
            'max-h-[min(28rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain',
            // 参数栏只有 288 宽，弹层收成 240；底部输入框按原型 360 宽、14 内边距。
            chip.look === 'outline' ? 'p-3.5' : 'w-60',
          )}
          side="top"
          align={chip.popoverAlign}
          sideOffset={chip.popoverSideOffset}
          label={t('label')}
        >
          <ReferenceImagePickerBody
            disabled={disabled}
            onDone={closePopover}
            onOpenLibrary={() => {
              closePopover()
              openLibrary()
            }}
            headerSlot={
              chip.look === 'outline' ? (
                // 底部输入框自己就有附件行 —— 弹层里不再摆一遍缩略图，只报数。
                <ReferenceImageCountLine />
              ) : totalEntries > 0 ? (
                <ImageAttachmentPreviewStrip
                  entries={imageUpload.referenceEntries}
                  previewAlt={t('label')}
                  removeLabel={(index) => t('removeReferenceImage', { index })}
                  onRemove={imageUpload.removeReferenceImage}
                  overLimitTooltip={t('disabledOverLimit')}
                  unsupportedTooltip={t('disabledUnsupported')}
                />
              ) : null
            }
          />
        </StudioToolPopoverContent>
      </StudioToolSurface>
      <ReferenceImageLibraryPortal />
    </>
  )
}
