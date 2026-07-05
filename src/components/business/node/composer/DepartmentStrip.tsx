'use client'

import { Mic2, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_TYPE_IDS,
  type NodeImageRole,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { ComposerReferenceToken } from '@/hooks/node/use-video-composer'
import { cn } from '@/lib/utils'

import {
  ReferenceTokenChip,
  type ReferenceTokenData,
  type ReferenceTokenKind,
} from './ReferenceTokenChip'

/** What the ＋添加位 hands back to the composer (§7.1): which node type to
 *  autospawn, its image role, and which media library to open. The composer
 *  resolves an asset then calls `spawnReference`. */
export interface AddReferenceRequest {
  nodeType: NodeWorkflowNodeType
  role?: NodeImageRole
  mediaType: 'image' | 'voice' | 'video'
  /** Autospawn target override — defaults to the video node, but ＋配音 on a
   *  character slot targets the CHARACTER node so the voice becomes its 音色. */
  targetNodeId?: string
}

/** Port-family accent per token kind — the 4px card track and the composer's
 *  flying-token glyph share this map. 'shot' rides the image-family color
 *  (same rationale as ReferenceTokenChip's SHAPE/RING maps). */
export const TOKEN_PORT_COLOR_VAR: Record<ReferenceTokenKind, string> = {
  character: 'var(--node-port-character)',
  background: 'var(--node-port-background)',
  shot: 'var(--node-port-image)',
  keyframe: 'var(--node-port-image)',
  voice: 'var(--node-port-voice)',
  video: 'var(--node-port-video)',
}

/** Cards group by PRODUCTION ROLE (cast-redesign 2026-07-05, supersedes the
 *  modality 3-card): 角色/场景/镜头/动作/旁白 — the cinematographer's cast, not
 *  image/voice/video buckets. 音色 is absorbed into the character slot (身份
 *  单元, see boundVoice), so there is no standalone voice card; 旁白 holds only
 *  voices wired directly into the video. Each card maps to ONE role, so the ＋
 *  spawns that role directly — no submenu. */
const DEPARTMENTS: ReadonlyArray<{
  id: 'character' | 'scene' | 'shot' | 'motion' | 'narration'
  kinds: readonly ReferenceTokenKind[]
  colorVar: string
  /** Node type the card's ＋添加位 autospawns. */
  nodeType: NodeWorkflowNodeType
  mediaType: 'image' | 'voice' | 'video'
  /** Image role stamped on the spawned node (image cards only). */
  role?: NodeImageRole
}> = [
  {
    id: 'character',
    kinds: ['character'],
    colorVar: 'var(--node-port-character)',
    nodeType: NODE_TYPE_IDS.image,
    mediaType: 'image',
    role: NODE_IMAGE_ROLE_IDS.character,
  },
  {
    id: 'scene',
    kinds: ['background'],
    colorVar: 'var(--node-port-background)',
    nodeType: NODE_TYPE_IDS.image,
    mediaType: 'image',
    role: NODE_IMAGE_ROLE_IDS.background,
  },
  {
    id: 'shot',
    kinds: ['shot', 'keyframe'],
    colorVar: 'var(--node-port-image)',
    nodeType: NODE_TYPE_IDS.image,
    mediaType: 'image',
    role: NODE_IMAGE_ROLE_IDS.shot,
  },
  {
    id: 'motion',
    kinds: ['video'],
    colorVar: 'var(--node-port-video)',
    nodeType: NODE_TYPE_IDS.videoReference,
    mediaType: 'video',
  },
  {
    id: 'narration',
    kinds: ['voice'],
    colorVar: 'var(--node-port-voice)',
    nodeType: NODE_TYPE_IDS.voice,
    mediaType: 'voice',
  },
]

interface DepartmentStripProps {
  tokens: ComposerReferenceToken[]
  /** §7.2 ⑥ rename drift — returns the stale `@oldName` still present in the
   *  prompt for this token, if any. */
  driftFor(token: ComposerReferenceToken): string | undefined
  onInsert(data: ReferenceTokenData, originEl: HTMLElement): void
  onReplaceDrift(
    token: ComposerReferenceToken,
    oldName: string,
    newName: string,
  ): void
  onLocate?(nodeId: string): void
  /** §7.1: 删除槽位 = 删连线（节点保留）。Only offered for tokens with a
   *  direct edge into this video node (`edgeId` set). */
  onRemove?(token: ComposerReferenceToken): void
  /** §7.1 ＋添加位: fired when a card's ＋ resolves to a (nodeType, role,
   *  mediaType) request. The composer opens the matching asset library then
   *  autospawns. Absent = ＋ tiles are hidden (read-only strip). */
  onAddReference?(request: AddReferenceRequest): void
  /** cast-redesign: ＋配音 on a character slot with no voice yet — autospawns a
   *  voice node wired into that CHARACTER (not the video), so it becomes the
   *  character's 音色. Gets the character node id. */
  onAddVoice?(characterNodeId: string): void
}

/** cast-redesign 部门条 — 按制作角色五卡（角色/场景/镜头/动作/旁白）。每张卡：
 *  4px 端口色轨 + 标题 + 「n 项引用」计数，槽位投影当前画布连线（槽 =
 *  ReferenceTokenChip，hover 预览 / 单击插入 @ / 漂移替换全沿用）+ 左下
 *  图N/音N/视N payload 角标 + hover 右上 × 删连线。角色槽额外挂**音色徽标**
 *  （有音色=mic/封面，未就绪=置灰，无音色=＋配音 autospawn voice→character）。
 *  旁白卡只收直连视频的语音；音色收进角色不单列。 */
export function DepartmentStrip({
  tokens,
  driftFor,
  onInsert,
  onReplaceDrift,
  onLocate,
  onRemove,
  onAddReference,
  onAddVoice,
}: DepartmentStripProps) {
  const tc = useTranslations('StudioNode.videoComposer')

  return (
    <div className="grid grid-cols-1 gap-2">
      {DEPARTMENTS.map((dept) => {
        const deptTokens = tokens.filter((token) =>
          dept.kinds.includes(token.kind),
        )
        const addTile = onAddReference ? (
          <AddReferenceTile dept={dept} onAddReference={onAddReference} />
        ) : null
        return (
          <section
            key={dept.id}
            aria-label={tc(`departments.${dept.id}`)}
            className="relative overflow-hidden rounded-lg border border-node-panel-inner bg-node-panel-soft py-2 pl-3.5 pr-2.5"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1"
              style={{ background: dept.colorVar }}
            />
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-node-foreground">
                {tc(`departments.${dept.id}`)}
              </span>
              {deptTokens.length > 0 ? (
                <span className="text-2xs tabular-nums text-node-subtle">
                  {tc('references.count', { count: deptTokens.length })}
                </span>
              ) : null}
            </div>
            {deptTokens.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {deptTokens.map((token) => (
                  <DepartmentSlot
                    key={token.id}
                    token={token}
                    driftFrom={driftFor(token)}
                    onInsert={onInsert}
                    onReplaceDrift={onReplaceDrift}
                    onLocate={onLocate}
                    onRemove={onRemove}
                    onAddVoice={onAddVoice}
                  />
                ))}
                {addTile}
              </div>
            ) : (
              <div className="mt-1.5 flex items-center gap-2">
                <p className="text-2xs leading-4 text-node-subtle">
                  {tc('references.emptyDept')}
                </p>
                {addTile}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** §7.1 ＋添加位: a dashed ＋ tile. Each cast card maps to one production role,
 *  so ＋ fires the add request directly (no role submenu). The composer
 *  resolves the actual asset (library picker) — this tile only emits intent. */
function AddReferenceTile({
  dept,
  onAddReference,
}: {
  dept: (typeof DEPARTMENTS)[number]
  onAddReference(request: AddReferenceRequest): void
}) {
  const tc = useTranslations('StudioNode.videoComposer')

  return (
    <button
      type="button"
      aria-label={tc('references.add', { dept: tc(`departments.${dept.id}`) })}
      onClick={() =>
        onAddReference({
          nodeType: dept.nodeType,
          role: dept.role,
          mediaType: dept.mediaType,
        })
      }
      className="nodrag flex size-10 shrink-0 items-center justify-center rounded-md border border-dashed border-node-panel-inner text-node-subtle transition-colors hover:border-node-edge hover:text-node-foreground"
    >
      <Plus className="size-4" />
    </button>
  )
}

/** 参考槽（§4 C3）: the untouched ReferenceTokenChip plus strip-only overlays —
 *  a payload-order corner badge (图N/音N) and a hover-revealed × that deletes
 *  the edge. Overlays are siblings, not chip changes, so the chip's hover
 *  preview / insert / drift behavior stays byte-identical elsewhere. */
function DepartmentSlot({
  token,
  driftFrom,
  onInsert,
  onReplaceDrift,
  onLocate,
  onRemove,
  onAddVoice,
}: {
  token: ComposerReferenceToken
  driftFrom?: string
  onInsert(data: ReferenceTokenData, originEl: HTMLElement): void
  onReplaceDrift(
    token: ComposerReferenceToken,
    oldName: string,
    newName: string,
  ): void
  onLocate?(nodeId: string): void
  onRemove?(token: ComposerReferenceToken): void
  onAddVoice?(characterNodeId: string): void
}) {
  const tc = useTranslations('StudioNode.videoComposer')

  const badge =
    token.imageSlotIndex !== undefined
      ? tc('references.slotBadgeImage', { n: token.imageSlotIndex + 1 })
      : token.audioSlotIndex !== undefined
        ? tc('references.slotBadgeAudio', { n: token.audioSlotIndex + 1 })
        : token.videoSlotIndex !== undefined
          ? tc('references.slotBadgeVideo', { n: token.videoSlotIndex + 1 })
          : null

  return (
    <span className="group/slot relative inline-flex">
      <ReferenceTokenChip
        data={token}
        driftFrom={driftFrom}
        onInsert={onInsert}
        onReplaceDrift={(oldName, newName) =>
          onReplaceDrift(token, oldName, newName)
        }
        onLocate={onLocate}
      />
      {badge ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-1 -left-1 rounded bg-node-canvas/85 px-1 font-mono text-3xs leading-4 text-node-muted"
        >
          {badge}
        </span>
      ) : null}
      {onRemove && token.edgeId ? (
        <button
          type="button"
          aria-label={tc('references.remove', {
            name: token.label || token.token || tc(`refKind.${token.kind}`),
          })}
          onClick={() => onRemove(token)}
          className={cn(
            'absolute -right-1.5 -top-1.5 z-10 flex size-5 items-center justify-center rounded-full border border-node-panel-inner bg-node-panel text-node-muted transition-opacity',
            'opacity-0 hover:text-node-foreground focus-visible:opacity-100 group-hover/slot:opacity-100',
          )}
        >
          <X className="size-3" />
        </button>
      ) : null}
      {token.kind === 'character' ? (
        <CharacterVoiceBadge token={token} onAddVoice={onAddVoice} />
      ) : null}
    </span>
  )
}

/** cast-redesign 音色徽标 — bottom-right of a character slot. Has voice → mic /
 *  cover badge (dimmed when the voice has no reference audio, 不静默丢); no
 *  voice → a hover-revealed ＋配音 that autospawns voice→character. */
function CharacterVoiceBadge({
  token,
  onAddVoice,
}: {
  token: ComposerReferenceToken
  onAddVoice?(characterNodeId: string): void
}) {
  const tc = useTranslations('StudioNode.videoComposer')
  const voice = token.boundVoice

  if (voice) {
    return (
      <span
        title={
          voice.ready
            ? tc('references.voiceBadge', {
                name: voice.label || tc('refKind.voice'),
              })
            : tc('references.voiceNotReadyHint')
        }
        className={cn(
          'pointer-events-none absolute -bottom-1 -right-1 flex size-4 items-center justify-center overflow-hidden rounded-full border border-node-panel bg-node-panel-inner ring-1 ring-node-port-voice/40',
          !voice.ready && 'opacity-40',
        )}
      >
        {voice.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={voice.coverImage}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <Mic2 className="size-2.5 text-node-port-voice" />
        )}
      </span>
    )
  }

  if (!onAddVoice) return null

  return (
    <button
      type="button"
      aria-label={tc('references.addVoice', {
        name: token.label || tc('refKind.character'),
      })}
      onClick={() => onAddVoice(token.id)}
      className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border border-dashed border-node-panel-inner bg-node-panel text-node-subtle opacity-0 transition-opacity hover:text-node-foreground focus-visible:opacity-100 group-hover/slot:opacity-100"
    >
      <Mic2 className="size-2.5" />
    </button>
  )
}
