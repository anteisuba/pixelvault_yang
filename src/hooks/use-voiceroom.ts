'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  VOICE_ROOM_POLL_MS,
  VOICE_ROOM_SWITCH_OUT_MS,
} from '@/constants/voiceroom'
import {
  createVoiceLineAPI,
  createVoiceRoomAPI,
  deleteVoiceRoomAPI,
  getVoiceRoomAPI,
  listVoiceRoomsAPI,
  retakeVoiceLineAPI,
  updateVoiceRoomAPI,
} from '@/lib/api-client/voiceroom'
import type {
  VoiceLineRecord,
  VoiceRoomCastMember,
  VoiceRoomDetail,
  VoiceRoomDeliveryState,
  VoiceRoomRecord,
} from '@/types/voiceroom'
import { AUDIO_DEFAULT_PACE, type AudioEmotion } from '@/constants/voice-cards'
import { AUDIO_EXPRESSIVENESS } from '@/constants/audio-options'

/**
 * 念法的出厂档。
 *
 * 这两个值在服务端是**精确的空操作**：`normal` 映射到 speed 1，`auto` 让表现力
 * 从情感推导（有情感→dramatic，无→natural）——也就是不碰参数时的原本行为。
 * 所以这里可以一律带上，不必分「改过 / 没改过」两条路。
 */
const DEFAULT_DELIVERY: VoiceRoomDeliveryState = {
  pace: AUDIO_DEFAULT_PACE,
  expressiveness: AUDIO_EXPRESSIVENESS.AUTO,
  modelId: null,
}

/**
 * 会话里的念法 → 请求体。
 *
 * ⚠ `modelId` 是 null 时**整个键都不能出现**：schema 只收 `string | undefined`，
 * 而「没选过」的语义正是让服务端去挑目录里第一个可用的。塞个 null 进去既过不了
 * 校验，也把意思说反了。
 */
function toDeliveryPayload(delivery: VoiceRoomDeliveryState) {
  return {
    pace: delivery.pace,
    expressiveness: delivery.expressiveness,
    ...(delivery.modelId ? { modelId: delivery.modelId } : {}),
  }
}

/** 一条台词是不是还在路上。 */
function isPending(line: VoiceLineRecord): boolean {
  return line.audio?.status === 'QUEUED' || line.audio?.status === 'RUNNING'
}

export interface UseVoiceRoomResult {
  rooms: VoiceRoomRecord[]
  detail: VoiceRoomDetail | null
  activeRoomId: string | null
  loadingRooms: boolean
  loadingDetail: boolean
  /** 正在提交一条台词——输入行据此禁用，避免连点发出两条。 */
  sending: boolean
  /** 正在换房间：旧聊天流据此退场，新的等它退完再进来。 */
  switching: boolean
  /**
   * 正在重录的台词 id。
   *
   * ⚠ 这是**独立的一份状态，不是往 `detail` 里塞假数据**。塞假数据会被轮询冲掉：
   * 轮询每 2 秒重新拉整个房间，服务端那边这条台词还是上一次的 COMPLETED，
   * 一拉就把乐观状态盖回去了。
   */
  retakingIds: ReadonlySet<string>
  /** 刚发出、还没拿到回执的那句话。聊天流据此先摆一个「正在开口」的占位气泡。 */
  pendingLine: { speakerId: string; text: string } | null
  error: string | null
  /** 「接下来怎么念」——会话级，不落库，不是某一句的属性。 */
  delivery: VoiceRoomDeliveryState
  setDelivery: (patch: Partial<VoiceRoomDeliveryState>) => void
  openRoom: (roomId: string) => Promise<void>
  createRoom: () => Promise<string | null>
  renameRoom: (roomId: string, name: string | null) => Promise<void>
  setCast: (cast: VoiceRoomCastMember[]) => Promise<void>
  removeRoom: (roomId: string) => Promise<void>
  say: (speakerId: string, text: string) => Promise<boolean>
  retake: (
    lineId: string,
    patch: { emotion?: AudioEmotion | null; text?: string },
  ) => Promise<void>
  refreshRooms: () => Promise<void>
  dismissError: () => void
}

/**
 * 配音间的客户端状态。
 *
 * ## 轮询
 *
 * 只在**当前房间里确实有台词在生成时**才转，一停就停——安静的房间一个请求都不
 * 发。每轮重新拉整个房间而不是逐条查 job：一次请求就能让所有在飞的台词一起
 * 前进，天然支持同时生成好几条，也不需要一个会串台的共享 pollRef。
 *
 * ⚠ 这里**不**主动调 `/api/generate-audio/status` 去推进任务，因为当前两条档位
 * 都不需要：语音（Fish S2 Pro）是 worker 托管的，完成由 worker 回调写库；音效
 * （ElevenLabs）在提交时就同步生成完了。要证伪：接一个「排队式」音频 provider
 * 后，台词会永远停在 RUNNING——那时就得在这里补一次 status 调用去推它。
 */
export function useVoiceRoom(): UseVoiceRoomResult {
  const [rooms, setRooms] = useState<VoiceRoomRecord[]>([])
  const [detail, setDetail] = useState<VoiceRoomDetail | null>(null)
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [sending, setSending] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [retakingIds, setRetakingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [pendingLine, setPendingLine] = useState<{
    speakerId: string
    text: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [delivery, setDeliveryState] =
    useState<VoiceRoomDeliveryState>(DEFAULT_DELIVERY)

  const setDelivery = useCallback((patch: Partial<VoiceRoomDeliveryState>) => {
    setDeliveryState((current) => ({ ...current, ...patch }))
  }, [])

  /** 防止过期的房间详情覆盖刚切过去的那个（切房间比请求快时会发生）。 */
  const activeRoomRef = useRef<string | null>(null)

  const refreshRooms = useCallback(async () => {
    setLoadingRooms(true)
    setError(null)
    const result = await listVoiceRoomsAPI()
    if (result.success && result.data) setRooms(result.data)
    else if (result.error) setError(result.error)
    setLoadingRooms(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时取一次房间列表，是向服务端要数据后回填，不是从渲染输入推得出来的
    void refreshRooms()
  }, [refreshRooms])

  const loadDetail = useCallback(async (roomId: string, quiet = false) => {
    if (!quiet) setLoadingDetail(true)
    const result = await getVoiceRoomAPI(roomId)
    // 请求在飞的时候用户可能已经切走了——那就丢弃这份结果。
    if (activeRoomRef.current !== roomId) return
    if (result.success && result.data) setDetail(result.data)
    else if (result.error) setError(result.error)
    if (!quiet) setLoadingDetail(false)
  }, [])

  /**
   * 打开一个房间。
   *
   * 从**别的房间**切过来时不立刻清空：旧的那屋子人先原地退场 150ms，同时新房间
   * 已经在路上。等两件事都完成才换过去——先清空再拉，中间那段空白会让切房间读起来
   * 像「页面坏了一下」，而不是「换了个房间」。
   *
   * ⚠ 两件事**并行**等，不是串行：`Promise.all` 里请求和退场同时跑，慢的那个说了算。
   * 串起来写就白白多花 150ms。
   */
  const openRoom = useCallback(
    async (roomId: string) => {
      const isSwitch =
        activeRoomRef.current !== null && activeRoomRef.current !== roomId
      activeRoomRef.current = roomId
      setActiveRoomId(roomId)

      if (!isSwitch) {
        setDetail(null)
        await loadDetail(roomId)
        return
      }

      setSwitching(true)
      await Promise.all([
        loadDetail(roomId, true),
        new Promise((resolve) =>
          window.setTimeout(resolve, VOICE_ROOM_SWITCH_OUT_MS),
        ),
      ])
      setSwitching(false)
    },
    [loadDetail],
  )

  /* ── 轮询：有台词在飞才转 ─────────────────────────────────────── */

  const hasPending = detail?.lines.some(isPending) ?? false

  useEffect(() => {
    if (!hasPending || !activeRoomId) return
    const timer = window.setInterval(() => {
      void loadDetail(activeRoomId, true)
    }, VOICE_ROOM_POLL_MS)
    return () => window.clearInterval(timer)
  }, [hasPending, activeRoomId, loadDetail])

  /* ── 房间 ─────────────────────────────────────────────────────── */

  const createRoom = useCallback(async () => {
    const result = await createVoiceRoomAPI({})
    if (!result.success || !result.data) {
      setError(result.error ?? null)
      return null
    }
    setRooms((current) => [result.data!, ...current])
    await openRoom(result.data.id)
    return result.data.id
  }, [openRoom])

  const renameRoom = useCallback(
    async (roomId: string, name: string | null) => {
      const result = await updateVoiceRoomAPI({ roomId, name })
      if (!result.success || !result.data) {
        setError(result.error ?? null)
        return
      }
      const updated = result.data
      setRooms((current) =>
        current.map((room) => (room.id === roomId ? updated : room)),
      )
      setDetail((current) =>
        current && current.id === roomId ? { ...current, ...updated } : current,
      )
    },
    [],
  )

  const setCast = useCallback(
    async (cast: VoiceRoomCastMember[]) => {
      if (!activeRoomId) return
      const result = await updateVoiceRoomAPI({ roomId: activeRoomId, cast })
      if (!result.success || !result.data) {
        setError(result.error ?? null)
        return
      }
      const updated = result.data
      setRooms((current) =>
        current.map((room) => (room.id === updated.id ? updated : room)),
      )
      setDetail((current) => (current ? { ...current, ...updated } : current))
    },
    [activeRoomId],
  )

  /**
   * 删房间。台词跟着走（schema 上是 Cascade），**生成物一条不动**——那是用户
   * 资产，躺在素材库里，不该因为收拾一场戏就消失。
   */
  const removeRoom = useCallback(
    async (roomId: string) => {
      const result = await deleteVoiceRoomAPI(roomId)
      if (!result.success) {
        setError(result.error ?? null)
        return
      }

      const remaining = rooms.filter((room) => room.id !== roomId)
      setRooms(remaining)
      if (activeRoomRef.current !== roomId) return

      /*
       * ⚠ 删掉的正是当前打开的房间：**必须接上下一个**，不能只把状态清空。
       * 首屏那段「没有房间就开一个」的逻辑上过一次闸（`bootstrappedRef`），
       * 不会再跑第二遍——清空了就永远停在「加载中」，一个空壳页面。
       */
      activeRoomRef.current = null
      setActiveRoomId(null)
      setDetail(null)
      if (remaining.length > 0) await openRoom(remaining[0].id)
      else await createRoom()
    },
    [rooms, openRoom, createRoom],
  )

  /* ── 台词 ─────────────────────────────────────────────────────── */

  const say = useCallback(
    async (speakerId: string, text: string) => {
      if (!activeRoomId) return false
      setSending(true)
      /*
       * 先摆一个占位气泡再发请求。Fish 的语音是**同步生成**的，这个往返要好几秒——
       * 不先落一个「正在开口」，用户点完生成会盯着一个毫无变化的屏幕。
       *
       * ⚠ 占位**不进 `detail.lines`**：真台词回来时 id 是服务端给的，混进列表会让
       * React 换 key 重新挂载，入场动画再播一遍，看着像闪了一下。占位是它自己一个
       * 元素，真气泡该有的入场它本来就该有。
       */
      setPendingLine({ speakerId, text })
      const result = await createVoiceLineAPI({
        roomId: activeRoomId,
        speakerId,
        text,
        ...toDeliveryPayload(delivery),
      })
      setSending(false)
      setPendingLine(null)
      if (!result.success || !result.data) {
        setError(result.error ?? null)
        return false
      }
      const line = result.data
      setDetail((current) =>
        current && current.id === activeRoomId
          ? { ...current, lines: [...current.lines, line] }
          : current,
      )
      return true
    },
    [activeRoomId, delivery],
  )

  const retake = useCallback(
    async (
      lineId: string,
      patch: { emotion?: AudioEmotion | null; text?: string },
    ) => {
      // 这条台词立刻进入「正在开口」——同 `say`，不然点完角标屏幕上什么都不发生。
      setRetakingIds((current) => new Set(current).add(lineId))
      // 重录沿用**当下**的念法设置——参数是「接下来怎么念」，不是当初怎么念。
      const result = await retakeVoiceLineAPI({
        lineId,
        ...toDeliveryPayload(delivery),
        ...patch,
      })
      setRetakingIds((current) => {
        const next = new Set(current)
        next.delete(lineId)
        return next
      })
      if (!result.success || !result.data) {
        setError(result.error ?? null)
        return
      }
      const line = result.data
      setDetail((current) =>
        current
          ? {
              ...current,
              lines: current.lines.map((item) =>
                item.id === line.id ? line : item,
              ),
            }
          : current,
      )
    },
    [delivery],
  )

  const dismissError = useCallback(() => setError(null), [])

  return {
    rooms,
    detail,
    activeRoomId,
    loadingRooms,
    loadingDetail,
    sending,
    switching,
    retakingIds,
    pendingLine,
    error,
    delivery,
    setDelivery,
    openRoom,
    createRoom,
    renameRoom,
    setCast,
    removeRoom,
    say,
    retake,
    refreshRooms,
    dismissError,
  }
}
