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
  NODE_STUDIO_REFERENCE_SOURCE_IDS,
} from '@/constants/node-studio'
import { NODE_TYPE_IDS } from '@/constants/node-types'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useNodeReferenceUpload } from '@/hooks/node/use-node-reference-upload'
import { toNodeDisplayLabel } from '@/lib/node-display-name'
import type { GenerationRecord } from '@/types'

import {
  useNodeWorkflowActions,
  type CanvasImageSource,
} from './NodeWorkflowActionsContext'

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
  /**
   * **来源命名空间里的 id** —— `asset` 时是 generation id，`canvas` 时是那个
   * 源节点的 id。写进 `referenceAsset.sourceId`。
   *
   * ⚠ 这个「一个字段、按 source 解释」的口径不是我发明的，是
   * `NODE_STUDIO_REFERENCE_SOURCE_IDS.canvas` 的注释原文（「reusing the existing
   * 'id within the source's own namespace' contract — no separate sourceNodeId
   * field needed」）。**拆出**（`extractReference`）正是靠 `source==='canvas' &&
   * sourceId` 判断源节点还在不在、要不要重新物化一个散图节点 —— 换个字段名它就
   * 认不出来了。
   */
  sourceId?: string
  name?: string
  source: 'upload' | 'asset' | 'paste' | 'canvas'
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
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const { spawnReference, listCanvasImageSources, connectReferenceNode } =
    useNodeWorkflowActions()
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  /**
   * 台账 B：Tabs 从非受控改成受控，只为了让「素材库」这一格在**被选中的那一刻**
   * 就把对话框开出来（Tab 即动作）。其余三格行为一字未变。
   */
  const [activeTab, setActiveTab] = useState('upload')
  const handleTabChange = useCallback((next: string) => {
    setActiveTab(next)
    if (next === 'asset') setAssetDialogOpen(true)
  }, [])
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
          generationId: media.sourceId,
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
            sourceId: result.generationId,
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

  const canvasSources = listCanvasImageSources?.(targetNodeId) ?? []

  /**
   * 第四源：画布上已有的那张图（阶段 8-a「图入卡」）。
   *
   * ⚠ **它不能走 `land()`** —— 那条路对主路是 `spawnReference`，会**再建一个散图
   * 节点**。可那张图已经在画布上了，复制一个出来就是凭空多一份同样的东西，正是
   * 阶段 3「只剩一套机制」要消灭的。所以两条落点各归各的：
   *   · 主路（镜头 / 关键帧 / 散图宿主）→ **连一条边**，与 `@` 菜单、composer 的
   *     「从画布选择」是同一个动作、同一道容量闸；
   *   · 收集器卡 → 写 `referenceAssets`，`source='canvas'` + `sourceId=源节点 id`，
   *     这样**拆出**认得出它从哪来（源节点还在就只删条目，不重复物化）。
   */
  const landFromCanvas = useCallback(
    (candidate: CanvasImageSource) => {
      if (onResolved) {
        onResolved({
          url: candidate.url,
          sourceId: candidate.nodeId,
          name: candidate.name,
          source: NODE_STUDIO_REFERENCE_SOURCE_IDS.canvas,
        })
        return
      }
      connectReferenceNode?.(candidate.nodeId, targetNodeId)
    },
    [connectReferenceNode, onResolved, targetNodeId],
  )

  const handleSelectAssets = useCallback(
    (generations: GenerationRecord[]) => {
      for (const generation of generations) {
        if (!generation.url) continue
        land({
          url: generation.url,
          sourceId: generation.id,
          name: toNodeDisplayLabel(generation.prompt),
          source: 'asset',
        })
      }
    },
    [land],
  )

  return (
    <>
      {/* 台账 B（owner 2026-08-29）：四格里只有「素材库」是两跳 —— 点了 Tab 之后
          面板里还站着一个同名按钮「从素材库选择」，用户已经表达过一次的意图要再
          表达一遍。另外三格（上传 / 粘贴 / 从画布）都是**直接可用的落区**。

          收法取 owner 建议里的 ①「Tab 即动作」而不是 ②「内嵌缩略图网格」：素材库
          是几百条 + 搜索 + 分页 + 类型过滤，把它塞进一个 ~200px 高的节点浮层等于
          在 `AssetPickerBrowser` 之外再造第三套素材浏览面（「从画布」那格能用网格
          是因为它只有画布上的几个节点）。这里换成**选中即开对话框**，四格于是统一
          成「都是一跳」，而素材浏览仍然只有一份实现。

          Tab 保持选中态并在面板里留一条「关掉了可以再开」的入口 —— 用户没选就关掉
          对话框时，面板不会是一片空白。 */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="p-3">
        <TabsList className="grid h-9 grid-cols-4 rounded-2xl bg-node-panel-soft p-1">
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
          <TabsTrigger
            value="canvas"
            className="rounded-xl text-xs data-[state=active]:bg-node-foreground data-[state=active]:text-node-canvas"
          >
            {t('canvasTab')}
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
          <div className="nodrag nopan nowheel flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-node-panel-inner bg-node-panel-soft px-4 text-center">
            <Library className="size-5 text-node-muted" />
            <span className="text-2xs text-node-muted">
              {t('assetDialogOpened')}
            </span>
            <Button
              type="button"
              disabled={disabled}
              onClick={() => setAssetDialogOpen(true)}
              className="nodrag nopan nowheel h-8 rounded-xl border border-node-panel-inner bg-node-panel text-2xs font-semibold text-node-foreground hover:border-node-edge hover:bg-node-panel-inner disabled:text-node-subtle"
            >
              {t('selectAsset')}
            </Button>
          </div>
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
        {/* 第四源「从画布选择」（阶段 8-a 图入卡）。
          ⚠ 这一格是**缩略图网格**而不是另外三格那样的按钮 / 落区，也不是 composer
          那个「从画布选择」的文字列表 —— 因为它选的就是**图**：名字（「镜头1-静帧」）
          分不清两张镜头图，缩略图一眼就分得清。名字退到图下面当第二判据。 */}
        <TabsContent value="canvas" className="mt-3">
          {canvasSources.length > 0 ? (
            <div className="nodrag nopan nowheel grid max-h-52 grid-cols-3 gap-2 overflow-y-auto pr-0.5">
              {canvasSources.map((candidate) => (
                <button
                  key={candidate.nodeId}
                  type="button"
                  disabled={disabled}
                  onClick={() => landFromCanvas(candidate)}
                  title={candidate.name ?? tTypes(candidate.type)}
                  className="group flex flex-col gap-1 overflow-hidden rounded-xl border border-node-panel-inner bg-node-panel-soft p-1 text-left transition-colors hover:border-node-edge disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={candidate.url}
                    alt=""
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                  <span className="truncate px-0.5 text-2xs text-node-muted group-hover:text-node-foreground">
                    {candidate.name ?? tTypes(candidate.type)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-node-panel-inner bg-node-panel-soft px-4 text-center text-2xs text-node-muted">
              {t('canvasEmpty')}
            </p>
          )}
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
