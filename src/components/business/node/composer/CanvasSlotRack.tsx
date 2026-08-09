'use client'

import { useState } from 'react'
import { ChevronDown, ImageIcon, Link2Off, Music2, Video } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { ComposerReferenceToken } from '@/hooks/node/use-video-composer'
import type { VideoSendSlotLimits } from '@/lib/node-video-send-slots'
import { cn } from '@/lib/utils'

import type { ReferenceTokenKind } from './ReferenceTokenChip'

/**
 * 素材槽架（腰带）—— 契约见 `docs/references/pages/canvas-slot-rack.md`。
 *
 * 这个件回答三个问题，且**只有它**回答：挂了哪些素材 · 一共多少满没满 ·
 * 这次真的会发出去吗。它取代此前的四本账（composer chip 行 / 正文 @token /
 * 详情面板「已引用 N / 已连接 M」/ 底部 inputs 计数）。
 *
 * ── 三级折叠：折缩略图，不折账（契约 §4.2） ──────────────────────────
 * 静息摘要 → 分类行 → 缩略图。**任何一级都读得到「有多少、满没满」**，
 * 折叠只折缩略图。
 *
 * ── 两档密度 = 同一个件的两个默认折叠深度（契约 §4.3） ────────────────
 * `defaultExpanded` 是两档**唯一**的差别：紧凑档（画布卡）默认折起、完整档
 * （详情面板）默认展开。**不是两套渲染** —— 此前 `VideoComposer` 的
 * `density='card'` 分支自己画了一条 `referenceTokens.slice(0, 5)` 的 strip，
 * 那正是「两档计数框出来不是同一个数」的来源（紧凑档从来只显示 5 个，而契约
 * 上限是 12）。
 */

/**
 * 区的清单**从容量契约的键派生**，不是手写的数组。
 *
 * ⚠ 这不是洁癖：本轮原型逐格手写分类，导致**四处漏掉视频区**（其中一处是详情
 * 面板档，正好戳穿「两档同一份名单」的论点），而契约里 `slots.videos` 一直是 3
 * —— 漏了就是能力被 UI 藏掉。派生之后，`VideoSendSlotLimits` 加一个模态，下面
 * 两个 `Record` 立刻编译失败，漏不掉。
 */
type SlotZoneId = Exclude<keyof VideoSendSlotLimits, 'imagesLimitedByTotal'>

interface SlotZoneMeta {
  /** 区序。摘要行与分类行都按它排，两处不会分岔。 */
  order: number
  icon: LucideIcon
}

/** `Record` 保证穷举 —— 少一个区就编译不过。 */
const SLOT_ZONES: Record<SlotZoneId, SlotZoneMeta> = {
  images: { order: 0, icon: ImageIcon },
  audio: { order: 1, icon: Music2 },
  videos: { order: 2, icon: Video },
}

const ZONE_IDS: readonly SlotZoneId[] = (
  Object.keys(SLOT_ZONES) as SlotZoneId[]
).sort((a, b) => SLOT_ZONES[a].order - SLOT_ZONES[b].order)

/**
 * 素材落在哪个区。
 *
 * ⚠ 这份映射必须与**收割侧**一致，否则界面说的和发出去的是两回事：
 * `harvestUpstreamAudioBindings` 收 voice · `harvestUpstreamVideoUrls` 收 video ·
 * 其余五种 kind 全部进 `assembleReferenceImagePayload` 的图片位。
 * `Record<ReferenceTokenKind, …>` 保证七种 kind 一个不漏。
 */
const ZONE_BY_KIND: Record<ReferenceTokenKind, SlotZoneId> = {
  character: 'images',
  background: 'images',
  shot: 'images',
  keyframe: 'images',
  closeup: 'images',
  voice: 'audio',
  video: 'videos',
}

export interface CanvasSlotRackProps {
  tokens: readonly ComposerReferenceToken[]
  /**
   * 这一档**解算后**的容量（已扣掉跨模态总额）。分类清单与「满没满」的唯一
   * 事实源 —— 来自 `sendPreview.slotLimits`，即发送路径读的同一份。
   */
  slotLimits: VideoSendSlotLimits
  /**
   * 默认折叠深度。紧凑档 `false`、完整档 `true`。
   * **这是两档密度之间唯一的差别**（契约 §4.3）。
   */
  defaultExpanded: boolean
  /** 本次不会发送的素材 URL —— 槽位上标出来，**不销毁**（契约 §4.7）。 */
  unsendableUrls?: ReadonlySet<string>
  /**
   * URL → 这张图在本次载荷里的位置（1-based）。缺席 = 它没进载荷（超出上限那
   * 几张），那就没有位置可标。
   *
   * ⚠ 必须与正文引用胶囊读**同一份**（`sendPreview.images[].index`），否则槽位
   * 角标说 3、胶囊说 2、模型收到 `@Image2` —— 三处各说各的，正是这一轮在治的
   * 那件事。契约 §4.6：**序号盖在图上**，与具名槽的「名字戴在位上」是两种长相，
   * 免得「图1」被读成「第一帧」。
   */
  slotIndexByUrl?: ReadonlyMap<string, number>
  /**
   * **双击**槽位 → 聚焦到画布上的源节点。
   *
   * ⚠ 定位挂在双击上、插入挂在单击上，不是随手定的：写提示词时「引用某张图」是
   * 高频动作，「看看它在画布哪儿」是低频动作，最轻的手势要给高频的那个。而且
   * 相机飞走会打断正在组织的句子 —— 单击就飞是 2026-08-09 被 owner 当场否掉的
   * 第一版。同 LibTV（它的缩略图 tooltip 明写「双击可聚焦至节点」）。
   */
  onLocate?(nodeId: string): void
  /**
   * **单击**槽位 → 在正文光标处插入一个引用胶囊。
   *
   * 胶囊显示位置（「图 3」）、存储 `@名字`；它只标位置**不决定发不发** ——
   * 范围是槽架的事（契约 §一）。缺省则单击不做任何事。
   */
  onInsert?(token: ComposerReferenceToken): void
  /**
   * 移除槽位 = **删连线**（节点保留）。只对有直连边的素材提供 —— 经 1-hop 路由
   * 进来的（voice → character → video）没有自己的边可删。
   *
   * ⚠ 这是新契约下「不想发某条素材」的**唯一**手势：`@` narrowing 退役后，
   * 在槽里就等于会发送（Q4「删边不删 token」消解为「移除槽位」）。
   */
  onRemove?(token: ComposerReferenceToken): void
}

/** 该区当前的持有量与上限。`Infinity` 上限不渲染成我们编的数字。 */
function zoneCount(
  zone: SlotZoneId,
  tokens: readonly ComposerReferenceToken[],
  slotLimits: VideoSendSlotLimits,
): { held: number; limit: number } {
  return {
    held: tokens.filter((token) => ZONE_BY_KIND[token.kind] === zone).length,
    limit: slotLimits[zone],
  }
}

export function CanvasSlotRack({
  tokens,
  slotLimits,
  defaultExpanded,
  unsendableUrls,
  slotIndexByUrl,
  onLocate,
  onInsert,
  onRemove,
}: CanvasSlotRackProps) {
  const t = useTranslations('StudioNode.videoComposer.slotRack')
  /**
   * ⚠ 名字必须有兜底：未命名的素材（`label` 与 `token` 都是空串）此前会渲染成
   * 一个**没有字的空灰块** —— 真机实拍到，用户根本看不出那一格是什么。退役的
   * 旧件在抽屉里有一句「给该节点命名后即可作为标签插入」，槽架没有那个位置，
   * 所以退回到族名（「镜头」/「角色」…），至少说清它是哪一类。
   */
  const tKind = useTranslations('StudioNode.videoComposer.refKind')
  const [rackOpen, setRackOpen] = useState(defaultExpanded)
  const [openZones, setOpenZones] = useState<ReadonlySet<SlotZoneId>>(() =>
    defaultExpanded ? new Set(ZONE_IDS) : new Set(),
  )

  const counts = ZONE_IDS.map((zone) => ({
    zone,
    ...zoneCount(zone, tokens, slotLimits),
  }))
  /**
   * 只显示**这一档真的存在**的区（上限 0 = 当前模式不吃这个模态）。
   * 契约 §4.7：不支持的区输入面真不渲染 —— 不假装能力存在。
   */
  const visibleZones = counts.filter((entry) => entry.limit > 0)
  const held = tokens.length
  const total = slotLimits.images + slotLimits.videos + slotLimits.audio

  function toggleZone(zone: SlotZoneId) {
    setOpenZones((current) => {
      const next = new Set(current)
      if (next.has(zone)) next.delete(zone)
      else next.add(zone)
      return next
    })
  }

  return (
    <div
      className="canvas-slot-rack"
      data-expanded={rackOpen ? 'true' : undefined}
    >
      {/* 静息摘要 —— 折起时它是唯一可见的一行，所以**账必须写在这里**。 */}
      <button
        type="button"
        onClick={() => setRackOpen((open) => !open)}
        aria-expanded={rackOpen}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-2xs text-node-muted hover:bg-node-panel-inner"
      >
        <span className="min-w-0 flex-1 truncate">
          {visibleZones
            .map((entry) => t(`zones.${entry.zone}`, { count: entry.held }))
            .join(' · ')}
        </span>
        <span className="shrink-0 tabular-nums text-node-subtle">
          {t('total', { held, total })}
        </span>
        <ChevronDown
          className={cn(
            'size-3 shrink-0 transition-transform',
            rackOpen && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {rackOpen ? (
        <ul className="mt-1 space-y-1">
          {visibleZones.map((entry) => {
            const Icon = SLOT_ZONES[entry.zone].icon
            const zoneTokens = tokens.filter(
              (token) => ZONE_BY_KIND[token.kind] === entry.zone,
            )
            const zoneOpen = openZones.has(entry.zone)
            return (
              <li key={entry.zone}>
                {/* 分类行 —— 展开缩略图与否，n/max 都在这里读得到。 */}
                <button
                  type="button"
                  onClick={() => toggleZone(entry.zone)}
                  aria-expanded={zoneOpen}
                  className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-2xs text-node-muted hover:bg-node-panel-inner"
                >
                  <Icon className="size-3 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {t(`zoneLabel.${entry.zone}`)}
                  </span>
                  <span className="shrink-0 tabular-nums text-node-subtle">
                    {t('zoneCount', { held: entry.held, limit: entry.limit })}
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-3 shrink-0 transition-transform',
                      zoneOpen && 'rotate-180',
                    )}
                    aria-hidden
                  />
                </button>

                {zoneOpen && zoneTokens.length > 0 ? (
                  <ul className="flex flex-wrap gap-1 px-1.5 pb-1 pt-0.5">
                    {zoneTokens.map((token) => {
                      const unsendable = Boolean(
                        token.mediaUrl && unsendableUrls?.has(token.mediaUrl),
                      )
                      const thumbnailUrl =
                        token.kind === 'voice'
                          ? token.coverImage
                          : token.mediaUrl
                      // 见顶部 `tKind` 的注释：未命名素材不能渲染成空白格。
                      const displayName =
                        token.label || token.token || tKind(token.kind)
                      const slotIndex = token.mediaUrl
                        ? slotIndexByUrl?.get(token.mediaUrl)
                        : undefined
                      return (
                        <li
                          key={token.id}
                          className="flex items-center gap-0.5 rounded-lg border border-node-panel-inner pr-0.5"
                        >
                          <button
                            type="button"
                            onClick={() => onInsert?.(token)}
                            onDoubleClick={() => onLocate?.(token.id)}
                            title={
                              onInsert
                                ? t('slotHint', { name: displayName })
                                : displayName
                            }
                            className={cn(
                              'flex max-w-[9rem] items-center gap-1 rounded-lg py-1 pl-1 pr-1.5 text-2xs text-node-muted hover:bg-node-panel-inner',
                              unsendable && 'opacity-40',
                            )}
                          >
                            {/* 折叠的第三级就叫「缩略图」—— 音色用封面，其余用
                                自己的媒体；都没有时退回首字，不留空洞。
                                ⚠ 序号**盖在图上**（契约 §4.6）：它是位置不是名字，
                                所以压在缩略图角上，而不是排在名字旁边 —— 具名槽
                                的「帽子」才占名字那个位。 */}
                            <span className="relative size-5 shrink-0">
                              {thumbnailUrl ? (
                                // 画布素材是用户上传或 R2 生成 URL，不吃
                                // next/image 的静态 host 契约。
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={thumbnailUrl}
                                  alt=""
                                  className="size-full rounded object-cover"
                                />
                              ) : (
                                <span
                                  aria-hidden
                                  className="flex size-full items-center justify-center rounded bg-node-panel-inner"
                                >
                                  {displayName.slice(0, 1)}
                                </span>
                              )}
                              {slotIndex !== undefined ? (
                                <span
                                  aria-hidden
                                  className="absolute -bottom-0.5 -right-0.5 flex min-w-3 items-center justify-center rounded bg-node-canvas/85 px-0.5 text-3xs font-semibold leading-none text-node-foreground"
                                >
                                  {slotIndex}
                                </span>
                              ) : null}
                            </span>
                            <span className="truncate">{displayName}</span>
                          </button>
                          {/* ⚠ 常显，不藏在 hover 里 —— 契约 §十「触屏无 hover
                              依赖」。旧件的 × 是 `group-hover` 才现形，触屏点不到。 */}
                          {onRemove && token.edgeId ? (
                            <button
                              type="button"
                              onClick={() => onRemove(token)}
                              aria-label={t('remove', { name: displayName })}
                              title={t('remove', { name: displayName })}
                              className="flex size-4 shrink-0 items-center justify-center rounded text-node-subtle hover:bg-node-panel-inner hover:text-node-foreground"
                            >
                              <Link2Off className="size-3" aria-hidden />
                            </button>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
