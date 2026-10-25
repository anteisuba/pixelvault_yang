'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  VOICE_ROOM_LINE_STAGGER_MS,
  VOICE_ROOM_MODE,
  VOICE_ROOM_SPEAKER_KIND,
  VOICE_ROOM_VOICE_CAST_MAX,
  type VoiceRoomMode,
} from '@/constants/voiceroom'
import { cancelGenerationsAPI } from '@/lib/api-client'
import {
  assistantKeySetupOptionId,
  type AssistantKeySetupTarget,
} from '@/lib/assistant-key-setup'
import { voiceSpeakerLook } from '@/lib/voice-avatar'
import type { AssistantRouteModel } from '@/constants/assistant-persona'
import type { AudioEmotion } from '@/constants/voice-cards'
import type {
  VoiceRoomCastMember,
  VoiceRoomDeliveryState,
  VoiceRoomDetail,
  VoiceRoomRecord,
} from '@/types/voiceroom'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { VoicePickerDialog } from '@/components/business/voices/VoicePickerDialog'
import { useCharacterLibrary } from '@/hooks/cards/use-character-library'
import { useIsMobile } from '@/hooks/use-mobile'

import { VoiceLineBubble } from './VoiceLineBubble'
import { VoiceLinePending } from './VoiceLinePending'
import { VoiceRoomCasting } from './VoiceRoomCasting'
import { VoiceRoomComposer } from './VoiceRoomComposer'
import { VoiceRoomHistoryMenu } from './VoiceRoomHistoryMenu'
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
  /** 聊天：你刚发出、还没落库的那句。 */
  pendingUserText: string | null
  /** 聊天：她正在写的回复。 */
  streamingReply: { speakerId: string; text: string } | null
  mode: VoiceRoomMode
  onModeChange: (mode: VoiceRoomMode) => void
  llmModel: AssistantRouteModel
  onLlmModelChange: (model: AssistantRouteModel) => void
  /** 聊天时助手那一家缺 key：就地配。 */
  keySetup: AssistantKeySetupTarget | null
  onDismissKeySetup: () => void
  error: string | null
  delivery: VoiceRoomDeliveryState
  onDeliveryChange: (patch: Partial<VoiceRoomDeliveryState>) => void
  /** 全部房间：标题 ▾ 从里面挑和这一组人的几段。 */
  rooms: readonly VoiceRoomRecord[]
  onOpenRoom: (roomId: string) => void
  onRenameRoom: (roomId: string, name: string | null) => Promise<void>
  onDeleteRoom: (roomId: string) => Promise<void>
  /** 照这一组人新开一段。 */
  onNewTopic: () => void
  onCastChange: (cast: VoiceRoomCastMember[]) => void
  onSay: (speakerId: string, text: string) => Promise<boolean>
  onChat: (speakerId: string, text: string) => Promise<boolean>
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
  pendingUserText,
  streamingReply,
  mode,
  onModeChange,
  llmModel,
  onLlmModelChange,
  keySetup,
  onDismissKeySetup,
  error,
  delivery,
  onDeliveryChange,
  rooms,
  onOpenRoom,
  onRenameRoom,
  onDeleteRoom,
  onNewTopic,
  onCastChange,
  onSay,
  onChat,
  onRetake,
  onDismissError,
}: VoiceRoomStageProps) {
  const t = useTranslations('VoiceRoom')
  const { cards: characters } = useCharacterLibrary()

  /**
   * 头像和名字跟着绑定的角色走（owner 10-23，规则见 `voiceSpeakerLook`）：班底里的人声当场按
   * 角色库换上去。台词上存的是说话时的快照——那位还在班底里就用当下的样子，不在了才退回快照
   * （聊天记录不该因为班底变动而失忆）。
   */
  const cast = useMemo(
    () =>
      detail.cast.map((member) => {
        if (member.kind !== VOICE_ROOM_SPEAKER_KIND.VOICE) return member
        const look = voiceSpeakerLook(
          {
            id: member.id,
            name: member.name,
            coverImage: member.coverImage ?? null,
          },
          characters,
        )
        return { ...member, name: look.name, coverImage: look.cover }
      }),
    [detail.cast, characters],
  )
  const lines = useMemo(() => {
    const byId = new Map(cast.map((member) => [member.id, member]))
    return detail.lines.map((line) => {
      const member = byId.get(line.speakerId)
      return member && line.speakerKind === VOICE_ROOM_SPEAKER_KIND.VOICE
        ? {
            ...line,
            speakerName: member.name,
            speakerCover: member.coverImage ?? null,
          }
        : line
    })
  }, [cast, detail.lines])
  const [castingOpen, setCastingOpen] = useState(false)
  const isMobile = useIsMobile()
  const tPicker = useTranslations('VoicesPage.picker')
  const castIds = useMemo(
    () => new Set(detail.cast.map((member) => member.id)),
    [detail.cast],
  )
  const castFull =
    detail.cast.filter(
      (member) => member.kind === VOICE_ROOM_SPEAKER_KIND.VOICE,
    ).length >= VOICE_ROOM_VOICE_CAST_MAX
  const [vaultOpen, setVaultOpen] = useState(false)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const flowRef = useRef<HTMLDivElement | null>(null)
  /**
   * 正在取消的台词 id——独立状态，理由同 `retakingIds`（见宿主 hook）：不能
   * 借 `detail.lines` 里的字段乐观标记，2s 一轮的房间轮询会用服务端当时还没
   * 翻过去的 status 把乐观态盖回去。按钮据此禁用，避免连点发出两次取消请求。
   */
  const [cancellingIds, setCancellingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  /**
   * 取消一条还在 QUEUED / RUNNING 的台词——直接调统一取消端点
   * `cancelGenerationsAPI`（image/video/audio/3D 共用，见
   * `src/lib/api-client/generation.ts`），不经 `useVoiceRoom`：这条 hook 目前
   * 唯一的推进方式是 2s 一轮轮询整个房间（见其顶部注释），取消之后同一轮
   * 轮询会把 `audio.status` 更新成 `CANCELLED`——`VoiceLineBubble` 的
   * `isPendingStatus` 本来就不认 CANCELLED，讲话丸自己静默收掉，不当失败。
   */
  const handleCancelAudio = async (line: VoiceRoomDetail['lines'][number]) => {
    const jobId = line.audio?.jobId
    if (!jobId || cancellingIds.has(line.id)) return
    setCancellingIds((current) => new Set(current).add(line.id))
    const result = await cancelGenerationsAPI([jobId])
    setCancellingIds((current) => {
      const next = new Set(current)
      next.delete(line.id)
      return next
    })
    if (!result.success) toast.error(result.error ?? t('cancel'))
  }

  /**
   * 谁在开口 = **派生值**，不是要跟班底同步的一份 state。
   *
   * 「用户点过谁」才是 state；被点的那位还在不在班底、班底空不空，都是当场就能
   * 从 `detail.cast` 算出来的。原先用 effect 去校准，除了触发一轮级联渲染
   * （`react-hooks/set-state-in-effect`），还多留了一个会和班底对不上的中间态。
   */
  const selectedId =
    pickedId && cast.some((member) => member.id === pickedId)
      ? pickedId
      : (cast[0]?.id ?? null)

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

  // 新台词落下来、她的回复长一截时滚到底——聊天流的默认期待。
  useEffect(() => {
    const node = flowRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [detail.lines.length, pendingUserText, streamingReply?.text])

  const castEmpty = cast.length === 0
  const vaultCount = lines.filter(
    (line) => line.audio?.status === 'COMPLETED',
  ).length

  return (
    <div className="vr-stage workbench-card">
      <div className="vr-bar">
        <VoiceRoomHistoryMenu
          detail={detail}
          rooms={rooms}
          switching={switching}
          onOpen={onOpenRoom}
          onRename={onRenameRoom}
          onDelete={onDeleteRoom}
          onNew={onNewTopic}
        />

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

      <VoiceRoomVault lines={lines} open={vaultOpen} />

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
          {lines.map((line, index) => (
            <VoiceLineBubble
              key={line.id}
              line={line}
              staggerMs={
                index < staggerUntil ? index * VOICE_ROOM_LINE_STAGGER_MS : 0
              }
              retaking={retakingIds.has(line.id)}
              cancelling={cancellingIds.has(line.id)}
              onRetake={onRetake}
              onCancel={() => void handleCancelAudio(line)}
            />
          ))}

          {/*
           * 占位气泡：话已经发出去了，声音还在路上。它长得和真气泡一样，只是
           * 语音条的位置摆着「正在开口」——真气泡回来时它整个消失，一次干净的交接。
           */}
          {pendingLine ? (
            <VoiceLinePending
              cast={cast}
              speakerId={pendingLine.speakerId}
              text={pendingLine.text}
            />
          ) : null}

          {pendingUserText ? (
            <div className="vr-msg" data-self>
              <div className="vr-msg-body">
                <span className="vr-bubble">{pendingUserText}</span>
              </div>
            </div>
          ) : null}

          {streamingReply ? (
            <VoiceLinePending
              cast={cast}
              speakerId={streamingReply.speakerId}
              text={streamingReply.text}
              typing
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
          cast={cast}
          selectedId={selectedId}
          sending={sending}
          delivery={delivery}
          onDeliveryChange={onDeliveryChange}
          mode={mode}
          onModeChange={onModeChange}
          llmModel={llmModel}
          onLlmModelChange={onLlmModelChange}
          onSelect={setPickedId}
          // ⚠ 写回去的是班底**快照**（`detail.cast`），⛔ 不是换上角色名头像的那份 `cast`。
          onRemove={(speakerId) =>
            onCastChange(
              detail.cast.filter((member) => member.id !== speakerId),
            )
          }
          onOpenCasting={() => setCastingOpen(true)}
          onSubmit={(text) => {
            const speaker = cast.find((member) => member.id === selectedId)
            if (!speaker) return Promise.resolve(false)
            // 音效师不会回话：聊天模式下选中它也按念台词走。
            return mode === VOICE_ROOM_MODE.CHAT &&
              speaker.kind === VOICE_ROOM_SPEAKER_KIND.VOICE
              ? onChat(speaker.id, text)
              : onSay(speaker.id, text)
          }}
        />
      )}

      {/* 聊天写词用的是助手那一家：缺 key 就地配，配好不顺手改出声的模型。 */}
      {keySetup ? (
        <QuickSetupDialog
          open
          onOpenChange={(next) => {
            if (!next) onDismissKeySetup()
          }}
          modelId={keySetup.modelId}
          modelLabel={keySetup.modelLabel}
          adapterType={keySetup.adapterType}
          optionId={assistantKeySetupOptionId(keySetup.modelId)}
          selectStudioModel={false}
        />
      ) : null}

      {/* 桌面 = 挑音色框（ui-spec ㉔，样件 S26），点一副就请进来；手机照旧推上来的选角面板。 */}
      {!isMobile ? (
        <VoicePickerDialog
          open={castingOpen}
          onOpenChange={setCastingOpen}
          takenIds={castIds}
          fullLabel={
            castFull
              ? tPicker('full', { max: VOICE_ROOM_VOICE_CAST_MAX })
              : null
          }
          onPick={(card) =>
            onCastChange([
              ...detail.cast,
              {
                id: card.id,
                kind: VOICE_ROOM_SPEAKER_KIND.VOICE,
                name: card.name,
                coverImage: card.coverImage,
              },
            ])
          }
        />
      ) : castingOpen ? (
        <VoiceRoomCasting
          cast={detail.cast}
          onClose={() => setCastingOpen(false)}
          onCastChange={onCastChange}
        />
      ) : null}
    </div>
  )
}
