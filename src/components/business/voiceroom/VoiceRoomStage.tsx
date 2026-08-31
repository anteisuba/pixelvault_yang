'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  VOICE_ROOM_LINE_STAGGER_MS,
  VOICE_ROOM_NAME_MAX_LENGTH,
} from '@/constants/voiceroom'
import type { AudioEmotion } from '@/constants/voice-cards'
import type {
  VoiceRoomCastMember,
  VoiceRoomDeliveryState,
  VoiceRoomDetail,
} from '@/types/voiceroom'

import { VoiceLineBubble } from './VoiceLineBubble'
import { VoiceLinePending } from './VoiceLinePending'
import { VoiceRoomCasting } from './VoiceRoomCasting'
import { VoiceRoomComposer } from './VoiceRoomComposer'
import { VoiceRoomModelChip } from './VoiceRoomModelChip'
import { VoiceRoomVault } from './VoiceRoomVault'

/** 房间本体：顶栏 · 聊天流（或空态）· 输入行。 */

interface VoiceRoomStageProps {
  detail: VoiceRoomDetail
  sending: boolean
  /** 正在换房间：聊天流据此整体退场。 */
  switching: boolean
  /** 正在重录的台词 id。 */
  retakingIds: ReadonlySet<string>
  /** 刚发出、还没拿到回执的那句话。 */
  pendingLine: { speakerId: string; text: string } | null
  error: string | null
  delivery: VoiceRoomDeliveryState
  onDeliveryChange: (patch: Partial<VoiceRoomDeliveryState>) => void
  onRename: (name: string | null) => void
  onCastChange: (cast: VoiceRoomCastMember[]) => void
  onSay: (speakerId: string, text: string) => Promise<boolean>
  onRetake: (
    lineId: string,
    patch: { emotion?: AudioEmotion | null },
  ) => Promise<void>
  onDismissError: () => void
}

export function VoiceRoomStage({
  detail,
  sending,
  switching,
  retakingIds,
  pendingLine,
  error,
  delivery,
  onDeliveryChange,
  onRename,
  onCastChange,
  onSay,
  onRetake,
  onDismissError,
}: VoiceRoomStageProps) {
  const t = useTranslations('VoiceRoom')
  const [castingOpen, setCastingOpen] = useState(false)
  const [vaultOpen, setVaultOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const flowRef = useRef<HTMLDivElement | null>(null)

  /**
   * 谁在开口 = **派生值**，不是要跟班底同步的一份 state。
   *
   * 「用户点过谁」才是 state；被点的那位还在不在班底、班底空不空，都是当场就能
   * 从 `detail.cast` 算出来的。原先用 effect 去校准，除了触发一轮级联渲染
   * （`react-hooks/set-state-in-effect`），还多留了一个会和班底对不上的中间态。
   */
  const selectedId =
    pickedId && detail.cast.some((member) => member.id === pickedId)
      ? pickedId
      : (detail.cast[0]?.id ?? null)

  /**
   * 换房间后**首屏**有几条——只有这些参与 40ms/条的接力入场。
   *
   * 之后新落的单条 index 早就超过它，延迟是 0，立刻出现。少了这道闸，房间里躺着
   * 30 条历史台词时，新说的那句要排队等 1.2 秒才肯露面。
   *
   * ⚠ 依赖只写 `detail.id` 是**故意的**：要的就是「换房间那一刻的条数」，把
   * `detail.lines.length` 加进去等于每落一条就重算一次，接力闸门直接失效。
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 见上：漏掉 lines.length 是这段逻辑的全部意义
  const staggerUntil = useMemo(() => detail.lines.length, [detail.id])

  // 新台词落下来时滚到底——聊天流的默认期待。
  useEffect(() => {
    const node = flowRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [detail.lines.length])

  const castEmpty = detail.cast.length === 0
  const vaultCount = detail.lines.filter(
    (line) => line.audio?.status === 'COMPLETED',
  ).length

  return (
    <div className="vr-stage">
      <div className="vr-bar">
        {renaming ? (
          <input
            className="vr-bar-title-input"
            autoFocus
            defaultValue={detail.name ?? ''}
            maxLength={VOICE_ROOM_NAME_MAX_LENGTH}
            aria-label={t('roomNameLabel')}
            onBlur={(event) => {
              setRenaming(false)
              onRename(event.target.value.trim() || null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') setRenaming(false)
            }}
          />
        ) : (
          <button
            type="button"
            className="vr-bar-title"
            data-unnamed={!detail.name}
            data-swapping={switching}
            onClick={() => setRenaming(true)}
            title={t('renameRoom')}
          >
            {detail.name ?? t('untitledRoom')}
          </button>
        )}

        <span className="vr-bar-meta">{t('roomMeta')}</span>

        {/*
         * 模型入口。目录里语音档长期只有一个可用型号，所以它真正的价值是
         * **缺 API key 时那条能走通的路**（Hard Rule 8）——在此之前配音间里
         * 没有任何地方能配 key。
         */}
        <VoiceRoomModelChip
          value={delivery.modelId}
          onChange={(_optionId, modelId) => onDeliveryChange({ modelId })}
        />

        {/*
         * 生成完自动入库。抽屉就地展开而不是跳走——「存下来了吗」这个疑问值不上
         * 一次离开房间；要管理素材本身，左侧导航一直有素材库。
         */}
        <button
          type="button"
          className="vr-chip"
          data-active={vaultOpen}
          aria-expanded={vaultOpen}
          onClick={() => setVaultOpen((open) => !open)}
        >
          {t('assetsLibrary')} · {vaultCount}
        </button>
      </div>

      <VoiceRoomVault lines={detail.lines} open={vaultOpen} />

      {castEmpty ? (
        <div className="vr-empty">
          <span className="vr-empty-eyebrow">{t('emptyEyebrow')}</span>
          <h2 className="vr-empty-title">{t('emptyTitle')}</h2>
          <p className="vr-empty-sub">{t('emptySub')}</p>
          <button
            type="button"
            className="vr-cta"
            onClick={() => setCastingOpen(true)}
          >
            {t('castFromLibrary')}
          </button>
        </div>
      ) : (
        <div className="vr-flow" ref={flowRef} data-leaving={switching}>
          {detail.lines.map((line, index) => (
            <VoiceLineBubble
              key={line.id}
              line={line}
              staggerMs={
                index < staggerUntil ? index * VOICE_ROOM_LINE_STAGGER_MS : 0
              }
              retaking={retakingIds.has(line.id)}
              onRetake={onRetake}
            />
          ))}

          {/*
           * 占位气泡：话已经发出去了，声音还在路上。它长得和真气泡一样，只是
           * 语音条的位置摆着「正在开口」——真气泡回来时它整个消失，一次干净的交接。
           */}
          {pendingLine ? (
            <VoiceLinePending
              cast={detail.cast}
              speakerId={pendingLine.speakerId}
              text={pendingLine.text}
            />
          ) : null}
        </div>
      )}

      {error ? (
        <div className="vr-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={onDismissError}>
            {t('dismiss')}
          </button>
        </div>
      ) : null}

      {castEmpty ? null : (
        <VoiceRoomComposer
          cast={detail.cast}
          selectedId={selectedId}
          sending={sending}
          delivery={delivery}
          onDeliveryChange={onDeliveryChange}
          onSelect={setPickedId}
          onOpenCasting={() => setCastingOpen(true)}
          onSubmit={(text) =>
            selectedId ? onSay(selectedId, text) : Promise.resolve(false)
          }
        />
      )}

      {castingOpen ? (
        <VoiceRoomCasting
          cast={detail.cast}
          onClose={() => setCastingOpen(false)}
          onCastChange={onCastChange}
        />
      ) : null}
    </div>
  )
}
