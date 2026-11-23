'use client'

/**
 * 手机端**镜头带视图**（node-canvas-v2 §7.x，画板 `MobileCanvas.dc.html` 方向 A）。
 *
 * < 768 宽时画布路由渲染的就是这一棵树 —— **桌面 ReactFlow 不挂载**（2026-09-11
 * owner 定稿：手机上不摆自由画布）。顶上直接是分段控件 `镜头 / 图 / 语音 / 文本`
 * 切四个列表（11-18 起 ⛔ 自带一行页头：助手头像回壳顶栏右端那一格、和其它台同一颗
 * `StudioOperatorDock` 收起态头像），左下项目胶囊、右下 FAB 拉起加节点抽屉（与桌面同一份
 * `CanvasAddMenu`），点卡进底部抽屉。
 *
 * ── 两条纪律 ──────────────────────────────────────────────────────────
 * ① **不另设数据**：四个列表是同一份 `state.nodes` 的投影（`mobile-rail-model`），
 *    改动全部走既有 op。手机上做的一切回桌面就是普通节点与边。
 * ② **镜头顺序 = 桌面镜头带序**（`shotNo` 升序）——⛔ 不按时间或名字另排一遍。
 */

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { Plus } from '@/components/icons'

import {
  CANVAS_ADD_GROUP_IDS,
  getCanvasAddCatalogItem,
  type CanvasAddGroupId,
  type CanvasAddIntentId,
} from '@/constants/canvas-add-catalog'
import {
  NODE_MOBILE_LISTS,
  NODE_MOBILE_LIST_IDS,
  type NodeMobileListId,
} from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { cardManagementPath } from '@/constants/routes'
import { useBackToClose } from '@/hooks/use-back-to-close'
import { useCharacterLibrary } from '@/features/cards/hooks'
import { useRouter } from '@/i18n/navigation'
import { characterCoverUrl } from '@/lib/card-bus'
import { isCharacterCardNode } from '@/lib/node-mentions-to-slots'
import { pickDefaultModelOption } from '@/lib/pick-default-model-option'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'
import type { NodeV4 } from '@/types/node-workflow'

import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { AssetSelectorDialog } from '@/features/assets'

import { CanvasAddMenu } from '../workbench-v4/shell/CanvasAddMenu'
import { useBrokenThumbs } from '../nodes/v4/chrome/NodeMediaMissing'
import { toStudioModelOption } from '../nodes/v4/image/image-node-model'
import { useNodeV4Canvas } from '../nodes/v4/NodeV4Context'
import { MobileNodeSheet } from './MobileNodeSheet'
import { MobileShotCard } from './MobileShotCard'
import { buildMobileRailLists } from './mobile-rail-model'

export interface CanvasMobileRailProps {
  /** 左下项目胶囊（复用桌面那一颗 `ShellProjectPill`，和右下 FAB 同一条底线）。 */
  readonly projectPill: ReactNode
  /**
   * 助手（`StudioOperatorDock`）：**一直挂着** —— 收起时它自己在壳顶栏右端画头像
   * （和图片 / 视频 / LoRA 台同一颗），开着时是底部 Sheet；开合读宿主的 open。
   * ⛔ 列表里再放一颗自己的入口。
   */
  readonly assistant: ReactNode
  /** 加节点菜单里的一项（镜头落在镜头带末尾、`shotNo` 顺延；其余落在散区）。 */
  onAdd(intentId: CanvasAddIntentId): void
  /** 上传：按 MIME 落成图 / 声音 / 视频卡（与桌面拖投同一条 `dropFiles`）。 */
  onUploadFiles(files: readonly File[]): void
  /** 从素材库挑了一件：落成对应的图 / 声音 / 视频卡（与桌面左侧素材库点一下同一条）。 */
  onPlaceAsset(record: GenerationRecord): void
}

/** 加了哪一组的卡，就切到装它的那一列（视频的镜头与片段都在「镜头」列）。 */
const MOBILE_LIST_BY_GROUP: Record<CanvasAddGroupId, NodeMobileListId> = {
  [CANVAS_ADD_GROUP_IDS.text]: NODE_MOBILE_LIST_IDS.texts,
  [CANVAS_ADD_GROUP_IDS.image]: NODE_MOBILE_LIST_IDS.images,
  [CANVAS_ADD_GROUP_IDS.audio]: NODE_MOBILE_LIST_IDS.voices,
  [CANVAS_ADD_GROUP_IDS.video]: NODE_MOBILE_LIST_IDS.shots,
}

function mobileListForOutput(
  outputType: GenerationRecord['outputType'],
): NodeMobileListId {
  if (outputType === 'VIDEO') return NODE_MOBILE_LIST_IDS.shots
  if (outputType === 'AUDIO') return NODE_MOBILE_LIST_IDS.voices
  return NODE_MOBILE_LIST_IDS.images
}

function MediaRow({
  node,
  onOpen,
  character,
}: {
  readonly node: NodeV4
  onOpen(): void
  /** 画布上的角色卡：图和名字现读角色库（卡本身没有 `url`）。 */
  readonly character?: { readonly name: string; readonly image?: string }
}) {
  const data = node.data
  // 素材删了：只剩底色，⛔ 不画裂图（owner 09-28）。
  const thumbs = useBrokenThumbs()
  const thumbnailUrl = character
    ? character.image
    : data.kind === NODE_MEDIA_KIND_IDS.image
      ? data.url
      : data.kind === NODE_MEDIA_KIND_IDS.video
        ? data.videoThumbnailUrl
        : undefined
  const summary = character
    ? undefined
    : data.kind === NODE_MEDIA_KIND_IDS.text
      ? data.body
      : data.prompt

  return (
    <button
      type="button"
      onClick={onOpen}
      data-mobile-media-row={node.id}
      className="flex min-h-16 w-full items-center gap-3 rounded-node bg-card p-2.5 text-left corner-squircle shadow-node-chrome focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="relative size-11 shrink-0 overflow-hidden rounded-node-thumb bg-surface-fill">
        {thumbs.usable(thumbnailUrl) ? (
          <Image
            src={thumbnailUrl!}
            alt=""
            width={44}
            height={44}
            unoptimized
            onError={() => thumbs.markBroken(thumbnailUrl!)}
            className="size-full object-cover"
          />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-2sm font-semibold">
          {character?.name ?? data.name}
        </span>
        {summary ? (
          <span className="truncate text-2xs text-muted-foreground">
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
  onAdd,
  onUploadFiles,
  onPlaceAsset,
}: CanvasMobileRailProps) {
  const t = useTranslations('StudioNode.mobileRail')
  const tNode = useTranslations('StudioNode')
  const tPanels = useTranslations('StudioNode.shell.panels')
  const [addOpen, setAddOpen] = useState(false)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const canvas = useNodeV4Canvas()
  const router = useRouter()
  const library = useCharacterLibrary()
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

  /** 系统返回手势 / 浏览器返回 = **收抽屉**（§7.x 末条，`useBackToClose`）。 */
  useBackToClose(openNodeId !== null, () => setOpenNodeId(null))

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
      <div className="shrink-0 px-3.5 pt-2.5 pb-2">
        <LiquidSegmented<NodeMobileListId>
          size="row"
          fill
          ariaLabel={t('listLabel')}
          value={list}
          onChange={setList}
          items={NODE_MOBILE_LISTS.map((id) => ({
            value: id,
            label: t(`tab.${id}`),
          }))}
        />
      </div>

      <div
        data-mobile-rail-list={list}
        // 底部留出 FAB 的位置 + 安全区，⛔ 不让最后一张卡被 FAB 压住。
        // 卡片 `shrink-0`：竖排 flex 里默认会被压到装得下为止，封面被挤扁、底部被裁（2026-11-12）。
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 pt-1 pb-28 *:shrink-0"
        style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))' }}
      >
        {rows.length === 0 ? (
          <p className="px-1 py-10 text-center text-2sm text-muted-foreground">
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
          rows.map((node) => {
            // 角色卡在手机上⛔ 不展开、不出图抽屉（画布用角色 ④ 手机档）：看图和设定去角色页。
            const characterId =
              isCharacterCardNode(node) &&
              node.data.kind === NODE_MEDIA_KIND_IDS.image
                ? node.data.characterId
                : undefined
            if (characterId) {
              const card = library.find(characterId)
              const image = card
                ? (characterCoverUrl(card) ?? undefined)
                : undefined
              return (
                <MediaRow
                  key={node.id}
                  node={node}
                  character={{
                    name: card?.name ?? node.data.name,
                    ...(image ? { image } : {}),
                  }}
                  onOpen={() =>
                    router.push(cardManagementPath({ character: characterId }))
                  }
                />
              )
            }
            return (
              <MediaRow
                key={node.id}
                node={node}
                onOpen={() => setOpenNodeId(node.id)}
              />
            )
          })
        )}
      </div>

      {/* 左下项目胶囊：和右下 FAB 同一条底线（拇指区），切 / 建 / 改名项目从这里进。 */}
      <div
        data-testid="canvas-mobile-project"
        style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        // 右边让出 FAB（right-4 + 48 宽）那一截；胶囊自己按名字截断。
        className="pointer-events-none absolute right-20 left-4 flex h-12 min-w-0 items-center"
      >
        {projectPill}
      </div>

      {/* 右下 FAB：拉起底部抽屉，里面就是桌面那一份加节点菜单（`CanvasAddMenu` 单列版，
          内容读 `CANVAS_ADD_CATALOG`：四组十项 + 上传 · 从素材库选 · 镜头表），⛔ 手机另抄一份。 */}
      <Drawer open={addOpen} onOpenChange={setAddOpen}>
        <DrawerTrigger asChild>
          <button
            type="button"
            aria-label={t('add')}
            data-testid="canvas-mobile-fab"
            style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            className={cn(
              'absolute right-4 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg',
              'transition-transform duration-spring-press ease-spring-press active:scale-96',
            )}
          >
            <Plus aria-hidden className="size-5" />
          </button>
        </DrawerTrigger>
        <DrawerContent
          data-testid="canvas-mobile-add-sheet"
          style={{ maxHeight: '90svh' }}
        >
          <DrawerTitle className="sr-only">{tPanels('addNode')}</DrawerTitle>
          <div
            className="min-h-0 flex-1 overflow-y-auto px-2 pt-2"
            style={{
              paddingBottom:
                'max(var(--keyboard-safe-area-bottom, 0px), env(safe-area-inset-bottom), 0.75rem)',
            }}
          >
            <CanvasAddMenu
              layout="list"
              tone="popover"
              onAdd={(intentId) => {
                setAddOpen(false)
                onAdd(intentId)
                setList(
                  MOBILE_LIST_BY_GROUP[getCanvasAddCatalogItem(intentId).group],
                )
              }}
              onUpload={() => {
                setAddOpen(false)
                uploadInputRef.current?.click()
              }}
              onPickFromLibrary={() => {
                setAddOpen(false)
                setAssetPickerOpen(true)
              }}
              onShotTable={() => {
                // 手机上镜头表退化成「镜头」那一列（node-canvas-v2 §6 第 17 条）。
                setAddOpen(false)
                setList(NODE_MOBILE_LIST_IDS.shots)
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>
      {/* ⚠ 上传挂的是**常驻**的隐藏 input —— 抽屉关掉之后系统对话框的 change 仍要有人接。 */}
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="hidden"
        data-testid="canvas-mobile-upload-input"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length > 0) onUploadFiles(files)
        }}
      />
      {assetPickerOpen ? (
        <AssetSelectorDialog
          open
          onOpenChange={setAssetPickerOpen}
          title={tNode('addCatalog.pickFromLibrary')}
          description={tNode('addCatalog.pickFromLibrary')}
          onSelect={(record) => {
            onPlaceAsset(record)
            setList(mobileListForOutput(record.outputType))
          }}
        />
      ) : null}

      <MobileNodeSheet node={openNode} onClose={() => setOpenNodeId(null)} />
      {/* 助手一直挂：收起态是壳顶栏右端的头像，开着才是 Sheet（⛔ 自动盖住列表）。 */}
      {assistant}
    </div>
  )
}
