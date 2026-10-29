import 'server-only'

import { getAssistantRouteModelEntry } from '@/constants/assistant-persona'
import { CHARACTER_GROWTH_PAGE } from '@/constants/cards'
import {
  CHARACTER_BROWSE_PAUSE_REASONS,
  CHARACTER_BROWSE_SETTING_ERRORS,
  CHARACTER_BROWSE_SOURCES,
  CHARACTER_OPINION_PREFIX,
  type CharacterBrowsePauseReason,
  type CharacterBrowseSource,
} from '@/constants/character-browse'
import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { getAssistantRouteModelByUserId } from '@/services/assistant-persona.service'
import { resolveAssistantRoute } from '@/services/kernel/assistant-route.service'
import { ensureUser } from '@/services/user.service'
import type {
  CharacterBrowseState,
  CharacterGrowth,
  CharacterGoOutResult,
  UpdateCharacterBrowseRequest,
} from '@/types/character-growth'

import { browseCharacter } from './character-browse.service'
import { forgetFindings } from './character-findings.service'
import { revertCharacterRevision } from './character-revision.service'

/**
 * **她的成长**（10-26「更像真人」C 第 3 步；2026-10-28 角色页改版 B 起是角色页右栏「最近」）：
 * 日记、她改了什么、她出门看到的、她的观点、出门逛的开关与型号；撤回、删见闻、改开关。
 *
 * ⚠ ownership：卡不是你的 / 已删 → `null`（路由出 404），⛔ 不回空列表装作没有。
 */

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const PAUSE_REASONS = new Set<string>(
  Object.values(CHARACTER_BROWSE_PAUSE_REASONS),
)
const SOURCES = new Set<string>(CHARACTER_BROWSE_SOURCES)

function browseState(card: {
  browseEnabled: boolean
  browseModel: string | null
  browsePausedReason: string | null
  browsedAt: Date | null
}): CharacterBrowseState {
  return {
    enabled: card.browseEnabled,
    model: card.browseModel,
    pausedReason:
      card.browsePausedReason && PAUSE_REASONS.has(card.browsePausedReason)
        ? (card.browsePausedReason as CharacterBrowsePauseReason)
        : null,
    browsedAt: card.browsedAt?.toISOString() ?? null,
  }
}

const BROWSE_SELECT = {
  browseEnabled: true,
  browseModel: true,
  browsePausedReason: true,
  browsedAt: true,
} as const

function settingError(
  kind: keyof typeof CHARACTER_BROWSE_SETTING_ERRORS,
): ApiRequestError {
  const error = CHARACTER_BROWSE_SETTING_ERRORS[kind]
  return new ApiRequestError(
    error.code,
    error.httpStatus,
    error.i18nKey,
    error.message,
  )
}

export async function getCharacterGrowthForClerkId(
  clerkId: string,
  cardId: string,
): Promise<CharacterGrowth | null> {
  const user = await ensureUser(clerkId)
  const card = await db.characterCard.findFirst({
    where: { id: cardId, userId: user.id, isDeleted: false },
    select: {
      ...BROWSE_SELECT,
      journals: {
        orderBy: { createdAt: 'desc' },
        take: CHARACTER_GROWTH_PAGE.journals,
        select: { id: true, text: true, createdAt: true },
      },
      revisions: {
        orderBy: { createdAt: 'desc' },
        take: CHARACTER_GROWTH_PAGE.revisions,
        select: {
          id: true,
          source: true,
          fields: true,
          before: true,
          after: true,
          reason: true,
          revertedAt: true,
          createdAt: true,
        },
      },
      findings: {
        orderBy: { seenAt: 'desc' },
        take: CHARACTER_GROWTH_PAGE.findings,
        select: {
          id: true,
          source: true,
          url: true,
          title: true,
          note: true,
          seenAt: true,
        },
      },
    },
  })
  if (!card) return null
  const opinions = await db.assistantMemory.findMany({
    where: {
      userId: user.id,
      characterCardId: cardId,
      text: { startsWith: CHARACTER_OPINION_PREFIX },
    },
    orderBy: { createdAt: 'desc' },
    take: CHARACTER_GROWTH_PAGE.opinions,
    select: { id: true, text: true, createdAt: true },
  })
  return {
    browse: browseState(card),
    findings: card.findings
      .filter((row) => SOURCES.has(row.source))
      .map((row) => ({
        ...row,
        source: row.source as CharacterBrowseSource,
        seenAt: row.seenAt.toISOString(),
      })),
    opinions: opinions.map((row) => ({
      id: row.id,
      text: row.text.slice(CHARACTER_OPINION_PREFIX.length).trim(),
      createdAt: row.createdAt.toISOString(),
    })),
    journals: card.journals.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })),
    revisions: card.revisions.map((row) => ({
      ...row,
      before: asRecord(row.before),
      after: asRecord(row.after),
      revertedAt: row.revertedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}

/** 撤回一条。撤过的、不是你的、卡已删的 → `null`（404）。 */
export async function revertCharacterRevisionForClerkId(
  clerkId: string,
  revisionId: string,
): Promise<{ reverted: true } | null> {
  const user = await ensureUser(clerkId)
  return (await revertCharacterRevision(user.id, revisionId))
    ? { reverted: true }
    : null
}

/**
 * 「自动」或没给 → 助手此刻那个型号（`auto` 换成「自动」此刻挑中的那一个，与助手同一个函数）。
 * 挑不出来（一把 key 都没有）→ `noModel`；⛔ 开着却没型号。
 */
async function pickBrowseModel(
  userId: string,
  requested: string | undefined,
): Promise<string> {
  const pinned = getAssistantRouteModelEntry(requested)
  if (pinned) return pinned.modelId
  if (requested && requested !== 'auto') throw settingError('unknownModel')
  const routeModel = requested ?? (await getAssistantRouteModelByUserId(userId))
  const direct = getAssistantRouteModelEntry(routeModel)
  if (direct) return direct.modelId
  try {
    return (await resolveAssistantRoute(userId, { routeModel })).modelId
  } catch {
    throw settingError('noModel')
  }
}

/**
 * 开关与型号（owner 2026-10-28）：打开时型号默认填助手当时那个，之后固定用它；关上清掉型号
 * （下次打开再按那时的助手填）。改了就清掉「出不了门」的原因 —— 下一趟出门会重新判。
 * 卡不是你的 / 已删 → `null`（404）。
 */
export async function updateCharacterBrowseForClerkId(
  clerkId: string,
  cardId: string,
  input: UpdateCharacterBrowseRequest,
): Promise<CharacterBrowseState | null> {
  const user = await ensureUser(clerkId)
  const card = await db.characterCard.findFirst({
    where: { id: cardId, userId: user.id, isDeleted: false },
    select: { id: true, updatedAt: true },
  })
  if (!card) return null
  const model = input.enabled
    ? await pickBrowseModel(user.id, input.model)
    : null
  const updated = await db.characterCard.update({
    where: { id: card.id },
    // ⚠ `updatedAt` 写回原值：改开关不该把她顶到角色列表最前面。
    data: {
      browseEnabled: input.enabled,
      browseModel: model,
      browsePausedReason: null,
      updatedAt: card.updatedAt,
    },
    select: BROWSE_SELECT,
  })
  return browseState(updated)
}

/**
 * 打开开关就出门（owner 2026-10-29：「这个开关就是现在出门的意思」）：拨开就去，⛔ 等第二天定时那一趟、
 * ⛔ 看「最近有没有来往」、⛔ 看上次什么时候出过门。花费由 `browseCharacter` 里的每天见闻上限
 * （`browseDailyLimit`）兜住：今天记满了就在调模型之前停。开关关着 → 不去（`went: false`）。
 * 卡不是你的 / 已删 → `null`（404）。
 */
export async function goOutNowForClerkId(
  clerkId: string,
  cardId: string,
): Promise<CharacterGoOutResult | null> {
  const user = await ensureUser(clerkId)
  const card = await db.characterCard.findFirst({
    where: { id: cardId, userId: user.id, isDeleted: false },
    select: { id: true, browseEnabled: true },
  })
  if (!card) return null
  if (!card.browseEnabled) return { went: false, kept: 0 }
  const result = await browseCharacter({ userId: user.id, cardId: card.id })
  return { went: true, kept: result.kept }
}

/** 删一条见闻（连同聊天时「想起」用的索引）。不是你的 → `false`（404）。 */
export async function deleteCharacterFindingForClerkId(
  clerkId: string,
  findingId: string,
): Promise<boolean> {
  const user = await ensureUser(clerkId)
  const finding = await db.characterFinding.findFirst({
    where: { id: findingId, userId: user.id },
    select: { id: true, characterCardId: true },
  })
  if (!finding) return false
  await db.characterFinding.delete({ where: { id: finding.id } })
  await forgetFindings(finding.characterCardId, [finding.id])
  return true
}
