'use client'

/**
 * 声音库面板的**供数层**（S5c，画板 `AudioLibrary.dc.html` 五个页签）。
 *
 * ── 它补的是哪个洞 ──────────────────────────────────────────────────────
 * `use-voice-library` 回答的是「有哪些**嗓子**」（音色卡 + 平台公开音色）。而
 * 面板要的是「有哪些**已经录好的声音**」——历史生成、配音间说过的台词、上传的
 * 素材，它们没有 `voiceId`，只有一段 url。两个问题不同，所以这是第二个 hook 而
 * 不是往前一个里塞第四第五个数组。
 *
 * ── 三条纪律 ────────────────────────────────────────────────────────────
 * ① **一次只拉当前页签**：五个页签打到四个不同的后端，常驻全拉等于开一次面板
 *    发五轮请求，而用户多半只看其中一栏。
 * ② **归一成同一颗 `VoiceLibraryClip`**：面板那一行（名 · 副标 · 时长 · 试听 ·
 *    用这段 · 设为音色）只认这一个形状，⛔ 渲染层不做第二次 `if (tab === …)`。
 * ③ **API 一律走 `lib/api-client`**（Hard Rule 3），⛔ 这里不 fetch。
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import {
  AUDIO_CLIP_SOURCE,
  VOICE_LIBRARY_ROOM_LIMIT,
  VOICE_LIBRARY_TAB_LIMIT,
  type AudioClipSourceKind,
  type VoiceLibraryTabId,
} from '@/constants/audio-options'
import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import { useVoiceLibrary } from '@/hooks/use-voice-library'
import { fetchGalleryImages } from '@/lib/api-client'
/*
 * ⚠ 配音间那一栏**只有深导入一条来路**：`@/lib/api-client/voiceroom` 从来不在
 * barrel 里（`use-voiceroom.ts` 同一条注释）。⛔ 不为这一栏把整个配音间客户端
 * 提进 barrel —— 那会让 barrel 的每个消费者都拖上配音间的类型。
 */
import { getVoiceRoomAPI, listVoiceRoomsAPI } from '@/lib/api-client/voiceroom'
import type { GenerationRecord } from '@/types'

/**
 * 面板那一行需要的全部事实。
 *
 * ⚠ `voiceId` 可空：历史 / 配音间 / 素材库的声音没有音色可继承，那几行的
 * 「设为音色」按不动 —— ⛔ 不给它编一个 id，那会让「之后写台词用它的声」
 * 静默用错嗓子。
 */
export interface VoiceLibraryClip {
  readonly id: string
  readonly name: string
  readonly subtitle: string | null
  /** 可试听、也可「用这段」直接落进卡里的地址。 */
  readonly url: string
  readonly durationSec: number | null
  readonly voiceId: string | null
  readonly sourceKind: AudioClipSourceKind
  /** ⋯ 菜单里那一行只读来源的原文（画板「来自声音库 · 平台样本 · 莫宁」）。 */
  readonly sourceLabel: string
  /**
   * 落进库里的时刻（ISO 串）。⚠ 可空：平台样本 / 收藏是**音色**不是录音，它们没有
   * 「什么时候录的」可言 —— ⛔ 不给它编一个 `now`（那会让整栏都堆在「今天」）。
   */
  readonly createdAt: string | null
}

/**
 * 「我的历史 / 配音间 / 素材库」按时间分组（S5c 尾项：一条时间轴上百条录音，没有
 * 分组就只能靠肉眼数）。⚠ 顺序即显示顺序。
 */
export const VOICE_LIBRARY_DATE_GROUPS = [
  'today',
  'yesterday',
  'earlier',
] as const

export type VoiceLibraryDateGroup = (typeof VOICE_LIBRARY_DATE_GROUPS)[number]

export interface VoiceLibraryClipGroup {
  readonly group: VoiceLibraryDateGroup
  readonly clips: readonly VoiceLibraryClip[]
}

/** 两个时刻是不是同一个**本地**日历日（⛔ 不按 UTC 切：那会在晚上八点后错一天）。 */
function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * 分组。**保持原有顺序**（后端已经按新→旧给了），⛔ 不在这里再排一次 —— 再排一次
 * 就要求每条都有 `createdAt`，而有些栏本来就没有。
 *
 * 没有 `createdAt` 的一律落进「更早」：它至少是真的（「今天」会是假话）。
 * 结果里**不出现空组**。
 */
export function groupVoiceLibraryClipsByDate(
  clips: readonly VoiceLibraryClip[],
  now: Date = new Date(),
): readonly VoiceLibraryClipGroup[] {
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const buckets = new Map<VoiceLibraryDateGroup, VoiceLibraryClip[]>()
  for (const clip of clips) {
    const at = clip.createdAt ? new Date(clip.createdAt) : null
    const group: VoiceLibraryDateGroup =
      at && !Number.isNaN(at.getTime())
        ? sameLocalDay(at, now)
          ? 'today'
          : sameLocalDay(at, yesterday)
            ? 'yesterday'
            : 'earlier'
        : 'earlier'
    const bucket = buckets.get(group)
    if (bucket) bucket.push(clip)
    else buckets.set(group, [clip])
  }
  return VOICE_LIBRARY_DATE_GROUPS.flatMap((group) => {
    const bucket = buckets.get(group)
    return bucket && bucket.length > 0 ? [{ group, clips: bucket }] : []
  })
}

export interface VoiceLibraryClipsResult {
  readonly clips: readonly VoiceLibraryClip[]
  readonly isLoading: boolean
  readonly error: string | null
}

export interface UseVoiceLibraryClipsOptions {
  readonly tab: VoiceLibraryTabId
  readonly enabled: boolean
  readonly search: string
  /** 来源那行小字怎么写 —— 文案属于渲染层，hook 只负责把它拼进事实。 */
  labelOf(kind: AudioClipSourceKind, name: string): string
}

function generationClip(
  record: GenerationRecord,
  kind: AudioClipSourceKind,
  labelOf: UseVoiceLibraryClipsOptions['labelOf'],
): VoiceLibraryClip {
  // 上传进来的没有提示词 —— 退到文件名（`storageKey` 的尾段），⛔ 不退到
  // `model`（那会让素材库整栏都叫「user-upload」，真机 2026-09-10 见过）。
  const name =
    record.prompt.trim() ||
    record.storageKey?.split('/').pop()?.trim() ||
    record.model
  // ⚠ 时刻先当**可能读不出来**处理：这一栏的记录经 JSON 过来，`createdAt` 缺了或
  // 不是时间时 `toISOString()` 会抛，整栏就空了（⛔ 不让一格分组信息掀翻列表）。
  const createdAt = new Date(record.createdAt)
  return {
    id: record.id,
    name,
    subtitle: record.prompt.trim() ? record.model : null,
    url: record.url,
    durationSec: record.duration ?? null,
    voiceId: null,
    sourceKind: kind,
    sourceLabel: labelOf(kind, name),
    createdAt: Number.isNaN(createdAt.getTime())
      ? null
      : createdAt.toISOString(),
  }
}

export function useVoiceLibraryClips({
  tab,
  enabled,
  search,
  labelOf,
}: UseVoiceLibraryClipsOptions): VoiceLibraryClipsResult {
  // 平台样本与收藏这两栏的事实还在 `use-voice-library` 那边（收藏分流、公开库
  // 检索与竞态守卫都在那里）——⛔ 不为面板另写一套检索。
  const needsVoices = tab === 'platformSample' || tab === 'favorites'
  const voices = useVoiceLibrary({ enabled: enabled && needsVoices })
  const setVoiceSearch = voices.setSearch
  const setVoiceTab = voices.setTab
  useEffect(() => {
    if (!enabled || !needsVoices) return
    setVoiceSearch(search)
  }, [enabled, needsVoices, search, setVoiceSearch])
  // ⚠ `useVoiceLibrary.isLoading` 是**按它自己的分栏**取的（见那边的注释），
  // 不同步这一下的话「收藏」页签会一直读公开库的加载态。
  useEffect(() => {
    if (!enabled || !needsVoices) return
    setVoiceTab(tab === 'favorites' ? 'favorites' : 'public')
  }, [enabled, needsVoices, tab, setVoiceTab])

  /**
   * 远端三栏的结果，**连同它是哪一栏的**一起存。
   *
   * ⚠ 存 `tab` 而不是在切页签时先 `setRemote([])`：effect 体里同步 setState 会
   * 触发一轮级联渲染（`react-hooks/set-state-in-effect`）。带上标签之后「上一栏
   * 的结果」在读侧自然作废，⛔ 不需要清空那一步。
   */
  const [remote, setRemote] = useState<{
    readonly tab: VoiceLibraryTabId | null
    readonly clips: readonly VoiceLibraryClip[]
    readonly error: string | null
  }>({ tab: null, clips: [], error: null })

  /** 竞态守卫：切页签比请求回来快，晚到的旧响应⛔不许覆盖新的。 */
  const runRef = useRef(0)
  /**
   * ⚠ 只给**异步那条路**用：文案函数不该把整轮拉取重跑一遍，所以它不进 effect
   * 的依赖表。同步那一半（`fromVoices`）直接调 `labelOf`——render 期读 ref 是
   * `react-hooks/refs` 明令禁止的。
   */
  const labelRef = useRef(labelOf)
  useEffect(() => {
    labelRef.current = labelOf
  }, [labelOf])

  useEffect(() => {
    if (!enabled || needsVoices) return
    const run = (runRef.current += 1)

    const load = async (): Promise<readonly VoiceLibraryClip[]> => {
      if (tab === 'voiceRoom') {
        const rooms = await listVoiceRoomsAPI()
        if (!rooms.success || !rooms.data) {
          throw new Error(rooms.error ?? 'voiceroom list failed')
        }
        const details = await Promise.all(
          rooms.data
            .slice(0, VOICE_LIBRARY_ROOM_LIMIT)
            .map((room) => getVoiceRoomAPI(room.id)),
        )
        return details.flatMap((detail) => {
          const room = detail.data
          if (!detail.success || !room) return []
          return room.lines.flatMap((line) => {
            const url = line.audio?.url
            if (!url) return []
            const name = line.text.trim() || line.speakerName
            return [
              {
                id: line.id,
                name: `${line.speakerName} · ${name}`,
                subtitle: room.name,
                url,
                durationSec: line.audio?.duration ?? null,
                voiceId: null,
                sourceKind: AUDIO_CLIP_SOURCE.voiceRoom,
                sourceLabel: labelRef.current(
                  AUDIO_CLIP_SOURCE.voiceRoom,
                  name,
                ),
                createdAt: line.createdAt,
              } satisfies VoiceLibraryClip,
            ]
          })
        })
      }

      // 我的历史 = 生成出来的音频；素材库 = 上传进来的（`provider` 分流，与
      // `/assets` 那边同一条判据）。
      const upload = tab === 'library'
      const response = await fetchGalleryImages(1, VOICE_LIBRARY_TAB_LIMIT, {
        type: ['audio'],
        mine: true,
        ...(upload ? { provider: USER_UPLOAD_PROVIDER } : {}),
      })
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'gallery failed')
      }
      const kind = upload
        ? AUDIO_CLIP_SOURCE.library
        : AUDIO_CLIP_SOURCE.history
      return response.data.generations
        .filter((record) => Boolean(record.url))
        .filter((record) =>
          upload ? true : record.provider !== USER_UPLOAD_PROVIDER,
        )
        .map((record) => generationClip(record, kind, labelRef.current))
    }

    void load()
      .then((clips) => {
        if (runRef.current !== run) return
        setRemote({ tab, clips, error: null })
      })
      .catch((cause: unknown) => {
        if (runRef.current !== run) return
        setRemote({
          tab,
          clips: [],
          error: cause instanceof Error ? cause.message : String(cause),
        })
      })
  }, [enabled, needsVoices, tab])

  const fromVoices = useMemo((): readonly VoiceLibraryClip[] => {
    if (tab === 'platformSample') {
      return voices.publicVoices.flatMap((asset) =>
        asset.sampleUrl
          ? [
              {
                id: asset.id,
                name: asset.title,
                subtitle: asset.author,
                url: asset.sampleUrl,
                durationSec: null,
                voiceId: asset.voiceId,
                sourceKind: AUDIO_CLIP_SOURCE.platformSample,
                sourceLabel: labelOf(
                  AUDIO_CLIP_SOURCE.platformSample,
                  asset.title,
                ),
                // 平台样本是**嗓子**不是录音 —— 没有「什么时候录的」。
                createdAt: null,
              } satisfies VoiceLibraryClip,
            ]
          : [],
      )
    }
    if (tab !== 'favorites') return []
    return voices.favorites.flatMap((card) => {
      const url = card.sampleAudioUrl ?? card.referenceAudioUrl
      if (!url) return []
      return [
        {
          id: card.id,
          name: card.name,
          subtitle: card.tone.join(' · ') || null,
          url,
          durationSec: null,
          voiceId: card.voiceId,
          sourceKind: AUDIO_CLIP_SOURCE.platformSample,
          sourceLabel: labelOf(AUDIO_CLIP_SOURCE.platformSample, card.name),
          createdAt: null,
        } satisfies VoiceLibraryClip,
      ]
    })
  }, [tab, voices.publicVoices, voices.favorites, labelOf])

  /** 这一栏的结果到了没有 —— 「加载中」就是它的反面，⛔ 不另存一个 boolean。 */
  const settled = remote.tab === tab
  const keyword = search.trim().toLowerCase()
  const clips = useMemo(() => {
    const all = needsVoices ? fromVoices : settled ? remote.clips : []
    if (keyword.length === 0) return all
    // 平台样本那一栏是**服务端检索**（词已经递给 `use-voice-library`），本地再过
    // 一遍是无害的；其余四栏只有本地这一道。
    return all.filter(
      (clip) =>
        clip.name.toLowerCase().includes(keyword) ||
        (clip.subtitle ?? '').toLowerCase().includes(keyword),
    )
  }, [needsVoices, fromVoices, remote, settled, keyword])

  return {
    clips,
    isLoading: needsVoices ? voices.isLoading : !settled,
    error: needsVoices ? null : settled ? remote.error : null,
  }
}
