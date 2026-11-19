import {
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
  ASSISTANT_OPERATOR_WRITE_MODES,
} from '@/constants/assistant-operator'
import type {
  AssistantOperatorAppliedStep,
  AssistantOperatorPriorStep,
  AssistantOperatorSnapshot,
} from '@/types/assistant-operator'

/**
 * **改完读回**（11-18 真机：让她把比例改成 16:9，她说「已改成 16:9」，台上仍是 1:1）。
 *
 * ── 为什么以前会说假话 ────────────────────────────────────────────
 * 工作台的改动由服务端规划、浏览器落表单；edit 的回执（含「BENCH NOW」那一句）却是服务端当场
 * 按**自己记的那份**（`run.state`，每一步 `apply()` 写它）写的 —— 浏览器那头落没落、落下之后
 * 有没有被别的东西改回去，模型一个字都不知道。浏览器落不下（`applyOperatorStep` 回 `null`）
 * 在非画布台上还是静默的（画布那一支才标错）。
 *
 * ── 现在 ─────────────────────────────────────────────────────────
 * 工作台上改了表单的 edit 停在 `bench_sync`：浏览器落完，带着**落下之后从表单现读的快照**
 * 接下一跳；这里拿这份快照逐项对「请求的值」，对不上就写「请求 X，实际 Y，原因 Z」。原因按
 * 能知道的写：浏览器落的时候拒了（priorSteps 里那一步的 detail）/ 值不在这个模型的候选里 /
 * 落下之后又被改回去了。
 * ⛔ 别拿请求里的值当「实际」：实际只认快照。
 *
 * ── 网图挂参考（`import_user_url`，11-19 真机）─────────────────────
 * 取图 / 落 R2 在浏览器那头（`use-operator-user-url-mount`），要几秒、会失败（站方拒下载）。
 * 以前它不进读回：服务端当场写「已挂上」，浏览器取不回来只在线程里插一行系统回执，模型照样说
 * 「挂好了」。现在它也停在 `bench_sync`；浏览器**等取图有结论**才接下一跳，取不回来就把这一步
 * 标成 error、detail 写原因。快照里认不出「这一张是不是那条源地址」（落地地址是取完才有的），
 * 所以这一格的「落没落」认浏览器标的那一步，「实际」写参考位现在几张。
 */

/** 会改表单、能按快照逐项读回的那几种步。 */
const READBACK_TOOLS = [
  TOOL.setModel,
  TOOL.setPrompt,
  TOOL.setNegative,
  TOOL.setSpecs,
  TOOL.setVideoSpecs,
  TOOL.setCount,
  TOOL.importUserUrl,
] as const

type ReadbackTool = (typeof READBACK_TOOLS)[number]

export type BenchReadbackStep = Extract<
  AssistantOperatorAppliedStep,
  { tool: ReadbackTool }
>

/**
 * 接力条里存的那一份：只留读回要用的几格（工具 + 载荷 + 标题）。
 * ⚠ 必须逐个成员 Pick（分配式）：直接 `Pick<联合>` 会把 tool 与 payload 拆开，switch 收窄不了。
 */
type RequestOf<S> = S extends BenchReadbackStep
  ? Pick<S, 'tool' | 'payload' | 'title'>
  : never
export type BenchReadbackRequest = RequestOf<BenchReadbackStep>

export function isBenchReadbackStep(
  step: AssistantOperatorAppliedStep,
): step is BenchReadbackStep {
  return (READBACK_TOOLS as readonly string[]).includes(step.tool)
}

export function toBenchReadbackRequest(
  step: BenchReadbackStep,
): BenchReadbackRequest {
  const { tool, payload, title } = step
  // 解构后 TS 丢了 tool ↔ payload 的对应关系；三格原样取自同一步，对应关系不变。
  return { tool, payload, title } as BenchReadbackRequest
}

export interface BenchReadback {
  /** 交给模型的那几行（「READ BACK FROM THE BENCH」开头）。 */
  readonly text: string
  /** 对不上的格数（0 = 全部按请求落下）。 */
  readonly mismatched: number
}

interface Check {
  readonly name: string
  readonly requested: string
  readonly actual: string
  readonly landed: boolean
  /** 值不在这个模型此刻的候选里时的那张表（说原因用）。 */
  readonly options?: readonly string[]
}

const NOT_SET = '(not set)'

function shown(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === ''
    ? NOT_SET
    : String(value)
}

/** 清晰度「不设」（`null`）与表单的不设态 `auto` 是同一件事。 */
function sameResolution(
  requested: string | null,
  actual: string | null | undefined,
): boolean {
  const norm = (value: string | null | undefined) =>
    value === null || value === undefined || value === 'auto' ? null : value
  return norm(requested) === norm(actual)
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat || '(empty)'
}

/** 提示词 / 负面：整段换的要逐字一样，追加的要在末尾，只改几处的要每处换上的字都在。 */
function textLanded(
  payload: Extract<
    BenchReadbackRequest,
    { tool: typeof TOOL.setPrompt }
  >['payload'],
  actual: string,
): boolean {
  const now = actual.trim()
  if (payload.edits?.length)
    return (
      now === payload.value.trim() ||
      payload.edits.every((edit) => now.includes(edit.replace.trim()))
    )
  if (payload.mode === ASSISTANT_OPERATOR_WRITE_MODES.append)
    return now.endsWith(payload.value.trim())
  return now === payload.value.trim()
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function checksOf(
  request: BenchReadbackRequest,
  snapshot: AssistantOperatorSnapshot,
  /** 这一步浏览器标的失败原因（只给 `import_user_url` 用：它的落没落认浏览器那一步）。 */
  refusal: string | undefined,
): Check[] {
  switch (request.tool) {
    case TOOL.importUserUrl: {
      const references = snapshot.references
      const now = references
        ? `${references.items.length}/${references.limit} reference pictures on the bench now`
        : 'no reference slots on the bench'
      return [
        {
          name: 'reference picture',
          requested: `mount the picture from ${request.payload.domain ?? hostOf(request.payload.url)}`,
          actual:
            refusal === undefined ? `mounted (${now})` : `NOT mounted (${now})`,
          landed: refusal === undefined,
        },
      ]
    }
    case TOOL.setModel: {
      const actual = snapshot.model?.id ?? null
      return [
        {
          name: 'model',
          requested: request.payload.modelLabel ?? request.payload.modelId,
          actual: snapshot.model
            ? (snapshot.model.label ?? snapshot.model.id)
            : NOT_SET,
          landed: actual === request.payload.modelId,
        },
      ]
    }
    case TOOL.setPrompt:
      return [
        {
          name: 'prompt',
          requested: clip(request.payload.value),
          actual: clip(snapshot.prompt),
          landed: textLanded(request.payload, snapshot.prompt),
        },
      ]
    case TOOL.setNegative:
      return [
        {
          name: 'negative',
          requested: clip(request.payload.value),
          actual: clip(snapshot.negativePrompt ?? ''),
          landed: textLanded(request.payload, snapshot.negativePrompt ?? ''),
        },
      ]
    case TOOL.setSpecs: {
      const specs = snapshot.specs
      const checks: Check[] = [
        {
          name: 'aspect ratio',
          requested: request.payload.aspectRatio,
          actual: shown(specs?.aspectRatio),
          landed: specs?.aspectRatio === request.payload.aspectRatio,
          ...(specs ? { options: specs.aspectRatioOptions } : {}),
        },
        {
          name: 'resolution',
          requested: shown(request.payload.resolution),
          actual: shown(specs?.resolution),
          landed: sameResolution(request.payload.resolution, specs?.resolution),
          ...(specs?.resolutionOptions.length
            ? { options: specs.resolutionOptions }
            : {}),
        },
      ]
      if (request.payload.quality !== undefined)
        checks.push({
          name: 'quality',
          requested: request.payload.quality,
          actual: shown(specs?.quality),
          landed: specs?.quality === request.payload.quality,
        })
      return checks
    }
    case TOOL.setVideoSpecs: {
      const specs = snapshot.videoSpecs
      const checks: Check[] = []
      if (request.payload.durationSeconds !== null)
        checks.push({
          name: 'duration',
          requested: `${request.payload.durationSeconds}s`,
          actual:
            specs?.durationSeconds != null
              ? `${specs.durationSeconds}s`
              : NOT_SET,
          landed: specs?.durationSeconds === request.payload.durationSeconds,
          ...(specs
            ? { options: specs.durationOptions.map((value) => `${value}s`) }
            : {}),
        })
      if (request.payload.aspectRatio !== null)
        checks.push({
          name: 'aspect ratio',
          requested: request.payload.aspectRatio,
          actual: shown(specs?.aspectRatio),
          landed: specs?.aspectRatio === request.payload.aspectRatio,
          ...(specs ? { options: specs.aspectRatioOptions } : {}),
        })
      if (request.payload.resolution !== null)
        checks.push({
          name: 'resolution',
          requested: request.payload.resolution,
          actual: shown(specs?.resolution),
          landed: specs?.resolution === request.payload.resolution,
          ...(specs ? { options: specs.resolutionOptions } : {}),
        })
      return checks
    }
    case TOOL.setCount:
      return [
        {
          name: 'pictures per run',
          requested: String(request.payload.count),
          actual: shown(snapshot.count?.value),
          landed: snapshot.count?.value === request.payload.count,
          ...(snapshot.count
            ? { options: snapshot.count.options.map(String) }
            : {}),
        },
      ]
  }
}

interface Refusal {
  readonly summary: string
  readonly reason: string
  taken: boolean
}

/** 浏览器落这一步时拒了：priorSteps 里同一轮、同一工具、标成 error 的那一条（按顺序一一对上）。 */
function refusalsByTool(
  priorSteps: readonly AssistantOperatorPriorStep[],
): Map<string, Refusal[]> {
  const refusals = new Map<string, Refusal[]>()
  for (const step of priorSteps) {
    if (
      !step.thisTurn ||
      step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.error
    )
      continue
    const list = refusals.get(step.tool) ?? []
    list.push({
      summary: step.summary,
      reason: step.detail ?? step.rejectReason ?? 'the bench refused it',
      taken: false,
    })
    refusals.set(step.tool, list)
  }
  return refusals
}

/**
 * 认领一条拒绝：同标题的优先（同一跳挂两张网图、只有第二张取不回来时，⛔ 按顺序会记到第一张头上），
 * 认不出再按顺序取第一条没认领、也不是别的请求同标题的那条（撤销过的步标题会变，靠这一档认）。
 */
function takeRefusal(
  list: readonly Refusal[],
  title: string,
  requestedTitles: ReadonlySet<string>,
): string | undefined {
  const refusal =
    list.find((item) => !item.taken && item.summary === title) ??
    list.find((item) => !item.taken && !requestedTitles.has(item.summary))
  if (!refusal) return undefined
  refusal.taken = true
  return refusal.reason
}

function reasonOf(check: Check, refusal: string | undefined): string {
  if (refusal) return refusal
  if (check.options && !check.options.includes(check.requested))
    return `"${check.requested}" is not an option for the model on the bench now (options: ${check.options.join(', ') || 'none'})`
  return 'it was written, but the bench does not show it now (something on the bench changed it back, or the model on the bench does not keep it)'
}

/**
 * 按「落下之后从表单现读的快照」逐项读回 edit 请求的那几格。
 * ⭐ 「实际」一律取快照；对不上的写「请求 X，实际 Y，原因 Z」。
 */
export function readBackBench(input: {
  readonly requested: readonly BenchReadbackRequest[]
  readonly snapshot: AssistantOperatorSnapshot
  readonly priorSteps: readonly AssistantOperatorPriorStep[]
}): BenchReadback {
  const refusals = refusalsByTool(input.priorSteps)
  const requestedTitles = new Set(
    input.requested.map((request) => request.title),
  )
  const lines: string[] = []
  let mismatched = 0
  for (const request of input.requested) {
    const refusalList = refusals.get(request.tool) ?? []
    // 网图挂参考：落没落只认浏览器标的那一步（快照认不出是哪一张），先认领再判。
    const fetchFailure =
      request.tool === TOOL.importUserUrl
        ? takeRefusal(refusalList, request.title, requestedTitles)
        : undefined
    const checks = checksOf(request, input.snapshot, fetchFailure)
    const misses = checks.filter((check) => !check.landed)
    const refusal =
      request.tool === TOOL.importUserUrl
        ? fetchFailure
        : misses.length
          ? takeRefusal(refusalList, request.title, requestedTitles)
          : undefined
    for (const check of checks) {
      if (check.landed) {
        lines.push(`- ${check.name}: ${check.actual} (as requested)`)
        continue
      }
      mismatched += 1
      lines.push(
        `- ${check.name}: NOT CHANGED AS ASKED — requested ${check.requested}, actually ${check.actual}; reason: ${reasonOf(check, refusal)}`,
      )
    }
  }
  const head =
    mismatched > 0
      ? `READ BACK FROM THE BENCH (the form as it is now, after the browser applied this edit): ${mismatched} value${mismatched === 1 ? '' : 's'} did NOT land as requested. Tell the creator plainly which ones did not change and what they are now; never say they were changed.`
      : 'READ BACK FROM THE BENCH (the form as it is now, after the browser applied this edit): everything landed as requested.'
  return { text: [head, ...lines].join('\n'), mismatched }
}
