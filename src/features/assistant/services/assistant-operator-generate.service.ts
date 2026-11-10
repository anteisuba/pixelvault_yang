import 'server-only'

import type { AssistantOperatorGenerationRequest } from '@/types/assistant-operator'
import {
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
} from '@/constants/assistant-operator'
import {
  type OperatorRun,
  clamp,
  type ToolPlan,
  reject,
} from '@/features/assistant/services/assistant-operator-run.service'

/**
 * 助手执行器里的 **请求发送**（`request_generation`）：只交出一份确认卡载荷，扣扳机的永远是用户。
 * 11-10 从 `assistant-operator.service.ts` 原样搬出（M4），行为不变。
 * ⚠ 执行器的文件都叫 `assistant-operator-*.service.ts`：钱闸测试按这个前缀收源码。
 */

/** 这一枪的张数 —— 没有张数控件的域（视频 / 装配台）恒 1。 */
function currentGenerationCount(run: OperatorRun): number {
  if (!run.state.hasCountControl) return 1
  return run.state.count && run.state.count > 0 ? run.state.count : 1
}

/**
 * 生成确认卡上那几行 = `request_generation` 的载荷（**一份形状两处用**）。
 *
 * ⚠ **没有预估 credits**（决策 8）：面板上不再有花费读数 —— 本仓从来算不出准确
 * 的扣费口径（`AI_MODELS[].cost` 是每次请求的基数），一个错的数比没有数更糟。
 *
 * ⚠ 全部取自**快照**，一个字段都不让模型写（工具入参是空对象）：卡上写 4 张而
 * 表单里是 1 张，是花钱档最不能出的那种错。
 */
function buildGenerationRequestPayload(
  run: OperatorRun,
  modelId: string,
  runLabel?: string,
): AssistantOperatorGenerationRequest {
  const count = currentGenerationCount(run)
  const label = run.state.modelLabel ?? modelId
  return {
    model: { id: modelId, label },
    count,
    /** ⚠ 三格永远带齐（没有的那格是 `null`）—— 论据同 `set_video_specs`。 */
    specs: {
      aspectRatio: run.state.hasVideoSpecsControl
        ? run.state.videoAspectRatio
        : run.state.aspectRatio,
      resolution: run.state.hasVideoSpecsControl
        ? run.state.videoResolution
        : run.state.resolution,
      durationSeconds: run.state.videoDurationSeconds,
      ...(run.state.hasSpecsControl
        ? {
            quality: run.state.quality,
            background: run.state.background,
            complexity: run.state.complexity,
            preview: run.state.preview,
          }
        : {}),
    },
    /** ⚠ 只透传（切片 X）：服务端不写库，见 `planPrimeGenerate` 的头注。 */
    ...(runLabel?.trim()
      ? { label: clamp(runLabel.trim(), LIMITS.maxGenerationLabelChars) }
      : {}),
  }
}

/**
 * 请求发送（v2 §3.3 生成确认，§5）。
 *
 * ── 三件事按顺序发生 ───────────────────────────────────────────────
 *  ① 前置闸与 `prime_generate` **逐字相同**（没选模型 / 提示词还空着就拒）——
 *     两条工具备的是同一颗按钮，闸不一样才是怪事。
 *  ② 载荷全部从快照现取（`buildGenerationRequestPayload`）。
 *  ③ **一律出确认卡**：`request_generation` 就是确认卡的第二种来源（§3.3），
 *     ⛔ 没有「本会话此类不再问」那条免检通道了（决策 8 把花费确认整条删掉，
 *     连带那张条子）。流停在卡上，扳机由客户端扣（§5）。
 *
 * ⛔ **这个函数一分钱都花不掉**：它不建 generation、不扣 credit、不调 provider ——
 * 它只是把一份载荷交出去。扣扳机那一跳在客户端（`studio-operator-apply.ts`）。
 */
export function planRequestGeneration(
  run: OperatorRun,
  args: { label?: string },
): ToolPlan {
  if (run.state.hasModelControl && !run.state.modelId) {
    return reject(REJECT.noModelSelected)
  }
  if (!run.state.prompt.trim()) return reject(REJECT.emptyPrompt)
  /**
   * ⚠ 没有模型 id 就没有账可算，也没有卡可画。这条在图片 / 视频两个域里不会发生
   * （两台工作台都有模型控件），写出来是因为载荷 schema 的 `model.id` 是必填 ——
   * 让它在这里以一条**可教的拒绝**结束，比让 `toStepEvent` 在出流那一刻抛好。
   */
  const modelId = run.state.modelId
  if (!modelId) return reject(REJECT.noModelSelected)

  return {
    kind: 'confirmGenerate',
    request: buildGenerationRequestPayload(run, modelId, args.label),
  }
}
