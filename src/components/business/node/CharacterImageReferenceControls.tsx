'use client'

import Image from 'next/image'
import { useCallback, useMemo } from 'react'
import { ArrowUpRight, Flag, ImagePlus, Star, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_STUDIO_CHARACTER_IMAGE_REFERENCES,
  NODE_STUDIO_REFERENCE_ROLES,
  NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID,
} from '@/constants/node-studio'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type {
  NodeWorkflowReferenceAsset,
  NodeWorkflowReferenceRole,
} from '@/types'

import {
  ReferenceLandingTabs,
  type ResolvedReferenceMedia,
} from './ReferenceLandingTabs'

/** A closeup (面部特写) image merged read-only into the gallery grid — a
 *  SEPARATE node bound via edge, not a `referenceAssets` entry, so it has no
 *  weight/role/extract of its own (§二.2 视觉身份区 "吃进的 closeup 图并入
 *  陈列，标来源"). */
export interface CharacterReferenceGalleryExtraItem {
  id: string
  url: string
  /** 描述性名字，进 title/alt（closeup 传角色名，主图兜底传来源说明）。 */
  label: string
  /**
   * 缩略图左上角那枚徽标的文案 —— 表达**来源类型**，不是名字。
   * 2026-08-02 加：此前徽标写死成「特写」，因为 extraItems 的唯一来源就是
   * 上游 closeup 节点；现在它还承载「卡片主图」的兜底（台账 #11），来源不止
   * 一种了。省略时仍回落「特写」，老调用方行为不变。
   */
  badge?: string
}

/**
 * ⚠ **本组件已不再是「加参考图」的入口**（阶段 3，2026-08-10）。
 *
 * 三 Tab 添加面板整体搬去 `ReferenceLandingTabs`，落点从「写进本节点的
 * `referenceAssets`」改成「建散图节点 + 自动连线」。留在这里的是**存量图集**的
 * 陈列与善后：改分类/权重、设主图、出场、移除、拆出。
 *
 * 为什么不一起删干净：存量项目里 `referenceAssets` 有真数据（还有卡片水合那条
 * 写路径），删了用户的图就凭空消失。存量数据与收割侧的收敛是独立工程题。
 */
interface CharacterImageReferenceControlsProps {
  value: NodeWorkflowReferenceAsset[] | undefined
  maxItems: number
  onChange(value: NodeWorkflowReferenceAsset[]): void
  /** 新参考图落到哪个宿主的左边 —— 交给 `ReferenceLandingTabs`。 */
  targetNodeId: string
  /**
   * `true` = 新素材仍写进本节点的 `referenceAssets`（旧落点）。
   * **只有收集器卡（角色 / 背景）该传它** —— 原因与解除条件写在
   * `ReferenceLandingTabs` 的 `onResolved` 头注：它那份图集还有两条腿踩在
   * `referenceAssets` 上（卡自己的生成不读上游边 · 下游收割一跳到底）。
   */
  nestedAdd?: boolean
  /**
   * `'popover'` (default): the original compact chip + popover — unchanged
   * behavior for every existing caller (shot/frame/background inspectors).
   * `'gallery'`: S5c 二.2 档案面板视觉身份区 — an always-visible grid with
   * per-item hover controls (role/weight/remove/拆出) instead of a popover
   * list, used only by the character/background dossier body. Both modes
   * share every handler below — single source of truth for the CRUD, two
   * presentations.
   */
  mode?: 'popover' | 'gallery'
  /** Gallery mode only: closeup images to merge into the grid, read-only. */
  extraItems?: readonly CharacterReferenceGalleryExtraItem[]
  /** Gallery mode only: 拆出 (§三.4) — omitted entries get no extract button
   *  (there's nothing to wire it to outside the dossier body). */
  onExtract?(reference: NodeWorkflowReferenceAsset): void
  /**
   * Popover mode only: overrides the trigger chip's visible text (default:
   * the "Refs {count}/{max}" chip label). R3-3's collector selection-toolbar
   * capability button reuses this exact trigger + its upload/asset/paste
   * panel wholesale, just under a task-appropriate label ("Add material")
   * instead of a reference count.
   */
  triggerLabel?: string
}

export function createReferenceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `reference-${Date.now()}`
}

/**
 * Exported (not just used internally) so `StudioNodeWorkbench`'s S5c 三.3
 * 融合 handler builds `source:'canvas'` entries through the exact same
 * constructor as upload/asset/paste — one shape, one default role/weight,
 * instead of a second ad hoc object literal drifting out of sync.
 *
 * `categorySeed` (S5d ③): carries a loose image node's own `imageCategory` /
 * `imageCategoryLabel` (§6.0 "图片=素材原子") forward into the created
 * reference's `role`/`customLabel` when the loose image already had one set
 * before being fused — e.g. a 关键帧首-classified 素材 dragged onto a
 * character card keeps reading as 关键帧首 inside the card's gallery instead
 * of resetting to the default `identity` category. Omitted (every existing
 * caller) keeps the prior default-role behavior unchanged.
 */
export function createReferenceAsset(
  url: string,
  source: NodeWorkflowReferenceAsset['source'],
  sourceId?: string,
  name?: string,
  categorySeed?: { role?: NodeWorkflowReferenceRole; customLabel?: string },
): NodeWorkflowReferenceAsset {
  return {
    id: createReferenceId(),
    url,
    role:
      categorySeed?.role ?? NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultRole,
    weight: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultWeight,
    source,
    sourceId,
    name,
    customLabel: categorySeed?.customLabel,
  }
}

export function CharacterImageReferenceControls({
  value,
  maxItems,
  onChange,
  targetNodeId,
  nestedAdd = false,
  mode = 'popover',
  extraItems,
  onExtract,
  triggerLabel,
}: CharacterImageReferenceControlsProps) {
  const t = useTranslations('StudioNode.characterImage.reference')
  // Gallery-only strings live in the `dossier` ns (Allowed File Scope keeps
  // messages edits to castDock/ingest/dossier ns — `characterImage.reference`
  // is an existing ns this component only READS from unchanged elsewhere).
  const tDossier = useTranslations('StudioNode.dossier')
  const references = useMemo(() => value ?? [], [value])
  const effectiveMaxItems = Math.min(
    Math.max(maxItems, 0),
    NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxItems,
  )
  const disabled = effectiveMaxItems === 0

  const updateReference = useCallback(
    (id: string, patch: Partial<NodeWorkflowReferenceAsset>) => {
      onChange(
        references.map((reference) =>
          reference.id === id ? { ...reference, ...patch } : reference,
        ),
      )
    },
    [onChange, references],
  )

  const removeReference = useCallback(
    (id: string) => {
      onChange(references.filter((reference) => reference.id !== id))
    },
    [onChange, references],
  )

  /**
   * V-2 主图 ★「设为主图」— mutually exclusive across the card's collected
   * gallery: exactly one entry (or none) carries `isPrimary`. Clicking the
   * currently-starred item's star toggles it back off (reverts to the
   * default resolution — see `getNodePrimaryMediaUrl`'s fallback chain),
   * matching the same toggle affordance the rest of this gallery uses.
   */
  const setPrimaryReference = useCallback(
    (id: string) => {
      onChange(
        references.map((reference) => ({
          ...reference,
          isPrimary: reference.id === id ? !reference.isPrimary : undefined,
        })),
      )
    },
    [onChange, references],
  )

  /**
   * R3-6a §4 出场组 — 〈出场〉toggle: independent per entry (not mutually
   * exclusive like ★主图 above — a card can curate several images that all
   * ride along, see `getNodeStageMediaUrls`). The ★ primary entry has no
   * button for this (always implicitly on stage, see the always-on badge
   * below), so this only ever flips a NON-primary entry's `onStage`.
   */
  const toggleOnStage = useCallback(
    (id: string) => {
      onChange(
        references.map((reference) =>
          reference.id === id
            ? { ...reference, onStage: !reference.onStage }
            : reference,
        ),
      )
    },
    [onChange, references],
  )

  /** 旧落点（仅收集器卡）：追加进本节点的 `referenceAssets`，并守住卡自己的上限。 */
  const appendNested = useCallback(
    (media: ResolvedReferenceMedia) => {
      if (references.length >= effectiveMaxItems) return
      onChange([
        ...references,
        // ⚠ 第三个位置是 `sourceId` —— **来源命名空间里的 id**：素材库来的是
        // generation id，「从画布选择」来的是**源节点 id**（阶段 8-a）。后者正是
        // 拆出（`extractReference`）判断「源节点还在不在」的依据。
        createReferenceAsset(
          media.url,
          media.source,
          media.sourceId,
          media.name,
        ),
      ])
    },
    [effectiveMaxItems, onChange, references],
  )

  // 两档共用的「加一张」面板。⚠ 默认它**不写本节点的 `referenceAssets`** ——
  // 落的是宿主左侧的散图节点 + 一条边（阶段 3）。所以主路上也不再有 `isFull`：
  // 容量闸在落点上（`rejectWhenCapacityFull`），不在这个按钮上。
  const addPanel = (
    <ReferenceLandingTabs
      targetNodeId={targetNodeId}
      disabled={disabled}
      onResolved={nestedAdd ? appendNested : undefined}
    />
  )

  if (mode === 'gallery') {
    return (
      // ⚠ gallery 档只服务详情面板（S4 起唯一调用方是 `ImageFamilyBody` 与
      //   `CharacterDetailBody`），所以这里**直接**按方向 E 的规矩长，不留旧形态：
      //   · 删掉「参考图 / 0 3」那一行标题 —— 契约 R1「一级面零标题预算」，
      //     且素材架自己那行右对齐计数已经在说同一件事（真机实拍：同屏出现三遍）。
      //   · 网格从 `grid-cols-4`（一格能撑到 209px）改成定宽 88px 流式排 ——
      //     R10 尺寸档位 ≤3；空图集时那颗「添加」原本是个 209×209 的虚线大方块，
      //     正是 R2 点名要删的「虚线取景框」。
      <div>
        {disabled ? (
          <p className="text-xs leading-5 text-node-muted">
            {t('unsupported')}
          </p>
        ) : (
          <div className="canvas-detail-ref-grid">
            {references.map((reference) => (
              <div
                key={reference.id}
                className="group node-card-window relative aspect-square overflow-hidden rounded-xl border border-node-panel-inner bg-node-card-window"
              >
                <Image
                  src={reference.url}
                  alt={reference.name ?? t('title')}
                  fill
                  sizes="120px"
                  className="object-cover"
                  unoptimized
                />
                {reference.source === 'canvas' ? (
                  <span className="absolute left-1 top-1 rounded-full bg-node-canvas/85 px-1.5 py-0.5 text-2xs font-medium text-node-foreground">
                    {tDossier('gallerySourceCanvas')}
                  </span>
                ) : null}
                {/* V-2 主图角标 — 常显（不依赖 hover），与 hover 才出现的
                    role/weight 控件层分开渲染，保证「谁是主图」在鼠标移开后
                    仍然可读。 */}
                {reference.isPrimary ? (
                  <span
                    title={tDossier('primaryBadge')}
                    className="absolute right-1 top-1 flex items-center gap-0.5 rounded-full bg-node-paint/90 px-1.5 py-0.5 text-2xs font-semibold text-node-canvas"
                  >
                    <Star className="size-2.5 fill-current" aria-hidden />
                    {tDossier('primaryBadge')}
                  </span>
                ) : null}
                {/* R3-6a §4 出场组〈出场〉章 — 中性墨盖章语言（rounded-none +
                    微倾），常显（不依赖 hover）。已出场/★主图=实心加重，
                    未出场=淡描边；石绿纪律：这不是选中态，不用 --node-paint。 */}
                <span
                  title={
                    reference.isPrimary
                      ? tDossier('onStageAlwaysOn')
                      : reference.onStage
                        ? tDossier('onStageOn')
                        : tDossier('onStageOff')
                  }
                  className={cn(
                    'absolute bottom-1 left-1 inline-flex h-5 -rotate-2 items-center gap-0.5 rounded-none border px-1.5 text-2xs font-semibold',
                    reference.isPrimary || reference.onStage
                      ? 'border-node-foreground/70 bg-node-foreground/10 text-node-foreground'
                      : 'border-node-panel-inner/70 text-node-subtle',
                  )}
                >
                  <Flag
                    className={cn(
                      'size-2.5',
                      (reference.isPrimary || reference.onStage) &&
                        'fill-current',
                    )}
                    aria-hidden
                  />
                  {tDossier('onStageBadge')}
                </span>
                <div className="absolute inset-0 flex flex-col justify-between bg-node-canvas/0 opacity-0 transition-opacity group-hover:bg-node-canvas/55 group-hover:opacity-100">
                  <div className="flex items-center justify-end gap-1 p-1">
                    <button
                      type="button"
                      onClick={() => setPrimaryReference(reference.id)}
                      aria-label={
                        reference.isPrimary
                          ? t('unsetPrimary')
                          : t('setPrimary')
                      }
                      title={
                        reference.isPrimary
                          ? t('unsetPrimary')
                          : t('setPrimary')
                      }
                      className={cn(
                        'nodrag flex size-6 items-center justify-center rounded-full bg-node-panel/90 transition-colors',
                        reference.isPrimary
                          ? 'text-node-paint'
                          : 'text-node-foreground hover:text-node-paint',
                      )}
                    >
                      <Star
                        className={cn(
                          'size-3.5',
                          reference.isPrimary && 'fill-current',
                        )}
                      />
                    </button>
                    {!reference.isPrimary ? (
                      <button
                        type="button"
                        onClick={() => toggleOnStage(reference.id)}
                        aria-label={
                          reference.onStage
                            ? tDossier('onStageToggleOff')
                            : tDossier('onStageToggleOn')
                        }
                        title={
                          reference.onStage
                            ? tDossier('onStageToggleOff')
                            : tDossier('onStageToggleOn')
                        }
                        className={cn(
                          'nodrag flex size-6 items-center justify-center rounded-full bg-node-panel/90 transition-colors',
                          reference.onStage
                            ? 'text-node-foreground'
                            : 'text-node-muted hover:text-node-foreground',
                        )}
                      >
                        <Flag
                          className={cn(
                            'size-3.5',
                            reference.onStage && 'fill-current',
                          )}
                        />
                      </button>
                    ) : null}
                    {onExtract ? (
                      <button
                        type="button"
                        onClick={() => onExtract(reference)}
                        aria-label={tDossier('galleryExtract')}
                        title={tDossier('galleryExtract')}
                        className="nodrag flex size-6 items-center justify-center rounded-full bg-node-panel/90 text-node-foreground transition-colors hover:text-node-paint"
                      >
                        <ArrowUpRight className="size-3.5" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeReference(reference.id)}
                      aria-label={t('remove')}
                      title={t('remove')}
                      className="nodrag flex size-6 items-center justify-center rounded-full bg-node-panel/90 text-node-foreground transition-colors hover:text-node-status-failed"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1 p-1.5">
                    <select
                      value={reference.role}
                      onChange={(event) =>
                        updateReference(reference.id, {
                          role: event.target.value as NodeWorkflowReferenceRole,
                        })
                      }
                      className="nodrag nopan nowheel h-6 w-full rounded-lg border border-node-panel-inner/70 bg-node-panel/90 text-2xs font-semibold text-node-foreground"
                    >
                      {NODE_STUDIO_REFERENCE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {t(`roles.${role}`)}
                        </option>
                      ))}
                    </select>
                    {reference.role === NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID ? (
                      <input
                        type="text"
                        value={reference.customLabel ?? ''}
                        onChange={(event) =>
                          updateReference(reference.id, {
                            customLabel: event.target.value || undefined,
                          })
                        }
                        placeholder={t('customLabelPlaceholder')}
                        aria-label={t('customLabelPlaceholder')}
                        className="nodrag nopan nowheel h-6 w-full rounded-lg border border-node-panel-inner/70 bg-node-panel/90 px-1.5 text-2xs text-node-foreground"
                      />
                    ) : null}
                    <input
                      type="range"
                      min={NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.minWeight}
                      max={NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxWeight}
                      step={NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.weightStep}
                      value={reference.weight}
                      onChange={(event) =>
                        updateReference(reference.id, {
                          weight: Number(event.target.value),
                        })
                      }
                      aria-label={t('weightLabel')}
                      className="nodrag nopan nowheel h-3 w-full accent-node-paint"
                    />
                  </div>
                </div>
              </div>
            ))}

            {extraItems?.map((item) => (
              <div
                key={item.id}
                title={item.label}
                className="node-card-window relative aspect-square overflow-hidden rounded-xl border border-node-port-character/40 bg-node-card-window"
              >
                <Image
                  src={item.url}
                  alt={item.label}
                  fill
                  sizes="120px"
                  className="object-cover"
                  unoptimized
                />
                <span className="absolute left-1 top-1 rounded-full bg-node-port-character/90 px-1.5 py-0.5 text-2xs font-semibold text-node-canvas">
                  {item.badge ?? tDossier('gallerySourceCloseup')}
                </span>
              </div>
            ))}

            {!disabled ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={tDossier('galleryAddAria')}
                    title={tDossier('galleryAddAria')}
                    // ⚠ 实线不虚线：虚线在这套语言里只出现过一次，就是被 R2
                    // 删掉的那个空态取景框；留一颗虚线小方块会把它救回来。
                    className="nodrag nopan nowheel flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border border-node-edge text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-node-focus-ring/30"
                  >
                    <ImagePlus className="size-4" aria-hidden />
                    <span className="text-2xs font-medium">
                      {tDossier('galleryAdd')}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={8}
                  collisionPadding={12}
                  className="w-80 rounded-2xl border-node-panel-inner bg-node-panel/96 p-0 text-node-foreground shadow-node-panel backdrop-blur-xl"
                >
                  {addPanel}
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'nodrag nopan nowheel inline-flex h-8 min-w-0 items-center gap-1.5 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-2.5 text-xs font-semibold text-node-muted transition-colors hover:border-node-edge hover:bg-node-panel-inner hover:text-node-foreground disabled:cursor-not-allowed disabled:text-node-subtle',
              references.length > 0 &&
                'border-node-port-character/45 bg-node-port-character/10 text-node-port-character',
            )}
          >
            <ImagePlus className="size-3.5 shrink-0" />
            {triggerLabel ??
              t('chip', {
                count: references.length,
                max: effectiveMaxItems,
              })}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="w-80 rounded-2xl border-node-panel-inner bg-node-panel/96 p-0 text-node-foreground shadow-node-panel backdrop-blur-xl"
        >
          <div className="border-b border-node-panel-inner px-4 py-3">
            <p className="text-sm font-semibold text-node-foreground">
              {t('title')}
            </p>
            <p className="mt-1 text-xs leading-5 text-node-muted">
              {disabled ? t('unsupported') : t('hint')}
            </p>
          </div>

          {addPanel}

          <div className="space-y-2 border-t border-node-panel-inner p-3">
            {references.length === 0 ? (
              <p className="rounded-xl bg-node-panel-soft px-3 py-2 text-xs text-node-muted">
                {t('empty')}
              </p>
            ) : null}
            {references.map((reference) => (
              <div
                key={reference.id}
                className="flex gap-2 rounded-xl border border-node-panel-inner bg-node-panel-soft p-2"
              >
                <div className="relative size-10 overflow-hidden rounded-lg bg-node-panel-inner">
                  <Image
                    src={reference.url}
                    alt={reference.name ?? t('title')}
                    fill
                    sizes="40px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <select
                    value={reference.role}
                    onChange={(event) =>
                      updateReference(reference.id, {
                        role: event.target.value as NodeWorkflowReferenceRole,
                      })
                    }
                    className="nodrag nopan nowheel h-7 w-full rounded-xl border border-node-panel-inner bg-node-panel text-xs font-semibold text-node-foreground"
                  >
                    {NODE_STUDIO_REFERENCE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {t(`roles.${role}`)}
                      </option>
                    ))}
                  </select>
                  {reference.role === NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID ? (
                    <input
                      type="text"
                      value={reference.customLabel ?? ''}
                      onChange={(event) =>
                        updateReference(reference.id, {
                          customLabel: event.target.value || undefined,
                        })
                      }
                      placeholder={t('customLabelPlaceholder')}
                      aria-label={t('customLabelPlaceholder')}
                      className="nodrag nopan nowheel h-7 w-full rounded-xl border border-node-panel-inner bg-node-panel px-2 text-xs text-node-foreground"
                    />
                  ) : null}
                  <input
                    type="range"
                    min={NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.minWeight}
                    max={NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxWeight}
                    step={NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.weightStep}
                    value={reference.weight}
                    onChange={(event) =>
                      updateReference(reference.id, {
                        weight: Number(event.target.value),
                      })
                    }
                    aria-label={t('weightLabel')}
                    className="nodrag nopan nowheel w-full accent-node-edge-active"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeReference(reference.id)}
                  aria-label={t('remove')}
                  className="nodrag nopan nowheel flex size-8 items-center justify-center rounded-full text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}
