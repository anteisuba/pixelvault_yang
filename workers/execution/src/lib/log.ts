/**
 * Worker 结构化日志（o-worker 第 7 步「看得见」）。
 *
 * 只打一种对象：每个 step 真正执行一次就记一条（replay 时引擎直接拿缓存结果、不进回调，
 * 所以不会重复记）。Workers Logs 按字段建索引，在 Cloudflare 后台按 `runId` 一查，
 * 就能看到这一单每一步花了多久、第几次尝试、失败在哪家哪一步、错误码是什么。
 *
 * ⚠ 只放能公开的字段：⛔ 不记 key、提示词、图片地址、服务商返回原文。
 */

/** 一次运行贯穿始终的那几项：runId 和应用侧 GenerationJob / 回调里的同一个。 */
export interface RunLogFields {
  runId: string
  workflowId: string
  providerId: string
  modelId?: string
  outputType?: string
}

export type StepOutcome = 'ok' | 'retry' | 'failed'

export interface StepLogEntry extends RunLogFields {
  event: 'workflow_step'
  step: string
  attempt: number
  durationMs: number
  outcome: StepOutcome
  errorCode?: string
  phase?: string
  httpStatus?: number
  error?: string
}

const MAX_ERROR_LENGTH = 200

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

/** 从派发参数里挑出日志字段；参数形状不对也不抛（日志 ⛔ 拖垮生成）。 */
export function runLogFields(context: unknown): RunLogFields | undefined {
  if (typeof context !== 'object' || context === null) return undefined
  const record = context as Record<string, unknown>
  const runId = readString(record.runId)
  if (!runId) return undefined
  const input =
    typeof record.providerInput === 'object' && record.providerInput !== null
      ? (record.providerInput as Record<string, unknown>)
      : {}
  return {
    runId,
    workflowId: readString(record.workflowId) ?? 'unknown',
    providerId: readString(record.providerId) ?? 'unknown',
    modelId: readString(input.modelId),
    outputType: readString(record.outputType),
  }
}

export function truncateErrorMessage(message: string): string {
  return message.length > MAX_ERROR_LENGTH
    ? `${message.slice(0, MAX_ERROR_LENGTH)}…`
    : message
}

export function logStep(entry: StepLogEntry): void {
  try {
    if (entry.outcome === 'ok') console.log(entry)
    else console.warn(entry)
  } catch {
    // 日志本身失败不影响生成。
  }
}
