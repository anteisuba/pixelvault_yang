'use client'

/**
 * 画布上的角色卡（画布用角色 ④，owner 09-27 方向 A「原地展开」，画板
 * `DesignCanvasCharacterUi.dc.html`）。
 *
 * ⭐ 她 = 一张 `image.character` 节点 + `characterId`；卡面、图片页、文字页都**现读**
 *   角色库（`useCharacterLibrary`），画布只存「是她」。
 * ⭐ 收起 = 与图片卡同一种长相：卡就是她的主图，名字在卡外上方（现读角色库的名字）。
 * ⭐ 选中 = 原地变宽展开，下面「图片 / 文字」液态分段；⛔ 没有底部提示词面板（她不在
 *   画布上出图）、⛔ 没有进出口（不连线，镜头用她走 @）、⛔ 没有工具条（owner 09-28：
 *   「在角色页打开」没什么用；要去角色页走文字页底下那一行）。
 * ⭐ 图片页点一张 = 右边落一张普通图片卡「她 · 图 N」并选中它，⛔ 不连线。
 * ⚠ 开合成对（owner 09-27「从扩大到缩小没有动效」）：展开 `LIQUID_SPRING.unfold`，
 *   收回内容先退、再 `retract`；页签换场走 `LIQUID_TIMING.swap*` 短模糊。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { NodeProps } from '@xyflow/react'
import { useLocale, useTranslations } from 'next-intl'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { cardManagementPath } from '@/constants/routes'
import { LIQUID_SPRING, LIQUID_TIMING } from '@/constants/motion'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
} from '@/constants/node-types'
import { NODE_V4_CARD, NODE_V4_CHARACTER_CARD } from '@/constants/node-studio'
import type { CharacterCardRecord } from '@/types'
import type { NodeV4ImageData } from '@/types/node-workflow'
import { ArrowUpRight } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { useCharacterCardUsage } from '@/hooks/cards/use-character-card-usage'
import { useCharacterLibrary } from '@/hooks/cards/use-character-library'
import { requestOperatorDraft } from '@/hooks/use-studio-operator-store'
import { cn } from '@/lib/utils'

import { NodeCardShell } from './chrome'
import { NodeV4ContextMenu } from './NodeV4ContextMenu'
import { useNodeV4Canvas, type NodeV4MediaPatch } from './NodeV4Context'

type CharacterTab = 'images' | 'text'

interface CharacterTile {
  readonly key: string
  readonly url: string
  readonly width?: number
  readonly height?: number
  readonly generationId?: string
  readonly primary: boolean
}

/** 她的主图：主图槽 → 第一张槽 → 建卡时的源图。 */
function mainImageOf(card: CharacterCardRecord): string | undefined {
  return (
    card.referenceSlots.find((slot) => slot.isPrimary)?.url ??
    card.referenceSlots[0]?.url ??
    card.sourceImageUrl ??
    undefined
  )
}

/** 同一种「开 / 关」节拍：reduced motion 下全部直接到位。 */
function motionFor(reduced: boolean | null) {
  if (reduced) {
    const none = { duration: 0 }
    return { open: none, close: none, fadeIn: none, fadeOut: none, swap: none }
  }
  return {
    open: LIQUID_SPRING.unfold,
    close: { ...LIQUID_SPRING.retract, delay: LIQUID_TIMING.retractDelayS },
    fadeIn: {
      duration: LIQUID_TIMING.bodyInS,
      delay: LIQUID_TIMING.headInDelayS,
    },
    fadeOut: { duration: LIQUID_TIMING.contentOutS },
    swap: {
      duration: LIQUID_TIMING.swapInS,
      delay: LIQUID_TIMING.swapInDelayS,
    },
  }
}

export function CharacterNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4.character')
  const tRoster = useTranslations('CharacterRoster')
  const tMissing = useTranslations('StudioNode.v4.chrome.mediaMissing')
  const locale = useLocale()
  const canvas = useNodeV4Canvas()
  const reduced = useReducedMotion()
  const beats = motionFor(reduced)
  const nodeData = data as unknown as NodeV4ImageData
  const library = useCharacterLibrary()
  const card = nodeData.characterId ? library.find(nodeData.characterId) : null
  const expanded = Boolean(selected) && canvas.selectedNodeIds.length < 2
  const [tab, setTab] = useState<CharacterTab>('images')
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const node = canvas.nodes.find((item) => item.id === id)
  const usage = useCharacterCardUsage(card?.id ?? null, expanded)

  const openInCharacterPage = useCallback(() => {
    if (!nodeData.characterId) return
    window.open(
      `/${locale}${cardManagementPath({ tab: 'characters', character: nodeData.characterId })}`,
      '_blank',
      'noopener',
    )
  }, [locale, nodeData.characterId])

  const handToAssistant = (key: 'writeScriptDraft' | 'writeLinesDraft') => {
    if (!card) return
    requestOperatorDraft(
      ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas,
      t(key, { name: card.name }),
    )
  }

  const latest = useRef({ canvas })
  useEffect(() => {
    latest.current = { canvas }
  }, [canvas])

  /**
   * 新卡出现在图上之后再回填地址，再选中它（她跟着取消选中 = 收回）。⚠ 选中要等
   * 新卡进了选择层才生效，所以选到为止、最多等 10 帧；⛔ 不动视口（画板：不飞）。
   */
  const backfill = useCallback((nodeId: string, patch: NodeV4MediaPatch) => {
    const select = (attempt: number): void => {
      const fresh = latest.current.canvas
      if (fresh.selectedNodeIds.includes(nodeId) || attempt >= 10) return
      fresh.onSelectNode?.(nodeId)
      window.requestAnimationFrame(() => select(attempt + 1))
    }
    const step = (attempt: number): void => {
      const fresh = latest.current.canvas
      if (fresh.nodes.some((item) => item.id === nodeId) || attempt >= 10) {
        fresh.onSetMedia(nodeId, patch)
        select(0)
        return
      }
      window.requestAnimationFrame(() => step(attempt + 1))
    }
    step(0)
  }, [])

  const placeTile = async (tile: CharacterTile, index: number) => {
    if (!card) return
    // 右边第一个空位（§7 摆放 A「让位」）：连点几张不再叠成一摞。
    const position = canvas.onPlaceBeside(id, [
      {
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.reference,
      },
    ])?.[0]
    const outcome = await canvas.onApplyBatch([
      {
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.reference,
        name: t('placedName', { name: card.name, index: index + 1 }),
        ...(position ? { position } : {}),
      },
    ])
    const created = outcome?.createdNodeIds?.[0]
    if (!created) return
    backfill(created, {
      url: tile.url,
      imageSource: 'existing',
      ...(tile.generationId ? { generationId: tile.generationId } : {}),
      ...(tile.width && tile.height
        ? { mediaWidth: tile.width, mediaHeight: tile.height }
        : {}),
    })
  }

  const removeFromCanvas = () =>
    void canvas.onApplyOp({ op: NODE_ASSISTANT_OP_V4_IDS.delete, target: id })

  const mainImage = card ? mainImageOf(card) : undefined
  const tiles: CharacterTile[] = card
    ? [
        ...card.referenceSlots.map((slot) => ({
          key: `slot:${slot.id}`,
          url: slot.url,
          primary: slot.isPrimary,
          ...(slot.generationId ? { generationId: slot.generationId } : {}),
        })),
        ...usage.generations
          .filter(
            (generation) =>
              !card.referenceSlots.some((slot) => slot.url === generation.url),
          )
          .map((generation) => ({
            key: `generation:${generation.id}`,
            url: generation.url,
            width: generation.width,
            height: generation.height,
            generationId: generation.id,
            primary: false,
          })),
      ]
    : []
  const onCardCount = card?.referenceSlots.length ?? 0

  /** 卡面：读不到她 / 她还没有图时是灰底一句话（画板 S1 / S2），⛔ 不画空虚线框。 */
  const face = !library.loaded ? (
    <div className="size-full bg-surface-fill-track" />
  ) : !card ? (
    <div
      data-character-face="deleted"
      className="flex size-full flex-col items-center justify-center gap-2.5 bg-surface-fill-track px-4 text-center"
    >
      <p className="text-sm leading-5 text-foreground/80">{t('deleted')}</p>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          removeFromCanvas()
        }}
        className="nodrag nopan inline-flex h-8 items-center rounded-full border border-border bg-background px-3.5 text-xs font-medium transition-colors duration-fast ease-standard hover:bg-surface-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {tMissing('remove')}
      </button>
    </div>
  ) : !mainImage ? (
    <div
      data-character-face="no-images"
      className="flex size-full flex-col items-center justify-center gap-2 bg-surface-fill-track px-6 text-center"
    >
      <p className="text-sm leading-5 text-foreground/80">{t('noImages')}</p>
      <p className="text-xs text-muted-foreground">{t('noImagesHint')}</p>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          openInCharacterPage()
        }}
        className="nodrag nopan mt-0.5 inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-3.5 text-xs font-medium transition-colors duration-fast ease-standard hover:bg-surface-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {t('addImages')}
        <ArrowUpRight aria-hidden className="size-3.5" />
      </button>
    </div>
  ) : (
    // R2 上的任意用户媒体，与画布其它卡同一条 raw-img 约定。
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mainImage}
      alt={card.name}
      draggable={false}
      className="size-full object-cover"
    />
  )

  /** 她的文字：外观在前（角色页头上那一句），再是设定四格；只列写了的。 */
  const fields: { key: string; label: string; text: string }[] = card
    ? [
        { key: 'look', label: 'fieldLooks', text: card.description ?? '' },
        ...(
          [
            ['identity', 'fieldIdentity'],
            ['behavior', 'fieldBehavior'],
            ['speech', 'fieldSpeech'],
            ['backstory', 'fieldBackstory'],
          ] as const
        ).map(([key, label]) => ({
          key,
          label,
          text: card.persona?.[key] ?? '',
        })),
      ].filter((field) => field.text.trim().length > 0)
    : []

  return (
    <>
      <motion.div
        onContextMenu={(event) => {
          event.preventDefault()
          setMenu({
            x: event.nativeEvent.offsetX,
            y: event.nativeEvent.offsetY,
          })
        }}
        data-character-node
        data-expanded={expanded ? 'true' : 'false'}
        className="relative"
        initial={false}
        animate={{
          width: expanded
            ? NODE_V4_CARD.expandedWidth
            : NODE_V4_CARD.collapsedWidth,
        }}
        transition={expanded ? beats.open : beats.close}
      >
        <NodeCardShell
          name={card?.name ?? nodeData.name}
          renameAriaLabel={nodeData.name}
          selected={selected}
          expanded={expanded}
          changed={canvas.changedNodeIds.includes(id)}
          surfaceClassName="overflow-hidden"
        >
          <motion.div
            initial={false}
            animate={{
              height: expanded
                ? NODE_V4_CHARACTER_CARD.expandedImageHeight
                : NODE_V4_CHARACTER_CARD.imageHeight,
            }}
            transition={expanded ? beats.open : beats.close}
            className="overflow-hidden"
          >
            {face}
          </motion.div>

          <AnimatePresence initial={false}>
            {expanded && card ? (
              <motion.div
                key="body"
                initial={{ height: 0, opacity: 0 }}
                animate={{
                  height: 'auto',
                  opacity: 1,
                  transition: { height: beats.open, opacity: beats.fadeIn },
                }}
                exit={{
                  height: 0,
                  opacity: 0,
                  transition: { height: beats.close, opacity: beats.fadeOut },
                }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
                  <div className="nodrag nopan">
                    <LiquidSegmented<CharacterTab>
                      items={[
                        { value: 'images', label: t('imagesTab') },
                        { value: 'text', label: t('textTab') },
                      ]}
                      value={tab}
                      onChange={setTab}
                      ariaLabel={t('tabsLabel')}
                      fill
                    />
                  </div>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={tab}
                      initial={{
                        opacity: 0,
                        filter: `blur(${LIQUID_TIMING.blurPx}px)`,
                      }}
                      animate={{
                        opacity: 1,
                        filter: 'blur(0px)',
                        transition: beats.swap,
                      }}
                      exit={{
                        opacity: 0,
                        filter: `blur(${LIQUID_TIMING.blurPx}px)`,
                        transition: {
                          duration: reduced ? 0 : LIQUID_TIMING.swapOutS,
                        },
                      }}
                      className="nowheel overflow-y-auto"
                      style={{
                        maxHeight: NODE_V4_CHARACTER_CARD.bodyMaxHeight,
                      }}
                    >
                      {tab === 'images' ? (
                        <div className="flex flex-col gap-2">
                          <div className="grid grid-cols-3 gap-1.5">
                            {tiles.map((tile, index) => (
                              <button
                                key={tile.key}
                                type="button"
                                data-character-tile
                                aria-label={t('placeImage')}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void placeTile(tile, index)
                                }}
                                onDoubleClick={(event) =>
                                  event.stopPropagation()
                                }
                                className="nodrag nopan group/tile relative aspect-4/5 overflow-hidden rounded-lg bg-surface-fill-track focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={tile.url}
                                  alt=""
                                  draggable={false}
                                  loading="lazy"
                                  className="size-full object-cover"
                                />
                                {tile.primary ? (
                                  <span className="absolute left-1 top-1 rounded-full bg-background/90 px-1.5 text-3xs">
                                    {tRoster('primary')}
                                  </span>
                                ) : null}
                                <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded-full bg-background/90 py-0.5 text-center text-3xs opacity-0 transition-opacity duration-fast ease-standard group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100">
                                  {t('placeImage')}
                                </span>
                              </button>
                            ))}
                          </div>
                          <p className="text-2xs text-muted-foreground">
                            {usage.isLoading && tiles.length === onCardCount
                              ? t('imagesLoading')
                              : t('imagesHint', {
                                  onCard: onCardCount,
                                  made: tiles.length - onCardCount,
                                })}
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {fields.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              {t('noText')}
                            </p>
                          ) : (
                            fields.map((field) => (
                              <div
                                key={field.key}
                                className="flex flex-col gap-0.5"
                              >
                                <span className="text-2xs text-muted-foreground">
                                  {tRoster(field.label)}
                                </span>
                                <p
                                  className={cn(
                                    'whitespace-pre-line text-sm leading-6',
                                    field.key === 'backstory' && 'line-clamp-4',
                                  )}
                                >
                                  {field.text}
                                </p>
                              </div>
                            ))
                          )}
                          {/* 她的设定交给画布助手：填进输入框、打开面板，⛔ 不替用户发。 */}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              className="nodrag nopan"
                              onClick={(event) => {
                                event.stopPropagation()
                                handToAssistant('writeScriptDraft')
                              }}
                            >
                              {t('writeScript')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="nodrag nopan"
                              onClick={(event) => {
                                event.stopPropagation()
                                handToAssistant('writeLinesDraft')
                              }}
                            >
                              {t('writeLines')}
                            </Button>
                          </div>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              openInCharacterPage()
                            }}
                            className="nodrag nopan inline-flex items-center gap-1 self-start text-2xs text-muted-foreground transition-colors duration-fast hover:text-foreground"
                          >
                            {t('readOnly')}
                            <ArrowUpRight aria-hidden className="size-3" />
                          </button>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </NodeCardShell>
        <AnimatePresence>
          {menu && node ? (
            <NodeV4ContextMenu
              key="menu"
              node={node}
              x={menu.x}
              y={menu.y}
              layoutOnly
              onClose={() => setMenu(null)}
            />
          ) : null}
        </AnimatePresence>
      </motion.div>
    </>
  )
}
