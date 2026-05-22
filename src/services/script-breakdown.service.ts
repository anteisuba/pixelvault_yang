import 'server-only'

import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import {
  SCRIPT_BREAKDOWN_LIMITS,
  SCRIPT_PLANNER_MODELS,
  SCRIPT_PLANNER_PROVIDERS,
  type ScriptPlannerProvider,
} from '@/constants/script-breakdown'
import {
  ScriptBreakdownResultSchema,
  type ScriptBreakdownRequest,
  type ScriptBreakdownResult,
  type ScriptBreakdownResponseData,
} from '@/types/script-breakdown'
import {
  findActiveKeyForAdapter,
  type ResolvedApiKeyValue,
} from '@/services/apiKey.service'
import { GenerateImageServiceError } from '@/services/generate-image.service'
import { llmTextCompletion } from '@/services/llm-text.service'
import { ensureUser } from '@/services/user.service'
import { getSystemApiKey } from '@/lib/platform-keys'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'

type PlannerAdapterType = AI_ADAPTER_TYPES.GEMINI | AI_ADAPTER_TYPES.OPENAI

interface PlannerRoute {
  adapterType: PlannerAdapterType
  modelId: string
  providerConfig: ResolvedApiKeyValue['providerConfig']
  apiKey: string
  label: string
}

const PLANNER_ADAPTER_ORDER: PlannerAdapterType[] = [
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.OPENAI,
]

export async function createScriptBreakdown(
  clerkId: string,
  input: ScriptBreakdownRequest,
): Promise<ScriptBreakdownResponseData> {
  const dbUser = await ensureUser(clerkId)
  const routes = await resolvePlannerRoutes(dbUser.id, input)

  if (routes.length === 0) {
    throw new GenerateImageServiceError(
      'MISSING_API_KEY',
      'No Gemini or OpenAI API key is available for script planning.',
      400,
    )
  }

  const userPrompt = buildScriptBreakdownUserPrompt(input)
  const failures: string[] = []

  for (const route of routes) {
    try {
      const breakdown = await generateScriptBreakdownForRoute(
        route,
        userPrompt,
        input,
        dbUser.id,
      )

      logger.info('Script breakdown generated', {
        userId: dbUser.id,
        adapterType: route.adapterType,
        modelId: route.modelId,
        characters: breakdown.characters.length,
        scenes: breakdown.scenes.length,
        beats: breakdown.beats.length,
        shots: breakdown.shots.length,
      })

      return {
        breakdown,
        planner: {
          adapterType: route.adapterType,
          modelId: route.modelId,
          label: route.label,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${route.adapterType}: ${message}`)
      logger.warn('Script breakdown planner failed', {
        userId: dbUser.id,
        adapterType: route.adapterType,
        modelId: route.modelId,
        error: message,
      })
    }
  }

  throw new GenerateImageServiceError(
    'PROVIDER_ERROR',
    `Script planning failed: ${failures.join('; ')}`,
    502,
  )
}

async function generateScriptBreakdownForRoute(
  route: PlannerRoute,
  userPrompt: string,
  input: ScriptBreakdownRequest,
  userId: string,
): Promise<ScriptBreakdownResult> {
  const raw = await requestPlannerText(route, userPrompt)

  try {
    return parseScriptBreakdown(raw)
  } catch (error) {
    if (!isRecoverablePlannerOutputError(error)) {
      throw error
    }

    const message = error instanceof Error ? error.message : String(error)
    logger.warn('Script breakdown output invalid, retrying compact plan', {
      userId,
      adapterType: route.adapterType,
      modelId: route.modelId,
      error: message,
    })

    const retryRaw = await requestPlannerText(
      route,
      buildCompactScriptBreakdownUserPrompt(input, message),
    )
    return parseScriptBreakdown(retryRaw)
  }
}

async function requestPlannerText(
  route: PlannerRoute,
  userPrompt: string,
): Promise<string> {
  return withRetry(
    () =>
      llmTextCompletion({
        systemPrompt: SCRIPT_BREAKDOWN_SYSTEM_PROMPT,
        userPrompt,
        adapterType: route.adapterType,
        providerConfig: route.providerConfig,
        apiKey: route.apiKey,
        modelId: route.modelId,
        maxTokens: SCRIPT_BREAKDOWN_LIMITS.LLM_MAX_OUTPUT_TOKENS,
        responseFormat: 'json_object',
      }),
    { maxAttempts: 2, label: `scriptBreakdown.${route.adapterType}` },
  )
}

async function resolvePlannerRoutes(
  userId: string,
  input: ScriptBreakdownRequest,
): Promise<PlannerRoute[]> {
  if (input.apiKeyId) {
    const route = await resolveSpecificPlannerKey(
      userId,
      input.apiKeyId,
      input.plannerProvider,
    )
    return route ? [route] : []
  }

  const requestedAdapters =
    input.plannerProvider === SCRIPT_PLANNER_PROVIDERS.AUTO
      ? PLANNER_ADAPTER_ORDER
      : [input.plannerProvider]

  const routes: PlannerRoute[] = []
  for (const adapterType of requestedAdapters) {
    const userKey = await findActiveKeyForAdapter(userId, adapterType)
    if (userKey) {
      routes.push(toPlannerRoute(userKey))
      continue
    }

    const systemKey = getSystemApiKey(adapterType)
    if (systemKey) {
      routes.push({
        adapterType,
        modelId: SCRIPT_PLANNER_MODELS[adapterType],
        providerConfig: getDefaultProviderConfig(adapterType),
        apiKey: systemKey,
        label: `${getDefaultProviderConfig(adapterType).label} (platform)`,
      })
    }
  }

  return routes
}

async function resolveSpecificPlannerKey(
  userId: string,
  apiKeyId: string,
  providerPreference: ScriptPlannerProvider,
): Promise<PlannerRoute | null> {
  const { getApiKeyValueById } = await import('@/services/apiKey.service')
  const key = await getApiKeyValueById(apiKeyId, userId)
  if (!key) return null

  if (!isPlannerAdapterType(key.adapterType)) return null

  if (
    providerPreference !== SCRIPT_PLANNER_PROVIDERS.AUTO &&
    providerPreference !== key.adapterType
  ) {
    return null
  }

  return toPlannerRoute(key)
}

function toPlannerRoute(key: ResolvedApiKeyValue): PlannerRoute {
  if (!isPlannerAdapterType(key.adapterType)) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'The selected API key does not support script planning.',
      400,
    )
  }

  return {
    adapterType: key.adapterType,
    modelId: SCRIPT_PLANNER_MODELS[key.adapterType],
    providerConfig: key.providerConfig,
    apiKey: key.keyValue,
    label: key.label,
  }
}

function isPlannerAdapterType(
  adapterType: AI_ADAPTER_TYPES,
): adapterType is PlannerAdapterType {
  return (
    adapterType === AI_ADAPTER_TYPES.GEMINI ||
    adapterType === AI_ADAPTER_TYPES.OPENAI
  )
}

function parseScriptBreakdown(raw: string) {
  const cleaned = stripMarkdownFences(raw)
  let parsed: unknown

  try {
    parsed = JSON.parse(cleaned)
  } catch (error) {
    throw new Error(
      `Planner output was not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  const result = ScriptBreakdownResultSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Planner output failed schema validation: ${result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    )
  }

  assertReferenceIntegrity(result.data)
  return result.data
}

function isRecoverablePlannerOutputError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.message.startsWith('Planner output was not valid JSON') ||
    error.message.startsWith('Planner output failed schema validation') ||
    error.message.includes('references unknown')
  )
}

function assertReferenceIntegrity(breakdown: ScriptBreakdownResult): void {
  const characterIds = new Set(breakdown.characters.map((item) => item.id))
  const sceneIds = new Set(breakdown.scenes.map((item) => item.id))
  const beatIds = new Set(breakdown.beats.map((item) => item.id))

  for (const action of breakdown.actions) {
    assertKnownIds(action.actorIds, characterIds, `action ${action.id} actors`)
    if (!sceneIds.has(action.sceneId)) {
      throw new Error(`action ${action.id} references unknown scene`)
    }
  }

  for (const beat of breakdown.beats) {
    assertKnownIds(
      beat.characterIds,
      characterIds,
      `beat ${beat.id} characters`,
    )
    if (!sceneIds.has(beat.sceneId)) {
      throw new Error(`beat ${beat.id} references unknown scene`)
    }
  }

  for (const shot of breakdown.shots) {
    assertKnownIds(
      shot.requiredCharacterIds,
      characterIds,
      `shot ${shot.id} characters`,
    )
    if (!sceneIds.has(shot.requiredSceneId)) {
      throw new Error(`shot ${shot.id} references unknown scene`)
    }
    if (!beatIds.has(shot.beatId)) {
      throw new Error(`shot ${shot.id} references unknown beat`)
    }
  }
}

function assertKnownIds(
  ids: string[],
  knownIds: Set<string>,
  label: string,
): void {
  const unknownId = ids.find((id) => !knownIds.has(id))
  if (unknownId) {
    throw new Error(`${label} include unknown id ${unknownId}`)
  }
}

function stripMarkdownFences(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function buildScriptBreakdownUserPrompt(input: ScriptBreakdownRequest): string {
  return [
    `Locale: ${input.locale}`,
    `Idea: ${input.idea}`,
    '',
    'Create an original, controllable video planning breakdown from this idea.',
    'If the idea references an existing work, extract the reusable tone, structure, relationship dynamic, camera language, or scene mood. Do not copy proprietary names, exact dialogue, exact characters, or unique plot beats.',
    'Every beat must describe visible action that can be filmed in 4-15 seconds.',
    'Every shot must include a concrete startState and endState that can later become first/last frame prompts when a video model supports them.',
    'Keep the first pass compact: 2-4 characters, 1-2 scenes, 4-6 beats, and exactly 1 shot per beat.',
    'Avoid long prose. Prefer short phrases that can become reusable cards.',
  ].join('\n')
}

function buildCompactScriptBreakdownUserPrompt(
  input: ScriptBreakdownRequest,
  previousError: string,
): string {
  return [
    `Locale: ${input.locale}`,
    `Idea: ${input.idea}`,
    '',
    'The previous output could not be used.',
    `Validation error: ${previousError.slice(0, 500)}`,
    '',
    'Regenerate from scratch as compact valid JSON only.',
    'Hard limits for this retry: 2-3 characters, 1-2 scenes, 3-5 actions, 3-5 beats, exactly 1 shot per beat.',
    'Every id reference must point to an existing id in the same JSON.',
    'Do not include markdown, comments, trailing commas, or unfinished strings.',
  ].join('\n')
}

const SCRIPT_BREAKDOWN_SYSTEM_PROMPT = `You are PixelVault's senior video planning agent.

Return ONLY valid JSON. Do not wrap in markdown.

Output schema:
{
  "title": "short project title",
  "logline": "one-sentence original premise",
  "referenceIntent": {
    "referenceName": "optional referenced work/name if the user mentioned one",
    "summary": "what the user wants to borrow at an abstract level",
    "borrowAspects": ["tone" | "plot_structure" | "relationship_dynamic" | "scene_mood" | "camera_language" | "world_rules"],
    "copyRisk": "low" | "medium" | "high",
    "rewriteGuidance": "how to keep it original and usable"
  },
  "characters": [
    {
      "id": "char_a",
      "label": "A",
      "nameSuggestion": "original name",
      "role": "story role",
      "functionInStory": "what this character does structurally",
      "personality": "concise personality",
      "visualSeed": "visual design seed for a reusable character card",
      "goal": "clear scene-level goal"
    }
  ],
  "scenes": [
    {
      "id": "scene_1",
      "label": "short scene label",
      "locationType": "place type",
      "timeOfDay": "time",
      "mood": "mood",
      "lighting": "lighting direction",
      "keyProps": ["prop"],
      "visualSeed": "visual design seed for a reusable background card"
    }
  ],
  "actions": [
    {
      "id": "action_1",
      "actorIds": ["char_a"],
      "sceneId": "scene_1",
      "verb": "visible verb",
      "object": "object or target",
      "consequence": "what changes because of the action"
    }
  ],
  "beats": [
    {
      "id": "beat_1",
      "orderIndex": 0,
      "title": "short beat title",
      "durationSec": 6,
      "sceneId": "scene_1",
      "characterIds": ["char_a"],
      "visibleAction": "concrete visible action, no abstract prose",
      "emotionalTurn": "what changes emotionally",
      "consequence": "what this beat sets up"
    }
  ],
  "shots": [
    {
      "id": "shot_1",
      "beatId": "beat_1",
      "orderIndex": 0,
      "shotType": "establishing" | "wide" | "medium" | "closeup" | "reaction",
      "cameraMotion": "camera movement",
      "startState": "first-frame state",
      "endState": "last-frame state",
      "requiredCharacterIds": ["char_a"],
      "requiredSceneId": "scene_1",
      "referenceNeed": "none" | "character" | "scene" | "first_frame" | "last_frame" | "first_and_last_frame" | "multi_reference"
    }
  ]
}

Constraints:
- Use the requested locale for user-facing text values.
- Generate 2-4 characters, 1-2 scenes, 4-6 actions, 4-6 beats, and exactly 1 shot per beat unless the user explicitly asks for a longer sequence.
- Keep string values concise. The UI will expand cards later, so do not write long paragraphs.
- IDs must be stable snake_case tokens.
- Keep all content original even when a reference is provided.
- Do not include unsafe or policy-evading wording.`
