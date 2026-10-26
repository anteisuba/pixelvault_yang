'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { VOICE_ROOM_QUERY, voiceRoomPath } from '@/constants/routes'

import { Button } from '@/components/ui/button'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { useChatPersona } from '@/hooks/use-chat-persona'
import { usePublishVoiceRooms } from '@/hooks/use-shell-voice-rooms'
import { useVoiceRoom } from '@/hooks/use-voiceroom'
import { useRouter } from '@/i18n/navigation'
import { personaCastMember, soloRoomsForPersona } from '@/lib/voiceroom-cast'

import { VoiceRoomStage } from './VoiceRoomStage'

// 域皮肤跟着域组件走（同 `HomeV4Shell` / `LoraWorkbench`），不进全局 layout。
import '@/app/voiceroom.css'

/**
 * 配音间 —— 整页。
 *
 * ⚠ 这一页**不进** `StudioWorkspaceUI` 共享壳（owner 2026-08-29）：共享参数栏、
 * 助手浮标、模态切换器都是工作台的词汇表，配音间是个房间。脱壳靠的是它住在
 * `studio/audio/` 而不是 `studio/(workspace)/audio/` —— 那个路由组才是三个模态
 * 共用 StudioProvider 的地方。
 */
export function VoiceRoomPage() {
  const t = useTranslations('VoiceRoom')
  const {
    rooms,
    detail,
    activeRoomId,
    loadingRooms,
    sending,
    switching,
    retakingIds,
    pendingLine,
    pendingUserText,
    streamingReply,
    finishReply,
    mode,
    setMode,
    llmModel,
    setLlmModel,
    voiceOn,
    toggleVoice,
    keySetup,
    dismissKeySetup,
    error,
    delivery,
    setDelivery,
    openRoom,
    createRoom,
    renameRoom,
    setCast,
    removeRoom,
    say,
    chat,
    retake,
    dismissError,
    refreshRooms,
  } = useVoiceRoom()

  /**
   * 进来先打开**现在这一位**（全局助手人设，用户 10-25）最近那一段；和她一段都没有就照她开一段。
   *
   * ⚠ 必须用 ref 上闸，**只跑一次**。`createRoom()` 是异步的，它内部 `setRooms`
   * 会让 `rooms` 换一个新数组引用、把这个 effect 重新触发一遍，而那时候
   * `openRoom` 还没 await 完、`activeRoomId` 仍是 null —— 光靠 `activeRoomId`
   * 当条件拦不住，结果是连着建出一串空房间（2026-08-29 真机上就撞出来了）。
   */
  const router = useRouter()
  const searchParams = useSearchParams()
  const roomParam = searchParams.get(VOICE_ROOM_QUERY)
  const bootstrappedRef = useRef(false)
  const chatPersona = useChatPersona()
  useEffect(() => {
    if (loadingRooms || error || bootstrappedRef.current) return
    // 地址点名的那一段照开（头像点角色刚替她开的那段这时还不在列表里）。
    if (roomParam) {
      bootstrappedRef.current = true
      void openRoom(roomParam)
      return
    }
    // 没点名：等人设读回来再挑（之前那一拍是默认助手那一格）。
    if (!chatPersona.ready) return
    bootstrappedRef.current = true
    const latest = soloRoomsForPersona(rooms, chatPersona.ref)[0]
    if (latest) void openRoom(latest.id)
    else void createRoom([personaCastMember(chatPersona.target)])
  }, [
    loadingRooms,
    error,
    rooms,
    openRoom,
    createRoom,
    roomParam,
    chatPersona.ready,
    chatPersona.ref,
    chatPersona.target,
  ])

  /*
   * 房间写进地址（`?room=`）：头像点角色 / 群、标题 ▾ 换一段都走它，刷新也还在那一段。
   */
  useEffect(() => {
    if (!bootstrappedRef.current || !roomParam || roomParam === activeRoomId)
      return
    // 头像点角色可能刚替她开了一段（这一页手上的列表里还没有）：照样打开、列表跟着刷新。
    if (!rooms.some((room) => room.id === roomParam)) void refreshRooms()
    void openRoom(roomParam)
    // 只认地址变了那一拍：开着的那间换了是下面那条把地址跟上。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomParam])
  useEffect(() => {
    if (!activeRoomId || activeRoomId === roomParam) return
    router.replace(voiceRoomPath(activeRoomId), { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoomId])
  const shellActions = useMemo(
    () => ({ rename: renameRoom, remove: removeRoom }),
    [renameRoom, removeRoom],
  )
  usePublishVoiceRooms(rooms, activeRoomId, shellActions)

  /*
   * ⚠ 只挂 `ApiKeysProvider`，**不是** `StudioProvider`。
   *
   * 顶栏的模型入口要知道哪些渠道配了 key，那份数据住在这个 provider 里。它是个
   * 独立的小 provider（就包着 `useApiKeys`），和工作台外壳不是一回事——这一页
   * 脱壳的前提没有被破坏。共享选择器不用改，它只是不再自己去读 StudioContext
   * （见 `useAudioModelOptionsFor`）。
   */
  return (
    <ApiKeysProvider>
      <div className="voiceroom workbench-ground h-page">
        {detail ? (
          <VoiceRoomStage
            detail={detail}
            sending={sending}
            switching={switching}
            retakingIds={retakingIds}
            pendingLine={pendingLine}
            pendingUserText={pendingUserText}
            streamingReply={streamingReply}
            onReplyRevealed={finishReply}
            mode={mode}
            onModeChange={setMode}
            llmModel={llmModel}
            onLlmModelChange={setLlmModel}
            voiceOn={voiceOn}
            onToggleVoice={toggleVoice}
            keySetup={keySetup}
            onDismissKeySetup={dismissKeySetup}
            error={error}
            delivery={delivery}
            onDeliveryChange={setDelivery}
            onCastChange={(cast) => void setCast(cast)}
            onSay={say}
            onChat={chat}
            onRetake={retake}
            onDismissError={dismissError}
          />
        ) : (
          <div className="vr-stage workbench-card">
            <div className="vr-empty">
              {error ? (
                <div className="flex flex-col items-center gap-4" role="alert">
                  <p>{t('loadFailed')}</p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      dismissError()
                      if (activeRoomId) void openRoom(activeRoomId)
                      else {
                        bootstrappedRef.current = false
                        void refreshRooms()
                      }
                    }}
                  >
                    {t('retry')}
                  </Button>
                </div>
              ) : (
                <span className="vr-empty-eyebrow">{t('loading')}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </ApiKeysProvider>
  )
}
