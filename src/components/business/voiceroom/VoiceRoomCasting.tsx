'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useTranslations } from 'next-intl'

import {
  VOICE_LIBRARY_LANGUAGE_FILTERS,
  VOICE_LIBRARY_SORT_OPTIONS,
  VOICE_TRAIN_MAX_FILES,
  VOICE_TRAIN_MAX_FILE_MB,
  type VoiceLibrarySortBy,
} from '@/constants/voice-cards'
import {
  VOICE_ROOM_FLY_FALLBACK_GRACE_MS as FLY_FALLBACK_GRACE_MS,
  VOICE_ROOM_FLY_MS,
  VOICE_ROOM_LOAD_MORE_THRESHOLD_PX,
  VOICE_ROOM_SPEAKER_KIND,
  VOICE_ROOM_TAB_SWAP_MS,
  VOICE_ROOM_VOICE_CAST_MAX,
} from '@/constants/voiceroom'
import { useVoiceLibrary } from '@/hooks/use-voice-library'
import {
  VOICE_LIBRARY_TABS,
  type VoiceAsset,
  type VoiceLibraryTab,
} from '@/types/voice-library'
import type { VoiceCardRecord } from '@/types'
import type { VoiceRoomCastMember } from '@/types/voiceroom'

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { VoiceTrainer } from '@/components/business/studio/VoiceTrainer'

import { VoiceAvatar, toneIndexOf } from './VoiceAvatar'
import { VoiceCastCard, VoiceCastSkeleton } from './VoiceCastCard'

/**
 * 选角面板 —— 从下方推上来的半屏，三个分栏：音色库 / 收藏的声音 / 克隆的声音。
 *
 * ⭐ 数据全部来自 `useVoiceLibrary` 内核（owner 2026-08-30 选 C：判据与数据一份，
 * 渲染各归各的皮肤）。画布的 `VoiceSelector` 和这里共用它，所以「收藏与克隆同属
 * VoiceCard、靠 `referenceAudioUrl` 分流」这条规则**只有一份实现**，两个域不会长歪。
 * ⛔ 别在这里重写取数、收藏或分流逻辑。
 *
 * 峰值节拍是**飞进托盘**：请进房间时头像从卡片划一道弧线落进底部的班底，落地弹
 * 一下。它把「我刚做的事产生了什么后果」直接画出来了，比在别处冒一句提示强。
 */

const SKELETON_COUNT = 4

/**
 * ⚠ `prefers-reduced-motion` 要**在 JS 里也问一遍**。
 *
 * `voiceroom.css` 末尾那条媒体查询能关掉所有 CSS 动画与过渡，但飞行是
 * `element.animate()` 走的 Web Animations——它完全不受那条 CSS 约束。只靠 CSS
 * 兜底，等于对着明确要求「别动」的用户照飞不误。
 */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface VoiceRoomCastingProps {
  cast: VoiceRoomCastMember[]
  onClose: () => void
  onCastChange: (cast: VoiceRoomCastMember[]) => void
}

export function VoiceRoomCasting({
  cast,
  onClose,
  onCastChange,
}: VoiceRoomCastingProps) {
  const t = useTranslations('VoiceRoom')
  const library = useVoiceLibrary()

  const [swapping, setSwapping] = useState(false)
  const [landedId, setLandedId] = useState<string | null>(null)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [ink, setInk] = useState<{ left: number; width: number } | null>(null)
  const [cloning, setCloning] = useState(false)

  const trayRef = useRef<HTMLSpanElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const tabsRef = useRef<HTMLSpanElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef(0)

  const castIds = new Set(cast.map((member) => member.id))
  const voiceCount = cast.filter(
    (member) => member.kind === VOICE_ROOM_SPEAKER_KIND.VOICE,
  ).length
  const castFull = voiceCount >= VOICE_ROOM_VOICE_CAST_MAX

  /** Esc 关面板——半屏浮层的通用期待。 */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  /* ── 试听：点脸即听，环形进度 ─────────────────────────────────── */

  const stopPreview = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    audioRef.current?.pause()
    audioRef.current = null
    setPreviewId(null)
    setProgress(0)
  }, [])

  // 面板关掉 / 组件卸载时把声音掐了，免得面板没了嗓子还在响。
  useEffect(() => stopPreview, [stopPreview])

  const togglePreview = (id: string, url: string) => {
    if (previewId === id) {
      stopPreview()
      return
    }
    stopPreview()
    const audio = new Audio(url)
    audioRef.current = audio
    setPreviewId(id)
    audio.addEventListener('ended', stopPreview)
    void audio.play()

    /*
     * 进度靠 rAF 读 `currentTime`，不用 `timeupdate`：那个事件每 250ms 才来一次，
     * 环会一格一格地跳。看不见的标签页里 rAF 冻结，那也正是没人看这个环的时候。
     */
    const tick = () => {
      const node = audioRef.current
      if (node?.duration) {
        setProgress(Math.min(1, node.currentTime / node.duration))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  /* ── 分栏：墨条 + 内容交接 ────────────────────────────────────── */

  /**
   * 墨条挪到当前分栏底下。
   *
   * ⚠ 每次都重新量，不缓存：分栏标题里带计数（「收藏的声音 · 3」），收藏一下按钮
   * 就变宽，缓存下来的位置立刻错位。
   */
  const measureInk = useCallback(() => {
    const active = tabsRef.current?.querySelector<HTMLElement>(
      '.vr-tab[data-active="true"]',
    )
    if (!active) return
    setInk({ left: active.offsetLeft, width: active.offsetWidth })
  }, [])

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 量的是布局，只有渲染完才量得到；这正是 layout effect 存在的理由
    measureInk()
  }, [measureInk, library.tab, library.favorites.length, library.cloned.length])

  const switchTab = (next: VoiceLibraryTab) => {
    if (next === library.tab) return
    stopPreview()
    setSwapping(true)
    // 旧内容先退 120ms，新内容再按 20ms/张接力进来——直接重画会「啪」地跳。
    window.setTimeout(() => {
      library.setTab(next)
      setSwapping(false)
    }, VOICE_ROOM_TAB_SWAP_MS)
  }

  /* ── 请进房间：头像飞进托盘 ───────────────────────────────────── */

  /**
   * 峰值时刻：头像从卡片划一道弧线飞进班底托盘。
   *
   * 用 Web Animations 而不是 CSS：起点终点都要**当场量**（卡片在网格里的位置、
   * 托盘的位置都随内容变），写不成静态关键帧。中途 `offset: 0.55` 那个控制点把
   * 直线掰成弧——直着飞过去像个 bug，弧线才像「被放进去」。
   */
  const flyToTray = (
    fromNode: HTMLElement | null,
    member: VoiceRoomCastMember,
  ) => {
    const commit = () => {
      onCastChange([...cast, member])
      setLandedId(member.id)
      setJoiningId(null)
    }

    const tray = trayRef.current
    // 没法量（节点没了）、环境不支持 WAAPI、或用户要求减少动效：直接落地。
    // 动效是锦上添花，不是「这个人有没有进班底」的前提。
    if (
      !fromNode ||
      !tray ||
      typeof fromNode.animate !== 'function' ||
      prefersReducedMotion()
    ) {
      commit()
      return
    }

    const from = fromNode.getBoundingClientRect()
    const to = tray.getBoundingClientRect()
    const flier = document.createElement('span')
    // 同时戴 `.vr-avatar`：8 档色的渐变是字面色值，body 上也成立——飞过去的那张脸
    // 和落地后的那张因此一定同色（见 voiceroom.css 里 `.vr-flier` 的注释）。
    flier.className = 'vr-avatar vr-flier'
    flier.dataset.tone = String(toneIndexOf(member.id))
    flier.textContent = [...member.name][0] ?? '?'
    flier.style.left = `${from.left}px`
    flier.style.top = `${from.top}px`
    flier.style.width = `${from.width}px`
    flier.style.height = `${from.height}px`
    document.body.appendChild(flier)

    const dx = to.right + 8 - from.left - from.width / 2
    const dy = to.top + to.height / 2 - from.top - from.height / 2
    const scale = 30 / from.width
    const animation = flier.animate(
      [
        { transform: 'translate(0, 0) scale(1)' },
        {
          transform: `translate(${dx * 0.55}px, ${dy * 0.5 - 46}px) scale(${
            (1 + scale) / 2
          })`,
          offset: 0.55,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
      ],
      { duration: VOICE_ROOM_FLY_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
    /**
     * ⚠ 落地**只能发生一次**，而且**必须发生**。
     *
     * 三条路都要通向它：正常播完、被打断（面板关掉）、以及动画根本没跑起来——
     * 标签页切到后台时 WAAPI 会被暂停，`onfinish` 可能永远不来，那样用户点的
     * 「请进房间」就凭空消失了。兜底定时器保证班底一定会更新，动效没看到无所谓。
     */
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      flier.remove()
      commit()
    }
    animation.onfinish = settle
    animation.oncancel = settle
    window.setTimeout(settle, VOICE_ROOM_FLY_MS + FLY_FALLBACK_GRACE_MS)
  }

  /**
   * 公开库的嗓子要先落成一张 VoiceCard 才能进班底——班底成员的 id **就是**
   * voiceCardId。收藏这个动作正好产出那张卡，所以「请进房间」隐含一次收藏。
   */
  const joinAsset = async (asset: VoiceAsset, node: HTMLElement | null) => {
    setJoiningId(asset.id)
    // ⚠ 新建的那张卡只能从**返回值**拿：await 之后再读 `favoriteCardOf` 是过期闭包。
    const card =
      library.favoriteCardOf(asset) ?? (await library.toggleFavorite(asset))
    if (!card) {
      // 收藏失败（错误已经由内核填进 `library.error`），别把按钮永远卡在「加入中」。
      setJoiningId(null)
      return
    }
    flyToTray(node, {
      id: card.id,
      kind: VOICE_ROOM_SPEAKER_KIND.VOICE,
      name: card.name,
      coverImage: card.coverImage,
    })
  }

  const joinCard = (card: VoiceCardRecord, node: HTMLElement | null) => {
    setJoiningId(card.id)
    flyToTray(node, {
      id: card.id,
      kind: VOICE_ROOM_SPEAKER_KIND.VOICE,
      name: card.name,
      coverImage: card.coverImage,
    })
  }

  /* ── 触底扩载 ─────────────────────────────────────────────────── */

  const onGridScroll = () => {
    const node = gridRef.current
    if (!node || library.tab !== 'public') return
    if (library.isLoading || library.isLoadingMore || !library.hasMore) return
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight
    if (remaining <= VOICE_ROOM_LOAD_MORE_THRESHOLD_PX) library.loadMore()
  }

  /* ── 渲染 ─────────────────────────────────────────────────────── */

  const tabCount = (tab: VoiceLibraryTab) => {
    if (tab === 'favorites') return library.favorites.length
    if (tab === 'cloned') return library.cloned.length
    return 0
  }

  const publicCards = library.publicVoices.map((asset, index) => {
    const card = library.favoriteCardOf(asset)
    const sample = asset.sampleUrl
    return (
      <VoiceCastCard
        key={asset.id}
        id={asset.voiceId}
        name={asset.title}
        cover={asset.coverImage}
        tags={[...asset.languages, ...asset.tags].slice(0, 3).join(' · ')}
        index={index}
        playing={previewId === asset.id}
        progress={progress}
        joined={Boolean(card && castIds.has(card.id))}
        joining={joiningId === asset.id}
        full={castFull}
        onPreview={sample ? () => togglePreview(asset.id, sample) : null}
        onJoin={(node) => void joinAsset(asset, node)}
        favorite={{
          on: Boolean(card),
          pending: library.favoritePendingId === asset.id,
          onToggle: () => void library.toggleFavorite(asset),
        }}
      />
    )
  })

  const localCards = (
    library.tab === 'cloned' ? library.cloned : library.favorites
  ).map((card, index) => {
    const sample = card.sampleAudioUrl ?? card.referenceAudioUrl
    return (
      <VoiceCastCard
        key={card.id}
        id={card.id}
        name={card.name}
        cover={card.coverImage}
        tags={[card.gender, card.age, ...card.tone].filter(Boolean).join(' · ')}
        index={index}
        playing={previewId === card.id}
        progress={progress}
        joined={castIds.has(card.id)}
        joining={joiningId === card.id}
        full={castFull}
        onPreview={sample ? () => togglePreview(card.id, sample) : null}
        onJoin={(node) => joinCard(card, node)}
        favorite={null}
      />
    )
  })

  /**
   * 克隆分栏的第一张是**入口卡**，不是一副嗓子。
   *
   * 这个分栏此前是纯空态——它本来就该是「传几段音频，训练出一副能用的嗓子」的
   * 地方（owner 2026-08-30 指出）。虚线边框把它和真嗓子区分开：这是个动作。
   */
  const cloneEntry = (
    <button
      key="clone-new"
      type="button"
      className="vr-vc vr-vc-new"
      style={{ '--vr-d': 0 } as React.CSSProperties}
      onClick={() => setCloning(true)}
    >
      <span className="vr-vc-new-plus" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path d="M7 0v14M0 7h14" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
      <span className="vr-vc-new-t">{t('cloneNew')}</span>
      <span className="vr-vc-new-s">
        {t('cloneNewHint', {
          files: VOICE_TRAIN_MAX_FILES,
          mb: VOICE_TRAIN_MAX_FILE_MB,
        })}
      </span>
    </button>
  )

  const cards =
    library.tab === 'public'
      ? publicCards
      : library.tab === 'cloned'
        ? [cloneEntry, ...localCards]
        : localCards
  const emptyKey =
    library.tab === 'public'
      ? 'noVoicesFound'
      : library.tab === 'cloned'
        ? 'noClonedVoices'
        : 'noFavoriteVoices'

  return (
    <div
      className="vr-caster-scrim"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="vr-caster"
        role="dialog"
        aria-modal="true"
        aria-label={t('casting')}
      >
        <div className="vr-caster-head">
          <span className="vr-caster-title">{t('casting')}</span>

          <span className="vr-tabs" ref={tabsRef}>
            {VOICE_LIBRARY_TABS.map((tab) => {
              const count = tabCount(tab)
              return (
                <button
                  key={tab}
                  type="button"
                  className="vr-tab"
                  data-active={library.tab === tab}
                  onClick={() => switchTab(tab)}
                >
                  {t(`tab.${tab}`)}
                  {count > 0 ? ` · ${count}` : ''}
                </button>
              )
            })}
            {/*
             * 墨条：一根共用的指示条在三个分栏之间**滑过去**。各自开关下边框只能
             * 表达「谁亮着」，滑动还能表达「我从哪来、到哪去」。
             */}
            <span
              className="vr-tab-ink"
              aria-hidden
              style={
                ink
                  ? { transform: `translateX(${ink.left}px)`, width: ink.width }
                  : { opacity: 0 }
              }
            />
          </span>

          <button type="button" className="vr-caster-close" onClick={onClose}>
            ✕ {t('close')}
          </button>
        </div>

        {library.tab === 'public' ? (
          <div className="vr-caster-tools">
            <input
              className="vr-search"
              value={library.search}
              onChange={(event) => library.setSearch(event.target.value)}
              placeholder={t('searchVoices')}
              aria-label={t('searchVoices')}
            />

            {/* 语言筛选走服务端（`/api/voices` 直接支持），不是切完再过滤。 */}
            <div className="vr-filters" role="group" aria-label={t('language')}>
              {VOICE_LIBRARY_LANGUAGE_FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className="vr-filter"
                  data-active={library.language === item.value}
                  onClick={() => library.setLanguage(item.value)}
                >
                  {t(`lang.${item.value}`)}
                </button>
              ))}
            </div>

            <select
              className="vr-sort"
              value={library.sortBy}
              onChange={(event) =>
                library.setSortBy(event.target.value as VoiceLibrarySortBy)
              }
              aria-label={t('sortBy')}
            >
              {VOICE_LIBRARY_SORT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {t(`sort.${item.value}`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div
          className="vr-caster-grid"
          ref={gridRef}
          data-swapping={swapping || undefined}
          onScroll={onGridScroll}
        >
          {library.isLoading ? (
            Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <VoiceCastSkeleton key={`skel-${index}`} index={index} />
            ))
          ) : library.error ? (
            <p className="vr-caster-state">{library.error}</p>
          ) : (
            <>
              {cards}
              {library.isLoadingMore
                ? Array.from({ length: SKELETON_COUNT }, (_, index) => (
                    <VoiceCastSkeleton key={`more-${index}`} index={index} />
                  ))
                : null}
              {localCards.length === 0 && library.tab !== 'public' ? (
                <p className="vr-caster-state">{t(emptyKey)}</p>
              ) : null}
              {publicCards.length === 0 && library.tab === 'public' ? (
                <p className="vr-caster-state">{t(emptyKey)}</p>
              ) : null}
              {library.tab === 'public' &&
              !library.hasMore &&
              cards.length > 0 ? (
                <p className="vr-caster-end">{t('listEnd')}</p>
              ) : null}
            </>
          )}
        </div>

        {/* 班底托盘：飞行的终点，也是「这个房间现在有谁」的唯一答案。 */}
        <div className="vr-caster-tray" data-bump={landedId ?? undefined}>
          <span className="vr-tray-label">{t('castLabel')}</span>
          <span className="vr-tray-avas" ref={trayRef}>
            {cast.map((member) => (
              <span
                key={member.id}
                className="vr-tray-ava"
                data-land={member.id === landedId || undefined}
                title={member.name}
              >
                <VoiceAvatar
                  id={member.id}
                  name={member.name}
                  cover={member.coverImage}
                  kind={member.kind}
                  size="s"
                />
              </span>
            ))}
          </span>
          <span className="vr-tray-count">
            {t('castCount', {
              count: voiceCount,
              max: VOICE_ROOM_VOICE_CAST_MAX,
            })}
          </span>
          <button type="button" className="vr-caster-done" onClick={onClose}>
            {t('done')}
          </button>
        </div>
      </div>

      {/*
       * ⭐ 直接用工作台那个 `VoiceTrainer`，不另写一套上传/转写/建模。
       * 它 2026-08-30 才从 StudioContext 解绑（原先直接 dispatch 选中态），
       * 现在只回一个 `onCreated`，两个域都能挂。
       */}
      <ResponsiveDialog open={cloning} onOpenChange={setCloning}>
        <ResponsiveDialogContent className="vr-clone-dialog !max-w-xl">
          <ResponsiveDialogTitle>{t('cloneNew')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            {t('cloneNew')}
          </ResponsiveDialogDescription>
          <VoiceTrainer
            onCreated={() => {
              // 新卡靠内核统一刷新——克隆分栏的分流判据只有一份。
              void library.refreshCards()
              setCloning(false)
            }}
          />
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  )
}
