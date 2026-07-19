'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEdges, useNodes, type NodeProps } from '@xyflow/react'
import { AudioWaveform, Music2, Pause, Play } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS } from '@/constants/node-studio'
import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import {
  getNodePrimaryMediaUrl,
  getSeedanceReferenceKind,
} from '@/lib/node-workflow-graph'
import { cn } from '@/lib/utils'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { NodeShell } from './NodeShell'
import { NodeStatusBadge } from './NodeStatusBadge'

// R3-5 素材长条（canvas-relationship-v3 §3.0/§7）: a decorative static
// waveform, not a real audio analysis — mirrors `AudioPlayer`'s own
// `FALLBACK_WAVEFORM_PEAKS` precedent (peak art lives beside its one
// consumer, not in src/constants). During playback the bars up to
// `currentTime / duration` switch to the paint fill (落点② 进行中).
const VOICE_STRIP_WAVEFORM_PEAKS = [
  0.45, 0.7, 0.5, 0.85, 0.6, 0.4, 0.75, 0.55,
] as const

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const totalSeconds = Math.floor(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const remainder = totalSeconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

export const VoiceNode = memo(function VoiceNode(
  props: NodeProps<NodeWorkflowNode>,
) {
  const { id, data, selected } = props
  const t = useTranslations('StudioNode.voiceProfile')
  const tPlayer = useTranslations('AudioPlayer')
  // Track the failed cover URL (not a boolean) so picking a new voice with a
  // valid cover recovers instead of staying stuck on the icon fallback.
  const [erroredCover, setErroredCover] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const hasVoiceProfile = Boolean(
    data.voiceName ||
    data.voiceId ||
    data.voiceReferenceAudioUrl ||
    data.voiceStyle ||
    data.voiceEmotion,
  )
  const status = hasVoiceProfile ? NODE_STATUS_IDS.ready : data.status
  // Never fall back to the raw voiceId — it reads as gibberish. Prefer the
  // resolved voice name, then the provider label, then the empty placeholder.
  const voiceTitle = data.voiceName || data.voiceProvider || t('emptyTitle')
  const providerLabel = data.voiceProvider || t('providerFallback')
  // Cover follows the active source: my-voice keeps its own cover so it never
  // shows the system voice's image (and vice versa).
  const cover =
    data.voiceSource === NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio
      ? data.voiceReferenceCoverImage
      : data.voiceCoverImage
  const showCover = Boolean(cover) && erroredCover !== cover

  // 试听源选择: mirrors VoiceDetailBody's own `activeSource` default-init
  // ternary (`data.voiceSource === referenceAudio ? referenceAudio :
  // fishAudio`) — the persisted field decides which clip is "the" audition
  // clip instead of a second, disconnected notion of "playable". No new
  // audio channel: same `voiceSampleUrl` / `voiceReferenceAudioUrl` fields,
  // same plain <audio> element pattern used everywhere else in this domain.
  // 播放源解析（owner 真机 bug 修复 2026-07-19）: 先按 voiceSource 取对应 clip，
  // 但**只要有一个实际存在的音频 url 就兜底可播**——之前 source='manual'（既非
  // referenceAudio 也非 fishAudio）会落进取 voiceSampleUrl 的分支拿到 null 而禁用，
  // 哪怕 voiceReferenceAudioUrl 明明有有效音频（node-518 就是这情况）。现在两个
  // url 谁有取谁（referenceAudio 优先，它是真正上传/生成的 clip），彻底消除"有音频
  // 却不能播"。
  const isFishAudioSource =
    data.voiceSource !== NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio
  const playableAudioUrl =
    (isFishAudioSource ? data.voiceSampleUrl : data.voiceReferenceAudioUrl) ||
    data.voiceReferenceAudioUrl ||
    data.voiceSampleUrl ||
    null

  // 角色绑定反向查找: a voice node never receives inbound edges (leaf
  // source, see node-connection-rules.ts), but it can feed a character node
  // (`voice → character`, the听觉身份 hop). Walk this node's own outgoing
  // edges for a character target and borrow its V-2 主图 (getNodePrimaryMediaUrl)
  // as the strip's face-crop avatar.
  const allNodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const boundCharacterFaceUrl = useMemo(() => {
    for (const edge of edges) {
      if (edge.source !== id) continue
      const target = allNodes.find((node) => node.id === edge.target)
      if (!target || getSeedanceReferenceKind(target) !== 'character') {
        continue
      }
      const url = getNodePrimaryMediaUrl(target.data)
      if (url) return url
    }
    return undefined
  }, [edges, allNodes, id])

  // A new pick (or a re-bound character) invalidates whatever the <audio>
  // element was mid-way through reporting — syncing to an external signal
  // (the <audio> element's own src just changed, resetting ITS playback
  // state outside React), not derivable from this component's render inputs.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setIsPlaying(false)
    setProgress(0)
    setDurationSeconds(null)
  }, [playableAudioUrl])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      void audio.play().catch(() => setIsPlaying(false))
    } else {
      audio.pause()
    }
  }, [])

  const metaLine = [
    providerLabel,
    data.voiceStyle?.trim() || undefined,
    durationSeconds ? formatDuration(durationSeconds) : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')

  return (
    <NodeShell
      nodeId={id}
      type={NODE_TYPE_IDS.voice}
      selected={selected}
      status={status}
      showTargetHandle={false}
      toolbarData={data}
    >
      <div className="relative flex items-center gap-3 px-3 py-3">
        {/* 盖章: NodeShell.Header normally hosts this, but the strip anatomy
            has no room for a full header row — float it as a corner cluster
            instead. FB-2 removed the redundant ⤢ (toolbar's own ⤢ covers
            expand for every node type). */}
        <div className="absolute -right-1 -top-3 z-canvas-selection flex items-center gap-1">
          <NodeStatusBadge status={status} />
        </div>

        <div className="relative size-12 shrink-0">
          {boundCharacterFaceUrl ? (
            <>
              <div className="size-12 overflow-hidden rounded-full border border-node-panel-inner">
                {/* Character covers come from arbitrary hosts (uploads/assets); raw img with no fallback needed — the outer avatar circle is the fallback surface. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={boundCharacterFaceUrl}
                  alt=""
                  className="size-full object-cover"
                />
              </div>
              <span
                aria-hidden
                className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border border-node-card-line bg-node-panel text-node-port-voice-on-paper"
              >
                <Music2 className="size-2.5" />
              </span>
            </>
          ) : showCover && cover ? (
            <div className="size-12 overflow-hidden rounded-full border border-node-panel-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover}
                alt=""
                className="size-full object-cover"
                onError={() => setErroredCover(cover ?? null)}
              />
            </div>
          ) : (
            <div className="node-card-window flex size-12 items-center justify-center rounded-full bg-node-card-window text-node-foreground">
              <AudioWaveform className="size-5" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-semibold text-node-foreground"
            title={voiceTitle}
          >
            {voiceTitle}
          </p>
          <p className="mt-0.5 truncate text-2xs text-node-muted">
            {metaLine || t('providerFallback')}
          </p>
        </div>

        {/* 播放挂件: FB-A（canvas-relationship-v3 真机反馈）统一恒定解剖——
            两张音色卡此前一张有样本时整块播放挂件出现、另一张没有时整块消
            失，卡片忽长忽短忽有忽无。挂件现在永远渲染，无样本时降级为禁用
            态（disabled + aria-disabled + opacity-50 pointer-events-none +
            静态灰波形，不可点），保证所有音色卡同一形状同一高度；有样本时
            播放逻辑/通道不变，仍是 VoiceDetailBody 同款 <audio> 元素模式。 */}
        {/* FB-5 ①: pill scaled up for touch comfort — play/pause size-9→
            size-11 (36→44px), waveform h-6→h-8 with wider w-1 bars, padding
            grown to match so the pill doesn't read cramped around the bigger
            controls. */}
        <div className="node-card-window flex shrink-0 items-center gap-3 rounded-full bg-node-card-window py-2 pl-2 pr-4">
          {playableAudioUrl ? (
            <audio
              ref={audioRef}
              src={playableAudioUrl}
              preload="metadata"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false)
                setProgress(0)
              }}
              onLoadedMetadata={(event) => {
                const el = event.currentTarget
                setDurationSeconds(
                  Number.isFinite(el.duration) ? el.duration : null,
                )
              }}
              onTimeUpdate={(event) => {
                const el = event.currentTarget
                setProgress(el.duration ? el.currentTime / el.duration : 0)
              }}
            />
          ) : null}
          <button
            type="button"
            onClick={playableAudioUrl ? togglePlay : undefined}
            disabled={!playableAudioUrl}
            aria-disabled={!playableAudioUrl}
            aria-label={
              playableAudioUrl
                ? isPlaying
                  ? tPlayer('pause')
                  : tPlayer('play')
                : t('noSample')
            }
            title={
              playableAudioUrl
                ? isPlaying
                  ? tPlayer('pause')
                  : tPlayer('play')
                : t('noSample')
            }
            className={cn(
              'nodrag flex size-11 shrink-0 items-center justify-center rounded-full bg-node-panel-inner text-node-foreground transition-transform',
              playableAudioUrl
                ? 'hover:scale-105'
                : 'pointer-events-none cursor-not-allowed opacity-50',
            )}
          >
            {isPlaying ? (
              <Pause className="size-5" />
            ) : (
              <Play className="ml-0.5 size-5" />
            )}
          </button>
          <div className="flex h-8 shrink-0 items-end gap-1" aria-hidden>
            {VOICE_STRIP_WAVEFORM_PEAKS.map((peak, index) => {
              const barProgress =
                (index + 1) / VOICE_STRIP_WAVEFORM_PEAKS.length
              const filled =
                Boolean(playableAudioUrl) && barProgress <= progress
              return (
                <span
                  key={index}
                  className={cn(
                    'w-1 rounded-full transition-colors',
                    filled ? 'bg-node-paint' : 'bg-node-subtle/50',
                  )}
                  style={{ height: `${Math.round(peak * 100)}%` }}
                />
              )
            })}
          </div>
        </div>
      </div>
    </NodeShell>
  )
})
