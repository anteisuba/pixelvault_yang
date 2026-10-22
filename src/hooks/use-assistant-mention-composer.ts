'use client'

/**
 * 助手输入框 `@` 的**一套 chip**（设计方案 §10b · 统一引用模型）。
 *
 * ── 它把什么合成了一套 ───────────────────────────────────────────
 * 从前有两套「引用」：正文里的 `@Image2` / `@Attachment[…]` / `@TextNode[…]` 记号，
 * 和输入框上方那一排 `@` chip（住在 store，类型就是附件）——前者按名字 / 槽位号编
 * 译、后者在画布上被偷换成参考位（附录 G §2）。现在只剩一套：
 *   · **正文里的 `<@kind:id>` 就是 chip**（输入框把它画成胶囊），删字 = 摘 chip；
 *   · store 里那张表只是**登记**（名字 / 缩略图 / scope / nodeId），不决定带不带；
 *   · 外面递进来的（「问助手」/ 拖图 / 用它当参考 / 歧义单选）排进收件箱，面板挂着
 *     时立刻接到正文末尾 —— 同一枚胶囊，⛔ 没有第二排。
 *
 * ── 候选从哪来（§10b「候选来源插件化」）──────────────────────────
 * 宿主带自己那几组（画布：选中的卡 + 画布上的卡；LoRA 台：挂着的 LoRA）；参考位 /
 * 这条消息的附件 / 本次对话的生成 / 角色由这里从契约里现成的东西拼；素材库走服务端
 * 检索（`useMentionLibrarySearch`）。
 *
 * ── 发送前（`prepare`）───────────────────────────────────────────
 * 手打的 `@图1` / `@Image1`（槽位号）与 `@名字`（候选里唯一的那个）先换成记号；
 * 然后每个记号按 id 去**此刻还在的东西**里找，找不到 = 「已删除」，整条拦下；
 * 通过之后名字去重、记号换成 `「名字」`，引用列表随消息一起走。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import {
  ASSISTANT_MENTION_GROUP_IDS,
  ASSISTANT_MENTION_KIND_IDS,
  ASSISTANT_MENTION_LIMITS,
  ASSISTANT_MENTION_RECENT_STORAGE_PREFIX,
  ASSISTANT_MENTION_SCOPE_IDS,
} from '@/constants/assistant-mention'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import type { StudioOperatorHost } from '@/contexts/studio-operator-host'
import type { MentionToken } from '@/components/ui/mention-input'
import { useCharacterLibraryCards } from '@/hooks/cards/use-character-library'
import {
  addOperatorMention,
  registerOperatorMentions,
  takeOperatorMentionInbox,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import { toOperatorAttachment } from '@/hooks/use-studio-operator-upload'
import { parseDroppedAssetIds } from '@/lib/asset-dnd'
import { characterCoverUrl } from '@/lib/card-bus'
import { fetchGenerationByIdAPI } from '@/lib/api-client/gallery'
import {
  lookupAssistantMentionAssetsAPI,
  searchAssistantMentionLibraryAPI,
} from '@/lib/api-client/assistant-mentions'
import {
  appendMentionToken,
  clampLabel,
  formatMentionToken,
  isLookableMention,
  mentionFromAttachment,
  mentionKey,
  pushRecentKeys,
  renderMentionText,
  resolveDraftMentions,
  resolveSlotMentions,
  resolveTypedMentions,
  splitMentionKey,
  withUniqueMentionLabels,
  type DraftMention,
} from '@/lib/assistant-mention'
import { getReferenceImageAttachmentId } from '@/lib/studio-reference-mentions'
import type {
  AssistantMention,
  AssistantMentionCandidate,
  AssistantMentionGroupId,
  AssistantMentionKind,
  AssistantMentionLibraryFolder,
  AssistantMentionLibraryItem,
  AssistantMentionRole,
} from '@/types/assistant-mention'
import type {
  StudioOperatorAttachment,
  StudioOperatorResultItem,
} from '@/types/studio-assistant-operator'

export interface AssistantMentionGroup {
  readonly id: AssistantMentionGroupId
  readonly items: readonly AssistantMentionCandidate[]
}

export type AssistantMentionPrepared =
  | {
      readonly ok: true
      /** 发出去的正文（记号已换成 `「名字」`）。 */
      readonly text: string
      readonly mentions: readonly AssistantMention[]
    }
  | { readonly ok: false; readonly reason: 'missing' | 'slot' }

/** 胶囊上的颜色 / 缩略图形状跟着它走（`MentionToken.kind`）。 */
const CHIP_KIND: Record<AssistantMentionKind, MentionToken['kind']> = {
  image: 'reference',
  video: 'video',
  audio: 'voice',
  model3d: 'reference',
  text: 'text',
  character: 'character',
  lora: 'reference',
}

/** 刚选中、`tokens` 还没回流的那一枚胶囊长什么样（输入框立刻画出来）。 */
export function mentionChipToken(mention: AssistantMention): MentionToken {
  return {
    name: formatMentionToken(mention),
    literal: true,
    kind: CHIP_KIND[mention.kind] ?? 'reference',
    ...(mention.thumb ? { thumbnailUrl: mention.thumb } : {}),
    slotLabel: `@${mention.label}`,
  }
}

const RESULT_KIND: Record<string, AssistantMentionKind> = {
  VIDEO: ASSISTANT_MENTION_KIND_IDS.video,
  AUDIO: ASSISTANT_MENTION_KIND_IDS.audio,
  MODEL_3D: ASSISTANT_MENTION_KIND_IDS.model3d,
}

// ─── 最近使用（本机，按工作台分）──────────────────────────────────────

function readRecent(scope: string): string[] {
  try {
    const raw = window.localStorage.getItem(
      `${ASSISTANT_MENTION_RECENT_STORAGE_PREFIX}${scope}`,
    )
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function writeRecent(scope: string, keys: readonly string[]): void {
  try {
    window.localStorage.setItem(
      `${ASSISTANT_MENTION_RECENT_STORAGE_PREFIX}${scope}`,
      JSON.stringify(keys),
    )
  } catch {
    // 无痕 / 存储满：最近使用只是顺手，丢了不影响任何事。
  }
}

// ─── 参考位的真名（按地址查一次，整页共用）────────────────────────────

const referenceNameCache = new Map<string, string | null>()

function useReferenceNames(
  urls: readonly string[],
): ReadonlyMap<string, string> {
  const [version, setVersion] = useState(0)
  const key = urls.join('\n')
  useEffect(() => {
    const missing = urls
      .filter((url) => /^https?:\/\//i.test(url))
      .filter((url) => !referenceNameCache.has(url))
      .slice(0, 16)
    if (!missing.length) return
    for (const url of missing) referenceNameCache.set(url, null)
    let alive = true
    void lookupAssistantMentionAssetsAPI(missing).then((result) => {
      if (!result.success) return
      for (const item of result.data) {
        referenceNameCache.set(item.url, item.label)
        if (item.thumb) referenceNameCache.set(item.thumb, item.label)
      }
      if (alive) setVersion((value) => value + 1)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return useMemo(() => {
    void version
    const names = new Map<string, string>()
    for (const url of urls) {
      const name = referenceNameCache.get(url)
      if (name) names.set(url, name)
    }
    return names
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version])
}

// ─── 素材库检索 ──────────────────────────────────────────────────────

export interface MentionLibraryState {
  readonly items: readonly AssistantMentionCandidate[]
  readonly folders: readonly AssistantMentionLibraryFolder[]
  readonly loading: boolean
}

const EMPTY_LIBRARY: MentionLibraryState = {
  items: [],
  folders: [],
  loading: false,
}

export function libraryItemToCandidate(
  item: AssistantMentionLibraryItem,
  kindLabel: (kind: AssistantMentionKind) => string,
): AssistantMentionCandidate {
  return {
    kind: item.kind,
    id: item.id,
    label: clampLabel(item.label),
    scope: ASSISTANT_MENTION_SCOPE_IDS.library,
    generationId: item.id,
    url: item.url,
    ...(item.thumb ? { thumb: item.thumb } : {}),
    ...(typeof item.seq === 'number' ? { seq: item.seq } : {}),
    subtitle: [kindLabel(item.kind), item.folders[0]]
      .filter(Boolean)
      .join(' · '),
    ...(item.prompt ? { preview: item.prompt } : {}),
    keywords: [item.prompt, item.model, ...item.folders].filter(Boolean),
  }
}

/**
 * 素材库那一组：查询变了就（防抖后）问一次服务端；`folderId` 给了就在那个夹里找。
 * ⚠ 菜单关着（`enabled = false`）时一发都不打。
 */
export function useMentionLibrarySearch(input: {
  readonly enabled: boolean
  readonly query: string
  readonly folderId: string | null
}): MentionLibraryState {
  const t = useTranslations('StudioOperator.mention')
  const [state, setState] = useState<{
    key: string
    value: MentionLibraryState
  }>({ key: '', value: EMPTY_LIBRARY })
  const key = `${input.folderId ?? ''}\n${input.query.trim()}`
  useEffect(() => {
    if (!input.enabled) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setState((current) => ({
        key,
        value: { ...current.value, loading: true },
      }))
      void searchAssistantMentionLibraryAPI(
        {
          q: input.query.trim(),
          ...(input.folderId ? { folderId: input.folderId } : {}),
          limit: ASSISTANT_MENTION_LIMITS.libraryPageSize,
        },
        controller.signal,
      ).then((result) => {
        if (controller.signal.aborted) return
        setState({
          key,
          value: result.success
            ? {
                items: result.data.items.map((item) =>
                  libraryItemToCandidate(item, (kind) => t(`kinds.${kind}`)),
                ),
                folders: result.data.folders,
                loading: false,
              }
            : EMPTY_LIBRARY,
        })
      })
    }, ASSISTANT_MENTION_LIMITS.libraryDebounceMs)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.enabled, key])
  if (!input.enabled) return EMPTY_LIBRARY
  return state.key === key ? state.value : { ...state.value, loading: true }
}

// ─── 主 hook ─────────────────────────────────────────────────────────

export interface UseAssistantMentionComposerInput {
  readonly host: StudioOperatorHost
  readonly draft: string
  onDraftChange(value: string): void
  /** 这条消息的 📎（宿主那一侧已经合好的那一份）。 */
  readonly attachments: readonly StudioOperatorAttachment[]
}

export interface UseAssistantMentionComposerResult {
  /** 菜单里的固定几组（不含素材库 —— 那一组是异步的）。 */
  readonly groups: readonly AssistantMentionGroup[]
  /** 正文里每一枚胶囊此刻指着什么（输入框、计数、发送闸同一份）。 */
  readonly drafts: readonly DraftMention[]
  /** 喂给 `MentionInput` 的胶囊。 */
  readonly tokens: readonly MentionToken[]
  /** 将看几张（`@` 的图 + 📎 的图，按地址去重）。 */
  readonly lookCount: number
  readonly missingCount: number
  readonly roles: readonly AssistantMentionRole[]
  readonly recentKeys: readonly string[]
  /** 按键找一条（候选或登记表）。 */
  find(key: string): AssistantMention | undefined
  /** 登记一条（菜单里选中、素材库弹层挑中）—— 正文里的记号由调用方插。 */
  register(mention: AssistantMention): void
  /** 胶囊小卡片上改了用途。 */
  setRole(key: string, role: AssistantMentionRole | undefined): void
  remember(keys: readonly string[]): void
  prepare(text: string): AssistantMentionPrepared
  /** 拖进输入框：库里的资产成 `@`，其余文件原样交回上传通道。 */
  acceptDrop(dataTransfer: DataTransfer | null): readonly File[]
  /** 菜单打开了：现拉一次角色库（挂载时不拉，见 `useCharacterLibraryCards`）。 */
  warmCharacters(): void
}

export function useAssistantMentionComposer({
  host,
  draft,
  onDraftChange,
  attachments,
}: UseAssistantMentionComposerInput): UseAssistantMentionComposerResult {
  const t = useTranslations('StudioOperator.mention')
  const tReference = useTranslations('StudioPromptArea.referenceMention')
  const { mentions: registry, mentionInbox } = useStudioOperatorState()
  const omit = useMemo(
    () => new Set(host.mentions?.omit ?? []),
    [host.mentions?.omit],
  )
  const { cards: characterCards, refresh: loadCharacters } =
    useCharacterLibraryCards()
  const refreshCharacters = useCallback(() => {
    void loadCharacters()
  }, [loadCharacters])

  const referenceImages = host.referenceImages
  const referenceUrls = useMemo(
    () =>
      referenceImages
        .filter((entry) => !entry.implicit && !entry.name)
        .map((entry) => entry.url),
    [referenceImages],
  )
  const referenceNames = useReferenceNames(referenceUrls)

  const hostGroups = host.mentions?.groups
  /** 画布上的卡按地址索引 —— 画布的图同时是参考位时，指的是那张卡。 */
  const canvasByUrl = useMemo(() => {
    const map = new Map<string, AssistantMentionCandidate>()
    for (const group of hostGroups ?? [])
      for (const item of group.items)
        if (item.scope === ASSISTANT_MENTION_SCOPE_IDS.canvas && item.url)
          map.set(item.url, item)
    return map
  }, [hostGroups])

  /** 参考位（全部，含画布上的图）—— 手打 `@图N` 的编号就是它们的顺序。 */
  const referenceSlots = useMemo(
    () =>
      referenceImages.map((entry, index): AssistantMentionCandidate => {
        const onCanvas = canvasByUrl.get(entry.url)
        if (onCanvas) return onCanvas
        const label =
          entry.name ||
          referenceNames.get(entry.url) ||
          tReference('image', { index: index + 1 })
        return {
          kind: ASSISTANT_MENTION_KIND_IDS.image,
          id: getReferenceImageAttachmentId(entry.url),
          label: clampLabel(label),
          scope: ASSISTANT_MENTION_SCOPE_IDS.reference,
          url: entry.url,
          thumb: entry.url,
          subtitle: t('slot', { index: index + 1 }),
        }
      }),
    [canvasByUrl, referenceImages, referenceNames, t, tReference],
  )

  const results = host.results
  const groups = useMemo((): AssistantMentionGroup[] => {
    const references = referenceSlots.filter(
      (slot, index) =>
        slot.scope === ASSISTANT_MENTION_SCOPE_IDS.reference &&
        !referenceImages[index]?.disabledReason,
    )
    const attached = attachments.map(
      (attachment): AssistantMentionCandidate => ({
        ...mentionFromAttachment(
          attachment,
          ASSISTANT_MENTION_SCOPE_IDS.attachment,
        ),
        subtitle: t(
          `kinds.${mentionFromAttachment(attachment, ASSISTANT_MENTION_SCOPE_IDS.attachment).kind}`,
        ),
      }),
    )
    const generated = results.map(
      (item: StudioOperatorResultItem): AssistantMentionCandidate => {
        const kind =
          RESULT_KIND[item.outputType?.toUpperCase() ?? ''] ??
          ASSISTANT_MENTION_KIND_IDS.image
        const thumb =
          item.thumbnailUrl ?? (kind === 'image' ? item.url : undefined)
        return {
          kind,
          id: item.id,
          label: clampLabel(item.label ?? item.id),
          scope: ASSISTANT_MENTION_SCOPE_IDS.result,
          generationId: item.id,
          url: item.url,
          ...(thumb ? { thumb } : {}),
          ...(typeof item.seq === 'number' ? { seq: item.seq } : {}),
          subtitle: t(`kinds.${kind}`),
        }
      },
    )
    const characters = characterCards.map((card): AssistantMentionCandidate => {
      const thumb = characterCoverUrl(card)
      return {
        kind: ASSISTANT_MENTION_KIND_IDS.character,
        id: card.id,
        label: clampLabel(card.name),
        scope: ASSISTANT_MENTION_SCOPE_IDS.character,
        ...(thumb ? { thumb } : {}),
        subtitle: [t('kinds.character'), card.handle ? `@${card.handle}` : null]
          .filter(Boolean)
          .join(' · '),
        keywords: [
          ...card.tags,
          card.handle ?? '',
          ...card.looks.map((look) => look.label ?? ''),
        ].filter(Boolean),
      }
    })
    const generic: AssistantMentionGroup[] = [
      { id: ASSISTANT_MENTION_GROUP_IDS.references, items: references },
      { id: ASSISTANT_MENTION_GROUP_IDS.attachments, items: attached },
      { id: ASSISTANT_MENTION_GROUP_IDS.results, items: generated },
      { id: ASSISTANT_MENTION_GROUP_IDS.characters, items: characters },
    ]
    const all = [...(hostGroups ?? []), ...generic].filter(
      (group) => !omit.has(group.id) && group.items.length > 0,
    )
    // 同一条只列一次（画布的图既是卡又是参考位时，先到的那一组赢）。
    const seen = new Set<string>()
    return all
      .map((group) => ({
        id: group.id,
        items: group.items.filter((item) => {
          const key = mentionKey(item)
          if (group.id === ASSISTANT_MENTION_GROUP_IDS.selected) return true
          if (seen.has(key)) return false
          seen.add(key)
          return true
        }),
      }))
      .filter((group) => group.items.length > 0)
  }, [
    attachments,
    hostGroups,
    characterCards,
    omit,
    referenceImages,
    referenceSlots,
    results,
    t,
  ])

  const live = useMemo(() => {
    const map = new Map<string, AssistantMention>()
    for (const group of groups)
      for (const item of group.items) map.set(mentionKey(item), item)
    // 画布上的图同时是参考位时，`@图N` 解析到的就是那张卡 —— 已经在上面了。
    return map
  }, [groups])

  const drafts = useMemo(
    () => resolveDraftMentions(draft, registry, live),
    [draft, registry, live],
  )

  const tokens = useMemo(
    (): MentionToken[] =>
      drafts.map((item): MentionToken => {
        if (item.mention && !item.missing) return mentionChipToken(item.mention)
        const ref = splitMentionKey(item.key)
        const label = item.mention?.label
        return {
          name: ref ? formatMentionToken(ref) : item.key,
          literal: true,
          kind: ref ? CHIP_KIND[ref.kind] : 'reference',
          slotLabel: label ? t('deletedNamed', { label }) : t('deleted'),
          missing: true,
        }
      }),
    [drafts, t],
  )

  const includeVideo = host.domain === ASSISTANT_PROTOCOL_DOMAIN_IDS.video
  const lookCount = useMemo(() => {
    const urls = new Set<string>()
    for (const item of drafts)
      if (
        item.mention &&
        !item.missing &&
        isLookableMention(item.mention, includeVideo)
      )
        urls.add(item.mention.url!)
    for (const attachment of attachments)
      if (
        attachment.kind === 'image' ||
        (includeVideo && attachment.kind === 'video')
      )
        urls.add(attachment.url)
    return urls.size
  }, [attachments, drafts, includeVideo])

  /** 外面递进来的那几条：面板挂着就立刻接到正文末尾。 */
  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])
  useEffect(() => {
    if (!mentionInbox.length) return
    const taken = takeOperatorMentionInbox()
    if (!taken.length) return
    const next = taken.reduce(
      (text, mention) => appendMentionToken(text, mention),
      draftRef.current,
    )
    draftRef.current = next
    onDraftChange(next)
  }, [mentionInbox, onDraftChange])

  const scope = host.workspace
  const [recentKeys, setRecentKeys] = useState<readonly string[]>([])
  useEffect(() => {
    // 本机存储只在浏览器里读（SSR 首帧没有 window）。
    setRecentKeys(readRecent(scope))
  }, [scope])
  const remember = useCallback(
    (keys: readonly string[]) => {
      if (!keys.length) return
      setRecentKeys((current) => {
        const next = pushRecentKeys(current, keys)
        writeRecent(scope, next)
        return next
      })
    },
    [scope],
  )

  const find = useCallback(
    (key: string) =>
      live.get(key) ?? registry.find((item) => mentionKey(item) === key),
    [live, registry],
  )
  const register = useCallback((mention: AssistantMention) => {
    registerOperatorMentions([mention])
  }, [])
  const setRole = useCallback(
    (key: string, role: AssistantMentionRole | undefined) => {
      const current = find(key)
      if (!current) return
      const { role: _previous, ...rest } = current
      void _previous
      registerOperatorMentions([role ? { ...rest, role } : rest])
    },
    [find],
  )

  const prepare = useCallback(
    (text: string): AssistantMentionPrepared => {
      /**
       * ⭐ 手打的槽位号：挂了参考位就只认参考位；一个都没挂时 `@Image N` 指的是这条
       * 消息自己带的第 N 张图（owner 2026-10-09：LoRA 台「@Image1 比如这张」）。
       * 两套编号混着数会指错图。
       */
      const messageImages: AssistantMention[] = [
        ...drafts.flatMap((item) =>
          item.mention && item.mention.kind === ASSISTANT_MENTION_KIND_IDS.image
            ? [item.mention]
            : [],
        ),
        ...attachments
          .filter((attachment) => attachment.kind === 'image')
          .map((attachment) =>
            mentionFromAttachment(
              attachment,
              ASSISTANT_MENTION_SCOPE_IDS.attachment,
            ),
          ),
      ]
      const slots = referenceSlots.length
        ? referenceSlots.map((slot, index) =>
            referenceImages[index]?.disabledReason ? null : slot,
          )
        : messageImages
      const slotted = resolveSlotMentions(
        text,
        slots.map(
          (slot) =>
            slot ?? {
              kind: ASSISTANT_MENTION_KIND_IDS.image,
              id: 'unavailable',
              label: tReference('unavailable'),
              scope: ASSISTANT_MENTION_SCOPE_IDS.reference,
            },
        ),
      )
      if (
        slotted.invalid ||
        slotted.mentions.some((mention) => mention.id === 'unavailable')
      )
        return { ok: false, reason: 'slot' }
      const typed = resolveTypedMentions(slotted.text, [...live.values()])
      const resolved = resolveDraftMentions(
        typed.text,
        [...registry, ...slotted.mentions, ...typed.mentions],
        new Map([
          ...live,
          ...slotted.mentions.map(
            (mention) => [mentionKey(mention), mention] as const,
          ),
        ]),
      )
      if (resolved.some((item) => item.missing || !item.mention))
        return { ok: false, reason: 'missing' }
      const mentions = withUniqueMentionLabels(
        resolved.flatMap((item) => (item.mention ? [item.mention] : [])),
      ).slice(0, ASSISTANT_MENTION_LIMITS.maxPerMessage)
      return {
        ok: true,
        text: renderMentionText(typed.text, mentions),
        mentions,
      }
    },
    [
      attachments,
      drafts,
      live,
      referenceImages,
      referenceSlots,
      registry,
      tReference,
    ],
  )

  const acceptDrop = useCallback(
    (dataTransfer: DataTransfer | null): readonly File[] => {
      if (!dataTransfer) return []
      const ids = parseDroppedAssetIds(dataTransfer.getData(ASSET_DND_MIME))
      if (ids.length > 0) {
        /**
         * ⚠ 拖拽只递了 id，胶囊上要缩略图与名字，所以现取一次详情（`/api/generations/{id}`
         * 的详情口，⛔ 不是列表口）。取不到就静默跳过：拖来的可能是已经删掉的行。
         */
        void Promise.all(ids.map((id) => fetchGenerationByIdAPI(id))).then(
          (fetched) => {
            for (const result of fetched) {
              if (!result.success || !result.data.url) continue
              addOperatorMention(toOperatorAttachment(result.data))
            }
          },
        )
        return []
      }
      return [...(dataTransfer.files ?? [])]
    },
    [],
  )

  return {
    groups,
    drafts,
    tokens,
    lookCount,
    missingCount: drafts.filter((item) => item.missing).length,
    roles: host.mentions?.roles ?? [],
    recentKeys,
    find,
    register,
    setRole,
    remember,
    prepare,
    acceptDrop,
    warmCharacters: refreshCharacters,
  }
}
