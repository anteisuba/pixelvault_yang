'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { AI_MODELS } from '@/constants/models'
import {
  VOICE_API_ERROR_CODES,
  VOICE_CARD_DEFAULT_PACE,
  VOICE_CARD_PROVIDER,
  VOICE_LIBRARY_PAGE_SIZE,
  type VoiceCardProvider,
  type VoiceLibraryLanguage,
  type VoiceLibrarySortBy,
} from '@/constants/voice-cards'
import { useVoiceCards } from '@/hooks/cards/use-voice-cards'
/*
 * ⚠ 三个都走 barrel，别改成深导入 `@/lib/api-client/voices`。
 *
 * 两个理由，都不是猜的：
 * 1. `studio-shared/README.md` 明文规定外部代码只从 barrel 进，深导入
 *    「discouraged」，将来会被 ESLint 拦。
 * 2. `VoiceSelector.test.tsx` mock 的是 barrel（`vi.mock('@/lib/api-client')`）。
 *    深导入是**另一个模块说明符**，那份 mock 替换不到它 —— 真发生时的表现会是
 *    「公开音色」相关用例集体拿不到数据，而报错只会说找不到某个元素，指不到这里。
 */
import {
  createVoiceCardAPI,
  deleteVoiceCardAPI,
  listVoicesAPI,
} from '@/lib/api-client'
import type { FishAudioVoice } from '@/services/fish-audio-voice.service'
import type { VoiceCardRecord } from '@/types'
import type { VoiceAsset, VoiceLibraryTab } from '@/types/voice-library'

/**
 * 声音库的**内核**：数据、收藏、分流。渲染一概不管。
 *
 * 起因（owner 2026-08-30 选 C）：画布的 `VoiceSelector` 与配音间的选角面板要看
 * 同一批嗓子，但**长得必须不一样**——画布节点里塞不下 84px 的大头像。所以
 * 两边共用的是「有哪些音色、哪些被收藏了、哪些是克隆的」这套事实与规则，
 * 各自渲染各自的皮肤。
 *
 * ## 边界
 *
 * 进来的：三分栏状态、公开库拉取（搜索 / 语言 / 排序 / 分页 + 竞态守卫）、
 * 收藏与取消收藏、收藏↔克隆分流、「这副嗓子收藏过没有」的反查。
 *
 * **不**进来的：卡片长什么样、选中之后干什么（画布是写 `voiceCardId`，配音间
 * 是把人请进班底）、试听播放器。这些是域自己的事——内核不认识任何域的选中态，
 * 取消收藏时该清什么由宿主通过 `onFavoriteRemoved` 自己决定。
 */

export function getVoiceAssetId(
  provider: VoiceCardProvider,
  voiceId: string,
): string {
  return `${provider}:${voiceId}`
}

/** Fish 的 payload → 库里的归一形态。将来接别家就在这一层各写一个。 */
export function mapFishVoiceToAsset(voice: FishAudioVoice): VoiceAsset {
  return {
    id: getVoiceAssetId(VOICE_CARD_PROVIDER.FISH_AUDIO, voice.id),
    voiceId: voice.id,
    provider: VOICE_CARD_PROVIDER.FISH_AUDIO,
    modelId: AI_MODELS.FISH_AUDIO_S2_PRO,
    title: voice.title,
    description: voice.description,
    languages: voice.languages,
    tags: voice.tags,
    author: voice.author?.nickname ?? null,
    coverImage: voice.coverImage,
    sampleUrl: voice.samples[0]?.audio ?? null,
    sampleText: voice.samples[0]?.text ?? null,
    sourceLabelKey: 'voiceCardFishAudio',
  }
}

/**
 * 这张卡是不是克隆来的。
 *
 * ⚠ 判据只有这一个：**有参考音频 = 克隆卡**。收藏与克隆同属 VoiceCard，靠它
 * 分流；Prisma schema 的 `VoiceCard.sampleAudioUrl` 注释钉的是同一条。别再写
 * 第二份。
 */
export function isClonedVoiceCard(card: VoiceCardRecord): boolean {
  return Boolean(card.referenceAudioUrl)
}

export interface UseVoiceLibraryOptions {
  /**
   * 一张收藏卡被取消收藏之后。宿主拿它清自己的选中态——内核不认识任何域的
   * 「当前选的是谁」，画布要 `dispatch(SET_VOICE_CARD_ID, null)`，配音间要看
   * 班底里有没有它，这两件事都不该长在这里。
   */
  onFavoriteRemoved?: (cardId: string) => void
  enabled?: boolean
}

export interface UseVoiceLibraryReturn {
  tab: VoiceLibraryTab
  setTab: (tab: VoiceLibraryTab) => void

  /** 公开库（当前页）。 */
  publicVoices: VoiceAsset[]
  total: number
  page: number
  setPage: (page: number) => void
  search: string
  setSearch: (value: string) => void
  language: VoiceLibraryLanguage
  setLanguage: (value: VoiceLibraryLanguage) => void
  sortBy: VoiceLibrarySortBy
  setSortBy: (value: VoiceLibrarySortBy) => void

  /** 我的卡，已按 `referenceAudioUrl` 分流。 */
  favorites: VoiceCardRecord[]
  cloned: VoiceCardRecord[]
  cards: VoiceCardRecord[]
  refreshCards: () => Promise<void>

  /** 这副公开嗓子收藏过没有——收藏过就返回那张卡。 */
  favoriteCardOf: (asset: VoiceAsset) => VoiceCardRecord | null
  /**
   * 收藏 / 取消收藏。
   *
   * 返回值是**这次操作产出的那张卡**（取消收藏与失败都返回 null）。调用方需要它
   * 的话必须用返回值，不能 await 完再去读 `favoriteCardOf`——那是过期闭包，见实现处。
   */
  toggleFavorite: (asset: VoiceAsset) => Promise<VoiceCardRecord | null>
  /** 正在收藏/取消的那一项的 `VoiceAsset.id`，用来给按钮上转圈。 */
  favoritePendingId: string | null

  isLoading: boolean
  /** 正在把下一页**追加**到列表尾巴上（触底扩载）；首屏加载走 `isLoading`。 */
  isLoadingMore: boolean
  /** 后面还有没有。翻页式的宿主用 `total` 自己算，扩载式的直接看这个。 */
  hasMore: boolean
  /**
   * 再要一页，**追加**而不是替换。
   *
   * ⚠ 和 `setPage` 是两种语义，别混着用：`setPage` 是翻页（换掉整屏，`VoiceSelector`
   * 的上一页/下一页走它），`loadMore` 是往下接（配音间的选角面板走它）。
   * 换筛选条件时两者都会回到第一页并整屏替换。
   */
  loadMore: () => void
  error: string | null
  clearError: () => void
}

export function useVoiceLibrary(
  options?: UseVoiceLibraryOptions,
): UseVoiceLibraryReturn {
  const t = useTranslations('StudioPage')
  const enabled = options?.enabled ?? true
  const onFavoriteRemoved = options?.onFavoriteRemoved
  const voiceCards = useVoiceCards({ enabled })

  const [tab, setTabState] = useState<VoiceLibraryTab>('public')
  const [publicVoices, setPublicVoices] = useState<VoiceAsset[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  /**
   * 存的是**文案键**，不是译好的句子——见下方 `t` 的注释。译文在 return 之前才生成。
   */
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [favoritePendingId, setFavoritePendingId] = useState<string | null>(
    null,
  )
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [language, setLanguageState] = useState<VoiceLibraryLanguage>('all')
  const [sortBy, setSortByState] = useState<VoiceLibrarySortBy>('score')

  /** 过期响应的守卫：只认最后一次发出的请求。 */
  const requestIdRef = useRef(0)

  /**
   * 下一份响应是**追加**还是**替换**。
   *
   * 只有 `loadMore()` 会把它置为 true，而且用完即焚——换筛选、换分栏、翻页
   * 一律是替换。放 ref 不放 state：它不参与渲染，进 state 只会多一轮无谓重绘，
   * 还会把 `fetchVoices` 的依赖搅进来。
   */
  const appendNextRef = useRef(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  /**
   * ⚠ `t` **不能进 `fetchVoices` 的依赖**，哪怕它在里面被用到。
   *
   * `useTranslations()` 每次调用返回的是**新函数**，把它放进 deps 会让
   * `fetchVoices` 每渲染重建 → effect 每渲染重跑 → 发一个新请求把上一个挤成过期
   * → 上一个的响应撞上竞态守卫直接 return（不碰 loading）→ **`isLoading` 永远回不到
   * false，列表永远停在骨架**。2026-08-30 实测：`VoiceSelector.test.tsx` 里
   * `useTranslations` 被 mock 成 `() => (key) => key`（引用每次都变），四个「公开音色」
   * 用例因此全部卡在 loading 直到 waitFor 超时——而超时空转又把 vitest worker 拖垮，
   * 表现成「这个测试文件跑不完」。
   *
   * 修法不是把 `t` 藏进 ref（那要在渲染期写 ref，`react-hooks/refs` 会拦），而是
   * **让这条链路根本不需要它**：state 里存文案键，翻译推迟到 return 之前。数据层
   * 只认数据，`t` 于是彻底离开所有依赖数组。
   */

  const fetchVoices = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!enabled || tab !== 'public') {
      setPublicVoices([])
      setTotal(0)
      setErrorKey(null)
      setIsLoading(false)
      return
    }

    /*
     * ⚠ 第一页**永远是替换**，哪怕标记还立着。`loadMore()` 之后紧接着改筛选，
     * 筛选会把 page 拨回 1 而标记还没被消费——不加这道闸，第一页的结果就会被
     * 追加到上一套筛选的列表尾巴上。
     */
    const append = appendNextRef.current && page > 1
    appendNextRef.current = false
    if (append) setIsLoadingMore(true)
    else setIsLoading(true)
    setErrorKey(null)
    const result = await listVoicesAPI({
      page,
      pageSize: VOICE_LIBRARY_PAGE_SIZE,
      search: debouncedSearch || undefined,
      language: language === 'all' ? undefined : language,
      sortBy,
    })
    if (requestIdRef.current !== requestId) return

    if (result.success && result.data) {
      const items = result.data.items.map(mapFishVoiceToAsset)
      setPublicVoices((current) => {
        if (!append) return items
        /*
         * ⚠ 追加要去重。上游按热度排序，两次请求之间榜单会动，同一副嗓子完全
         * 可能既在第 1 页尾巴又在第 2 页开头——不去重就会出现两张一模一样的卡，
         * 而且 React 的 key 会撞。
         */
        const seen = new Set(current.map((asset) => asset.id))
        return [...current, ...items.filter((asset) => !seen.has(asset.id))]
      })
      setTotal(result.data.total)
    } else {
      // 扩载失败只报错，**不清空已经看到的那些**——把用户滚了半天的列表抹掉，
      // 比多一行错误提示糟得多。
      if (!append) {
        setPublicVoices([])
        setTotal(0)
      }
      setErrorKey(
        result.errorCode === VOICE_API_ERROR_CODES.MISSING_API_KEY
          ? 'voiceApiKeyRequired'
          : 'voiceLoadFailed',
      )
    }
    setIsLoading(false)
    setIsLoadingMore(false)
    // ⚠ 依赖里**没有 `t`**，而且不该有——见上方注释。
  }, [enabled, tab, page, debouncedSearch, language, sortBy])

  /**
   * ⚠ 台账 F（owner 2026-08-29 真机）：这里原先是
   * `requestAnimationFrame(() => void fetchVoices())`，症状是「改语言筛选 / 输入
   * 搜索词，列表不变且**零网络请求**，关掉弹窗重开才生效」。
   *
   * 根因是 rAF 本身：**标签页不可见时浏览器完全冻结 rAF 回调**。owner 的复现路径
   * 恰好踩中——改完筛选没结果，切去 fish.audio 官网查音色 ID，回来还是老列表：
   * 那次请求的回调从被切走的那一刻起就再也没跑过。窗口失焦、后台标签、以及组件
   * 每帧重渲染（cleanup 不断 cancel 掉上一帧）都是同一类失败。
   *
   * **拉数据没有任何理由等一个绘制帧**。直接发，用 `requestIdRef` 序号丢弃过期
   * 响应（那道竞态守卫就在 `fetchVoices` 里）。
   */
  useEffect(() => {
    /**
     * ⚠ `react-hooks/set-state-in-effect` 在这里**说的是实话，但这一处是它要
     * 放行的那类**：`fetchVoices` 第一件事是 `setIsLoading(true)`，那正是
     * 「筛选变了 → 立刻出加载态」，一次有意的重渲染，不是级联。
     *
     * ⛔ 别把它包回 `requestAnimationFrame` 来消掉这条 lint（见上），也别改成
     * `Promise.resolve().then(...)` 之类只为绕开规则的嵌套——规则不穿透嵌套函数
     * 是**盲区不是许可**。
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchVoices()
  }, [fetchVoices])

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [search])

  const setTab = useCallback(
    (next: VoiceLibraryTab) => {
      if (next === tab) return
      setTabState(next)
      setPage(1)
      setPublicVoices([])
      setTotal(0)
      setErrorKey(null)
    },
    [tab],
  )

  // 筛选变了就回第一页——留在原页码上会看到「空结果」而其实是页数不够。
  const setLanguage = useCallback((value: VoiceLibraryLanguage) => {
    setLanguageState(value)
    setPage(1)
  }, [])

  const setSortBy = useCallback((value: VoiceLibrarySortBy) => {
    setSortByState(value)
    setPage(1)
  }, [])

  const favoriteCardOf = useCallback(
    (asset: VoiceAsset): VoiceCardRecord | null =>
      voiceCards.cards.find(
        (card) =>
          card.voiceId === asset.voiceId && card.provider === asset.provider,
      ) ?? null,
    [voiceCards.cards],
  )

  const toggleFavorite = useCallback(
    async (asset: VoiceAsset): Promise<VoiceCardRecord | null> => {
      const existingCard = favoriteCardOf(asset)

      setFavoritePendingId(asset.id)
      setErrorKey(null)

      // 分开两条路而不是合成一个联合结果：只有新建那条会产出卡片，
      // 合起来写就得靠类型断言把 `data` 挖出来。
      const created = existingCard
        ? null
        : await createVoiceCardAPI({
            name: asset.title,
            provider: asset.provider,
            modelId: asset.modelId,
            voiceId: asset.voiceId,
            coverImage: asset.coverImage ?? undefined,
            tone: [],
            pace: VOICE_CARD_DEFAULT_PACE,
            pronunciationDictionary: {},
            // 收藏必须把示例音频一起带走。此前只存了 sampleText，音频当场丢掉，
            // 于是「收藏 → 从收藏 tab 选中」得到的节点只有 voiceId、没有任何音频，
            // 拿它当视频的参考音频时静默发不出去（真机四张卡全中）。
            // ⚠ 不能写进 referenceAudioUrl —— 那是克隆 tab 的分流判据。
            sampleAudioUrl: asset.sampleUrl ?? undefined,
            sampleText: asset.sampleText ?? undefined,
          })
      const result = existingCard
        ? await deleteVoiceCardAPI(existingCard.id)
        : created!

      if (result.success) {
        if (existingCard) onFavoriteRemoved?.(existingCard.id)
        await voiceCards.refresh()
      } else {
        setErrorKey('voiceFavoriteFailed')
      }

      setFavoritePendingId(null)

      /*
       * ⚠ 收藏成功时**把那张卡还给调用方**，别让它 await 完再回头去读
       * `favoriteCardOf`。
       *
       * 那是个闭包读：调用方手里的 `favoriteCardOf` 捕获的是**发起这次操作那一刻**
       * 的卡列表，`voiceCards.refresh()` 之后的新卡它根本看不见，永远返回 null。
       * 2026-08-30 真机撞到：配音间「请进房间」把音色收藏成功了，但班底一动不动——
       * 因为拿不到刚建出来的那张卡就静默 return 了。
       */
      if (!result.success || existingCard) return null
      return created?.data ?? null
    },
    [favoriteCardOf, onFavoriteRemoved, voiceCards],
  )

  const { favorites, cloned } = useMemo(() => {
    const favs: VoiceCardRecord[] = []
    const clones: VoiceCardRecord[] = []
    for (const card of voiceCards.cards) {
      if (isClonedVoiceCard(card)) clones.push(card)
      else favs.push(card)
    }
    return { favorites: favs, cloned: clones }
  }, [voiceCards.cards])

  const hasMore = publicVoices.length < total

  const loadMore = useCallback(() => {
    appendNextRef.current = true
    setPage((current) => current + 1)
  }, [])

  const clearError = useCallback(() => setErrorKey(null), [])

  const error = errorKey ? t(errorKey) : null

  return {
    tab,
    setTab,
    publicVoices,
    total,
    page,
    setPage,
    search,
    setSearch,
    language,
    setLanguage,
    sortBy,
    setSortBy,
    favorites,
    cloned,
    cards: voiceCards.cards,
    refreshCards: voiceCards.refresh,
    favoriteCardOf,
    toggleFavorite,
    favoritePendingId,
    /*
     * ⚠ **按当前分栏取**，不是两个一起 or。
     *
     * 合起来的后果很具体：在公开库分栏点一下收藏 → `voiceCards.refresh()` 把
     * 卡片列表置成加载中 → 合并后的 `isLoading` 变 true → 宿主把整屏换成骨架，
     * 看起来就是「收藏一下，音色库整个刷新了一遍」（owner 2026-08-30 真机指出）。
     * 公开列表和我的卡片是两件独立的事，谁在加载只有当前分栏说了算。
     */
    isLoading: tab === 'public' ? isLoading : voiceCards.isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    error: error ?? voiceCards.error,
    clearError,
  }
}
