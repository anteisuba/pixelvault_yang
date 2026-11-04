/**
 * 旧内核那几条入口（`prepareOperatorTurn` → `planTool` / `closeRoundV3`）真库测试共用的：
 * 一位带 Gemini key 的真用户、各台的请求。模型那一跳见 `@/test/int/fake-llm-text`。
 */
import { getPromptDialect } from '@/constants/prompt-dialects'
import { resolveAdapterType } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import { db } from '@/lib/db'
import { createTestUser, seedAssistantKey } from '@/test/int/db'

export type OperatorUser = Awaited<ReturnType<typeof createTestUser>>

export async function operatorUser(): Promise<OperatorUser> {
  const user = await createTestUser()
  await seedAssistantKey(user.id, AI_ADAPTER_TYPES.GEMINI)
  return user
}

/** 这位用户的一张画布（画布台的工作区要真有这个项目）。 */
export async function canvasProject(userId: string): Promise<string> {
  const project = await db.nodeWorkflowProject.create({
    data: { userId, name: '短片', state: { nodes: [], edges: [] } },
  })
  return project.id
}

export const SNAPSHOT: AssistantOperatorRequest['snapshot'] = {
  prompt: '',
  negativePrompt: '',
  model: { id: 'seedream-4', label: 'Seedream 4' },
  availableModels: [
    { id: 'seedream-4', label: 'Seedream 4' },
    { id: 'flux-pro', label: 'FLUX Pro' },
  ],
  specs: {
    aspectRatio: '1:1',
    resolution: 'auto',
    aspectRatioOptions: ['1:1', '16:9'],
    resolutionOptions: ['auto', '2K'],
  },
  count: { value: 1, options: [1, 2, 4] },
  references: { items: [], limit: 4 },
}

export const LORA_SNAPSHOT: AssistantOperatorRequest['snapshot'] = {
  prompt: '',
  negativePrompt: '',
  model: { id: 'illustrious-xl', label: 'Illustrious XL' },
  availableModels: [
    { id: 'illustrious-xl', label: 'Illustrious XL' },
    { id: 'anima-dit-base-v10-runner', label: 'Anima DiT' },
  ],
  references: { items: [], limit: 2 },
  loras: {
    items: [
      {
        id: 'lora-asset-1',
        name: 'Ink Lines',
        weight: 0.8,
        enabled: true,
        family: 'illustrious',
        compatible: true,
        triggerWord: 'ink lines',
        triggerEnabled: true,
        recommendedPrompt: null,
        sourcePrompts: [],
      },
    ],
    baseFamily: 'illustrious',
    minWeight: 0.1,
    maxWeight: 2,
  },
}

/** 一轮请求；工作区按台推（画布要给 `projectId`）。 */
export function operatorRequest(
  overrides: Partial<AssistantOperatorRequest> = {},
  projectId = '',
): AssistantOperatorRequest {
  const domain = overrides.domain ?? 'image'
  const snapshot = overrides.snapshot ?? SNAPSHOT
  const workspaceKey =
    domain === 'canvas'
      ? `canvas:${projectId}`
      : domain === 'image'
        ? getPromptDialect(
            resolveAdapterType(snapshot.model?.id ?? '') ?? undefined,
          ) === 'tags'
          ? 'image-tags'
          : 'image-natural'
        : domain
  return {
    messages: [{ role: 'user', content: '帮我把这张海报配好' }],
    domain: 'image',
    snapshot: SNAPSHOT,
    workspaceKey,
    ...overrides,
  }
}
