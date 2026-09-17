'use client'

/**
 * 手机端**镜头带视图**（node-canvas-v2 §7.x，画板 `MobileCanvas.dc.html` 方向 A）。
 *
 * < 768 宽时画布路由渲染的就是这一棵树 —— **桌面 ReactFlow 不挂载**（2026-09-11
 * owner 定稿：手机上不摆自由画布）。顶部项目胶囊 + 助手星标，分段控件
 * `镜头 / 图 / 语音 / 文本` 切四个列表，右下 FAB 新建镜头 / 上传，点卡进底部抽屉。
 *
 * ── 两条纪律 ──────────────────────────────────────────────────────────
 * ① **不另设数据**：四个列表是同一份 `state.nodes` 的投影（`mobile-rail-model`），
 *    改动全部走既有 op。手机上做的一切回桌面就是普通节点与边。
 * ② **镜头顺序 = 桌面镜头带序**（`shotNo` 升序）——⛔ 不按时间或名字另排一遍。
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { FileUp, Plus, Sparkles } from '@/components/icons'

import {
  NODE_MOBILE_LISTS,
  NODE_MOBILE_LIST_IDS,
  type NodeMobileListId,
} from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { pickDefaultModelOption } from '@/lib/pick-default-model-option'
import { cn } from '@/lib/utils'
import type { NodeV4 } from '@/types/node-workflow'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { toStudioModelOption } from '../nodes/v4/image/image-node-model'
import { useNodeV4Canvas } from '../nodes/v4/NodeV4Context'
import { MobileNodeSheet } from './MobileNodeSheet'
import { MobileShotCard } from './MobileShotCard'
import { buildMobileRailLists } from './mobile-rail-model'

export interface CanvasMobileRailProps {
  /** 左上项目胶囊（复用桌面那一颗 `ShellProjectPill`）。 */
  readonly projectPill: ReactNode
  /** 助手（移动端已是全屏 sheet）——⚠ 只在开着时挂，⛔ 不自动盖住列表。 */
  readonly assistant: ReactNode
  readonly assistantOpen: boolean
  onOpenAssistant(): void
  /** 新建镜头：落在镜头带末尾（`shotNo` 顺延）。 */
  onAddShot(): void
  /** 上传：按 MIME 落成图 / 声音 / 视频卡（与桌面拖投同一条 `dropFiles`）。 */
  onUploadFiles(files: readonly File[]): void
}

function MediaRow({ node, onOpen }: { readonly node: NodeV4; onOpen(): void }) {
  const data = node.data
  const thumbnailUrl =
    data.kind === NODE_MEDIA_KIND_IDS.image
      ? data.url
      : data.kind === NODE_MEDIA_KIND_IDS.video
        ? data.videoThumbnailUrl
        : undefined
  const summary =
    data.kind === NODE_MEDIA_KIND_IDS.text ? data.body : data.prompt

  return (
    <button
      type="button"
      onClick={onOpen}
      data-mobile-media-row={node.id}
      className="flex min-h-16 w-full items-center gap-3 rounded-node bg-card p-2.5 text-left corner-squircle shadow-node-chrome focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="relative size-11 shrink-0 overflow-hidden rounded-node-thumb bg-surface-fill">
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt=""
            width={44}
            height={44}
            unoptimized
            className="size-full object-cover"
          />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-2sm font-medium">{data.name}</span>
        {summary ? (
          <span className="truncate text-xs text-muted-foreground">
            {summary}
          </span>
        ) : null}
      </span>
    </button>
  )
}

export function CanvasMobileRail({
  projectPill,
  assistant,
  assistantOpen,
  onOpenAssistant,
  onAddShot,
  onUploadFiles,
}: CanvasMobileRailProps) {
  const t = useTranslations('StudioNode.mobileRail')
  const canvas = useNodeV4Canvas()
  const [list, setList] = useState<NodeMobileListId>(NODE_MOBILE_LIST_IDS.shots)
  const [openNodeId, setOpenNodeId] = useState<string | null>(null)

  const lists = useMemo(
    () => buildMobileRailLists(canvas.nodes),
    [canvas.nodes],
  )
  /**
   * 这一档的默认模型 —— 卡上「模型名」那一格读它。⚠ 只算一次传给所有卡
   * （⛔ 不在每张卡里各跑一遍全模型排序）。
   */
  const defaultVideoModelId = useMemo(() => {
    const options = canvas.modelOptionsByKind[NODE_MEDIA_KIND_IDS.video] ?? []
    return pickDefaultModelOption(options.map(toStudioModelOption))?.modelId
  }, [canvas.modelOptionsByKind])

  /**
   * 系统返回手势 / 浏览器返回 = **收抽屉**（§7.x 末条）：抽屉开着时往历史里压
   * 一层，返回就把这一层弹掉。
   *
   * ⚠ 用 UI 关掉抽屉时要把那一层**吃回来**（cleanup 里 `history.back()`），否则
   * 开关几次之后用户要按好几下返回才离得开画布。监听在 back 之前就摘了，所以
   * 那一下 popstate 不会再触发一次关闭。
   */
  useEffect(() => {
    if (openNodeId === null) return
    window.history.pushState({ canvasNodeSheet: true }, '')
    const onPopState = () => setOpenNodeId(null)
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      const state = window.history.state as { canvasNodeSheet?: boolean } | null
      if (state?.canvasNodeSheet) window.history.back()
    }
  }, [openNodeId])

  const openNode = canvas.nodes.find((node) => node.id === openNodeId) ?? null

  const rows =
    list === NODE_MOBILE_LIST_IDS.shots
      ? lists.shots
      : list === NODE_MOBILE_LIST_IDS.images
        ? lists.images
        : list === NODE_MOBILE_LIST_IDS.voices
          ? lists.voices
          : lists.texts

  return (
    <div
      data-testid="canvas-mobile-rail"
      className="domain-canvas absolute inset-0 flex flex-col overflow-hidden bg-surface-sunken text-foreground"
    >
      <header className="flex h-13 shrink-0 items-center gap-2 px-3.5">
        {projectPill}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onOpenAssistant}
          aria-label={t('assistant')}
          aria-pressed={assistantOpen}
          data-testid="canvas-mobile-assistant"
          className="canvas-glass flex size-11 items-center justify-center rounded-full text-foreground"
        >
          <Sparkles aria-hidden className="size-4" />
        </button>
      </header>

      <div className="shrink-0 px-3.5 pb-2">
        <ToggleGroup
          type="single"
          variant="segmented"
          value={list}
          onValueChange={(next) => {
            if (next) setList(next as NodeMobileListId)
          }}
          aria-label={t('listLabel')}
          className="w-full"
        >
          {NODE_MOBILE_LISTS.map((id) => (
            <ToggleGroupItem
              key={id}
              value={id}
              data-mobile-list-tab={id}
              className="min-h-9 flex-1"
            >
              {t(`tab.${id}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div
        data-mobile-rail-list={list}
        // 底部留出 FAB 的位置 + 安全区，⛔ 不让最后一张卡被 FAB 压住。
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 pb-28"
        style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))' }}
      >
        {rows.length === 0 ? (
          <p className="px-1 py-10 text-center text-sm text-muted-foreground">
            {t(`empty.${list}`)}
          </p>
        ) : list === NODE_MOBILE_LIST_IDS.shots ? (
          rows.map((node) => (
            <MobileShotCard
              key={node.id}
              node={node}
              defaultModelId={defaultVideoModelId}
              selected={node.id === openNodeId}
              onOpen={() => setOpenNodeId(node.id)}
            />
          ))
        ) : (
          rows.map((node) => (
            <MediaRow
              key={node.id}
              node={node}
              onOpen={() => setOpenNodeId(node.id)}
            />
          ))
        )}
      </div>

      {/* 右下 FAB：新建镜头 / 上传。⚠ 上传那一条挂的是**常驻**的隐藏 input ——
          菜单关掉之后系统对话框的 change 仍要有人接。 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('add')}
            data-testid="canvas-mobile-fab"
            style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            className={cn(
              'absolute right-4 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg',
              'transition-transform duration-spring-press ease-spring-press active:scale-95',
            )}
          >
            <Plus aria-hidden className="size-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-48">
          <DropdownMenuItem
            data-mobile-fab-add-shot
            onSelect={() => {
              onAddShot()
              setList(NODE_MOBILE_LIST_IDS.shots)
            }}
          >
            <Plus aria-hidden className="size-4" />
            {t('newShot')}
          </DropdownMenuItem>
          <DropdownMenuItem asChild data-mobile-fab-upload>
            <label className="cursor-pointer">
              <FileUp aria-hidden className="size-4" />
              {t('upload')}
              <input
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? [])
                  event.target.value = ''
                  if (files.length > 0) onUploadFiles(files)
                }}
              />
            </label>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MobileNodeSheet node={openNode} onClose={() => setOpenNodeId(null)} />
      {/* 助手只在开着时挂 —— 收起时列表是整屏的（S11b：⛔ 不自动盖住列表）。 */}
      {assistantOpen ? assistant : null}
    </div>
  )
}
