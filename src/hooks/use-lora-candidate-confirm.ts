'use client'

import { useCallback, useMemo } from 'react'

import {
  LORA_CANDIDATE_CONFIRM_STEPS,
  type LoraCandidateConfirmStep,
} from '@/constants/lora-candidate'
import { favoriteLoraAPI } from '@/lib/api-client/lora-assets'
import type { LoraAssetRecord } from '@/types'
import type { LoraCandidate } from '@/types/lora-candidate'

/**
 * 「一次确认」的三件事（任务包 §5「LoRA 一次确认链」）：
 *   ① 导入 —— 用候选**自带**的 `importPayload`（含来源快照）走既有导入链；
 *   ② 挂载 —— 进当前工作台的挂载栈；
 *   ③ 触发词 —— 落进提示词，走宿主既有的追加路径。
 *
 * ── 为什么是一个 hook 而不是写在卡里 ─────────────────────────────
 * 三步里只有第 ① 步是网络调用，而它必须在 hook 层（组件不碰 api-client）。把
 * 编排整个放上来，两个宿主（LoRA 装配台 / 图片·视频工作台）就共用同一条链，
 * 差异只剩「有没有挂载栈」一个参数。
 *
 * ── 两条必须一起看的判据 ─────────────────────────────────────────
 * ⚠ **不按 id 二次搜**：确认那一下只碰我们自己的库。再搜一次意味着用户看到的卡
 * 和实际导入的可能不是同一版（上游随时改），而这条链后面接着的是「自动下载进库」。
 * ⚠ **失败报到步**：三步各自有各自的下一步动作，笼统一句「失败」把路都堵死。
 * 已经成功的步骤在结果里如实标着 —— 挂载失败不代表没导进去。
 */

export interface LoraCandidateConfirmOutcome {
  status: 'ok' | 'failed'
  /** 失败停在哪一步。`status:'ok'` 时缺席。 */
  failedStep?: LoraCandidateConfirmStep
  /** 底层错误原文（有就给，卡面拿它做副标题；文案本身仍走 i18n）。 */
  error?: string
  imported: boolean
  mounted: boolean
  triggerWordsApplied: boolean
  /** 导入成功后的库记录 —— 卡面用它显示「已收进库」的名字。 */
  asset?: LoraAssetRecord
}

export interface LoraCandidateConfirmAdapter {
  /**
   * 这个宿主有没有挂载栈。
   *
   * ⚠ **`false` 不是「按钮禁用」而是「换一句话」**：`useActiveLoraStack` 的
   * Provider 只包 `/studio/lora`（见 `studio/lora/layout.tsx`），图片/视频工作台
   * 根本拿不到挂载栈。那里的确认做「导入 + 触发词」，并明说「已导入，去 LoRA
   * 工作台挂载」——⛔ 绝不留一个点了没反应的挂载按钮。
   */
  canMount: boolean
  confirm(input: {
    candidate: LoraCandidate
    /** `[[lora]]` 里模型给的建议权重；缺省用资产自己的默认值。 */
    suggestedWeight?: number
  }): Promise<LoraCandidateConfirmOutcome>
}

export interface UseLoraCandidateConfirmOptions {
  /**
   * 挂进挂载栈。**缺席 = 这个宿主结构性没有挂载栈**（不是「忘了传」）——
   * 与 `AssistantWriteback` 的缺席语义同构。
   */
  mount?: (asset: LoraAssetRecord, scale?: number) => void
  /**
   * 触发词落进提示词。
   *
   * ⚠ **必填，而且必须是宿主既有的那条追加路径**（LoRA 装配台 =
   * `persona.onAppendPrompt`，工作台 = 写回适配器的 `appendPrompt`）。
   * 三个宿主全都有这条路，所以这里不给「可选」——可选的下场是某个宿主漏传，
   * 编译全绿、测试全过、真机上点了确认提示词纹丝不动。
   */
  applyTriggerWords: (text: string) => void
}

function toErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : undefined
}

export function useLoraCandidateConfirm({
  mount,
  applyTriggerWords,
}: UseLoraCandidateConfirmOptions): LoraCandidateConfirmAdapter {
  const confirm = useCallback(
    async ({
      candidate,
      suggestedWeight,
    }: {
      candidate: LoraCandidate
      suggestedWeight?: number
    }): Promise<LoraCandidateConfirmOutcome> => {
      // 载荷缺席只有两种来历：候选本来就不可导入，或下发时掉到了最低档。
      // 两种都不该走到这里（卡上的确认按钮已经禁用），走到了就当导入失败报出去。
      if (!candidate.importPayload) {
        return {
          status: 'failed',
          failedStep: LORA_CANDIDATE_CONFIRM_STEPS.import,
          imported: false,
          mounted: false,
          triggerWordsApplied: false,
        }
      }

      const imported = await favoriteLoraAPI(candidate.importPayload)
      if (!imported.success || !imported.data) {
        return {
          status: 'failed',
          failedStep: LORA_CANDIDATE_CONFIRM_STEPS.import,
          ...(imported.error ? { error: imported.error } : {}),
          imported: false,
          mounted: false,
          triggerWordsApplied: false,
        }
      }
      const asset = imported.data

      if (mount) {
        try {
          // 权重：模型给了就用模型的，没给用资产默认值。⚠ 这两个数都不是随手
          // 填的——`defaultScale` 是导入时按来源写下的，模型的建议值已被
          // `AssistantLoraPickSchema` 收在 0.1–2 之间。
          mount(asset, suggestedWeight ?? asset.defaultScale)
        } catch (error) {
          const message = toErrorMessage(error)
          return {
            status: 'failed',
            failedStep: LORA_CANDIDATE_CONFIRM_STEPS.mount,
            ...(message ? { error: message } : {}),
            // ⚠ 导入已经成功了 —— 报「挂载失败」而不是把整件事说成失败，
            // 否则用户会以为要重新导入一遍（然后收到一条重复的库记录）。
            imported: true,
            mounted: false,
            triggerWordsApplied: false,
            asset,
          }
        }
      }

      // 触发词用**卡上显示的那一份**（`candidate.triggerWords`），不是库记录里
      // 的原始字符串：用户按卡上看到的词做的决定，写进去的就该是同一批词。
      const triggerText = candidate.triggerWords.join(', ').trim()
      if (triggerText) {
        try {
          applyTriggerWords(triggerText)
        } catch (error) {
          const message = toErrorMessage(error)
          return {
            status: 'failed',
            failedStep: LORA_CANDIDATE_CONFIRM_STEPS.triggerWords,
            ...(message ? { error: message } : {}),
            imported: true,
            mounted: Boolean(mount),
            triggerWordsApplied: false,
            asset,
          }
        }
      }

      return {
        status: 'ok',
        imported: true,
        mounted: Boolean(mount),
        // 没有触发词的 LoRA 是常态（很多风格 LoRA 不需要），那不是失败 ——
        // 这一位如实记「这次有没有往提示词里写东西」。
        triggerWordsApplied: Boolean(triggerText),
        asset,
      }
    },
    [applyTriggerWords, mount],
  )

  return useMemo(
    () => ({ canMount: Boolean(mount), confirm }),
    [confirm, mount],
  )
}
