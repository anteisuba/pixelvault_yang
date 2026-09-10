/**
 * **断点续跑**的纯函数层（第三期，owner 2026-09-07 定）。
 *
 * ── 它解决的是什么 ────────────────────────────────────────────────
 * 一份六步的计划批下去，跑到第四步断了（provider 抽风 / 网掉了 / 用户按了 ⏹ /
 * 刷新了一下页面）。今天唯一的出路是把那句话再说一遍 —— 服务端零会话态，它会
 * 从第一步重新规划一遍，前三步的时间与 credits 白花一次。这一层把「哪几步已经
 * 做完了」落到浏览器上，于是「继续」是真的继续。
 *
 * ── 三条判据 ────────────────────────────────────────────────────
 * ① **按 scope 分键**（项目 id / 工作台 surface）：一个全局键的下场是 A 项目里
 *    失败的计划跑到 B 项目上问「要继续吗」，而它每一步引用的产物在 B 里都不存在。
 * ② **读不动就整条丢**：localStorage 里那段字符串可能是上一个版本写的、也可能被
 *    人手改过。解不出来返回 `null`，⛔ 不做迁移分支、⛔ 不抛 —— 一份坏掉的续跑
 *    记录不值得让整个面板挂掉。
 * ③ **纯函数**：除了 `localStorage` 自身，不碰 DOM / store / 网络。时钟由调用方
 *    传进来（`now`），于是保质期与「刚失败」两条判据在单测里都钉得死。
 *
 * ⛔ **它不管钱**：续跑照旧走 `confirm` 生成确认（owner 定）。这一层连
 * 「这一步要不要花钱」都不知道 —— 它只知道哪几步做完了。
 */

import {
  ASSISTANT_OPERATOR_RESUME_LIMITS,
  ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS,
} from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_RESUME,
  STUDIO_OPERATOR_RESUME_TTL_MS,
} from '@/constants/studio-assistant-operator'
import type { AssistantOperatorResumeFrom } from '@/types/assistant-operator'
import {
  StudioOperatorResumePlanSchema,
  type StudioOperatorResumePlan,
  type StudioOperatorResumeStep,
} from '@/types/studio-operator-resume'

/**
 * 这份记录存在哪一格。
 *
 * ⚠ scope 里的分隔符与前缀一致（`.`）：拼出来的键在 devtools 的存储面板里是可
 * 排序的一列，一眼能看出「同一个前缀下有几个项目」。
 */
export function operatorResumeStorageKey(scope: string): string {
  return `${STUDIO_OPERATOR_RESUME.keyPrefix}.${scope}`
}

/**
 * 从 localStorage 读回这个 scope 的那份计划。
 *
 * `null` 的四种来路，⚠ **一律安静**（⛔ 不 throw、⛔ 不 console.error）：
 *  · 没存过；· 存的不是 JSON；· 形状对不上（旧版本 / 人手改过）；· 过期了。
 * ⚠ SSR 里 `localStorage` 不存在 —— 直接返回 `null`，⛔ 不给 `typeof window` 之外
 *   的兜底：面板本来就是 `'use client'`，而 store 的 `getServerSnapshot` 从不读它。
 */
export function readOperatorResume(
  scope: string,
  now: number,
): StudioOperatorResumePlan | null {
  let raw: string | null = null
  try {
    raw =
      globalThis.localStorage?.getItem(operatorResumeStorageKey(scope)) ?? null
  } catch {
    return null
  }
  if (!raw) return null

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    return null
  }

  const parsed = StudioOperatorResumePlanSchema.safeParse(parsedJson)
  if (!parsed.success) return null

  const updatedAt = Date.parse(parsed.data.updatedAt)
  if (!Number.isFinite(updatedAt)) return null
  if (now - updatedAt > STUDIO_OPERATOR_RESUME_TTL_MS) return null

  return parsed.data
}

/**
 * 落一份计划。
 *
 * ⚠ **先过一次自己的 schema 再写**：写进去一份读不回来的值，等于把那一格永久
 * 变成噪音（读的那一侧只会安静地返回 null，没有人会发现）。
 * ⚠ 写不进去（无痕模式 / 配额满）**不抛**：续跑是锦上添花，⛔ 不许它把用户正在
 * 跑的那一轮掀翻。
 */
export function writeOperatorResume(
  scope: string,
  plan: StudioOperatorResumePlan,
): boolean {
  const parsed = StudioOperatorResumePlanSchema.safeParse(plan)
  if (!parsed.success) return false
  try {
    globalThis.localStorage?.setItem(
      operatorResumeStorageKey(scope),
      JSON.stringify(parsed.data),
    )
    return true
  } catch {
    return false
  }
}

/** 这份计划跑完了（或用户开了新话题）—— 那一格就该空着。 */
export function clearOperatorResume(scope: string): void {
  try {
    globalThis.localStorage?.removeItem(operatorResumeStorageKey(scope))
  } catch {
    // 同 write：清不掉不值得让任何调用方失败。
  }
}

/**
 * 这份计划还有没有没跑完的步。
 *
 * ⚠ `failed` 也算「没跑完」：它正是续跑最想接住的那一档。
 */
export function hasUnfinishedSteps(plan: StudioOperatorResumePlan): boolean {
  return plan.steps.some(
    (step) => step.state !== ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS.done,
  )
}

/**
 * 从第几步接着跑 —— **1 起数**，写在按钮上（「从第 4 步继续」）。
 *
 * ⚠ 取的是**第一个没做完的**，⛔ 不是最后一个 done 的下一个：中间有一步被跳过
 * （模型换了顺序）时，后者会把那一步永远漏掉。
 * ⚠ 全做完了返回 `null` —— 调用方据此不渲染按钮。
 */
export function nextResumeStepNumber(
  plan: StudioOperatorResumePlan,
): number | null {
  const index = plan.steps.findIndex(
    (step) => step.state !== ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS.done,
  )
  return index < 0 ? null : index + 1
}

/**
 * **下一个该有结论的那一步的 id**。
 *
 * ⭐ 驱动 hook 靠它把服务端的工具步映射回计划步：两边**不是一一对应的**
 * （一条计划里的「找参考」可能跑两次搜索），所以映射按「第一个还没有结论的」
 * 走 —— 与进度带 `stepsDone / plannedSteps` 那条读数同一个口径。⛔ 别按下标
 * 硬配：模型多跑一步，后面每一步的状态都会错位一格。
 */
export function firstUnfinishedStepId(
  plan: StudioOperatorResumePlan,
): string | null {
  return (
    plan.steps.find(
      (step) => step.state !== ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS.done,
    )?.id ?? null
  )
}

/** 挂掉的那一步（续跑按钮旁边那句原因读它）。⚠ 只取第一条：一轮只会挂一次。 */
export function failedResumeStep(
  plan: StudioOperatorResumePlan,
): StudioOperatorResumeStep | null {
  return (
    plan.steps.find(
      (step) => step.state === ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS.failed,
    ) ?? null
  )
}

/**
 * 整份记录 → **发上去的那一截**（协议侧的 `resumeFrom`）。
 *
 * ⚠ 只带 `done` 的那几步，且**按原顺序**：模型读的是一段「你已经做完了这些」，
 * 顺序错了它会以为自己是从中间开始的。
 * ⚠ 一步都没做完就返回 `null` —— 那不是续跑，是普通的重跑（schema 那边
 * `.min(1)` 也会拒）。
 * ⚠ 超过 `maxSteps` 时**截前面那一段**（`slice(0, max)`）：早做的那几步是后面
 * 每一步的前提，砍掉开头等于让模型看到一段没有来路的中间态。
 */
export function toResumeFrom(
  plan: StudioOperatorResumePlan,
): AssistantOperatorResumeFrom | null {
  const completedSteps = plan.steps
    .filter(
      (step) => step.state === ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS.done,
    )
    .slice(0, ASSISTANT_OPERATOR_RESUME_LIMITS.maxSteps)
    .map((step) => ({
      id: step.id,
      label: step.label,
      ...(step.artifactIds?.length
        ? {
            artifactIds: [...step.artifactIds].slice(
              0,
              ASSISTANT_OPERATOR_RESUME_LIMITS.maxArtifactsPerStep,
            ),
          }
        : {}),
    }))
  if (completedSteps.length === 0) return null
  return { planId: plan.planId, completedSteps }
}

/**
 * 一份**新鲜的**计划记录（计划卡刚被批准时落）。
 *
 * ⚠ 每一步一开始都是 `pending`：⛔ 别把第一步预先标成 running —— 三态里根本没有
 * 那一档（见 `ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS` 头注）。
 * ⚠ 步数超上限时**只留前 `maxSteps` 条**，理由同 `toResumeFrom`。
 */
export function createResumePlan(input: {
  planId: string
  domain: StudioOperatorResumePlan['domain']
  sessionId: string | null
  labels: readonly string[]
  now: number
}): StudioOperatorResumePlan | null {
  const steps: StudioOperatorResumeStep[] = input.labels
    .slice(0, ASSISTANT_OPERATOR_RESUME_LIMITS.maxSteps)
    .map((label, index) => ({
      id: `${input.planId}:${index}`,
      label,
      state: ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS.pending,
    }))
  if (steps.length === 0) return null
  return {
    planId: input.planId,
    domain: input.domain,
    sessionId: input.sessionId,
    updatedAt: new Date(input.now).toISOString(),
    steps,
  }
}

/**
 * 把某一步改成另一态（`done` / `failed`），返回**新的一份**。
 *
 * ⚠ 不认识的 `stepId` 原样返回同一个引用：那样调用方的 `if (next === plan) return`
 * 就是一条免费的短路，⛔ 不需要在每个调用点再判一次「改到了没有」。
 * ⚠ `done` 时把 `reason` 抹掉：一步先失败后成功，旁边还挂着上次那句原因，读起来
 *   像是它又挂了一次。
 */
export function markResumeStep(
  plan: StudioOperatorResumePlan,
  stepId: string,
  patch: {
    state: StudioOperatorResumeStep['state']
    artifactIds?: readonly string[]
    reason?: string
  },
  now: number,
): StudioOperatorResumePlan {
  const index = plan.steps.findIndex((step) => step.id === stepId)
  if (index < 0) return plan
  const previous = plan.steps[index]
  const next: StudioOperatorResumeStep = {
    id: previous.id,
    label: previous.label,
    state: patch.state,
    ...(patch.artifactIds?.length
      ? {
          artifactIds: [...patch.artifactIds].slice(
            0,
            ASSISTANT_OPERATOR_RESUME_LIMITS.maxArtifactsPerStep,
          ),
        }
      : previous.artifactIds?.length
        ? { artifactIds: previous.artifactIds }
        : {}),
    ...(patch.state === ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS.failed &&
    patch.reason
      ? { reason: patch.reason }
      : {}),
  }
  return {
    ...plan,
    updatedAt: new Date(now).toISOString(),
    steps: plan.steps.map((step, i) => (i === index ? next : step)),
  }
}
