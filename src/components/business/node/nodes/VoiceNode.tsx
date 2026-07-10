'use client'

import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { IdCard, Mic2, Music2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS } from '@/constants/node-studio'
import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeShell } from './NodeShell'
import { NodeExpandButton } from './NodeCardControls'

export function VoiceNode(props: NodeProps<NodeWorkflowNode>) {
  const { id, data, selected } = props
  const t = useTranslations('StudioNode.voiceProfile')
  // Track the failed cover URL (not a boolean) so picking a new voice with a
  // valid cover recovers instead of staying stuck on the icon fallback.
  const [erroredCover, setErroredCover] = useState<string | null>(null)
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

  return (
    <NodeShell
      nodeId={id}
      type={NODE_TYPE_IDS.voice}
      selected={selected}
      status={status}
      showTargetHandle={false}
    >
      <NodeShell.Header
        type={NODE_TYPE_IDS.voice}
        status={status}
        title={data.voiceName?.trim() || undefined}
        action={<NodeExpandButton nodeId={id} />}
      />
      <NodeShell.Body className="space-y-3">
        {/* Full-width cover preview — matches character/image nodes (整宽 hero),
            so a real voice cover reads as a first-class preview instead of a
            tiny avatar. The voice name lives in the header; when there is no
            cover we fall back to a larger icon + name + description. */}
        {/* node-card-window: this cover carries a caption badge
            (text-node-foreground on a fixed bg-node-canvas/75 scrim) that needs
            the deep-window's light-on-dark foreground override — on the plain
            paper scope, text-node-foreground resolves to dark ink and the
            caption disappears against its own dark scrim (see S2 report). */}
        <div className="node-card-window relative aspect-square overflow-hidden rounded-2xl border border-node-panel-inner bg-node-card-window">
          {showCover && cover ? (
            <>
              {/* Third-party cover images come from arbitrary hosts; keep a raw img with icon fallback. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover}
                alt=""
                className="size-full object-cover"
                onError={() => setErroredCover(cover ?? null)}
              />
              <span className="absolute left-2 top-2 rounded-full border border-node-panel-inner bg-node-canvas/75 px-2 py-1 text-2xs font-semibold text-node-foreground backdrop-blur">
                {providerLabel}
              </span>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-node-port-voice/15 text-node-port-voice">
                <Mic2 className="size-7" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-node-foreground">
                  {voiceTitle}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-node-muted">
                  {hasVoiceProfile
                    ? t('readyDescription')
                    : t('emptyDescription')}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-xl border border-node-panel-inner bg-node-panel-soft p-3">
            <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
              {t('providerLabel')}
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-node-foreground">
              {providerLabel}
            </p>
          </div>
          <div className="min-w-0 rounded-xl border border-node-panel-inner bg-node-panel-soft p-3">
            <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
              {t('referenceLabel')}
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-node-foreground">
              {data.voiceReferenceAudioName || t('referenceEmpty')}
            </p>
          </div>
        </div>

        {data.voiceStyle || data.voiceEmotion ? (
          <div className="space-y-1 rounded-xl border border-node-panel-inner bg-node-panel-soft p-3 text-xs leading-5 text-node-muted">
            {data.voiceStyle ? (
              <p className="line-clamp-2">{data.voiceStyle}</p>
            ) : null}
            {data.voiceEmotion ? (
              <p className="line-clamp-2">{data.voiceEmotion}</p>
            ) : null}
          </div>
        ) : null}
      </NodeShell.Body>
      <NodeShell.Footer>
        <p className="truncate text-2xs font-medium text-node-subtle">
          {hasVoiceProfile ? t('footerReady') : t('footerEmpty')}
        </p>
        <span className="flex size-8 items-center justify-center rounded-xl bg-node-panel-inner text-node-port-voice">
          {data.voiceId ? (
            <IdCard className="size-4" />
          ) : (
            <Music2 className="size-4" />
          )}
        </span>
      </NodeShell.Footer>
    </NodeShell>
  )
}
