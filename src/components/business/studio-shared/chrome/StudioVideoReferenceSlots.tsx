'use client'

/**
 * 视频工作台参考区的**三个具名槽**：首帧 / 尾帧 / 参考视频（第二期）。
 *
 * ── 为什么是具名槽（工程原则 1）───────────────────────────────────
 * 首尾帧此前靠**下标**承载（`constants/reference-image-capabilities.ts` 里 WAN_30
 * 那段头注写得很明白：「[0] 首帧、[1] 尾帧」）。位置承载的代价是具体的：把第一张
 * 删掉，第二张就静默升级成首帧；「只有尾帧、没有首帧」这个状态在结构上表达不出来。
 * 槽有名字之后两件事都不会再发生 —— 老那套已在这一轮删掉（`lib/studio/
 * reference-rail-slot.ts` 的 `'first-frame'` 档 + 参考轨在关键帧档下的首帧文案）。
 *
 * ── 三条落法，一处写入 ────────────────────────────────────────────
 * 拖入 · 素材库选择 · 助手 `mount_reference slot`。三条最终 dispatch 的是同一个
 * action（见 `use-video-reference-slots.ts` 头注），⛔ 组件里没有第二条写入。
 *
 * ── 不渲染 ≠ 禁用 ────────────────────────────────────────────────
 * 不支持尾帧的模型**不渲染尾帧槽**（`ui-defaults.md` 状态配方）。一个永远点不动
 * 的框只会让人反复去试它，而它给不出任何解释。
 */

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Film, ImagePlus, Upload, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import { GENERATION_REVIEW_STATE_IDS } from '@/constants/assistant-operator'
import { STUDIO_VIDEO_SLOT_SIZE_PX } from '@/constants/studio-assistant-operator'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { Spinner } from '@/components/ui/spinner'
import { getOperatorReviewState } from '@/hooks/use-studio-operator-store'
import { parseDroppedAssetIds } from '@/hooks/use-studio-operator-mention'
import { useVideoReferenceSlots } from '@/hooks/use-video-reference-slots'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

interface StudioVideoReferenceSlotsProps {
  selectedModel: { modelId: string; adapterType?: string } | null | undefined
  disabled?: boolean
}

/** 秒 → `m:ss`。⚠ 缺时长时**不画那行**，⛔ 不写「0:00」（那是个错的事实）。 */
function formatDuration(seconds: number | null | undefined): string | null {
  if (
    typeof seconds !== 'number' ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return null
  }
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

interface SlotShellProps {
  testId: string
  label: string
  filled: boolean
  disabled: boolean
  busy: boolean
  onPick(): void
  onDropUrl(url: string): void
  onDropFile?(file: File): void
  /**
   * 拖进来的这几件**收不收**（切片 Y）。
   *
   * ⭐ 判据在宿主那边（首尾帧槽拒「已否」的产物），⛔ 不写在这颗壳里：参考视频
   * 槽用同一颗壳，而那一档没有这条限制。缺席 = 这个槽什么都收。
   * ⚠ 返回 false 时**由宿主说话**（它才知道拒的理由）—— 这里只负责不写进去。
   */
  guardDrop?(assetIds: readonly string[]): boolean
  onClear(): void
  clearLabel: string
  /**
   * 本地上传那条路。⚠ 与 `onPick`（素材库）**并列而不是二选一**：库里挑与从盘里
   * 拿是两件不同的事，把它们叠进同一次点击等于让其中一条没有入口。
   * 缺席 = 这个槽不收本地文件（参考视频槽今天就是：`uploadVideoFileAPI` 要
   * 宽高与时长，那一跳还没做）。
   */
  onUpload?: (() => void) | undefined
  uploadLabel: string
  children: React.ReactNode
}

function SlotShell({
  testId,
  label,
  filled,
  disabled,
  busy,
  onPick,
  onDropUrl,
  onDropFile,
  guardDrop,
  onClear,
  clearLabel,
  onUpload,
  uploadLabel,
  children,
}: SlotShellProps) {
  const [isOver, setIsOver] = useState(false)

  /**
   * ⚠ 原生 drop 而不是 pragmatic-dnd：这里要同时接**本地文件**与画廊格子拖过来
   * 的那条 URL，而 pragmatic 的 element adapter 只认自己那套 payload。
   * 画廊格子拖动时同时写了 `text/uri-list`，两边都接得住。
   */
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsOver(false)
    if (disabled) return
    /**
     * ⭐ **先问准入，再看载荷**（切片 Y）：画廊格子拖过来时同时写了库内 id
     * （`ASSET_DND_MIME`）与一条 uri-list。被判「已否」的那张要在这里就拦下 ——
     * 落进槽里再回滚的表现是「图闪进去又自己消失」，没有人知道发生了什么。
     * ⚠ 只有拖的是库内资产时才有 id 可问；本地文件与裸 URL 照旧放行（它们身上
     *   没有身份，客户端问不出审核态）。
     */
    const assetIds = parseDroppedAssetIds(
      event.dataTransfer.getData(ASSET_DND_MIME),
    )
    if (assetIds.length > 0 && guardDrop && !guardDrop(assetIds)) return
    const file = event.dataTransfer.files?.[0]
    if (file && onDropFile) {
      onDropFile(file)
      return
    }
    const url =
      event.dataTransfer.getData('text/uri-list') ||
      event.dataTransfer.getData('text/plain')
    if (url && /^https?:\/\//.test(url)) onDropUrl(url)
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        data-testid={testId}
        data-filled={filled}
        data-over={isOver}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setIsOver(true)
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={handleDrop}
        className="relative"
        style={{
          width: STUDIO_VIDEO_SLOT_SIZE_PX,
          height: STUDIO_VIDEO_SLOT_SIZE_PX,
        }}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={onPick}
          aria-label={label}
          className={cn(
            'flex size-full items-center justify-center overflow-hidden rounded-lg transition-colors duration-fast ease-standard motion-reduce:transition-none',
            /* 🔬 contrast-check（2026-09-07）：
               · 空槽那圈虚线**就是**这个组件唯一的边界，按 WCAG 1.4.11 走 3:1。
                 `border-border` 只有 **1.26** / **1.26**（浅 / 深）—— 远不够；
                 `muted-foreground/80` 是刚过线的那一档：**3.59** / **5.22**。
                 （与排队条那条 `/70` 订正同一条判据。）
               · 填充态那圈 `border-border` 是**装饰性强化**：边界由格子里那张图
                 自己承担，所以不受 3:1 约束。
               · 槽名 `text-muted-foreground` 对页底 **5.49** / **7.66** ✓ */
            filled
              ? 'border border-border'
              : 'border border-dashed border-muted-foreground/80 text-muted-foreground hover:border-primary hover:text-foreground',
            isOver && 'border-primary ring-2 ring-primary/35',
            disabled && 'opacity-50',
          )}
        >
          {busy ? <Spinner size="sm" /> : children}
        </button>
        {!filled && !disabled && onUpload ? (
          <button
            type="button"
            data-testid={`${testId}-upload`}
            aria-label={uploadLabel}
            onClick={onUpload}
            className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground motion-reduce:transition-none"
          >
            <Upload className="size-3" aria-hidden />
          </button>
        ) : null}
        {filled && !disabled ? (
          <button
            type="button"
            data-testid={`${testId}-clear`}
            aria-label={clearLabel}
            onClick={onClear}
            className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground motion-reduce:transition-none"
          >
            <X className="size-3" aria-hidden />
          </button>
        ) : null}
      </div>
      <span className="font-mono text-2xs text-muted-foreground">{label}</span>
    </div>
  )
}

export function StudioVideoReferenceSlots({
  selectedModel,
  disabled = false,
}: StudioVideoReferenceSlotsProps) {
  const t = useTranslations('StudioVideoSlots')
  /** 拒绝那一句住在助手的 `reject` 档里 —— 它说的是「助手/审核为什么不收」。 */
  const tOperator = useTranslations('StudioOperator')
  const slots = useVideoReferenceSlots(selectedModel)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFrame, setPendingFrame] = useState<'first' | 'last' | null>(
    null,
  )
  const [picker, setPicker] = useState<'first' | 'last' | 'video' | null>(null)
  /** 参考视频的时长只从素材库那条路上拿得到 —— 拖进来的裸 URL 没有它。 */
  const [videoDurations, setVideoDurations] = useState<
    Record<string, number | undefined>
  >({})

  if (
    !slots.visible.first &&
    !slots.visible.last &&
    slots.visible.videos <= 0
  ) {
    return null
  }

  const openFilePicker = (slot: 'first' | 'last') => {
    setPendingFrame(slot)
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file && pendingFrame) void slots.uploadFrameFile(pendingFrame, file)
    setPendingFrame(null)
  }

  /**
   * ⭐ **首尾帧拒收「已否」的产物**（切片 Y）—— 客户端先拒，⛔ 不等服务端。
   *
   * 判据：标 blocked 说的正是「这张不能再开头也不能收尾」（见
   * `GENERATION_REVIEW_STATE_IDS.blocked` 的头注）。悄悄收下再让服务端拒的表现
   * 是「拖进去了、生成时才报错」，而那时用户早忘了这一张是哪来的。
   * ⚠ 拒的时候**要说话**（toast）：⛔ 不做「拖不进去也不解释」的死角。
   * ⚠ ⛔ 参考视频槽不接这只手：那一档没有首尾之分，blocked 不该连它一起拦。
   */
  const allowFrameSource = (assetIds: readonly string[]): boolean => {
    const blocked = assetIds.some(
      (id) =>
        getOperatorReviewState(id) === GENERATION_REVIEW_STATE_IDS.blocked,
    )
    if (blocked) {
      toast.error(tOperator('reject.blockedSource'))
      return false
    }
    return true
  }

  const handlePicked = (generation: GenerationRecord) => {
    if (picker === 'video') {
      if (generation.outputType !== 'VIDEO') return
      slots.addVideo(generation.url)
      setVideoDurations((prev) => ({
        ...prev,
        [generation.url]: generation.duration ?? undefined,
      }))
      return
    }
    if (!picker) return
    if (generation.outputType !== 'IMAGE') return
    // ⭐ 素材库那条路与拖入同一道闸 —— 两条各判一次的下场是其中一条静默过期。
    if (!allowFrameSource([generation.id])) return
    slots.setFrame(picker, generation.url)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-medium text-muted-foreground/70">
        {t('sectionLabel')}
      </span>
      <div
        data-testid="studio-video-reference-slots"
        className="flex flex-wrap items-start gap-3"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />

        {slots.visible.first ? (
          <SlotShell
            testId="video-slot-first"
            label={t('firstFrame')}
            filled={slots.first !== null}
            disabled={disabled}
            busy={slots.isUploading && pendingFrame === 'first'}
            onPick={() => setPicker('first')}
            onUpload={() => openFilePicker('first')}
            uploadLabel={t('upload', { slot: t('firstFrame') })}
            onDropUrl={(url) => slots.setFrame('first', url)}
            guardDrop={allowFrameSource}
            onDropFile={(file) => void slots.uploadFrameFile('first', file)}
            onClear={() => slots.setFrame('first', null)}
            clearLabel={t('clear', { slot: t('firstFrame') })}
          >
            {slots.first ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slots.first}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <ImagePlus className="size-4" aria-hidden />
            )}
          </SlotShell>
        ) : null}

        {slots.visible.last ? (
          <SlotShell
            testId="video-slot-last"
            label={t('lastFrame')}
            filled={slots.last !== null}
            disabled={disabled}
            busy={slots.isUploading && pendingFrame === 'last'}
            onPick={() => setPicker('last')}
            onUpload={() => openFilePicker('last')}
            uploadLabel={t('upload', { slot: t('lastFrame') })}
            onDropUrl={(url) => slots.setFrame('last', url)}
            guardDrop={allowFrameSource}
            onDropFile={(file) => void slots.uploadFrameFile('last', file)}
            onClear={() => slots.setFrame('last', null)}
            clearLabel={t('clear', { slot: t('lastFrame') })}
          >
            {slots.last ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={slots.last} alt="" className="size-full object-cover" />
            ) : (
              <ImagePlus className="size-4" aria-hidden />
            )}
          </SlotShell>
        ) : null}

        {slots.visible.videos > 0 ? (
          <>
            {slots.videos.map((url) => {
              const duration = formatDuration(videoDurations[url])
              return (
                <div key={url} className="flex flex-col gap-1">
                  <div
                    data-testid="video-slot-video-filled"
                    className="relative overflow-hidden rounded-lg border border-border"
                    style={{
                      width: STUDIO_VIDEO_SLOT_SIZE_PX,
                      height: STUDIO_VIDEO_SLOT_SIZE_PX,
                    }}
                  >
                    <video
                      src={url}
                      muted
                      playsInline
                      preload="metadata"
                      className="size-full object-cover"
                      onLoadedMetadata={(event) =>
                        setVideoDurations((prev) => ({
                          ...prev,
                          [url]: event.currentTarget.duration,
                        }))
                      }
                    />
                    {!disabled ? (
                      <button
                        type="button"
                        aria-label={t('clear', { slot: t('referenceVideo') })}
                        onClick={() => slots.removeVideo(url)}
                        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground motion-reduce:transition-none"
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                  <span className="font-mono text-2xs text-muted-foreground">
                    {duration ?? t('referenceVideo')}
                  </span>
                </div>
              )
            })}
            {slots.videos.length < slots.visible.videos ? (
              <SlotShell
                testId="video-slot-video"
                label={t('referenceVideo')}
                filled={false}
                disabled={disabled}
                busy={false}
                onPick={() => setPicker('video')}
                uploadLabel={t('upload', { slot: t('referenceVideo') })}
                onDropUrl={(url) => slots.addVideo(url)}
                onClear={() => undefined}
                clearLabel={t('clear', { slot: t('referenceVideo') })}
              >
                <Film className="size-4" aria-hidden />
              </SlotShell>
            ) : null}
          </>
        ) : null}
      </div>

      {/* 素材库 —— 帧槽是**单选**（填一个槽 = 替换），参考视频也是单选后追加：
          两者的消费端都是「一次落一个」，⛔ 不为了统一改成多选（page §8.3）。 */}
      <AssetSelectorDialog
        open={picker !== null}
        onOpenChange={(open) => {
          if (!open) setPicker(null)
        }}
        onSelect={(generation) => {
          handlePicked(generation)
          setPicker(null)
        }}
        title={t('libraryTitle')}
        description={t('libraryDescription')}
        mediaType={picker === 'video' ? 'video' : 'image'}
      />
    </div>
  )
}
