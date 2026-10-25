'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import {
  VOICE_ROOM_NEW_QUERY,
  VOICE_ROOM_QUERY,
  voiceRoomPath,
} from '@/constants/routes'

import { Button } from '@/components/ui/button'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { usePublishVoiceRooms } from '@/hooks/use-shell-voice-rooms'
import { useVoiceRoom } from '@/hooks/use-voiceroom'
import { useRouter } from '@/i18n/navigation'

import { VoiceRoomRail } from './VoiceRoomRail'
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
    mode,
    setMode,
    llmModel,
    setLlmModel,
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
   * 进来先打开最近动过的那个房间；一个都没有就开一个空的。
   *
   * ⚠ 必须用 ref 上闸，**只跑一次**。`createRoom()` 是异步的，它内部 `setRooms`
   * 会让 `rooms` 换一个新数组引用、把这个 effect 重新触发一遍，而那时候
   * `openRoom` 还没 await 完、`activeRoomId` 仍是 null —— 光靠 `activeRoomId`
   * 当条件拦不住，结果是连着建出一串空房间（2026-08-29 真机上就撞出来了）。
   */
  const router = useRouter()
  const searchParams = useSearchParams()
  const roomParam = searchParams.get(VOICE_ROOM_QUERY)
  const wantsNew = searchParams.get(VOICE_ROOM_NEW_QUERY) === '1'
  const bootstrappedRef = useRef(false)
  useEffect(() => {
    if (loadingRooms || error || bootstrappedRef.current) return
    bootstrappedRef.current = true
    const asked = roomParam && rooms.find((room) => room.id === roomParam)
    if (asked) void openRoom(asked.id)
    else if (rooms.length > 0 && !wantsNew) void openRoom(rooms[0].id)
    else void createRoom()
  }, [loadingRooms, error, rooms, openRoom, createRoom, roomParam, wantsNew])

  /*
   * 第 9f 步 9f-3：房间写进地址（`?room=`），外壳左边列表点哪间就开哪间、刷新也还在那间；
   * 首页切到「配音间」进来带 `?new=1` = 新开一间。
   */
  useEffect(() => {
    if (!bootstrappedRef.current || !roomParam || roomParam === activeRoomId)
      return
    if (rooms.some((room) => room.id === roomParam)) void openRoom(roomParam)
    // 只认地址变了那一拍：开着的那间换了是下面那条把地址跟上。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomParam])
  useEffect(() => {
    if (!activeRoomId || activeRoomId === roomParam) return
    router.replace(voiceRoomPath(activeRoomId), { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoomId])
  usePublishVoiceRooms(rooms, activeRoomId)

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
        <VoiceRoomRail
          rooms={rooms}
          activeRoomId={activeRoomId}
          onOpen={(roomId) => void openRoom(roomId)}
          onCreate={() => void createRoom()}
          onDelete={(roomId) => void removeRoom(roomId)}
        />

        {detail ? (
          <VoiceRoomStage
            detail={detail}
            sending={sending}
            switching={switching}
            retakingIds={retakingIds}
            pendingLine={pendingLine}
            pendingUserText={pendingUserText}
            streamingReply={streamingReply}
            mode={mode}
            onModeChange={setMode}
            llmModel={llmModel}
            onLlmModelChange={setLlmModel}
            keySetup={keySetup}
            onDismissKeySetup={dismissKeySetup}
            error={error}
            delivery={delivery}
            onDeliveryChange={setDelivery}
            onRename={(name) => void renameRoom(detail.id, name)}
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
