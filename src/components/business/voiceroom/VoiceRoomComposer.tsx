'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'

import { Plus, UserMinus, X } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { StudioOperatorModelChip } from '@/components/business/studio/assistant-operator/StudioOperatorModelChip'
import { useModelChannelGate } from '@/hooks/use-model-channel-gate'
import {
  imageOfGeneration,
  useVoiceRoomImages,
} from '@/hooks/use-voiceroom-images'
import type { AssistantRouteModel } from '@/constants/assistant-persona'
import { USER_IMAGE_UPLOAD_ACCEPTED_MIME_TYPES } from '@/constants/uploads'

import {
  VOICE_LINE_TEXT_MAX_LENGTH,
  VOICE_ROOM_CHAT_IMAGES_MAX,
  VOICE_ROOM_MODE,
  VOICE_ROOM_MODES,
  VOICE_ROOM_SPEAKER_KIND,
  type VoiceRoomMode,
} from '@/constants/voiceroom'
import type {
  VoiceLineImage,
  VoiceRoomCastMember,
  VoiceRoomDeliveryState,
} from '@/types/voiceroom'

import { VoiceAvatar } from './VoiceAvatar'
import { VoiceRoomDelivery } from './VoiceRoomDelivery'

/**
 * 输入行 —— 这一页的核心动作：**选中谁**。聊天时就是跟谁聊，念台词时打的字就是谁的台词
 * （owner 10-23 方案 A：两种都留，旁边一个小分段切换）。
 *
 * 没有说话人下拉，头像本身就是选择器：一眼看得出班底有谁、现在轮到谁。
 * 音效师不会回话：选中它时聊天也按念台词走（打的字就是要的声音）。
 *
 * 再点一下已经选中的头像 → 小菜单「移出房间」（owner 10-23：请进来的人得能请出去）。
 * 头像多了这一行左右滑，⛔ 不挤输入框；手机上头像单独一行（`voiceroom.css`）。
 * 请人进来在顶栏「＋ 加人」（用户 10-25：加人是管房间的，⛔ 不放输入行）。
 * 聊天时头像后面多一颗「写词模型」（助手那颗 chip，值是配音间自己记的那份）。
 * 聊天时输入框前一颗 ＋（用户 10-25 Q4）：只管放图——上传 / 从素材库挑，挂上的图在输入行上面一排，
 * 发出去就清空；念台词用不上图，⛔ 不给 ＋。
 */

interface VoiceRoomComposerProps {
  cast: VoiceRoomCastMember[]
  selectedId: string | null
  sending: boolean
  delivery: VoiceRoomDeliveryState
  onDeliveryChange: (patch: Partial<VoiceRoomDeliveryState>) => void
  mode: VoiceRoomMode
  onModeChange: (mode: VoiceRoomMode) => void
  llmModel: AssistantRouteModel
  onLlmModelChange: (model: AssistantRouteModel) => void
  onSelect: (speakerId: string) => void
  /** 把这位移出房间（班底里删掉；她说过的话留着）。 */
  onRemove: (speakerId: string) => void
  /** `images` 只在聊天时有（念台词不挂图）。 */
  onSubmit: (text: string, images: VoiceLineImage[]) => Promise<boolean>
}

export function VoiceRoomComposer({
  cast,
  selectedId,
  sending,
  delivery,
  onDeliveryChange,
  mode,
  onModeChange,
  llmModel,
  onLlmModelChange,
  onSelect,
  onRemove,
  onSubmit,
}: VoiceRoomComposerProps) {
  const t = useTranslations('VoiceRoom')
  const tPicker = useTranslations('ModelPicker')
  /**
   * 顶栏那颗模型 chip 与这颗生成键说的是同一件事：语音档的型号要是有多条渠道而
   * 用户还没点过，这一枪发不出去（D2 Q1：没有「自动」渠道）。⛔ 别在这里另判一遍
   * 「有没有 key」——那是渠道面板上那颗点的事。
   */
  const channelGate = useModelChannelGate('audio')
  const [text, setText] = useState('')
  const attach = useVoiceRoomImages()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const selected = cast.find((member) => member.id === selectedId) ?? null
  const chatting =
    mode === VOICE_ROOM_MODE.CHAT &&
    selected?.kind === VOICE_ROOM_SPEAKER_KIND.VOICE
  const canSend =
    Boolean(selected) &&
    text.trim().length > 0 &&
    !sending &&
    !attach.uploading &&
    !channelGate.blocked

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSend || !selected) return
    // 先清空再等结果：发出去的字留在框里，用户会以为没发出去。失败时错误条会说话。
    const pending = text.trim()
    const images = chatting ? attach.images : []
    setText('')
    const ok = await onSubmit(pending, images)
    if (!ok) setText(pending)
    else if (images.length) attach.clear()
  }

  return (
    <form className="vr-composer" onSubmit={handleSubmit}>
      {chatting && attach.images.length > 0 ? (
        <div className="vr-attached">
          {attach.images.map((image) => (
            <span key={image.id} className="vr-attached-item">
              {/* eslint-disable-next-line @next/next/no-img-element -- R2 直链缩略图 */}
              <img src={image.url} alt={image.label ?? ''} />
              <button
                type="button"
                aria-label={t('removeImage')}
                title={t('removeImage')}
                onClick={() => attach.remove(image.id)}
              >
                <X aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="vr-picks">
        {cast.map((member) => {
          const avatar = (
            <VoiceAvatar
              id={member.id}
              name={member.name}
              cover={member.coverImage}
              kind={member.kind}
              size="s"
            />
          )
          if (member.id !== selectedId) {
            return (
              <button
                key={member.id}
                type="button"
                className="vr-pick"
                data-selected={false}
                onClick={() => onSelect(member.id)}
                title={member.name}
                aria-label={member.name}
                aria-pressed={false}
              >
                {avatar}
              </button>
            )
          }
          return (
            <DropdownMenu key={member.id}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="vr-pick"
                  data-selected
                  title={member.name}
                  aria-label={member.name}
                  aria-pressed
                >
                  {avatar}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onRemove(member.id)}
                >
                  <UserMinus aria-hidden />
                  {t('removeFromRoom')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        })}
      </div>

      {chatting ? (
        <StudioOperatorModelChip value={llmModel} onChange={onLlmModelChange} />
      ) : null}

      <div className="vr-mode" role="group" aria-label={t('modeLabel')}>
        {VOICE_ROOM_MODES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => onModeChange(option)}
          >
            {t(`mode.${option}`)}
          </button>
        ))}
      </div>

      {chatting ? (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="vr-attach"
                aria-label={t('attachLabel')}
                title={t('attachLabel')}
                disabled={sending}
                data-busy={attach.uploading || undefined}
              >
                <Plus aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                {t('attachUpload')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPickerOpen(true)}>
                {t('attachFromLibrary')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept={USER_IMAGE_UPLOAD_ACCEPTED_MIME_TYPES.join(',')}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])]
              event.target.value = ''
              if (files.length) void attach.upload(files)
            }}
          />
          <AssetSelectorDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            title={t('attachFromLibrary')}
            description={t('imagesMax', { max: VOICE_ROOM_CHAT_IMAGES_MAX })}
            mediaType="image"
            multiSelect
            maxSelection={Math.max(
              1,
              VOICE_ROOM_CHAT_IMAGES_MAX - attach.images.length,
            )}
            onConfirmMany={(generations) =>
              attach.add(generations.map(imageOfGeneration))
            }
          />
        </>
      ) : null}

      <input
        className="vr-input"
        value={text}
        maxLength={VOICE_LINE_TEXT_MAX_LENGTH}
        onChange={(event) => setText(event.target.value)}
        placeholder={
          selected
            ? chatting
              ? t('chatPlaceholder', { name: selected.name })
              : t('linePlaceholder', { name: selected.name })
            : t('pickSpeakerFirst')
        }
        disabled={!selected || sending}
        aria-label={t('lineInputLabel')}
      />

      <VoiceRoomDelivery
        delivery={delivery}
        onChange={onDeliveryChange}
        disabled={sending}
      />

      <button
        type="button"
        className="vr-send"
        disabled={
          sending || attach.uploading || text.trim().length === 0 || !selected
        }
        // 缺渠道时按钮**保持可点**并写「先选渠道」，点了把选择器打开并定位到那
        // 一行 —— 禁用它只会让人「点了没反应」（与工作台那两颗生成键同一条规矩）。
        onClick={(event) => {
          if (channelGate.blocked) {
            event.preventDefault()
            channelGate.requestPick()
            return
          }
          void handleSubmit(event)
        }}
      >
        {sending
          ? t('sending')
          : attach.uploading
            ? t('uploading')
            : channelGate.blocked
              ? tPicker('pickChannel')
              : chatting
                ? t('send')
                : t('generate')}
      </button>
    </form>
  )
}
