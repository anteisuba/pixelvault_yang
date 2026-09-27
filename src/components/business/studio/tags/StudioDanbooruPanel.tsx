'use client'

import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'

import { ChevronLeft, RefreshCw, Search } from '@/components/icons'
import { DURATION_MS, EASE_STANDARD, TAG_ADD_ACK_MS } from '@/constants/motion'
import { DANBOORU_REQUEST } from '@/constants/research'
import { useStudioForm, useStudioGen } from '@/contexts/studio-context'
import { useDanbooruCatalog } from '@/hooks/use-danbooru-catalog'
import { useIsMobile } from '@/hooks/use-mobile'
import { useNovelAiCharacters } from '@/hooks/use-novelai-characters'
import { flashTagTarget } from '@/hooks/use-tag-target-flash'
import { parseTagChips, serializeTagChips } from '@/lib/tag-composer'
import {
  addLookupTags,
  artistPromptTag,
  compactPostCount,
  danbooruPostsUrl,
  danbooruPostUrl,
  danbooruTagSearchUrl,
  displayDanbooruTag,
  hasTag,
  lookupAliasLine,
  toggleArtistTag,
} from '@/lib/tag-lookup'
import { cn } from '@/lib/utils'
import type {
  DanbooruCatalog,
  DanbooruCatalogCandidate,
  DanbooruCatalogKind,
} from '@/types/danbooru-catalog'
import { Button } from '@/components/ui/button'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  LookupGuide,
  LookupRows,
  LookupSay,
  LookupSkeletonRows,
} from './lookup/LookupList'
import {
  LookupAddButton,
  LookupBlank,
  LookupDetailSkeleton,
  LookupHead,
  LookupRef,
  LookupSection,
  LookupShots,
  LookupTagToggle,
  type LookupShot,
} from './lookup/LookupDetail'

/** 加到哪：整体 · 第几位角色 · 新建一位。 */
type LookupTarget = 'whole' | 'new' | number

const CHARACTER_TRAIT_LIMIT = 12
const ARTIST_REF_LIMIT = 8
/** 别名那一行只留前几个：排在前面的是各语言的正名，后面常混进梗名。 */
const ALIAS_LIMIT = 4

const PHONE_ICON_BUTTON_CLASS =
  'grid size-11 shrink-0 place-items-center rounded-xl text-foreground/75 transition-colors duration-fast ease-linear active:bg-surface-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** 按钮上那句「已加进整体 ✓」停 1.2s 再退回（动效表）。 */
function useAck() {
  const [acked, setAcked] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return {
    acked,
    ack: () => {
      setAcked(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setAcked(false), TAG_ADD_ACK_MS)
    },
    clear: () => {
      clearTimeout(timer.current)
      setAcked(false)
    },
  }
}

/** 换词重搜时旧列表原地留着（动效表），⛔ 每打一个字就刷成骨架。 */
function shownData(result: {
  data?: DanbooruCatalog
  previous?: DanbooruCatalog
  loading: boolean
}) {
  return result.data ?? (result.loading ? result.previous : undefined)
}

/**
 * 查资料（标签台，owner 2026-09-27 选 B「左边列表，右边常驻详情」，画板
 * 「查资料 B · 全部状态」）。两页：**角色 | 画风**，各自记住搜索词与选中项。
 *
 * - 一搜就选中第一个（作品最多的），右边直接出详情；停手 300ms 才查。
 * - 角色：角色名默认选上，常见特征点选；加到 整体 / 角色 N / ＋新角色，默认跟着输入框
 *   当前那一页；模型没有角色构图就只剩整体。已在目标里的不重复加。
 * - 画风：随便看看（作品多的画师里随机抽）+ 换一批 + 搜画师；加入 = `artist:名字`
 *   放在正向标签最前面，是开关。「常画的」只是参考，⛔ 不跟着加。
 * - 这一页查不到而另一页有：说「它是画师 / 角色」，点了带着同一个词过去。
 * - 手机：左右放不下，列表一页、点一行推进详情页，「加到哪 + 加入」钉在底部。
 */
export function StudioDanbooruPanel({
  onClose,
  headingRef,
}: {
  onClose: () => void
  /** 打开时给读屏一个落点（宿主负责落焦点与滚到看得见）。 */
  headingRef?: Ref<HTMLHeadingElement>
}) {
  const t = useTranslations('StudioTags.lookup')
  const tWorkbench = useTranslations('StudioTags.workbench')
  const locale = useLocale()
  const phone = useIsMobile()
  const reducedMotion = useReducedMotion()
  const { state, dispatch } = useStudioForm()
  const { isGenerating } = useStudioGen()
  const characters = useNovelAiCharacters()
  const { acked, ack, clear } = useAck()

  const [tab, setTab] = useState<DanbooruCatalogKind>('character')
  const [charQuery, setCharQuery] = useState('')
  const [artistQuery, setArtistQuery] = useState('')
  const [artistVisited, setArtistVisited] = useState(false)
  const [round, setRound] = useState(0)
  const [charPick, setCharPick] = useState<string | null>(null)
  const [artistPick, setArtistPick] = useState<string | null>(null)
  const [selection, setSelection] = useState<{
    pick: string
    tags: string[]
  } | null>(null)
  const [target, setTarget] = useState<LookupTarget | null>(null)
  const [phoneDetail, setPhoneDetail] = useState(false)

  const charText = charQuery.trim()
  const artistText = artistQuery.trim()
  const charList = useDanbooruCatalog(
    charText.length >= 2 ? { kind: 'character', query: charText } : null,
  )
  const artistList = useDanbooruCatalog(
    !artistVisited
      ? null
      : artistText.length >= 2
        ? { kind: 'artist', query: artistText }
        : { kind: 'artist', random: true, round },
  )
  const charData = shownData(charList)
  // ⚠ 换一批是整批换掉：左右都出骨架（画板「画风 · 换一批中」），⛔ 旧的一批留着。
  const artistData =
    artistText.length >= 2 ? shownData(artistList) : artistList.data
  const charCandidates = charData?.candidates ?? []
  const artistCandidates = artistData?.candidates ?? []
  const pickIn = (
    list: readonly DanbooruCatalogCandidate[],
    name: string | null,
  ) => list.find((item) => item.name === name) ?? list[0] ?? null
  const charCandidate = pickIn(charCandidates, charPick)
  const artistCandidate = pickIn(artistCandidates, artistPick)
  const charDetail = useDanbooruCatalog(
    charCandidate ? { kind: 'character', tag: charCandidate.name } : null,
  )
  const artistDetail = useDanbooruCatalog(
    artistCandidate ? { kind: 'artist', tag: artistCandidate.name } : null,
  )

  const posts = (count: number) =>
    t('posts', { count: compactPostCount(count, locale) })
  const chosen = charCandidate
    ? selection?.pick === charCandidate.name
      ? selection.tags
      : [charCandidate.name]
    : []

  // ── 加到哪 ─────────────────────────────────────────────────────
  const composition = Boolean(characters.mode)
  const canAddCharacter =
    composition && characters.characters.length < characters.max
  const followPage =
    composition &&
    characters.activeIndex !== null &&
    characters.activeIndex < characters.characters.length
      ? characters.activeIndex
      : 'whole'
  const wanted = target ?? followPage
  const resolvedTarget: LookupTarget = !composition
    ? 'whole'
    : typeof wanted === 'number' && wanted >= characters.characters.length
      ? 'whole'
      : wanted === 'new' && !canAddCharacter
        ? 'whole'
        : wanted
  const targetName = (value: LookupTarget) =>
    value === 'whole'
      ? t('targetWhole')
      : value === 'new'
        ? t('targetNewName')
        : tWorkbench('characterNumber', { number: value + 1 })
  const targetItems = [
    { value: 'whole', label: t('targetWhole') },
    ...characters.characters.map((_, index) => ({
      value: String(index),
      label: tWorkbench('characterNumber', { number: index + 1 }),
    })),
    ...(canAddCharacter ? [{ value: 'new', label: t('targetNew') }] : []),
  ]

  const addCharacterTags = () => {
    if (!chosen.length || isGenerating) return
    const incoming = chosen.map(displayDanbooruTag)
    if (resolvedTarget === 'whole') {
      dispatch({
        type: 'SET_TAG_CHIPS',
        payload: {
          polarity: 'positive',
          chips: addLookupTags(state.tagChips, incoming),
        },
      })
    } else if (resolvedTarget === 'new') {
      const index = characters.addWithPrompt(incoming.join(', '))
      if (index !== null) {
        flashTagTarget(index)
        // 接着加就加到刚建的那一位，⛔ 再建一位。
        setTarget(index)
      }
    } else {
      const character = characters.characters[resolvedTarget]
      if (!character) return
      characters.update(resolvedTarget, {
        prompt: serializeTagChips(
          addLookupTags(parseTagChips(character.prompt), incoming),
        ),
      })
      flashTagTarget(resolvedTarget)
    }
    ack()
  }

  const toggleArtist = (name: string) => {
    if (isGenerating) return
    dispatch({
      type: 'SET_TAG_CHIPS',
      payload: {
        polarity: 'positive',
        chips: toggleArtistTag(state.tagChips, artistPromptTag(name)),
      },
    })
  }

  // ── 换页 / 跨页 ────────────────────────────────────────────────
  const switchTab = (next: DanbooruCatalogKind) => {
    setTab(next)
    setPhoneDetail(false)
    if (next === 'artist') setArtistVisited(true)
  }
  const goArtist = (name: string) => {
    switchTab('artist')
    setArtistQuery(displayDanbooruTag(name))
    setArtistPick(name)
  }
  const goCharacter = (name: string) => {
    switchTab('character')
    setCharQuery(displayDanbooruTag(name))
    setCharPick(name)
  }
  const pick = (name: string) => {
    clear()
    if (tab === 'character') setCharPick(name)
    else setArtistPick(name)
    if (phone) setPhoneDetail(true)
  }

  // ── 左栏 ───────────────────────────────────────────────────────
  const isChar = tab === 'character'
  const list = isChar ? charList : artistList
  const data = isChar ? charData : artistData
  const candidates = isChar ? charCandidates : artistCandidates
  const query = isChar ? charText : artistText
  const randomMode = !isChar && artistText.length < 2
  const guide = isChar && charText.length < 2
  const loadingList = !guide && list.loading && !data
  const errored = !guide && list.error
  const empty = !guide && !loadingList && !errored && data && !candidates.length

  const listTitle = loadingList
    ? isChar
      ? t('searching', { query })
      : randomMode
        ? t('rerolling')
        : t('searching', { query })
    : candidates.length
      ? isChar
        ? t('characterCount', { query, count: candidates.length })
        : randomMode
          ? t('randomTitle', { count: candidates.length })
          : t('artistResults', { query, count: candidates.length })
      : null

  const say = errored
    ? {
        title: t('errorTitle'),
        text: t('errorText'),
        action: { label: t('retry'), onClick: list.retry },
      }
    : empty && data?.crossHint?.kind === 'artist'
      ? {
          title: t('crossToArtistTitle', { query }),
          text: t('crossToArtistText', { posts: posts(data.crossHint.count) }),
          action: {
            label: t('goStyle'),
            onClick: () => goArtist(data.crossHint!.name),
          },
        }
      : empty && data?.crossHint?.kind === 'character'
        ? {
            title: t('crossToCharacterTitle', { query }),
            text: t('crossToCharacterText', {
              posts: posts(data.crossHint.count),
            }),
            action: {
              label: t('goCharacter'),
              onClick: () => goCharacter(data.crossHint!.name),
            },
          }
        : empty
          ? {
              title: isChar
                ? t('noneTitle', { query })
                : t('crossToCharacterTitle', { query }),
              text: isChar ? t('noneText') : t('artistNoneText'),
              link: {
                label: t('searchDanbooru', { query }),
                href: danbooruTagSearchUrl(query),
              },
            }
          : null

  const rows = candidates.map((candidate) => ({
    name: candidate.name,
    label: isChar
      ? displayDanbooruTag(candidate.name)
      : artistPromptTag(candidate.name),
    sub: isChar
      ? candidate.work
        ? t('rowWork', {
            work: displayDanbooruTag(candidate.work),
            posts: posts(candidate.count),
          })
        : posts(candidate.count)
      : t('rowArtist', { posts: posts(candidate.count) }),
    previews: candidate.previews,
    added: !isChar && hasTag(state.tagChips, artistPromptTag(candidate.name)),
    selected:
      !phone &&
      candidate.name === (isChar ? charCandidate : artistCandidate)?.name,
  }))

  const searchField = (
    <label
      className={cn(
        'flex min-w-0 shrink-0 items-center gap-2 rounded-lg bg-surface-fill px-3 text-muted-foreground',
        phone ? 'h-11' : 'h-9',
      )}
    >
      <Search className="size-3.5 shrink-0" aria-hidden />
      <input
        type="search"
        aria-label={isChar ? t('searchCharacter') : t('searchArtist')}
        placeholder={isChar ? t('searchCharacter') : t('searchArtist')}
        value={isChar ? charQuery : artistQuery}
        maxLength={100}
        onChange={(event) => {
          clear()
          if (isChar) setCharQuery(event.target.value)
          else setArtistQuery(event.target.value)
        }}
        // ⚠ <768 必须 ≥16px，否则 iOS 聚焦即放大整页。
        className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70 md:text-2sm"
      />
    </label>
  )

  const listColumn = (
    <>
      {searchField}
      {listTitle ? (
        <div className="flex min-h-6.5 shrink-0 items-center gap-2">
          <span className="flex min-w-0 flex-1 items-baseline gap-2.5">
            <b className="truncate text-2sm font-semibold text-foreground">
              {listTitle}
            </b>
            {phone && !loadingList && candidates.length ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                {t('pickHint')}
              </span>
            ) : null}
          </span>
          {randomMode && !loadingList && candidates.length ? (
            <button
              type="button"
              onClick={() => {
                setArtistPick(null)
                setRound((value) => value + 1)
              }}
              className="inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-lg px-2 text-2sm font-medium text-foreground/75 transition-colors duration-fast ease-linear hover:bg-surface-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <RefreshCw className="size-3" aria-hidden />
              {t('reroll')}
            </button>
          ) : null}
        </div>
      ) : null}
      {guide ? (
        <LookupGuide
          text={t('guide')}
          examples={DANBOORU_REQUEST.lookupExamples}
          onExample={(example) => setCharQuery(example)}
        />
      ) : loadingList ? (
        <LookupSkeletonRows label={t('loading')} />
      ) : say ? (
        <LookupSay {...say} />
      ) : (
        <LookupRows
          // 按名单认：换词重搜期间名单没变就不重演入场，换成新名单时才升起。
          key={`${tab}:${candidates.map((item) => item.name).join('|')}`}
          kind={tab}
          rows={rows}
          addedLabel={t('added')}
          phone={phone}
          onPick={pick}
        />
      )}
    </>
  )

  // ── 右栏 ───────────────────────────────────────────────────────
  const detailQuery = isChar ? charDetail : artistDetail
  const candidate = isChar ? charCandidate : artistCandidate
  const detail = detailQuery.data?.detail ?? null
  const shots: LookupShot[] = (detail?.images ?? []).map((image) => ({
    id: image.id,
    url: image.large ?? image.url,
    alt: t('sample', { id: image.id }),
    href: danbooruPostUrl(image.id),
  }))

  const characterPane =
    candidate && detail && isChar ? (
      <CharacterPane
        phone={phone}
        title={displayDanbooruTag(candidate.name)}
        kind={t('kindCharacter')}
        lines={[
          (detail.work ?? candidate.work)
            ? t('rowWork', {
                work: displayDanbooruTag(detail.work ?? candidate.work ?? ''),
                posts: posts(detail.count ?? candidate.count),
              })
            : posts(detail.count ?? candidate.count),
          lookupAliasLine(detail.aliases, candidate.name, ALIAS_LIMIT).join(
            ' · ',
          ),
        ]}
        link={{
          label: 'Danbooru',
          href: danbooruPostsUrl(candidate.name),
          aria: t('openOnDanbooru', {
            name: displayDanbooruTag(candidate.name),
          }),
        }}
        shots={shots}
        tags={[
          { name: candidate.name, count: null, main: true },
          ...detail.traits.slice(0, CHARACTER_TRAIT_LIMIT).map((trait) => ({
            name: trait.tag,
            count: `${trait.count}/${detail.sampleSize}`,
            main: false,
          })),
        ]}
        chosen={chosen}
        onToggle={(name) => {
          clear()
          setSelection({
            pick: candidate.name,
            tags: chosen.includes(name)
              ? chosen.filter((item) => item !== name)
              : [...chosen, name],
          })
        }}
        texts={{
          tagsTitle: t('tagsTitle'),
          tagsHint: phone ? t('tagsHintPhone') : t('tagsHint'),
          note: phone
            ? t('traitsNotePhone', { count: detail.sampleSize })
            : t('traitsNote', { count: detail.sampleSize }),
          addTo: t('addTo'),
          targets: t('targetsLabel'),
          noComposition: t('noComposition'),
          whole: t('targetWhole'),
        }}
        composition={composition}
        targetValue={
          resolvedTarget === 'whole' ? 'whole' : String(resolvedTarget)
        }
        targetItems={targetItems}
        onTarget={(value) => {
          clear()
          setTarget(
            value === 'whole' || value === 'new' ? value : Number(value),
          )
        }}
        add={{
          label: acked
            ? t('addedTo', { target: targetName(resolvedTarget) })
            : chosen.length
              ? t('addTags', { count: chosen.length })
              : t('pickTags'),
          done: acked,
          disabled: !chosen.length || isGenerating,
          onClick: addCharacterTags,
        }}
      />
    ) : null

  const artistAdded = candidate
    ? hasTag(state.tagChips, artistPromptTag(candidate.name))
    : false
  const artistPane =
    candidate && detail && !isChar ? (
      <ArtistPane
        phone={phone}
        title={artistPromptTag(candidate.name)}
        kind={t('kindArtist')}
        lines={[
          t('artistSub', {
            posts: posts(detail.count ?? candidate.count),
            shown: shots.length,
            sample: detail.sampleSize,
          }),
          t('artistShotsNote'),
        ]}
        link={{
          label: 'Danbooru',
          href: danbooruPostsUrl(candidate.name),
          aria: t('openOnDanbooru', { name: candidate.name }),
        }}
        shots={shots}
        refs={detail.traits.slice(0, ARTIST_REF_LIMIT).map((trait) => ({
          text: displayDanbooruTag(trait.tag),
          count: `${trait.count}/${detail.sampleSize}`,
        }))}
        texts={{
          refsTitle: t('artistRefsTitle'),
          refsHint: t('artistRefsHint'),
          addTo: t('addTo'),
          whole: t('targetWhole'),
          where: t('artistWhere'),
        }}
        add={{
          label: artistAdded
            ? t('artistAdded')
            : t('addArtist', { tag: artistPromptTag(candidate.name) }),
          done: artistAdded,
          disabled: isGenerating,
          onClick: () => toggleArtist(candidate.name),
        }}
      />
    ) : null

  const paneKey = candidate
    ? `${tab}:${candidate.name}:${detail ? 'ready' : detailQuery.error ? 'error' : 'loading'}`
    : `${tab}:blank`
  const pane = candidate ? (
    detail ? (
      (characterPane ?? artistPane)
    ) : detailQuery.error ? (
      <LookupBlank text={t('detailError')} />
    ) : (
      <LookupDetailSkeleton label={t('loading')} />
    )
  ) : loadingList ? (
    <LookupDetailSkeleton label={t('loading')} />
  ) : guide ? (
    <LookupBlank ghosts text={t('blank')} />
  ) : (
    <LookupBlank />
  )

  const tabs = (
    <LiquidSegmented
      ariaLabel={t('tabsLabel')}
      value={tab}
      onChange={switchTab}
      items={[
        { value: 'character', label: t('tabCharacter') },
        { value: 'artist', label: t('tabStyle') },
      ]}
    />
  )

  return (
    <section
      aria-labelledby="studio-lookup-title"
      className={cn(
        'relative flex min-h-0 flex-col',
        phone
          ? 'studio-mobile-stage-panel flex-none scroll-mt-16 gap-3'
          : 'flex-1 gap-3.5',
      )}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        if (phoneDetail) setPhoneDetail(false)
        else onClose()
      }}
    >
      {phone ? (
        // `pr-12`：面板顶到顶栏下时，右上角浮着的助手头像正好压在这一行右端 —— 让开它
        // （与参数栏顶上那颗「返回结果」同一做法），⛔ 让「画风」页签被头像盖住。
        <div className="-ml-2 flex h-11 shrink-0 items-center gap-1 pr-12">
          <button
            type="button"
            aria-label={t('backToResults')}
            onClick={onClose}
            className={PHONE_ICON_BUTTON_CLASS}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <h2
            ref={headingRef}
            id="studio-lookup-title"
            tabIndex={-1}
            className="min-w-0 flex-1 truncate text-md font-semibold outline-none"
          >
            {t('title')}
          </h2>
          {tabs}
        </div>
      ) : (
        <div className="flex h-9 shrink-0 items-center gap-2.5">
          {/* ⚠ `outline-none`：打开时焦点被程序挪到这里（给读屏一个落点）。 */}
          <h2
            ref={headingRef}
            id="studio-lookup-title"
            tabIndex={-1}
            className="truncate text-md font-semibold outline-none"
          >
            {t('title')}
          </h2>
          {tabs}
          <span className="flex-1" />
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('backToResults')}
          </Button>
        </div>
      )}

      <FadeSwap
        swapKey={tab}
        reduced={Boolean(reducedMotion)}
        className={cn('flex min-h-0 flex-1', phone ? 'flex-col gap-3' : '')}
      >
        {phone ? (
          listColumn
        ) : (
          <>
            <div className="flex w-80 shrink-0 flex-col gap-2.5 border-r border-border/60 pr-4.5">
              {listColumn}
            </div>
            <div className="flex min-w-0 flex-1 flex-col pl-6.5">
              <FadeSwap
                swapKey={paneKey}
                reduced={Boolean(reducedMotion)}
                className="flex min-h-0 flex-1 flex-col"
              >
                {pane}
              </FadeSwap>
            </div>
          </>
        )}
      </FadeSwap>

      {phone ? (
        <AnimatePresence initial={false}>
          {phoneDetail && candidate ? (
            <motion.div
              key="detail"
              initial={reducedMotion ? false : { x: '100%' }}
              animate={{ x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { x: '100%' }}
              transition={{
                duration: DURATION_MS.slow / 1000,
                ease: EASE_STANDARD,
              }}
              className="absolute inset-0 z-10 flex flex-col gap-3 bg-card"
            >
              <div className="-ml-2 flex h-11 shrink-0 items-center gap-1 pr-12">
                <button
                  type="button"
                  aria-label={t('backToList')}
                  onClick={() => setPhoneDetail(false)}
                  className={PHONE_ICON_BUTTON_CLASS}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <h3 className="min-w-0 flex-1 truncate text-md font-semibold">
                  {isChar
                    ? displayDanbooruTag(candidate.name)
                    : artistPromptTag(candidate.name)}
                </h3>
                <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-muted px-1.75 text-2xs font-semibold text-foreground/75">
                  {isChar ? t('kindCharacter') : t('kindArtist')}
                </span>
              </div>
              {pane}
            </motion.div>
          ) : null}
        </AnimatePresence>
      ) : null}
    </section>
  )
}

/**
 * 换内容：旧的 120ms 淡出，新的 200ms 淡入（⛔ 不左右滑，动效表）。
 * 减少动态效果时直切 —— 连退场都不等。
 */
function FadeSwap({
  swapKey,
  reduced,
  className,
  children,
}: {
  swapKey: string
  reduced: boolean
  className: string
  children: ReactNode
}) {
  if (reduced) {
    return (
      <div key={swapKey} className={className}>
        {children}
      </div>
    )
  }
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={swapKey}
        initial={{ opacity: 0 }}
        animate={{
          opacity: 1,
          transition: { duration: DURATION_MS.base / 1000, ease: 'linear' },
        }}
        exit={{
          opacity: 0,
          transition: { duration: DURATION_MS.fast / 1000, ease: 'linear' },
        }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

interface PaneAdd {
  label: string
  done: boolean
  disabled: boolean
  onClick: () => void
}

/** 角色详情：样图 · 要加入的标签 · 加到哪 + 加入。 */
function CharacterPane({
  phone,
  title,
  kind,
  lines,
  link,
  shots,
  tags,
  chosen,
  onToggle,
  texts,
  composition,
  targetValue,
  targetItems,
  onTarget,
  add,
}: {
  phone: boolean
  title: string
  kind: string
  lines: readonly string[]
  link: { label: string; href: string; aria: string }
  shots: readonly LookupShot[]
  tags: readonly { name: string; count: string | null; main: boolean }[]
  chosen: readonly string[]
  onToggle: (name: string) => void
  texts: {
    tagsTitle: string
    tagsHint: string
    note: string
    addTo: string
    targets: string
    noComposition: string
    whole: string
  }
  composition: boolean
  targetValue: string
  targetItems: readonly { value: string; label: string }[]
  onTarget: (value: string) => void
  add: PaneAdd
}) {
  const body = (
    <LookupSection title={texts.tagsTitle} hint={texts.tagsHint}>
      <div className="flex flex-wrap content-start gap-1.5">
        {tags.map((tag) => (
          <LookupTagToggle
            key={tag.name}
            text={tag.name.replaceAll('_', ' ')}
            count={tag.count}
            main={tag.main}
            on={chosen.includes(tag.name)}
            phone={phone}
            onToggle={() => onToggle(tag.name)}
          />
        ))}
      </div>
      <span className="text-2xs leading-4.5 text-muted-foreground/70">
        {texts.note}
      </span>
    </LookupSection>
  )
  const where = composition ? (
    <LiquidSegmented
      ariaLabel={texts.targets}
      value={targetValue}
      onChange={onTarget}
      items={targetItems}
    />
  ) : (
    <span className="truncate text-xs text-muted-foreground">
      <b className="font-semibold text-foreground">{texts.whole}</b>
      {' · '}
      {texts.noComposition}
    </span>
  )

  if (phone) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <LookupShots shots={shots} phone />
          <div className="flex flex-col gap-0.5">
            {lines
              .filter((line) => line.length > 0)
              .map((line) => (
                <span
                  key={line}
                  className="text-xs leading-5 text-muted-foreground"
                >
                  {line}
                </span>
              ))}
          </div>
          {body}
        </div>
        <div className="flex shrink-0 flex-col gap-2.5 border-t border-border/60 pt-2.5">
          <div className="flex items-center gap-2.5 overflow-x-auto">
            <span className="shrink-0 text-xs font-semibold text-foreground/80">
              {texts.addTo}
            </span>
            {where}
          </div>
          <LookupAddButton phone {...add} />
        </div>
      </>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      <LookupHead title={title} kind={kind} lines={lines} link={link} />
      {/* 样图在上、标签在下；屏幕矮（`short:`）就左右排（owner 选「矮屏左右排」）。
          ⚠ 标签至少留两行的高：稍矮时让样图缩（`LookupShots`），⛔ 把标签挤没。 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 short:flex-row short:gap-6">
        <LookupShots shots={shots} />
        <div className="flex min-h-28 flex-1 flex-col gap-2.5 overflow-y-auto short:min-h-0">
          {body}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="shrink-0 text-xs font-semibold text-foreground/80">
          {texts.addTo}
        </span>
        <div className="min-w-0 overflow-x-auto">{where}</div>
        <span className="flex-1" />
        <LookupAddButton {...add} />
      </div>
    </div>
  )
}

/** 画师详情：样图 · 常画的（只是参考）· 加入 artist:名字。 */
function ArtistPane({
  phone,
  title,
  kind,
  lines,
  link,
  shots,
  refs,
  texts,
  add,
}: {
  phone: boolean
  title: string
  kind: string
  lines: readonly string[]
  link: { label: string; href: string; aria: string }
  shots: readonly LookupShot[]
  refs: readonly { text: string; count: string }[]
  texts: {
    refsTitle: string
    refsHint: string
    addTo: string
    whole: string
    where: string
  }
  add: PaneAdd
}) {
  const body = (
    <LookupSection title={texts.refsTitle} hint={texts.refsHint}>
      <div className="flex flex-wrap content-start gap-1.5">
        {refs.map((ref) => (
          <LookupRef key={ref.text} text={ref.text} count={ref.count} />
        ))}
      </div>
    </LookupSection>
  )
  const where = (
    <span className="truncate text-xs text-muted-foreground">
      <b className="font-semibold text-foreground">{texts.whole}</b>
      {' · '}
      {texts.where}
    </span>
  )

  if (phone) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <LookupShots shots={shots} phone />
          <div className="flex flex-col gap-0.5">
            {lines.map((line) => (
              <span
                key={line}
                className="text-xs leading-5 text-muted-foreground"
              >
                {line}
              </span>
            ))}
          </div>
          {body}
        </div>
        <div className="flex shrink-0 flex-col gap-2.5 border-t border-border/60 pt-2.5">
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 text-xs font-semibold text-foreground/80">
              {texts.addTo}
            </span>
            {where}
          </div>
          <LookupAddButton phone {...add} />
        </div>
      </>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      <LookupHead title={title} kind={kind} lines={lines} link={link} mono />
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 short:flex-row short:gap-6">
        <LookupShots shots={shots} />
        <div className="flex min-h-28 flex-1 flex-col gap-2.5 overflow-y-auto short:min-h-0">
          {body}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="shrink-0 text-xs font-semibold text-foreground/80">
          {texts.addTo}
        </span>
        {where}
        <span className="flex-1" />
        <LookupAddButton {...add} />
      </div>
    </div>
  )
}
