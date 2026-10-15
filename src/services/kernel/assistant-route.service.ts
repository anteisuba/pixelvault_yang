import 'server-only'

import {
  ASSISTANT_AUTO_QUESTION_MODEL_IDS,
  ASSISTANT_PROVIDER_ORDER,
  assistantAdapterSupportsImage,
  isAssistantProvider,
} from '@/constants/assistant'
import {
  getAssistantRouteModelEntry,
  pickAutoAssistantRouteModel,
} from '@/constants/assistant-persona'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import {
  ApiKeyError,
  AssistantModelCannotSeeError,
  AssistantModelKeyMissingError,
} from '@/lib/errors'
import { getAssistantRouteModelByUserId } from '@/services/assistant-persona.service'
import {
  resolveLlmTextRoute,
  type ResolvedLlmTextRoute,
} from '@/services/llm-text.service'

/**
 * ⭐ **「助手那一家」的唯一答案**（owner 2026-10-15「全跟助手」·「会自动扣其他模型的token，
 * 用户还不知道」）。
 *
 * 助手的每一轮（五张脸、v2 / v3 共用的 `prepareOperatorTurn`）与助手以外那几样小功能
 * （标签台翻译、「满意」评估、卡片编译与取材、3D 预检、试读、旧助手的查证）都调这一个
 * 函数，所以它们花的是同一家、同一把 key、同一个型号：
 *  · **选了具体模型**：就是它。那一家没有活着的 key → `AssistantModelKeyMissingError`，
 *    ⛔ 不回落「自动」；
 *  · **「自动」**：`pickAutoAssistantRouteModel` —— `ASSISTANT_PROVIDER_ORDER` 里第一家配了
 *    key 的、它的默认档；chip 用同一个函数写「自动 · DeepSeek V4.1 Flash」。五家都没有 →
 *    `ApiKeyError('missing')`（面板就地开 `QuickSetupDialog`）。
 *
 * ⚠ 那把 key 解不开（坏了）就照实抛，⛔ 不悄悄换下一家 —— 换了 chip 上写的就不是真的了。
 * ⚠ 做不了的事（看图）由调用方用 `assertAssistantRouteSeesImages` 直说，⛔ 不借别家。
 */
export interface AssistantRoute {
  route: ResolvedLlmTextRoute
  /** 那把 key 的 id —— 看图那几条腿要把同一把递下去。 */
  apiKeyId: string
  /** 这一轮的型号（选定的那个，或那一家的默认档）。⛔ 调用方别再自己挑。 */
  modelId: string
  /** chip 上那几个字（`DeepSeek V4.1 Flash`）。 */
  modelLabel: string
  /** `true` = 「自动」挑的；`false` = 创作者点名的。 */
  auto: boolean
}

export interface ResolveAssistantRouteOptions {
  /**
   * 已经读过的 persona `routeModel`（`prepareOperatorTurn` 手上有整份 persona）。
   * 缺席 = 这里自己读那一列。
   */
  routeModel?: string | null
  /**
   * 这一轮是纯问答（`isAssistantQuestionTurn`）。「自动」时换**同一家**的快档
   * （`ASSISTANT_AUTO_QUESTION_MODEL_IDS`），⛔ 不换家；点名的模型不受影响。
   */
  questionTurn?: boolean
}

/** 五家里有活着的 key 的那几家，每家最新那一把（与旧的自动优先级同一条判据）。 */
async function newestKeyByProvider(
  userId: string,
): Promise<Map<AI_ADAPTER_TYPES, string>> {
  const keys = await db.userApiKey.findMany({
    where: {
      userId,
      isActive: true,
      adapterType: { in: [...ASSISTANT_PROVIDER_ORDER] },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, adapterType: true },
  })
  const byProvider = new Map<AI_ADAPTER_TYPES, string>()
  for (const key of keys) {
    const adapterType = key.adapterType as AI_ADAPTER_TYPES
    if (!byProvider.has(adapterType)) byProvider.set(adapterType, key.id)
  }
  return byProvider
}

export async function resolveAssistantRoute(
  userId: string,
  options: ResolveAssistantRouteOptions = {},
): Promise<AssistantRoute> {
  const routeModel =
    'routeModel' in options
      ? options.routeModel
      : await getAssistantRouteModelByUserId(userId)
  const pinned = getAssistantRouteModelEntry(routeModel)
  const keys = await newestKeyByProvider(userId)
  const picked = pinned ?? pickAutoAssistantRouteModel(keys.keys())
  if (!picked) {
    throw new ApiKeyError(
      'missing',
      'No assistant model has a key yet (Gemini, DeepSeek, OpenAI, Claude or Grok). Nothing ran.',
    )
  }
  const apiKeyId = keys.get(picked.adapterType)
  if (!apiKeyId) {
    throw new AssistantModelKeyMissingError(picked.adapterType, picked.modelId)
  }
  const fastModelId =
    !pinned && options.questionTurn && isAssistantProvider(picked.adapterType)
      ? ASSISTANT_AUTO_QUESTION_MODEL_IDS[picked.adapterType]
      : undefined
  const fastEntry = fastModelId
    ? getAssistantRouteModelEntry(fastModelId)
    : null
  const model = fastEntry ?? picked
  return {
    route: await resolveLlmTextRoute(userId, apiKeyId),
    apiKeyId,
    modelId: model.modelId,
    modelLabel: model.label,
    auto: !pinned,
  }
}

/**
 * 这件事要看图：所选那一家、那个型号看得了就放行，看不了就抛
 * `AssistantModelCannotSeeError`（翻译过的一句「这个模型看不了图」）。⛔ 不借别家。
 */
export function assertAssistantRouteSeesImages(assistant: {
  route: Pick<ResolvedLlmTextRoute, 'adapterType'>
  modelId?: string
}): void {
  if (
    !assistantAdapterSupportsImage(
      assistant.route.adapterType,
      assistant.modelId,
    )
  ) {
    throw new AssistantModelCannotSeeError(
      assistant.route.adapterType,
      assistant.modelId ?? assistant.route.adapterType,
    )
  }
}
