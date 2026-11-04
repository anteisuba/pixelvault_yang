/**
 * 新内核（`runAssistantNext`）真库测试共用的那几样：一位带 DeepSeek key 的真用户、各台的请求、
 * 收事件、读库里的过程记录。模型那一头见 `fake-model.ts`；`next/server` 的 `after` 由测试文件替成
 * 只排队（`afterTasks`），⛔ 响应后的那几件（学说法、反思、口味、摘要、调用日志）这里不跑。
 */
import type {
  AssistantOperatorEvent,
  AssistantOperatorRequest,
} from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'
import { db } from '@/lib/db'
import { createTestUser, seedAssistantKey } from '@/test/int/db'

export type KernelUser = Awaited<ReturnType<typeof createTestUser>>

export async function kernelUser(): Promise<KernelUser> {
  const user = await createTestUser()
  await seedAssistantKey(user.id)
  return user
}

export const IMAGE_SNAPSHOT = {
  prompt: 'a girl in a garden',
  negativePrompt: '',
  model: { id: 'seedream-4', label: 'Seedream 4' },
  availableModels: [
    { id: 'seedream-4', label: 'Seedream 4' },
    { id: 'gpt-image-2', label: 'GPT Image 2' },
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

export function imageRequest(
  message: string,
  overrides: Partial<AssistantOperatorRequest> = {},
): AssistantOperatorRequest {
  return {
    workspaceKey: 'image-natural',
    domain: 'image',
    messages: [{ role: 'user', content: message }],
    snapshot: IMAGE_SNAPSHOT,
    ...overrides,
  } as AssistantOperatorRequest
}

export const LORA_SNAPSHOT = {
  prompt: '1girl',
  negativePrompt: '',
  model: { id: 'illustrious-xl', label: 'Illustrious XL' },
  availableModels: [{ id: 'illustrious-xl', label: 'Illustrious XL' }],
  references: { items: [], limit: 2 },
  loras: {
    items: [],
    baseFamily: 'illustrious',
    minWeight: 0.1,
    maxWeight: 2,
  },
}

export async function collect(
  events: AsyncIterable<AssistantOperatorEvent>,
): Promise<AssistantOperatorEvent[]> {
  const out: AssistantOperatorEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

/** 停下那一跳交给浏览器的接力条（下一跳原样带回 `v3.transcript`）。 */
export function relayOf(
  events: readonly AssistantOperatorEvent[],
): AssistantV3Transcript {
  const relay = events.find((event) => event.type === 'transcript')
  if (!relay || relay.type !== 'transcript')
    throw new Error('这一跳没有交接力条')
  return relay.transcript
}

export function stepsOf(events: readonly AssistantOperatorEvent[]) {
  return events.flatMap((event) => (event.type === 'step' ? [event.step] : []))
}

/** 一步的 payload（有的步骤类型没有这一格，统一读成 unknown）。 */
export function payloadOf(step: ReturnType<typeof stepsOf>[number]): unknown {
  return 'payload' in step ? step.payload : undefined
}

type TurnRecordRow = Awaited<
  ReturnType<typeof db.assistantTurnRecord.findMany>
>[number]

/**
 * 过程记录表里这位用户的那几行（按先后）。记录是不等的，读之前给它几拍落库；
 * 给了 `until` 就等到那几行满足它（同一轮后一跳是改写同一行）。
 */
export async function turnRecords(
  userId: string,
  until: (rows: TurnRecordRow[]) => boolean = (rows) => rows.length > 0,
) {
  let rows: TurnRecordRow[] = []
  for (let i = 0; i < 20; i += 1) {
    rows = await db.assistantTurnRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    })
    if (until(rows)) return rows
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return rows
}
