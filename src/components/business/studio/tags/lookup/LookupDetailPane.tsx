'use client'

import { useLocale, useTranslations } from 'next-intl'

import type {
  TagLookupTarget,
  TagsLibraryAdder,
} from '@/contexts/studio-library-pick'
import {
  compactPostCount,
  danbooruPostsUrl,
  danbooruPostUrl,
  displayDanbooruTag,
  isStyleMediumTag,
  lookupAliasLine,
  stylePromptTag,
} from '@/lib/tag-lookup'
import type {
  DanbooruCatalog,
  DanbooruCatalogKind,
} from '@/types/danbooru-catalog'

import {
  LookupBlank,
  LookupDetailSkeleton,
  type LookupShot,
} from './LookupDetail'
import { StylePane, TagPane, type PaneFavorite } from './LookupPanes'
import {
  ALIAS_LIMIT,
  ARTIST_REF_LIMIT,
  KIND_TEXT,
  TRAIT_LIMIT,
  kindLabelKey,
  useAck,
  type LookupItem,
} from './lookup-kinds'

/** 没开标签台时标签只是参考：那一段叫什么（角色 = 常见特征，作品 = 出场角色…）。 */
const REFS_TITLE: Record<DanbooruCatalogKind, string> = {
  character: 'refsCharacter',
  artist: 'artistRefsTitle',
  copyright: 'refsWork',
  general: 'mediumRefsTitle',
}

/**
 * 选中那一个的详情（查资料右栏 / 手机详情页 · 标签库详情，第 9f 步 9f-2c 抽出来共用）。
 *
 * - 有 `adder`（标签台开着）：角色 / 作品 / 特征点选标签、加到 整体 / 角色 N / ＋新角色，
 *   默认跟着输入框当前那一页；画风是开关。
 * - 没有：只看样图、别名、Wiki、常一起出现的；收藏照样能点。
 *
 * `target` 由宿主记着：换一个候选还加到刚才那一位（刚建的新角色也算）。
 * 点选了哪几个也由宿主按候选记着（`selections`）：切页回来选中项还在。
 */
export function LookupDetailPane({
  kind,
  candidate,
  query,
  phone,
  adder,
  target,
  onTarget,
  selections,
  onSelections,
  favorite,
}: {
  kind: DanbooruCatalogKind
  candidate: LookupItem
  query: { data?: DanbooruCatalog; error: boolean }
  phone: boolean
  adder: TagsLibraryAdder | null
  target: TagLookupTarget | null
  onTarget: (target: TagLookupTarget) => void
  selections: Readonly<Record<string, readonly string[]>>
  onSelections: (
    update: (
      current: Readonly<Record<string, readonly string[]>>,
    ) => Readonly<Record<string, readonly string[]>>,
  ) => void
  favorite: PaneFavorite | null
}) {
  const t = useTranslations('StudioTags.lookup')
  const tWorkbench = useTranslations('StudioTags.workbench')
  const locale = useLocale()
  const { acked, ack, clear } = useAck()
  const selectionKey = `${kind}:${candidate.name}`
  const chosen = selections[selectionKey] ?? [candidate.name]

  const detail = query.data?.detail ?? null
  if (!detail)
    return query.error ? (
      <LookupBlank text={t('detailError')} />
    ) : (
      <LookupDetailSkeleton label={t('loading')} />
    )

  const text = KIND_TEXT[kind]
  const posts = (count: number) =>
    t('posts', { count: compactPostCount(count, locale) })
  const shots: LookupShot[] = detail.images.map((image) => ({
    id: image.id,
    url: image.large ?? image.url,
    alt: t('sample', { id: image.id }),
    href: danbooruPostUrl(image.id),
    hrefLabel: t('openPost'),
  }))
  const count = detail.count ?? candidate.count

  if (kind === 'artist') {
    const medium = isStyleMediumTag(candidate.name)
    const tag = stylePromptTag(candidate.name)
    const added = adder?.hasPositive(tag) ?? false
    return (
      <StylePane
        phone={phone}
        title={tag}
        kind={t(kindLabelKey(kind, candidate.name))}
        favorite={favorite}
        lines={[
          t('artistSub', {
            posts: posts(count),
            shown: shots.length,
            sample: detail.sampleSize,
          }),
          t(medium ? 'mediumShotsNote' : 'artistShotsNote'),
        ]}
        about={detail.wiki}
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
          refsTitle: t(medium ? 'mediumRefsTitle' : 'artistRefsTitle'),
          refsHint: t('artistRefsHint'),
          addTo: t('addTo'),
          whole: t('targetWhole'),
          where: t(medium ? 'mediumWhere' : 'artistWhere'),
        }}
        add={
          adder
            ? {
                label: added ? t('artistAdded') : t('addArtist', { tag }),
                done: added,
                disabled: adder.busy,
                onClick: () => adder.toggleStyle(candidate.name),
              }
            : null
        }
      />
    )
  }

  // ── 加到哪 ─────────────────────────────────────────────────────
  const wanted = target ?? adder?.followTarget ?? 'whole'
  const resolved: TagLookupTarget =
    !adder || !adder.composition
      ? 'whole'
      : typeof wanted === 'number' && wanted >= adder.characterCount
        ? 'whole'
        : wanted === 'new' && !adder.canAddCharacter
          ? 'whole'
          : wanted
  const targetName = (value: TagLookupTarget) =>
    value === 'whole'
      ? t('targetWhole')
      : value === 'new'
        ? t('targetNewName')
        : tWorkbench('characterNumber', { number: value + 1 })

  return (
    <TagPane
      phone={phone}
      title={displayDanbooruTag(candidate.name)}
      kind={t(text.kind)}
      favorite={favorite}
      lines={[
        kind === 'character' && (detail.work ?? candidate.work)
          ? t('rowWork', {
              work: displayDanbooruTag(detail.work ?? candidate.work ?? ''),
              posts: posts(count),
            })
          : posts(count),
        lookupAliasLine(detail.aliases, candidate.name, ALIAS_LIMIT).join(
          ' · ',
        ),
      ]}
      about={detail.wiki}
      link={{
        label: 'Danbooru',
        href: danbooruPostsUrl(candidate.name),
        aria: t('openOnDanbooru', { name: displayDanbooruTag(candidate.name) }),
      }}
      shots={shots}
      tags={[
        { name: candidate.name, count: null, main: true },
        ...detail.traits.slice(0, TRAIT_LIMIT).map((trait) => ({
          name: trait.tag,
          count: `${trait.count}/${detail.sampleSize}`,
          main: false,
        })),
      ]}
      chosen={chosen}
      onToggle={(name) => {
        clear()
        onSelections((current) => ({
          ...current,
          [selectionKey]: chosen.includes(name)
            ? chosen.filter((item) => item !== name)
            : [...chosen, name],
        }))
      }}
      texts={{
        tagsTitle: adder ? t('tagsTitle') : t(REFS_TITLE[kind]),
        tagsHint: phone ? t('tagsHintPhone') : t('tagsHint'),
        note: t(phone ? text.notePhone : text.note, {
          count: detail.sampleSize,
        }),
        addTo: t('addTo'),
        targets: t('targetsLabel'),
        noComposition: t('noComposition'),
        whole: t('targetWhole'),
      }}
      addBar={
        adder
          ? {
              composition: adder.composition,
              targetValue: resolved === 'whole' ? 'whole' : String(resolved),
              targetItems: [
                { value: 'whole', label: t('targetWhole') },
                ...Array.from({ length: adder.characterCount }, (_, index) => ({
                  value: String(index),
                  label: tWorkbench('characterNumber', { number: index + 1 }),
                })),
                ...(adder.canAddCharacter
                  ? [{ value: 'new', label: t('targetNew') }]
                  : []),
              ],
              onTarget: (value) => {
                clear()
                onTarget(
                  value === 'whole' || value === 'new' ? value : Number(value),
                )
              },
              add: {
                label: acked
                  ? t('addedTo', { target: targetName(resolved) })
                  : chosen.length
                    ? t('addTags', { count: chosen.length })
                    : t('pickTags'),
                done: acked,
                disabled: !chosen.length || adder.busy,
                onClick: () => {
                  if (!chosen.length || adder.busy) return
                  const created = adder.add(
                    chosen.map(displayDanbooruTag),
                    resolved,
                  )
                  // 接着加就加到刚建的那一位，⛔ 再建一位。
                  if (created !== null) onTarget(created)
                  ack()
                },
              },
            }
          : null
      }
    />
  )
}
