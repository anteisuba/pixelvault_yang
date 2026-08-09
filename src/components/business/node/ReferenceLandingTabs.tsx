'use client'

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from 'react'
import { Clipboard, Library, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_STUDIO_CHARACTER_IMAGE_REFERENCES,
  NODE_STUDIO_IMAGE_INPUT,
  NODE_STUDIO_PLACEHOLDER_TOAST,
} from '@/constants/node-studio'
import { NODE_TYPE_IDS } from '@/constants/node-types'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useNodeReferenceUpload } from '@/hooks/node/use-node-reference-upload'
import type { GenerationRecord } from '@/types'

import { useNodeWorkflowActions } from './NodeWorkflowActionsContext'

/**
 * 「加一张参考图」的**唯一入口**（阶段 3，`plans/task-canvas-slot-rack-master-
 * 2026-08-09.md` 阶段 3 / brief §10 2026-08-09 拍板）。
 *
 * ── 它改了什么 ──────────────────────────────────────────────────────
 * 三个 Tab（上传 / 素材库 / 粘贴）一字未动，**落点**换了：
 *   旧：写进宿主节点的 `referenceAssets` 数组 —— 一条**隐形附件通道**，图在画布
 *       上不存在，只能从详情面板里看见，且与「连线」是两套并行机制。
 *   新：`spawnReference` 建一个**散图节点**落在宿主左侧 + 自动连线。
 *
 * 只剩一套机制（边）之后：谁挂了什么在画布上直接看得见 · 容量闸只有一处
 * （`rejectWhenCapacityFull`）· 移除 = 删边，与槽架的 × 是同一个动作。
 *
 * ⚠ **不带 role**：落的是散图（`NODE_TYPE_IDS.image` 无 role），不是角色/背景/
 * 镜头卡。分类是节点自己的事（`imageCategory`，S5d ③），落地时不替用户猜。
 */
export interface ResolvedReferenceMedia {
  url: string
  generationId?: string
  name?: string
  source: 'upload' | 'asset' | 'paste'
}

interface ReferenceLandingTabsProps {
  /** 新节点连去哪 —— 宿主节点 id。 */
  targetNodeId: string
  /** 该节点根本不吃参考图（上限 0）时整块不渲染输入面（契约 §4.7）。 */
  disabled?: boolean
  /**
   * 覆盖落点。省略 = 上面那条主路（落散图节点 + 自动连线）。
   *
   * ⚠ **唯一该覆盖的是收集器卡（角色 / 背景）**，因为它那份图集还有两条腿踩在
   * `referenceAssets` 上，切过去会当场少东西：
   *   ① 卡自己的生成（`handleGenerateCharacterImage`）只读
   *      `existingImageReference + referenceAssets`，**不读上游边**；
   *   ② 下游收割把收集器卡展开成它的 onStage 集合
   *      （`getNodeStageMediaUrls` 读的还是 `referenceAssets`），一跳到底，
   *      不会再往上走一层去捡挂在卡上的散图节点。
   * 两条都补完（生成读上游 + 收割走两跳）才轮到收集器卡切主路 —— 那是图模型
   * 改动，不是 UI 政策，见总包阶段 3「存量兼容归 Codex」。
   */
  onResolved?(media: ResolvedReferenceMedia): void
}

export function ReferenceLandingTabs({
  targetNodeId,
  disabled = false,
  onResolved,
}: ReferenceLandingTabsProps) {
  const t = useTranslations('StudioNode.characterImage.reference')
  const { spawnReference } = useNodeWorkflowActions()
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const pasteTargetRef = useRef<HTMLDivElement>(null)
  const { uploadFile, isUploading } = useNodeReferenceUpload()

  const land = useCallback(
    (media: ResolvedReferenceMedia) => {
      if (onResolved) {
        onResolved(media)
        return
      }
      spawnReference?.({
        targetNodeId,
        nodeType: NODE_TYPE_IDS.image,
        media: {
          url: media.url,
          generationId: media.generationId,
          name: media.name,
        },
      })
    },
    [onResolved, spawnReference, targetNodeId],
  )

  /** 上传与粘贴走同一条上传链，只有 toast 文案与文件名兜底不同。 */
  const uploadAndLand = useCallback(
    async (
      files: File[],
      source: 'upload' | 'paste',
      fallbackName?: string,
    ) => {
      for (const file of files) {
        if (!file.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix)) {
          continue
        }
        const result = await uploadFile(
          file,
          NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.uploadNote,
        )
        if (result.success && result.url) {
          land({
            url: result.url,
            generationId: result.generationId,
            name: file.name || fallbackName,
            source,
          })
        } else {
          toast.error(result.error ?? t('uploadFailed'), {
            duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
            position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
          })
        }
      }
    },
    [land, t, uploadFile],
  )

  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? [])
      if (inputRef.current) {
        inputRef.current.value = ''
      }
      if (files.length === 0 || disabled) return
      await uploadAndLand(files, 'upload')
    },
    [disabled, uploadAndLand],
  )

  const handlePaste = useCallback(
    async (event: ClipboardEvent<HTMLDivElement>) => {
      if (disabled) return
      const files = Array.from(event.clipboardData.files).filter((file) =>
        file.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix),
      )
      if (files.length === 0) {
        toast.info(t('pasteEmpty'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }
      event.preventDefault()
      await uploadAndLand(
        files,
        'paste',
        NODE_STUDIO_IMAGE_INPUT.pastedFileName,
      )
    },
    [disabled, t, uploadAndLand],
  )

  const handleSelectAssets = useCallback(
    (generations: GenerationRecord[]) => {
      for (const generation of generations) {
        if (!generation.url) continue
        land({
          url: generation.url,
          generationId: generation.id,
          name: generation.prompt || undefined,
          source: 'asset',
        })
      }
    },
    [land],
  )

  return (
    <>
      <Tabs defaultValue="upload" className="p-3">
        <TabsList className="grid h-9 grid-cols-3 rounded-2xl bg-node-panel-soft p-1">
          <TabsTrigger
            value="upload"
            className="rounded-xl text-xs data-[state=active]:bg-node-foreground data-[state=active]:text-node-canvas"
          >
            {t('uploadTab')}
          </TabsTrigger>
          <TabsTrigger
            value="asset"
            className="rounded-xl text-xs data-[state=active]:bg-node-foreground data-[state=active]:text-node-canvas"
          >
            {t('assetTab')}
          </TabsTrigger>
          <TabsTrigger
            value="paste"
            className="rounded-xl text-xs data-[state=active]:bg-node-foreground data-[state=active]:text-node-canvas"
          >
            {t('pasteTab')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="mt-3">
          <button
            type="button"
            disabled={disabled || isUploading}
            onClick={() => inputRef.current?.click()}
            className="nodrag nopan nowheel flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-node-panel-inner bg-node-panel-soft px-4 text-center text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground disabled:cursor-not-allowed disabled:text-node-subtle"
          >
            {isUploading ? (
              <Spinner size="lg" className="text-node-muted" />
            ) : (
              <Upload className="size-5 text-node-muted" />
            )}
            <span className="text-xs font-semibold">{t('uploadTitle')}</span>
            <span className="text-2xs">{t('uploadMeta')}</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={NODE_STUDIO_IMAGE_INPUT.accept}
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
        </TabsContent>
        <TabsContent value="asset" className="mt-3">
          <Button
            type="button"
            disabled={disabled}
            onClick={() => setAssetDialogOpen(true)}
            className="nodrag nopan nowheel h-10 w-full rounded-2xl border border-node-panel-inner bg-node-panel-soft text-xs font-semibold text-node-foreground hover:border-node-edge hover:bg-node-panel-inner disabled:text-node-subtle"
          >
            <Library className="mr-2 size-4 text-node-muted" />
            {t('selectAsset')}
          </Button>
        </TabsContent>
        <TabsContent value="paste" className="mt-3">
          <div
            ref={pasteTargetRef}
            role="button"
            tabIndex={0}
            onClick={() => pasteTargetRef.current?.focus()}
            onPaste={handlePaste}
            className="nodrag nopan nowheel flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-node-panel-inner bg-node-panel-soft px-4 text-center text-node-muted outline-none transition-colors hover:border-node-edge hover:text-node-foreground focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
          >
            {isUploading ? (
              <Spinner size="lg" className="text-node-muted" />
            ) : (
              <Clipboard className="size-5 text-node-muted" />
            )}
            <span className="text-xs font-semibold">{t('pasteTitle')}</span>
            <span className="text-2xs">{t('pasteMeta')}</span>
          </div>
        </TabsContent>
      </Tabs>

      <AssetSelectorDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        title={t('assetDialogTitle')}
        description={t('assetDialogDescription')}
        mediaType="image"
        multiSelect
        onConfirmMany={handleSelectAssets}
      />
    </>
  )
}
