import { NODE_ASSISTANT_DURATION_AUTO } from '@/constants/node-assistant-ops'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getVideoModelParameterOptions } from '@/constants/video-model-send-plan'

export interface ResolveNodeVideoDurationInput {
  /**
   * `node.data.duration` 的原值。历史上这是个自由文本字段（早期是文本框），
   * 助手的 prompt 计划也会把 LLM 写的 `'12s'` 原样落进来，所以这里收 `unknown`
   * 而不是 `string`。
   */
  raw: unknown
  /**
   * **要提交的那个端点**的 id（按节点模式重算之后的），不是节点上存的型号 ——
   * 端点每次提交重算，可接受的时长档必须跟着它走。
   */
  modelId: string | undefined
  adapterType?: AI_ADAPTER_TYPES
}

/**
 * 把节点上存的时长翻译成能上线的值：秒数、`'auto'`，或 `undefined`（发不出去，
 * 由服务端默认值兜底）。
 *
 * ⚠ 可接受范围**只有一个事实源：模型自己**。这里曾在 `StudioNodeWorkbench` 里
 * 写死 `parsed < 4 || parsed > 15` —— 那是 Seedance 2.0 的档位。2.5 的档位到 30
 * 秒（`video-model-capabilities.ts`），于是用户在滑条上选的 20/25/30 存进了节点、
 * OSD 也照实显示，却在发送前被静默丢成 `undefined`，provider 拿自己的默认 5 秒
 * 出片：没有报错，没有 toast，只有一段比要求短得多的视频。
 *
 * 用 `getVideoModelParameterOptions` 而不是直接读能力表，是因为它已经把「这个
 * 模型吃不吃 duration」（发送契约）和「有哪些档」（能力表）合成了一问：不支持时
 * 返回空数组，于是这里自然发不出 duration —— 和 `VideoComposer` 整栏不渲染滑条
 * 是同一个判断，同一个来源。
 */
export function resolveNodeVideoDuration({
  raw,
  modelId,
  adapterType,
}: ResolveNodeVideoDurationInput): number | 'auto' | undefined {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (trimmed === NODE_ASSISTANT_DURATION_AUTO) {
    return NODE_ASSISTANT_DURATION_AUTO
  }

  // parseFloat 而不是 Number —— 与 VideoComposer 滑条同口径：助手写进来的值常带
  // 单位（`'12s'`），`Number('12s')` 是 NaN，于是滑条按 12 显示而发送端丢成默认
  // 值，又是一次「看到的和发出去的不一样」。
  const parsed = Number.parseFloat(trimmed)
  if (!Number.isFinite(parsed)) return undefined

  const { durations } = getVideoModelParameterOptions(modelId, adapterType)
  return durations.includes(parsed) ? parsed : undefined
}
